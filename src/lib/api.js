// Calls the Node backend API (on EC2, behind school.evide.in).
// Only used for actions the backend owns — currently route generation.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Regenerate a bus's pickup+drop routes. Best-effort: if the backend is down
// (e.g. outside the 6am-7pm window), we don't block the student save — the
// route can be regenerated later. Returns { ok, error }.
export async function regenerateBusRoute(busId) {
  if (!API_BASE) return { ok: false, error: 'API base URL not configured' };
  try {
    const res = await fetch(`${API_BASE}/api/routes/${busId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // omit type => generate both pickup and drop
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `API ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
