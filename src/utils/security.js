/**
 * Utilidades de seguridad para el procesamiento de datos
 */

/**
 * Sanitiza una entrada eliminando caracteres potencialmente peligrosos
 * y truncando para evitar desbordamientos
 * 
 * @param {string|object|array} input - Entrada a sanitizar
 * @param {number} maxLength - Longitud máxima permitida (por defecto 1000)
 * @returns {string|object|array} - Entrada sanitizada
 */
export function sanitizeInput(input, maxLength = 1000) {
  const str = String(input ?? '');
  const cleaned = str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // elimina caracteres claramente peligrosos pero conserva espacios
    .replace(/[<>`$]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned;
}

/**
 * Sanitiza una cadena eliminando caracteres potencialmente peligrosos
 * 
 * @param {string} str - Cadena a sanitizar
 * @param {number} maxLength - Longitud máxima permitida
 * @returns {string} - Cadena sanitizada
 */
function sanitizeString(str, maxLength) {
  if (typeof str !== 'string') {
    return str;
  }

  // Truncar si es demasiado largo
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }

  // Eliminar scripts y elementos HTML potencialmente peligrosos
  str = str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<img[^>]*>/gi, '[imagen]')
    .replace(/<[^>]*>/g, ''); // Eliminar todas las etiquetas HTML restantes

  return str;
}

/**
 * Valida que una entrada solo contenga caracteres alfanuméricos y algunos especiales permitidos
 * 
 * @param {string} input - Entrada a validar
 * @param {boolean} allowSpecial - Si se permiten caracteres especiales
 * @returns {boolean} - Si la entrada es válida
 */
export function validateAlphanumeric(input, allowSpecial = false) {
  if (typeof input !== 'string') return false;
  
  const pattern = allowSpecial 
    ? /^[a-zA-Z0-9 _.,-@()[\]{}|:;!?'"#$%&/=+*]*$/
    : /^[a-zA-Z0-9 _.-]*$/;
  
  return pattern.test(input);
}

/**
 * Función específica para nombres (más restrictiva)
 */
export function sanitizeName(value, maxLength = 100) {
  const str = String(value ?? '');
  const cleaned = str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // letras, espacios, guión y apóstrofo
    .replace(/[^A-Za-zÀ-ÿ\u00f1\u00d1\s\-']/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned;
}

/**
 * Función específica para direcciones
 */
export function sanitizeAddress(value, maxLength = 200) {
  const str = String(value ?? '');
  const cleaned = str
    .normalize('NFKC')
    // elimina caracteres de control
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // whitelist: letras (incluye acentos y ñ), números, espacios y puntuación típica de direcciones
    // . , - # ° / \ '
    .replace(/[^0-9A-Za-zÀ-ÿ\u00f1\u00d1\s\.,\-#°/\\']/g, '')
    // colapsa espacios múltiples
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned;
}

/**
 * Función específica para teléfonos
 */
export function sanitizePhone(input) {
  if (typeof input !== 'string') return '';
  
  // Solo permitir números, espacios, guiones, paréntesis y signo +
  return input.replace(/[^0-9\s\-\(\)\+]/g, '').trim();
}

/**
 * Función específica para emails
 */
export function sanitizeEmail(input) {
  if (typeof input !== 'string') return '';
  
  // Patrón básico para email (más permisivo)
  return input.replace(/[<>'"]/g, '').trim().toLowerCase();
}

/**
 * Variantes para escritura: preservan espacios finales (no usan .trim())
 */
export function sanitizeInputTyping(input, maxLength = 1000) {
  const str = String(input ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>`$]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // sin trim
}

export function sanitizeNameTyping(value, maxLength = 100) {
  const str = String(value ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^A-Za-zÀ-ÿ\u00f1\u00d1\s\-']/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // sin trim
}

export function sanitizeAddressTyping(value, maxLength = 200) {
  const str = String(value ?? '');
  return str
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // whitelist con espacios permitidos (\s). El \ en la clase permite la barra invertida literal.
    .replace(/[^0-9A-Za-zÀ-ÿ\u00f1\u00d1\s\.,\-#°/\\']/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength); // sin trim
}

/**
 * Exportar otras funciones de seguridad según sea necesario
 */