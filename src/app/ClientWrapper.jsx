'use client'

import { useEffect, useState } from 'react'
import ErrorBoundary from '../components/ErrorBoundary'
import { CartProvider } from '../contexts/CartContext'

export default function ClientWrapper({ children }) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // Marcar como montado
    setIsMounted(true)
    
    // Asegurar hidratación completa
    const timer = setTimeout(() => {
      setIsHydrated(true)
    }, 100)

    // Configuraciones móviles específicas
    if (typeof window !== 'undefined') {
      // Prevenir zoom en iOS
      const viewport = document.querySelector('meta[name="viewport"]')
      if (viewport) {
        viewport.setAttribute('content', 
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
        )
      }
      
      // Configuraciones adicionales para móviles
      document.body.style.overscrollBehavior = 'none'
      document.body.style.webkitOverflowScrolling = 'touch'
      document.body.style.webkitUserSelect = 'none'
      document.body.style.webkitTouchCallout = 'none'
    }

    return () => clearTimeout(timer)
  }, [])

  // Renderizado condicional para evitar hydration mismatch
  if (!isMounted) {
    return (
      <div suppressHydrationWarning={true}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontSize: '16px',
          fontFamily: 'system-ui',
          backgroundColor: '#f8f9fa'
        }}>
          Cargando aplicación...
        </div>
      </div>
    )
  }

  return (
    <div suppressHydrationWarning={true}>
      <ErrorBoundary>
        <CartProvider>
          {isHydrated ? children : (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '100vh',
              fontSize: '16px',
              fontFamily: 'system-ui'
            }}>
              Preparando componentes...
            </div>
          )}
        </CartProvider>
      </ErrorBoundary>
    </div>
  )
}
