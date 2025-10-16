import { NextResponse } from 'next/server';
import rateLimit from '../../rate-limit';
import { supabaseAdmin } from '../../../../lib/supabase';
import { logInfo, logError } from '../../../../utils/logger';
import { sanitizeInput } from '../../../../utils/security';

// Simple, consistent coupon validation endpoint
export async function POST(req) {
  try {
    // Rate limit by IP
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rl = rateLimit.limiter(ip);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests', retryAt: rl.reset }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    let code = sanitizeInput(body?.code || '', 64);
    const subtotal = Number(body?.subtotal ?? 0);

    // Basic input checks
    code = String(code || '').trim();
    if (!code || code.length < 2 || code.length > 64) {
      return NextResponse.json({ valid: false, error: 'Código inválido' }, { status: 400 });
    }
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return NextResponse.json({ valid: false, error: 'Subtotal inválido' }, { status: 400 });
    }

    const normalized = code.toUpperCase();

    // Look up active code (case-insensitive)
    const { data, error } = await supabaseAdmin
      .from('discount_codes')
      .select('code, percent_off, active')
      .eq('active', true)
      .ilike('code', normalized)
      .maybeSingle();

    if (error) {
      logError('Error buscando discount code:', error);
      return NextResponse.json({ valid: false, error: 'Error de validación' }, { status: 500 });
    }

    if (!data || !data.active) {
      return NextResponse.json({ valid: false, error: 'Código no encontrado o inactivo' }, { status: 404 });
    }

    const percent = Number(data.percent_off || 0);
    if (!Number.isFinite(percent) || percent <= 0) {
      return NextResponse.json({ valid: false, error: 'Código inválido' }, { status: 404 });
    }

    const discountAmount = Math.max(0, Math.round((subtotal * (percent / 100)) * 100) / 100);

    logInfo('Cupón validado', { code: normalized, percent, discountAmount });

    return NextResponse.json({
      valid: true,
      code: normalized,
      percent_off: percent,
      discount_amount: discountAmount,
    });
  } catch (err) {
    logError('Error en /api/discounts/validate:', err);
    return NextResponse.json({ valid: false, error: 'Error interno' }, { status: 500 });
  }
}
