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

export const metadata = {
  title: 'Componente de Pago MercadoPago',
  description: 'Componente React para integraciones con MercadoPago',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${inter.variable} ${bodoni.variable} ${playfair.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Prevenir problemas de hidratación en móviles
              (function() {
                try {
                  // Detectar si es móvil
                  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                  
                  if (isMobile) {
                    // Establecer variables CSS para viewport
                    const vh = window.innerHeight * 0.01;
                    document.documentElement.style.setProperty('--vh', vh + 'px');
                    
                    // Prevenir zoom en orientación
                    window.addEventListener('orientationchange', function() {
                      setTimeout(function() {
                        const vh = window.innerHeight * 0.01;
                        document.documentElement.style.setProperty('--vh', vh + 'px');
                      }, 100);
                    });
                    
                    // Marcar el documento como móvil para CSS
                    document.documentElement.classList.add('mobile-device');
                  }
                  
                  // Prevenir flash de contenido no hidratado
                  document.documentElement.setAttribute('data-hydrating', 'true');
                  
                  // Remover atributo después de la hidratación
                  window.addEventListener('DOMContentLoaded', function() {
                    setTimeout(function() {
                      document.documentElement.removeAttribute('data-hydrating');
                      document.documentElement.setAttribute('data-hydrated', 'true');
                    }, 100);
                  });
                } catch (e) {
                  console.warn('Error en script de hidratación:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body data-hydrating="true">
        {children}
      </body>
    </html>
  )
}