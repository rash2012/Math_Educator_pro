import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Lock, Globe } from 'lucide-react';
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
  type SyncStatus
} from '../services/supabaseSync';
import { getSupabaseConfig } from '../services/supabaseClient';

export interface SyncStatusBadgeProps {
  table: 'documents' | 'tests' | 'questionBanks' | 'examSummaries' | 'pastPapers' | 'unitQuizzes' | 'unitMindMaps' | 'unitComprehensiveReviews' | 'lessonSections';
  id: number | string;
  data: any;
  compact?: boolean;
  onSyncComplete?: () => void;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  table,
  id,
  data,
  compact = false,
  onSyncComplete,
}) => {
  const [status, setStatus] = useState<SyncStatus>('not_synced');
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasConfig, setHasConfig] = useState(true);

  const checkStatus = async () => {
    try {
      const config = getSupabaseConfig();
      if (!config.url || !config.anonKey) {
        setHasConfig(false);
      } else {
        setHasConfig(true);
      }
      if (id && data) {
        const currentStatus = await getSyncStatus(table, id, data);
        setStatus(currentStatus);
      }
    } catch (e) {
      console.error('Error checking sync status:', e);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [table, id, data]);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSyncing || !id) return;

    setIsSyncing(true);
    setErrorMessage(null);

    try {
      let result = { success: false, message: '' };
      const numId = Number(id);

      if (table === 'documents') {
        result = await syncDocumentHierarchy(numId, false);
      } else if (table === 'tests') {
        result = await syncSingleTest(numId, false);
      } else if (table === 'questionBanks') {
        result = await syncSingleQuestionBank(numId, false);
      } else if (table === 'examSummaries') {
        result = await syncSingleExamSummary(numId, false);
      } else if (table === 'pastPapers') {
        result = await syncSinglePastPaper(numId, false);
      } else if (table === 'unitQuizzes') {
        result = await syncSingleUnitQuiz(numId, false);
      } else if (table === 'unitMindMaps') {
        result = await syncSingleUnitMindMap(numId, false);
      } else if (table === 'unitComprehensiveReviews') {
        result = await syncSingleUnitComprehensiveReview(numId, false);
      }

      if (result.success) {
        await checkStatus();
        onSyncComplete?.();
      } else {
        setErrorMessage(result.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل في المزامنة');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!hasConfig) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 ${
          compact ? 'text-[10px] px-1.5' : ''
        }`}
        title="الاتصال بـ Supabase غير مهيأ بعد"
      >
        <CloudOff size={compact ? 11 : 13} className="text-slate-400" />
        {!compact && <span>مخزن محلياً</span>}
      </span>
    );
  }

  if (table === 'questionBanks') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 ${
          compact ? 'text-[10px] px-1.5' : ''
        }`}
        title="قسم بنك الأسئلة قيد إعادة الهيكلة ومستثنى مؤقتاً من المزامنة"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        {!compact && <span>محلي (مستثنى من المزامنة)</span>}
      </span>
    );
  }

  if (isSyncing) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200 animate-pulse ${
          compact ? 'text-[10px] px-1.5' : ''
        }`}
      >
        <RefreshCw size={compact ? 11 : 13} className="animate-spin text-violet-600" />
        {!compact && <span>جارِ النشر والمزامنة...</span>}
      </span>
    );
  }

  if (status === 'synced') {
    return (
      <button
        onClick={handleManualSync}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer group ${
          compact ? 'text-[10px] px-2' : ''
        }`}
        title="معتمدة ومنشورة للطلاب على السحابة (انقر لإعادة المزامنة)"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        <CheckCircle2 size={compact ? 11 : 13} className="text-emerald-600" />
        <span>{compact ? 'منشور ومعتمد 🟢' : 'منشور ومعتمد 🟢'}</span>
      </button>
    );
  }

  if (status === 'draft_cloud') {
    return (
      <button
        onClick={handleManualSync}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer group ${
          compact ? 'text-[10px] px-1.5' : ''
        }`}
        title="مسودة سحابية (غير معتمدة للطلاب، انقر للاعتماد والنشر)"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
        <Lock size={compact ? 11 : 13} className="text-sky-600" />
        <span>{compact ? 'مسودة سحابية' : 'مسودة سحابية (انقر للنشر)'}</span>
      </button>
    );
  }

  if (status === 'modified') {
    return (
      <button
        onClick={handleManualSync}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer group animate-pulse ${
          compact ? 'text-[10px] px-1.5' : ''
        }`}
        title="يوجد تعديلات محلية لم تُنشر بعد (انقر للاعتماد والنشر)"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        <RefreshCw size={compact ? 11 : 13} className="text-amber-600 group-hover:rotate-180 transition-transform" />
        <span>{compact ? 'معدلة 🟡' : 'معدّلة (انقر للنشر 🟡)'}</span>
      </button>
    );
  }

  // Not synced (🔴)
  return (
    <button
      onClick={handleManualSync}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer group animate-pulse ${
        compact ? 'text-[10px] px-1.5' : ''
      }`}
      title={errorMessage || 'مسودة محلية لم تُعتمد أو تُنشر بعد (انقر للنشر إلى Supabase)'}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
      <Cloud size={compact ? 11 : 13} className="text-rose-600" />
      <span>{compact ? 'لم تُنشر 🔴' : 'لم تُنشر (انقر للاعتماد 🔴)'}</span>
    </button>
  );
};
