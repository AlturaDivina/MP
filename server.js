const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const selfsigned = require('selfsigned');
const crypto = require('crypto');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Generate a more secure self-signed certificate
const attrs = [
  { name: 'commonName', value: 'localhost' },
  { name: 'organizationName', value: 'Local Development' }
];

// Generate with stronger attributes
const pems = selfsigned.generate(attrs, {
  days: 365,
  algorithm: 'sha256',
  keySize: 2048,
  extensions: [
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }
  ]
});

const httpsOptions = {
  key: pems.private,
  cert: pems.cert
};

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    // Log all incoming requests for debugging
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    
    // Add security headers
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Add CORS headers for API routes
    if (req.url.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Idempotency-Key');
      
      // Handle OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
    }

    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on https://localhost:3000');
  });
});