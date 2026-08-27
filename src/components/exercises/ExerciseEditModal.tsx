import React, { useState } from 'react';
import { type PracticeExercise } from '../../db';
import { MathRenderer } from '../MathRenderer';
import { cleanAndEnforceMathSvg } from '../../services/gemini';
import { X, Save, Wand2, ImageIcon, Loader2 } from 'lucide-react';

interface ExerciseEditModalProps {
  sectionId: number;
  exercise: PracticeExercise;
  onClose: () => void;
  onSave: (updated: PracticeExercise) => void;
  onAIGenerateSolution: (ex: PracticeExercise) => Promise<void>;
  onAIGenerateSvg: (ex: PracticeExercise) => Promise<void>;
  aiLoading: 'solution' | 'strategy' | 'svg' | 'shorten' | null;
}

export const ExerciseEditModal: React.FC<ExerciseEditModalProps> = ({
  sectionId,
  exercise: initialExercise,
  onClose,
  onSave,
  onAIGenerateSolution,
  onAIGenerateSvg,
  aiLoading
}) => {
  const [exercise, setExercise] = useState<PracticeExercise>({ ...initialExercise });
  const [activeTextareaField, setActiveTextareaField] = useState<'questionText' | 'strategyText' | 'solutionText'>('questionText');

  const LATEX_SYMBOLS = [
    { label: '①', insert: '① ', title: 'طلب رقم 1' },
    { label: '②', insert: '② ', title: 'طلب رقم 2' },
    { label: '③', insert: '③ ', title: 'طلب رقم 3' },
    { label: '④', insert: '④ ', title: 'طلب رقم 4' },
    { label: '⑤', insert: '⑤ ', title: 'طلب رقم 5' },
    { label: 'x/y', insert: '\\frac{a}{b}', title: 'كسر' },
    { label: 'x²', insert: 'x^{2}', title: 'أس تربيعي' },
    { label: '√x', insert: '\\sqrt{x}', title: 'جذر تربيعي' },
    { label: 'f(x)', insert: 'f(x) = ', title: 'دالة' },
    { label: 'lim', insert: '\\lim_{x \\to a}', title: 'نهاية' },
    { label: '∫', insert: '\\int_{a}^{b} f(x) dx', title: 'تكامل' },
    { label: '∑', insert: '\\sum_{i=1}^{n}', title: 'مجموع' },
    { label: '∞', insert: '\\infty', title: 'لانهاية' },
    { label: 'π', insert: '\\pi', title: 'باي' },
    { label: 'Δ', insert: '\\Delta', title: 'دلتا المميز' },
    { label: '≤', insert: '\\le', title: 'أصغر أو يساوي' },
    { label: '≥', insert: '\\ge', title: 'أكبر أو يساوي' },
    { label: '≠', insert: '\\neq', title: 'لا يساوي' },
    { label: '∈', insert: '\\in', title: 'ينتمي إلى' },
    { label: 'ℝ', insert: '\\mathbb{R}', title: 'مجموعة الأعداد الحقيقية' },
  ];

  const insertSymbolToField = (symbolText: string) => {
    const currentVal = exercise[activeTextareaField] || '';
    const isCircled = ['①', '②', '③', '④', '⑤'].includes(symbolText.trim());
    const isTagOrMarkdown = symbolText.startsWith('*') || symbolText.startsWith('<');
    const textToInsert = isCircled 
      ? `\n${symbolText}` 
      : isTagOrMarkdown 
      ? `\n${symbolText} ` 
      : `$${symbolText}$ `;
    const updatedVal = currentVal + (currentVal.endsWith(' ') || currentVal === '' ? '' : ' ') + textToInsert;
    setExercise({
      ...exercise,
      [activeTextareaField]: updatedVal
    });
  };

  const extractSvgs = (text: string = ''): string[] => {
    if (!text) return [];
    const matches = text.match(/<svg[\s\S]*?<\/svg>/gi);
    return matches || [];
  };

  const makeSvgResponsive = (svgHtml: string): string => {
    if (!svgHtml) return '';
    return cleanAndEnforceMathSvg(svgHtml);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-right" dir="rtl">
        {/* Modal Header */}
        <div className="bg-violet-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
          <h3 className="text-base md:text-lg font-black font-sans flex items-center gap-2">
            <span>🛠️</span>
            <span>تعديل التمرين ومحتوى المسألة والحل والـ SVG</span>
          </h3>
          <button 
            onClick={onClose}
            className="text-white hover:text-red-200 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* LaTeX & Formatting Toolbar */}
        <div className="bg-slate-50 px-6 py-2.5 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-thin">
          <span className="text-[11px] font-extrabold text-slate-500 shrink-0 ml-2">وسوم التنسيق:</span>
          
          <button
            type="button"
            onClick={() => insertSymbolToField('*عنوان رئيسي باللون الأحمر*')}
            title="إدراج عنوان رئيسي باللون الأحمر"
            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow-2xs flex items-center gap-1"
          >
            <span className="w-2 h-2 rounded-full bg-red-600"></span>
            <span>عنوان رئيسي أحمر</span>
          </button>

          <button
            type="button"
            onClick={() => insertSymbolToField('*#عنوان فرعي باللون الأزرق#*')}
            title="إدراج عنوان فرعي باللون الأزرق"
            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow-2xs flex items-center gap-1"
          >
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <span>عنوان فرعي أزرق</span>
          </button>

          <button
            type="button"
            onClick={() => insertSymbolToField('***دستور / مبرهنة / قانون عام: $...$***')}
            title="إدراج قانون عام محاط بإطار أحمر"
            className="px-2.5 py-1 bg-red-100/70 hover:bg-red-100 text-red-900 border-2 border-red-400 rounded-lg text-xs font-extrabold transition-all shrink-0 cursor-pointer shadow-2xs flex items-center gap-1"
          >
            <span>📜</span>
            <span>قانون بإطار أحمر</span>
          </button>

          <div className="w-px h-5 bg-slate-300 mx-1 shrink-0"></div>

          <span className="text-[11px] font-extrabold text-slate-500 shrink-0 ml-1">رموز سريعة:</span>
          {LATEX_SYMBOLS.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => insertSymbolToField(s.insert)}
              title={s.title}
              className="px-2.5 py-1 bg-white hover:bg-violet-50 text-violet-800 border border-slate-200 hover:border-violet-300 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow-2xs"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Modal Body: Split Screen (Editor & Live Preview) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          {/* Right Column: Editor Form */}
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-sm font-black text-gray-700">✍️ بيانات ومعطيات المسألة:</h4>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onAIGenerateSolution(exercise)}
                  disabled={aiLoading === 'solution'}
                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black rounded-lg border border-indigo-200 transition-all flex items-center gap-1 cursor-pointer"
                >
                  {aiLoading === 'solution' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                  <span>توليد الحل بالذكاء</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAIGenerateSvg(exercise)}
                  disabled={aiLoading === 'svg'}
                  className="px-3 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-black rounded-lg border border-violet-200 transition-all flex items-center gap-1 cursor-pointer"
                >
                  {aiLoading === 'svg' ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                  <span>توليد رسم SVG</span>
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-600">عنوان ورقم التمرين:</label>
              <input 
                type="text"
                value={exercise.title}
                onChange={e => setExercise({ ...exercise, title: e.target.value })}
                className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-sans font-medium"
                placeholder="مثال: التمرين 1"
              />
            </div>

            {/* Question Text */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-600">نص المسألة والطلبات (①, ②... يدعم LaTeX):</label>
              <textarea 
                rows={5}
                value={exercise.questionText}
                onFocus={() => setActiveTextareaField('questionText')}
                onChange={e => setExercise({ ...exercise, questionText: e.target.value })}
                className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-mono leading-relaxed"
                placeholder="اكتب نص المسألة وطلباتها هنا... يدعم الصيغ الرياضية مثل $f(x) = \sqrt{x}$"
              />
            </div>

            {/* Strategy Text */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-amber-800">💡 فكرة واستراتيجية الحل:</label>
              <textarea 
                rows={3}
                value={exercise.strategyText || ''}
                onFocus={() => setActiveTextareaField('strategyText')}
                onChange={e => setExercise({ ...exercise, strategyText: e.target.value })}
                className="w-full text-sm p-3 border border-amber-300 bg-amber-50/30 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all font-medium leading-relaxed"
                placeholder="💡 فكرة الحل السريع وملاحظات التفكير الرياضي..."
              />
            </div>

            {/* Solution Text */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-emerald-800">🔑 خطوات الحل النموذجي والمفصل (يدعم LaTeX):</label>
              <textarea 
                rows={7}
                value={exercise.solutionText || ''}
                onFocus={() => setActiveTextareaField('solutionText')}
                onChange={e => setExercise({ ...exercise, solutionText: e.target.value })}
                className="w-full text-sm p-3 border border-emerald-300 bg-emerald-50/20 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-mono leading-relaxed"
                placeholder="اكتب خطوات الحل بالتفصيل مع الصيغ الرياضية..."
              />
            </div>

            {/* SVG Code */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-violet-800">🎨 كود الرسم التوضيحي SVG (اختياري):</label>
              <textarea 
                rows={4}
                value={exercise.svgCode || ''}
                onChange={e => setExercise({ ...exercise, svgCode: e.target.value })}
                className="w-full text-xs p-3 border border-violet-300 bg-violet-50/20 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-mono text-left"
                dir="ltr"
                placeholder="<svg viewBox='0 0 400 300'>...</svg>"
              />
            </div>
          </div>

          {/* Left Column: Live Preview */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 overflow-y-auto flex flex-col gap-4">
            <h4 className="text-sm font-black text-gray-700 border-b pb-1 flex items-center gap-1">
              <span>👀</span>
              <span>معاينة حية ومباشرة للتمرين والحل:</span>
            </h4>

            <h5 className="text-base font-extrabold text-violet-900 font-sans">
              {exercise.title || 'العنوان فارغ'}
            </h5>

            {/* Question Preview */}
            <div className="flow-root p-4 bg-[#f0f9ff] rounded-xl border border-slate-200/80">
              <span className="text-xs font-black text-gray-500 block mb-1">نص المسألة والطلبات:</span>
              {/* If no solutionText and there is svgCode, float it in question preview */}
              {!exercise.solutionText?.trim() && exercise.svgCode && exercise.svgCode.trim() && !exercise.questionText?.includes('<svg') && (
                <div className="float-left w-[160px] sm:w-[200px] mr-3 mb-3 bg-transparent flex flex-col items-center gap-1.5">
                  {extractSvgs(exercise.svgCode).map((svgHtml, sIdx) => (
                    <div 
                      key={sIdx} 
                      className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[160px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                      dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                    />
                  ))}
                </div>
              )}
              {exercise.questionText ? (
                <MathRenderer content={exercise.questionText} />
              ) : (
                <span className="text-xs text-gray-400 italic">اكتب نص المسألة لتظهر المعاينة هنا...</span>
              )}
            </div>

            {/* Strategy Preview */}
            {exercise.strategyText && (
              <div className="p-4 bg-yellow-50/80 rounded-xl border border-[#78350f] text-amber-950">
                <span className="font-extrabold text-amber-900 text-xs block mb-1">💡 فكرة واستراتيجية الحل:</span>
                <MathRenderer content={exercise.strategyText} />
              </div>
            )}

            {/* Solution Preview */}
            <div className="flow-root p-4 bg-[#f0fdf4] rounded-xl border border-emerald-200">
              <span className="text-xs font-black text-emerald-800 block mb-2 font-sans">🔑 خطوات الحل النموذجي:</span>
              {/* If exercise has svgCode and it's not embedded in solutionText, float it inside the solution container on the left */}
              {exercise.svgCode && exercise.svgCode.trim() && !exercise.solutionText?.includes('<svg') && (
                <div className="float-left w-[160px] sm:w-[220px] mr-4 mb-3 bg-transparent flex flex-col items-center gap-1.5">
                  {extractSvgs(exercise.svgCode).map((svgHtml, sIdx) => (
                    <div 
                      key={sIdx} 
                      className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[180px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                      dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                    />
                  ))}
                </div>
              )}
              {exercise.solutionText ? (
                <MathRenderer content={exercise.solutionText} />
              ) : (
                <span className="text-xs text-gray-400 italic">اكتب خطوات الحل لتظهر المعاينة هنا...</span>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            إلغاء وإغلاق
          </button>
          <button
            onClick={() => onSave(exercise)}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Save size={15} />
            <span>حفظ التعديلات</span>
          </button>
        </div>
      </div>
    </div>
  );
};
