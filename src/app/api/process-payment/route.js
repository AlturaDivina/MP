import { MercadoPagoConfig, Payment } from 'mercadopago';
import { NextResponse } from 'next/server';
import rateLimit from '../rate-limit';
import { kv, getProductStock, updateProductStock } from '../../../lib/kv'; // Importar funciones de stock
import { products as staticProducts } from '../../../data/products';

// Función auxiliar para buscar producto estático por ID
function getStaticProductById(id) {
  return staticProducts.find(p => p.id === id);
}

export async function POST(req) {
  // Aplicar rate limiting
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
  const { success, limit, remaining, reset } = rateLimit.limiter(ip);
  
  // Si excedió el límite, devolver 429 Too Many Requests
  if (!success) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intente nuevamente más tarde.' },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString()
        }
      }
    );
  }

  const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
  const payment = new Payment(client);

  try {
    const body = await req.json();
    const { formData, productId, quantity } = body;
    // Si los datos vienen en formData.formData:
    const { token, issuer_id, payment_method_id, installments, payer } = 
      (formData.formData || formData); // Intenta ambas estructuras

    // Validar datos esenciales (añadir más validaciones si es necesario)
    if (!token || !payment_method_id || !installments || !payer?.email || !productId || !quantity || quantity < 1) {
      console.error('Validation Error: Missing or invalid required payment data');
      return NextResponse.json({ error: 'Faltan datos requeridos o inválidos para el pago' }, { status: 400 });
    }

    // --- Validación de Precio (CRÍTICO) usando datos ESTÁTICOS ---
    const product = getStaticProductById(productId);
    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado en el catálogo local' }, { status: 404 });
    }
    if (typeof product.price !== 'number') {
      console.error(`Invalid price found in static data for ${productId}:`, product.price);
      return NextResponse.json({ error: 'Precio del producto inválido en los datos estáticos' }, { status: 500 });
    }
    const expectedAmount = product.price * quantity;
    if (formData.transaction_amount !== expectedAmount) {
       console.error(`Price Mismatch: Expected ${expectedAmount}, Received ${formData.transaction_amount}`);
       return NextResponse.json({ error: 'El monto de la transacción no coincide con el precio del producto' }, { status: 400 });
    }
    // --- Fin Validación de Precio ---

    // --- Verificación de Stock (usando getProductStock) ---
    try {
        const currentStock = await getProductStock(productId);
        console.log(`Stock check for ${productId}: Found ${currentStock}, Requested ${quantity}`);
        
        // --- Lógica de error de stock mejorada ---
        if (currentStock <= 0) {
            console.warn(`Attempted purchase for out-of-stock product ${productId}.`);
            return NextResponse.json({
                error: `Lo sentimos, "${product.name}" está agotado.` // Mensaje "Sold Out"
            }, { status: 400 });
        } else if (currentStock < quantity) {
            console.warn(`Insufficient stock for ${productId}: Available ${currentStock}, Requested ${quantity}`);
            return NextResponse.json({
                error: `Stock insuficiente para "${product.name}". Solo quedan ${currentStock} unidades disponibles.`
            }, { status: 400 });
        }
    } catch (error) {
        console.error(`Error fetching stock for ${productId}:`, error);
        return NextResponse.json({ error: 'Error temporal al verificar disponibilidad. Intenta de nuevo.' }, { status: 500 });
    }
    // --- Fin Verificación de Stock ---

    console.log('Processing payment (static price validation, KV stock check) for product:', productId, 'Amount:', expectedAmount);

    const paymentData = {
      token: token,
      issuer_id: issuer_id,
      payment_method_id: payment_method_id,
      transaction_amount: expectedAmount,
      installments: installments,
      payer: { email: payer.email },
    };

    const paymentResult = await payment.create({ body: paymentData });

    console.log('Mercado Pago API Response Status:', { 
        id: paymentResult.id, 
        status: paymentResult.status, 
        status_detail: paymentResult.status_detail 
    });

    // --- Actualización de Stock (usando updateProductStock) ---
    if (paymentResult.status === 'approved') {
        try {
            // Obtener stock actual y restar cantidad comprada
            const currentStock = await getProductStock(productId);
            const newStock = currentStock - quantity;
            
            // Actualizar stock usando la función específica
            await updateProductStock(productId, newStock);
            console.log(`Stock for ${productId} updated to ${newStock}`);
        } catch (stockError) {
            console.error(`Failed to update stock for ${productId} after payment ${paymentResult.id}:`, stockError);
        }
    }
    // --- Fin Actualización de Stock ---

    return NextResponse.json({
      status: paymentResult.status,
      status_detail: paymentResult.status_detail,
      id: paymentResult.id
    }, { status: 200 });

  } catch (error) {
    console.error('Error processing payment:', error?.cause || error?.message || error);
    const errorMessage = error?.cause?.[0]?.description || error?.message || 'Error interno del servidor';
    const errorStatus = error?.status || 500;
    return NextResponse.json({ error: `Error: ${errorMessage}` }, { status: errorStatus });
  }
}