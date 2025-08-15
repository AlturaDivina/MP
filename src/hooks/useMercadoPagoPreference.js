import { useState, useEffect, useCallback } from 'react';
import { logInfo, logError } from '../utils/logger';
import { normalizeDisplayMode } from '../lib/validation'

// Helper to get CSRF token if needed
async function getCsrfToken() {
  try {
    const response = await fetch('/api/csrf-token');
    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }
    const data = await response.json();
    return data.csrfToken;
  } catch (error) {
    logError("Error fetching CSRF token:", error);
    return null; // Continue without token in development
  }
}

export function useMercadoPagoPreference({
  orderSummary,
  userData,
  apiBaseUrl,
  successUrl,
  pendingUrl,
  failureUrl,
  hostUrl, // e.g., process.env.NEXT_PUBLIC_HOST_URL
  isSdkReady,
  displayMode: rawDisplayMode,       // <-- agregar
  payerOverride = undefined,         // <-- agregar
}) {
  const displayMode = normalizeDisplayMode(rawDisplayMode)
  const [preferenceId, setPreferenceId] = useState(null);
  const [isLoadingPreference, setIsLoadingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState(null);

  const createPreference = useCallback(async () => {
    if (!isSdkReady || !orderSummary || orderSummary.length === 0) {
      if (orderSummary && orderSummary.length === 0) {
        setPreferenceError("No hay productos para procesar.");
      }
      return;
    }

    setIsLoadingPreference(true);
    setPreferenceError(null);
    setPreferenceId(null);

    try {
      // Asegurar URLs (ya estaban calculadas arriba)
      const finalSuccessUrl = successUrl || "https://alturadivina.com/confirmacion-de-compra";
      const finalFailureUrl = failureUrl || "https://alturadivina.com/error-de-compra";
      const finalPendingUrl = pendingUrl || "https://alturadivina.com/proceso-de-compra";

      // Derivar customer minimal solo si familyFriends
      const customer =
        displayMode === 'familyFriends' && userData
          ? {
              fullName: userData.fullName,
              email: userData.email,
              phone: userData.phone,
            }
          : undefined

      const body = {
        orderSummary,
        payer: userData,                // se mantiene para compatibilidad
        successUrl: finalSuccessUrl,
        pendingUrl: finalPendingUrl,
        failureUrl: finalFailureUrl,
        displayMode,
        customer,                       // solo si FF
        payerOverride,                  // si viene del Provider
        metadata: { displayMode },
      }

      const adjustedApiUrl = apiBaseUrl.includes('localhost')
        ? apiBaseUrl.replace('https://', 'http://')
        : apiBaseUrl;

      const response = await fetch(`${adjustedApiUrl.replace(/\/$/, '')}/api/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        logError("Error creando preferencia:", data);
        throw new Error(data.error || `Error del servidor: ${response.status}`);
      }

      setPreferenceId(data.preferenceId);
    } catch (error) {
      logError("Error creando preferencia en hook:", error);
      setPreferenceError(`Error: ${error.message || 'Error desconocido al crear preferencia'}`);
    } finally {
      setIsLoadingPreference(false);
    }
  }, [
    isSdkReady,
    orderSummary,
    userData,
    apiBaseUrl,
    successUrl,
    pendingUrl,
    failureUrl,
    displayMode,
    payerOverride,
  ]);

  useEffect(() => {
    if (isSdkReady && orderSummary && orderSummary.length > 0 && !preferenceId && !isLoadingPreference) {
      createPreference();
    }
  }, [isSdkReady, orderSummary, preferenceId, isLoadingPreference, createPreference]);

  return { preferenceId, isLoadingPreference, preferenceError, createPreference };
}