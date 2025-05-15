import { useState, useEffect } from 'react';
import { initMercadoPago } from '@mercadopago/sdk-react';
import { logInfo, logError } from '../utils/logger';

/**
 * Hook para inicializar y gestionar el SDK de MercadoPago
 * @param {string} publicKey - La clave pública de MercadoPago
 * @returns {Object} - Estado del SDK: {sdkReady, sdkError}
 */
export function useMercadoPagoSdk(publicKey) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [mercadoPagoInstance, setMercadoPagoInstance] = useState(null);

  useEffect(() => {
    // Función para inicializar el SDK
    const initializeSdk = async () => {
      if (!publicKey) {
        const error = 'Error de configuración: Falta la clave pública de MercadoPago.';
        logError(error);
        setSdkError(error);
        return;
      }

      try {
        // En la versión 1.0.3, initMercadoPago devuelve una instancia que debemos guardar
        const mp = await initMercadoPago(publicKey);
        setMercadoPagoInstance(mp);
        setSdkReady(true);
        setSdkError(null);
        logInfo('SDK de MercadoPago inicializado correctamente');
      } catch (error) {
        logError('Error al inicializar SDK de MercadoPago:', error);
        setSdkError(`Error al inicializar MercadoPago: ${error.message}`);
      }
    };

    initializeSdk();

    // Limpieza (opcional si el SDK requiere alguna limpieza)
    return () => {
      logInfo('Limpiando SDK de MercadoPago');
      // Aquí podrías añadir código de limpieza si es necesario
    };
  }, [publicKey]);

  return { sdkReady, sdkError, mercadoPagoInstance };
}