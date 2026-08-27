import React from 'react';
import { type Document } from '../../db';
import { type CoverStyle, getCoverThemeStyles } from './exercisePrintTypes';
import { Edit3 } from 'lucide-react';

interface ExerciseCoverPageProps {
  document: Document;
  coverBgStyle: CoverStyle;
  footerText: string;
  onEditMetadata?: () => void;
}

export const ExerciseCoverPage: React.FC<ExerciseCoverPageProps> = ({
  document,
  coverBgStyle,
  footerText,
  onEditMetadata,
}) => {
  const cov = getCoverThemeStyles(coverBgStyle);

  const formattedFooter = footerText
    .replace('{teacherName}', document.teacherName || 'حسن راشد العلي')
    .replace('{title}', document.title || '')
    .replace('{unitName}', document.unit || '');

  return (
    <div
      className={`print-cover-page relative flex flex-col justify-between border-2 p-8 md:p-14 rounded-3xl mb-10 min-h-[500px] md:min-h-[720px] overflow-hidden select-none ${cov.wrapper}`}
      style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
    >
      {/* Decorative blurred background shapes */}
      <div className="absolute -right-20 -top-20 w-80 h-80 bg-violet-200/10 rounded-full blur-3xl pointer-events-none no-print" />
      <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-sky-200/10 rounded-full blur-3xl pointer-events-none no-print" />

      {/* TOP: Academic Metadata Badges */}
      <div className="flex flex-col items-start text-right space-y-1.5 z-10 font-sans">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border font-bold text-[11px] md:text-xs ${cov.badgeUnified}`}>
          <span className="opacity-75 font-medium">المادة:</span>
          <span className="font-bold">{document.subject || 'الرياضيات'}</span>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border font-bold text-[11px] md:text-xs ${cov.badgeUnified}`}>
          <span className="opacity-75 font-medium">الصف:</span>
          <span className="font-bold">{document.grade || 'الثالث الثانوي العلمي (بكالوريا)'}</span>
        </div>
        {document.part && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border font-bold text-[11px] md:text-xs ${cov.badgeUnified}`}>
            <span className="opacity-75 font-medium">الجزء:</span>
            <span className="font-bold">{document.part}</span>
          </div>
        )}
        {document.unit && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border font-bold text-[11px] md:text-xs ${cov.badgeUnified}`}>
            <span className="opacity-75 font-medium">الوحدة:</span>
            <span className="font-bold">{document.unit}</span>
          </div>
        )}
      </div>

      {/* CENTER: Main Booklet Title & Teacher info */}
      <div className="flex flex-col items-center justify-center text-center my-auto py-10 z-10 space-y-4">
        <div className={`inline-block px-4 py-1 rounded-full font-black text-[11px] uppercase tracking-widest mb-1 shadow-xs ${cov.seriesBadge}`}>
          {document.seriesName || 'سلسلة التعلم الذكي📚✨'}
        </div>

        <h1 className={`text-3xl md:text-5xl font-black tracking-tight leading-tight max-w-2xl font-sans drop-shadow-xs ${cov.title}`}>
          {document.title}
        </h1>

        {document.topic && (
          <p className="text-xs md:text-sm font-bold opacity-80 max-w-xl font-sans">
            {document.topic}
          </p>
        )}

        <div className="flex flex-col items-center gap-1 mt-4">
          <span className={`text-base md:text-xl font-bold tracking-wide font-sans ${cov.teacherLabel}`}>
            إعداد المدرّس: {document.teacherName || 'حسن راشد العلي'}
          </span>
          <span className={`text-xs font-bold font-sans ${cov.teacherRole}`}>
            مدرّس مادة الرياضيات والعلوم التفاعلية
          </span>
        </div>

        {onEditMetadata && (
          <button
            type="button"
            onClick={onEditMetadata}
            className="no-print mt-4 px-4 py-2 bg-violet-100 hover:bg-violet-200 text-violet-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs border border-violet-200 cursor-pointer"
          >
            <Edit3 size={13} />
            <span>تعديل بيانات الغلاف 📝</span>
          </button>
        )}
      </div>

      {/* BOTTOM: Rights & Platform Footer */}
      <div className={`flex flex-col items-center text-center mt-auto pt-6 border-t z-10 w-full max-w-xl mx-auto font-sans relative ${cov.footerText.split(' ')[1] || 'border-violet-200'}`}>
        <div className="w-32 h-0.5 bg-gradient-to-r from-transparent via-violet-300 to-transparent mb-3" />
        <p className={`text-[10px] md:text-xs font-bold leading-relaxed ${cov.footerText.split(' ')[0]}`}>
          {formattedFooter}
        </p>
      </div>
    </div>
  );
};
