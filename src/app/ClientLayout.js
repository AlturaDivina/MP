'use client'

import { CartProvider } from '../contexts/CartContext'
import { useEffect, useState } from 'react'

export default function ClientLayout({ children }) {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        fontFamily: 'Inter, sans-serif' 
      }}>
        <div>Cargando...</div>
      </div>
    )
  }

  return (
    <CartProvider>
      {children}
    </CartProvider>
  )
}