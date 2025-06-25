import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const baseUrl = process.env.NEXT_PUBLIC_HOST_URL || 'http://localhost:3000';

// Tests de XSS
const xssPayloads = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror=alert("XSS")>',
  'javascript:alert("XSS")',
  '"><script>alert("XSS")</script>',
  '<svg onload=alert("XSS")>',
  '&lt;script&gt;alert("XSS")&lt;/script&gt;'
];

// Tests de SQL Injection
const sqlPayloads = [
  "'; DROP TABLE payment_requests; --",
  "' OR '1'='1",
  "' UNION SELECT * FROM payment_requests --",
  "'; SELECT version(); --",
  "123'; DELETE FROM orders; --"
];

async function testXSSEndpoints() {
  console.log('🎯 Probando XSS en endpoints...');
  
  for (const payload of xssPayloads) {
    try {
      const response = await fetch(`${baseUrl}/api/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payload,
          status: 'approved'
        })
      });
      
      const result = await response.text();
      
      if (result.includes('<script>') || result.includes('alert(')) {
        console.log('❌ XSS VULNERABLE:', payload);
        console.log('   Respuesta:', result.substring(0, 100));
      } else {
        console.log('✅ XSS BLOQUEADO:', payload.substring(0, 30) + '...');
      }
    } catch (error) {
      console.log('⚠️ Error en test:', error.message);
    }
  }
}

async function testSQLInjection() {
  console.log('\n💉 Probando SQL Injection...');
  
  for (const payload of sqlPayloads) {
    try {
      const response = await fetch(`${baseUrl}/api/webhook?data.id=${encodeURIComponent(payload)}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-signature': 'ts=1234567890,v1=fake_signature_for_test'
        },
        body: JSON.stringify({
          action: 'payment.updated',
          data: { id: payload }
        })
      });
      
      const result = await response.text();
      
      // Buscar indicadores de SQL injection exitoso
      if (result.includes('syntax error') || 
          result.includes('DROP TABLE') || 
          result.includes('PostgreSQL') ||
          result.includes('mysql')) {
        console.log('❌ SQL INJECTION VULNERABLE:', payload);
        console.log('   Respuesta:', result.substring(0, 150));
      } else {
        console.log('✅ SQL INJECTION BLOQUEADO:', payload.substring(0, 30) + '...');
      }
    } catch (error) {
      console.log('⚠️ Error en test SQL:', error.message);
    }
  }
}

async function runSecurityTests() {
  console.log('🔒 Iniciando tests de seguridad...\n');
  
  await testXSSEndpoints();
  await testSQLInjection();
  
  console.log('\n✅ Tests de seguridad completados');
  console.log('\n💡 Recuerda:');
  console.log('   - Los tests ✅ indican que la protección está funcionando');
  console.log('   - Los tests ❌ indican vulnerabilidades que debes corregir');
  console.log('   - También prueba manualmente en el formulario web');
}

runSecurityTests().catch(console.error);