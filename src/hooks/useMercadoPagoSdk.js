import { useState, useEffect } from 'react';
import { initMercadoPago } from '@mercadopago/sdk-react';
import { logInfo, logError } from '../utils/logger';

/**
 * Hook para inicializar y gestionar el SDK de MercadoPago
 * @param {string} publicKey - La clave pública de MercadoPago
 * @returns {Object} - Estado del SDK: {sdkReady, sdkError}
 */
export function useMercadoPagoSdk(publicKey) {
  console.log("useMercadoPagoSdk initialized with key:", publicKey);
  const finalPublicKey = publicKey || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [mercadoPagoInstance, setMercadoPagoInstance] = useState(null);
  const [hasInitialized, setHasInitialized] = useState(false); // Add this line

  useEffect(() => {
    if (!finalPublicKey) {
      setSdkError('Error de configuración: Falta la clave pública de MercadoPago.');
      return;
    }

    if (hasInitialized) return; // Add this line to prevent multiple initializations

    try {
      setHasInitialized(true); // Mark as initialized
      initMercadoPago(finalPublicKey);

      // Add a small delay to ensure SDK is loaded
      setTimeout(() => {
        if (window.MercadoPago) {
          try {
            const mp = new window.MercadoPago(finalPublicKey);
            setMercadoPagoInstance(mp);
            setSdkReady(true);
          } catch (err) {
            console.error("Failed to create MercadoPago instance:", err);
            setSdkError(`Error al crear instancia: ${err.message}`);
          }
        } else {
          setSdkError('No se pudo cargar el SDK de MercadoPago.');
        }
      }, 500);
    } catch (err) {
      console.error("Failed to initialize MercadoPago:", err);
      setSdkError(`Error al inicializar MercadoPago: ${err.message}`);
    }
  }, [finalPublicKey, hasInitialized]);

  return { sdkReady, sdkError, mercadoPagoInstance };
}