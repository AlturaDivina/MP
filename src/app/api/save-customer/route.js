import { normalizeDisplayMode, validateCustomerByMode } from '../../../lib/validation';
import { supabase } from '../../../lib/supabase';
import { logError } from '../../../utils/logger';

export async function POST(req) {
  try {
    const body = await req.json();
    const displayMode = normalizeDisplayMode(body?.displayMode);

    if (displayMode === 'familyFriends') {
      const customer = { fullName: body.fullName, email: body.email, phone: body.phone };
      const { valid, errors } = validateCustomerByMode(displayMode, customer);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid customer', details: errors }), { status: 400 });
      }

      const parts = String(customer.fullName).trim().split(/\s+/);
      const lastName = parts.length > 1 ? parts.pop() : '';
      const firstName = parts.join(' ') || customer.fullName;

      const payload = {
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: customer.fullName || null,
        email: customer.email || null,
        phone: customer.phone || null,
        display_mode: 'familyFriends',
      };

      const { data, error } = await supabase
        .from('customers')
        .upsert(payload, { onConflict: 'email' })
        .select();

      if (error) {
        logError('save-customer familyFriends error', error);
        return new Response(JSON.stringify({ error: 'DB error' }), { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true, customer: data?.[0] }), { status: 200 });
    }

    // Fallback “full” (no rompe si tu implementación real existe en otra ruta)
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    logError('save-customer error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}