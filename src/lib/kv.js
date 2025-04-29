// filepath: c:\Users\Owner\Downloads\MP\src\lib\kv.js
import { createClient } from '@vercel/kv';

export const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Nota: Si estás seguro de que Vercel inyecta las variables
// correctamente en process.env, podrías usar:
// import { kv } from '@vercel/kv';
// export { kv };
// Pero la forma explícita con createClient es más clara.