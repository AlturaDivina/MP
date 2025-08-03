'use client'

import { Suspense, useState, useEffect } from 'react'
import PaymentFlow from '../components/PaymentFlow'
import MercadoPagoProvider from '../components/MercadoPagoProvider'
import CartIcon from '../components/CartIcon'
import CartSidebar from '../components/CartSidebar'

// Componente de Loading específico
function LoadingSpinner() {
  return (
    <div style={{ 
      textAlign: 'center', 
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px'
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '3px solid #f3f3f3',
        borderTop: '3px solid #3498db',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}></div>
      <div>Cargando configuración...</div>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function Home() {
  const [params, setParams] = useState({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);

      const hideTitle = urlParams.get('hideTitle') === 'true';
      const initialProductId = urlParams.get('initialProductId') || null;
      const publicKey = urlParams.get('publicKey') || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;

      // URLs FIJAS DE ALTURA DIVINA
      const finalSuccessUrl = "https://alturadivina.com/confirmacion-de-compra";
      const finalPendingUrl = "https://alturadivina.com/proceso-de-compra";
      const finalFailureUrl = "https://alturadivina.com/error-de-compra";

      const displayMode = urlParams.get('displayMode') || 'full';
      const initialStep = urlParams.has('initialStep') ? parseInt(urlParams.get('initialStep'), 10) : undefined;
      const cartIconColor = urlParams.get('cartIconColor') || '#333333';

      setParams({
        hideTitle,
        initialProductId,
        publicKey,
        successUrl: finalSuccessUrl,
        pendingUrl: finalPendingUrl,
        failureUrl: finalFailureUrl,
        displayMode,
        initialStep,
        cartIconColor,
        apiBaseUrl: process.env.NEXT_PUBLIC_HOST_URL || 'http://localhost:3000'
      });
    } catch (error) {
      console.error('Error configurando parámetros:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (isLoading || Object.keys(params).length === 0) {
    return <LoadingSpinner />;
  }

  const checkoutBase = params.apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const checkoutUrl = checkoutBase ? `${checkoutBase.replace(/\/$/, '')}/checkout` : '/checkout';

  if (params.displayMode === 'cartIconOnly') {
    return (
      <div style={{ padding: '20px' }}>
        <CartIcon 
          onClick={() => setIsCartOpen(true)} 
          color={params.cartIconColor} 
        />
        <CartSidebar
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          checkoutUrl={checkoutUrl}
        />
      </div>
    );
  }

  if (params.displayMode === 'sidebarOnly') {
    return (
      <div style={{ padding: '20px' }}>
        <CartSidebar
          isOpen={true}
          onClose={() => {}}
          checkoutUrl={checkoutUrl}
          alwaysOpen={true}
        />
      </div>
    );
  }

  const paymentFlowProps = {
    apiBaseUrl: params.apiBaseUrl,
    productsEndpoint: "/api/products",
    mercadoPagoPublicKey: params.publicKey,
    PaymentProviderComponent: (props) => (
      <MercadoPagoProvider {...props} />
    ),
    successUrl: params.successUrl,
    pendingUrl: params.pendingUrl,
    failureUrl: params.failureUrl,
    onSuccess: (data) => console.log('Pago exitoso (Home Page):', data),
    onError: (error) => console.error('Error en el pago (Home Page):', error),
    hideTitle: params.hideTitle,
    initialProductId: params.initialProductId,
    ...(params.initialStep !== undefined && { initialStep: params.initialStep }),
  };

  if (params.displayMode === 'paymentFlowOnly') {
    return (
      <div style={{ padding: '20px' }}>
        <Suspense fallback={<LoadingSpinner />}>
          <PaymentFlow
            {...paymentFlowProps}
            initialProductId={params.initialProductId}
            initialStep={params.initialStep}
            displayMode="paymentFlowOnly"
            cartIconColor={params.cartIconColor}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div>
      <Suspense fallback={<LoadingSpinner />}>
        <PaymentFlow
          {...paymentFlowProps}
          initialProductId={params.initialProductId}
          initialStep={params.initialStep}
          displayMode={params.displayMode}
          cartIconColor={params.cartIconColor}
        />
      </Suspense>
    </div>
  );
}
