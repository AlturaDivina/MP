import { useState, useCallback } from 'react';
import { sanitizeName, sanitizeAddress, sanitizePhone, sanitizeEmail, sanitizeInput } from '../utils/security';

export function useSanitizedInput(initialValue = '', type = 'text', maxLength = 100) {
  const [value, setValue] = useState(initialValue);
  
  const setSanitizedValue = useCallback((newValue) => {
    let sanitized;
    
    switch (type) {
      case 'name':
        sanitized = sanitizeName(newValue, maxLength);
        break;
      case 'address':
        sanitized = sanitizeAddress(newValue, maxLength);
        break;
      case 'phone':
        sanitized = sanitizePhone(newValue);
        break;
      case 'email':
        sanitized = sanitizeEmail(newValue);
        break;
      default:
        sanitized = sanitizeInput(newValue, maxLength);
    }
    
    setValue(sanitized);
  }, [type, maxLength]);
  
  return [value, setSanitizedValue];
}