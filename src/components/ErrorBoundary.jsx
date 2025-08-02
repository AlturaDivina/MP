'use client';

import { Component } from 'react';
import { logSecurityEvent } from '../lib/security-logger';
import styles from '../styles/ErrorBoundary.module.css';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      isHydrationError: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Detectar errores de hidratación comunes
    const isHydrationError = error.message && (
      error.message.includes('Hydration') ||
      error.message.includes('hydration') ||
      error.message.includes('server') ||
      error.message.includes('client')
    );
    
    return { 
      hasError: true, 
      error,
      isHydrationError
    };
  }

  componentDidCatch(error, errorInfo) {
    // Registrar el error con nuestro logger de seguridad
    logSecurityEvent('react_error', { 
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
      isMobile: typeof window !== 'undefined' ? /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) : false,
      isHydrationError: this.state.isHydrationError
    }, 'error');
    
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    if (this.state.retryCount < 3) {
      this.setState({ 
        hasError: false, 
        error: null, 
        errorInfo: null,
        retryCount: this.state.retryCount + 1
      });
    } else {
      // Después de 3 intentos, recargar la página
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      // Renderizar UI de fallback específica para errores de hidratación
      if (this.state.isHydrationError) {
        return (
          <div className={styles.errorContainer}>
            <h2>⚠️ Error de Carga</h2>
            <p>Estamos teniendo problemas para cargar el contenido correctamente.</p>
            <p>Esto puede suceder en algunos navegadores móviles.</p>
            
            <div className={styles.actionButtons}>
              <button 
                onClick={this.handleRetry}
                className={styles.retryButton}
              >
                {this.state.retryCount < 3 ? 'Reintentar' : 'Recargar Página'}
              </button>
              
              <button 
                onClick={() => window.location.reload()} 
                className={styles.reloadButton}
              >
                Recargar Página
              </button>
            </div>
            
            <small className={styles.helpText}>
              Si el problema persiste, intenta usar el navegador en modo privado/incógnito.
            </small>
          </div>
        );
      }
      
      // UI de fallback para otros errores
      return (
        <div className={styles.errorContainer}>
          <h2>Algo salió mal</h2>
          <p>Disculpa las molestias. Por favor intenta recargar la página o contacta a soporte.</p>
          
          <div className={styles.actionButtons}>
            <button 
              onClick={this.handleRetry}
              className={styles.retryButton}
            >
              {this.state.retryCount < 3 ? 'Reintentar' : 'Recargar Página'}
            </button>
            
            <button 
              onClick={() => window.location.reload()} 
              className={styles.reloadButton}
            >
              Recargar Página
            </button>
          </div>
          
          {/* Solo mostrar detalles técnicos en desarrollo */}
          {process.env.NODE_ENV !== 'production' && (
            <details className={styles.errorDetails}>
              <summary>Detalles del error</summary>
              <p><strong>Mensaje:</strong> {this.state.error?.message}</p>
              <p><strong>Es error de hidratación:</strong> {this.state.isHydrationError ? 'Sí' : 'No'}</p>
              <p><strong>Intentos:</strong> {this.state.retryCount}</p>
              <pre>{this.state.error?.stack}</pre>
              <pre>{this.state.errorInfo?.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}