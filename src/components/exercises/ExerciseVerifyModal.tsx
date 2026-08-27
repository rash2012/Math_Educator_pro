import React, { useState } from 'react';
import { type PracticeExercise } from '../../db';
import { MathRenderer } from '../MathRenderer';
import { X, CheckCircle, Sparkles, Loader2, Check } from 'lucide-react';
import { verifyPracticeExerciseSolutionAI } from '../../services/gemini';

interface ExerciseVerifyModalProps {
  sectionId: number;
  exercise: PracticeExercise;
  onClose: () => void;
  onApply: (updated: PracticeExercise) => void;
}

export const ExerciseVerifyModal: React.FC<ExerciseVerifyModalProps> = ({
  sectionId,
  exercise,
  onClose,
  onApply
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [result, setResult] = useState<{
    isCorrect: boolean;
    notes: string;
    optimizedSolution: string;
    optimizedSolutionShort: string;
    optimizedStrategy: string;
  } | null>(null);
  const [chosenVersion, setChosenVersion] = useState<'full' | 'short'>('full');

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await verifyPracticeExerciseSolutionAI(
        exercise.questionText,
        exercise.solutionText || '',
        exercise.strategyText || '',
        customPrompt
      );
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = () => {
    if (!result) return;
    const finalSolution = chosenVersion === 'short' && result.optimizedSolutionShort
      ? result.optimizedSolutionShort
      : result.optimizedSolution;

    const updated: PracticeExercise = {
      ...exercise,
      solutionText: finalSolution,
      strategyText: result.optimizedStrategy || exercise.strategyText
    };

    onApply(updated);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-right" dir="rtl">
        {/* Header */}
        <div className="bg-emerald-700 px-6 py-4 text-white flex justify-between items-center shrink-0">
          <h3 className="text-base md:text-lg font-black font-sans flex items-center gap-2">
            <CheckCircle size={20} />
            <span>مراجعة وتدقيق وتنسيق الحل بالذكاء الاصطناعي ✨</span>
          </h3>
          <button 
            onClick={onClose}
            className="text-white hover:text-red-200 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Question Summary */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
            <span className="font-extrabold text-slate-700 block mb-1">نص المسألة:</span>
            <div className="text-slate-800">
              <MathRenderer content={exercise.questionText} />
            </div>
          </div>

          {/* AI Focus prompt input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">
              تعليمات إضافية للمدقق الذكي (اختياري):
            </label>
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="مثال: ركز على الاختزال الهندسي، أو تأكد من إشارة المشتق، أو اجعل الحل موجزاً..."
              className="w-full text-xs px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>

          {/* Start Verification button if not yet run */}
          {!result && (
            <div className="text-center py-6">
              <button
                onClick={handleVerify}
                disabled={isVerifying}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span>{isVerifying ? 'جاري فحص وتدقيق الخطوات بالذكاء الاصطناعي...' : 'بدء فحص وتدقيق الحل الآن 🔍'}</span>
              </button>
            </div>
          )}

          {/* Result view */}
          {result && (
            <div className="space-y-4 animate-in fade-in">
              {/* Audit Notes */}
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                result.isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}>
                <div className="flex items-center gap-2 font-black mb-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${result.isCorrect ? 'bg-emerald-600' : 'bg-amber-500'}`} />
                  <span>{result.isCorrect ? 'الحل صحيح ومتماسك رياضياً' : 'تم اكتشاف ملاحظات وتصحيحات رياضية'}</span>
                </div>
                <p className="font-medium whitespace-pre-wrap">{result.notes}</p>
              </div>

              {/* Version Selector */}
              {result.optimizedSolutionShort && (
                <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl text-xs font-bold w-fit">
                  <button
                    onClick={() => setChosenVersion('full')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      chosenVersion === 'full' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600'
                    }`}
                  >
                    الحل النموذجي الكامل
                  </button>
                  <button
                    onClick={() => setChosenVersion('short')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      chosenVersion === 'short' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600'
                    }`}
                  >
                    الحل المقلّص والموجز ✂️
                  </button>
                </div>
              )}

              {/* Solution Preview */}
              <div className="p-4 bg-[#f0fdf4] rounded-2xl border border-emerald-200 space-y-2">
                <span className="text-xs font-black text-emerald-800 block">معاينة الحل المدقق والمنسق:</span>
                <MathRenderer 
                  content={chosenVersion === 'short' && result.optimizedSolutionShort 
                    ? result.optimizedSolutionShort 
                    : result.optimizedSolution
                  } 
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            إغلاق
          </button>
          {result && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Check size={16} />
              <span>اعتماد وتطبيق الحل المدقق في الكراسة</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
