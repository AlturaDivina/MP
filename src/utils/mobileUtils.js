'use client';

// Utilidades para detectar y manejar problemas específicos de móviles

export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function isIOS() {
  if (typeof window === 'undefined') return false;
  
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid() {
  if (typeof window === 'undefined') return false;
  
  return /Android/.test(navigator.userAgent);
}

export function getMobileViewportHeight() {
  if (typeof window === 'undefined') return 600;
  
  // En móviles, usar window.innerHeight en lugar de screen.height
  // para tener en cuenta las barras de navegación del browser
  return window.innerHeight;
}

export function setupMobileViewport() {
  if (typeof window === 'undefined') return;
  
  // Prevenir zoom en inputs en iOS
  if (isIOS()) {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.style.fontSize = '16px'; // Previene el zoom automático en iOS
    });
  }
  
  // Ajustar viewport height para móviles
  if (isMobileDevice()) {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);
    
    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('orientationchange', setVH);
    };
  }
}

export function handleMobileScrollBehavior() {
  if (typeof window === 'undefined' || !isMobileDevice()) return;
  
  // Prevenir scroll elástico en iOS
  document.body.style.overscrollBehavior = 'none';
  
  // Mejorar el scrolling en Android
  if (isAndroid()) {
    document.body.style.webkitOverflowScrolling = 'touch';
  }
}

export function detectHydrationIssues() {
  if (typeof window === 'undefined') return null;
  
  const issues = [];
  
  // Detectar si hay diferencias de contenido entre server y client
  const hasNextChunks = document.body.innerHTML.includes('self.__next_f');
  if (hasNextChunks) {
    issues.push('NEXT_CHUNKS_VISIBLE');
  }
  
  // Detectar errores de hidratación en console
  const originalError = console.error;
  let hydrationErrors = [];
  
  console.error = (...args) => {
    const message = args.join(' ');
    if (message.includes('Hydration') || message.includes('hydration')) {
      hydrationErrors.push(message);
    }
    originalError.apply(console, args);
  };
  
  setTimeout(() => {
    console.error = originalError;
    if (hydrationErrors.length > 0) {
      issues.push('HYDRATION_ERRORS');
    }
  }, 2000);
  
  return issues;
}

export function fixMobileRenderingIssues() {
  if (typeof window === 'undefined') return;
  
  setupMobileViewport();
  handleMobileScrollBehavior();
  
  // Detectar y reportar problemas de hidratación
  const issues = detectHydrationIssues();
  if (issues && issues.length > 0) {
    console.warn('🔍 Problemas de renderizado móvil detectados:', issues);
    
    // Enviar evento para logging
    window.dispatchEvent(new CustomEvent('MOBILE_RENDERING_ISSUES', {
      detail: { issues, userAgent: navigator.userAgent }
    }));
  }
}

export default {
  isMobileDevice,
  isIOS,
  isAndroid,
  getMobileViewportHeight,
  setupMobileViewport,
  handleMobileScrollBehavior,
  detectHydrationIssues,
  fixMobileRenderingIssues
};
