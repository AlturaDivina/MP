/**
 * Utilidades de seguridad para el procesamiento de datos
 */

/**
 * Sanitiza una entrada genérica
 */
export function sanitizeInput(input, maxLength = 1000) {
  const str = String(input ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '') // quita caracteres de control
    .replace(/[<>`$]/g, '')                // quita símbolos peligrosos
    .replace(/\s{2,}/g, ' ')               // colapsa espacios múltiples
    .slice(0, maxLength);                  // 👈 ya no usamos trim()
}

/**
 * Sanitiza string plano
 */
function sanitizeString(str, maxLength) {
  if (typeof str !== 'string') return str;
  if (str.length > maxLength) str = str.substring(0, maxLength);

  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<img[^>]*>/gi, '[imagen]')
    .replace(/<[^>]*>/g, '');
}

/**
 * Valida alfanumérico
 */
export function validateAlphanumeric(input, allowSpecial = false) {
  if (typeof input !== 'string') return false;

  const pattern = allowSpecial
    ? /^[a-zA-Z0-9 _.,-@()[\]{}|:;!?'"#$%&/=+*]*$/
    : /^[a-zA-Z0-9 _.-]*$/;

  return pattern.test(input);
}

/**
 * Nombres (letras, espacios, acentos, ñ, guión/apóstrofo)
 */
export function sanitizeName(value, maxLength = 100) {
  const str = String(value ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^A-Za-zÀ-ÿ\u00f1\u00d1\s\-']/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // 👈 sin trim
}

/**
 * Direcciones (acepta letras, números, espacios, acentos y símbolos típicos . , - # ° / \ ')
 */
export function sanitizeAddress(value, maxLength = 200) {
  const str = String(value ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^0-9A-Za-zÀ-ÿ\u00f1\u00d1\s\.,\-#°/\\']/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // 👈 sin trim
}

/**
 * Teléfonos (dígitos, espacios, +, (), -)
 */
export function sanitizePhone(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[^0-9\s\-\(\)\+]/g, '').slice(0, 20); // 👈 conserva espacios
}

/**
 * Email (permitimos espacios internos, pero se limpian al normalizar)
 */
export function sanitizeEmail(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>'"]/g, '').toLowerCase();
}

/**
 * Variantes typing (permiten espacios al escribir)
 */
export function sanitizeInputTyping(input, maxLength = 1000) {
  const str = String(input ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>`$]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // 👈 sin trim
}

export function sanitizeNameTyping(value, maxLength = 100) {
  const str = String(value ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^A-Za-zÀ-ÿ\u00f1\u00d1\s\-']/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // 👈 sin trim
}

/**
 * Variante typing para direcciones
 */
export function sanitizeAddressTyping(value, maxLength = 200) {
  const str = String(value ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^0-9A-Za-zÀ-ÿ\u00f1\u00d1\s\.,\-#°/\\']/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // 👈 sin trim
}
