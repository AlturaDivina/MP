'use client';

import { useState, useEffect } from 'react';
import PaymentFlow from '../components/PaymentFlow';
import MercadoPagoProvider from '../components/MercadoPagoProvider';

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  
  // Usa window.location.origin solo cuando está montado en el cliente
  const [hostUrl, setHostUrl] = useState('');
  
  useEffect(() => {
    setIsMounted(true);
    // Configura la URL base de forma dinámica en el cliente
    setHostUrl(window.location.origin);
  }, []);
  
  // Renderiza un placeholder hasta que esté montado en el cliente
  if (!isMounted) {
    return <div className="loading-container" style={{ 
      padding: "20px", 
      textAlign: "center",
      margin: "30px auto", 
      maxWidth: "800px",
      backgroundColor: "#f8f9fa",
      borderRadius: "8px" 
    }}>
      Cargando...
    </div>;
  }

  return (
    <div>
      <PaymentFlow
        apiBaseUrl={hostUrl} // Usa la URL dinámica en lugar de la variable de entorno
        productsEndpoint="/api/products"
        mercadoPagoPublicKey={process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || ''}
        PaymentProviderComponent={MercadoPagoProvider}
        successUrl="https://alturadivina.com/confirmacion-de-compra"
        pendingUrl="https://alturadivina.com/proceso-de-compra"
        failureUrl="https://alturadivina.com/error-de-compra"
        onSuccess={(data) => console.log('Pago exitoso', data)}
        onError={(error) => console.error('Error en el pago', error)}
        hideTitle={false}
        productId="product1" 
      />
    </div>
  );
}