import React, { useState } from 'react';
import { PastPaperQuestion } from '../db';
import { MathRenderer } from './MathRenderer';
import { 
  X, 
  CheckCircle2, 
  Sparkles, 
  Edit3, 
  ArrowLeftRight, 
  Check, 
  Eye, 
  AlertCircle 
} from 'lucide-react';

interface PastPaperQuestionReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: PastPaperQuestion;
  questionIndex: number;
  reviewedSolution: string;
  notes: string;
  isCorrect?: boolean;
  onApply: (updatedSolution: string) => void;
  onOpenManualEditWithSolution: (solution: string) => void;
}

export const PastPaperQuestionReviewModal: React.FC<PastPaperQuestionReviewModalProps> = ({
  isOpen,
  onClose,
  question,
  questionIndex,
  reviewedSolution,
  notes,
  isCorrect = true,
  onApply,
  onOpenManualEditWithSolution
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'preview' | 'compare'>('preview');

  const handleApply = () => {
    onApply(reviewedSolution);
    onClose();
  };

  const handleOpenEdit = () => {
    onOpenManualEditWithSolution(reviewedSolution);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in no-print">
      <div 
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/30 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-base font-black flex items-center gap-2">
                <span>نتيجة مراجعة وتدقيق الحل بالذكاء الاصطناعي</span>
                <span className="text-amber-300 font-bold text-xs bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  {question.orderTitle || `السؤال ${questionIndex + 1}`}
                </span>
              </h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                تدقيق الخطوات الرياضية والمنطقية (حل عادي وواضح بدون حشو أو إطالة مفرطة)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-300 hover:text-white p-2 rounded-lg hover:bg-white/10 transition cursor-pointer"
            title="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Notes / Verification Report */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs leading-relaxed">
              <span className="font-black text-emerald-950 text-sm block">
                تقرير التدقيق والتحقق الرياضي والمنطقي:
              </span>
              <p className="text-emerald-900 font-medium">
                {notes || 'تم فحص السؤال ومطابقة الحل رياضياً ومنطقياً وفق سلالم تصحيح المنهاج السوري للثالث الثانوي العلمي، وضبط الترقيم والوسوم الملونة.'}
              </p>
            </div>
          </div>

          {/* Question Reference Card */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1.5 text-xs">
            <span className="font-black text-slate-500 block">نص السؤال المعتمد:</span>
            <div className="text-slate-800 font-medium leading-relaxed max-h-24 overflow-y-auto">
              <MathRenderer content={question.question} />
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-black text-slate-700">معاينة الحل المراجع:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye size={13} />
                معاينة الحل المراجع
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                  activeTab === 'compare'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowLeftRight size={13} />
                مقارنة مع الحل السابق
              </button>
            </div>
          </div>

          {/* Content Area */}
          {activeTab === 'preview' ? (
            <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100 text-xs font-black text-emerald-850">
                <span>الحل المراجع المعتمد وزاريّاً:</span>
                <span className="text-[11px] font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  حل عادي • منطقي ورياضي 100%
                </span>
              </div>
              <div className="text-slate-900 text-sm leading-relaxed">
                <MathRenderer content={reviewedSolution} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Previous solution */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs font-bold text-slate-600">
                  <span>الحل السابق (قبل المراجعة):</span>
                  <span className="text-[10px] text-slate-400">النسخة السابقة</span>
                </div>
                <div className="text-slate-800 text-xs leading-relaxed max-h-80 overflow-y-auto">
                  <MathRenderer content={question.solution || '*(لا يوجد حل سابق)*'} />
                </div>
              </div>

              {/* Reviewed solution */}
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-200 text-xs font-black text-emerald-800">
                  <span>الحل المراجع الجديد:</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                    جاهز للاعتماد
                  </span>
                </div>
                <div className="text-slate-900 text-xs leading-relaxed max-h-80 overflow-y-auto">
                  <MathRenderer content={reviewedSolution} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenEdit}
              className="px-4 py-2 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="فتح نافذة التعديل اليدوي مع إدراج هذا الحل لمراجعته وتعديله بحرية"
            >
              <Edit3 size={15} />
              <span>تعديل يدوي قبل الاعتماد</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Check size={16} />
              <span>اعتماد وتحديث الحل في الدورة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
