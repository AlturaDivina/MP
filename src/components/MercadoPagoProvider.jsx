'use client';

import { useState, useEffect } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import styles from '../styles/MercadoPagoProvider.module.css';
import { cn } from '../lib/utils'; // Import the utility

// Función para sanitizar datos de entrada (sin cambios)
function sanitizeInput(value, type) {
  if (type === 'productId') {
    return typeof value === 'string' ? value.trim() : null;
  }
  if (type === 'quantity') {
    const num = parseInt(value, 10);
    return !isNaN(num) && num > 0 ? num : 1;
  }
  return value;
}

export default function MercadoPagoProvider({
  productId,
  quantity = 1,
  price, // <-- Añade la prop price
  publicKey,
  apiBaseUrl,
  successUrl,
  pendingUrl,
  failureUrl,
  onSuccess = () => {},
  onError = () => {},
  className = '',
  containerStyles = {},
  hideTitle = false,
}) {
  const [displayError, setDisplayError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const sanitizedProductId = sanitizeInput(productId, 'productId');
  const sanitizedQuantity = sanitizeInput(quantity, 'quantity');
  const sanitizedPrice = typeof price === 'number' && price > 0 ? price : 0; // Sanitiza el precio recibido

  useEffect(() => {
    if (publicKey) {
      initMercadoPago(publicKey);
      setDisplayError(null); // Limpia errores si la clave pública está presente
    } else {
      const configError = 'Error de configuración: Falta la clave pública.';
      console.error('MercadoPagoProvider requires a publicKey prop.');
      setDisplayError(configError);
    }
  }, [publicKey]);

  const handleSubmit = async (formData) => {
    if (isSubmitting) return;

    // --- LOG PARA DEBUG EN VERCEL ---
    console.log('FormData received from Payment Brick:', JSON.stringify(formData, null, 2));
    // ---------------------------------

    setIsSubmitting(true);
    setStatusMsg('Procesando pago...');
    setDisplayError(null);

    let redirectUrl = failureUrl;

    try {
      const paymentEndpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/process-payment`;
      // El backend ya valida el precio usando productId y quantity
      const backendPayload = {
        formData: formData, // Pasamos formData directamente
        productId: sanitizedProductId,
        quantity: sanitizedQuantity,
      };

      // Añade transaction_amount al payload que va al backend,
      // usando el precio que recibimos como prop.
      // El backend lo usará para la validación cruzada con KV.
      backendPayload.formData.transaction_amount = sanitizedPrice * sanitizedQuantity;


      if (process.env.NODE_ENV === 'development') {
        console.log('Sending payment data to:', paymentEndpoint);
        console.log('Payload:', JSON.stringify(backendPayload, null, 2));
      }

      const response = await fetch(paymentEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendPayload),
      });

      if (response.ok) {
        const data = await response.json();
        setStatusMsg('¡Pago procesado!');
        if (onSuccess) onSuccess(data);

        switch (data.status) {
          case 'approved': redirectUrl = successUrl; break;
          case 'in_process':
          case 'pending': redirectUrl = pendingUrl; break;
          default: redirectUrl = failureUrl; break;
        }
      } else {
        let backendErrorMsg = 'Hubo un problema al procesar tu pago. Inténtalo de nuevo.';
        try {
          const errorData = await response.json();
          backendErrorMsg = errorData.error || backendErrorMsg;
          if (process.env.NODE_ENV === 'development') {
            console.error('Error en proceso de pago (backend response):', errorData);
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error en proceso de pago (backend response not JSON):', await response.text());
          }
        }
        setDisplayError(backendErrorMsg);
        redirectUrl = failureUrl; // Asegura redirección a fallo
      }
    } catch (e) {
      console.error('Error en handleSubmit:', e);
      setDisplayError('No se pudo completar el pago. Inténtalo nuevamente.');
      if (onError) onError(e);
      redirectUrl = failureUrl; // Asegura redirección a fallo en error de fetch
    } finally {
      setIsSubmitting(false);
      if (redirectUrl) {
        // Añade un pequeño retraso antes de redirigir para que el usuario vea el mensaje final
        setStatusMsg(redirectUrl === successUrl ? 'Pago aprobado. Redirigiendo...' : (redirectUrl === pendingUrl ? 'Pago pendiente. Redirigiendo...' : 'Pago fallido. Redirigiendo...'));
        setTimeout(() => { window.location.href = redirectUrl; }, 2000); // Aumenta el tiempo si es necesario
      }
    }
  };


  const handleError = (err) => {
    console.error("Error en Payment Brick:", err);
    // Muestra un error más genérico al usuario
    setDisplayError('Error: No se pudo inicializar el formulario de pago. Revisa los datos o intenta más tarde.');
    setIsSubmitting(false); // Asegúrate de que no esté bloqueado
    if (process.env.NODE_ENV === 'development') {
      console.error('Detalles del error del Payment Brick:', err);
    }
    if (onError) onError(err);
  };

  const handleReady = () => {
    // Opcional: Limpiar mensaje de estado o indicar que está listo
    // setStatusMsg('Formulario listo.');
  };

  // Verifica si falta la clave pública o el precio
   if (!publicKey) {
    return (
      <div className={cn(styles.errorContainer, className)}>
        <p className={styles.errorMessage}>{displayError || 'Error de configuración.'}</p>
      </div>
    );
  }

   if (sanitizedPrice <= 0) {
     return (
       <div className={cn(styles.errorContainer, className)}>
         <p className={styles.errorMessage}>Error: El precio del producto no es válido.</p>
       </div>
     );
   }


  // Calcula el monto total usando el precio de la prop
  const totalAmount = sanitizedPrice * sanitizedQuantity;

  // Configuración para el Payment Brick
  const initialization = { amount: totalAmount };
  const customization = {
    visual: { hideFormTitle: false, hidePaymentButton: false },
    paymentMethods: { creditCard: 'all', debitCard: 'all' }, // Ajusta según necesites
  };

  return (
    <div className={cn(styles.paymentFormContainer, className)} style={containerStyles}>
      {!hideTitle && <h3 className={styles.paymentTitle}>Completa tu Pago</h3>}
      {/* Muestra el total calculado */}
      <div className={styles.totalAmountDisplay}>
        Total a Pagar: ${totalAmount.toFixed(2)}
      </div>
      {statusMsg && <p className={styles.statusMessage}>{statusMsg}</p>}
      {displayError && <p className={styles.errorMessage}>{displayError}</p>}
      {/* Renderiza el Payment Brick */}
      <Payment
        key={sanitizedProductId} // Usa productId para forzar reinicialización si cambia
        initialization={initialization}
        customization={customization}
        onSubmit={handleSubmit}
        onReady={handleReady}
        onError={handleError}
      />
    </div>
  );
}