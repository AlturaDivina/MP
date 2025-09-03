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

// Normalizador básico de estados US (entrada libre a código de 2 letras)
const US_STATE_MAP = {
  'alabama':'AL','al':'AL','alaska':'AK','ak':'AK','arizona':'AZ','az':'AZ','arkansas':'AR','ar':'AR',
  'california':'CA','ca':'CA','colorado':'CO','co':'CO','connecticut':'CT','ct':'CT','delaware':'DE','de':'DE',
  'florida':'FL','fl':'FL','georgia':'GA','ga':'GA','hawaii':'HI','hi':'HI','idaho':'ID','id':'ID',
  'illinois':'IL','il':'IL','indiana':'IN','in':'IN','iowa':'IA','ia':'IA','kansas':'KS','ks':'KS',
  'kentucky':'KY','ky':'KY','louisiana':'LA','la':'LA','maine':'ME','me':'ME','maryland':'MD','md':'MD',
  'massachusetts':'MA','ma':'MA','michigan':'MI','mi':'MI','minnesota':'MN','mn':'MN','mississippi':'MS','ms':'MS',
  'missouri':'MO','mo':'MO','montana':'MT','mt':'MT','nebraska':'NE','ne':'NE','nevada':'NV','nv':'NV',
  'new hampshire':'NH','nh':'NH','new jersey':'NJ','nj':'NJ','new mexico':'NM','nm':'NM','new york':'NY','ny':'NY',
  'north carolina':'NC','nc':'NC','north dakota':'ND','nd':'ND','ohio':'OH','oh':'OH','oklahoma':'OK','ok':'OK',
  'oregon':'OR','or':'OR','pennsylvania':'PA','pa':'PA','rhode island':'RI','ri':'RI','south carolina':'SC','sc':'SC',
  'south dakota':'SD','sd':'SD','tennessee':'TN','tn':'TN','texas':'TX','tx':'TX','utah':'UT','ut':'UT',
  'vermont':'VT','vt':'VT','virginia':'VA','va':'VA','washington':'WA','wa':'WA','west virginia':'WV','wv':'WV',
  'wisconsin':'WI','wi':'WI','wyoming':'WY','wy':'WY'
};

export function normalizeUSState(input){
  if(!input) return '';
  const key = String(input).trim().toLowerCase();
  return US_STATE_MAP[key] || input.toUpperCase().slice(0,2);
}
