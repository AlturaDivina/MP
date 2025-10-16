import { z } from 'zod';
import { logSecurityEvent } from './security-logger';
import { logInfo, logError } from '../utils/logger';
import { sanitizeInput } from '../utils/security';

// Esquema para datos de pago
export const PaymentSchema = z.object({
  paymentType: z.string().min(1).default('credit_card'),
  selectedPaymentMethod: z.string().min(1).default('credit_card'),
  formData: z.object({
    token: z.string().min(8),
    payment_method_id: z.string().min(1),
    issuer_id: z.string().optional().default(''),
    installments: z.number().int().positive().default(1),
    payer: z.object({
      email: z.string().email().default('cliente@example.com')
    })
  }),
  productId: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  isMultipleOrder: z.boolean().default(false),
  orderSummary: z.array(
    z.object({
      productId: z.string().min(1),
      name: z.string().min(1),
      quantity: z.number().int().positive(),
      price: z.number().positive(),
      total: z.number().positive()
    })
  ).optional(),
  totalAmount: z.number().positive()
});

// Validador que registra errores
export function validatePaymentData(data) {
  try {
    const result = PaymentSchema.safeParse(data);
    
    if (!result.success) {
      // Registrar los errores de validación
      logSecurityEvent('payment_validation_error', {
        errors: result.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      }, 'warn');
      
      return {
        valid: false,
        errors: result.error.errors,
        data: null
      };
    }
    
    return {
      valid: true,
      errors: null,
      data: result.data
    };
  } catch (error) {
    logSecurityEvent('validation_system_error', {
      message: error.message
    }, 'error');
    
    return {
      valid: false,
      errors: [{ message: 'Error interno de validación' }],
      data: null
    };
  }
}

/**
 * Valida el cuerpo de la solicitud de procesamiento de pago
 * @param {Object} body - Datos de la solicitud de procesamiento de pago
 * @returns {Object} - Resultado de la validación {data, error}
 */
export function validatePaymentRequestBody(body) {
  try {
    const b = body || {};

    // Normalize/flatten formData
    const rawForm = b.formData && typeof b.formData === 'object' ? b.formData : {};
    const innerForm = rawForm.formData && typeof rawForm.formData === 'object' ? rawForm.formData : {};
    const formData = { ...rawForm, ...innerForm };

    // Normalize paymentType presence
    const paymentType =
      b.paymentType ||
      formData.paymentType ||
      formData.payment_type_id || // MP naming
      null;

    if (!paymentType) {
      return { error: { error: 'El tipo de pago es requerido', idempotencyKey: b.idempotencyKey } };
    }

    // Normalize booleans and totals
    const isMultipleOrder = !!b.isMultipleOrder;
    const orderSummary = Array.isArray(b.orderSummary) ? b.orderSummary : [];
    const productId = b.productId ?? null;
    const quantity = b.quantity ?? null;
    const totalAmount = Number(b.totalAmount ?? 0);
    const userData = b.userData || {};
  const displayMode = b.displayMode || formData.displayMode || 'full';
  const discountCode = b.discountCode || formData.discountCode || null;

    return {
      data: {
        paymentType,
        formData,
        isMultipleOrder,
        orderSummary,
        productId,
        quantity,
        totalAmount,
        userData,
        displayMode,
        discountCode
      }
    };
  } catch (e) {
    return { error: { error: 'Cuerpo de solicitud inválido', details: e.message } };
  }
}

/**
 * Extrae los datos del instrumento de pago del objeto formData
 * @param {Object} formData - Datos del formulario de pago
 * @returns {Object} - Datos del instrumento de pago extraídos
 */
export function extractPaymentInstrumentData(formData) {
  const fd = formData || {};

  const token =
    fd.token ||
    fd.cardToken ||
    null;

  const paymentMethodId =
    fd.payment_method_id ||
    fd.paymentMethodId ||
    fd.selectedPaymentMethod || // fallback from UI
    null;

  const issuerId =
    fd.issuer_id ||
    fd.issuerId ||
    null;

  const installments =
    fd.installments != null ? Number(fd.installments) : 1;

  const payerEmail =
    fd.payer?.email ||
    fd.email ||
    null;

  if (!token) return { error: 'token ausente' };
  if (!paymentMethodId) return { error: 'paymentMethodId ausente' };

  return { token, paymentMethodId, issuerId, installments, payerEmail };
}

/**
 * Valida la estructura y datos de un producto
 * @param {Object} product - Datos del producto
 * @returns {boolean} - Si el producto es válido
 */
export function validateProduct(product) {
  if (!product) return false;
  if (!product.id && !product.productId) return false;
  if (!product.quantity || isNaN(parseInt(product.quantity))) return false;
  
  return true;
}

export function normalizeDisplayMode(mode) {
  if (!mode) return 'full';
  const m = String(mode).trim().toLowerCase();

  const map = {
    full: 'full',
    carticononly: 'cartIconOnly',
    'cart-icon-only': 'cartIconOnly',
    paymentflowonly: 'paymentFlowOnly',
    'payment-flow-only': 'paymentFlowOnly',
    sidebaronly: 'sidebarOnly',
    'sidebar-only': 'sidebarOnly',
    // Simplificado: usar "family" como clave única
    family: 'family',
    familyfriends: 'family',
    'family-friends': 'family',
    ff: 'family',
  };

  return map[m] || 'full';
}

export function validateCustomerByMode(mode, data) {
  const m = normalizeDisplayMode(mode)
  if (m !== 'family') {
    // No validar para otros modos (mantiene full intacto)
    return { valid: true, errors: {} }
  }

  const errors = {}
  // Aceptar ya sea nombre completo O nombre y apellido separados
  const hasFullName = !!(data?.fullName) && String(data.fullName).trim().length >= 2
  const hasFirst = !!(data?.first_name) && String(data.first_name).trim().length >= 1
  const hasLast = !!(data?.last_name) && String(data.last_name).trim().length >= 1
  const hasFirstLast = hasFirst && hasLast
  if (!hasFullName && !hasFirstLast) {
    // Proveer mensajes acordes al formulario de FF (nombre y apellido)
    if (!hasFirst) errors.first_name = 'Nombre es requerido'
    if (!hasLast) errors.last_name = 'Apellido es requerido'
    if (hasFirst || hasLast) {
      // Si alguno existe pero no ambos, evitar mensaje genérico de fullName
    } else {
      errors.fullName = 'Nombre completo es requerido'
    }
  }
  if (!data?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) {
    errors.email = 'Correo electrónico inválido'
  }
  if (!data?.phone || String(data.phone).trim().length < 5) {
    errors.phone = 'Teléfono es requerido'
  }
  return { valid: Object.keys(errors).length === 0, errors }
}