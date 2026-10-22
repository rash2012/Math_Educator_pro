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

let activeClient: SupabaseClient<Database> | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

function createInstance(url: string, anonKey: string): SupabaseClient<Database> {
  const safeUrl = url.trim() || 'https://placeholder.supabase.co';
  const safeKey = anonKey.trim() || 'placeholder-anon-key';
  return createClient<Database>(safeUrl, safeKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function getSupabaseClient(): SupabaseClient<Database> {
  const config = getSupabaseConfig();
  if (!activeClient || config.url !== lastUsedUrl || config.anonKey !== lastUsedKey) {
    lastUsedUrl = config.url;
    lastUsedKey = config.anonKey;
    activeClient = createInstance(config.url, config.anonKey);
  }
  return activeClient;
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim());
    else localStorage.removeItem(STORAGE_KEY_URL);

    if (anonKey) localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
    else localStorage.removeItem(STORAGE_KEY_KEY);
  }
  lastUsedUrl = url ? url.trim() : '';
  lastUsedKey = anonKey ? anonKey.trim() : '';
  activeClient = createInstance(lastUsedUrl, lastUsedKey);
}

// Dynamic proxy ensuring all imported references to `supabase` delegate to the active client
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
