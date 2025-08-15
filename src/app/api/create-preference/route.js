import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { logInfo, logError, logWarn } from '../../../utils/logger';
import { validateCsrfToken } from '../../../utils/csrf';
// FIX: rutas correctas hacia src/lib
import { normalizeDisplayMode, validateCustomerByMode } from '../../../lib/validation';
import { logSecurityEvent } from '../../../lib/security-logger';

export async function POST(req) {
  try {
    const body = await req.json();
    const displayMode = normalizeDisplayMode(body?.displayMode);

    if (displayMode === 'familyFriends') {
      const customer = body?.customer || {};
      const { valid, errors } = validateCustomerByMode(displayMode, customer);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid customer', details: errors }), { status: 400 });
      }
    }

    // Validar origen
    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    const allowedOrigins = [
      'https://alturadivina.com',
      'https://www.alturadivina.com',
      'https://framer.com',
      'https://mercadopagoiframe.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
    ];
    const isAllowedOrigin = allowedOrigins.some(allowed => origin.includes(allowed) || referer.includes(allowed));
    if (!isAllowedOrigin && process.env.NODE_ENV === 'production') {
      logSecurityEvent('invalid_preference_origin', { origin, referer });
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }

    // Instanciar SDK de MP
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
    const preference = new Preference(client);

    const finalSuccessUrl = body.successUrl;
    const finalPendingUrl = body.pendingUrl;
    const finalFailureUrl = body.failureUrl;

    // Construir payer base desde override o desde body.payer
    const payerInput = body?.payerOverride ?? body?.payer ?? null
    let payer = null

    if (payerInput) {
      // Nombre y apellido
      const fullName = payerInput.name || body?.customer?.fullName || ''
      let name = payerInput.first_name || ''
      let surname = payerInput.last_name || ''
      if (!name && fullName) {
        const parts = String(fullName).trim().split(/\s+/)
        surname = parts.length > 1 ? parts.pop() : ''
        name = parts.join(' ') || fullName
      }

      // Teléfono
      let phone
      if (payerInput.phone) {
        if (typeof payerInput.phone === 'object') {
          const raw = String(payerInput.phone.number || '').replace(/\D/g, '')
          if (raw.length >= 3) {
            phone = {
              area_code: raw.substring(0, Math.min(3, raw.length - 1) || 2),
              number: raw.substring(Math.min(3, raw.length - 1) || 2),
            }
          }
        } else if (typeof payerInput.phone === 'string') {
          const raw = payerInput.phone.replace(/\D/g, '')
          if (raw.length >= 3) {
            phone = {
              area_code: raw.substring(0, Math.min(3, raw.length - 1) || 2),
              number: raw.substring(Math.min(3, raw.length - 1) || 2),
            }
          }
        }
      }

      payer = {
        email: payerInput.email || 'cliente@example.com',
        name,
        surname,
        ...(phone ? { phone } : {}),
      }

      // Dirección/identificación si existieran en full
      if (payerInput.identification?.type && payerInput.identification?.number) {
        payer.identification = {
          type: payerInput.identification.type,
          number: payerInput.identification.number,
        }
      }
      if (payerInput.address?.street_name) {
        payer.address = {
          street_name: payerInput.address.street_name,
          street_number: payerInput.address.street_number ? String(payerInput.address.street_number) : undefined,
          zip_code: payerInput.address.zip_code || undefined,
        }
      }
    }

    // Preparar items para la preferencia
    const items = body.orderSummary.map(item => ({
      id: item.productId.toString(),
      title: item.name || `Producto ID: ${item.productId}`,
      description: item.description || 'Sin descripción',
      quantity: parseInt(item.quantity),
      currency_id: 'MXN',
      unit_price: parseFloat(item.price)
    }));

    // Calcular monto total
    const totalAmount = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    
    // Crear objeto de preferencia
    const preferenceData = {
      items,
      back_urls: { success: finalSuccessUrl, failure: finalFailureUrl, pending: finalPendingUrl },
      auto_return: "approved",
      statement_descriptor: "TuTienda Online",
      external_reference: `order-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || undefined,
      ...(payer ? { payer } : {}),
      metadata: { ...(body?.metadata || {}), displayMode },
    }

    if (body.shipments?.receiver_address) {
      preferenceData.shipments = {
        mode: body.shipments.mode || "custom",
        cost: body.shipments.cost || 0,
        local_pickup: body.shipments.local_pickup || false,
        receiver_address: {
          zip_code: body.shipments.receiver_address.zip_code,
          street_name: body.shipments.receiver_address.street_name,
          street_number: body.shipments.receiver_address.street_number,
          city_name: body.shipments.receiver_address.city_name,
          state_name: body.shipments.receiver_address.state_name || "",
          country_name: body.shipments.receiver_address.country_name || "México"
        }
      }
    }

    logInfo("Datos de preferencia:", JSON.stringify(preferenceData));

    const response = await preference.create({ body: preferenceData });

    logInfo("Preferencia creada exitosamente:", {
      preferenceId: response.id,
      items: items.map(i => ({ id: i.id, title: i.title })),
    });

    return NextResponse.json({
      preferenceId: response.id,
      totalAmount,
      init_point: response.init_point,
    });
  } catch (error) {
    logError('create-preference error', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}