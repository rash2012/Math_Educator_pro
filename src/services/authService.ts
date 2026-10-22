import { supabase, getSupabaseConfig } from './supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

const LOCAL_ADMIN_SESSION_KEY = 'math_educator_admin_session';
const MASTER_ADMIN_PASSWORDS = ['zxc0123'];

function createLocalAdminSession(email: string): Session {
  const cleanEmail = email.trim();
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'local_admin_' + Date.now(),
    refresh_token: 'local_admin_ref_' + Date.now(),
    expires_in: 3600 * 24 * 30,
    expires_at: now + 3600 * 24 * 30,
    token_type: 'bearer',
    user: {
      id: 'local-admin-' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'),
      app_metadata: { provider: 'local_admin', role: 'admin' },
      user_metadata: { role: 'admin', name: 'المدرّس حسن راشد العلي' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: cleanEmail,
      role: 'authenticated',
    },
  };
}

export function formatAuthError(error: any): string {
  if (!error) return 'حدث خطأ غير متوقع أثناء تسجيل الدخول.';
  const msg = error.message || String(error);
  
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
    return 'تعذر الاتصال بخادم المصادقة (Failed to fetch). رابط مشروع Supabase غير مهيأ بعد أو غير متاح. يمكنك الدخول بكلمة مرور المدير (zxc0123) في الوضع المحلي، أو إدخال رابط المشروع الصحيح من إعدادات الربط.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'بيانات تسجيل الدخول غير متطابقة (تأكد من صحة البريد وكلمة المرور، أو استخدم كلمة مرور المدير المعتمدة: zxc0123).';
  }
  if (msg.includes('Email not confirmed')) {
    return 'البريد الإلكتروني بحاجة لتأكيد التسجيل في Supabase Auth. يرجى تفعيل الحساب أو تأكيد البريد.';
  }
  if (msg.includes('User not found')) {
    return 'المستخدم غير مسجل في Supabase Auth. يرجى التأكد من البريد المسجل أو الدخول بكلمة مرور المدير: zxc0123.';
  }
  if (msg.includes('Too many requests') || msg.includes('rate limit')) {
    return 'تم إرسال محاولات كثيرة في وقت قصير. يرجى الانتظار دقيقة والمحاولة مجدداً.';
  }
  return `فشل تسجيل الدخول: ${msg}`;
}

/**
 * Authenticates an admin user with email and password.
 * Prioritizes Supabase Auth when configured, and supports local admin session
 * fallback with master password (zxc0123) when offline or unconfigured.
 */
export async function loginAdmin(email: string, password: string): Promise<Session> {
  const cleanEmail = email.trim();
  const cleanPass = password.trim();

  const config = getSupabaseConfig();
  const isPlaceholderUrl = !config.url || config.url.includes('placeholder.supabase.co');

  // If Supabase URL is not yet configured, allow immediate login with master admin password
  if (isPlaceholderUrl) {
    if (MASTER_ADMIN_PASSWORDS.includes(cleanPass)) {
      const localSession = createLocalAdminSession(cleanEmail);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_ADMIN_SESSION_KEY, JSON.stringify(localSession));
      }
      return localSession;
    }
    throw new Error('رابط مشروع Supabase السحابي غير مهيأ بعد. يرجى استخدام كلمة مرور المدير الافتراضية: zxc0123 أو إدخال بيانات مشروع Supabase من إعدادات الربط بالأسفل.');
  }

  // Real Supabase URL is configured: try Supabase Auth first
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    if (!error && data?.session) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCAL_ADMIN_SESSION_KEY);
      }
      return data.session;
    }

    // If Supabase Auth rejects but password matches master admin password, grant local admin access
    if (MASTER_ADMIN_PASSWORDS.includes(cleanPass)) {
      const localSession = createLocalAdminSession(cleanEmail);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_ADMIN_SESSION_KEY, JSON.stringify(localSession));
      }
      return localSession;
    }

    if (error) {
      throw new Error(formatAuthError(error));
    }

    throw new Error('لم يتم استلام جلسة صالحة من خادم المصادقة.');
  } catch (err: any) {
    // If network connection failed ("Failed to fetch") and password is master admin password, allow fallback!
    if (MASTER_ADMIN_PASSWORDS.includes(cleanPass)) {
      const localSession = createLocalAdminSession(cleanEmail);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_ADMIN_SESSION_KEY, JSON.stringify(localSession));
      }
      return localSession;
    }
    throw new Error(formatAuthError(err));
  }
}

/**
 * Sends a password reset email to the specified admin email.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirectUrl,
  });

  if (error) {
    throw new Error(`فشل إرسال رابط الاستعادة: ${error.message}`);
  }
}

/**
 * Retrieves the current Supabase Auth session or local Admin session.
 */
export async function getCurrentSession(): Promise<Session | null> {
  // 1. Check local admin session
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(LOCAL_ADMIN_SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.user) return parsed as Session;
      } catch (e) {
        // ignore
      }
    }
  }

  // 2. Check Supabase Auth if configured
  const config = getSupabaseConfig();
  if (config.url && !config.url.includes('placeholder.supabase.co')) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session) {
        return data.session;
      }
    } catch (err) {
      console.warn('Error fetching Supabase session:', err);
    }
  }

  return null;
}

/**
 * Retrieves the currently authenticated user.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentSession();
  return session?.user || null;
}

/**
 * Subscribes to Supabase Auth state changes.
 */
export function subscribeToAuthChanges(callback: (isLoggedIn: boolean, session: Session | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(!!session, session);
  });

  return subscription;
}

/**
 * Signs out the current user and clears the authenticated session.
 */
export async function logoutAdmin(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOCAL_ADMIN_SESSION_KEY);
  }
  const config = getSupabaseConfig();
  if (config.url && !config.url.includes('placeholder.supabase.co')) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut error:', e);
    }
  }
}
