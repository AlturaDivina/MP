// Archivo: next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@mercadopago/sdk-react'],
  },
  
  // Mejorar hidratación y SSR
  reactStrictMode: true,
  
  // Headers para mejorar compatibilidad móvil
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Header específico para viewport móvil
          {
            key: 'X-Mobile-Viewport',
            value: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
          },
        ],
      },
    ]
  },

  // Configuración para mejor manejo de errores
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },

  // Webpack config para mejorar compatibilidad
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
}

export default nextConfig