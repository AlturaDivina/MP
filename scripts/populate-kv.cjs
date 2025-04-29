require('dotenv').config({ path: '.env.local' }); // Carga variables desde .env.local
const { createClient } = require('@vercel/kv');

// Crea una instancia del cliente KV
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Usa import() dinámico dentro de una función async
async function populateProducts() {
  console.log('Starting KV population...');

  // Carga los productos usando import() dinámico
  let products;
  try {
    // Asegúrate que la ruta sea correcta y usa la extensión .js
    const productsModule = await import('../src/data/products.js');
    products = productsModule.products; // Accede a la exportación nombrada 'products'
  } catch (err) {
    console.error('Error importing products:', err);
    return;
  }


  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error('Error: KV_REST_API_URL or KV_REST_API_TOKEN environment variables are not set.');
    console.log('Make sure .env.local is correctly loaded or variables are set in the environment.');
    return;
  }

  if (!products || products.length === 0) {
    console.log('No products found or loaded from src/data/products.js');
    return;
  }

  // Usa un pipeline para eficiencia
  const pipeline = kv.pipeline();

  for (const product of products) {
    if (!product || !product.id || typeof product.price !== 'number') {
      console.warn(`Skipping invalid product data: ${JSON.stringify(product)}`);
      continue;
    }

    const productKey = `product:${product.id}`;
    console.log(`Adding product: ${productKey}`);
    pipeline.set(productKey, product);

    if (typeof product.stockAvailable === 'number') {
       const stockKey = `stock:${product.id}`;
       console.log(`Setting initial stock for ${stockKey}: ${product.stockAvailable}`);
       pipeline.set(stockKey, product.stockAvailable);
    } else {
       console.warn(`Product ${product.id} does not have a valid 'stockAvailable' property. Stock not set.`);
    }
  }

  try {
    const results = await pipeline.exec();
    console.log('Pipeline execution results:', results);
    console.log('KV population completed successfully!');
  } catch (error) {
    console.error('Error executing KV pipeline:', error);
  }
}

// Ejecuta la función
populateProducts();