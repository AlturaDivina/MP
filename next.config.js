/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Apply to all API routes
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "upgrade-insecure-requests"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;