'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from '../styles/PaymentFlow.module.css';
import MercadoPagoProvider from './MercadoPagoProvider';
import { cn } from '../lib/utils';
import { logInfo, logError } from '../lib/logger';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import '../styles/mercadopago-globals.css';
import { useCart } from '../hooks/useCart';
import { useCustomerSave } from '../hooks/useCustomerSave';
import { sanitizeName, sanitizeAddress, sanitizePhone, sanitizeEmail, sanitizeInput } from '../utils/security';

/**
 * PaymentFlowUnified.jsx
 * - 1 sola pantalla con 4 pasos lógicos (Selección → Datos → Confirmación → Pago)
 * - Conserva TODOS los handlers, validaciones, logs y cálculos
 * - Paso 1: carrito arriba con pill de cantidad; productos abajo como 3 filas full-width
 */

const SHIPPING_FEE = 200;
const formatPrice = (price) =>
  Number(price).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentFlowUnified({
  apiBaseUrl,
  productsEndpoint = '/api/products',
  mercadoPagoPublicKey,
  PaymentProviderComponent = MercadoPagoProvider,
  successUrl,
  pendingUrl,
  failureUrl,
  onSuccess,
  onError,
  containerStyles = {},
  hideTitle = false,
  className = '',
  initialProductId = null,
  initialStep = 1,
}) {
  // === Guards ===
  if (!apiBaseUrl) {
    logError("PaymentFlow Error: 'apiBaseUrl' prop is required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Falta apiBaseUrl.</div>;
  }
  if (!mercadoPagoPublicKey) {
    logError("PaymentFlow Error: 'mercadoPagoPublicKey' prop is required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Falta mercadoPagoPublicKey.</div>;
  }
  if (!successUrl || !pendingUrl || !failureUrl) {
    logError("PaymentFlow Error: 'successUrl', 'pendingUrl', and 'failureUrl' props are required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Faltan URLs de redirección.</div>;
  }
  if (!PaymentProviderComponent) {
    logError("PaymentFlow Error: 'PaymentProviderComponent' prop is required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Falta PaymentProviderComponent.</div>;
  }

  // === State ===
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]); // compat con tu logging de pago
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(initialStep); // 1..4
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [paymentError, setPaymentError] = useState(null);

  const [userData, setUserData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    birth_date: '',
    isOver18: false,
    acceptsAlcoholTerms: false,
    acceptsShippingFee: false,
    identification: { type: 'DNI', number: '' },
    address: { street_name: '', street_number: '', zip_code: '', city: '', state: '', country: '' },
  });

  const { saveCustomer, saving: savingCustomer } = useCustomerSave();
  const { items, totalAmount, clearCart, addItem, updateQuantity, removeItem } = useCart();

  // === Totales ===
  const calculateSubtotal = () => totalAmount;
  const calculateTotalPrice = () => totalAmount + SHIPPING_FEE;
  const subtotalFmt = useMemo(() => `$${formatPrice(totalAmount)}`, [totalAmount]);
  const shippingFmt = useMemo(() => `$${formatPrice(SHIPPING_FEE)}`, []);
  const totalFmt = useMemo(() => `$${formatPrice(calculateTotalPrice())}`, [totalAmount]);

  // === Carga de productos (3 máx si solo tienes 3) ===
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const fullProductsUrl = `${apiBaseUrl.replace(/\/$/, '')}${productsEndpoint}`;
        const response = await fetch(fullProductsUrl);
        if (!response.ok) throw new Error('Error al cargar productos');
        const data = await response.json();
        setProducts(Array.isArray(data) ? data.slice(0, 3) : []);

        if (items.length > 0) {
          const firstCartItem = items[0];
          const productData = data.find((p) => p.id === firstCartItem.productId) || firstCartItem.product;
          setSelectedProducts([{ productId: productData?.id, product: productData, quantity: 1 }]);
        } else if (data.length > 0) {
          let initialProduct = data[0];
          if (initialProductId) {
            const found = data.find((p) => p.id === initialProductId);
            if (found) initialProduct = found;
          }
          setSelectedProducts([{ productId: initialProduct?.id, product: initialProduct, quantity: 1 }]);
        }
      } catch (e) {
        setError(e.message);
        onError && onError(e);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [apiBaseUrl, productsEndpoint, onError, initialProductId, items]);

  useEffect(() => () => { logInfo('Limpiando el flujo de pago (unificado)'); }, []);

  // === Helpers ===
  const inCart = (id) => items.some((it) => it.productId === id);
  const setQty = (productId, nextQty) => {
    const q = Number.isFinite(nextQty) ? Math.max(0, Math.floor(nextQty)) : 0;
    if (q <= 0) removeItem(productId);
    else updateQuantity(productId, q);
  };

  // === Handlers (tuyos) ===
  const handleContinueToConfirmation = () => {
    if (items.length === 0) {
      alert('Tu carrito está vacío. Agrega al menos un producto.');
      return;
    }
    setCurrentStep(2);
  };

  const handleContinueToOrderConfirmation = () => {
    const processedUserData = { ...userData };

    if (
      !processedUserData.first_name ||
      !processedUserData.last_name ||
      !processedUserData.email ||
      !processedUserData.phone ||
      !processedUserData.address?.street_name ||
      !processedUserData.address?.street_number ||
      !processedUserData.address?.zip_code ||
      !processedUserData.address?.city ||
      !processedUserData.address?.state ||
      !processedUserData.address?.country
    ) {
      alert('Por favor completa todos los campos, necesitamos estos datos para enviar tu producto');
      return;
    }

    if (!processedUserData.birth_date) {
      alert('Por favor ingresa tu fecha de nacimiento');
      return;
    }

    try {
      const birthDate = new Date(processedUserData.birth_date);
      const today = new Date();
      const age = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      if (isNaN(age) || age < 0 || age > 120) throw new Error('Fecha inválida');
      processedUserData.calculatedAge = age;
      processedUserData.isOver18 = age >= 18;
    } catch {
      alert('Error al validar la fecha de nacimiento. Por favor intenta de nuevo.');
      return;
    }

    if (processedUserData.phone)
      processedUserData.phone = String(processedUserData.phone).replace(/[^\d+]/g, '');

    setUserData(processedUserData);
    setCurrentStep(3);
  };

  const handleConfirmOrder = async () => {
    if (!userData.isOver18) {
      alert('🚫 Debes confirmar que eres mayor de 18 años para comprar productos con alcohol');
      return;
    }
    if (!userData.acceptsAlcoholTerms) {
      alert('✅ Debes aceptar los términos y condiciones para productos con alcohol');
      return;
    }
    if (!userData.acceptsShippingFee) {
      alert('📦 Debes aceptar el cargo de envío para continuar');
      return;
    }
    if (userData.calculatedAge && userData.calculatedAge < 18) {
      alert(
        '🚫 Lo sentimos, debes ser mayor de 18 años para realizar esta compra. Tu edad calculada es ' +
          userData.calculatedAge +
          ' años.'
      );
      return;
    }

    const hasStockIssues = items.some(() => false); // placeholder
    if (hasStockIssues) {
      alert('📦 Algunos productos no tienen suficiente stock disponible. Por favor revisa tu carrito.');
      return;
    }

    logInfo('====== ORDEN CONFIRMADA (Unificado) ======');
    logInfo(
      'Productos seleccionados:',
      items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      }))
    );
    logInfo('SUBTOTAL: $' + formatPrice(calculateSubtotal()));
    logInfo('FEE DE ENVÍO: $' + formatPrice(SHIPPING_FEE));
    logInfo('TOTAL A PAGAR: $' + formatPrice(calculateTotalPrice()));
    logInfo('==========================================');

    try {
      const orderData = {
        totalAmount: calculateTotalPrice(),
        items: items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
        })),
        userData,
        orderId: `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paymentStatus: 'pending',
      };
      // await saveCustomer(orderData)
      logInfo('Datos del cliente y orden listos para procesarse al confirmar pago');
    } catch (error) {
      logError('Error guardando cliente, pero continuando con el pago:', error);
    }

    setConfirmedOrder({
      products: items.map((item) => ({
        productId: item.productId,
        product: item,
        quantity: item.quantity,
      })),
      totalPrice: calculateTotalPrice(),
      userData,
    });
    setCurrentStep(4);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleCancel = () => {
    if (window.confirm('¿Seguro que deseas cancelar este pedido?')) {
      setCurrentStep(1);
      const initialProduct = initialProductId
        ? products.find((product) => product.id === initialProductId) || products[0]
        : products[0];
      setSelectedProducts(
        products.length > 0
          ? [{ productId: initialProduct?.id, product: initialProduct, quantity: 1 }]
          : []
      );
      setConfirmedOrder(null);
    }
  };

  const handlePaymentSuccess = (data) => {
    logInfo('====== PAGO EXITOSO ======');
    logInfo('Detalles de la transacción:', data);
    logInfo('Monto total:', formatPrice(calculateTotalPrice()));
    logInfo(
      'Productos:',
      (selectedProducts || []).map((p) => ({
        id: p.productId,
        nombre: p.product?.name,
        cantidad: p.quantity,
        precio: p.product?.price,
        subtotal: (p.product?.price || 0) * p.quantity,
      }))
    );
    logInfo('========================');
    clearCart();
    onSuccess && onSuccess(data);
  };

  const handlePaymentError = (error) => {
    logError('====== ERROR EN PAGO ======');
    logError('Detalle del error:', error);
    logError('Productos intentados:', items.map((p) => p.name).join(', '));
    logError('Monto total intentado:', formatPrice(calculateTotalPrice()));
    logError('===========================');

    if (error.message && typeof error.message === 'object' && error.message.type) {
      setPaymentError(error.message);
    } else {
      let userMessage = error.message;
      if (error.message?.includes('Stock insuficiente') || error.message?.includes('📦'))
        userMessage = error.message;
      else if (
        error.message?.includes('🚫') ||
        error.message?.includes('📅') ||
        error.message?.includes('✅')
      )
        userMessage = error.message;
      else if (error.message?.includes('💳') || error.message?.includes('rechazado'))
        userMessage =
          'El pago no pudo procesarse. Por favor verifica tus datos o intenta con otro método de pago.';
      else if (error.message?.includes('🔧') || error.message?.includes('⏰'))
        userMessage = error.message;
      else userMessage = 'Ocurrió un problema al procesar tu solicitud. Por favor intenta nuevamente.';
      alert(userMessage);
    }
    onError && onError(error);
  };

  const renderPaymentProvider = () => {
    if (!confirmedOrder || items.length === 0 || !mercadoPagoPublicKey) return null;
    return (
      <PaymentProviderComponent
        productId={items[0].productId}
        quantity={1}
        totalAmount={totalAmount} // Si quieres incluir envío en el cobro, cambia a: calculateTotalPrice()
        publicKey={mercadoPagoPublicKey}
        apiBaseUrl={apiBaseUrl}
        successUrl={successUrl}
        pendingUrl={pendingUrl}
        failureUrl={failureUrl}
        onSuccess={handlePaymentSuccess}
        onError={handlePaymentError}
        hideTitle={true}
        userData={confirmedOrder.userData}
        orderSummary={items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
        }))}
      />
    );
  };

  // === Sanitización ===
  const handleSecureInputChange = useCallback((field, value, sanitizeType = 'text', maxLength = 100) => {
    let sanitized;
    switch (sanitizeType) {
      case 'name':
        sanitized = sanitizeName(value, maxLength);
        break;
      case 'address':
        sanitized = sanitizeAddress(value, maxLength);
        break;
      case 'phone':
        sanitized = sanitizePhone(value);
        break;
      case 'email':
        sanitized = sanitizeEmail(value);
        break;
      default:
        sanitized = sanitizeInput(value, maxLength);
    }
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setUserData((prev) => ({ ...prev, [parent]: { ...(prev[parent] || {}), [child]: sanitized } }));
    } else {
      setUserData((prev) => ({ ...prev, [field]: sanitized }));
    }
  }, []);

  // === Loading & Error ===
  if (loading) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        <div className={styles['mp-loading']}>
          <div className={styles['mp-spinner']}></div>
          <p>Cargando productos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        <div className={styles['mp-error-container']}>
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className={styles['mp-button']}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        <div className={styles['mp-empty-state']}>
          <h2>No hay productos disponibles</h2>
          <p>Vuelve a intentarlo más tarde o contacta con el administrador.</p>
        </div>
      </div>
    );
  }

  // === UI unificada ===
  return (
    <div className={cn(styles['mp-container'], className)} style={{ ...containerStyles }}>
      {!hideTitle && <h2 className={styles['mp-page-title']}>Compra</h2>}

      {/* Paso 1: Selección (UI mínima) */}
      {currentStep === 1 && (
        <div className={styles['mp-product-selection-container']}>
          {/* Carrito arriba (compacto) */}
          <section style={ux.card}>
            <div style={ux.headerRow}>
              <h3 style={ux.title}>Tu Carrito</h3>
              {items.length > 0 && <span style={ux.counterBadge}>{items.length}</span>}
            </div>

            {items.length === 0 ? (
              <div style={ux.empty}>Aún no agregas productos. Usa la sección de abajo.</div>
            ) : (
              <>
                {items.map((item) => (
                  <div key={item.productId} style={ux.cartRow}>
                    <div style={ux.cartInfo}>
                      <div style={ux.cartName}>{item.name}</div>
                      <div style={ux.cartSub}>${formatPrice(item.price * item.quantity)}</div>
                    </div>

                    <QtyPill
                      qty={item.quantity}
                      onDec={() => setQty(item.productId, item.quantity - 1)}
                      onInc={() => setQty(item.productId, item.quantity + 1)}
                      onChange={(q) => setQty(item.productId, q)}
                    />
                  </div>
                ))}

                <div style={ux.totalsBox}>
                  <Line label="Subtotal productos:" value={subtotalFmt} />
                  <Line label="Cargo de envío:" value={shippingFmt} />
                  <Line label={<b>Total en Carrito:</b>} value={<b>{totalFmt}</b>} />
                </div>

                <div style={ux.actionsRow}>
                  <button className={cn(styles['mp-button'], styles['mp-secondary'])} onClick={clearCart}>
                    Vaciar Carrito
                  </button>
                  <button
                    className={cn(styles['mp-button'], styles['mp-primary'])}
                    onClick={handleContinueToConfirmation}
                    disabled={items.length === 0}
                  >
                    Continuar al Pago
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Productos abajo (3 filas full-width) */}
         <section style={{ marginTop: 16 }}>
  <h3 style={ux.subtitle}>Productos</h3>
  <div style={ux.list}>
    {products.map((p) => {
      const item = items.find((it) => it.productId === p.id);
      const inCart = Boolean(item);

      return (
        <div
          key={p.id}
          style={{ ...ux.productRow, ...(inCart ? ux.disabledRow : {}) }}
        >
          <div style={ux.pInfo}>
            <div style={ux.pName}>{p.name}</div>
            {p.description ? <div style={ux.pDesc}>{p.description}</div> : null}
            <div style={ux.pPrice}>${formatPrice(p.price)}</div>
          </div>

          <div style={ux.pRight}>
            {inCart ? (
              <span
                aria-label="Ya en carrito"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  background: '#f7f7f7',
                  color: '#6b7280',
                  fontSize: 12,
                  lineHeight: 1,
                  userSelect: 'none',
                  cursor: 'default',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginTop: 1 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Ya en carrito
              </span>
            ) : (
              <AddPill onAdd={() => addItem(p, 1)} />
            )}
          </div>
        </div>
      );
    })}
  </div>
</section>

        </div>
      )}

      {/* Paso 2: Datos del comprador (sin cambios) */}
      {currentStep === 2 && (
        <div className={styles['mp-form-container']}>
          <h2 className={styles['mp-page-title']}>DATOS DEL COMPRADOR</h2>

          <div className={styles['mp-form-section']}>
            <h3 className={styles['mp-form-section-title']}>Información Personal</h3>
            <p className={styles['mp-form-section-subtitle']}>
              Ingresa tus datos para completar la compra
            </p>

            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-email">
                EMAIL: <span className={styles['required']}>*</span>
              </label>
              <input
                id="mp-email"
                type="email"
                value={userData.email}
                onChange={(e) => handleSecureInputChange('email', e.target.value, 'email', 100)}
                className={styles['mp-text-input']}
                required
              />
            </div>

            <div className={styles['mp-form-row']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-first-name">
                  NOMBRE: <span className={styles['required']}>*</span>
                </label>
                <input
                  id="mp-first-name"
                  type="text"
                  value={userData.first_name}
                  onChange={(e) => handleSecureInputChange('first_name', e.target.value, 'name', 50)}
                  className={styles['mp-text-input']}
                  required
                />
              </div>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-last-name">
                  APELLIDO: <span className={styles['required']}>*</span>
                </label>
                <input
                  id="mp-last-name"
                  type="text"
                  value={userData.last_name}
                  onChange={(e) => handleSecureInputChange('last_name', e.target.value, 'name', 50)}
                  className={styles['mp-text-input']}
                  required
                />
              </div>
            </div>

            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-birth-date">
                FECHA DE NACIMIENTO: <span className={styles['required']}>*</span>
              </label>
              <input
                id="mp-birth-date"
                type="date"
                value={userData.birth_date}
                onChange={(e) => setUserData({ ...userData, birth_date: e.target.value })}
                className={styles['mp-text-input']}
                max={new Date(new Date().setFullYear(new Date().getFullYear() - 18))
                  .toISOString()
                  .split('T')[0]}
                required
              />
              <small className={styles['mp-form-help']}>
                Debes ser mayor de 18 años para realizar esta compra
              </small>
            </div>

            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-phone">
                TELÉFONO: <span className={styles['required']}>*</span>
              </label>
              {typeof window !== 'undefined' && (
                <PhoneInput
                  country={'mx'}
                  value={userData.phone || ''}
                  onChange={(value) => value && setUserData({ ...userData, phone: value.toString() })}
                  inputClass={styles['mp-phone-input']}
                  containerClass={styles['mp-phone-container']}
                  enableSearch={false}
                  disableSearchIcon={true}
                  preferredCountries={['mx', 'us', 'co', 'ar', 'pe', 'cl']}
                  placeholder="Número de teléfono"
                />
              )}
              <small className={styles['mp-form-help']}>
                Incluya código de país y solo números
              </small>
            </div>

            <div className={styles['mp-form-row']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-id-type">TIPO DE DOCUMENTO:</label>
                <select
                  id="mp-id-type"
                  value={userData.identification?.type || 'INE'}
                  onChange={(e) =>
                    setUserData({
                      ...userData,
                      identification: { ...(userData.identification || {}), type: e.target.value },
                    })
                  }
                  className={styles['mp-select-input']}
                >
                  <option value="INE">INE</option>
                  <option value="RFC">RFC</option>
                  <option value="PASAPORTE">PASAPORTE</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-id-number">NÚMERO DE DOCUMENTO:</label>
                <input
                  id="mp-id-number"
                  type="text"
                  value={userData.identification?.number || ''}
                  onChange={(e) =>
                    setUserData({
                      ...userData,
                      identification: { ...(userData.identification || {}), number: e.target.value },
                    })
                  }
                  className={styles['mp-text-input']}
                />
              </div>
            </div>
          </div>

          <div className={styles['mp-form-section']}>
            <h3 className={styles['mp-form-section-title']}>Dirección</h3>
            <p className={styles['mp-form-section-subtitle']}>
              Todos los campos son obligatorios para envío del producto
            </p>

            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-street">
                CALLE: <span className={styles['required']}>*</span>
              </label>
              <input
                id="mp-street"
                type="text"
                value={userData.address?.street_name || ''}
                onChange={(e) => handleSecureInputChange('address.street_name', e.target.value, 'address', 200)}
                className={styles['mp-text-input']}
              />
            </div>

            <div className={styles['mp-form-row']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-street-number">
                  NÚMERO: <span className={styles['required']}>*</span>
                </label>
                <input
                  id="mp-street-number"
                  type="text"
                  value={userData.address?.street_number || ''}
                  onChange={(e) =>
                    setUserData({
                      ...userData,
                      address: { ...(userData.address || {}), street_number: e.target.value },
                    })
                  }
                  className={styles['mp-text-input']}
                />
              </div>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-zip">
                  CÓDIGO POSTAL: <span className={styles['required']}>*</span>
                </label>
                <input
                  id="mp-zip"
                  type="text"
                  value={userData.address?.zip_code || ''}
                  onChange={(e) =>
                    setUserData({
                      ...userData,
                      address: { ...(userData.address || {}), zip_code: e.target.value },
                    })
                  }
                  className={styles['mp-text-input']}
                />
              </div>
            </div>

            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-city">
                CIUDAD: <span className={styles['required']}>*</span>
              </label>
              <input
                id="mp-city"
                type="text"
                value={userData.address?.city || ''}
                onChange={(e) => handleSecureInputChange('address.city', e.target.value, 'address', 100)}
                className={styles['mp-text-input']}
              />
            </div>

            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-state">
                ESTADO/PROVINCIA: <span className={styles['required']}>*</span>
              </label>
              <input
                id="mp-state"
                type="text"
                value={userData.address?.state || ''}
                onChange={(e) => handleSecureInputChange('address.state', e.target.value, 'address', 100)}
                className={styles['mp-text-input']}
              />
            </div>

            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-country">
                PAÍS: <span className={styles['required']}>*</span>
              </label>
              <select
                id="mp-country"
                value={userData.address?.country || ''}
                onChange={(e) => {
                  const countryValue = e.target.value;
                  setUserData({
                    ...userData,
                    address: {
                      ...(userData.address || {}),
                      country: countryValue,
                      customCountry: countryValue === 'Otro' ? '' : userData.address?.customCountry,
                    },
                  });
                }}
                className={styles['mp-select-input']}
                required
              >
                <option value="">Seleccione un país</option>
                <option value="Mexico">México</option>
                <option value="Estados Unidos">Estados Unidos</option>
                <option value="Canada">Canadá</option>
                <option value="Colombia">Colombia</option>
                <option value="Argentina">Argentina</option>
                <option value="Peru">Perú</option>
                <option value="Chile">Chile</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            {userData.address?.country === 'Otro' && (
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-custom-country">
                  ESPECIFIQUE PAÍS: <span className={styles['required']}>*</span>
                </label>
                <input
                  id="mp-custom-country"
                  type="text"
                  value={userData.address?.customCountry || ''}
                  onChange={(e) => handleSecureInputChange('address.customCountry', e.target.value, 'address', 100)}
                  className={styles['mp-text-input']}
                  placeholder="Escriba el nombre del país"
                />
              </div>
            )}
          </div>

          <div className={styles['mp-form-section']}>
            <h3 className={styles['mp-form-section-title']}>Verificación de Edad y Términos</h3>
            <p className={styles['mp-form-section-subtitle']}>
              Requerido para la venta de productos regulados
            </p>

            <Check
              label={
                <>
                  Confirmo que soy mayor de 18 años y tengo la edad legal para comprar productos que
                  pueden contener alcohol. Entiendo que puedo ser requerido a mostrar identificación
                  válida al momento de la entrega.
                </>
              }
              checked={userData.isOver18}
              onChange={(v) => setUserData({ ...userData, isOver18: v })}
            />
            <Check
              label={
                <>
                  Acepto los términos y condiciones para la compra de productos que pueden contener
                  alcohol. Entiendo que está prohibida la venta a menores de edad y que el consumo
                  responsable es mi responsabilidad.
                </>
              }
              checked={userData.acceptsAlcoholTerms}
              onChange={(v) => setUserData({ ...userData, acceptsAlcoholTerms: v })}
            />
            <Check
              label={
                <>
                  Acepto el cargo fijo de envío de $200.00 MXN que se agregará a mi pedido. Este
                  cargo cubre el manejo especial y entrega segura de productos regulados.
                </>
              }
              checked={userData.acceptsShippingFee}
              onChange={(v) => setUserData({ ...userData, acceptsShippingFee: v })}
            />
          </div>

          <div className={styles['mp-form-actions']}>
            <button className={cn(styles['mp-button'], styles['mp-secondary'])} onClick={() => setCurrentStep(1)}>
              Volver
            </button>
            <button className={cn(styles['mp-button'], styles['mp-primary'])} onClick={handleContinueToOrderConfirmation}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Paso 3: Confirmación (tuyo, sin cambios de lógica) */}
      {currentStep === 3 && (
        <div className={styles['mp-confirmation-container']}>
          {!hideTitle && <h2 className={styles['mp-page-title']}>Confirmar Pedido</h2>}
          {savingCustomer && (
            <div className={styles['mp-saving-notice']}>
              <p>Guardando información del cliente...</p>
            </div>
          )}

          <div className={styles['mp-summary']}>
            <h3>Resumen del Pedido</h3>
            {items.map((item, index) => (
              <div key={index} className={styles['mp-product-card']}>
                <div className={styles['mp-product-card-header']}><h4>{item.name}</h4></div>
                <div className={styles['mp-product-card-body']}>
                  <div className={styles['mp-product-card-row']}><span>Cantidad:</span><span>{item.quantity}</span></div>
                  <div className={styles['mp-product-card-row']}><span>Precio unitario:</span><span>{formatPrice(item.price)}</span></div>
                  <div className={styles['mp-product-card-row']}><span>Subtotal:</span><span>{formatPrice(item.price * item.quantity)}</span></div>
                </div>
              </div>
            ))}

            <div className={styles['mp-price-summary']}>
              <div className={styles['mp-price-row']}><span>Subtotal productos:</span><span>{formatPrice(calculateSubtotal())}</span></div>
              <div className={styles['mp-price-row']}><span>Envío:</span><span>{formatPrice(SHIPPING_FEE)}</span></div>
              <div className={cn(styles['mp-price-row'], styles['mp-total'])}><span>Total:</span><span>{formatPrice(calculateTotalPrice())}</span></div>
            </div>
          </div>

          <div className={styles['mp-customer-summary']}>
            <h3>Información del Cliente</h3>
            <div className={styles['mp-buyer-info-card']}>
              <Row label="Nombre" value={`${userData.first_name} ${userData.last_name}`} />
              <Row label="Email" value={userData.email} />
              <Row label="Teléfono" value={userData.phone} />
              {userData.birth_date && <Row label="Fecha de nacimiento" value={userData.birth_date} />}
              {userData.address && (
                <>
                  <Row label="Dirección" value={`${userData.address.street_name} ${userData.address.street_number}`} />
                  <Row label="Ciudad" value={userData.address.city} />
                  <Row label="Estado" value={userData.address.state} />
                  <Row label="Código Postal" value={userData.address.zip_code} />
                  <Row label="País" value={userData.address.country} />
                </>
              )}
            </div>
          </div>

          <div className={styles['mp-confirmations']}>
            <h3>Confirmaciones Requeridas</h3>
            <Check label={<>Confirmo que soy mayor de 18 años y tengo la edad legal para comprar productos que pueden contener alcohol. <span className={styles['required']}>*</span></>}
                   checked={userData.isOver18}
                   onChange={(v) => setUserData({ ...userData, isOver18: v })} />
            <Check label={<>Acepto los términos y condiciones para la compra de productos que pueden contener alcohol. <span className={styles['required']}>*</span></>}
                   checked={userData.acceptsAlcoholTerms}
                   onChange={(v) => setUserData({ ...userData, acceptsAlcoholTerms: v })} />
            <Check label={<>Acepto el cargo fijo de envío de $200.00 MXN que se agregará a mi pedido. <span className={styles['required']}>*</span></>}
                   checked={userData.acceptsShippingFee}
                   onChange={(v) => setUserData({ ...userData, acceptsShippingFee: v })} />
          </div>

          <div className={styles['mp-confirmation-notice']}>
            <p className={styles['mp-notice-text']}>⚠️ Al confirmar, los datos mostrados quedarán bloqueados y se guardarán para el envío.</p>
            <div className={styles['mp-button-container']}>
              <button className={cn(styles['mp-button'], styles['mp-secondary'])} onClick={handleBack}>Volver</button>
              <button className={cn(styles['mp-button'], styles['mp-primary'])}
                      onClick={handleConfirmOrder}
                      disabled={savingCustomer || !userData.isOver18 || !userData.acceptsAlcoholTerms || !userData.acceptsShippingFee}>
                {savingCustomer ? 'Guardando...' : 'Confirmar y Proceder al Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paso 4: Pago (tuyo) */}
      {currentStep === 4 && confirmedOrder && (
        <div className={styles['mp-payment-container']}>
          {!hideTitle && <h2 className={styles['mp-page-title']}>Proceso de Pago</h2>}
          <div className={styles['mp-order-preview']}>
            <h3>Resumen del Pedido (Confirmado)</h3>
            {confirmedOrder.products?.map((order, index) => (
              <div key={index} className={styles['mp-product-card']}>
                <div className={styles['mp-product-card-header']}><h4>{order.product?.name || 'Producto desconocido'}</h4></div>
                <div className={styles['mp-product-card-body']}>
                  <div className={styles['mp-product-card-row']}><span className={styles['mp-product-card-label']}>Precio unitario:</span><span className={styles['mp-product-card-value']}>${formatPrice(order.product?.price)}</span></div>
                  <div className={styles['mp-product-card-row']}><span className={styles['mp-product-card-label']}>Cantidad:</span><span className={styles['mp-product-card-value']}>{order.quantity}</span></div>
                </div>
                <div className={styles['mp-product-card-footer']}>
                  <span>Total producto:</span>
                  <span className={styles['mp-product-card-total']}>${formatPrice((order.product?.price || 0) * order.quantity)}</span>
                </div>
              </div>
            ))}
            <div className={styles['mp-grand-total']}>
              <div className={styles['mp-price-breakdown']}>
                <div className={styles['mp-price-row']}><span>Subtotal productos:</span><span>${formatPrice(totalAmount)}</span></div>
                <div className={styles['mp-price-row']}><span>Cargo de envío:</span><span>$200.00</span></div>
                <div className={styles['mp-price-row']}><span><strong>Total a Pagar:</strong></span><span><strong>{totalFmt}</strong></span></div>
              </div>
            </div>
          </div>
          <div className={styles['mp-payment-wrapper']}>
            {renderPaymentProvider()}
          </div>
          <div className={styles['mp-payment-actions']}>
            <button className={cn(styles['mp-button'], styles['mp-secondary'])} onClick={handleCancel}>
              Cancelar Pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------- Helpers UI locales (pills y líneas) --------- */
function QtyPill({ qty, onDec, onInc, onChange }) {
  return (
    <div style={ux.pill}>
      {qty > 0 ? (
        <button style={ux.pillBtn} onClick={onDec} aria-label="menos">
          −
        </button>
      ) : (
        <button style={ux.pillBtn} onClick={onDec} aria-label="eliminar">
          🗑️
        </button>
      )}

      <input
        type="number"
        min={0}
        value={qty}
        onChange={(e) => onChange?.(parseInt(e.target.value, 10))}
        style={ux.pillInput}
        aria-label="cantidad"
      />

      <button style={ux.pillBtn} onClick={onInc} aria-label="más">
        ＋
      </button>
    </div>
  );
}

function AddPill({ onAdd }) {
  return (
    <button onClick={onAdd} style={ux.addPill} aria-label="agregar">
      ＋ Agregar
    </button>
  );
}

function Line({ label, value }) {
  return (
    <div style={ux.line}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className={styles['mp-buyer-info-row']}>
      <span className={styles['mp-buyer-info-label']}>{label}:</span>
      <span className={styles['mp-buyer-info-value']}>{value}</span>
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <div className={styles['mp-form-group']}>
      <label className={styles['mp-checkbox-label']}>
        <input type="checkbox" checked={checked || false} onChange={(e) => onChange(e.target.checked)} required />
        <span className={styles['mp-checkbox-text']}>{label}</span>
      </label>
    </div>
  );
}

/* --------- estilos inline para el paso 1 minimal --------- */
const ACCENT = '#ec6a2b';
const ux = {
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff' },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: 800 },
  counterBadge: { background: ACCENT, color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 700 },
  empty: { color: '#6b7280' },

  cartRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' },
  cartInfo: { display: 'grid', gap: 2 },
  cartName: { fontWeight: 600 },
  cartSub: { color: '#6b7280', fontSize: 12 },

  list: { display: 'grid', gridTemplateColumns: '1fr', gap: 10 },
  productRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' },
  disabledRow: { opacity: 0.6 },
  pInfo: { display: 'grid', gap: 4, maxWidth: '70%' },
  pName: { fontWeight: 600 },
  pDesc: { color: '#6b7280', fontSize: 13 },
  pPrice: { color: '#111827', fontWeight: 700, fontSize: 14 },
  pRight: { display: 'flex', alignItems: 'center' },

 pill: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "#F97316", // naranja (tailwind orange-500)
    borderRadius: 999,
    padding: "4px 8px",
  },
  pillBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "#fff", // texto/icono en blanco para contraste
    fontSize: 16,
    fontWeight: "bold",
  },
   pillInput: {
    width: 44,
    height: 28,
    borderRadius: 8,
    border: "none",
    textAlign: "center",
    background: "transparent",
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,

    // 👇 quitar flechas arriba/abajo en inputs type="number"
    MozAppearance: "textfield", // Firefox
    },
  addPill: { border: `1px solid ${ACCENT}`, color: ACCENT, background: '#fff', padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontWeight: 700 },

  totalsBox: { marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e5e7eb', display: 'grid', gap: 6, maxWidth: 360, marginLeft: 'auto', fontSize: 14 },
  line: { display: 'flex', justifyContent: 'space-between' },

  actionsRow: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 },

  
};
