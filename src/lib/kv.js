// filepath: c:\Users\Owner\Downloads\MP\src\lib\kv.js
import { createClient } from '@vercel/kv';

export const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

/**
 * Obtiene el stock actual de un producto
 */
export async function getProductStock(productId) {
  try {
    const stock = await kv.get(`product:${productId}:stock`);
    return stock !== null ? stock : 0;
  } catch (error) {
    console.error('Error obteniendo stock:', error);
    return 0;
  }
}

/**
 * Actualiza el stock de un producto
 */
export async function updateProductStock(productId, newStock) {
  try {
    if (typeof newStock !== 'number' || isNaN(newStock)) {
      console.error('Error: Stock debe ser un número válido');
      return false;
    }
    
    await kv.set(`product:${productId}:stock`, newStock);
    return true;
  } catch (error) {
    console.error('Error actualizando stock:', error);
    return false;
  }
}

// Nota: Si estás seguro de que Vercel inyecta las variables
// correctamente en process.env, podrías usar:
// import { kv } from '@vercel/kv';
// export { kv };
// Pero la forma explícita con createClient es más clara.