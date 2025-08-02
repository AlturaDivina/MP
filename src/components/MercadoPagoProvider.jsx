'use client';

import { useState, useEffect, useCallback } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import styles from '../styles/MercadoPagoProvider.module.css';
import '../styles/mercadopago-globals.css';
import ClientOnly from './ClientOnly';
import { useHydration } from '../hooks/useHydration';
import { cn } from '../lib/utils';
import { logInfo, logError, logWarn } from '../lib/logger';

// Función para sanitizar datos de entrada (actualizada)
function sanitizeInput(value, type) {
  switch(type) {
    case 'productId':
      return typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value) 
        ? value 
        : 'default-product-id';
        
    case 'quantity':
      const qty = parseInt(value);
      const MAX_SAFE_QTY = 100000; 
      return !isNaN(qty) && qty > 0 && qty <= MAX_SAFE_QTY ? qty : 1;
      
    case 'url':
      if (typeof value !== 'string') return '';
      try {
        const url = new URL(value, window.location.origin);
        return url.toString();
      } catch (e) {
        logError("URL inválida:", value);
        return '';
      }
        
    case 'email':
      return typeof value === 'string' && 
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
        ? value
        : 'cliente@example.com';
        
    default:
      return value;
  }
}

export default function MercadoPagoProvider({
  productId,
  quantity = 1,
  totalAmount = null,
  orderSummary = null,
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
  const isHydrated = useHydration();
  
  const [loading, setLoading] = useState(true);
  const [displayError, setDisplayError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [productData, setProductData] = useState(null);
  const [isFetchingProduct, setIsFetchingProduct] = useState(false);
  const [preferenceId, setPreferenceId] = useState(null);

  const sanitizedProductId = sanitizeInput(productId, 'productId');
  const sanitizedQuantity = sanitizeInput(quantity, 'quantity');

  useEffect(() => {
    if (!isHydrated) return;
    
    if (publicKey) {
      initMercadoPago(publicKey);
    } else {
      const configError = 'Error de configuración: Falta la clave pública.';
      logError('MercadoPagoProvider requires a publicKey prop.');
      setDisplayError(configError);
      setLoading(false);
    }
  }, [publicKey, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    
    if (orderSummary?.length > 0 && !displayError && !preferenceId && !isSubmitting) {
      createPreference();
    }
  }, [orderSummary, displayError, preferenceId, isSubmitting, isHydrated]);

  const fetchProduct = useCallback(async () => {
    if (!isHydrated) return;
    
    if (orderSummary && orderSummary.length > 0) {
      logInfo('Usando datos de múltiples productos desde orderSummary:', orderSummary);
      setProductData({ id: 'multiple-products', name: 'Múltiples productos', price: 0 });
      setLoading(false);
      setAttemptCount(0);
      return;
    }

    if (!sanitizedProductId) {
      setDisplayError('Falta el ID del producto');
      setLoading(false);
      return;
    }

    if (!apiBaseUrl) {
      setDisplayError('Falta la URL base de la API para obtener el producto');
      setLoading(false);
      return;
    }

    setIsFetchingProduct(true);
    setDisplayError(null);
    setLoading(true);

    try {
      const productUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/products/${sanitizedProductId}`;
      if (process.env.NODE_ENV === 'development') {
        logInfo('Fetching specific product from:', productUrl);
      }
      
      const response = await fetch(productUrl);
      if (!response.ok) {
        throw new Error(`Error ${response.status}: No se pudo obtener el producto`);
      }
      const productInfo = await response.json();
      if (process.env.NODE_ENV === 'development') {
        logInfo('Product fetched successfully:', productInfo);
      }
      setProductData(productInfo);
      setAttemptCount(0);
    } catch (err) {
      logError('Error obteniendo producto:', err);
      setDisplayError(`Error al cargar datos del producto: ${err.message}`);
      setAttemptCount(prev => prev + 1);
      if (onError) onError(err);
    } finally {
      setLoading(false);
      setIsFetchingProduct(false);
    }
  }, [apiBaseUrl, sanitizedProductId, orderSummary, onError, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    fetchProduct();
  }, [fetchProduct, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    
    if (productData && orderSummary?.length > 0 && !displayError && !preferenceId && !isSubmitting) {
      createPreference();
    }
  }, [productData, orderSummary, displayError, preferenceId, isSubmitting, isHydrated]);

  const createPreference = async () => {
    if (!orderSummary || orderSummary.length === 0) {
      setDisplayError("No hay productos para procesar");
      return;
    }
    
    setIsSubmitting(true);
    setStatusMsg('Generando formulario de pago...');
    
    try {
      const fullSuccessUrl = successUrl || `${window.location.origin}/success`;
      const fullPendingUrl = pendingUrl || `${window.location.origin}/pending`;
      const fullFailureUrl = failureUrl || `${window.location.origin}/failure`;
      
      logInfo("Enviando solicitud de preferencia con URLs:", {
        successUrl: fullSuccessUrl,
        pendingUrl: fullPendingUrl,
        failureUrl: fullFailureUrl
      });
      
      const response = await fetch(`${apiBaseUrl}/api/create-preference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderSummary,
          successUrl: fullSuccessUrl,
          pendingUrl: fullPendingUrl,
          failureUrl: fullFailureUrl
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        logError("Error creando preferencia:", data);
        throw new Error(data.error || `Error del servidor: ${response.status}`);
      }
      
      logInfo("Preferencia creada:", data);
      
      setPreferenceId(data.preferenceId);
      setIsSubmitting(false);
      setStatusMsg('');
      
    } catch (error) {
      logError("Error creando preferencia:", error);
      setDisplayError(`Error: ${error.message || 'Error desconocido'}`);
      setIsSubmitting(false);
      setStatusMsg('');
      if (onError) onError(error);
    }
  };

  async function getCsrfToken() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/csrf-token`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch CSRF token: ${response.status}`);
      }
      
      const data = await response.json();
      return data.csrfToken;
    } catch (error) {
      logError("Error fetching CSRF token:", error);
      throw error;
    }
  }

  const handleSubmit = async (formData) => {
    if (!isHydrated) return;
    
    try {
      const csrfToken = await getCsrfToken();
      
      if (isSubmitting || (!productData && (!orderSummary || orderSummary.length === 0))) {
        logInfo("No hay datos de producto para procesar");
        return;
      }

      if (process.env.NODE_ENV === 'development') {
        logInfo("FormData original recibido del SDK:", formData);
      }
      
      const tokenFromForm = formData.token || formData.formData?.token;
      const paymentMethodFromForm = formData.payment_method_id || formData.formData?.payment_method_id;
      
      if (!tokenFromForm || !paymentMethodFromForm) {
        logError("Campos críticos faltantes en formData:", { 
          formDataRecibido: formData,
          hasToken: !!tokenFromForm, 
          hasPaymentMethodId: !!paymentMethodFromForm 
        });
        setDisplayError("Datos de pago incompletos. Por favor intente nuevamente.");
        return;
      }

      setIsSubmitting(true);
      setStatusMsg('Procesando pago...');
      setDisplayError(null);

      const finalAmount = orderSummary 
        ? orderSummary.reduce((total, item) => total + (item.price * item.quantity), 0)
        : (productData?.price || 0) * sanitizedQuantity;

      const backendPayload = {
        paymentType: formData.paymentType || "credit_card",
        selectedPaymentMethod: formData.selectedPaymentMethod || "credit_card",
        formData: {
          token: tokenFromForm,
          payment_method_id: paymentMethodFromForm,
          issuer_id: formData.issuer_id || formData.formData?.issuer_id || '',
          installments: parseInt(formData.installments || formData.formData?.installments || 1),
          payer: {
            email: formData.payer?.email || formData.formData?.payer?.email || 'cliente@example.com'
          },
        },
        ...(orderSummary ? {} : { productId: sanitizedProductId, quantity: sanitizedQuantity }),
        isMultipleOrder: orderSummary ? true : false,
        orderSummary: orderSummary,
        totalAmount: finalAmount
      };

      logInfo("Payload enviado al backend:", backendPayload);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      logInfo("Enviando solicitud al backend...");
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/process-payment`, {
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
      
      logInfo("Respuesta recibida del backend, status:", response.status);
      
      const data = await response.json();
      logInfo("Datos recibidos del backend:", data);

      if (data.error) {
        throw new Error(`Error en el pago: ${data.error}`);
      }

      setIsSubmitting(false);
      setStatusMsg(`¡Pago procesado correctamente! ID: ${data.id}`);
      const displayAmount = data.formattedAmount || data.amount.toLocaleString('es-MX');
      logInfo(`Monto pagado: $${displayAmount}`);
      
      if (onSuccess) onSuccess(data);
      
      if (successUrl) {
        window.location.href = successUrl;
      }
      
    } catch (error) {
      logError("Error procesando el pago:", error);
      setDisplayError(`Error: ${error.name === 'AbortError' ? 'Tiempo de espera excedido' : error.message || 'Error desconocido'}`);
      setIsSubmitting(false);
      setStatusMsg('');
      if (onError) onError(error);
      
      if (failureUrl) {
        setTimeout(() => {
          window.location.href = failureUrl;
        }, 1500);
      }
    }
  };

  const handleError = (err) => {
    logError("Error en Payment Brick:", err);
    setDisplayError('Error: No se pudo inicializar el formulario de pago.');
    setIsSubmitting(false);
    if (process.env.NODE_ENV === 'development') {
      logError('Detalles del error del Payment Brick:', err);
    }
    if (onError) onError(err);
  };

  const handleReady = () => {
    // Optional: Clear status message or set a 'ready' message
  };

  useEffect(() => {
    if (!isHydrated) return;
    
    const timer = setTimeout(() => {
      const container = document.getElementById('paymentBrick_container');
      if (container) {
        logInfo('Contenedor de pago encontrado y listo');
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isHydrated]);

  if (!isHydrated) {
    return (
      <div className={cn(styles.loading, className)} data-hydrating="true">
        <div className={styles.spinner}></div>
        <p>Preparando formulario de pago...</p>
      </div>
    );
  }

  if (loading && !productData) {
    return (
      <div className={cn(styles.loading, className)} data-hydrated="true">
        <div className={styles.spinner}></div>
        <p>Preparando formulario de pago...</p>
      </div>
    );
  }

  if (!productData && displayError) {
    return (
      <div className={cn(styles.errorContainer, className)} data-hydrated="true">
        <p className={styles.errorMessage}>{displayError}</p>
        {attemptCount < 5 && (
          <button
            className={styles.retryButton}
            onClick={fetchProduct}
            disabled={isFetchingProduct}
          >
            {isFetchingProduct ? 'Reintentando...' : 'Reintentar'}
          </button>
        )}
        {attemptCount >= 5 && <p>Demasiados intentos fallidos.</p>}
      </div>
    );
  }

  const price = productData?.price || 0;
  const finalTotalAmount = totalAmount !== null ? 
    totalAmount : 
    price * sanitizedQuantity;

  return (
    <div className={cn(styles.paymentFormContainer, className)} data-hydrated="true">
      {statusMsg && <p className={styles.statusMessage}>{statusMsg}</p>}
      {displayError && !isFetchingProduct && <p className={styles.errorMessage}>{displayError}</p>}
      
      <ClientOnly fallback={
        <div className={styles.loadingPreference}>
          <div className={styles.spinner}></div>
          <p>Preparando formulario de pago...</p>
        </div>
      }>
        {preferenceId ? (
          <Payment
            key={`payment-${preferenceId}`}
            initialization={{
              amount: finalTotalAmount,
              preferenceId: preferenceId,
              mercadoPago: publicKey
            }}
            customization={{
              visual: { 
                hideFormTitle: false, 
                hidePaymentButton: false,
                style: {
                  theme: 'default',
                  customVariables: {
                    baseColor: '#F26F32',
                    errorColor: '#e74c3c',      
                    formBackgroundColor: '#FFFFFF', 
                    inputBackgroundColor: '#FFFFFF',
                    inputBorderColor: '#CCCCCC',
                    buttonTextColor: '#FFFFFF',
                    buttonBackground: '#F26F32', 
                    elementsColor: '#F26F32',
                    borderRadiusLarge: '4px',
                    borderRadiusMedium: '4px',
                    borderRadiusSmall: '4px'
                  }
                }
              },
              paymentMethods: { 
                creditCard: 'all', 
                debitCard: 'all' 
              }
            }}
            onSubmit={handleSubmit}
            onReady={handleReady}
            onError={handleError}
          />
        ) : (
          <div className={styles.loadingPreference}>
            {isSubmitting ? (
              <>
                <div className={styles.spinner}></div>
                <p>Generando formulario de pago...</p>
              </>
            ) : (
              <p>Preparando formulario...</p>
            )}
          </div>
        )}
      </ClientOnly>
    </div>
  );
}
