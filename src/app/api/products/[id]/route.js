import { NextResponse } from 'next/server';
import { kv } from '../../../../lib/kv'; // Importa el cliente KV

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const productKey = `product:${id}`; // Usa el prefijo

    console.log("Fetching product from KV with key:", productKey);

    // Obtiene el producto desde KV
    const product = await kv.get(productKey);

    if (!product) {
      console.log("Product not found in KV for key:", productKey);
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      );
    }

    // Asegúrate de que el producto tenga la estructura esperada
    // (KV almacena el objeto JSON que guardaste)
    return NextResponse.json(product);

  } catch (error) {
    console.error("Error fetching product from KV:", error);
    return NextResponse.json(
      { error: 'Error interno del servidor al leer producto' },
      { status: 500 }
    );
  }
}