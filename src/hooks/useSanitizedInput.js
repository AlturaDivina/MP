import { useCallback } from 'react';
import {
  sanitizeInput as secureSanitizeInput,
  sanitizeAddress,
  sanitizeName,
  sanitizePhone,
  sanitizeEmail,
} from '../utils/security';

export default function useSanitizedInput() {
  const sanitize = useCallback((value, type = 'text', maxLength = 200) => {
    switch (type) {
      case 'name':
        return sanitizeName(value, Math.min(maxLength, 100));
      case 'address':
        return sanitizeAddress(value, Math.min(maxLength, 200));
      case 'email':
        return sanitizeEmail(value);
      case 'phone':
        return sanitizePhone(value);
      case 'text':
      default:
        return secureSanitizeInput(value, maxLength);
    }
  }, []);

  return { sanitize };
}