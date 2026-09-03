import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  ArrowLeft, 
  AlertCircle, 
  Loader2, 
  GraduationCap, 
  Sparkles,
  KeyRound,
  UserCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { loginAdmin, sendPasswordResetEmail } from '../services/authService';

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (userEmail: string) => void;
  onSwitchToStudent?: () => void;
  allowClose?: boolean;
  onClose?: () => void;
}

const ADMIN_ACCOUNTS = [
  'abosamsyria@gmail.com',
  'sam26092010@gmail.com',
  'salyear2007@gmail.com'
];

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onLoginSuccess,
  onSwitchToStudent,
  allowClose = false,
  onClose
}) => {
  const [email, setEmail] = useState('abosamsyria@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setResetSuccessMessage(null);

    try {
      const session = await loginAdmin(email, password);
      const userEmail = session.user?.email || email;
      onLoginSuccess(userEmail);
    } catch (err: any) {
      console.error('Supabase Auth error:', err);
      setErrorMessage(
        err.message || 'فشل تسجيل الدخول. يرجى التأكد من صحة البريد الإلكتروني وكلمة المرور في Supabase Auth.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setErrorMessage('يرجى كتابة البريد الإلكتروني أولاً لإرسال رابط إعادة التعيين.');
      return;
    }

    setIsResetting(true);
    setErrorMessage(null);
    setResetSuccessMessage(null);

    try {
      await sendPasswordResetEmail(email);
      setResetSuccessMessage(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${email}. يرجى التحقق من صندوق الوارد أو البريد غير الهام.`);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setErrorMessage(err.message || 'تعذر إرسال رابط استعادة كلمة المرور.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-scale-up">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white p-6 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-indigo-400/20 rounded-full blur-xl pointer-events-none" />

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-md mb-3">
            <GraduationCap className="text-amber-300 drop-shadow-md" size={32} />
          </div>

          <h2 className="text-xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            Math Educator Pro
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 shadow-xs">
              لوحة الإدارة
            </span>
          </h2>
          <p className="text-xs text-indigo-200 font-medium mt-1">
            تسجيل دخول المعلم / المسؤول (Supabase Auth)
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-700 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <ShieldCheck size={18} />
            </div>
            <div className="text-xs text-indigo-950 leading-relaxed">
              <span className="font-black block text-indigo-900 mb-0.5">مصادقة آمنة بحساب مسؤول</span>
              تسجيل الدخول الفعلي يمنح جلسة موثقة تتيح مزامنة واعتماد الكراسات والوحدات والاختبارات بقاعدة البيانات.
            </div>
          </div>

          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold text-rose-800 flex items-start gap-2 animate-shake">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span>{errorMessage}</span>
                {errorMessage.includes('غير متطابقة') && (
                  <div className="text-[11px] font-normal text-rose-700 mt-1">
                    * ملاحظة: يمكنك التحقق من كلمة المرور أو إعادة تعيينها عبر الرابط بالأسفل أو من خلال <strong>Supabase Dashboard ➔ Authentication ➔ Users</strong>.
                  </div>
                )}
              </div>
            </div>
          )}

          {resetSuccessMessage && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-bold text-emerald-800 flex items-start gap-2 animate-fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>{resetSuccessMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Mail size={14} className="text-indigo-600" />
                البريد الإلكتروني:
              </label>
              <div className="relative">
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-400 font-bold ml-1">حسابات المسؤول:</span>
                {ADMIN_ACCOUNTS.map((acc) => (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => setEmail(acc)}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer font-mono ${
                      email === acc
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {acc.split('@')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <Lock size={14} className="text-indigo-600" />
                  كلمة المرور:
                </label>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  title="إرسال رابط إعادة تعيين كلمة المرور إلى البريد الإلكتروني"
                >
                  <KeyRound size={12} />
                  {isResetting ? 'جاري الإرسال...' : 'نسيت كلمة المرور؟'}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 pl-10 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-indigo-700 to-indigo-900 hover:from-indigo-800 hover:to-slate-900 text-white font-black py-3 px-4 rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>جاري التحقق والمصادقة...</span>
                </>
              ) : (
                <>
                  <span>تسجيل الدخول إلى لوحة المعلم</span>
                  <ArrowLeft size={16} />
                </>
              )}
            </button>
          </form>

          {/* Student Mode / Dismiss Options */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            {onSwitchToStudent && (
              <button
                type="button"
                onClick={onSwitchToStudent}
                className="text-xs font-bold text-violet-700 hover:text-violet-900 flex items-center gap-1.5 py-1 px-2 hover:bg-violet-50 rounded-xl transition-colors cursor-pointer"
              >
                <UserCheck size={14} />
                <span>الدخول كطالب (تصفح وتدريب)</span>
              </button>
            )}

            {allowClose && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 py-1 px-2 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer mr-auto"
              >
                إغلاق
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
