import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Exported so edge-function helpers that hit /functions/v1/* via
// manual fetch can include the apikey header alongside the user's
// Authorization token (both required by the Supabase gateway).
export const SUPABASE_ANON_KEY = supabaseAnonKey || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not set. Running in offline mode.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isOnline = () => !!supabase;

// Centralized edge function base URL — use this instead of hardcoding
export const EDGE_FN_URL = supabaseUrl ? `${supabaseUrl}/functions/v1` : "";
