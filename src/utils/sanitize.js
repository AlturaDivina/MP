// Importa al inicio y evita colisión con alias
import {
  sanitizeInput as secureSanitizeInput,
  sanitizeAddress,
  sanitizeName,
  sanitizePhone,
  sanitizeEmail,
} from './security';

// Basic input sanitization functions

/**
 * Sanitizes a string to prevent XSS attacks
 * This is a very basic implementation. For production, use a dedicated library.
 * @param {string} input - The string to sanitize
 * @returns {string} - The sanitized string
 */
export function sanitizeString(input) {
  if (typeof input !== 'string') return '';
  // En SSR no hay document; hacer fallback seguro
  if (typeof document === 'undefined') {
    return String(input);
  }
  const div = document.createElement('div');
  div.textContent = input;
  return div.textContent;
}

/**
 * Sanitizes input based on expected type
 * @param {*} value - The value to sanitize
 * @param {string} type - The expected type ('string', 'number', 'integer', 'email', etc.)
 * @returns {*} - The sanitized value
 */
export function sanitizeInput(value, type) {
  if (value === null || value === undefined) {
    if (type === 'string' || type === 'email' || type === 'url' || type === 'productId') return '';
    if (type === 'number' || type === 'integer' || type === 'quantity') return 0;
    if (type === 'boolean') return false;
    return null;
  }

  switch (type) {
    case 'string':
      return String(value).trim();

    case 'productId': // Allow alphanumeric and hyphens for IDs
      return String(value).replace(/[^a-zA-Z0-9-]/g, '').trim();

    case 'number':
      return parseFloat(value);

    case 'integer':
    case 'quantity': {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    }

    case 'boolean':
      return Boolean(value);

    case 'email': {
      const email = String(value).trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return email;
      }
      return '';
    }

    case 'url':
      try {
        const url = new URL(String(value));
        if (['http:', 'https:'].includes(url.protocol)) {
          return url.toString();
        }
        return '';
      } catch (_) {
        return '';
      }

    default:
      return value;
  }
}

// Reexporta funciones de seguridad SIN re-declarar "sanitizeInput" (usa alias)
export { secureSanitizeInput, sanitizeAddress, sanitizeName, sanitizePhone, sanitizeEmail };

// Aliases comunes usados por formularios (usan el sanitizador seguro que preserva espacios)
export const sanitizeText = (value, maxLength = 1000) => secureSanitizeInput(value, maxLength);
export const sanitizeCity = (value, maxLength = 100) => sanitizeAddress(value, maxLength);
export const sanitizeState = (value, maxLength = 100) => sanitizeAddress(value, maxLength);
export const sanitizeStreet = (value, maxLength = 200) => sanitizeAddress(value, maxLength);