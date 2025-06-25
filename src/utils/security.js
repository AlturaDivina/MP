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
  if (input === null || input === undefined) {
    return input;
  }

  // Para objetos, sanitizar recursivamente cada propiedad
  if (typeof input === 'object' && !Array.isArray(input)) {
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(input)) {
      // Sanitizar las claves también
      const sanitizedKey = typeof key === 'string' 
        ? sanitizeString(key, 100) 
        : key;
      sanitizedObj[sanitizedKey] = sanitizeInput(value, maxLength);
    }
    return sanitizedObj;
  }

  // Para arrays, sanitizar cada elemento
  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item, maxLength));
  }

  // Para strings, aplicar sanitización de strings
  if (typeof input === 'string') {
    return sanitizeString(input, maxLength);
  }

  // Otros tipos (números, booleanos) se devuelven sin cambios
  return input;
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
export function sanitizeName(input, maxLength = 50) {
  if (typeof input !== 'string') return '';
  
  // Solo permitir letras, espacios, acentos y algunos caracteres especiales para nombres
  const namePattern = /^[a-zA-ZÀ-ÿ\u0100-\u017F\s'-\.]+$/;
  
  // Aplicar sanitización base primero
  let sanitized = sanitizeInput(input, maxLength);
  
  // Remover caracteres no permitidos en nombres
  sanitized = sanitized.replace(/[^a-zA-ZÀ-ÿ\u0100-\u017F\s'-\.]/g, '');
  
  return sanitized.trim();
}

/**
 * Función específica para direcciones
 */
export function sanitizeAddress(input, maxLength = 200) {
  if (typeof input !== 'string') return '';
  
  // Permitir caracteres alfanuméricos, espacios y algunos especiales para direcciones
  let sanitized = sanitizeInput(input, maxLength);
  
  // Remover caracteres peligrosos pero mantener los útiles para direcciones
  sanitized = sanitized.replace(/[^a-zA-Z0-9À-ÿ\u0100-\u017F\s'#\-\.,°º\/]/g, '');
  
  return sanitized.trim();
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
 * Exportar otras funciones de seguridad según sea necesario
 */