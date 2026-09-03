import { supabase } from './supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

export function formatAuthError(error: any): string {
  if (!error) return 'حدث خطأ غير متوقع أثناء تسجيل الدخول.';
  const msg = error.message || String(error);
  
  if (msg.includes('Invalid login credentials')) {
    return 'بيانات تسجيل الدخول غير متطابقة (تأكد من صحة البريد الإلكتروني وكلمة المرور في Supabase Auth، أو استخدم رابط إعادة تعيين كلمة المرور).';
  }
  if (msg.includes('Email not confirmed')) {
    return 'البريد الإلكتروني بحاجة لتأكيد التسجيل في Supabase Auth. يرجى تفعيل الحساب أو تأكيد البريد.';
  }
  if (msg.includes('User not found')) {
    return 'المستخدم غير مسجل في Supabase Auth. يرجى التأكد من البريد المسجل.';
  }
  if (msg.includes('Too many requests') || msg.includes('rate limit')) {
    return 'تم إرسال محاولات كثيرة في وقت قصير. يرجى الانتظار دقيقة والمحاولة مجدداً.';
  }
  return `فشل تسجيل الدخول: ${msg}`;
}

/**
 * Authenticates an admin user with email and password via Supabase Auth.
 * Automatically persists the session in localStorage via supabase-js.
 */
export async function loginAdmin(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password.trim(),
  });

  if (error) {
    throw new Error(formatAuthError(error));
  }

  if (!data.session) {
    throw new Error('لم يتم استلام جلسة صالحة من خادم المصادقة.');
  }

  return data.session;
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
 * Retrieves the current Supabase Auth session.
 */
export async function getCurrentSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('Error fetching current session:', error.message);
      return null;
    }
    return data.session;
  } catch (err) {
    console.error('Failed to get session:', err);
    return null;
  }
}

/**
 * Retrieves the currently authenticated Supabase user.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Subscribes to Supabase Auth state changes (login, logout, token refresh).
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
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(`فشل تسجيل الخروج: ${error.message}`);
  }
}
