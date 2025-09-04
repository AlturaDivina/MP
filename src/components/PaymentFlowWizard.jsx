'use client';

/**
 * PaymentFlowWizard.jsx
 * Objetivo: Eliminar scroll interno largo dividiendo la captura de datos en pasos cortos tipo wizard.
 * Pensado para incrustar en Framer (iframe) sin doble scroll: cada paso usa altura fija del contenedor.
 * Pasos (dinámicos):
 * 0 Carrito / Selección
 * 1 Datos Personales (nombre, apellido, email, teléfono, fecha nac)
 * 2 Dirección Envío
 * 3 Dirección Facturación (si distinta)
 * 4 Confirmaciones Legales (edad, términos, envío)
 * 5 Revisión (Resumen pedido + datos)
 * 6 Pago (MercadoPago Brick)
 *
 * Si el usuario marca "misma dirección" se omite el paso 3 dinámicamente.
 *
 * Diseño UX:
 * - Progreso visible (stepper y barra).
 * - Validaciones incrementales reducen carga cognitiva.
 * - Botones primarios fijos abajo (consistencia y evita desplazamiento).
 * - Se reutilizan las clases y utilidades existentes para no romper estilos globales.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import styles from '../styles/PaymentWizard.module.css';
import formStyles from '../styles/PaymentFlow.module.css';
import MercadoPagoProvider from './MercadoPagoProvider';
import { useCart } from '../hooks/useCart';
import { logInfo, logError } from '../lib/logger';
import { sanitizeName, sanitizeAddress, sanitizePhone, sanitizeEmail, sanitizeInput } from '../utils/security';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

const SHIPPING_FEE = 200;
const formatPrice = (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentFlowWizard({
  apiBaseUrl,
  productsEndpoint = '/api/products',
  mercadoPagoPublicKey,
  PaymentProviderComponent = MercadoPagoProvider,
  successUrl,
  pendingUrl,
  failureUrl,
  hideTitle = false,
  className = '',
  containerStyles = {},
  initialProductId = null,
  height = 'auto', // ahora auto por defecto; iframe puede definir altura externa
  onSuccess,
  onError,
}) {
  // Guards mínimos
  if (!apiBaseUrl || !mercadoPagoPublicKey || !successUrl || !pendingUrl || !failureUrl) {
    return <div className={formStyles['mp-error-container']}>Configuración incompleta del componente.</div>;
  }

  const { items, totalAmount, clearCart, addItem, updateQuantity, removeItem } = useCart();

  // Productos (para permitir selección dentro del paso Carrito)
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setProductsLoading(true);
        const url = `${apiBaseUrl.replace(/\/$/, '')}${productsEndpoint}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('No se pudieron cargar los productos');
        const data = await res.json();
        if (!cancelled) setProducts(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setProductsError(e.message || 'Error cargando productos');
        onError && onError(e);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [apiBaseUrl, productsEndpoint, onError]);

  // Agregar producto inicial opcional si el carrito está vacío y llega initialProductId
  useEffect(() => {
    if (!productsLoading && products.length && items.length === 0) {
      let initial = products[0];
      if (initialProductId) {
        const found = products.find(p => p.id === initialProductId);
        if (found) initial = found;
      }
      if (initial) addItem(initial, 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoading, products, initialProductId]);

  // userData central – conserva compat y estructura usada en Unified
  const [userData, setUserData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    birth_date: '',
  calculatedAge: undefined,
    isOver18: false,
    acceptsAlcoholTerms: false,
    acceptsShippingFee: false,
    identification: { type: 'INE', number: '' },
  shipping_address: { street_name: '', street_number: '', zip_code: '', city: '', state: '', country: '', customCountry: '' },
    billing_same_as_shipping: false,
  billing_address: { street_name: '', street_number: '', zip_code: '', city: '', state: '', country: '', customCountry: '' },
  address: { street_name: '', street_number: '', zip_code: '', city: '', state: '', country: '', customCountry: '' },
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [confirmed, setConfirmed] = useState(false); // indica que ya se generó resumen antes de pago

  // --- Auto-resize para iframe (Framer) ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.parent === window) return; // sólo cuando estamos embebidos
    const frameId = (typeof window !== 'undefined' && window.name) || `mp_frame_${Math.random().toString(36).slice(2)}`;
    const post = (reason='resize') => {
      try {
        const h = document.documentElement.scrollHeight;
        window.parent.postMessage({ type:'MP_IFRAME_HEIGHT', height:h, step:stepIndex, reason, frameId }, '*');
      } catch(_) {}
    };
    post('mount');
    let ro;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => post('ro'));
      ro.observe(document.documentElement);
      ro.observe(document.body);
    } else {
      const int = setInterval(()=>post('interval'), 900);
      window.addEventListener('beforeunload', ()=> clearInterval(int));
    }
    const evt = () => post('event');
    window.addEventListener('orientationchange', evt);
    window.addEventListener('keydown', evt);
    window.addEventListener('load', evt);
    return () => {
      window.removeEventListener('orientationchange', evt);
      window.removeEventListener('keydown', evt);
      window.removeEventListener('load', evt);
      if (ro) ro.disconnect();
    };
  }, [stepIndex]);

  // --- Derived totals ---
  const subtotal = totalAmount;
  const total = subtotal + SHIPPING_FEE;
  const totalFmt = useMemo(() => `$${formatPrice(total)}`,[total]);

  // --- Steps estáticos (Facturación siempre existe; si se marca "misma dirección" se ocultan campos) ---
  const steps = useMemo(() => ['Carrito', 'Datos', 'Envío', 'Facturación', 'Legales', 'Revisión', 'Pago'], []);

  const currentLabel = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  // --- Sanitización central ---
  const setField = useCallback((path, value, type = 'text', max = 100) => {
    let sanitized = value;
    switch (type) {
      case 'name': sanitized = sanitizeName(value, max); break;
      case 'address': sanitized = sanitizeAddress(value, max); break;
      case 'phone': sanitized = sanitizePhone(value); break;
      case 'email': sanitized = sanitizeEmail(value); break;
      default: sanitized = sanitizeInput(value, max); break;
    }
    if (path.includes('.')) {
      const [parent, child] = path.split('.');
      setUserData(prev => ({ ...prev, [parent]: { ...(prev[parent]||{}), [child]: sanitized } }));
    } else {
      setUserData(prev => ({ ...prev, [path]: sanitized }));
    }
  }, []);

  // --- Validaciones por paso ---
  const validators = {
    Carrito: () => {
      if (!items.length) return { cart: 'Agrega al menos un producto.' };
      return {};
    },
    Datos: () => {
      const e = {};
      if (!userData.email) e.email = 'Requerido';
      if (!userData.first_name) e.first_name = 'Requerido';
      if (!userData.last_name) e.last_name = 'Requerido';
      if (!userData.phone) e.phone = 'Requerido';
      if (!userData.birth_date) e.birth_date = 'Requerido';
      // identificación opcional pero si hay número sin tipo o viceversa marcar
      if ((userData.identification?.number && !userData.identification?.type) || (userData.identification?.type && !userData.identification?.number)) {
        e.identification = 'Documento incompleto';
      }
      return e;
    },
    'Envío': () => addrValidator(userData.shipping_address, 'shipping'),
    'Facturación': () => userData.billing_same_as_shipping ? {} : addrValidator(userData.billing_address, 'billing'),
    'Legales': () => {
      const e = {};
      if (!userData.isOver18) e.isOver18 = 'Debes confirmar mayoría de edad';
      if (!userData.acceptsAlcoholTerms) e.acceptsAlcoholTerms = 'Debes aceptar términos';
      if (!userData.acceptsShippingFee) e.acceptsShippingFee = 'Debes aceptar el cargo de envío';
      return e;
    },
    'Revisión': () => ({}),
    'Pago': () => ({}),
  };

  function addrValidator(obj, prefix) {
    const e = {};
    if (!obj.street_name) e[`${prefix}.street_name`] = 'Calle requerida';
    if (!obj.street_number) e[`${prefix}.street_number`] = 'Número requerido';
  if (!obj.zip_code) e[`${prefix}.zip_code`] = 'Código postal requerido';
    if (!obj.city) e[`${prefix}.city`] = 'Ciudad requerida';
    if (!obj.state) e[`${prefix}.state`] = 'Estado requerido';
    if (!obj.country) e[`${prefix}.country`] = 'País requerido';
    if (obj.country === 'Otro' && !obj.customCountry) e[`${prefix}.customCountry`] = 'Especifique el país';
    return e;
  }

  const validateCurrent = () => {
    const label = steps[stepIndex];
    const fn = validators[label];
    const result = fn ? fn() : {};
    setErrors(result);
    return Object.keys(result).length === 0;
  };

  const next = () => {
    if (!validateCurrent()) return;
    // Sincronizar address legacy antes de pasar a revisión o pago
    if (steps[stepIndex] === 'Legales') {
      const copy = { ...userData };
      copy.address = { ...(copy.shipping_address || {}) };
      if (copy.billing_same_as_shipping) copy.billing_address = { ...(copy.shipping_address || {}) };
      setUserData(copy);
    }
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
    if (steps[stepIndex] === 'Revisión') setConfirmed(true);
  };

  const back = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const goTo = (i) => {
    // Sólo permitir ir hacia atrás o a pasos ya validados (no saltos hacia adelante arbitrarios)
    if (i <= stepIndex) setStepIndex(i);
  };

  const setQty = (productId, q) => {
    const qty = Math.max(0, Math.floor(q));
    if (qty === 0) removeItem(productId); else updateQuantity(productId, qty);
  };

  const handlePaymentSuccess = (data) => {
    logInfo('Pago exitoso wizard', data);
    clearCart();
    onSuccess && onSuccess(data);
  };
  const handlePaymentError = (err) => {
    logError('Error pago wizard', err);
    onError && onError(err);
  };

  // --- Renders de pasos ---
  const renderStep = () => {
    switch (steps[stepIndex]) {
      case 'Carrito': return (
        <StepCart
          items={items}
          products={products}
          loading={productsLoading}
          error={productsError}
          addItem={addItem}
          setQty={setQty}
          subtotal={subtotal}
          total={total}
          clearCart={clearCart}
        />
      );
      case 'Datos': return <StepPersonal userData={userData} setField={setField} errors={errors} />;
      case 'Envío': return <StepAddress title="Dirección de Envío" prefix="shipping" data={userData.shipping_address} setField={setField} errors={errors} />;
      case 'Facturación': return <StepBilling userData={userData} setUserData={setUserData} setField={setField} errors={errors} />;
      case 'Legales': return <StepLegals userData={userData} setUserData={setUserData} errors={errors} />;
      case 'Revisión': return <StepReview items={items} userData={userData} subtotal={subtotal} total={total} />;
      case 'Pago': return <StepPayment items={items} total={total} subtotal={subtotal} userData={userData} publicKey={mercadoPagoPublicKey} apiBaseUrl={apiBaseUrl} successUrl={successUrl} pendingUrl={pendingUrl} failureUrl={failureUrl} PaymentProviderComponent={PaymentProviderComponent} onSuccess={handlePaymentSuccess} onError={handlePaymentError} />;
      default: return null;
    }
  };

  const progressPct = ((stepIndex) / (steps.length - 1)) * 100;

  const wrapperStyle = height === 'auto' ? { ...containerStyles } : { ...containerStyles, height };
  return (
    <div className={`${styles.wrapper} ${className}`} style={wrapperStyle}>
      {!hideTitle && (
        <div className={styles.header}>
          <h2 className={styles.title}>
            <span className={styles.brand}>Altura Divina</span>
          </h2>
        </div>
      )}
      <Stepper steps={steps} current={stepIndex} onSelect={goTo} />
      <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${progressPct}%` }} /></div>
      <div className={styles.stepLabel}>{currentLabel}</div>
      <div className={styles.contentArea}>
        {renderStep()}
      </div>
  <div className={styles.footerActions}>
        <button className={formStyles['mp-button']} disabled={stepIndex===0} onClick={back}>Atrás</button>
        {!isLastStep && (
          <button className={`${formStyles['mp-button']} ${formStyles['mp-primary']}`} onClick={next}>Continuar</button>
        )}
        {isLastStep && (
          <button className={`${formStyles['mp-button']} ${formStyles['mp-primary']}`} onClick={() => logInfo('Pago en curso')}>Procesando...</button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Subcomponentes de pasos ---------------- */

function StepCart({ items, products, loading, error, addItem, setQty, subtotal, total, clearCart }) {
  return (
    <div className={styles.stepContainer}>
      <h3 className={styles.blockTitle}>Productos</h3>
      {loading && <p>Cargando productos...</p>}
      {error && <p style={{color:'#dc2626'}}>Error: {error}</p>}
      {!loading && !error && (
        <>
          <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:8}}>
            {products.map(p => {
              const cartItem = items.find(i => i.productId === p.id);
              return (
                <li key={p.id} style={{border:'1px solid #e5e7eb', borderRadius:12, padding:12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div style={{display:'grid', gap:2, maxWidth:'65%'}}>
                    <strong style={{fontSize:14}}>{p.name}</strong>
                    {p.description && <span style={{fontSize:12, color:'#6b7280'}}>{p.description}</span>}
                    <span style={{fontSize:13, fontWeight:600}}>${formatPrice(p.price)}</span>
                  </div>
                  <div>
                    {cartItem ? (
                      <div className={styles.qtyPill}>
                        <button onClick={() => setQty(cartItem.productId, cartItem.quantity - 1)} aria-label={`Reducir cantidad de ${p.name}`}>−</button>
                        <input type="number" value={cartItem.quantity} min={0} onChange={e => setQty(cartItem.productId, e.target.value)} />
                        <button onClick={() => setQty(cartItem.productId, cartItem.quantity + 1)} aria-label={`Incrementar cantidad de ${p.name}`}>＋</button>
                      </div>
                    ) : (
                      <button className={styles.addBtn} onClick={() => addItem(p,1)} aria-label={`Agregar ${p.name} al carrito`}>＋ Agregar</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length === 0 && <p style={{marginTop:8}}>No has agregado productos todavía.</p>}
          {items.length > 0 && (
            <div className={styles.summaryBox} style={{marginTop:12}}>
              <div className={styles.line}><span>Subtotal:</span><span>${formatPrice(subtotal)}</span></div>
              <div className={styles.line}><span>Envío:</span><span>$200.00</span></div>
              <div className={`${styles.line} ${styles.totalLine}`}><span>Total:</span><span>${formatPrice(total)}</span></div>
            </div>
          )}
          {items.length > 0 && (
            <button onClick={clearCart} className={styles.clearCartBtn} aria-label="Vaciar carrito (eliminar todos los productos)" style={{marginTop:10}}>
              <span><span className={styles.clearCartIcon} aria-hidden="true" /> Vaciar carrito</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StepPersonal({ userData, setField, errors }) {
  return (
    <div className={styles.stepContainer}>
      <Field label="Email" error={errors.email} required>
        <input type="email" value={userData.email} onChange={e=>setField('email', e.target.value, 'email',100)} />
      </Field>
      <div className={styles.twoCols}>
        <Field label="Nombre" error={errors.first_name} required>
          <input value={userData.first_name} onChange={e=>setField('first_name', e.target.value,'name',50)} />
        </Field>
        <Field label="Apellido" error={errors.last_name} required>
          <input value={userData.last_name} onChange={e=>setField('last_name', e.target.value,'name',50)} />
        </Field>
      </div>
      <Field label="Fecha de Nacimiento" error={errors.birth_date} required>
        <input
          type="date"
          value={userData.birth_date}
          onChange={e=> {
            const val = e.target.value;
            setField('birth_date', val);
            if (val) {
              const bd = new Date(val);
              const today = new Date();
              if (!isNaN(bd.getTime()) && bd <= today) {
                const age = Math.floor((today - bd)/(365.25*24*60*60*1000));
                setField('calculatedAge', age, 'text');
              } else {
                setField('calculatedAge', undefined, 'text');
              }
            } else {
              setField('calculatedAge', undefined, 'text');
            }
          }}
        />
      </Field>
      <Field label="Teléfono" error={errors.phone} required>
        <PhoneInput country={'mx'} value={userData.phone} onChange={v=>setField('phone', v,'phone')} inputClass={styles.phoneInput}/>
      </Field>
      <div className={styles.twoCols}>
        <Field label="Tipo Documento">
          <select value={userData.identification?.type || 'INE'} onChange={e=>setField('identification.type', e.target.value)}>
            <option value="INE">INE</option>
            <option value="RFC">RFC</option>
            <option value="PASAPORTE">PASAPORTE</option>
            <option value="OTRO">OTRO</option>
          </select>
        </Field>
        <Field label="Número Documento" error={errors.identification}>
          <input value={userData.identification?.number || ''} onChange={e=>setField('identification.number', e.target.value,'text',40)} />
        </Field>
      </div>
      {typeof userData.calculatedAge === 'number' && (
        <div style={{fontSize:12, color: userData.calculatedAge < 18 ? '#dc2626' : '#059669'}}>
          Edad calculada: {userData.calculatedAge} años
        </div>
      )}
    </div>
  );
}

function StepAddress({ title, prefix, data, setField, errors }) {
  return (
    <div className={styles.stepContainer}>
      <h3 className={styles.blockTitle}>{title}</h3>
      <Field label="Calle" error={errors[`${prefix}.street_name`]} required>
        <input value={data.street_name} onChange={e=>setField(`${prefix}_address.street_name`, e.target.value,'address',200)} />
      </Field>
      <div className={styles.twoCols}>
        <Field label="Número" error={errors[`${prefix}.street_number`]} required>
          <input value={data.street_number} onChange={e=>setField(`${prefix}_address.street_number`, e.target.value)} />
        </Field>
  <Field label="Código Postal" error={errors[`${prefix}.zip_code`]} required>
          <input value={data.zip_code} onChange={e=>setField(`${prefix}_address.zip_code`, e.target.value)} />
        </Field>
      </div>
      <Field label="Ciudad" error={errors[`${prefix}.city`]} required>
        <input value={data.city} onChange={e=>setField(`${prefix}_address.city`, e.target.value,'address',100)} />
      </Field>
      <Field label="Estado" error={errors[`${prefix}.state`]} required>
        <input value={data.state} onChange={e=>setField(`${prefix}_address.state`, e.target.value,'address',100)} />
      </Field>
      <Field label="País" error={errors[`${prefix}.country`]} required>
        <select
          value={data.country}
          onChange={e=> {
            const val = e.target.value;
            setField(`${prefix}_address.country`, val, 'text', 100);
            if (val !== 'Otro') {
              // limpiar customCountry si cambia a uno estándar
              setField(`${prefix}_address.customCountry`, '', 'address', 100);
            }
          }}
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
      </Field>
      {data.country === 'Otro' && (
        <Field label="Especifique País" error={errors[`${prefix}.customCountry`]} required>
          <input
            value={data.customCountry}
            onChange={e=>setField(`${prefix}_address.customCountry`, e.target.value,'address',100)}
            placeholder="Nombre del país"
          />
        </Field>
      )}
    </div>
  );
}

function StepBilling({ userData, setUserData, setField, errors }) {
  return (
    <div className={styles.stepContainer}>
      <h3 className={styles.blockTitle}>Dirección de Facturación</h3>
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={userData.billing_same_as_shipping}
          onChange={e=> setUserData({...userData, billing_same_as_shipping: e.target.checked})}
        />
        <span>Usar la misma dirección que envío</span>
      </label>
      {userData.billing_same_as_shipping ? (
        <div style={{background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:10, padding:12, fontSize:13}}>
          <strong style={{display:'block', marginBottom:4}}>Usando dirección de envío:</strong>
          <div>{renderAddr(userData.shipping_address)}</div>
          <div style={{marginTop:6, fontSize:12, color:'#6b7280'}}>
            (Desmarca la casilla si necesitas una dirección distinta para facturación.)
          </div>
        </div>
      ) : (
        <StepAddress title="" prefix="billing" data={userData.billing_address} setField={setField} errors={errors} />
      )}
    </div>
  );
}

function StepLegals({ userData, setUserData, errors }) {
  return (
    <div className={styles.stepContainer}>
      <Checkbox label="Confirmo que soy mayor de 18 años" checked={userData.isOver18} onChange={v=>setUserData({...userData,isOver18:v})} error={errors.isOver18} />
      <Checkbox label="Acepto los términos y condiciones (productos con alcohol)" checked={userData.acceptsAlcoholTerms} onChange={v=>setUserData({...userData,acceptsAlcoholTerms:v})} error={errors.acceptsAlcoholTerms} />
      <Checkbox label="Acepto el cargo fijo de envío de $200 MXN" checked={userData.acceptsShippingFee} onChange={v=>setUserData({...userData,acceptsShippingFee:v})} error={errors.acceptsShippingFee} />
    </div>
  );
}

function StepReview({ items, userData, subtotal, total }) {
  return (
    <div className={styles.stepContainer}>
      <h3 className={styles.blockTitle}>Resumen Pedido</h3>
      {items.map(p => (
        <div key={p.productId} className={styles.reviewRow}>
          <span>{p.name} × {p.quantity}</span>
          <span>${formatPrice(p.price * p.quantity)}</span>
        </div>
      ))}
      <div className={styles.summaryBox}>
        <div className={styles.line}><span>Subtotal:</span><span>${formatPrice(subtotal)}</span></div>
        <div className={styles.line}><span>Envío:</span><span>$200.00</span></div>
        <div className={`${styles.line} ${styles.totalLine}`}><span>Total:</span><span>${formatPrice(total)}</span></div>
      </div>
      <h3 className={styles.blockTitle}>Datos</h3>
      <ul className={styles.dataList}>
        <li><strong>Nombre:</strong> {userData.first_name} {userData.last_name}</li>
        <li><strong>Email:</strong> {userData.email}</li>
        <li><strong>Teléfono:</strong> {userData.phone}</li>
        <li><strong>Nacimiento:</strong> {userData.birth_date}</li>
        <li><strong>Envío:</strong> {renderAddr(userData.shipping_address)}</li>
        <li><strong>Facturación:</strong> {renderAddr(userData.billing_same_as_shipping ? userData.shipping_address : userData.billing_address)}</li>
      </ul>
    </div>
  );
}

function StepPayment({ items, total, subtotal, userData, publicKey, apiBaseUrl, successUrl, pendingUrl, failureUrl, PaymentProviderComponent, onSuccess, onError }) {
  if (!items.length) return <p>Carrito vacío.</p>;
  return (
    <div className={styles.stepContainer}>
      <div className={styles.paymentSummary}>
        <div className={styles.line}><span>Subtotal:</span><span>${formatPrice(subtotal)}</span></div>
        <div className={styles.line}><span>Envío:</span><span>$200.00</span></div>
        <div className={`${styles.line} ${styles.totalLine}`}><span>Total:</span><span>${formatPrice(total)}</span></div>
      </div>
      <div className={formStyles['mp-payment-disclaimer']} role="note" aria-live="polite">
        <strong style={{display:'block', fontWeight:700, marginBottom:4}}>Nota importante:</strong>
        <span>
          Asegúrate de que la información de facturación (billing info) coincida exactamente con la información de tu tarjeta (card info).
        </span>
        <br />
        <span>
          En caso de que tu tarjeta sea americana, puede que solo funcione si la registras como crédito, incluso si es de débito.
        </span>
      </div>
      <PaymentProviderComponent
        productId={items[0].productId}
        quantity={items[0].quantity}
        totalAmount={subtotal} // envío fuera de preferencia si se maneja distinto
        publicKey={publicKey}
        apiBaseUrl={apiBaseUrl}
        successUrl={successUrl}
        pendingUrl={pendingUrl}
        failureUrl={failureUrl}
        userData={userData}
        orderSummary={items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: i.price, total: i.price * i.quantity }))}
        onSuccess={onSuccess}
        onError={onError}
        hideTitle={true}
      />
    </div>
  );
}

/* -------------- UI Helpers -------------- */
function Stepper({ steps, current, onSelect }) {
  return (
    <div className={styles.stepper}>
      {steps.map((s,i)=>(
        <div key={s} className={`${styles.stepItem} ${i===current?styles.active:''} ${i<current?styles.done:''}`} onClick={()=>onSelect(i)}>
          <span className={styles.stepIndex}>{i+1}</span>
          <span className={styles.stepText}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children, error, required }) {
  return (
    <label className={styles.field}> <span className={styles.fieldLabel}>{label}{required && ' *'}</span>{children}{error && <span className={styles.errorMsg}>{error}</span>} </label>
  );
}

function Checkbox({ label, checked, onChange, error }) {
  return (
    <label className={styles.checkboxRow}>
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} />
      <span>{label}</span>
      {error && <span className={styles.errorMsg}>{error}</span>}
    </label>
  );
}

function renderAddr(a) {
  if (!a) return '';
  return `${a.street_name || ''} ${a.street_number || ''}, ${a.city || ''}, ${a.state || ''}, ${a.zip_code || ''}, ${a.country || ''}`;
}
