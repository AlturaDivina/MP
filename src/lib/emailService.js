import nodemailer from 'nodemailer';
import { logInfo, logError, logWarn } from '../utils/logger';

// Crear el transporter de nodemailer con mejor manejo de errores
let transport;
try {
  const emailConfig = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    // Mostrar más logs de debug
    logger: true,
    debug: true
  };
  
  // Verificar configuración
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    throw new Error('Credenciales de email no configuradas en variables de entorno');
  }
  
  // CORREGIR AQUÍ: Nombre correcto de la función (createTransport, no createTransporter)
  transport = nodemailer.createTransport(emailConfig);
  logInfo('📧 Transporter de correo inicializado correctamente', {
    host: emailConfig.host,
    user: emailConfig.auth.user,
  });
} catch (error) {
  logError('❌ Error al crear transporter de email:', error);
  // Crear un transporter nulo que registre mensajes pero no envíe realmente
  transport = {
    sendMail: async (options) => {
      logError('❓ Intento de enviar email con transporter fallido:', options);
      return { messageId: 'error', success: false };
    },
    verify: async () => {
      logError('❓ Intento de verificar transporter fallido');
      return false;
    }
  };
}

/**
 * Envía un correo con el recibo de compra
 * @param {Object} options - Opciones de envío
 * @param {Buffer} options.pdfBuffer - Buffer del PDF a adjuntar
 * @param {String} options.customerEmail - Email del cliente
 * @param {String} options.orderId - ID de la orden
 * @param {Boolean} options.isApproved - Si el pago está aprobado
 * @param {Object} options.orderData - Datos de la orden completa
 * @returns {Promise} - Promesa con el resultado del envío
 */
export async function sendReceiptEmail({ 
  pdfBuffer, 
  customerEmail, 
  orderId, 
  isApproved = false,
  orderData = {} 
}) {
  const startTime = Date.now();
  
  // Log del inicio del intento
  logInfo(`📧 [${orderId}] Iniciando envío de correos`, {
    to: customerEmail,
    isApproved,
    hasItems: Array.isArray(orderData.items) && orderData.items.length > 0,
    totalAmount: orderData.total_amount
  });
  
  try {
    // Validaciones básicas con logs detallados
    logInfo(`🔍 [${orderId}] Validando datos para envío de correos`);
    
    if (!pdfBuffer) {
      throw new Error('Se requiere PDF para enviar el correo');
    }
    logInfo(`📄 [${orderId}] PDF válido, tamaño: ${pdfBuffer.length} bytes`);
    
    if (!customerEmail) {
      throw new Error('Se requiere email del cliente');
    }
    logInfo(`📧 [${orderId}] Email del cliente válido: ${customerEmail}`);
    
    // Verificar configuración de email
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      throw new Error('Configuración de email incompleta. Verifica EMAIL_USER y EMAIL_PASSWORD en .env.local');
    }
    logInfo(`⚙️ [${orderId}] Configuración de email verificada`);
    
    const logisticsEmail = process.env.LOGISTICS_EMAIL;
    if (!logisticsEmail) {
      logWarn(`⚠️ [${orderId}] Email de logística no configurado, solo se enviará al cliente`);
    } else {
      logInfo(`📬 [${orderId}] Email de logística configurado: ${logisticsEmail}`);
    }
    
    // Preparar nombre del cliente
    const customerName = `${orderData.userData?.first_name || ''} ${orderData.userData?.last_name || ''}`.trim() || 'Cliente';
    logInfo(`👤 [${orderId}] Nombre del cliente: ${customerName}`);
    
    // Email para el cliente
    logInfo(`📝 [${orderId}] Preparando email para el cliente`);
    const customerMailOptions = {
      from: `"Altura Divina" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: `${isApproved ? '✅ Confirmación' : '📋 Registro'} de Pedido #${orderId}`,
      html: getCustomerEmailTemplate({ 
        orderId, 
        isApproved, 
        customerName,
        orderData
      }),
      attachments: [{
        filename: `Pedido-${orderId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    };

    // Enviar email al cliente con mejor logging
    try {
      logInfo(`📤 [${orderId}] Enviando correo al cliente: ${customerEmail}`);
      
      // Verificar conexión antes de enviar
      try {
        logInfo(`🔎 [${orderId}] Verificando conexión con servidor de correo...`);
        await transport.verify();
        logInfo(`✅ [${orderId}] Conexión con servidor de correo verificada correctamente`);
        
        logInfo(`📤 [${orderId}] Iniciando envío de correo a: ${customerEmail}`);
        const customerResult = await transport.sendMail(customerMailOptions);
        
        // Log más detallado de la respuesta
        logInfo(`✅ [${orderId}] Email enviado al cliente exitosamente`, {
          messageId: customerResult.messageId,
          response: customerResult.response || "Sin respuesta",
          to: customerEmail,
          envelope: JSON.stringify(customerResult.envelope || {})
        });
      } catch (emailError) {
        // Log más detallado del error
        logError(`❌ [${orderId}] Error enviando email al cliente ${customerEmail}:`, {
          error: emailError.message,
          code: emailError.code,
          responseCode: emailError.responseCode,
          command: emailError.command,
          stack: emailError.stack
        });
        // No lanzar error para continuar con logística
      }
    } catch (emailError) {
      logError(`❌ [${orderId}] Error enviando email al cliente ${customerEmail}:`, {
        error: emailError.message,
        code: emailError.code,
        responseCode: emailError.responseCode
      });
      // No lanzar error para continuar con logística
    }

    // Email para el equipo de logística - solo si tenemos la configuración
    if (logisticsEmail) {
      logInfo(`📝 [${orderId}] Preparando email para logística`);
      const logisticsMailOptions = {
        from: `"Sistema Altura Divina" <${process.env.EMAIL_USER}>`,
        to: logisticsEmail,
        subject: `${isApproved ? '🚨 PEDIDO CONFIRMADO' : '📋 PEDIDO PENDIENTE'} #${orderId}`,
        html: getLogisticsEmailTemplate({ 
          orderId, 
          isApproved,
          orderData
        }),
        attachments: [{
          filename: `Pedido-${orderId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }]
      };

      // Enviar email al equipo de logística
      try {
        logInfo(`📤 [${orderId}] Enviando correo a logística: ${logisticsEmail}`);
        const logisticsResult = await transport.sendMail(logisticsMailOptions);
        logInfo(`✅ [${orderId}] Email enviado a logística exitosamente`, {
          messageId: logisticsResult.messageId,
          response: logisticsResult.response || "Sin respuesta",
          to: logisticsEmail
        });
      } catch (emailError) {
        logError(`❌ [${orderId}] Error enviando email a logística ${logisticsEmail}:`, {
          error: emailError.message,
          code: emailError.code,
          responseCode: emailError.responseCode
        });
      }
    }

    const endTime = Date.now();
    logInfo(`🎉 [${orderId}] Proceso de envío de correos completado en ${endTime - startTime}ms`);
    
    return { success: true };
  } catch (error) {
    const endTime = Date.now();
    logError(`❌ [${orderId}] Error general en servicio de email después de ${endTime - startTime}ms:`, {
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  }
}

// Template mejorado para el email del cliente
function getCustomerEmailTemplate({ orderId, isApproved, customerName, orderData }) {
  const items = orderData.items || [];
  const totalAmount = orderData.total_amount || 0;
  const mode = orderData?.displayMode || orderData?.metadata?.displayMode || 'full';
  const isFF = mode === 'family';
  
  // Generar HTML de productos
  const itemsHtml = items.map(item => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px 8px; font-weight: 500;">${item.name}</td>
      <td style="padding: 12px 8px; text-align: center; color: #666;">${item.quantity}</td>
      <td style="padding: 12px 8px; text-align: right; font-weight: 500;">$${Number(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <!-- Header con logo -->
      <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0;">
        <img src="https://framerusercontent.com/images/mf7sOfj3j3JPwUTBq7iv2eBpw.png?scale-down-to=512" alt="Altura Divina" style="max-width: 150px; height: auto;">
      </div>
      
      <!-- Título principal -->
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2c3e50; font-size: 28px; margin: 0; font-weight: 600;">
          ${isApproved ? '🎉 ¡Compra Confirmada!' : '📋 Pedido Recibido'}
        </h1>
        <p style="color: #7f8c8d; font-size: 16px; margin: 10px 0 0;">
          ${isApproved ? 'Tu pago ha sido procesado exitosamente' : 'Hemos registrado tu pedido correctamente'}
        </p>
      </div>
      
      <!-- Saludo personalizado -->
      <div style="margin-bottom: 25px;">
        <p style="color: #2c3e50; font-size: 16px; margin: 0;">Hola ${customerName},</p>
      </div>
      
      <!-- Mensaje principal -->
      <div style="background-color: ${isApproved ? '#d5f4e6' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid ${isApproved ? '#27ae60' : '#f39c12'};">
        <p style="color: #2c3e50; margin: 0; font-size: 16px; line-height: 1.5;">
          ${isApproved 
            ? '✅ Tu pago ha sido aprobado y estamos preparando tu pedido para el envío. Te notificaremos cuando haya sido despachado.' 
            : '⏳ Hemos registrado tu pedido y estamos esperando la confirmación de tu pago. Te notificaremos tan pronto como lo recibamos.'}
        </p>
      </div>
      
      <!-- Información del pedido -->
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h3 style="color: #2c3e50; margin: 0 0 15px; font-size: 18px;">📋 Detalles del Pedido</h3>
        <p style="margin: 0 0 10px; font-size: 16px;"><strong>Número:</strong> #${orderId}</p>
        <p style="margin: 0; font-size: 16px;"><strong>Estado:</strong> 
          <span style="color: ${isApproved ? '#27ae60' : '#f39c12'}; font-weight: 600;">
            ${isApproved ? 'Confirmado' : 'Pendiente de pago'}
          </span>
        </p>
        ${isFF ? `<p style="margin: 10px 0 0; font-size: 14px; color:#0d6efd;"><strong>Modalidad:</strong> Family & Friends</p>` : ''}
      </div>
      
      <!-- Productos -->
      ${items.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h3 style="color: #2c3e50; margin: 0 0 15px; font-size: 18px;">🛍️ Productos</h3>
        <table style="width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background-color: #34495e;">
              <th style="padding: 15px 8px; text-align: left; color: white; font-weight: 500;">Producto</th>
              <th style="padding: 15px 8px; text-align: center; color: white; font-weight: 500;">Cant.</th>
              <th style="padding: 15px 8px; text-align: right; color: white; font-weight: 500;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <!-- ✅ NUEVO: Mostrar subtotal -->
            <tr style="background-color: #f8f9fa;">
              <td colspan="2" style="padding: 10px 8px; text-align: right; color: #2c3e50;">Subtotal:</td>
              <td style="padding: 10px 8px; text-align: right; color: #2c3e50;">$${orderData.subtotal_amount.toFixed(2)}</td>
            </tr>
            <!-- ✅ NUEVO: Mostrar envío -->
            <tr style="background-color: #f8f9fa;">
              <td colspan="2" style="padding: 10px 8px; text-align: right; color: #2c3e50;">Envío:</td>
              <td style="padding: 10px 8px; text-align: right; color: #2c3e50;">$${orderData.shipping_fee.toFixed(2)}</td>
            </tr>
            <!-- ✅ CORRECCIÓN: Total correcto -->
            <tr style="background-color: #ecf0f1; font-weight: 600;">
              <td colspan="2" style="padding: 15px 8px; text-align: right; color: #2c3e50;">Total:</td>
              <td style="padding: 15px 8px; text-align: right; color: #27ae60; font-size: 18px;">$${orderData.total_amount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ` : ''}
      
      <!-- Información importante -->
      <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #3498db;">
        <h4 style="color: #2c3e50; margin: 0 0 10px; font-size: 16px;">📎 Recibo Adjunto</h4>
        <p style="color: #34495e; margin: 0; font-size: 14px;">
          Hemos adjuntado tu recibo en formato PDF. Te recomendamos guardarlo para futuras referencias.
        </p>
      </div>
      
      <!-- Contacto -->
      <div style="text-align: center; margin-bottom: 25px;">
        <p style="color: #7f8c8d; margin: 0 0 10px; font-size: 14px;">
          ¿Tienes alguna pregunta? Estamos aquí para ayudarte
        </p>
        <a href="mailto:soporte@alturatequila.com" style="color: #3498db; text-decoration: none; font-weight: 500;">
          📧 soporte@alturatequila.com
        </a>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #95a5a6; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} Altura Divina. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `;
}

// Template mejorado para el email de logística
function getLogisticsEmailTemplate({ orderId, isApproved, orderData }) {
  const customer = orderData.userData || {};
  const shipping = customer.shipping_address || customer.address || {};
  const billingSame = customer.billing_same_as_shipping !== false && !customer.billing_address ? true : customer.billing_same_as_shipping !== false && JSON.stringify(customer.billing_address||{}) === JSON.stringify(shipping||{});
  const billing = billingSame ? shipping : (customer.billing_address || {});
  const items = orderData.items || [];
  const totalAmount = orderData.total_amount || 0;
  const mode = orderData?.displayMode || orderData?.metadata?.displayMode || 'full';
  const isFF = mode === 'family';
  
  // Formatear productos para el email
  const productsHtml = items.map(item => 
    `<tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 12px 8px; font-weight: 500;">${item.name || `Producto #${item.product_id}`}</td>
      <td style="padding: 12px 8px; text-align: center; background-color: #f8f9fa;">${item.quantity}</td>
      <td style="padding: 12px 8px; text-align: right;">$${Number(item.price).toFixed(2)}</td>
      <td style="padding: 12px 8px; text-align: right; font-weight: 600;">$${Number(item.price * item.quantity).toFixed(2)}</td>
    </tr>`
  ).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <!-- Header con logo -->
      <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0;">
        <img src="https://framerusercontent.com/images/mf7sOfj3j3JPwUTBq7iv2eBpw.png?scale-down-to=512" alt="Altura Divina" style="max-width: 150px; height: auto;">
      </div>
      
      <!-- Header de urgencia -->
      <div style="background-color: ${isApproved ? '#27ae60' : '#f39c12'}; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 600;">
          ${isApproved ? '🚨 PEDIDO CONFIRMADO - ACCIÓN REQUERIDA' : '📋 NUEVO PEDIDO REGISTRADO'}
        </h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">
          ${isApproved ? 'Proceder con preparación y envío inmediato' : 'Esperando confirmación de pago'}
        </p>
      </div>
      
      <!-- Información del pedido -->
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h2 style="color: #2c3e50; margin: 0 0 15px; font-size: 20px;">📋 Información del Pedido</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <p style="margin: 0 0 5px; font-weight: 600; color: #34495e;">Número de Pedido:</p>
            <p style="margin: 0; font-size: 18px; color: #2c3e50;">#${orderId}</p>
          </div>
          <div>
            <p style="margin: 0 0 5px; font-weight: 600; color: #34495e;">Estado:</p>
            <p style="margin: 0; font-size: 18px; color: ${isApproved ? '#27ae60' : '#f39c12'}; font-weight: 600;">
              ${isApproved ? '✅ PAGO CONFIRMADO' : '⏳ PAGO PENDIENTE'}
            </p>
          </div>
        </div>
        ${isFF ? `<div style="margin-top:10px; padding:10px; background:#e7f1ff; border-left:4px solid #0d6efd; border-radius:6px; color:#0d6efd; font-weight:600;">Modalidad: Family & Friends</div>` : ''}
      </div>
      
      <!-- Datos del cliente -->
      <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #2c3e50; margin: 0 0 15px; font-size: 18px;">👤 Datos del Cliente</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <p style="margin: 0 0 8px;"><strong>Nombre:</strong> ${customer.first_name || ''} ${customer.last_name || ''}</p>
            <p style="margin: 0 0 8px;"><strong>Email:</strong> ${customer.email || 'No disponible'}</p>
            <p style="margin: 0;"><strong>Teléfono:</strong> ${customer.phone || 'No disponible'}</p>
          </div>
          <div>
            <p style="margin: 0 0 5px; font-weight: 600; color: #34495e;">Dirección de Envío:</p>
            <div style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom:8px;">
              <p style="margin: 0; line-height: 1.4;">
                ${shipping.street_name || ''} ${shipping.street_number || ''}<br>
                ${shipping.zip_code ? `C.P. ${shipping.zip_code}<br>` : ''}
                ${shipping.city || ''}, ${shipping.state || ''}<br>
                <strong>${shipping.country || 'México'}</strong>
              </p>
            </div>
            ${billingSame ? '' : `
            <p style="margin: 10px 0 5px; font-weight:600; color:#34495e;">Dirección de Facturación:</p>
            <div style="background:#f8f9fa; padding:10px; border-radius:4px;">
              <p style="margin:0; line-height:1.4;">
                ${billing.street_name || ''} ${billing.street_number || ''}<br>
                ${billing.zip_code ? `C.P. ${billing.zip_code}<br>` : ''}
                ${billing.city || ''}, ${billing.state || ''}<br>
                <strong>${billing.country || 'México'}</strong>
              </p>
            </div>`}
          </div>
        </div>
      </div>
      
      <!-- Productos -->
      <div style="margin-bottom: 25px;">
        <h3 style="color: #2c3e50; margin: 0 0 15px; font-size: 18px;">📦 Productos a Enviar</h3>
        <table style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #343a40; color: white;">
              <th style="padding: 15px 8px; text-align: left; font-weight: 500;">Producto</th>
              <th style="padding: 15px 8px; text-align: center; font-weight: 500;">Cantidad</th>
              <th style="padding: 15px 8px; text-align: right; font-weight: 500;">Precio Unit.</th>
              <th style="padding: 15px 8px; text-align: right; font-weight: 500;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${productsHtml || '<tr><td colspan="4" style="padding: 15px; text-align: center; color: #6c757d;">No hay productos en la orden</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background-color: #f8f9fa; font-weight: 600; font-size: 16px;">
              <td colspan="3" style="padding: 15px 8px; text-align: right; color: #2c3e50;">TOTAL:</td>
              <td style="padding: 15px 8px; text-align: right; color: #27ae60; font-size: 18px;">$${Number(totalAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <!-- Acciones requeridas -->
      ${isApproved ? `
      <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <h4 style="color: #0c5460; margin: 0 0 10px; font-size: 16px;">⚡ Acciones Inmediatas Requeridas:</h4>
        <ul style="color: #0c5460; margin: 0; padding-left: 20px;">
          <li>Verificar disponibilidad de productos en inventario</li>
          <li>Preparar productos para empaque</li>
          <li>Generar etiqueta de envío</li>
          <li>Coordinar pickup o entrega según la dirección</li>
          <li>Actualizar sistema con número de rastreo</li>
        </ul>
      </div>
      ` : `
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <h4 style="color: #856404; margin: 0 0 10px; font-size: 16px;">⏳ Pedido en Espera:</h4>
        <p style="color: #856404; margin: 0;">
          Este pedido está esperando confirmación de pago. No proceder con preparación hasta recibir notificación de pago confirmado.
        </p>
      </div>
      `}
      
      <!-- Información adicional -->
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center;">
        <p style="margin: 0; color: #6c757d; font-size: 14px;">
          📎 Recibo detallado adjunto en PDF | ⏰ Generado: ${new Date().toLocaleString('es-MX')}
        </p>
      </div>
    </div>
  `;
}

// ✅ NUEVA: Email de confirmación de solicitud (inmediato)
export async function sendPaymentRequestConfirmation({ userData, paymentId, status, orderId, amount }) {
  try {
    const emailContent = `
      Hola ${userData.first_name},
      
      Hemos recibido tu solicitud de pago:
      
      - Orden: ${orderId}
      - Pago ID: ${paymentId}
      - Monto: $${amount} MXN
      - Estado actual: ${status}
      
      ${status === 'approved' ? 
        'Tu pago ha sido aprobado instantáneamente. Te enviaremos la confirmación completa en breve.' :
        'Te notificaremos cuando el estado de tu pago se actualice.'
      }
    `;

    // Implementar envío...
    
  } catch (error) {
    logError('❌ Error enviando confirmación de solicitud:', error);
  }
}

// ✅ NUEVA: Email de aprobación (desde webhook)
export async function sendPaymentApprovedEmail(paymentRequest, paymentInfo) {
  try {
    const customerData = JSON.parse(paymentRequest.customer_data);
    let orderItems = JSON.parse(paymentRequest.order_items);

    // Generar PDF completo
    const receiptPDF = await generateReceiptPDF({
      orderId: paymentRequest.id,
      customerData,
      items: orderItems,
  subtotalAmount: (paymentRequest.total_amount ?? 0) - (paymentRequest.shipping_fee ?? 0),
  shippingFee: paymentRequest.shipping_fee ?? 0,
      totalAmount: paymentRequest.total_amount,
      paymentStatus: 'approved',
      paymentId: paymentInfo.id,
      displayMode: paymentRequest.display_mode || paymentRequest.metadata?.displayMode
    });

    // Enviar email completo con PDF
    const emailResult = await sendReceiptEmail({
      to: customerData.email,
      customerName: `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim(),
      orderId: paymentRequest.id,
      paymentId: paymentInfo.id,
      amount: paymentRequest.total_amount,
      items: orderItems,
      pdfAttachment: receiptPDF
    });

    return emailResult;

  } catch (error) {
    logError('❌ Error enviando email de aprobación:', error);
  }
}

// ✅ CORREGIR: Email de reembolso usando transport.sendMail directamente
export async function sendRefundEmail(paymentRequest, paymentInfo) {
  try {
    const customerData = paymentRequest.customer_data;
    let orderItems = paymentRequest.order_items;

    if (typeof orderItems === 'string') {
      orderItems = JSON.parse(orderItems);
    }

    if (!customerData?.email) {
      logWarn(`⚠️ No hay email para enviar notificación de reembolso del pago ${paymentInfo.id}`);
      return { success: false, error: 'No email provided' };
    }

    const customerName = `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim();
    const totalRefundAmount = paymentRequest.total_amount;
    
    // ✅ NUEVO: Calcular subtotal y envío por separado
  const SHIPPING_FEE = 0; // Envío temporalmente en 0
    const subtotalRefund = totalRefundAmount - SHIPPING_FEE;

    // ✅ USAR: transport.sendMail directamente en lugar de sendEmail
    const emailResult = await transport.sendMail({
      from: `"Altura Divina" <${process.env.EMAIL_USER}>`,
      to: customerData.email,
      subject: `Reembolso procesado - Orden ${paymentRequest.id}`,
      html: getRefundEmailTemplate({
        customerName,
        orderId: paymentRequest.id,
        paymentId: paymentInfo.id,
        subtotalRefund, // ✅ NUEVO: Pasar subtotal
        shippingRefund: SHIPPING_FEE, // ✅ NUEVO: Pasar envío
        totalRefundAmount, // ✅ RENOMBRADO: Para claridad
        items: orderItems
      })
    });

    if (emailResult.messageId) {
      logInfo(`✅ Email de reembolso enviado a ${customerData.email}`);
      return { success: true, messageId: emailResult.messageId };
    } else {
      logError(`❌ Error enviando email de reembolso - sin messageId`);
      return { success: false, error: 'No messageId returned' };
    }

  } catch (error) {
    logError(`❌ Error en sendRefundEmail:`, error);
    return { success: false, error: error.message };
  }
}

// ✅ CORREGIR: Notificar contracargos usando transport.sendMail directamente
export async function notifyChargebackToAdmins(paymentRequest, paymentInfo) {
  try {
    const paymentId = paymentInfo.id;
    const orderId = paymentRequest.id;

    // Lista temporal de administradores - mover a variable de entorno
    const adminEmails = [
      process.env.LOGISTICS_EMAIL
    ].filter(Boolean);

    if (adminEmails.length === 0) {
      logWarn('⚠️ No hay emails de administrador configurados');
      return { success: false, error: 'No admin emails configured' };
    }

    for (const adminEmail of adminEmails) {
      // ✅ USAR: transport.sendMail directamente en lugar de sendEmail
      const emailResult = await transport.sendMail({
        from: `"Sistema Altura Divina" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: `🚨 ALERTA: Contracargo detectado - Pago ${paymentId}`,
        html: getChargebackAlertTemplate({
          paymentId,
          orderId,
          customerData: paymentRequest.customer_data,
          amount: paymentRequest.total_amount
        })
      });

      if (emailResult.messageId) {
        logInfo(`✅ Alerta de contracargo enviada a ${adminEmail}`);
      } else {
        logError(`❌ Error enviando alerta de contracargo a ${adminEmail} - sin messageId`);
      }
    }

    return { success: true };

  } catch (error) {
    logError(`❌ Error en notifyChargebackToAdmins:`, error);
    return { success: false, error: error.message };
  }
}

// ✅ AGREGAR: Template para email de reembolso
function getRefundEmailTemplate({ customerName, orderId, paymentId, subtotalRefund, shippingRefund, totalRefundAmount, items }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <!-- Header con logo -->
      <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0;">
        <img src="https://framerusercontent.com/images/mf7sOfj3j3JPwUTBq7iv2eBpw.png?scale-down-to=512" alt="Altura Divina" style="max-width: 150px; height: auto;">
      </div>
      
      <div style="background-color: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
        <h1 style="margin: 0; font-size: 24px;">💰 Reembolso Procesado</h1>
        <p style="margin: 10px 0 0; font-size: 16px;">Su reembolso ha sido procesado exitosamente</p>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h2 style="color: #2c3e50; margin: 0 0 15px; font-size: 20px;">Detalles del Reembolso</h2>
        <p><strong>Cliente:</strong> ${customerName}</p>
        <p><strong>Orden ID:</strong> ${orderId}</p>
        <p><strong>Pago ID:</strong> ${paymentId}</p>
        
        <!-- ✅ NUEVO: Desglose del reembolso -->
        <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #dee2e6;">
          <h3 style="color: #2c3e50; margin: 0 0 10px; font-size: 16px;">💰 Desglose del Reembolso</h3>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Subtotal productos:</span>
            <span><strong>$${subtotalRefund.toFixed(2)} MXN</strong></span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Costo de envío:</span>
            <span><strong>$${shippingRefund.toFixed(2)} MXN</strong></span>
          </div>
          <hr style="margin: 10px 0; border: none; border-top: 1px solid #dee2e6;">
          <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; color: #27ae60;">
            <span>Total reembolsado:</span>
            <span>$${totalRefundAmount.toFixed(2)} MXN</span>
          </div>
        </div>
      </div>

      ${items && items.length > 0 ? `
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h3 style="color: #2c3e50; margin: 0 0 15px;">📦 Productos reembolsados:</h3>
        ${items.map(item => `
          <div style="border-bottom: 1px solid #ddd; padding: 10px 0;">
            <strong>${item.name}</strong><br>
            <span style="color: #666;">Cantidad: ${item.quantity} - Precio unitario: $${item.price} MXN</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div style="background-color: #d1ecf1; color: #0c5460; padding: 15px; border-radius: 8px; text-align: center;">
        <p style="margin: 0;">El reembolso será reflejado en su método de pago original en 3-5 días hábiles.</p>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee; margin-top: 25px;">
        <p style="color: #95a5a6; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} Altura Divina. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `;
}

// ✅ AGREGAR: Template para alerta de contracargo
function getChargebackAlertTemplate({ paymentId, orderId, customerData, amount }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <!-- Header con logo -->
      <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0;">
        <img src="https://framerusercontent.com/images/mf7sOfj3j3JPwUTBq7iv2eBpw.png?scale-down-to=512" alt="Altura Divina" style="max-width: 150px; height: auto;">
      </div>
      
      <div style="background-color: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
        <h1 style="margin: 0; font-size: 24px;">🚨 ALERTA: Contracargo Detectado</h1>
        <p style="margin: 10px 0 0; font-size: 16px;">Requiere acción inmediata</p>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h2 style="color: #2c3e50; margin: 0 0 15px; font-size: 20px;">Detalles del Contracargo</h2>
        <p><strong>Pago ID:</strong> ${paymentId}</p>
        <p><strong>Orden ID:</strong> ${orderId}</p>
        <p><strong>Monto:</strong> $${amount} MXN</p>
        <p><strong>Cliente:</strong> ${customerData?.email || 'N/A'}</p>
        <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-MX')}</p>
      </div>

      <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 8px;">
        <p style="margin: 0;"><strong>Acciones requeridas:</strong></p>
        <ul style="margin: 10px 0 0 20px;">
          <li>Revisar la transacción en MercadoPago</li>
          <li>Verificar documentación de la orden</li>
          <li>Preparar evidencia para disputar si es necesario</li>
          <li>Contactar al cliente si es apropiado</li>
        </ul>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; padding-top: 20px; border-top: 1px solid #eee; margin-top: 25px;">
        <p style="color: #95a5a6; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} Altura Divina. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `;
}

// NUEVO: Construir email de pedido (incluye lógica para Family & Friends)
export function buildOrderEmail({ order, customer, /* ...others */ }) {
  const mode = (order?.displayMode || order?.metadata?.displayMode || 'full')
  const isFF = mode === 'family'

  const subjectPrefix = isFF ? '[Family & Friends] ' : ''
  const subject = `${subjectPrefix}Confirmación de tu compra`

  // Construir bloque de datos del cliente
  const customerBlock = isFF
    ? `
      <h3>Datos del cliente (Family & Friends)</h3>
      <p><strong>Nombre completo:</strong> ${customer?.fullName || customer?.full_name || ''}</p>
      <p><strong>Email:</strong> ${customer?.email || ''}</p>
      <p><strong>Teléfono:</strong> ${customer?.phone || ''}</p>
    `
    : /* bloque detallado existente */ buildFullCustomerBlock(customer)

  return {
    subject,
    html: `
      <!-- Contenido HTML existente -->
      ${customerBlock}
      <!-- Resto del contenido HTML -->
    `,
    // ...otros campos existentes...
  }
}

// Función para construir bloque completo de datos del cliente
function buildFullCustomerBlock(customer) {
  // Fallback seguro si no tienes una implementación previa
  const first = customer?.first_name || customer?.firstName || '';
  const last = customer?.last_name || customer?.lastName || '';
  const email = customer?.email || '';
  const phone = customer?.phone || '';
  const addr = customer?.shipping_address || customer?.address || {};
  return `
    <h3>Datos del cliente</h3>
    <p><strong>Nombre:</strong> ${first} ${last}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Teléfono:</strong> ${phone}</p>
    ${addr?.street_name ? `
      <p><strong>Dirección:</strong> ${addr.street_name} ${addr.street_number || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip_code || ''}</p>` : ''
    }
  `;
}