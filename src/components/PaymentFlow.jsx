'use client';

import { useState, useEffect } from 'react';
import styles from '../styles/PaymentFlow.module.css';
import MercadoPagoProvider from './MercadoPagoProvider';
import { cn } from '../lib/utils';
import { products as staticProducts } from '../data/products'; // <-- Importa productos estáticos

export default function PaymentFlow({
  apiBaseUrl,
  // productsEndpoint ya no se usa para fetch, pero puede mantenerse si otras partes lo necesitan
  // productsEndpoint = '/api/products',
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
}) {
  // --- Validaciones iniciales de props (sin cambios) ---
  if (!apiBaseUrl) {
    console.error("PaymentFlow Error: 'apiBaseUrl' prop is required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Falta apiBaseUrl.</div>;
  }
  if (!mercadoPagoPublicKey) {
    console.error("PaymentFlow Error: 'mercadoPagoPublicKey' prop is required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Falta mercadoPagoPublicKey.</div>;
  }
  if (!successUrl || !pendingUrl || !failureUrl) {
    console.error("PaymentFlow Error: 'successUrl', 'pendingUrl', and 'failureUrl' props are required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Faltan URLs de redirección.</div>;
  }
  if (!PaymentProviderComponent) {
    console.error("PaymentFlow Error: 'PaymentProviderComponent' prop is required.");
    return <div className={styles['mp-error-container']}>Error de configuración: Falta PaymentProviderComponent.</div>;
  }

  // --- Inicializa estados directamente con datos estáticos ---
  const [products, setProducts] = useState(staticProducts || []); // Usa los productos importados
  const [selectedProductId, setSelectedProductId] = useState(staticProducts?.[0]?.id || null);
  const [quantity, setQuantity] = useState(1);
  const [currentStep, setCurrentStep] = useState(1);
  // Inicializa selectedProduct basado en el primer producto estático
  const [selectedProduct, setSelectedProduct] = useState(staticProducts?.[0] || null);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  // --- Lógica de handlers (handleProductChange, handleQuantityChange, etc.) sin cambios ---
  // Asegúrate que handleProductChange funcione bien con el estado 'products' inicializado estáticamente
  const handleProductChange = (e) => {
    const newProductId = e.target.value;
    setSelectedProductId(newProductId);
    // Busca en el estado 'products' que ahora contiene los datos estáticos
    const product = products.find(p => p.id === newProductId);
    setSelectedProduct(product);
  };

  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0 && value <= 100) {
      setQuantity(value);
    }
  };

  const handleContinueToConfirmation = () => {
    if (!selectedProduct || quantity < 1) {
      alert('Por favor selecciona un producto válido y cantidad');
      return;
    }
    setCurrentStep(2);
  };

  const handleConfirmOrder = () => {
    // Esta función ya guarda los datos necesarios en confirmedOrder
    setConfirmedOrder({
      productId: selectedProduct.id,
      quantity: quantity,
      price: selectedProduct.price, // Guarda el precio aquí
      totalPrice: selectedProduct.price * quantity,
      // Guarda también otros detalles si los necesitas mostrar
      name: selectedProduct.name,
      description: selectedProduct.description,
    });
    setCurrentStep(3); // Pasa al siguiente paso
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    if (window.confirm('¿Seguro que deseas cancelar este pedido?')) {
      setCurrentStep(1);
      setSelectedProductId(products[0]?.id || null);
      setSelectedProduct(products[0] || null);
      setQuantity(1);
      setConfirmedOrder(null);
    }
  };

  const handlePaymentSuccess = (data) => {
    if (onSuccess) onSuccess(data);
    // Podrías añadir lógica adicional aquí si es necesario
  };

  const renderPaymentProvider = () => {
    // Asegúrate de que confirmedOrder exista antes de renderizar
    if (!confirmedOrder || !mercadoPagoPublicKey) return null;

    return (
      <PaymentProviderComponent
        productId={confirmedOrder.productId} // Usa datos de confirmedOrder
        quantity={confirmedOrder.quantity}   // Usa datos de confirmedOrder
        price={confirmedOrder.price}         // <-- Pasa el precio desde confirmedOrder
        publicKey={mercadoPagoPublicKey}
        apiBaseUrl={apiBaseUrl}
        successUrl={successUrl}
        pendingUrl={pendingUrl}
        failureUrl={failureUrl}
        onSuccess={handlePaymentSuccess}
        onError={onError}
        // Pasa otras props si son necesarias (className, hideTitle, etc.)
      />
    );
  };

  // --- Renderizado condicional ---
  // Verifica si hay productos estáticos
  if (!products || products.length === 0) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        <div className={styles['mp-empty-state']}>
          <h2>No hay productos disponibles</h2>
          <p>Verifica el archivo de datos local.</p>
        </div>
      </div>
    );
  }

  // --- Renderizado de Steps 1, 2, 3 (sin cambios en la estructura principal) ---
  if (currentStep === 1) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        {!hideTitle && <h2 className={styles['mp-page-title']}>Selecciona tu Producto</h2>}
        
        <div className={styles['mp-product-selection-container']}>
          <div className={styles['mp-form-group']}>
            <label htmlFor="mp-product-select">Producto:</label>
            <select 
              id="mp-product-select"
              value={selectedProductId || ''}
              onChange={handleProductChange}
              className={styles['mp-select-input']}
            >
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name} - ${product.price.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles['mp-form-group']}>
            <label htmlFor="mp-quantity-input">Cantidad:</label>
            <input
              id="mp-quantity-input"
              type="number"
              min="1"
              max="100"
              value={quantity}
              onChange={handleQuantityChange}
              className={styles['mp-number-input']}
            />
          </div>
          
          {selectedProduct && (
            <div className={styles['mp-product-details']}>
              <h3>{selectedProduct.name}</h3>
              <p className={styles['mp-product-description']}>{selectedProduct.description}</p>
              <div className={styles['mp-product-price']}>
                <span>Precio Total:</span>
                <span className={styles['mp-price-value']}>${(selectedProduct.price * quantity).toFixed(2)}</span>
              </div>
            </div>
          )}

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
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        {!hideTitle && <h2 className={styles['mp-page-title']}>Confirmar Pedido</h2>}
        
        <div className={styles['mp-confirmation-container']}>
          <div className={styles['mp-order-summary']}>
            <h3>Resumen del Pedido</h3>
            <div className={styles['mp-summary-item']}>
              <span>Producto:</span>
              <span>{selectedProduct.name}</span>
            </div>
            <div className={styles['mp-summary-item']}>
              <span>Descripción:</span>
              <span>{selectedProduct.description}</span>
            </div>
            <div className={styles['mp-summary-item']}>
              <span>Precio unitario:</span>
              <span>${selectedProduct.price.toFixed(2)}</span>
            </div>
            <div className={styles['mp-summary-item']}>
              <span>Cantidad:</span>
              <span>{quantity}</span>
            </div>
            <div className={cn(styles['mp-summary-item'], styles['mp-total'])}>
              <span>Total a pagar:</span>
              <span>${(selectedProduct.price * quantity).toFixed(2)}</span>
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
  
  // --- Renderizado para Step 3 ---
  if (currentStep === 3 && confirmedOrder) {
    return (
      <div className={cn(styles['mp-container'], className)} style={containerStyles}>
        {!hideTitle && <h2 className={styles['mp-page-title']}>Proceso de Pago</h2>}

        <div className={styles['mp-payment-container']}>
          {/* Muestra un resumen bloqueado */}
          <div className={styles['mp-order-preview']}>
            <h3>Resumen del Pedido (Confirmado)</h3>
             <div className={styles['mp-summary-item']}>
               <span>Producto:</span>
               <span className={styles['mp-locked-value']}>{confirmedOrder.name}</span>
             </div>
             <div className={styles['mp-summary-item']}>
               <span>Cantidad:</span>
               <span className={styles['mp-locked-value']}>{confirmedOrder.quantity}</span>
             </div>
            <div className={styles['mp-summary-item']}>
              <span>Total a pagar:</span>
              <span className={styles['mp-locked-value']}>${confirmedOrder.totalPrice.toFixed(2)}</span>
            </div>
          </div>

          {/* Renderiza el proveedor de pago */}
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
  // --- Fin Renderizado Step 3 ---


  return null; // O un estado por defecto si es necesario
}