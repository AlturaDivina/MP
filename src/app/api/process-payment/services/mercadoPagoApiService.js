import { MercadoPagoConfig, Payment } from 'mercadopago';
import { logInfo, logError } from '../../../../utils/logger';

export async function processMercadoPagoPayment(paymentData) {
  try {
    // Validate environment variables before proceeding
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      logError("Token de acceso no configurado en variables de entorno");
      throw new Error("Configuration error: MercadoPago access token is not configured");
    }

    // Add this at the top of the function
    if (!paymentData.idempotencyKey) {
      throw new Error("Missing idempotencyKey for API call");
    }
    
    // Create client with validated token and proper options
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
      options: {
        timeout: 5000,
        idempotencyKey: paymentData.idempotencyKey
      }
    });

    // Log only first few characters for security
    logInfo(`Token configurado (primeros caracteres): ${process.env.MERCADOPAGO_ACCESS_TOKEN.substring(0, 5)}...`);

    const payment = new Payment(client);
    
    // Validate required payment data
    if (!paymentData.transaction_amount || !paymentData.token || !paymentData.payment_method_id) {
      logError("Datos de pago incompletos", paymentData);
      throw new Error("Payment data incomplete");
    }
    
    // Asegúrate de que todos los campos necesarios estén incluidos y con el formato correcto
    const paymentPayload = {
      transaction_amount: parseFloat(paymentData.transaction_amount),
      token: paymentData.token,
      description: "Compra en línea",
      installments: parseInt(paymentData.installments),
      payment_method_id: paymentData.payment_method_id,
      payer: {
        email: paymentData.payerEmail || paymentData.payerData?.email
      }
    };

    if (paymentData.issuer_id) {
      paymentPayload.issuer_id = paymentData.issuer_id;
    }

    // Log completo para debugging
    logInfo("Payload a enviar a MercadoPago:", JSON.stringify(paymentPayload));

    const response = await payment.create({ body: paymentPayload });
    
    logInfo("Respuesta de MercadoPago:", {
      status: response.status,
      id: response.id,
      status_detail: response.status_detail
    });

    return response;
  } catch (error) {
    logError("Error en processMercadoPagoPayment:", {
      message: error.message,
      cause: error.cause,
      status: error.status
    });
    
    throw new Error(`Error de MercadoPago: ${error.message}`);
  }
}