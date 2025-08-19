import { useState } from 'react';
import { logError } from '../utils/logger';
import { normalizeDisplayMode } from '../lib/validation';

export function useCustomerSave() {
  const [saving, setSaving] = useState(false);

  const saveCustomer = async (data, rawDisplayMode) => {
    if (saving) return { success: true, message: "Ya se está procesando" };
    setSaving(true);

    try {
      const displayMode = normalizeDisplayMode(rawDisplayMode)
      const payload =
        displayMode === 'family'
          ? {
              displayMode,
              fullName: data.fullName,
              email: data.email,
              phone: data.phone,
            }
          : {
              displayMode,
              ...data,
            }

      const res = await fetch('/api/save-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
      if (!res.ok) {
        const info = await res.json()
        const error = new Error('Error al guardar los datos del cliente')
        error.info = info
        error.status = res.status
        throw error
      }
      return await res.json()
    } catch (error) {
      logError('Error en useCustomerSave:', error);
      return { success: false, error: error.message };
    } finally {
      setSaving(false);
    }
  };

  return { saveCustomer, saving };
}