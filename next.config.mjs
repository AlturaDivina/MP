// Archivo: next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Configuración actualizada para proxying de MercadoPago
  async rewrites() {
    return [
      {
        source: '/api/mercadopago/:path*',
        destination: 'https://api.mercadopago.com/:path*',
      },
      {
        source: '/events/mercadopago/:path*',
        destination: 'https://events.mercadopago.com/:path*',
      },
      // This rule handles the direct access to the process-payment endpoint
      {
        source: '/api/process-payment',
        destination: '/api/process-payment', // Keep routing to local API
      }
    ];
  },

  async headers() {
    const ContentSecurityPolicy = `
      default-src 'self' https://*.mercadopago.com https://events.mercadopago.com https://*.mlstatic.com https://*.framer.com https://framer.com https://*.framer.app https://alturadivina.com https://*.mercadolibre.com https://*.mercadolivre.com https://fonts.googleapis.com;
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.mercadopago.com https://events.mercadopago.com https://*.mlstatic.com https://*.framer.com https://framer.com https://*.framer.app https://*.mercadolibre.com https://*.mercadolivre.com;
      style-src 'self' 'unsafe-inline' https://*.mercadopago.com https://events.mercadopago.com https://*.mlstatic.com https://*.mercadolibre.com https://*.mercadolivre.com https://fonts.googleapis.com;
      frame-src 'self' https://*.mercadopago.com https://events.mercadopago.com https://*.mlstatic.com https://*.framer.com https://framer.com https://*.framer.app https://alturadivina.com https://*.mercadolibre.com https://*.mercadolivre.com;
      connect-src 'self' http://localhost:* https://localhost:* https://*.mercadopago.com https://events.mercadopago.com https://*.mlstatic.com https://*.framer.com https://framer.com https://*.framer.app https://alturadivina.com https://*.mercadolibre.com https://*.mercadolivre.com;
      img-src 'self' data: https://*.mercadopago.com https://events.mercadopago.com https://*.mlstatic.com https://*.mercadolibre.com https://*.mercadolivre.com https://*.mercadopago.com.ar;
      font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com;
      media-src 'self' https://*.mercadopago.com https://events.mercadopago.com;
    `.replace(/\s{2,}/g, ' ').trim();

    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          // CORS headers más permisivos para debugging
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-CSRF-Token' }, // Añadido X-CSRF-Token
          { key: 'Access-Control-Allow-Credentials', value: 'true' }, // Importante para cookies
        ],
      },
      // Assets estáticos: cache largo
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Resto de rutas: CSP básico + headers de seguridad
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },
};

export default nextConfig;