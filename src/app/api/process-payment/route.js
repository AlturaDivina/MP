import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { logInfo, logError, logWarn } from '../../../utils/logger';
import { logSecurityEvent } from '../../../lib/security-logger';
import { sanitizeInput } from '../../../utils/security';
import { generateReceiptPDF } from '../../../lib/pdfService';
import { sendReceiptEmail } from '../../../lib/emailService';
import { v4 as uuidv4 } from 'uuid';
import { getProductById, verifyStockForOrder, updateStockAfterOrder } from '../../../lib/productService';
import { validatePaymentRequestBody, extractPaymentInstrumentData, normalizeDisplayMode } from '../../../lib/validation';
import { paymentCircuitBreaker } from '../../../lib/circuit-breaker-pro.js';
import { performanceMonitor } from '../../../lib/performance-monitor-pro.js';
import { paymentQueue } from '../../../lib/queue-manager-pro.js';
import { SupabaseSecurity } from '../../../lib/supabase-security';

// Inicializar el cliente de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Agregar esta verificación después de inicializar el cliente de Supabase
if (!supabaseUrl || !supabaseKey) {
  logError('Variables de entorno de Supabase no encontradas:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey
  });
}

// Crear cliente con la sintaxis de la nueva versión
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

// Verificar importaciones críticas
logInfo('🔧 Verificando importaciones críticas:', {
  hasGenerateReceiptPDF: typeof generateReceiptPDF === 'function',
  hasSendReceiptEmail: typeof sendReceiptEmail === 'function',
  hasUpdateStockAfterOrder: typeof updateStockAfterOrder === 'function',
  hasVerifyStockForOrder: typeof verifyStockForOrder === 'function'
});

// NUEVO: Test directo del logger
console.log('🧪 CONSOLE TEST: Logger test al iniciar el archivo');
logInfo('🧪 LOGGER TEST: Logger test al iniciar el archivo');
console.log('🧪 CONSOLE TEST: Nivel de log actual:', process.env.NEXT_PUBLIC_LOG_LEVEL);

async function processMercadoPagoPayment({
  transaction_amount,
  token,
  payment_method_id,
  issuer_id,
  installments,
  payerEmail,
  payerData,
  orderItems,
  isMultipleOrder,
  idempotencyKey,
  displayMode, // <-- NUEVO
}) {
  const mode = normalizeDisplayMode(displayMode);
  const isFF = mode === 'family';

  // 1. Validar y obtener productos desde la BD
  const preferenceItems = await Promise.all(orderItems.map(async (item) => {
    const dbProduct = await getProductById(item.id);
    if (!dbProduct) {
      throw new Error(`Producto ${item.id} no encontrado`);
    }
    
    return {
      id: dbProduct.id,
      title: dbProduct.name,
      description: dbProduct.description || '',
      picture_url: dbProduct.image_url,
      category_id: dbProduct.category || 'fashion',
      quantity: parseInt(item.quantity),
      unit_price: parseFloat(dbProduct.price), // ✅ Usar SIEMPRE precio de BD
      currency_id: "MXN"
    };
  }));

  // Create payment items format for additional_info
  const paymentItems = preferenceItems.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description || '',
    quantity: item.quantity,
    unit_price: item.unit_price
  }));
  
  // NUEVO: Validar fecha de nacimiento en backend
  if (!isFF) {
    if (!payerData.birth_date) {
      logError('❌ Fecha de nacimiento no proporcionada:', { email: payerEmail });
      throw new Error('Debe proporcionar su fecha de nacimiento');
    }
    let calculatedAge;
    try {
      const birthDate = new Date(payerData.birth_date);
      const today = new Date();
      if (isNaN(birthDate.getTime())) throw new Error('Fecha de nacimiento inválida');
      if (birthDate > today) throw new Error('Fecha de nacimiento no puede ser en el futuro');
      calculatedAge = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      if (calculatedAge > 120) throw new Error('Fecha de nacimiento no es realista');
    } catch (error) {
      logError('❌ Error procesando fecha de nacimiento:', { birth_date: payerData.birth_date, error: error.message, email: payerEmail });
      throw new Error('Error al validar la fecha de nacimiento. Verifique el formato.');
    }
    if (calculatedAge < 18) {
      logError('❌ Intento de compra por menor de edad:', { birth_date: payerData.birth_date, calculated_age: calculatedAge, email: payerEmail });
      throw new Error('Debes ser mayor de 18 años para realizar esta compra');
    }
    if (!payerData.isOver18 || !payerData.acceptsAlcoholTerms || !payerData.acceptsShippingFee) {
      logError('❌ Términos no aceptados:', {
        isOver18: payerData.isOver18,
        acceptsAlcoholTerms: payerData.acceptsAlcoholTerms,
        acceptsShippingFee: payerData.acceptsShippingFee,
      });
      throw new Error('Debes aceptar todos los términos y condiciones');
    }
  } else {
  // family: forzar flags seguros
    payerData.isOver18 = true;
    payerData.acceptsAlcoholTerms = true;
    payerData.acceptsShippingFee = true;
  }

  // 2. SIEMPRE calcula el total en el backend
  const SHIPPING_FEE = isFF ? 0 : 200; // En FF no se cobra envío
  const calculatedAmount = preferenceItems.reduce((total, item) => 
    total + (item.unit_price * item.quantity), 0);

  // 3. CRÍTICO: SIEMPRE sumar el fee al total calculado
  let finalAmount = calculatedAmount + SHIPPING_FEE;
  
  // 4. VERIFICAR que el frontend envió el monto correcto (con fee incluido)
  const expectedTotal = calculatedAmount + SHIPPING_FEE;
  if (Math.abs(parseFloat(transaction_amount) - expectedTotal) > 0.01) {
    logError('❌ Discrepancia en montos:', {
      frontend_amount: transaction_amount,
      expected_amount: expectedTotal,
      calculated_products: calculatedAmount,
      shipping_fee: SHIPPING_FEE
    });
    
    // Usar siempre el monto calculado en backend
    finalAmount = expectedTotal;
  }

  // Format phone for BOTH preference and payment
  let phoneFormatted;
  if (payerData?.phone) {
    phoneFormatted = typeof payerData.phone === 'string' ? 
      {
        area_code: payerData.phone.startsWith('+') ? payerData.phone.substring(1, 3) : '52',
        number: payerData.phone.startsWith('+') ? payerData.phone.substring(3) : payerData.phone
      } : 
      payerData.phone;
  }
  
  // Crear el cliente de preferencias
  const preferenceClient = new Preference(client);
  
  // Crear preferencia con el cliente usando preferenceItems
  const preferenceResponse = await preferenceClient.create({
    body: {
      items: preferenceItems,  // Versión con currency_id
      payer: {
        email: payerEmail,
        name: payerData?.first_name || '',
        surname: payerData?.last_name || '',
        identification: payerData?.identification || {},
        phone: phoneFormatted,  // Ahora está correctamente definida
        address: payerData?.address ? {
          street_name: payerData.address.street_name || '',
          street_number: payerData.address.street_number ? String(payerData.address.street_number) : '',
          zip_code: payerData.address.zip_code || ''
        } : {}
      },
      shipments: payerData?.address
        ? {
            mode: "custom",
            cost: SHIPPING_FEE,
            receiver_address: {
              street_name: payerData.address.street_name || '',
              street_number: payerData.address.street_number ? String(payerData.address.street_number) : '',
              zip_code: payerData.address.zip_code || '',
              city_name: payerData.address.city_name || '',
              state_name: payerData.address.state_name || '',
              country_name: payerData.address.country_name || 'México'
            }
          }
        : undefined,
      back_urls: {
        success: payerData?.successUrl || "https://alturadivina.com/confirmacion-de-compra",
        failure: payerData?.failureUrl || "https://alturadivina.com/error-de-compra",
        pending: payerData?.pendingUrl || "https://alturadivina.com/proceso-de-compra"
      },
      auto_return: "approved",
      external_reference: idempotencyKey,
      metadata: {
        isMultipleOrder: isMultipleOrder
      }
    },
    requestOptions: {
      idempotencyKey: idempotencyKey  // Add idempotency key to the request
    }
  });

  // Log preference response for debugging
  logInfo(`Preference created successfully with ID: ${preferenceResponse.id}`);

  // Crear el cliente de pagos
  const paymentClient = new Payment(client);
  
  // ✅ CRÍTICO: Asegurar que external_reference se establece correctamente EN LA RAÍZ
  const paymentResponse = await paymentClient.create({
    body: {
      token: token,
      description: isMultipleOrder 
        ? `Pedido de ${orderItems.length} productos` 
        : `${orderItems[0].name || 'Producto'}`,
      transaction_amount: finalAmount,
      installments: parseInt(installments),
      payment_method_id: payment_method_id,
      issuer_id: issuer_id,
      external_reference: idempotencyKey, // ✅ ESTO ES CRÍTICO para el webhook - EN LA RAÍZ
      payer: {
        email: payerEmail,
        identification: payerData?.identification || {}
      },
      additional_info: {
        items: paymentItems,
        // ❌ NO poner external_reference aquí - eso causa el error 400
        payer: {
          first_name: payerData?.first_name,
          last_name: payerData?.last_name,
          phone: phoneFormatted
        }
        // external_reference: idempotencyKey // ❌ NO aquí - causaba el error
      }
    }
  });

  // Return all the data the frontend might need
  return {
    id: paymentResponse.id,
    status: paymentResponse.status,
    status_detail: paymentResponse.status_detail,
    external_reference: idempotencyKey, // ✅ Devolver para verificación
    // ...other fields...
  };
}

function getSecureRejectionMessage(statusDetail) {
  // ✅ SEGURIDAD: Log interno para monitoreo, mensaje genérico para usuario
  logSecurityEvent('payment_rejection', {
    status_detail: statusDetail,
    timestamp: new Date().toISOString(),
    // NO incluir datos sensibles como números de tarjeta
  }, 'warn');
  
  // Categorizar tipos de rechazo para análisis interno
  const rejectionCategory = categorizeRejection(statusDetail);
  
  logInfo(`Pago rechazado - Categoría: ${rejectionCategory}`, {
    status_detail: statusDetail,
    category: rejectionCategory
  });
  
  // Siempre devolver mensaje genérico al usuario
  return 'El pago fue rechazado. Por favor verifica tus datos o intenta con otro método de pago.';
}

function categorizeRejection(statusDetail) {
  if (statusDetail?.startsWith('cc_rejected_insufficient')) return 'funds';
  if (statusDetail?.startsWith('cc_rejected_bad_filled')) return 'card_data';
  if (statusDetail?.startsWith('cc_rejected_high_risk')) return 'security';
  if (statusDetail?.startsWith('cc_rejected_blacklist')) return 'blocked';
  return 'other';
}

// ✅ MODIFICACIÓN 1: Reducir acciones inmediatas en process-payment
export async function POST(req) {
  const startTime = performanceMonitor.startRequest(); // ✅ NUEVO
  const idempotencyKey = req.headers.get('X-Idempotency-Key') || uuidv4();

  try {
    // Add additional security headers check
    const requestId = req.headers.get('X-Request-ID') || 'no-id';
    const clientFingerprint = req.headers.get('X-Client-Fingerprint') || 'no-fingerprint';

    // Log security-relevant information with the idempotency key
    logInfo(`Payment request initiated: ${idempotencyKey}`, {
      requestId,
      fingerprint: clientFingerprint.substring(0, 10) + '...' // Log only partial fingerprint for privacy
    });

    // Your existing origin validation
    const origin = req.headers.get('Origin');
    const referer = req.headers.get('Referer');

    // Add requestId to trusted checks log
    logInfo(`Request security check: origin=${origin || 'none'}, referer=${referer || 'none'}, requestId=${requestId}`, { idempotencyKey });

    logInfo(`Process-payment request received. IdempotencyKey: ${idempotencyKey}`);

    // --- CSRF guard (no nested try needed) ---
    const csrfToken = req.headers.get('X-CSRF-Token');
    const expectedToken = req.cookies.get('csrf_token')?.value;
    const isFramerOrProduction =
      req.headers.get('referer')?.includes('framer.com') ||
      process.env.NODE_ENV === 'production';

    if (!isFramerOrProduction && expectedToken && csrfToken !== expectedToken) {
      logSecurityEvent(
        'csrf_validation_failed',
        { got: csrfToken, expected: expectedToken?.substring(0, 5) + '...' },
        'warn'
      );
      return NextResponse.json({ error: 'Validación de seguridad fallida' }, { status: 403 });
    }

    logInfo(`CSRF validation ${isFramerOrProduction ? 'bypassed' : 'passed'} for ${idempotencyKey}`, {
      isFramer: req.headers.get('referer')?.includes('framer.com'),
      isProduction: process.env.NODE_ENV === 'production'
    });

    // --- Parse and validate body ---
    const body = await req.json();
    logInfo('Request body en /api/process-payment:', { body, idempotencyKey });

    const { data: validatedData, error: validationError } = validatePaymentRequestBody(body);
    if (validationError) {
      logError('Error de validación en process-payment:', { error: validationError, idempotencyKey });
      return NextResponse.json({ error: validationError, idempotencyKey }, { status: 400 });
    }

    const {
      formData,
      isMultipleOrder,
      orderSummary,
      productId: singleProductId,
      quantity: singleProductQuantity,
      userData,
      totalAmount: totalAmountFromBody,
      displayMode: displayModeFromBody,
    } = validatedData;

    const displayMode = normalizeDisplayMode(displayModeFromBody);

    // Amount will be adjusted safely later
    let totalAmount = totalAmountFromBody;

    const {
      token,
      paymentMethodId,
      issuerId,
      installments,
      payerEmail,
      error: paymentInstrumentError
    } = extractPaymentInstrumentData(formData);

    if (paymentInstrumentError) {
      logError('Error extrayendo datos del instrumento de pago:', { error: paymentInstrumentError, idempotencyKey });
      return NextResponse.json({ error: `Datos de pago incompletos: ${paymentInstrumentError}`, idempotencyKey }, { status: 400 });
    }

    let itemsForPayment = [];
    let secureTotal = 0;

    if (isMultipleOrder) {
      // Construir array con datos seguros (solo IDs y cantidades del frontend)
      const secureOrderItems = await Promise.all(
        orderSummary.map(async (item) => {
          const dbProduct = await getProductById(item.productId);
          if (!dbProduct) {
            throw new Error(`Producto no encontrado: ${item.productId}`);
          }

          if (dbProduct.stock_available < item.quantity) {
            const errorMessage = `Stock insuficiente para ${dbProduct.name}. `;
            logError(errorMessage);
            throw new Error(errorMessage);
          }

          secureTotal += parseFloat(dbProduct.price) * parseInt(item.quantity);

          return {
            ...dbProduct,
            productId: item.productId,
            quantity: parseInt(item.quantity)
          };
        })
      );

      itemsForPayment = secureOrderItems;

    // ✅ CORRECCIÓN: Agregar el fee de envío al total calculado
  const SHIPPING_FEE = displayMode === 'family' ? 0 : 200;
      const totalWithShipping = secureTotal + SHIPPING_FEE;

      // ✅ Comparar con el total enviado para detectar manipulación
      if (Math.abs(totalWithShipping - parseFloat(totalAmount)) > 0.01) {
        logSecurityEvent(
          'total_price_mismatch',
          {
            frontend_total: totalAmount,
            calculated_total: secureTotal,
            calculated_with_shipping: totalWithShipping,
            shipping_fee: SHIPPING_FEE,
            idempotencyKey
          }
        );
        totalAmount = totalWithShipping; // usar cálculo del servidor
      }
    } else {
      // Procesar pedidos simples de manera similar (si aplica)
    }

    // ✅ 1. Verificar stock ANTES de hablar con MP
    try {
      if (orderSummary && orderSummary.length > 0) {
        await verifyStockForOrder(orderSummary);
      }
    } catch (err) {
      logInfo('stock_insufficient', { message: err.message, idempotencyKey });
      return NextResponse.json(
        { code: 'stock_insufficient', message: err.message, idempotencyKey },
        { status: 409 }
      );
    }

    // --- Procesar pago en MP (valida internamente según displayMode) ---
    const paymentResponse = await processMercadoPagoPayment({
      transaction_amount: totalAmount,
      token,
      payment_method_id: paymentMethodId,
      issuer_id: issuerId,
      installments,
      payerEmail: userData?.email || payerEmail,
      payerData: userData,
      orderItems: itemsForPayment,
      isMultipleOrder,
      idempotencyKey,
      displayMode, // <-- importante
    });

    console.log(`🔍 CONSOLE DEBUG [${idempotencyKey}] Payment response:`, {
      status: paymentResponse.status,
      id: paymentResponse.id,
      status_detail: paymentResponse.status_detail
    });

    logInfo(`🔍 [${idempotencyKey}] Payment response recibido:`, {
      status: paymentResponse.status,
      id: paymentResponse.id,
      status_detail: paymentResponse.status_detail
    });

    // ✅ 2. Si MP aprobó, actualizar stock
    if (paymentResponse.status === 'approved') {
      try {
        await updateStockAfterOrder(itemsForPayment || orderSummary);
        logInfo(`✅ [${idempotencyKey}] Stock actualizado correctamente`);
      } catch (stockError) {
        logError(`❌ [${idempotencyKey}] Error actualizando stock:`, stockError);
      }
    }

    // Diagnóstico pre-email
    logInfo(`🔍 [${idempotencyKey}] Diagnóstico pre-email:`, {
      hasPaymentId: !!paymentResponse.id,
      paymentStatus: paymentResponse.status,
      condition1: !!paymentResponse.id,
      condition2: paymentResponse.status === 'approved',
      condition3: paymentResponse.status === 'in_process',
      overallCondition:
        paymentResponse.id &&
        (paymentResponse.status === 'approved' || paymentResponse.status === 'in_process')
    });

    console.log(`🔍 CONSOLE DEBUG [${idempotencyKey}] Diagnóstico pre-email:`, {
      hasPaymentId: !!paymentResponse.id,
      paymentStatus: paymentResponse.status,
      overallCondition:
        paymentResponse.id &&
        (paymentResponse.status === 'approved' || paymentResponse.status === 'in_process')
    });

    if (paymentResponse.id && (paymentResponse.status === 'approved' || paymentResponse.status === 'in_process')) {
      console.log(`🟢 CONSOLE DEBUG [${idempotencyKey}] ENTRANDO al bloque principal`);
      logInfo(`🟢 [${idempotencyKey}] ENTRANDO al bloque principal de payment request`);

    // Preparar datos para registro en BD
  const SHIPPING_FEE = displayMode === 'family' ? 0 : 200;
      const subtotalProducts = itemsForPayment.reduce(
        (total, item) => total + parseFloat(item.price) * parseInt(item.quantity),
        0
      );
      const totalWithShipping = subtotalProducts + SHIPPING_FEE;

    const customer_data =
      displayMode === 'family'
      ? {
              display_mode: 'family',
              first_name: userData?.first_name || '',
              last_name: userData?.last_name || '',
              email: userData?.email || '',
              phone: userData?.phone || ''
            }
          : {
              age: userData.calculatedAge?.toString() || '0',
              email: userData.email,
              phone: userData.phone,
              address: {
                city: userData.address?.city || '',
                state: userData.address?.state || '',
                country: userData.address?.country || 'Mexico',
                zip_code: userData.address?.zip_code || '',
                street_name: userData.address?.street_name || '',
                street_number: userData.address?.street_number || ''
              },
              isOver18: userData.isOver18 === true,
              last_name: userData.last_name || '',
              first_name: userData.first_name || '',
              identification: {
                type: userData.identification?.type || 'DNI',
                number: userData.identification?.number || ''
              },
              acceptsShippingFee: userData.acceptsShippingFee === true,
              acceptsAlcoholTerms: userData.acceptsAlcoholTerms === true
            };

      const paymentRequestData = {
        id: idempotencyKey,
        payment_id: paymentResponse.id?.toString(),
        customer_data,
        order_items: itemsForPayment.map((item) => ({
          product_id: item.product_id || item.productId,
          name: item.name,
          quantity: parseInt(item.quantity),
          price: parseFloat(item.price),
          total: parseFloat(item.price) * parseInt(item.quantity)
        })),
        total_amount: totalWithShipping,
        payment_status: paymentResponse.status,
        payment_detail: paymentResponse.status_detail || null,
        customer_age: parseInt(userData.calculatedAge) || 0,
  shipping_fee: SHIPPING_FEE,
        display_mode: displayMode
      };

      logInfo(`💾 [${idempotencyKey}] Preparando inserción en BD:`, {
        paymentId: paymentRequestData.payment_id,
        totalAmount: paymentRequestData.total_amount,
        customerEmail: paymentRequestData.customer_data?.email,
        itemsCount: paymentRequestData.order_items?.length,
        shippingFee: paymentRequestData.shipping_fee,
        customerAge: paymentRequestData.customer_age
      });

      // Insert en BD (con manejo de error local)
      logInfo(`🔄 [${idempotencyKey}] Insertando payment request en Supabase...`);
      try {
        const { data: insertedPaymentRequest, error: insertError } =
          await SupabaseSecurity.insertPaymentRequest(paymentRequestData);

        if (insertError) {
          logError(`❌ [${idempotencyKey}] Error detallado insertando payment request:`, {
            error: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint,
            supabaseError: insertError,
            dataToInsert: {
              id: paymentRequestData.id,
              payment_id: paymentRequestData.payment_id,
              customer_email: paymentRequestData.customer_data?.email,
              total_amount: paymentRequestData.total_amount,
              customer_data_keys: Object.keys(paymentRequestData.customer_data || {}),
              order_items_count: paymentRequestData.order_items?.length
            }
          });
          logWarn(`⚠️ [${idempotencyKey}] Continuando con emails a pesar del error de BD`);
        } else {
          logInfo(`✅ [${idempotencyKey}] Payment request insertado exitosamente en BD:`, {
            id: insertedPaymentRequest.id,
            payment_id: insertedPaymentRequest.payment_id,
            total_amount: insertedPaymentRequest.total_amount,
            payment_status: insertedPaymentRequest.payment_status,
            customer_email: insertedPaymentRequest.customer_data?.email,
            created_at: insertedPaymentRequest.created_at,
            shipping_fee: insertedPaymentRequest.shipping_fee
          });
        }
      } catch (dbError) {
        logError(`❌ [${idempotencyKey}] Error general en creación de payment request:`, {
          error: dbError.message,
          stack: dbError.stack,
          paymentId: paymentResponse.id,
          type: dbError.constructor.name
        });
        logWarn(`⚠️ [${idempotencyKey}] Continuando con emails a pesar del error de BD`);
      }

      logInfo(`✅ Payment request creado: ${idempotencyKey}`);

      // Enviar emails y PDF
      logInfo(`🔵 [${idempotencyKey}] CHECKPOINT: Llegué al bloque de emails`);
      logInfo(`🔵 [${idempotencyKey}] Payment status: ${paymentResponse.status}`);
      logInfo(`🔵 [${idempotencyKey}] Payment ID exists: ${!!paymentResponse.id}`);

      try {
        console.log(`📧 CONSOLE DEBUG [${idempotencyKey}] Iniciando emails...`);
        logInfo(`📧 [${idempotencyKey}] Iniciando proceso de envío de emails para payment request`);

        logInfo(`🔧 [${idempotencyKey}] Verificando dependencias de email:`, {
          hasGenerateReceiptPDF: typeof generateReceiptPDF === 'function',
          hasSendReceiptEmail: typeof sendReceiptEmail === 'function',
          userData: !!userData,
          userDataEmail: userData?.email,
          itemsForPayment: itemsForPayment?.length || 0
        });

  const SHIPPING_FEE_EMAIL = displayMode === 'family' ? 0 : 200;
        const subtotalProductsEmail = itemsForPayment.reduce(
          (total, item) => total + parseFloat(item.price) * parseInt(item.quantity),
          0
        );

  const orderDataForEmail = {
          userData,
          items: itemsForPayment.map((item) => ({
            name: item.name || `Producto #${item.product_id}`,
            quantity: item.quantity,
            price: item.price,
            product_id: item.product_id
          })),
          subtotal_amount: subtotalProductsEmail,
          shipping_fee: SHIPPING_FEE_EMAIL,
          total_amount: subtotalProductsEmail + SHIPPING_FEE_EMAIL,
          payment_id: paymentResponse.id,
          payment_status: paymentResponse.status,
          displayMode,
          metadata: { displayMode }
        };

        logInfo(`📋 Datos preparados para email:`, {
          customerEmail: userData.email,
          orderId: idempotencyKey,
          isApproved: paymentResponse.status === 'approved',
          itemsCount: orderDataForEmail.items.length,
          subtotal: subtotalProductsEmail,
          shipping: SHIPPING_FEE_EMAIL,
          total: orderDataForEmail.total_amount
        });

        logInfo(`📄 [${idempotencyKey}] INICIANDO generación de PDF...`);
        logInfo(`📄 [${idempotencyKey}] Datos para PDF:`, {
          orderId: idempotencyKey,
          hasCustomerData: !!userData,
          itemsCount: orderDataForEmail.items?.length || 0,
          subtotalAmount: subtotalProductsEmail,
          shippingFee: SHIPPING_FEE_EMAIL,
          totalAmount: orderDataForEmail.total_amount
        });

        try {
          const pdfBuffer = await paymentQueue.add(async () => {
            return await generateReceiptPDF({
              orderId: idempotencyKey,
              customerData: userData,
              items: orderDataForEmail.items,
              subtotalAmount: subtotalProductsEmail,
              shippingFee: SHIPPING_FEE_EMAIL,
              totalAmount: orderDataForEmail.total_amount,
              paymentStatus: paymentResponse.status,
              paymentId: paymentResponse.id,
              displayMode
            });
          }, 1);

          await paymentQueue.add(async () => {
            return await sendReceiptEmail({
              pdfBuffer,
              customerEmail: userData.email,
              orderId: idempotencyKey,
              isApproved: paymentResponse.status === 'approved',
              orderData: orderDataForEmail
            });
          }, 1);
        } catch (emailOpErr) {
          console.error(`❌ CONSOLE DEBUG [${idempotencyKey}] Error en emails:`, emailOpErr.message);
          logError(`❌ Error en proceso de emails para payment request ${idempotencyKey}:`, {
            error: emailOpErr.message,
            stack: emailOpErr.stack
          });
        }
      } catch (emailError) {
        console.error(`❌ CONSOLE DEBUG [${idempotencyKey}] Error en emails:`, emailError.message);
        logError(`❌ Error en proceso de emails para payment request ${idempotencyKey}:`, {
          error: emailError.message,
          stack: emailError.stack
        });
      }

      const userMessage =
        paymentResponse.status === 'approved'
          ? 'Pago procesado correctamente.'
          : `El estado del pago es: ${paymentResponse.status}. Detalle: ${paymentResponse.status_detail || 'N/A'}.`;

      return NextResponse.json(
        {
          status: paymentResponse.status,
          status_detail: paymentResponse.status_detail,
          id: paymentResponse.id,
          message: userMessage,
          idempotencyKey
        },
        { status: 200 }
      );
    } else {
      // No aprobado o en proceso: responder acorde
      logSecurityEvent(
        'payment_non_approved',
        {
          id: paymentResponse.id,
          status: paymentResponse.status,
          status_detail: paymentResponse.status_detail,
          amount: totalAmount,
          idempotencyKey,
          mp_response: paymentResponse
        },
        'warn'
      );

      const userMessage =
        paymentResponse.status === 'rejected'
          ? getSecureRejectionMessage(paymentResponse.status_detail)
          : `El estado del pago es: ${paymentResponse.status}. Detalle: ${paymentResponse.status_detail || 'N/A'}.`;

      return NextResponse.json(
        {
          status: paymentResponse.status,
          id: paymentResponse.id,
          error: userMessage,
          paymentDetails: paymentResponse.status_detail,
          message: userMessage,
          idempotencyKey
        },
        { status: paymentResponse.status === 'rejected' ? 400 : 200 }
      );
    }
  } catch (error) {
    logError('Error general en POST /api/process-payment:', {
      message: error.message,
      stack: error.stack,
      idempotencyKey,
      isCsrfError: error.isCsrfError,
      errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });

    // Manejos específicos
    if (error.message && error.message.includes('Debes ser mayor de 18 años')) {
      return NextResponse.json(
        { error: error.message, code: 'UNDERAGE_USER', idempotencyKey },
        { status: 400 }
      );
    }
    if (error.message && error.message.includes('Debe proporcionar su fecha de nacimiento')) {
      return NextResponse.json(
        { error: error.message, code: 'MISSING_BIRTHDATE', idempotencyKey },
        { status: 400 }
      );
    }
    if (error.message && error.message.includes('Error al validar la fecha de nacimiento')) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_BIRTHDATE', idempotencyKey },
        { status: 400 }
      );
    }
    if (error.message && error.message.includes('Debes aceptar todos los términos')) {
      return NextResponse.json(
        { error: error.message, code: 'TERMS_NOT_ACCEPTED', idempotencyKey },
        { status: 400 }
      );
    }
    if (error.isCsrfError) {
      return NextResponse.json({ error: error.message, idempotencyKey }, { status: 403 });
    }
    if (error.message && error.message.startsWith('Stock insuficiente')) {
      return NextResponse.json(
        { error: error.message, code: 'INSUFFICIENT_STOCK', idempotencyKey },
        { status: 400 }
      );
    }
    if (error.message && error.message.startsWith('Error de MercadoPago:')) {
      return NextResponse.json(
        {
          error: `Error con el proveedor de pagos: ${error.message.replace('Error de MercadoPago: ', '')}`,
          idempotencyKey,
          code: 'MERCADOPAGO_ERROR',
          details: error.cause || error.data
        },
        { status: 502 }
      );
    }
    if (
      error.message &&
      (error.message.includes('card payment requires a higher amount') ||
        error.message.includes('minimum amount required'))
    ) {
      return NextResponse.json(
        {
          error: `El monto mínimo para pagos con tarjeta es de 100 MXN. Por favor aumente el monto de su compra.`,
          idempotencyKey,
          details: error.cause || error.data,
          code: 'AMOUNT_TOO_LOW'
        },
        { status: 400 }
      );
    }

    // Fallback
    return NextResponse.json(
      {
        error: 'Error interno del servidor al procesar el pago. Intente más tarde.',
        idempotencyKey,
        code: 'INTERNAL_ERROR',
        debugInfo: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}