import { supabase } from './supabase';

// All parent writes go through the manage-parents Edge Function, because
// creating logins and resetting passwords needs the Supabase admin key.
export async function parentAction(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('manage-parents', {
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

export function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return phone || '';
}

export function localDigits(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

export function timeAgo(iso) {
  const t = new Date(iso);
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}
