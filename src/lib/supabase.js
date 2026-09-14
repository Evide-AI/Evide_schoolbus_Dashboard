import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaces a clear message during dev instead of a cryptic runtime crash.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file.');
}

export const supabase = createClient(url, anonKey);
