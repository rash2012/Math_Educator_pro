import React, { useState } from 'react';
import { 
  Database, 
  Key, 
  Link, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Save, 
  Loader2, 
  RefreshCw,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { getSupabaseConfig, saveSupabaseConfig, getSupabaseClient } from '../../services/supabaseClient';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState<string>(currentConfig.url || '');
  const [anonKey, setAnonKey] = useState<string>(currentConfig.anonKey || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({
        status: 'error',
        message: 'يرجى إدخال رابط المشروع (URL) والمفتاح المجهول (Anon Key) أولاً.'
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Temporarily save to test with active client
      saveSupabaseConfig(url.trim(), anonKey.trim());
      const client = getSupabaseClient() as any;

      // Quick test query to a standard table
      const { data, error, status } = await client
        .from('NewUnits')
        .select('id')
        .limit(1);

      if (error) {
        setTestResult({
          status: 'error',
          message: `فشل الاتصال بـ Supabase (رمز HTTP: ${status || 'خطأ'})`,
          details: error.message || JSON.stringify(error)
        });
      } else {
        setTestResult({
          status: 'success',
          message: `تم الاتصال بنجاح مع Supabase! (رمز HTTP: ${status || 200})`,
          details: 'قاعدة البيانات جاهزة لاستقبال وتحديث السجلات.'
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: 'تعذر الوصول إلى خادم Supabase:',
        details: err.message || String(err)
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveSupabaseConfig(url.trim(), anonKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onSaved?.();
      onClose();
    }, 900);
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div 
        className="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 text-white p-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl text-white">
              <Database size={22} />
            </div>
            <div>
              <h3 className="text-base font-black">إعدادات الاتصال بقاعدة بيانات Supabase</h3>
              <p className="text-xs text-indigo-100 font-medium">المزامنة السحابية للتمارين والمسائل وبنك الأسئلة</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/15 rounded-lg transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-indigo-950">
              <ShieldCheck size={14} className="text-indigo-600" />
              <span>اتصال آمن ومباشر مع Supabase</span>
            </p>
            <p className="text-[11px] text-indigo-800 leading-relaxed">
              تُحفظ هذه الإعدادات محلياً في متصفحك. تتيح لك المزامنة السريعة للدروس، التمارين، كراسات التدرّب، وبنوك الأسئلة دون وسيط.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Link size={13} className="text-indigo-600" />
                <span>رابط المشروع (Project URL / VITE_SUPABASE_URL):</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Key size={13} className="text-amber-600" />
                <span>المفتاح العام (anon key / VITE_SUPABASE_ANON_KEY):</span>
              </label>
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                dir="ltr"
              />
            </div>
          </div>

          {/* Test connection feedback */}
          {testResult && (
            <div className={`p-3 rounded-xl border text-xs animate-in fade-in duration-150 ${
              testResult.status === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}>
              <div className="flex items-start gap-2">
                {testResult.status === 'success' ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-black">{testResult.message}</p>
                  {testResult.details && (
                    <p className="text-[11px] font-mono mt-1 opacity-90 break-all">{testResult.details}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-black flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-700" />
              <span>تم حفظ الإعدادات وتحديث الاتصال بنجاح!</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 sm:px-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !url || !anonKey}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition border cursor-pointer ${
              testing || !url || !anonKey
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 active:scale-95'
            }`}
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>اختبار الاتصال</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
            >
              <Save size={14} />
              <span>حفظ الاتصال</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
