import { NextResponse } from 'next/server';
import { kv, getProductStock, updateProductStock } from '../../../lib/kv';
import { products as staticProducts } from '../../../data/products';

// IMPORTANTE: Clave secreta para autorizar las peticiones desde Sheets
const API_SECRET_KEY = process.env.SHEETS_API_SECRET || "tu-clave-secreta-aqui";

export async function POST(req) {
  try {
    // Verificar autenticación
    const body = await req.json();
    
    // Verificamos si está usando secretKey (nombre del campo en Google Apps Script) o auth
    if ((!body.secretKey && !body.auth) || (body.secretKey !== API_SECRET_KEY && body.auth !== API_SECRET_KEY)) {
      console.warn('Intento de acceso no autorizado a sheets-sync API');
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    
    // Procesar diferentes operaciones
    const { action, operation } = body;
    const effectiveOperation = action || operation; // Compatibilidad con ambos campos
    let result;
    
    switch (effectiveOperation) {
      case 'fetch':
        result = await fetchData();
        break;
        
      case 'update_stock':
      case 'update-stock':
        result = await updateStock(body.updates);
        break;
        
      case 'update_products':
      case 'update-products':
        result = await updateProducts(body.products);
        break;
        
      default:
        return NextResponse.json({ success: false, error: 'Operación desconocida' }, { status: 400 });
    }
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Error en sheets-sync API:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Error del servidor' 
    }, { status: 500 });
  }
}

// Obtiene todos los productos y su stock actual
async function fetchData() {
  try {
    // Obtener las claves de productos
    const productKeys = await kv.keys('product:*');
    
    // CORRECCIÓN: Usar formato correcto para claves de stock
    const stockKeys = await kv.keys('product:*:stock');
    
    // Si no hay productos, usar los datos estáticos
    let products;
    if (!productKeys || productKeys.length === 0) {
      products = staticProducts;
    } else {
      // Filtrar las claves que no son de stock (para evitar duplicados)
      const pureProdKeys = productKeys.filter(key => !key.endsWith(':stock'));
      
      // Obtener los datos de productos desde KV
      const productValues = await kv.mget(...pureProdKeys);
      products = productValues.filter(p => p !== null);
    }
    
    // Obtener datos de stock
    const stock = {};
    if (stockKeys && stockKeys.length > 0) {
      const stockValues = await kv.mget(...stockKeys);
      
      // Construir objeto de stock
      stockKeys.forEach((key, index) => {
        // CORRECCIÓN: Extraer ID del formato 'product:ID:stock'
        const parts = key.split(':');
        if (parts.length >= 3) {
          const id = parts[1]; // Obtener el ID (segundo elemento)
          stock[id] = stockValues[index];
        }
      });
    }
    
    return {
      success: true,
      products: products,
      stock: stock
    };
    
  } catch (error) {
    console.error('Error obteniendo datos para Google Sheets:', error);
    throw error;
  }
}

// Actualiza el stock de productos
async function updateStock(updates) {
  if (!updates || !Array.isArray(updates)) {
    return { success: false, error: 'Formato de actualizaciones inválido' };
  }
  
  const results = {};
  
  try {
    // Procesar cada actualización
    for (const update of updates) {
      if (!update.id || typeof update.change !== 'number') {
        results[update.id || 'unknown'] = 'Error: datos inválidos';
        continue;
      }
      
      // CORRECCIÓN: Usar formato correcto para la clave de stock
      const productId = update.id;
      
      // Obtener stock actual usando la función auxiliar
      let currentStock = await getProductStock(productId);
      
      // Calcular nuevo stock (incremento/decremento según el valor)
      const newStock = currentStock + update.change;
      
      // No permitir stock negativo (opcional)
      const finalStock = Math.max(0, newStock);
      
      // Actualizar en KV usando la función auxiliar
      await updateProductStock(productId, finalStock);
      
      // Guardar resultado
      results[productId] = finalStock;
    }
    
    return {
      success: true,
      results: results
    };
    
  } catch (error) {
    console.error('Error actualizando stock desde Google Sheets:', error);
    throw error;
  }
}

// Actualiza información de productos
async function updateProducts(products) {
  if (!products || !Array.isArray(products)) {
    return { success: false, error: 'Formato de productos inválido' };
  }
  
  const results = {};
  
  try {
    // Procesar cada producto
    for (const product of products) {
      if (!product.id) {
        results['unknown'] = 'Error: ID de producto requerido';
        continue;
      }
      
      const productKey = `product:${product.id}`;
      
      // Obtener el producto existente
      const existingProduct = await kv.get(productKey);
      
      if (!existingProduct) {
        // Para productos nuevos sí exigir todos los campos
        if (!product.name || typeof product.price !== 'number') {
          results[product.id] = 'Error: nombre y precio requeridos para nuevos productos';
          continue;
        }
        
        // Crear nuevo producto
        await kv.set(productKey, {
          id: product.id,
          name: product.name,
          description: product.description || '',
          price: product.price,
          category: product.category || 'general'
        });
        
        // Si se proporciona stock inicial, establecerlo
        if (product.hasOwnProperty('stockAvailable')) {
          await updateProductStock(product.id, product.stockAvailable);
        }
        
        results[product.id] = 'Nuevo producto creado';
      } else {
        // Para productos existentes, actualizar solo los campos proporcionados
        const updatedProduct = {
          ...existingProduct,
          // Actualizar solo los campos proporcionados
          ...(product.name && { name: product.name }),
          ...(product.description !== undefined && { description: product.description }),
          ...(typeof product.price === 'number' && { price: product.price }),
          ...(product.category && { category: product.category })
        };
        
        await kv.set(productKey, updatedProduct);
        
        // Si se proporciona stock, actualizarlo
        if (product.hasOwnProperty('stockAvailable')) {
          await updateProductStock(product.id, product.stockAvailable);
        }
        
        results[product.id] = 'Producto actualizado';
      }
    }
    
    return {
      success: true,
      results: results
    };
  } catch (error) {
    console.error('Error actualizando productos desde Google Sheets:', error);
    throw error;
  }
}