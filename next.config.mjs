// Archivo: next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self'
                http://localhost:3000
                http://127.0.0.1:3000
                http://localhost:3001
                http://127.0.0.1:3001
                https://*.mercadopago.com 
                https://*.mercadopago.com.ar 
                https://*.mercadopago.com.br 
                https://*.mercadopago.com.mx 
                https://*.mlstatic.com 
                https://*.framer.com 
                https://framer.com 
                https://*.framer.app 
                https://alturadivina.com 
                https://*.mercadolibre.com 
                https://*.mercadolivre.com 
                https://fonts.googleapis.com 
                data: 
                https://*.framerusercontent.com 
                https://api.mercadopago.com;
                
              script-src 'self' 
                'unsafe-inline'
                'unsafe-eval'
                https://*.mercadopago.com 
                https://*.mercadopago.com.ar 
                https://*.mercadopago.com.br 
                https://*.mercadopago.com.mx 
                https://*.mlstatic.com 
                https://*.framer.com 
                https://framer.com 
                https://*.framer.app 
                https://*.mercadolibre.com 
                https://*.mercadolivre.com 
                https://*.framerusercontent.com 
                https://api.mercadopago.com;
                
              style-src 'self' 
                'unsafe-inline'
                https://*.mercadopago.com 
                https://*.mercadopago.com.ar 
                https://*.mercadopago.com.br 
                https://*.mercadopago.com.mx 
                https://*.mlstatic.com 
                https://*.mercadolibre.com 
                https://*.mercadolivre.com 
                https://fonts.googleapis.com;
                
              img-src 'self' data: blob:
                https://*.mercadopago.com 
                https://*.mercadopago.com.ar 
                https://*.mercadopago.com.br 
                https://*.mercadopago.com.mx 
                https://*.mlstatic.com 
                https://*.mercadolibre.com 
                https://*.mercadolivre.com 
                https://*.framerusercontent.com;
                
              font-src 'self' 
                https://fonts.googleapis.com 
                https://fonts.gstatic.com;
                
              connect-src 'self'
                http://localhost:3000
                http://127.0.0.1:3000
                http://localhost:3001
                http://127.0.0.1:3001
                https://*.mercadopago.com 
                https://*.mercadopago.com.ar 
                https://*.mercadopago.com.br 
                https://*.mercadopago.com.mx 
                https://*.mlstatic.com 
                https://*.framer.com 
                https://framer.com 
                https://*.framer.app 
                https://alturadivina.com 
                https://*.mercadolibre.com 
                https://*.mercadolivre.com 
                https://api.mercadopago.com;
                
              frame-src 'self'
                http://localhost:3000
                http://127.0.0.1:3000
                http://localhost:3001
                http://127.0.0.1:3001
                https://*.mercadopago.com 
                https://*.mercadopago.com.ar 
                https://*.mercadopago.com.br 
                https://*.mercadopago.com.mx 
                https://*.mlstatic.com 
                https://*.framer.com 
                https://framer.com 
                https://*.framer.app 
                https://*.framercanvas.com 
                https://alturadivina.com 
                https://*.mercadolibre.com 
                https://*.mercadolivre.com;
                
              object-src 'none';
              base-uri 'self';
              form-action 'self' 
                https://*.mercadopago.com 
                https://api.mercadopago.com;
              frame-ancestors 'self' 
                https://*.framer.com 
                https://framer.com 
                https://*.framer.app 
                https://*.framercanvas.com 
                https://framercanvas.com 
                https://alturadivina.com;
            `.replace(/\s{2,}/g, ' ').trim(),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'payment=(self "https://*.framer.com" "https://framer.com"), camera=(), microphone=(), geolocation=()',
          }
        ],
      },
    ];
  },
};

export default nextConfig;