import React from 'react';
import { LucideIcon } from 'lucide-react';

interface UnifiedPageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badgeText?: string;
  badgeColor?: 'violet' | 'emerald' | 'amber' | 'blue' | 'rose' | 'indigo' | 'sky';
  actions?: React.ReactNode;
}

export const UnifiedPageHeader: React.FC<UnifiedPageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  badgeText,
  badgeColor = 'violet',
  actions,
}) => {
  const getBadgeStyle = () => {
    switch (badgeColor) {
      case 'emerald':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
      case 'amber':
        return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
      case 'blue':
        return 'bg-blue-500/20 text-blue-300 border-blue-400/30';
      case 'sky':
        return 'bg-sky-500/20 text-sky-300 border-sky-400/30';
      case 'rose':
        return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
      case 'indigo':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30';
      default:
        return 'bg-violet-500/20 text-violet-300 border-violet-400/30';
    }
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-xs border border-indigo-900/40 mb-8 no-print">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-white/10 rounded-2xl border border-white/15 text-indigo-300 backdrop-blur-xs shadow-inner flex items-center justify-center shrink-0">
            <Icon size={28} className="text-white drop-shadow-xs" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {title}
              </h1>
              {badgeText && (
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getBadgeStyle()}`}>
                  {badgeText}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-indigo-200/80 font-medium mt-1">
              {subtitle}
            </p>
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
