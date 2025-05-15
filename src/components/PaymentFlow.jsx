'use client';

import { useState, useEffect } from 'react';
import styles from '../styles/PaymentFlow.module.css'; 
import MercadoPagoProvider from './MercadoPagoProvider';
import { cn } from '../lib/utils';
import { logInfo, logError, logWarn } from '../lib/logger';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import '../styles/mercadopago-globals.css';

const formatPrice = (price) => {
  return Number(price).toLocaleString('es-MX', {
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2
  });
};

export default function PaymentFlow({
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
  customStyles = {},
}) {
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

  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [currentProduct, setCurrentProduct] = useState({
    productId: '',
    product: null,
    quantity: 1
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [userData, setUserData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    identification: {
      type: 'DNI',
      number: ''
    },
    address: {
      street_name: '',
      street_number: '',
      zip_code: '',
      city: ''
    }
  });

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const fullProductsUrl = `${apiBaseUrl.replace(/\/$/, '')}${productsEndpoint}`;
        const response = await fetch(fullProductsUrl);
        if (!response.ok) {
          throw new Error('Error al cargar productos');
        }
        const data = await response.json();
        setProducts(data);
        // Keep the cart empty initially
      } catch (e) {
        setError(e.message);
        if (onError) onError(e);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [apiBaseUrl, productsEndpoint, onError, initialProductId]);

  useEffect(() => {
    console.log('PaymentFlow initialized with API URL:', apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    return () => {
      logInfo("Limpiando el flujo de pago");
    };
  }, []);

  const getAvailableProducts = () => {
    const selectedIds = selectedProducts.map(item => item.productId);
    return products.filter(product => !selectedIds.includes(product.id));
  };

  const handleAddProduct = () => {
    if (!currentProduct.productId || !currentProduct.product) {
      // No product selected
      return;
    }
    
    // Check if this product is already in the cart
    const existingProductIndex = selectedProducts.findIndex(
      p => p.productId === currentProduct.productId
    );

    if (existingProductIndex >= 0) {
      // Update quantity if product already exists in cart
      const updatedProducts = [...selectedProducts];
      updatedProducts[existingProductIndex].quantity += currentProduct.quantity;
      setSelectedProducts(updatedProducts);
    } else {
      // Add new product to cart
      setSelectedProducts([...selectedProducts, { ...currentProduct }]);
    }
    
    // Reset current product or select next available product
    const availableProducts = getAvailableProducts();
    if (availableProducts.length > 0) {
      setCurrentProduct({
        productId: availableProducts[0].id,
        product: availableProducts[0],
        quantity: 1
      });
    } else {
      setCurrentProduct({
        productId: '',
        product: null,
        quantity: 1
      });
    }
  };

  const handleProductChange = (e) => {
    const productId = e.target.value;
    const product = products.find(p => p.id === productId);
    setCurrentProduct({
      productId,
      product,
      quantity: currentProduct.quantity || 1
    });
  };

  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setCurrentProduct({
        ...currentProduct,
        quantity: value
      });
    }
  };

  const handleRemoveProduct = (index) => {
    const newProducts = [...selectedProducts];
    newProducts.splice(index, 1);
    setSelectedProducts(newProducts);
  };

  const calculateTotalPrice = () => {
    return selectedProducts.reduce((total, item) => {
      return total + (item.product?.price || 0) * item.quantity;
    }, 0);
  };

  const handleContinueToConfirmation = () => {
    if (selectedProducts.length === 0 || selectedProducts.some(product => product.quantity < 1)) {
      alert('Por favor selecciona productos válidos y cantidades');
      return;
    }
    setCurrentStep(2);
  };

  const handleContinueToOrderConfirmation = () => {
    if (!userData.email || !userData.first_name || !userData.last_name) {
      alert('Por favor completa los campos obligatorios');
      return;
    }
    
    const processedUserData = {...userData};
    if (processedUserData.phone) {
      processedUserData.phone = String(processedUserData.phone).replace(/[^\d+]/g, '');
    }
    
    setUserData(processedUserData);
    setCurrentStep(3);
  };

  const handleConfirmOrder = () => {
    const totalPrice = calculateTotalPrice();
    logInfo('====== ORDEN CONFIRMADA ======');
    logInfo('Productos confirmados:');
    selectedProducts.forEach((prod, i) => {
      logInfo(`${i+1}. ${prod.product.name} (ID: ${prod.productId})`);
      logInfo(`   Cantidad: ${prod.quantity}`);
      logInfo(`   Precio unitario: $${formatPrice(prod.product.price)}`);
      logInfo(`   Subtotal: $${formatPrice(prod.product.price * prod.quantity)}`);
    });
    logInfo('TOTAL A PAGAR: $' + formatPrice(totalPrice));
    logInfo('============================');
    setConfirmedOrder({
      products: selectedProducts,
      totalPrice: totalPrice,
      userData: userData
    });
    setCurrentStep(4);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    if (window.confirm('¿Seguro que deseas cancelar este pedido?')) {
      setCurrentStep(1);
      setSelectedProducts([]);
      setConfirmedOrder(null);
    }
  };

  const handlePaymentSuccess = (data) => {
    logInfo('====== PAGO EXITOSO ======');
    logInfo('Detalles de la transacción:', data);
    logInfo('Monto total:', formatPrice(calculateTotalPrice()));
    logInfo('Productos:', selectedProducts.map(p => ({
      id: p.productId,
      nombre: p.product.name,
      cantidad: p.quantity,
      precio: p.product.price,
      subtotal: p.product.price * p.quantity
    })));
    logInfo('========================');
    if (onSuccess) onSuccess(data);
  };

  const handlePaymentError = (error) => {
    logError('====== ERROR EN PAGO ======');
    logError('Detalle del error:', error);
    logError('Productos intentados:', selectedProducts.map(p => p.product.name).join(', '));
    logError('Monto total intentado:', formatPrice(calculateTotalPrice()));
    logError('===========================');
    if (onError) onError(error);
  };

  const renderPaymentProvider = () => {
    if (!confirmedOrder || selectedProducts.length === 0 || !mercadoPagoPublicKey) return null;

    const firstProduct = selectedProducts[0];
    const totalAmount = calculateTotalPrice();
    
    return (
      <PaymentProviderComponent
        productId={firstProduct.productId}
        quantity={1}
        totalAmount={totalAmount}
        publicKey={mercadoPagoPublicKey}
        apiBaseUrl={apiBaseUrl}
        successUrl={successUrl}
        pendingUrl={pendingUrl}
        failureUrl={failureUrl}
        onSuccess={handlePaymentSuccess}
        onError={handlePaymentError}
        hideTitle={true}
        userData={confirmedOrder.userData}
        orderSummary={selectedProducts.map(product => ({
          productId: product.productId,
          name: product.product.name,
          quantity: product.quantity,
          price: product.product.price,
          total: product.product.price * product.quantity
        }))}
        customStyles={customStyles}
      />
    );
  };

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
          <button
            onClick={() => window.location.reload()}
            className={styles['mp-button']}
          >
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

  if (currentStep === 1) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        {!hideTitle && <h2 className={styles['mp-page-title']}>SELECCIONA TUS PRODUCTOS</h2>}
        
        <div className={styles['mp-product-page-layout']}>
          <div className={styles['mp-product-selection']}>
            <h3 className={styles['mp-section-subtitle']}>Añadir Producto</h3>
            
            <div className={styles['mp-product-form']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-product-select-0">PRODUCTO:</label>
                <select 
                  id="mp-product-select-0"
                  value={currentProduct.productId || ''}
                  onChange={handleProductChange}
                  className={styles['mp-select-input']}
                >
                  <option value="">Selecciona un producto</option>
                  {getAvailableProducts().map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} - ${formatPrice(product.price)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-quantity-input-0">CANTIDAD:</label>
                <div className={styles['mp-quantity-control']}>
                  <button 
                    className={styles['mp-quantity-button']} 
                    onClick={() => handleQuantityChange({ target: { 
                      value: Math.max(1, currentProduct.quantity - 1)
                    }})}
                    type="button"
                  >
                    <span>－</span>
                  </button>
                  <input
                    id="mp-quantity-input-0"
                    type="number"
                    min="1"
                    value={currentProduct.quantity || 1}
                    onChange={handleQuantityChange}
                    className={styles['mp-number-input']}
                  />
                  <button 
                    className={styles['mp-quantity-button']} 
                    onClick={() => handleQuantityChange({ target: { 
                      value: (currentProduct.quantity || 0) + 1
                    }})}
                    type="button"
                  >
                    <span>＋</span>
                  </button>
                </div>
              </div>
              
              {currentProduct.product && (
                <div className={styles['mp-product-preview']}>
                  <h4>{currentProduct.product.name}</h4>
                  <p>{currentProduct.product.description}</p>
                  <div className={styles['mp-product-price-tag']}>
                    <span>${formatPrice(currentProduct.product.price)}</span>
                    <span>Disponible</span>
                  </div>
                </div>
              )}
              
              <button 
                className={styles['mp-add-to-cart-button']} 
                onClick={handleAddProduct}
                type="button"
                disabled={!currentProduct.productId}
              >
                Agregar al Carrito
              </button>
            </div>
          </div>
          
          <div className={styles['mp-cart-column']}>
            <div className={styles['mp-cart-summary']}>
              <div className={styles['mp-cart-header']}>
                <h3>Tu Carrito</h3>
                <span className={styles['mp-cart-icon']}>🛒</span>
              </div>
              
              {selectedProducts.length > 0 ? (
                <div className={styles['mp-cart-items']}>
                  {selectedProducts.map((item, index) => (
                    <div key={index} className={styles['mp-cart-item']}>
                      <div className={styles['mp-cart-item-image']}>
                        <div className={styles['mp-item-placeholder']}></div>
                      </div>
                      <div className={styles['mp-cart-item-details']}>
                        <h4>{item.product?.name}</h4>
                        <div className={styles['mp-cart-item-quantity']}>
                          <button 
                            onClick={() => {
                              const updatedProducts = [...selectedProducts];
                              updatedProducts[index].quantity = Math.max(1, item.quantity - 1);
                              setSelectedProducts(updatedProducts);
                            }}
                            type="button"
                            className={styles['mp-cart-quantity-button']}
                          >
                            －
                          </button>
                          <span>{item.quantity}</span>
                          <button 
                            onClick={() => {
                              const updatedProducts = [...selectedProducts];
                              updatedProducts[index].quantity = item.quantity + 1;
                              setSelectedProducts(updatedProducts);
                            }}
                            type="button"
                            className={styles['mp-cart-quantity-button']}
                          >
                            ＋
                          </button>
                        </div>
                      </div>
                      <div className={styles['mp-cart-item-price']}>
                        ${formatPrice(item.product?.price * item.quantity)}
                      </div>
                      <button 
                        className={styles['mp-cart-item-remove']}
                        onClick={() => handleRemoveProduct(index)}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles['mp-cart-empty']}>
                  <p>Tu carrito está vacío</p>
                  <p>Agrega productos para continuar</p>
                </div>
              )}
              
              <div className={styles['mp-cart-total-section']}>
                <div className={styles['mp-total-label']}>Total:</div>
                <div className={styles['mp-total-amount']}>${formatPrice(calculateTotalPrice())}</div>
              </div>
              
              <button 
                className={styles['mp-continue-button']} 
                onClick={handleContinueToConfirmation}
                disabled={selectedProducts.length === 0}
                type="button"
              >
                Continuar al Pago
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 2) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        {!hideTitle && <h2 className={styles['mp-page-title']}>DATOS DEL COMPRADOR</h2>}
        
        <div className={styles['mp-buyer-form-container']}>
          <div className={styles['mp-form-section']}>
            <h3 className={styles['mp-section-title']}>Información Personal</h3>
            <p className={styles['mp-section-subtitle']}>Ingresa tus datos para completar la compra</p>
            
            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-email">EMAIL: <span className={styles['mp-required']}>*</span></label>
              <input
                id="mp-email"
                type="email"
                value={userData.email}
                onChange={(e) => setUserData({...userData, email: e.target.value})}
                className={styles['mp-text-input']}
                placeholder="correo@ejemplo.com"
                required
              />
            </div>
            
            <div className={styles['mp-form-row']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-first-name">NOMBRE: <span className={styles['mp-required']}>*</span></label>
                <input
                  id="mp-first-name"
                  type="text"
                  value={userData.first_name}
                  onChange={(e) => setUserData({...userData, first_name: e.target.value})}
                  className={styles['mp-text-input']}
                  required
                />
              </div>
              
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-last-name">APELLIDO: <span className={styles['mp-required']}>*</span></label>
                <input
                  id="mp-last-name"
                  type="text"
                  value={userData.last_name}
                  onChange={(e) => setUserData({...userData, last_name: e.target.value})}
                  className={styles['mp-text-input']}
                  required
                />
              </div>
            </div>
            
            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-phone">TELÉFONO:</label>
              {typeof window !== 'undefined' && (
                <PhoneInput
                  country={'mx'}
                  value={userData.phone || ''}
                  onChange={(value) => {
                    if (value) {
                      setUserData({
                        ...userData, 
                        phone: value.toString()
                      });
                    }
                  }}
                  inputClass={styles['mp-phone-input']}
                  containerClass={styles['mp-phone-container']}
                  enableSearch={true}
                  preferredCountries={['mx', 'us', 'co', 'ar', 'pe', 'cl']}
                  placeholder="Número de teléfono"
                />
              )}
              <small>Incluya código de país y solo números</small>
            </div>
            
            <div className={styles['mp-form-row']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-id-type">TIPO DE DOCUMENTO:</label>
                <select
                  id="mp-id-type"
                  value={userData.identification?.type || 'DNI'}
                  onChange={(e) => setUserData({
                    ...userData, 
                    identification: {...(userData.identification || {}), type: e.target.value}
                  })}
                  className={styles['mp-select-input']}
                >
                  <option value="INE">INE</option>
                  <option value="RFC">RFC</option>
                  <option value="CUIT">CUIT</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-id-number">NÚMERO DE DOCUMENTO:</label>
                <input
                  id="mp-id-number"
                  type="text"
                  value={userData.identification?.number || ''}
                  onChange={(e) => setUserData({
                    ...userData, 
                    identification: {...(userData.identification || {}), number: e.target.value}
                  })}
                  className={styles['mp-text-input']}
                />
              </div>
            </div>
          </div>
          
          <div className={styles['mp-form-section']}>
            <h3 className={styles['mp-section-title']}>Dirección</h3>
            
            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-street">CALLE:</label>
              <input
                id="mp-street"
                type="text"
                value={userData.address?.street_name || ''}
                onChange={(e) => setUserData({
                  ...userData, 
                  address: {...(userData.address || {}), street_name: e.target.value}
                })}
                className={styles['mp-text-input']}
              />
            </div>
            
            <div className={styles['mp-form-row']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-street-number">NÚMERO:</label>
                <input
                  id="mp-street-number"
                  type="text"
                  value={userData.address?.street_number || ''}
                  onChange={(e) => setUserData({
                    ...userData, 
                    address: {...(userData.address || {}), street_number: e.target.value}
                  })}
                  className={styles['mp-text-input']}
                  placeholder="123"
                />
              </div>
              
              <div className={styles['mp-form-group']}>
                <label htmlFor="mp-zip">CÓDIGO POSTAL:</label>
                <input
                  id="mp-zip"
                  type="text"
                  value={userData.address?.zip_code || ''}
                  onChange={(e) => setUserData({
                    ...userData, 
                    address: {...(userData.address || {}), zip_code: e.target.value}
                  })}
                  className={styles['mp-text-input']}
                />
              </div>
            </div>
            
            <div className={styles['mp-form-group']}>
              <label htmlFor="mp-city">CIUDAD:</label>
              <input
                id="mp-city"
                type="text"
                value={userData.address?.city || ''}
                onChange={(e) => setUserData({
                  ...userData, 
                  address: {...(userData.address || {}), city: e.target.value}
                })}
                className={styles['mp-text-input']}
              />
            </div>
          </div>
          
          <div className={styles['mp-form-actions']}>
            <button 
              className={styles['mp-button-secondary']} 
              onClick={() => setCurrentStep(1)}
              type="button"
            >
              Volver
            </button>
            <button 
              className={styles['mp-button-primary']} 
              onClick={handleContinueToOrderConfirmation}
              type="button"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 3) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        {!hideTitle && <h2 className={styles['mp-page-title']}>CONFIRMAR PEDIDO</h2>}
        
        <div className={styles['mp-confirmation-container']}>
          <div className={styles['mp-order-summary']}>
            <h3 className={styles['mp-summary-title']}>
              <span className={styles['mp-summary-icon']}>✓</span> 
              Resumen del Pedido (Confirmado)
            </h3>
            
            {selectedProducts.map((product, index) => (
              <div key={index} className={styles['mp-summary-product']}>
                <div className={styles['mp-summary-product-header']}>
                  <div className={styles['mp-summary-product-line']}></div>
                  <h4>{product.product.name}</h4>
                </div>
                
                <p className={styles['mp-summary-product-desc']}>
                  {product.product.description}
                </p>
                
                <div className={styles['mp-summary-product-details']}>
                  <div className={styles['mp-summary-detail']}>
                    <span>Precio unitario:</span>
                    <span>${formatPrice(product.product.price)}</span>
                  </div>
                  <div className={styles['mp-summary-detail']}>
                    <span>Cantidad:</span>
                    <span>{product.quantity}</span>
                  </div>
                  <div className={styles['mp-summary-detail-total']}>
                    <span>Total producto:</span>
                    <span>${formatPrice(product.product.price * product.quantity)}</span>
                  </div>
                </div>
              </div>
            ))}
            
            <div className={styles['mp-buyer-info']}>
              <h3 className={styles['mp-buyer-info-title']}>
                <span className={styles['mp-user-icon']}>👤</span> 
                Información del Comprador
              </h3>
              
              <div className={styles['mp-buyer-section']}>
                <h4>Datos Personales</h4>
                
                <div className={styles['mp-buyer-detail']}>
                  <span>Nombre:</span>
                  <span>{userData.first_name} {userData.last_name}</span>
                </div>
                <div className={styles['mp-buyer-detail']}>
                  <span>Email:</span>
                  <span>{userData.email}</span>
                </div>
                {userData.phone && (
                  <div className={styles['mp-buyer-detail']}>
                    <span>Teléfono:</span>
                    <span>{userData.phone}</span>
                  </div>
                )}
              </div>
              
              {(userData.identification?.type || userData.identification?.number) && (
                <div className={styles['mp-buyer-section']}>
                  <h4>Documento de Identidad</h4>
                  <div className={styles['mp-buyer-detail']}>
                    <span>Tipo:</span>
                    <span>{userData.identification?.type || '-'}</span>
                  </div>
                  <div className={styles['mp-buyer-detail']}>
                    <span>Número:</span>
                    <span>{userData.identification?.number || '-'}</span>
                  </div>
                </div>
              )}
              
              {(userData.address?.street_name || userData.address?.street_number ||
                userData.address?.zip_code || userData.address?.city) && (
                <div className={styles['mp-buyer-section']}>
                  <h4>Dirección</h4>
                  {userData.address?.street_name && (
                    <div className={styles['mp-buyer-detail']}>
                      <span>Calle:</span>
                      <span>{userData.address.street_name}</span>
                    </div>
                  )}
                  {userData.address?.street_number && (
                    <div className={styles['mp-buyer-detail']}>
                      <span>Número:</span>
                      <span>{userData.address.street_number}</span>
                    </div>
                  )}
                  {userData.address?.zip_code && (
                    <div className={styles['mp-buyer-detail']}>
                      <span>Código Postal:</span>
                      <span>{userData.address.zip_code}</span>
                    </div>
                  )}
                  {userData.address?.city && (
                    <div className={styles['mp-buyer-detail']}>
                      <span>Ciudad:</span>
                      <span>{userData.address.city}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className={styles['mp-total-bar']}>
              <span>Total a Pagar:</span>
              <span>${formatPrice(calculateTotalPrice())}</span>
            </div>
          </div>
          
          <div className={styles['mp-confirmation-actions']}>
            <div className={styles['mp-action-buttons']}>
              <button 
                className={styles['mp-button-secondary']} 
                onClick={handleBack}
                type="button"
              >
                Volver
              </button>
              <button 
                className={styles['mp-button-primary']} 
                onClick={handleConfirmOrder}
                type="button"
              >
                Confirmar y Proceder al Pago
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 4 && confirmedOrder) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        {!hideTitle && <h2 className={styles['mp-page-title']}>PROCESO DE PAGO</h2>}
        
        <div className={styles['mp-payment-container']}>
          <div className={styles['mp-order-preview']}>
            <div className={styles['mp-order-confirmed']}>
              <span className={styles['mp-check-icon']}>✓</span> 
              <h3>Resumen del Pedido (Confirmado)</h3>
            </div>
            
            {confirmedOrder.products.map((product, index) => (
              <div key={index} className={styles['mp-order-product']}>
                <div className={styles['mp-order-product-line']}></div>
                <h4>{product.product.name}</h4>
                <div className={styles['mp-order-product-details']}>
                  <div className={styles['mp-order-detail']}>
                    <span>Precio unitario:</span>
                    <span>${formatPrice(product.product.price)}</span>
                  </div>
                  <div className={styles['mp-order-detail']}>
                    <span>Cantidad:</span>
                    <span>{product.quantity}</span>
                  </div>
                  <div className={styles['mp-order-detail-total']}>
                    <span>Total producto:</span>
                    <span>${formatPrice(product.product.price * product.quantity)}</span>
                  </div>
                </div>
              </div>
            ))}
            
            <div className={styles['mp-buyer-summary']}>
              <div className={styles['mp-buyer-icon']}>👤</div>
              <div className={styles['mp-buyer-info-summary']}>
                <h4>Información del Comprador</h4>
                <p>
                  <strong>Nombre:</strong> {confirmedOrder.userData.first_name} {confirmedOrder.userData.last_name} |&nbsp;
                  <strong>Email:</strong> {confirmedOrder.userData.email}
                  {confirmedOrder.userData.address?.city && (
                    <span> |&nbsp;<strong>Ciudad:</strong> {confirmedOrder.userData.address.city}</span>
                  )}
                </p>
              </div>
            </div>
            
            <div className={styles['mp-payment-total']}>
              <span>Total a pagar:</span>
              <span>${formatPrice(confirmedOrder.totalPrice)}</span>
            </div>
          </div>
          
          <div className={styles['mp-payment-method']}>
            <h3 className={styles['mp-payment-title']}>
              <span className={styles['mp-payment-icon']}>💳</span> 
              Método de Pago
            </h3>
            <div className={styles['mp-payment-options']}>
              <div className={styles['mp-payment-option-selected']}>
                <input type="radio" id="credit" name="payment" checked readOnly />
                <label htmlFor="credit">
                  <span className={styles['mp-card-icon']}>💳</span>
                  Tarjeta de crédito
                </label>
                <span className={styles['mp-installments']}>Cuotas sin interés</span>
              </div>
              
              <div className={styles['mp-payment-option']}>
                <input type="radio" id="debit" name="payment" disabled />
                <label htmlFor="debit">
                  <span className={styles['mp-card-icon']}>💳</span>
                  Tarjeta de débito
                </label>
                <small>Débito inmediato de tu cuenta</small>
              </div>
            </div>
          </div>
          
          <div className={styles['mp-payment-wrapper']}>
            {renderPaymentProvider()}
          </div>
          
          <div className={styles['mp-payment-actions']}>
            <button 
              className={styles['mp-button-cancel']} 
              onClick={handleCancel}
              type="button"
            >
              Cancelar Pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}