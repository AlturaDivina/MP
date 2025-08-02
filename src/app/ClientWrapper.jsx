'use client';

import { useEffect } from 'react';
import { CartProvider } from '../contexts/CartContext';
import { CartAPIProvider } from '../utils/CartIntegration';
import ErrorBoundary from '../components/ErrorBoundary';
import { fixMobileRenderingIssues } from '../utils/mobileUtils';

export default function ClientWrapper({ children }) {
  useEffect(() => {
    // Configurar optimizaciones para móviles
    fixMobileRenderingIssues();
    
    // Escuchar eventos de problemas de renderizado
    const handleMobileIssues = (event) => {
      console.warn('🚨 Problemas de renderizado móvil:', event.detail);
      // Aquí podrías enviar a un servicio de logging como Sentry
    };
    
    window.addEventListener('MOBILE_RENDERING_ISSUES', handleMobileIssues);
    
    return () => {
      window.removeEventListener('MOBILE_RENDERING_ISSUES', handleMobileIssues);
    };
  }, []);

  return (
    <ErrorBoundary>
      <CartProvider>
        {/* Esto expone la API del carrito para componentes externos */}
        <CartAPIProvider />
        
        {/* Tu app */}
        {children}
      </CartProvider>
    </ErrorBoundary>
  );
}
