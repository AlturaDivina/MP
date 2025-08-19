import { useState } from 'react';
import { logInfo, logError, logWarning } from '../utils/logger'; // Assuming logger utility
import { sanitizeInput } from '../utils/sanitize'; // Assuming sanitize utility
import { v4 as uuidv4 } from 'uuid'; // Importar uuid para generar claves de idempotencia

// Helper to get CSRF token (can be moved to a shared utility)
async function getCsrfToken() {
  try {
    const response = await fetch('/api/csrf-token'); // Adjust if your endpoint is different
    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }
    const data = await response.json();
    return data.csrfToken;
  } catch (error) {
    logError("Error fetching CSRF token:", error);
    throw error;
  }
}

// Placeholder for user session token - implement actual logic to retrieve user session token
async function getUserSessionToken() {
  // Implementar la lógica para obtener el token de sesión del usuario
  // Esto puede implicar llamar a una API o acceder a un almacenamiento local, según su aplicación
  return 'user-session-token-placeholder'; // Reemplazar con el valor real
}

export function useMercadoPagoBrickSubmit({
  apiBaseUrl,
  orderSummary,
  productId,
  quantity,
  totalAmount,
  userData,
  onSuccess,
  onError,
  successUrl,
  pendingUrl,
  failureUrl,
  hostUrl,
  displayMode, // <-- NUEVO
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const handleSubmit = async (formDataFromBrick) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setProcessingError(null);
    setStatusMsg('Procesando pago...');

    try {
      const csrfToken = await getCsrfToken();

      const tokenFromForm = formDataFromBrick.token || formDataFromBrick.formData?.token;
      const paymentMethodFromForm = formDataFromBrick.payment_method_id || formDataFromBrick.formData?.payment_method_id;

      if (!tokenFromForm || !paymentMethodFromForm) {
        logError("Campos críticos faltantes en formDataFromBrick:", {
          hasToken: !!tokenFromForm,
          hasPaymentMethodId: !!paymentMethodFromForm,
        });
        throw new Error("Datos de pago incompletos desde el Brick. Por favor intente nuevamente.");
      }
      
      const finalAmount = totalAmount || 
        (orderSummary 
          ? orderSummary.reduce((total, item) => total + (item.price * item.quantity), 0)
          : 0);

      // CRÍTICO: Sumar shipping fee al monto final antes de enviarlo al backend
  const SHIPPING_FEE = (displayMode === 'family') ? 0 : 200;
  const totalWithShipping = finalAmount + SHIPPING_FEE;

      const backendPayload = {
        paymentType: formDataFromBrick.paymentType || "credit_card",
        formData: formDataFromBrick,
        isMultipleOrder: !!orderSummary,
        orderSummary: orderSummary,
        productId: !orderSummary ? productId : null,
        quantity: !orderSummary ? quantity : null,
        totalAmount: totalWithShipping,
        userData: userData,
        sessionToken: await getUserSessionToken(),
        idempotencyKey: uuidv4(),
  displayMode, // ✅ send mode so the API can relax validations for family
      };

      logInfo("Payload enviado a /api/process-payment:", backendPayload);

      const processApiUrl = apiBaseUrl.includes('localhost')
        ? apiBaseUrl.replace(/\/$/, '').replace('https://', 'http://')
        : apiBaseUrl.replace(/\/$/, '');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(`${processApiUrl}/api/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(backendPayload),
        signal: controller.signal,
        credentials: 'include'
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      logInfo("Respuesta de /api/process-payment:", data);

      if (!response.ok) {
        // ✅ NUEVO: Manejo inteligente de errores según el tipo y código
        let errorMessage;
        
        // Analizar el contenido del error para determinar el tipo
        if (data.code === 'INSUFFICIENT_STOCK' || data.error?.includes('Stock insuficiente')) {
          // ✅ STOCK: Mostrar detalles específicos para ayudar al usuario
          errorMessage = `📦 ${data.error || data.message}
        \n
🔄 Sugerencias: \n
• Reduce la cantidad del producto\n
• Elige otros productos disponibles\n
• Recarga la página para ver stock actualizado`;
        } 
        else if (data.code === 'UNDERAGE_USER' || data.error?.includes('mayor de 18 años')) {
          // ✅ EDAD: Mostrar mensaje específico de validación
          errorMessage = '🚫 No puedes realizar esta compra: Debes ser mayor de 18 años para comprar productos con alcohol.';
        }
        else if (data.code === 'MISSING_BIRTHDATE' || data.error?.includes('fecha de nacimiento')) {
          // ✅ VALIDACIÓN: Mostrar mensaje específico
          errorMessage = '📅 Fecha de nacimiento requerida: Por favor completa todos los campos obligatorios.';
        }
        else if (data.code === 'TERMS_NOT_ACCEPTED' || data.error?.includes('términos')) {
          // ✅ TÉRMINOS: Mostrar mensaje específico
          errorMessage = '✅ Debes aceptar todos los términos y condiciones para continuar.';
        }
        else if (response.status === 400) {
          // ✅ TARJETA/PAGO: Mensaje genérico por seguridad
          if (data.error?.includes('rechazado') || data.error?.includes('rejected')) {
            errorMessage = '💳 Pago rechazado. Por favor verifica tus datos o intenta con otro método de pago.';
          } else {
            errorMessage = '⚠️ Hay un problema con los datos enviados. Por favor revisa la información e intenta nuevamente.';
          }
        } 
        else if (response.status === 401) {
          errorMessage = '🔐 Sesión expirada. Por favor recarga la página e intenta nuevamente.';
        } 
        else if (response.status === 403) {
          errorMessage = '🚫 Acceso denegado. Por favor contacta al soporte si el problema persiste.';
        } 
        else if (response.status === 404) {
          errorMessage = '❌ Servicio no disponible temporalmente. Intenta más tarde.';
        } 
        else if (response.status === 500) {
          errorMessage = '🔧 Error temporal del servidor. Por favor intenta en unos minutos.';
        } 
        else if (response.status === 502 || response.status === 503) {
          errorMessage = '⏰ Servicio temporalmente no disponible. Intenta en unos minutos.';
        }
        else {
          // Error genérico para códigos desconocidos
          errorMessage = '❌ Error inesperado. Por favor contacta al soporte si el problema persiste.';
        }
        
        throw new Error(errorMessage);
      }

      // Handle different payment statuses
      if (data.status === 'approved') {
        setProcessingError(null);
        setStatusMsg(`¡Pago procesado correctamente! ID: ${data.id}`);
        if (onSuccess) onSuccess(data);
        
        // Notifica al contenedor del iframe antes de redirigir
        try {
          if (window.parent !== window) {
            logInfo("Notificando al contenedor sobre redirección exitosa");
            window.parent.postMessage({
              type: 'MP_PAYMENT_SUCCESS',
              redirectUrl: successUrl,
              paymentData: data
            }, '*');
            
            // Delay para asegurar que el mensaje llegue al contenedor
            setTimeout(() => {
              if (successUrl) window.top.location.href = successUrl;
            }, 500);
          } else if (successUrl) {
            window.location.href = successUrl;
          }
        } catch (e) {
          logError("Error al comunicarse con el contenedor:", e);
          // Fallback a la redirección directa
          if (successUrl) window.location.href = successUrl;
        }
      } 
      else if (data.status === 'in_process' || data.status === 'pending') {
        setStatusMsg(`Pago en proceso. ID: ${data.id}`);
        if (onSuccess) onSuccess(data);
        
        try {
          if (window.parent !== window) {
            logInfo("Notificando al contenedor de Framer sobre redirección a pendiente");
            window.parent.postMessage({
              type: 'MP_PAYMENT_PENDING',
              redirectUrl: pendingUrl,
              paymentData: data
            }, '*');
            
            setTimeout(() => {
              if (pendingUrl) window.top.location.href = pendingUrl;
            }, 500);
          } else if (pendingUrl) {
            window.location.href = pendingUrl;
          }
        } catch (e) {
          logWarning("Error al comunicarse con el contenedor:", e);
          if (pendingUrl) window.location.href = pendingUrl;
        }
      } 
      else if (data.status === 'rejected') {
        // Rejected case - payment was rejected
        setProcessingError(data.message || 'El pago fue rechazado');
        if (onError) onError(new Error(data.message || 'El pago fue rechazado'));
        if (failureUrl) window.location.href = failureUrl;
      } 
      else if (data.error) {
        // Error case
        throw new Error(data.error);
      }

    } catch (error) {
      logError("Error procesando el pago en hook:", error);
      
      // ✅ MEJORADO: Manejo específico de errores de validación
      let errMsg;
      
      if (error.name === 'AbortError') {
        errMsg = 'El tiempo de espera para el pago se ha excedido. Inténtelo de nuevo.';
      } else if (error.message.includes('Cannot read properties')) {
        errMsg = 'Error de configuración en el servidor. Por favor contacte al administrador.';
      } else if (error.message.includes('Debes ser mayor de 18 años')) {
        errMsg = '🚫 No puedes realizar esta compra: Debes ser mayor de 18 años para comprar productos con alcohol.';
      } else if (error.message.includes('Debe proporcionar su fecha de nacimiento')) {
        errMsg = '📅 Fecha de nacimiento requerida: Por favor ingresa tu fecha de nacimiento para continuar.';
      } else if (error.message.includes('Error al validar la fecha de nacimiento')) {
        errMsg = '📅 Fecha inválida: Por favor verifica que la fecha de nacimiento sea correcta.';
      } else if (error.message.includes('Debes aceptar todos los términos')) {
        errMsg = '✅ Términos pendientes: Debes aceptar todos los términos y condiciones para continuar.';
      } else if (error.message.includes('Stock insuficiente')) {
        errMsg = `📦 ${error.message}. Por favor reduce la cantidad o elige otros productos.`;
      } else if (error.message.includes('El monto mínimo para pagos')) {
        errMsg = error.message;
      } else if (error.message.includes('Error con el proveedor de pagos')) {
        errMsg = error.message;
      } else {
        errMsg = `Error: ${error.message || 'Error desconocido al procesar pago'}`;
      }
      
      setProcessingError(errMsg);
      setStatusMsg('');
      
      if (onError) {
        onError(new Error(errMsg));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  async function submitPayment({ token, paymentMethodId, issuerId, installments }) {
    try {
      // ...existing code to build payload...
      const payload = {
        formData: {
          token,
          paymentMethodId,
          issuerId,
          installments,
        },
        isMultipleOrder: Array.isArray(orderSummary) && orderSummary.length > 0,
        orderSummary: orderSummary || null,
        productId: productId || null,
        quantity: quantity || 1,
        totalAmount,
        userData,
        successUrl,
        pendingUrl,
        failureUrl,
        hostUrl,
        displayMode, // <-- CRÍTICO: que llegue al backend
      };

      const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      // ...existing code...
    } catch (error) {
      // ...existing code...
    }
  }

  return { handleSubmit, isProcessing, processingError, statusMsg };
}