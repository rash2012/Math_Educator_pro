import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/newSchema.types';

const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const STORAGE_KEY_URL = 'math_educator_supabase_url';
const STORAGE_KEY_KEY = 'math_educator_supabase_anon_key';

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const storedUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) || '' : '';
  const storedKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_KEY) || '' : '';

  return {
    url: storedUrl || envUrl || '',
    anonKey: storedKey || envKey || '',
  };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim());
    else localStorage.removeItem(STORAGE_KEY_URL);

    if (anonKey) localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
    else localStorage.removeItem(STORAGE_KEY_KEY);
  }
}

const initialConfig = getSupabaseConfig();
const clientUrl = initialConfig.url || 'https://placeholder.supabase.co';
const clientKey = initialConfig.anonKey || 'placeholder-anon-key';

// Primary Typed Supabase Client instance with persistent authentication session
export const supabase = createClient<Database>(clientUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function getSupabaseClient(): SupabaseClient<Database> {
  return supabase;
}
