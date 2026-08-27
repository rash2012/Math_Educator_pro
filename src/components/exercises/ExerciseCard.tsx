import React from 'react';
import { type PracticeExercise } from '../../db';
import { MathRenderer } from '../MathRenderer';
import { cleanAndEnforceMathSvg } from '../../services/gemini';
import { 
  Edit3, CheckCircle, Sparkles, Scissors, ImageIcon, 
  Copy, CopyCheck, CopyPlus, Trash2, Loader2 
} from 'lucide-react';

interface ExerciseCardProps {
  exercise: PracticeExercise;
  index: number;
  sectionId: number;
  showSolutions: boolean;
  copiedId: string | null;
  aiLoading: { exId: string; type: 'solution' | 'shorten' | 'svg' } | null;
  onEdit: () => void;
  onVerify: () => void;
  onGenerateSolution: () => void;
  onShortenSolution: () => void;
  onGenerateSvg: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exercise,
  index,
  showSolutions,
  copiedId,
  aiLoading,
  onEdit,
  onVerify,
  onGenerateSolution,
  onShortenSolution,
  onGenerateSvg,
  onCopy,
  onDuplicate,
  onDelete
}) => {
  const isCurrentLoading = (type: 'solution' | 'shorten' | 'svg') => 
    aiLoading?.exId === exercise.id && aiLoading?.type === type;

  // Extract SVGs and make them responsive
  const extractSvgs = (text: string = ''): string[] => {
    if (!text) return [];
    const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
    const matches = text.match(svgRegex);
    return matches || [];
  };

  const makeSvgResponsive = (svgHtml: string): string => {
    if (!svgHtml) return '';
    return cleanAndEnforceMathSvg(svgHtml);
  };

  const svgs = extractSvgs(exercise.svgCode);

  return (
    <div 
      className="bg-white rounded-2xl border border-gray-200 shadow-xs border-r-4 border-r-violet-600 overflow-hidden text-right print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:bg-transparent transition-all hover:border-violet-200 page-break-avoid mb-6 print:mb-4"
    >
      {/* Exercise Header Bar */}
      <div className="bg-violet-50/20 px-5 py-3 border-b border-gray-200/70 flex justify-between items-center flex-wrap gap-2 print:bg-transparent print:border-none print:px-0 print:py-1 print:mb-1.5">
        <span className="text-xs md:text-sm font-black text-violet-950 flex items-center gap-2 font-sans print:text-black">
          <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-[11px] font-black flex items-center justify-center shadow-xs print:bg-violet-800 print:text-white">
            {index + 1}
          </span>
          <span>{exercise.title || `التمرين ${index + 1}`}</span>
        </span>

        {/* Action Tools (no-print) */}
        <div className="flex items-center gap-1.5 flex-wrap no-print">
          {/* Edit Manually */}
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-violet-50 text-violet-700 text-xs font-black rounded-xl border border-violet-200 transition-all shadow-2xs cursor-pointer"
            title="تعديل هذا التمرين يدوياً مع شريط معادلات LaTeX ومعاينة حية"
          >
            <Edit3 size={13} />
            <span>تعديل يدوي</span>
          </button>

          {/* AI Verification */}
          <button
            onClick={onVerify}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all shadow-2xs cursor-pointer"
            title="التحقق من صحة الحل ودقته رياضياً وتنسيقه"
          >
            <CheckCircle size={13} />
            <span>تدقيق وتصحيح</span>
          </button>

          {/* Model Solution */}
          <button
            onClick={onGenerateSolution}
            disabled={isCurrentLoading('solution')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black rounded-xl border border-indigo-200 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            title="توليد الحل النموذجي بالذكاء الاصطناعي لكافة الطلبات"
          >
            {isCurrentLoading('solution') ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span>الحل النموذجي</span>
          </button>

          {/* Shorten Solution */}
          <button
            onClick={onShortenSolution}
            disabled={isCurrentLoading('shorten') || !exercise.solutionText?.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-black rounded-xl border border-amber-200 transition-all cursor-pointer disabled:opacity-40 shadow-2xs"
            title="تقليص واختصار الحل لحذف الشروحات المطولة وجعله ملخصاً ومناسباً للطباعة"
          >
            {isCurrentLoading('shorten') ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />}
            <span>تقليص الحل</span>
          </button>

          {/* AI SVG Generator */}
          <button
            onClick={onGenerateSvg}
            disabled={isCurrentLoading('svg')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-black rounded-xl border border-violet-200 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            title="تصميم وتوليد رسم هندسي توضيحي SVG لهذا التمرين"
          >
            {isCurrentLoading('svg') ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
            <span>رسم SVG</span>
          </button>

          {/* Copy */}
          <button
            onClick={onCopy}
            className="p-1.5 text-gray-500 hover:text-slate-900 hover:bg-gray-100 rounded-lg transition-all cursor-pointer"
            title="نسخ نص المسألة والحل"
          >
            {copiedId === exercise.id ? <CopyCheck size={15} className="text-emerald-600" /> : <Copy size={15} />}
          </button>

          {/* Duplicate */}
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-500 hover:text-slate-900 hover:bg-gray-100 rounded-lg transition-all cursor-pointer"
            title="تكرار التمرين"
          >
            <CopyPlus size={15} />
          </button>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
            title="حذف التمرين"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Exercise Card Body */}
      <div className="p-5 space-y-4 print:p-0 print:space-y-2">
        {/* Question & Strategy Container */}
        <div className="space-y-3 w-full">
          {/* Question Box */}
          <div className="question-box flow-root text-[14px] leading-relaxed text-gray-900 p-4 rounded-xl border border-slate-200/80 text-right w-full font-medium bg-[#f0f9ff]">
            {/* If solutions are hidden or no solution text, and there is dedicated svgCode not already in questionText, float it in question */}
            {(!showSolutions || !exercise.solutionText?.trim()) && svgs.length > 0 && !exercise.questionText?.includes('<svg') && (
              <div className="float-left w-[180px] xs:w-[220px] sm:w-[260px] md:w-[300px] mr-4 sm:mr-6 mb-3 sm:mb-4 bg-transparent flex flex-col items-center gap-2 print:float-left print:w-[220px] animate-fade-in">
                {svgs.map((svgHtml, sIdx) => (
                  <div key={sIdx} className="w-full text-center">
                    <div 
                      className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                      dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                    />
                  </div>
                ))}
              </div>
            )}
            {exercise.questionText ? (
              <MathRenderer content={exercise.questionText} />
            ) : (
              <span className="text-xs text-gray-400 italic">نص التمرين فارغ (اضغط على "تعديل يدوي" لكتابة نص المسألة)</span>
            )}
          </div>

          {/* Strategy Box (💡 فكرة واستراتيجية الحل السريعة) */}
          {exercise.strategyText && exercise.strategyText.trim() && (
            <div className="strategy-box p-3.5 bg-yellow-50/80 rounded-xl border border-[#78350f] text-xs text-amber-950 leading-relaxed font-sans font-medium text-right w-full clear-both print:bg-[#fefce8] print:border-[#78350f]">
              <span className="font-extrabold text-amber-900 block mb-1">💡 فكرة واستراتيجية الحل:</span>
              <MathRenderer content={exercise.strategyText} />
            </div>
          )}
        </div>

        {/* Solution Box (🔑 الحل النموذجي والتفصيلي) */}
        {showSolutions && exercise.solutionText && exercise.solutionText.trim() && (
          <div className="pt-3 border-t border-gray-150 space-y-2 text-right">
            <span className="text-xs font-black text-emerald-800 block font-sans">🔑 الحل النموذجي للتمرين:</span>
            <div className="solution-box flow-root text-[14px] leading-relaxed text-slate-850 p-4 border-r-3 border-emerald-500 rounded-l-xl rounded-r-none border-t border-b border-l border-emerald-100/50 text-right w-full bg-[#f0fdf4] transition-all">
              {/* If exercise has dedicated svgCode and it's not already embedded in solutionText, float it inside the solution container on the left */}
              {svgs.length > 0 && !exercise.solutionText.includes('<svg') && (
                <div className="float-left w-[180px] xs:w-[220px] sm:w-[260px] md:w-[300px] mr-4 sm:mr-6 mb-3 sm:mb-4 bg-transparent flex flex-col items-center gap-2 print:float-left print:w-[220px] animate-fade-in">
                  {svgs.map((svgHtml, sIdx) => (
                    <div key={sIdx} className="w-full text-center">
                      <div 
                        className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                        dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                      />
                    </div>
                  ))}
                </div>
              )}
              <MathRenderer content={exercise.solutionText} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
