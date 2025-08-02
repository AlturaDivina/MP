import { Inter, Bodoni_Moda, Playfair_Display_SC } from 'next/font/google'
import '../styles/globals.css'

// Fuente para texto general y campos
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700']
})

// Fuente para títulos principales - estilo condensado y elegante
const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bodoni',
  weight: ['400', '500', '600', '700'],
})

// Alternativa para títulos principales
const playfair = Playfair_Display_SC({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
  weight: ['400', '700'],
})

// Separar viewport de metadata según Next.js 14+
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#F26F32'
}

export const metadata = {
  title: 'Componente de Pago MercadoPago',
  description: 'Componente React para integraciones con MercadoPago',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${inter.variable} ${bodoni.variable} ${playfair.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Script de inicialización para móviles (sin modificar atributos de hidratación)
              (function() {
                try {
                  // Detectar si es móvil
                  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                  
                  if (isMobile) {
                    // Establecer variables CSS para viewport
                    function setVH() {
                      const vh = window.innerHeight * 0.01;
                      document.documentElement.style.setProperty('--vh', vh + 'px');
                    }
                    
                    setVH();
                    
                    // Prevenir zoom en orientación
                    window.addEventListener('orientationchange', function() {
                      setTimeout(setVH, 100);
                    });
                    
                    // Marcar el documento como móvil para CSS
                    document.documentElement.classList.add('mobile-device');
                  }
                } catch (e) {
                  console.warn('Error en script de inicialización móvil:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Script post-hidratación (después del renderizado)
              (function() {
                try {
                  function markAsHydrated() {
                    document.documentElement.removeAttribute('data-hydrating');
                    document.documentElement.setAttribute('data-hydrated', 'true');
                    document.body.removeAttribute('data-hydrating');
                    document.body.setAttribute('data-hydrated', 'true');
                  }
                  
                  // Esperar a que React termine la hidratación
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                      setTimeout(markAsHydrated, 150);
                    });
                  } else {
                    setTimeout(markAsHydrated, 150);
                  }
                } catch (e) {
                  console.warn('Error en script de hidratación:', e);
                }
              })();
            `,
          }}
        />
      </body>
    </html>
  )
}