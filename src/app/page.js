'use client';

import { Suspense, useState, useEffect } from 'react'
import PaymentFlow from '../components/PaymentFlow'
import MercadoPagoProvider from '../components/MercadoPagoProvider'
import styles from '../styles/PaymentFlow.module.css';

export default function Home() {
  // Get public key first before any rendering
  const [ready, setReady] = useState(false);
  const [params, setParams] = useState({
    // Initialize with defaults including the public key from env
    publicKey: process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY,
    buttonColor: '#F26F32',
    circleColor: '#009EE3',
    primaryButtonColor: '#F26F32',
    secondaryButtonColor: '#E5E5E5',
    hideTitle: false,
    quantity: 1,
    initialProductId: '',
    finalSuccessUrl: "https://alturadivina.com/confirmacion-de-compra",
    finalPendingUrl: "https://alturadivina.com/proceso-de-compra",  
    finalFailureUrl: "https://alturadivina.com/error-de-compra"
  });

  useEffect(() => {
    // Obtener parámetros de URL
    const urlParams = new URLSearchParams(window.location.search);
    
    // Asegurar que los colores tengan formato hexadecimal con #
    const formatColor = (color) => {
      if (!color) return null;
      return color.startsWith('#') ? color : `#${color}`;
    };
    
    const buttonColor = formatColor(urlParams.get('buttonColor')) || '#F26F32';
    const circleColor = formatColor(urlParams.get('circleColor')) || '#009EE3';
    const primaryButtonColor = formatColor(urlParams.get('primaryButtonColor')) || '#F26F32';
    const secondaryButtonColor = formatColor(urlParams.get('secondaryButtonColor')) || '#E5E5E5';
    
    const hideTitle = urlParams.get('hideTitle') === 'true';
    const quantity = parseInt(urlParams.get('quantity') || '1', 10);
    const initialProductId = urlParams.get('initialProductId') || urlParams.get('productId') || '';
    
    // Use URL param key if available, otherwise keep the env var
    const publicKey = urlParams.get('publicKey') || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    console.log("MercadoPago Public Key:", publicKey); // Debug log

    // Use the default URLs if not provided in URL or not starting with http
    const defaultSuccessUrl = "https://alturadivina.com/confirmacion-de-compra";
    const defaultPendingUrl = "https://alturadivina.com/proceso-de-compra";
    const defaultFailureUrl = "https://alturadivina.com/error-de-compra";

    const finalSuccessUrl = (urlParams.get('successUrl') && urlParams.get('successUrl').startsWith('http')) 
      ? urlParams.get('successUrl') 
      : defaultSuccessUrl;
    const finalPendingUrl = (urlParams.get('pendingUrl') && urlParams.get('pendingUrl').startsWith('http')) 
      ? urlParams.get('pendingUrl') 
      : defaultPendingUrl;
    const finalFailureUrl = (urlParams.get('failureUrl') && urlParams.get('failureUrl').startsWith('http')) 
      ? urlParams.get('failureUrl') 
      : defaultFailureUrl;

    setParams({
      buttonColor,
      circleColor,
      primaryButtonColor,
      secondaryButtonColor,
      hideTitle,
      quantity,
      initialProductId,
      publicKey,
      finalSuccessUrl,
      finalPendingUrl,
      finalFailureUrl
    });

    // Establecer variables CSS globales con alta prioridad (directo al :root)
    document.documentElement.style.setProperty('--mp-button-color', buttonColor);
    document.documentElement.style.setProperty('--mp-circle-color', circleColor);
    document.documentElement.style.setProperty('--mp-primary-button-color', primaryButtonColor);
    document.documentElement.style.setProperty('--mp-secondary-button-color', secondaryButtonColor);
    
    console.log('Colores aplicados:', {
      buttonColor,
      circleColor,
      primaryButtonColor, 
      secondaryButtonColor
    });
    
    // Mark as ready only after all params are set
    setReady(true);
  }, []);

  // Don't render main component until ready
  if (!ready) {
    return <div style={{ textAlign: 'center', padding: '20px' }}>Cargando configuración de pago...</div>;
  }

  return (
    <div className={styles.container}>
      <Suspense fallback={<div style={{ textAlign: 'center', padding: '20px' }}>Cargando configuración de pago...</div>}>
        <PaymentFlow
          apiBaseUrl={process.env.NEXT_PUBLIC_HOST_URL} // This should be https://localhost:3000
          productsEndpoint="/api/products"
          mercadoPagoPublicKey={params.publicKey} // Use from params state, which is now guaranteed to be set
          PaymentProviderComponent={(props) => (
            <MercadoPagoProvider
              {...props}
              customStyles={{
                buttonColor: params.buttonColor,
                circleColor: params.circleColor,
                primaryButtonColor: params.primaryButtonColor,
                secondaryButtonColor: params.secondaryButtonColor
              }}
            />
          )}
          successUrl={params.finalSuccessUrl}
          pendingUrl={params.finalPendingUrl}
          failureUrl={params.finalFailureUrl}
          onSuccess={(data) => console.log('Pago exitoso', data)}
          onError={(error) => console.error('Error en el pago', error)}
          hideTitle={params.hideTitle}
          initialProductId={params.initialProductId}
          customStyles={{
            primaryButtonColor: params.primaryButtonColor,
            secondaryButtonColor: params.secondaryButtonColor
          }}
        />
      </Suspense>
    </div>
  );
}
