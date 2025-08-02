'use client'

import { Component } from 'react'
import { logSecurityEvent } from '../lib/security-logger'
import styles from '../styles/ErrorBoundary.module.css'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      isHydrationError: false 
    }
  }

  static getDerivedStateFromError(error) {
    // Detectar errores de hidratación específicamente
    const isHydrationError = error.message && (
      error.message.includes('hydrat') ||
      error.message.includes('server') ||
      error.message.includes('client') ||
      error.message.includes('mismatch')
    )
    
    return { 
      hasError: true, 
      error,
      isHydrationError 
    }
  }

  componentDidCatch(error, errorInfo) {
    // Registrar el error
    logSecurityEvent('react_error', { 
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      isHydrationError: this.state.isHydrationError
    }, 'error');
    
    this.setState({ errorInfo });

    // Si es error de hidratación en móvil, intentar reload automático
    if (this.state.isHydrationError && typeof window !== 'undefined') {
      console.error('🚨 Error de hidratación detectado en móvil. Reintentando...')
      
      // Reintento automático después de 2 segundos
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    }
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      isHydrationError: false 
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'system-ui',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          margin: '20px',
          fontSize: '16px',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <h2 style={{ color: '#dc3545', marginBottom: '15px' }}>
            {this.state.isHydrationError ? 'Error de Carga' : 'Oops! Algo salió mal'}
          </h2>
          
          <p style={{ color: '#6c757d', marginBottom: '15px', maxWidth: '400px' }}>
            {this.state.isHydrationError 
              ? 'La aplicación está reintentando cargar automáticamente. Si el problema persiste, intenta recargar manualmente.'
              : 'La aplicación encontró un error inesperado.'
            }
          </p>

          {this.state.isHydrationError && (
            <div style={{ 
              color: '#ffc107', 
              fontSize: '14px', 
              marginBottom: '15px',
              animation: 'pulse 1.5s ease-in-out infinite alternate'
            }}>
              Reintentando en unos segundos...
            </div>
          )}
          
          <button 
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              marginBottom: '10px'
            }}
          >
            Recargar página
          </button>

          <button 
            onClick={this.handleRetry}
            style={{
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Reintentar componente
          </button>
          
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '20px', textAlign: 'left', width: '100%', maxWidth: '600px' }}>
              <summary style={{ cursor: 'pointer', color: '#6c757d' }}>
                Detalles del error (desarrollo)
              </summary>
              <pre style={{ 
                fontSize: '12px', 
                backgroundColor: '#f1f3f4', 
                padding: '10px', 
                borderRadius: '4px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap'
              }}>
                {this.state.error && this.state.error.toString()}
                <br />
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}

          <style jsx>{`
            @keyframes pulse {
              from { opacity: 0.6; }
              to { opacity: 1; }
            }
          `}</style>
        </div>
      )
    }

    return this.props.children
  }
}