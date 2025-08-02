/**
 * Script de diagnóstico para problemas de renderizado móvil
 * Revisa configuraciones y archivos que podrían causar problemas
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Iniciando diagnóstico de problemas móviles...\n');

const projectRoot = process.cwd();

// 1. Verificar configuración de Next.js
function checkNextConfig() {
  console.log('📋 Verificando next.config.mjs...');
  const configPath = path.join(projectRoot, 'next.config.mjs');
  
  if (fs.existsSync(configPath)) {
    const config = fs.readFileSync(configPath, 'utf8');
    
    // Verificar que reactStrictMode esté configurado
    if (config.includes('reactStrictMode: true')) {
      console.log('✅ reactStrictMode está habilitado');
    } else {
      console.log('⚠️  reactStrictMode no está habilitado (recomendado para detectar problemas)');
    }
    
    // Verificar viewport en headers
    if (config.includes('viewport')) {
      console.log('✅ Configuración de viewport encontrada en headers');
    } else {
      console.log('⚠️  No se encontró configuración de viewport en headers');
    }
  } else {
    console.log('❌ next.config.mjs no encontrado');
  }
  console.log('');
}

// 2. Verificar layout.js
function checkLayout() {
  console.log('📋 Verificando layout.js...');
  const layoutPath = path.join(projectRoot, 'src/app/layout.js');
  
  if (fs.existsSync(layoutPath)) {
    const layout = fs.readFileSync(layoutPath, 'utf8');
    
    if (layout.includes("'use client'")) {
      console.log('⚠️  Layout tiene "use client" - esto puede causar problemas de hidratación');
    } else {
      console.log('✅ Layout es un Server Component (correcto)');
    }
    
    if (layout.includes('viewport')) {
      console.log('✅ Meta viewport encontrado en layout');
    } else {
      console.log('⚠️  Meta viewport no encontrado en layout');
    }
    
    if (layout.includes('ClientWrapper')) {
      console.log('✅ ClientWrapper encontrado en layout');
    } else {
      console.log('⚠️  ClientWrapper no encontrado en layout');
    }
  } else {
    console.log('❌ layout.js no encontrado');
  }
  console.log('');
}

// 3. Verificar ErrorBoundary
function checkErrorBoundary() {
  console.log('📋 Verificando ErrorBoundary...');
  const errorBoundaryPath = path.join(projectRoot, 'src/components/ErrorBoundary.jsx');
  
  if (fs.existsSync(errorBoundaryPath)) {
    const errorBoundary = fs.readFileSync(errorBoundaryPath, 'utf8');
    
    if (errorBoundary.includes('isHydrationError')) {
      console.log('✅ ErrorBoundary maneja errores de hidratación');
    } else {
      console.log('⚠️  ErrorBoundary no maneja errores de hidratación específicamente');
    }
    
    if (errorBoundary.includes('isMobile')) {
      console.log('✅ ErrorBoundary detecta dispositivos móviles');
    } else {
      console.log('⚠️  ErrorBoundary no detecta dispositivos móviles');
    }
  } else {
    console.log('❌ ErrorBoundary.jsx no encontrado');
  }
  console.log('');
}

// 4. Verificar CartContext
function checkCartContext() {
  console.log('📋 Verificando CartContext...');
  const cartContextPath = path.join(projectRoot, 'src/contexts/CartContext.jsx');
  
  if (fs.existsSync(cartContextPath)) {
    const cartContext = fs.readFileSync(cartContextPath, 'utf8');
    
    if (cartContext.includes('isHydrated')) {
      console.log('✅ CartContext maneja hidratación correctamente');
    } else {
      console.log('⚠️  CartContext no maneja hidratación - puede causar problemas');
    }
    
    if (cartContext.includes('sessionStorage')) {
      if (cartContext.includes('typeof window')) {
        console.log('✅ CartContext verifica window antes de usar sessionStorage');
      } else {
        console.log('⚠️  CartContext usa sessionStorage sin verificar window');
      }
    }
  } else {
    console.log('❌ CartContext.jsx no encontrado');
  }
  console.log('');
}

// 5. Verificar estilos globales para móviles
function checkGlobalStyles() {
  console.log('📋 Verificando estilos globales...');
  const globalStylesPath = path.join(projectRoot, 'src/styles/globals.css');
  
  if (fs.existsSync(globalStylesPath)) {
    const styles = fs.readFileSync(globalStylesPath, 'utf8');
    
    if (styles.includes('text-size-adjust')) {
      console.log('✅ Configuración de text-size-adjust encontrada');
    } else {
      console.log('⚠️  text-size-adjust no configurado (puede causar zoom en iOS)');
    }
    
    if (styles.includes('overscroll-behavior')) {
      console.log('✅ Configuración de overscroll-behavior encontrada');
    } else {
      console.log('⚠️  overscroll-behavior no configurado');
    }
    
    if (styles.includes('font-size: 16px')) {
      console.log('✅ Font-size 16px para inputs (previene zoom en iOS)');
    } else {
      console.log('⚠️  Font-size 16px no configurado para inputs');
    }
  } else {
    console.log('❌ globals.css no encontrado');
  }
  console.log('');
}

// 6. Verificar utilidades móviles
function checkMobileUtils() {
  console.log('📋 Verificando utilidades móviles...');
  const mobileUtilsPath = path.join(projectRoot, 'src/utils/mobileUtils.js');
  
  if (fs.existsSync(mobileUtilsPath)) {
    console.log('✅ mobileUtils.js encontrado');
    
    const mobileUtils = fs.readFileSync(mobileUtilsPath, 'utf8');
    
    if (mobileUtils.includes('fixMobileRenderingIssues')) {
      console.log('✅ Función de corrección de problemas móviles disponible');
    }
  } else {
    console.log('⚠️  mobileUtils.js no encontrado');
  }
  console.log('');
}

// 7. Verificar ClientWrapper
function checkClientWrapper() {
  console.log('📋 Verificando ClientWrapper...');
  const clientWrapperPath = path.join(projectRoot, 'src/app/ClientWrapper.jsx');
  
  if (fs.existsSync(clientWrapperPath)) {
    const clientWrapper = fs.readFileSync(clientWrapperPath, 'utf8');
    
    if (clientWrapper.includes("'use client'")) {
      console.log('✅ ClientWrapper es un Client Component');
    } else {
      console.log('⚠️  ClientWrapper no tiene "use client"');
    }
    
    if (clientWrapper.includes('fixMobileRenderingIssues')) {
      console.log('✅ ClientWrapper usa utilidades móviles');
    } else {
      console.log('⚠️  ClientWrapper no usa utilidades móviles');
    }
    
    if (clientWrapper.includes('ErrorBoundary')) {
      console.log('✅ ClientWrapper usa ErrorBoundary');
    } else {
      console.log('⚠️  ClientWrapper no usa ErrorBoundary');
    }
  } else {
    console.log('❌ ClientWrapper.jsx no encontrado');
  }
  console.log('');
}

// Ejecutar todas las verificaciones
function runDiagnostic() {
  checkNextConfig();
  checkLayout();
  checkClientWrapper();
  checkErrorBoundary();
  checkCartContext();
  checkGlobalStyles();
  checkMobileUtils();
  
  console.log('🎯 Diagnóstico completado!\n');
  console.log('📱 Recomendaciones para prevenir problemas móviles:');
  console.log('1. Asegurar que todos los useEffect que accedan a window/localStorage verifiquen typeof window !== "undefined"');
  console.log('2. Usar useState para hidratación gradual en lugar de getInitialProps');
  console.log('3. Configurar viewport correctamente en el layout');
  console.log('4. Usar ErrorBoundary para capturar errores de hidratación');
  console.log('5. Aplicar estilos específicos para móviles que prevengan zoom y scroll elástico');
  console.log('6. Probar en dispositivos reales, no solo en DevTools\n');
  
  console.log('🔧 Próximos pasos:');
  console.log('1. Ejecutar: npm run build');
  console.log('2. Ejecutar: npm run start');
  console.log('3. Probar en móvil real');
  console.log('4. Verificar consola del browser por errores de hidratación\n');
}

// Ejecutar diagnóstico
runDiagnostic();
