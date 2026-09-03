import React, { useState, useEffect } from 'react';
import { Cloud, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  getUnitSyncAggregateStatus,
  syncDocumentHierarchy,
  type UnitSyncAggregateInfo,
  type SyncResult
} from '../services/supabaseSync';
import { getSupabaseConfig } from '../services/supabaseClient';

interface UnitSyncIndicatorProps {
  docId: number;
  compact?: boolean;
  onSyncComplete?: () => void;
  className?: string;
}

export const UnitSyncIndicator: React.FC<UnitSyncIndicatorProps> = ({
  docId,
  compact = false,
  onSyncComplete,
  className = '',
}) => {
  const [info, setInfo] = useState<UnitSyncAggregateInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasConfig, setHasConfig] = useState(true);

  const loadStatus = async () => {
    try {
      const config = getSupabaseConfig();
      if (!config.url || !config.anonKey) {
        setHasConfig(false);
        return;
      }
      setHasConfig(true);
      const agg = await getUnitSyncAggregateStatus(docId);
      setInfo(agg);
    } catch (err) {
      console.error('Error loading unit aggregate sync status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [docId]);

  const handleSyncUnit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSyncing || !docId) return;

    setIsSyncing(true);
    setErrorMessage(null);

    try {
      const res: SyncResult = await syncDocumentHierarchy(docId, false);
      if (res.success) {
        await loadStatus();
        onSyncComplete?.();
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشلت مزامنة الوحدة');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!hasConfig || !info || !info.hasItems) {
    return null;
  }

  if (isSyncing) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200 animate-pulse ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <RefreshCw size={12} className="animate-spin text-violet-600" />
        <span>جارِ اعتماد ونشر الوحدة...</span>
      </div>
    );
  }

  if (info.isFullySynced) {
    return (
      <button
        type="button"
        onClick={handleSyncUnit}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer group ${className}`}
        title={`جميع عناصر الوحدة (${info.totalItems} عنصر) معتمدة ومنشورة للطلاب. انقر لإعادة المزامنة.`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        <CheckCircle2 size={13} className="text-emerald-600" />
        <span>{compact ? 'منشورة بالكامل ✓' : `منشورة بالكامل (${info.totalItems} عنصر)`}</span>
      </button>
    );
  }

  // Pending sync items exist
  return (
    <button
      type="button"
      onClick={handleSyncUnit}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-colors cursor-pointer animate-pulse ${className}`}
      title={errorMessage || `يوجد ${info.pendingCount} عنصر بحاجة للاعتماد والمزامنة مع Supabase (انقر للنشر الفوري)`}
    >
      <Cloud size={13} className="text-white" />
      <span>{`☁️ ${info.pendingCount} عنصر بانتظار المزامنة`}</span>
    </button>
  );
};
