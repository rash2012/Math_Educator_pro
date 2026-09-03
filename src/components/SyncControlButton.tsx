import React, { useState, useEffect } from 'react';
import { Cloud, RefreshCw, CheckCircle2, AlertCircle, Sparkles, Lock, Globe } from 'lucide-react';
import {
  getSyncStatus,
  syncDocumentHierarchy,
  syncSingleTest,
  syncSingleQuestionBank,
  syncSingleExamSummary,
  syncSinglePastPaper,
  syncSingleUnitQuiz,
  syncSingleUnitMindMap,
  syncSingleUnitComprehensiveReview,
  syncSingleExerciseFamily,
  type SyncStatus,
  type SyncResult
} from '../services/supabaseSync';
import { getSupabaseConfig } from '../services/supabaseClient';

export type SyncableTable =
  | 'documents'
  | 'tests'
  | 'questionBanks'
  | 'examSummaries'
  | 'pastPapers'
  | 'unitQuizzes'
  | 'unitMindMaps'
  | 'unitComprehensiveReviews'
  | 'exerciseFamilies';

interface SyncControlButtonProps {
  table: SyncableTable;
  id: number | string;
  data: any;
  variant?: 'primary' | 'secondary' | 'compact' | 'minimal' | 'full';
  showDraftOption?: boolean;
  buttonText?: string;
  onSyncComplete?: (result: SyncResult) => void;
  className?: string;
}

export const SyncControlButton: React.FC<SyncControlButtonProps> = ({
  table,
  id,
  data,
  variant = 'primary',
  showDraftOption = false,
  buttonText,
  onSyncComplete,
  className = '',
}) => {
  const [status, setStatus] = useState<SyncStatus>('not_synced');
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);

  const checkStatus = async () => {
    try {
      const config = getSupabaseConfig();
      if (!config.url || !config.anonKey) {
        setIsConfigured(false);
        return;
      }
      setIsConfigured(true);
      if (id && data) {
        const currentStatus = await getSyncStatus(table, id, data);
        setStatus(currentStatus);
      }
    } catch (e) {
      console.error('Error checking sync status in SyncControlButton:', e);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [table, id, data]);

  const executeSync = async (isDraft: boolean = false) => {
    if (isSyncing || !id) return;

    setIsSyncing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let result: SyncResult = { success: false, message: '' };
      const numId = Number(id);

      switch (table) {
        case 'documents':
          result = await syncDocumentHierarchy(numId, isDraft);
          break;
        case 'tests':
          result = await syncSingleTest(numId, isDraft);
          break;
        case 'questionBanks':
          result = await syncSingleQuestionBank(numId, isDraft);
          break;
        case 'examSummaries':
          result = await syncSingleExamSummary(numId, isDraft);
          break;
        case 'pastPapers':
          result = await syncSinglePastPaper(numId, isDraft);
          break;
        case 'unitQuizzes':
          result = await syncSingleUnitQuiz(numId, isDraft);
          break;
        case 'unitMindMaps':
          result = await syncSingleUnitMindMap(numId, isDraft);
          break;
        case 'unitComprehensiveReviews':
          result = await syncSingleUnitComprehensiveReview(numId, isDraft);
          break;
        case 'exerciseFamilies':
          result = await syncSingleExerciseFamily(numId || id, isDraft);
          break;
        default:
          throw new Error('نوع الجدول غير مدعوم للمزامنة الفردية');
      }

      if (result.success) {
        setSuccessMessage(result.message || 'تمت المزامنة والاعتماد بنجاح!');
        await checkStatus();
        onSyncComplete?.(result);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setErrorMessage(result.message || 'تعذرت المزامنة');
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } catch (err: any) {
      const msg = err.message || 'حدث خطأ أثناء المزامنة';
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 ${className}`}>
        <Cloud size={14} className="text-slate-400" />
        <span>مخزن محلياً (Supabase غير مهيأ)</span>
      </div>
    );
  }

  if (table === 'questionBanks') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
        <span>قسم بنك الأسئلة مستثنى حالياً من المزامنة (قيد إعادة الهيكلة)</span>
      </div>
    );
  }

  const isPending = status === 'not_synced' || status === 'modified' || status === 'draft_cloud';

  if (variant === 'minimal') {
    return (
      <button
        type="button"
        disabled={isSyncing}
        onClick={() => executeSync(false)}
        className={`relative inline-flex items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${
          isPending
            ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs animate-pulse'
            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
        } ${className}`}
        title={
          status === 'synced'
            ? 'منشورة ومعتمدة للطلاب (انقر للتحديث)'
            : status === 'modified'
            ? 'يوجد تعديلات محلية تحتاج اعتماد ونشر 🟡'
            : 'لم تُنشر بعد 🔴 (انقر للاعتماد والنشر)'
        }
      >
        {isSyncing ? (
          <RefreshCw size={16} className="animate-spin text-current" />
        ) : status === 'synced' ? (
          <CheckCircle2 size={16} className="text-emerald-600" />
        ) : (
          <RefreshCw size={16} className="text-current" />
        )}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        disabled={isSyncing}
        onClick={() => executeSync(false)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
          isSyncing
            ? 'bg-violet-50 text-violet-700 border-violet-200 animate-pulse'
            : status === 'synced'
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
            : status === 'modified'
            ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs animate-pulse'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 shadow-xs animate-pulse'
        } ${className}`}
      >
        {isSyncing ? (
          <>
            <RefreshCw size={13} className="animate-spin text-current" />
            <span>جارِ النشر...</span>
          </>
        ) : status === 'synced' ? (
          <>
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>منشور ومعتمد ✓</span>
          </>
        ) : status === 'modified' ? (
          <>
            <RefreshCw size={13} className="text-white" />
            <span>نشر التعديلات 🟡</span>
          </>
        ) : (
          <>
            <Globe size={13} className="text-white" />
            <span>اعتماد ونشر 🚀</span>
          </>
        )}
      </button>
    );
  }

  // Full / Primary Bar
  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      {/* Primary Publish Button */}
      <button
        type="button"
        disabled={isSyncing}
        onClick={() => executeSync(false)}
        className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all shadow-xs cursor-pointer ${
          isSyncing
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : status === 'synced'
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : isPending
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-indigo-400 ring-offset-2 animate-pulse'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}
      >
        {isSyncing ? (
          <>
            <RefreshCw size={16} className="animate-spin text-white" />
            <span>جارِ الاعتماد والنشر إلى Supabase...</span>
          </>
        ) : status === 'synced' ? (
          <>
            <CheckCircle2 size={16} className="text-white" />
            <span>معتمد ومنشور للطلاب (إعادة مزامنة)</span>
          </>
        ) : status === 'modified' ? (
          <>
            <Sparkles size={16} className="text-amber-300" />
            <span>اعتماد ونشر التعديلات الجديدة 🚀</span>
          </>
        ) : (
          <>
            <Globe size={16} className="text-white" />
            <span>{buttonText || 'اعتماد ونشر المحتوى للطلاب 🚀'}</span>
          </>
        )}
      </button>

      {/* Optional Save as Draft Button */}
      {showDraftOption && (
        <button
          type="button"
          disabled={isSyncing}
          onClick={() => executeSync(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
          title="حفظ ومزامنة سحابية كمسودة دون ظهورها في تطبيق الطلاب"
        >
          <Lock size={14} className="text-slate-500" />
          <span>حفظ كمسودة سحابية</span>
        </button>
      )}

      {/* Dynamic Feedback Popups */}
      {successMessage && (
        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-fade-in">
          {successMessage}
        </span>
      )}
      {errorMessage && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 animate-fade-in">
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
