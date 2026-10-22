import React, { useState } from 'react';
import { Database, Check, Copy } from 'lucide-react';

interface LocalDatabaseIdBadgeProps {
  id: number | string | undefined | null;
  tableLabel?: string;
  className?: string;
  compact?: boolean;
}

/**
 * 🏷️ LocalDatabaseIdBadge
 * يعرض المعرف (ID) في قاعدة البيانات المحلية (Dexie) الذي ستتم مزامنته إلى Supabase
 * مع إمكانية النسخ بضغطة واحدة وتلميح واضح للمستخدم.
 */
export const LocalDatabaseIdBadge: React.FC<LocalDatabaseIdBadgeProps> = ({
  id,
  tableLabel,
  className = '',
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);

  if (id === undefined || id === null || id === '') {
    return null;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(String(id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tooltip = `المعرف المحلي (Local ID) في قاعدة البيانات المحلية: #${id} ${tableLabel ? `(${tableLabel})` : ''} — وهو المعرّف المرجعي الذي تتم مزامنته إلى Supabase`;

  return (
    <span
      onClick={handleCopy}
      title={tooltip}
      className={`inline-flex items-center gap-1 font-mono font-black rounded-md border transition-all cursor-pointer select-none group/badge ${
        copied
          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-300'
          : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border-slate-200 hover:border-indigo-300 shadow-2xs'
      } ${compact ? 'text-[10px] px-1.5 py-0.2' : 'text-[11px] px-2 py-0.5'} ${className}`}
      dir="ltr"
    >
      <Database
        size={compact ? 10 : 11}
        className={copied ? 'text-emerald-600' : 'text-indigo-600 group-hover/badge:rotate-12 transition-transform'}
      />
      <span className="text-slate-400 font-sans text-[10px]">ID:</span>
      <span className="tracking-tight font-extrabold">{id}</span>
      {copied ? (
        <Check size={compact ? 9 : 10} className="text-emerald-600 ml-0.5" />
      ) : (
        <Copy
          size={compact ? 8 : 9}
          className="text-slate-300 group-hover/badge:text-indigo-500 opacity-0 group-hover/badge:opacity-100 transition-opacity ml-0.5"
        />
      )}
    </span>
  );
};
