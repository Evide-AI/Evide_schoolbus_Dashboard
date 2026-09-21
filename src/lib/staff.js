import { supabase } from './supabase';

// All writes for drivers/conductors go through the manage-staff Edge Function,
// because creating logins needs the Supabase admin key (never in the browser).
export async function staffAction(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('manage-staff', {
    body: { action, ...payload },
  });
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* not JSON */ }
    if (/Failed to send a request|fetch/i.test(message)) {
      message = 'Could not reach the server. Check your internet connection and try again.';
    }
    throw new Error(message);
  }
  return data;
}

export const ROLE_LABEL = { driver: 'Driver', conductor: 'Conductor' };

// Same rules as the Edge Function, for instant feedback in the form.
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return `+91${d}`;
}

// +919947496965 -> +91 99474 96965
export function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return phone || '';
}

// Local 10 digits for the edit form: +919947496965 -> 9947496965
export function localDigits(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}
