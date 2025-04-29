import { NextResponse } from 'next/server';
import { kv } from '../../../lib/kv'; // Importa el cliente KV

export async function GET() {
  try {
    // Asume que los IDs de producto están almacenados con el prefijo "product:"
    const productKeys = await kv.keys('product:*');

    if (!productKeys || productKeys.length === 0) {
      return NextResponse.json([]); // Devuelve array vacío si no hay productos
    }

    // Obtiene todos los productos usando mget (más eficiente)
    const products = await kv.mget(...productKeys);

    // Filtra posibles valores null si alguna clave expiró entre keys() y mget()
    const validProducts = products.filter(p => p !== null);

    return NextResponse.json(validProducts);
  } catch (error) {
    console.error('Error obteniendo productos desde KV:', error);
    return NextResponse.json({ error: 'Error interno del servidor al leer productos' }, { status: 500 });
  }
}