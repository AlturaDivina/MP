'use client';

import { useState, useEffect } from 'react';
import styles from '../styles/PaymentFlow.module.css'; 
import MercadoPagoProvider from './MercadoPagoProvider';
import ClientOnly from './ClientOnly';
import { useHydration } from '../hooks/useHydration';
import { cn } from '../lib/utils';
import { logInfo, logError, logWarn } from '../lib/logger';

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
}) {
  const isHydrated = useHydration();

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  useEffect(() => {
    if (!isHydrated) return;
    
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
        
        if (data.length > 0) {
          let initialProduct = data[0];
          
          if (initialProductId) {
            const foundProduct = data.find(p => p.id === initialProductId);
            if (foundProduct) {
              initialProduct = foundProduct;
            }
          }
          
          setSelectedProducts([
            {
              productId: initialProduct.id,
              product: initialProduct,
              quantity: 1
            }
          ]);
        }
      } catch (e) {
        setError(e.message);
        if (onError) onError(e);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [apiBaseUrl, productsEndpoint, onError, initialProductId, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    
    return () => {
      logInfo("Limpiando el flujo de pago");
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    
    if (currentStep === 1 && confirmedOrder === null && selectedProducts.length === 0 && products.length > 0) {
      let initialProduct = products[0];
      
      if (initialProductId) {
        const foundProduct = products.find(p => p.id === initialProductId);
        if (foundProduct) {
          initialProduct = foundProduct;
        }
      }
      
      setSelectedProducts([
        {
          productId: initialProduct.id,
          product: initialProduct,
          quantity: 1
        }
      ]);
    }
  }, [currentStep, confirmedOrder, selectedProducts.length, products, initialProductId, isHydrated]);

  // Mostrar loading hasta que esté hidratado
  if (!isHydrated || loading) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles} data-hydrating="true">
        <div className={styles['mp-loading']}>
          <div className={styles['mp-spinner']}></div>
          <p>Cargando productos...</p>
        </div>
      </div>
    );
  }

  const getAvailableProducts = (currentIndex) => {
    const selectedIds = selectedProducts
      .filter((_, index) => index !== currentIndex)
      .map(item => item.productId);
    return products.filter(product => !selectedIds.includes(product.id));
  };

  const handleAddProduct = () => {
    if (products.length > 0) {
      const availableProducts = getAvailableProducts(-1);
      if (availableProducts.length === 0) {
        alert('Ya has agregado todos los productos disponibles');
        return;
      }
      setSelectedProducts([
        ...selectedProducts,
        {
          productId: availableProducts[0].id,
          product: availableProducts[0],
          quantity: 1
        }
      ]);
    }
  };

  const handleRemoveProduct = (index) => {
    const newProducts = [...selectedProducts];
    newProducts.splice(index, 1);
    setSelectedProducts(newProducts);
  };

  const handleProductChange = (e, index) => {
    const productId = e.target.value;
    const product = products.find(p => p.id === productId);
    
    const updatedProducts = [...selectedProducts];
    updatedProducts[index] = {
      ...updatedProducts[index],
      productId: productId,
      product: product
    };
    
    setSelectedProducts(updatedProducts);
  };

  const handleQuantityChange = (e, index) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      const updatedProducts = [...selectedProducts];
      updatedProducts[index] = {
        ...updatedProducts[index],
        quantity: value
      };
      setSelectedProducts(updatedProducts);
    }
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
      totalPrice: totalPrice
    });
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    if (window.confirm('¿Seguro que deseas cancelar este pedido?')) {
      setCurrentStep(1);
      const initialProduct = initialProductId 
        ? products.find(product => product.id === initialProductId) || products[0]
        : products[0];
      setSelectedProducts(products.length > 0 
        ? [{ 
            productId: initialProduct.id,
            product: initialProduct,
            quantity: 1
          }] 
        : []);
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
    
    logInfo('====== RESUMEN DE PAGO ======');
    logInfo('Monto total a procesar:', formatPrice(totalAmount));
    logInfo('Productos en el carrito:');
    selectedProducts.forEach((prod, i) => {
      logInfo(`${i+1}. ${prod.product.name} x ${prod.quantity} = $${formatPrice(prod.product.price * prod.quantity)}`);
    });
    logInfo('============================');
    
    return (
      <ClientOnly fallback={
        <div className={styles['mp-loading']}>
          <div className={styles['mp-spinner']}></div>
          <p>Preparando formulario de pago...</p>
        </div>
      }>
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
          orderSummary={selectedProducts.map(product => ({
            productId: product.productId,
            name: product.product.name,
            quantity: product.quantity,
            price: product.product.price,
            total: product.product.price * product.quantity
          }))}
        />
      </ClientOnly>
    );
  };

  if (error) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles} data-hydrated="true">
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
      <div className={cn(styles['mp-container'], className)} style={containerStyles} data-hydrated="true">
        <div className={styles['mp-empty-state']}>
          <h2>No hay productos disponibles</h2>
          <p>Vuelve a intentarlo más tarde o contacta con el administrador.</p>
        </div>
      </div>
    );
  }

  if (currentStep === 1) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles} data-hydrated="true">
        {!hideTitle && <h2 className={styles['mp-page-title']}>Selecciona tus Productos</h2>}
        
        <div className={styles['mp-product-selection-container']}>
          {selectedProducts.map((selectedProduct, index) => (
            <div key={index} className={styles['mp-product-item']}>
              <div className={styles['mp-form-group']}>
                <label htmlFor={`mp-product-select-${index}`}>Producto:</label>
                <select 
                  id={`mp-product-select-${index}`}
                  value={selectedProduct.productId || ''}
                  onChange={(e) => handleProductChange(e, index)}
                  className={styles['mp-select-input']}
                >
                  <option value="">Selecciona un producto</option>
                  {getAvailableProducts(index).map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} - ${formatPrice(product.price)}
                    </option>
                  ))}
                  {selectedProduct.productId && !getAvailableProducts(index).find(p => p.id === selectedProduct.productId) && (
                    <option key={selectedProduct.productId} value={selectedProduct.productId}>
                      {selectedProduct.product.name} - ${formatPrice(selectedProduct.product.price)}
                    </option>
                  )}
                </select>
              </div>

              <div className={styles['mp-form-group']}>
                <label htmlFor={`mp-quantity-input-${index}`}>Cantidad:</label>
                <input
                  id={`mp-quantity-input-${index}`}
                  type="number"
                  min="1"
                  value={selectedProduct.quantity || 1}
                  onChange={(e) => handleQuantityChange(e, index)}
                  className={styles['mp-number-input']}
                />
              </div>
              
              {selectedProduct.product && (
                <div className={styles['mp-product-details']}>
                  <h3>{selectedProduct.product.name}</h3>
                  <p className={styles['mp-product-description']}>{selectedProduct.product.description}</p>
                  <div className={styles['mp-product-price']}>
                    <span>Precio Total:</span>
                    <span className={styles['mp-price-value']}>
                      ${formatPrice(selectedProduct.product.price * selectedProduct.quantity)}
                    </span>
                  </div>
                </div>
              )}

              <button
                className={cn(styles['mp-button'], styles['mp-secondary'])}
                onClick={() => handleRemoveProduct(index)}
              >
                Eliminar Producto
              </button>
            </div>
          ))}

          <button
            className={cn(styles['mp-button'], styles['mp-primary'])}
            onClick={handleAddProduct}
          >
            Agregar Producto
          </button>

          <div className={styles['mp-total-price']}>
            <span>Total:</span>
            <span>${formatPrice(calculateTotalPrice())}</span>
          </div>

          <div className={styles['mp-button-container']}>
            <button className={cn(styles['mp-button'], styles['mp-primary'])} onClick={handleContinueToConfirmation}>
              Continuar al Pago
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  if (currentStep === 2) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles} data-hydrated="true">
        {!hideTitle && <h2 className={styles['mp-page-title']}>Confirmar Pedido</h2>}
        
        <div className={styles['mp-confirmation-container']}>
          <div className={styles['mp-summary']}>
            {selectedProducts.map((product, index) => (
              <div key={index} className={styles['mp-summary-item']}>
                <span>Producto:</span>
                <span>{product.product.name}</span>
                
                <span>Descripción:</span>
                <span>{product.product.description}</span>
                
                <span>Precio Unitario:</span>
                <span>${formatPrice(product.product.price)}</span>
                
                <span>Cantidad:</span>
                <span>{product.quantity}</span>
                
                <span>Total:</span>
                <span>${formatPrice(product.product.price * product.quantity)}</span>
              </div>
            ))}
            <div className={cn(styles['mp-summary-item'], styles['mp-total'])}>
              <span>Total a Pagar:</span>
              <span>${formatPrice(calculateTotalPrice())}</span>
            </div>
          </div>

          <div className={styles['mp-confirmation-actions']}>
            <p className={styles['mp-confirmation-note']}>
              Al confirmar esta orden, procederás al proceso de pago.
              Los datos mostrados quedarán bloqueados.
            </p>
            
            <div className={styles['mp-button-container']}>
              <button className={cn(styles['mp-button'], styles['mp-secondary'])} onClick={handleBack}>
                Volver
              </button>
              <button className={cn(styles['mp-button'], styles['mp-primary'])} onClick={handleConfirmOrder}>
                Confirmar y Proceder al Pago
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (currentStep === 3 && confirmedOrder) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles} data-hydrated="true">
        {!hideTitle && <h2 className={styles['mp-page-title']}>Proceso de Pago</h2>}
        
        <div className={styles['mp-payment-container']}>
          <div className={styles['mp-order-preview']}>
            <h3>Resumen del Pedido (Confirmado)</h3>
            {confirmedOrder && confirmedOrder.products && confirmedOrder.products.map((order, index) => (
              <div key={index} className={styles['mp-summary-item']}>
                <span>Producto:</span>
                <span>{order.product && order.product.name || 'Producto desconocido'}</span>
                <span>Precio unitario:</span>
                <span>${order.product && formatPrice(order.product.price)}</span>
                <span>Cantidad:</span>
                <span>{order.quantity}</span>
                <span>Total:</span>
                <span>${order.product && formatPrice(order.product.price * order.quantity)}</span>
              </div>
            ))}
            <div className={styles['mp-summary-item']}>
              <span>Total a pagar:</span>
              <span className={styles['mp-locked-value']}>${formatPrice(confirmedOrder.totalPrice)}</span>
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
      </div>
    );
  }

  return null;
}