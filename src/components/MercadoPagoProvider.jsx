import React, { useState, useEffect, useRef } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import cn from 'classnames';
import styles from '../styles/MercadoPagoProvider.module.css';
import '../styles/mercadopago-globals.css'; 
import { logInfo, logError } from '../utils/logger';
import { sanitizeInput } from '../utils/sanitize';
import { normalizeDisplayMode } from '../lib/validation';

import { useMercadoPagoSdk } from '../hooks/useMercadoPagoSdk';
import { useMercadoPagoPreference } from '../hooks/useMercadoPagoPreference';
import { useMercadoPagoBrickSubmit } from '../hooks/useMercadoPagoBrickSubmit';

// Asegúrate de tener una sola instancia de MP
export default function MercadoPagoProvider(props) {
  const {
    productId,
    quantity = 1,
    totalAmount = null,
    orderSummary = null,
    discountCode = '',
    discountAmount = 0,
    shippingDiscountPercent = 0,
    userData,
    publicKey,
    apiBaseUrl,
    successUrl,
    pendingUrl,
    failureUrl,
    onSuccess: onSuccessCallback = () => {},
    onError: onErrorCallback = () => {},
    className = '',
    containerStyles = {},
    hideTitle = false,
    displayMode: rawDisplayMode,
  } = props

  const hostUrl = process.env.NEXT_PUBLIC_HOST_URL || 'http://localhost:3000';

  const displayMode = normalizeDisplayMode(rawDisplayMode);

  // ✅ Restore SDK state (needed by preference hook, UI and <Payment/>)
  const { sdkReady, sdkError, mercadoPagoSdkInstance } = useMercadoPagoSdk(publicKey);

  const payerMinimal =
    displayMode === 'family'
      ? {
          name: (userData?.first_name || userData?.fullName || '').toString(),
          email: userData?.email || '',
          phone: userData?.phone ? { number: String(userData.phone) } : undefined,
        }
      : undefined

  const { preferenceId, isLoadingPreference, preferenceError } = useMercadoPagoPreference({
    orderSummary,
    userData,
    apiBaseUrl,
    successUrl,
    pendingUrl,
    failureUrl,
    hostUrl,
    isSdkReady: sdkReady,
    displayMode,
    payerOverride: payerMinimal,
  });

  // Calcular total COMPLETO (subtotal - descuentos + envío - descuento envío)
  const subtotalProducts = totalAmount !== null && totalAmount !== undefined
    ? Number(totalAmount) 
    : (orderSummary && Array.isArray(orderSummary) && orderSummary.length > 0
        ? orderSummary.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0)
        : 0);

  logInfo('🧮 [MercadoPagoProvider] Cálculo de subtotal:', {
    totalAmountProp: totalAmount,
    orderSummary: orderSummary,
    subtotalProducts: subtotalProducts
  });

  const SHIPPING_FEE = 200;
  const discountAmt = Number(discountAmount || 0);
  const shipDiscPct = Math.max(0, Math.min(100, Number(shippingDiscountPercent || 0)));
  const shippingDiscount = Math.round((SHIPPING_FEE * (shipDiscPct / 100)) * 100) / 100;
  // ⚠️ CRÍTICO: Redondear a 2 decimales para evitar errores de precisión
  const finalTotal = Math.round(Math.max(1, subtotalProducts - discountAmt + (SHIPPING_FEE - shippingDiscount)) * 100) / 100;

  logInfo('🧮 [MercadoPagoProvider] Cálculo del total final:', {
    subtotalProducts: subtotalProducts,
    discountAmt: discountAmt,
    SHIPPING_FEE: SHIPPING_FEE,
    shipDiscPct: shipDiscPct,
    shippingDiscount: shippingDiscount,
    finalTotal: finalTotal,
    formula: `${subtotalProducts} - ${discountAmt} + (${SHIPPING_FEE} - ${shippingDiscount}) = ${finalTotal}`
  });

  const { 
    handleSubmit: processPayment, 
    isProcessing, 
    processingError: submitError, 
    statusMsg: submitStatusMsg 
  } = useMercadoPagoBrickSubmit({
    apiBaseUrl,
    orderSummary,
    productId,
    quantity,
    totalAmount: finalTotal,
    userData,
    discountCode,
    discountAmount,
    shippingDiscountPercent,
    onSuccess: onSuccessCallback,
    onError: onErrorCallback,
    successUrl,
    pendingUrl,
    failureUrl,
    hostUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    displayMode,
  });

  const mpRef = useRef(null);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.MercadoPago && process.env.NEXT_PUBLIC_MP_PUBLIC_KEY) {
        mpRef.current = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY, {
          locale: 'es-MX',
        });
        logInfo('SDK de MercadoPago inicializado correctamente');
      }
    } catch (e) {
      logError('Error inicializando MercadoPago:', e);
    }
  }, []);

  const initBrick = async ({ containerId, preferenceId, initialization = {}, customization = {}, callbacks = {} }) => {
    if (!mpRef.current) {
      logError('MercadoPago no inicializado');
      return;
    }
    const bricksBuilder = mpRef.current.bricks();

    // Si usas preferenceId, MP exige pasar mercadoPago (cuando se usa API global)
    // bricksBuilder.create ya está ligado a mpRef.current, pero algunos bundles requieren prop explícita:
    const options = {
      initialization: {
        ...initialization,
        // Si usas preferenceId, inclúyelo aquí
        ...(preferenceId ? { preferenceId } : {}),
      },
      customization,
      callbacks,
      // Fuerza la referencia explícita del objeto MP para evitar el error de consola
      mercadoPago: mpRef.current,
    };

    await bricksBuilder.create('payment', containerId, options);
  };

  const [displayError, setDisplayError] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  // Nueva info de redirección (solo se llena cuando YA se conoce el status definitivo o intermedio)
  const [redirectInfo, setRedirectInfo] = useState({ status: null, url: null });

  useEffect(() => {
    if (sdkError) setDisplayError(sdkError);
    else if (preferenceError) setDisplayError(preferenceError);
    else if (submitError) setDisplayError(submitError);
    else setDisplayError(null);
  }, [sdkError, preferenceError, submitError]);

  useEffect(() => {
    if (submitStatusMsg) setStatusMsg(submitStatusMsg);
    else if (isLoadingPreference) setStatusMsg('Generando formulario de pago...');
    else if (isProcessing) setStatusMsg('Procesando pago...');
    else setStatusMsg('');
  }, [submitStatusMsg, isLoadingPreference, isProcessing]);

  // Usa colores fijos en la configuración visual
  const paymentCustomization = {
    visual: {
      hideFormTitle: hideTitle,
      hidePaymentButton: false,
      style: {
        theme: 'default',
        colors: {
          primary: '#F26F32',
          secondary: '#E5E5E5',
          error: '#e74c3c',
          background: '#FFFFFF',
          text: '#333333'
        },
        borderRadius: '4px'
      }
    },
    paymentMethods: {
      creditCard: 'all',
      debitCard: 'all'
    }
  };

  useEffect(() => {
    // Send ready message to parent when loaded
    if (window.parent !== window) {
      window.parent.postMessage({ 
        type: 'MP_COMPONENT_READY',
        status: 'ready'
      }, '*');
    }
    
    // Listen for messages from parent
    const handleMessage = (event) => {
      // Only process messages from trusted domains
      if (!event.origin.includes('framer.com') && !event.origin.includes('framer.app')) {
        return;
      }
      
      if (event.data.type === 'MP_CREATE_PREFERENCE') {
        // Trigger preference creation
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Escucha eventos internos de decisión de redirección (emitidos por el hook o por handleSuccess)
  useEffect(() => {
    const localListener = (e) => {
      if (!e || !e.detail) return;
      const { status, redirectUrl } = e.detail;
      if (status && redirectUrl) {
        setRedirectInfo({ status, url: redirectUrl });
      }
    };
    window.addEventListener('MP_REDIRECT_DECIDED', localListener);
    return () => window.removeEventListener('MP_REDIRECT_DECIDED', localListener);
  }, []);

  // Error handler for Payment component
  const handleError = (err) => {
    logError("Error en Payment:", err);
    setDisplayError('Error: No se pudo inicializar el formulario de pago.');
    if (process.env.NODE_ENV === 'development') {
      logError('Detalles del error de Payment:', err);
    }
    onErrorCallback(err);
  };

  // Ready handler for Payment component
  const handleReady = () => {
    logInfo('Payment está listo.');
  };

  // Success handler for Payment component
  const handleSuccess = (data) => {
    logInfo("Pago exitoso:", data);

    // Mapear status_detail a mensaje y URL
    const statusDetail = data.status_detail || '';
    const status = data.status || '';
    let redirectUrl = failureUrl; // Default a failure por seguridad
    let userMessage = 'Resultado del pago: ';

    // Decisión basada en status y status_detail
    if (status === 'approved') {
      redirectUrl = successUrl;
      userMessage = 'Pago aprobado y acreditado.';
    }
    else if (status === 'pending' || status === 'in_process') {
      redirectUrl = pendingUrl; 
      userMessage = 'Pago en proceso de validación.';
    }
    else {
      // Si llegamos aquí, el pago fue rechazado o tuvo algún problema
      redirectUrl = failureUrl;
      
      // Determinar mensaje específico según status_detail
      switch (statusDetail) {
        // CASOS DE TARJETAS DE CRÉDITO/DÉBITO RECHAZADAS
        case 'cc_rejected_bad_filled_card_number':
          userMessage += 'Número de tarjeta mal ingresado.';
          break;
        case 'cc_rejected_bad_filled_date':
          userMessage += 'Fecha de vencimiento incorrecta.';
          break;
        case 'cc_rejected_bad_filled_security_code':
          userMessage += 'Código de seguridad incorrecto.';
          break;
        case 'cc_rejected_bad_filled_other':
          userMessage += 'Error en los datos ingresados.';
          break;
        case 'cc_rejected_high_risk':
          userMessage += 'Pago rechazado por seguridad.';
          break;
        case 'cc_rejected_blacklist':
          userMessage += 'La tarjeta se encuentra bloqueada.';
          break;
        case 'cc_rejected_insufficient_amount':
          userMessage += 'Fondos insuficientes.';
          break;
        case 'cc_rejected_max_attempts':
          userMessage += 'Excedió el límite de intentos permitidos.';
          break;
        case 'cc_rejected_call_for_authorize':
          userMessage += 'Debe autorizar el pago con su banco.';
          break;
        case 'cc_rejected_duplicated_payment':
          userMessage += 'Pago duplicado detectado.';
          break;
        case 'cc_rejected_card_disabled':
          userMessage += 'Tarjeta deshabilitada temporalmente.';
          break;
          
        // CASOS ESPECÍFICOS DE PAGOS PENDIENTES
        case 'pending_contingency':
          redirectUrl = pendingUrl;
          userMessage = 'El pago está en proceso de revisión.';
          break;
        case 'pending_review_manual':
          redirectUrl = pendingUrl;
          userMessage = 'El pago está siendo revisado manualmente.';
          break;
        case 'pending_waiting_payment':
          redirectUrl = pendingUrl;
          userMessage = 'Esperando que realice el pago.';
          break;
          
        // OTROS ESTADOS
        case 'accredited':
          redirectUrl = successUrl;
          userMessage = 'Pago acreditado.';
          break;
        case 'authorized':
          redirectUrl = successUrl;
          userMessage = 'Pago autorizado.';
          break;
        case 'in_mediation':
          userMessage = 'El pago está en mediación o disputa.';
          break;
        case 'cancelled':
          userMessage = 'El pago fue cancelado.';
          break;
        case 'refunded':
          userMessage = 'El pago fue devuelto.';
          break;
        case 'charged_back':
          userMessage = 'El pago tuvo un contracargo.';
          break;
          
        default:
          userMessage = `El pago no pudo completarse (${statusDetail || status}).`;
          break;
      }
    }

    // Mostrar mensaje (puedes usar un toast, modal, etc)
    alert(userMessage);

    // Guardar estado de redirección (para mostrar link sólo cuando se conoce el status)
    try {
      window.dispatchEvent(new CustomEvent('MP_REDIRECT_DECIDED', { detail: { status: status || 'unknown', redirectUrl } }));
    } catch (e) {
      logError('Error dispatching MP_REDIRECT_DECIDED event', e);
    }

    // Redirigir
    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }

    if (onSuccessCallback) {
      onSuccessCallback(data);
    }
  };
  
  // Overall loading state
  const isLoading = !sdkReady || isLoadingPreference;

  if (isLoading && !preferenceId) {
    return (
      <div className={cn(styles.loading, className)} style={containerStyles}>
        <div className={styles.spinner}></div>
        <p>{sdkError ? 'Error de configuración.' : 'Preparando formulario de pago...'}</p>
      </div>
    );
  }

  if (displayError && !isProcessing) {
    return (
      <div className={cn(styles.errorContainer, className)} style={containerStyles}>
        <p className={styles.errorMessage}>{displayError}</p>
      </div>
    );
  }
  
  return (
    <div className={cn(styles.paymentFormContainer, className)} style={containerStyles}>
      {statusMsg && <p className={styles.statusMessage}>{statusMsg}</p>}
      {isProcessing && displayError && <p className={styles.errorMessage}>{displayError}</p>}
      
      {preferenceId && sdkReady ? (
        <Payment
          key={`payment-${preferenceId}`}
          initialization={{
            amount: finalTotal,
            preferenceId: preferenceId,
            mercadoPago: mercadoPagoSdkInstance || window.MercadoPago
          }}
          customization={paymentCustomization}
          onSubmit={processPayment}
          onReady={handleReady}
          onError={handleError}
          onSuccess={handleSuccess}
        />
      ) : (
        <div className={styles.loadingPreference}>
          {isLoadingPreference || !sdkReady ? (
            <>
              <div className={styles.spinner}></div>
              <p>Cargando formulario de pago...</p>
            </>
          ) : (
            <p>Error al preparar el formulario. Verifique la configuración.</p>
          )}
        </div>
      )}
      {/* Link de fallback SOLO aparece cuando ya conocemos el status y la URL correcta */}
      {redirectInfo.status && redirectInfo.url && (
        <div className={styles.redirectMessage}>
          <p>
            Redirigiendo a la página de {redirectInfo.status === 'approved' ? 'éxito' : (redirectInfo.status === 'pending' || redirectInfo.status === 'in_process') ? 'estado pendiente' : (redirectInfo.status === 'rejected' ? 'pago rechazado' : 'resultado')}...{' '}
            Si no eres redirigido automáticamente,{' '}
            <a
              href={redirectInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.redirectLink}
            >haz clic aquí</a>.
          </p>
        </div>
      )}
    </div>
  );
}
