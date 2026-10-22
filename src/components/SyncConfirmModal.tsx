import React, { useState, useEffect } from 'react';
import { Cloud, AlertTriangle, X, Check } from 'lucide-react';
import { setSyncConfirmHandler } from '../services/supabaseSync';

interface PendingDialog {
  message: string;
  resolve: (value: boolean) => void;
}

export const SyncConfirmModal: React.FC = () => {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  useEffect(() => {
    // Register global confirm handler with supabaseSync service
    setSyncConfirmHandler((message: string) => {
      return new Promise<boolean>((resolve) => {
        setPending({ message, resolve });
      });
    });

    return () => {
      setSyncConfirmHandler(null);
    };
  }, []);

  if (!pending) return null;

  const handleConfirm = () => {
    const resolve = pending.resolve;
    setPending(null);
    resolve(true);
  };

  const handleCancel = () => {
    const resolve = pending.resolve;
    setPending(null);
    resolve(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div 
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15 text-amber-300">
              <Cloud size={22} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-wide">تأكيد المزامنة ومنع تكرار السجلات</h3>
              <p className="text-xs text-indigo-100 font-medium">تم رصد نسخة مطابقة في السحابة</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="إلغاء"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-3.5 p-4 rounded-xl bg-amber-50 border border-amber-200/80 mb-5 text-amber-900 text-sm leading-relaxed">
            <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="whitespace-pre-line font-medium text-slate-800">
              {pending.message}
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-normal mb-1">
            💡 بالضغط على <strong>"ربط وتحديث النسخة السحابية"</strong>، سيتم تحديث السجل القائم في Supabase بدقة ومنع تكرار السجلات أو تشتيت بيانات الطلاب.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-bold transition-colors cursor-pointer"
          >
            إلغاء المزامنة
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-black shadow-sm hover:shadow transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Check size={16} />
            <span>نعم، ربط وتحديث النسخة السحابية</span>
          </button>
        </div>
      </div>
    </div>
  );
};
