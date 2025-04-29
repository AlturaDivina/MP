import { NextResponse } from 'next/server';
import { kv } from '../../../lib/kv';
import { products as staticProducts } from '../../../data/products';

// IMPORTANTE: Clave secreta para autorizar las peticiones desde Sheets
const API_SECRET_KEY = process.env.SHEETS_API_SECRET || "tu-clave-secreta-aqui";

export async function POST(req) {
  try {
    // Verificar autenticación
    const body = await req.json();
    
    if (!body.auth || body.auth !== API_SECRET_KEY) {
      console.warn('Intento de acceso no autorizado a sheets-sync API');
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    
    // Procesar diferentes operaciones
    const { operation } = body;
    let result;
    
    switch (operation) {
      case 'fetch':
        result = await fetchData();
        break;
        
      case 'update-stock':
        result = await updateStock(body.updates);
        break;
        
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
    // Obtener las claves de productos y stock
    const productKeys = await kv.keys('product:*');
    const stockKeys = await kv.keys('stock:*');
    
    // Si no hay productos, usar los datos estáticos
    let products;
    if (!productKeys || productKeys.length === 0) {
      products = staticProducts;
    } else {
      // Obtener los datos de productos desde KV
      const productValues = await kv.mget(...productKeys);
      products = productValues.filter(p => p !== null);
    }
    
    // Obtener datos de stock
    const stock = {};
    if (stockKeys && stockKeys.length > 0) {
      const stockValues = await kv.mget(...stockKeys);
      
      // Construir objeto de stock
      stockKeys.forEach((key, index) => {
        // Extraer ID del formato 'stock:ID'
        const id = key.split(':')[1];
        stock[id] = stockValues[index];
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
      
      const stockKey = `stock:${update.id}`;
      
      // Obtener stock actual
      let currentStock = await kv.get(stockKey) || 0;
      
      // Calcular nuevo stock (incremento/decremento según el valor)
      const newStock = currentStock + update.change;
      
      // No permitir stock negativo (opcional)
      const finalStock = Math.max(0, newStock);
      
      // Actualizar en KV
      await kv.set(stockKey, finalStock);
      
      // Guardar resultado
      results[update.id] = finalStock;
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
      if (!product.id || !product.name || typeof product.price !== 'number') {
        results[product.id || 'unknown'] = 'Error: datos inválidos';
        continue;
      }
      
      const productKey = `product:${product.id}`;
      
      // Actualizar en KV
      await kv.set(productKey, {
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: product.price,
        category: product.category || 'general'
      });
      
      // Guardar resultado
      results[product.id] = 'Actualizado';
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