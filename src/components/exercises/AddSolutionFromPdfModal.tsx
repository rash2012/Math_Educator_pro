import React, { useState, useRef } from 'react';
import { type PracticeExercise } from '../../db';
import { MathRenderer } from '../MathRenderer';
import {
  X,
  FileUp,
  FileText,
  UploadCloud,
  Sparkles,
  AlertTriangle,
  Loader2,
  Trash2,
  MessageSquarePlus,
  CheckCircle2
} from 'lucide-react';

interface AddSolutionFromPdfModalProps {
  exercise: PracticeExercise;
  onClose: () => void;
  onSubmitPdf: (params: {
    pdfBase64: string;
    fileName: string;
    userInstructions: string;
  }) => Promise<{
    isMatch: boolean;
    mismatchReason?: string;
    detectedExerciseSummary?: string;
  }>;
}

const QUICK_INSTRUCTION_PRESETS = [
  'استخرج الحل كاملاً بالتفصيل مع الترقيم ① ② ③',
  'استخرج خطوات الحل الأساسية باختصار ووضوح',
  'أدرج توزيع الدرجات والملاحظات الموجودة في الملف',
  'إذا احتوى الملف على عدة تمارين استخرج حل هذا التمرين فقط'
];

const MAX_PDF_SIZE_MB = 25;

export const AddSolutionFromPdfModal: React.FC<AddSolutionFromPdfModalProps> = ({
  exercise,
  onClose,
  onSubmitPdf
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    sizeBytes: number;
    base64: string;
  } | null>(null);
  const [userInstructions, setUserInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mismatchAlert, setMismatchAlert] = useState<{
    reason: string;
    detectedSummary?: string;
  } | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFileSelected = (file: File | undefined | null) => {
    setLocalError(null);
    setMismatchAlert(null);

    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setLocalError('يرجى اختيار ملف بصيغة PDF فقط.');
      return;
    }

    if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
      setLocalError(
        `حجم الملف يتجاوز الحد المسموح (${MAX_PDF_SIZE_MB} ميجابايت). يرجى اختيار ملف أصغر حجماً.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setLocalError('تعذر قراءة محتوى ملف PDF المختار.');
        return;
      }
      setSelectedFile({
        name: file.name,
        sizeBytes: file.size,
        base64: result
      });
    };
    reader.onerror = () => {
      setLocalError('حدث خطأ أثناء قراءة ملف PDF من جهازك.');
    };
    reader.readAsDataURL(file);
  };

  const handleAppendPreset = (preset: string) => {
    setUserInstructions((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return preset;
      if (trimmed.includes(preset)) return prev;
      return `${trimmed}\n- ${preset}`;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setMismatchAlert(null);

    if (!exercise.questionText?.trim()) {
      setLocalError(
        'نص التمرين النشط فارغ حالياً. يرجى كتابة نص المسألة أولاً عبر "تعديل يدوي" حتى يتمكن النظام من مطابقة الحل في ملف PDF مع التمرين النشط.'
      );
      return;
    }

    if (!selectedFile) {
      setLocalError('يرجى رفع ملف PDF يحتوي على حل التمرين أولاً.');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await onSubmitPdf({
        pdfBase64: selectedFile.base64,
        fileName: selectedFile.name,
        userInstructions: userInstructions.trim()
      });

      if (!result.isMatch) {
        setMismatchAlert({
          reason:
            result.mismatchReason ||
            'الحل الموجود في ملف PDF المرفوع لا يخص التمرين النشط.',
          detectedSummary: result.detectedExerciseSummary
        });
      }
    } catch (err: any) {
      setLocalError(
        err?.message || 'حدث خطأ غير متوقع أثناء استخراج الحل من ملف PDF.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-right">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-l from-teal-50 via-white to-violet-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileUp size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 truncate">
                إضافة الحل من ملف PDF
              </h3>
              <p className="text-xs font-bold text-slate-500 truncate">
                التمرين النشط: {exercise.title || 'تمرين بدون عنوان'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
            title="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Active Exercise Question Preview */}
          <div className="space-y-1.5">
            <span className="text-xs font-black text-slate-700 block">
              معاينة التمرين النشط (سيتم مطابقة الملف مع هذا النص):
            </span>
            <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200/80 text-xs leading-relaxed text-slate-800 max-h-36 overflow-y-auto">
              {exercise.questionText?.trim() ? (
                <MathRenderer content={exercise.questionText} />
              ) : (
                <span className="text-rose-600 font-bold">
                  نص التمرين فارغ — يرجى كتابة نص المسألة أولاً لتفعيل التحقق من التطابق.
                </span>
              )}
            </div>
          </div>

          {/* Overwrite Note if Solution Exists */}
          {exercise.solutionText?.trim() && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-bold flex items-center gap-2">
              <CheckCircle2 size={15} className="text-amber-600 shrink-0" />
              <span>
                يوجد حل حالي لهذا التمرين؛ سيتم استبداله بالحل المستخرج فقط بعد التأكد من مطابقة ملف PDF للتمرين النشط.
              </span>
            </div>
          )}

          {/* PDF File Upload Area */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-800">
              1. رفع ملف PDF الخاص بحل التمرين: <span className="text-rose-600">*</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                handleFileSelected(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            {!selectedFile ? (
              <div
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isProcessing) {
                    handleFileSelected(e.dataTransfer.files?.[0]);
                  }
                }}
                className="border-2 border-dashed border-teal-300 hover:border-teal-500 bg-teal-50/40 hover:bg-teal-50/80 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2"
              >
                <div className="w-11 h-11 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto">
                  <UploadCloud size={22} />
                </div>
                <p className="text-xs font-black text-teal-950">
                  اضغط لاختيار ملف PDF أو اسحبه وأفلته هنا
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  يدعم الملفات المطبوعة أو المصورة والمكتوبة بخط اليد (الحد الأقصى {MAX_PDF_SIZE_MB} ميجابايت)
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate" dir="ltr">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] font-bold text-teal-700">
                      ملف PDF جاهز • {formatFileSize(selectedFile.sizeBytes)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-40"
                  >
                    تغيير الملف
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setSelectedFile(null);
                      setMismatchAlert(null);
                      setLocalError(null);
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-xl cursor-pointer transition-colors disabled:opacity-40"
                    title="إزالة الملف"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Instructions */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-black text-slate-800">
              <MessageSquarePlus size={14} className="text-violet-600" />
              <span>2. تعليمات المستخدم لاستخراج الحل (اختياري):</span>
            </label>
            <textarea
              rows={3}
              value={userInstructions}
              disabled={isProcessing}
              onChange={(e) => setUserInstructions(e.target.value)}
              placeholder="اكتب تعليماتك للذكاء الاصطناعي قبل استخراج الحل (مثال: استخرج الحل بالطريقة الهندسية الموجودة في الصفحة الثانية، أو اختصر الحسابات الروتينية، أو استخرج حل التمرين رقم 4 فقط)..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-violet-500 focus:bg-white rounded-xl text-xs font-medium text-slate-900 leading-relaxed outline-none transition-all resize-y"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {QUICK_INSTRUCTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleAppendPreset(preset)}
                  className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Mismatch Alert Banner (When PDF is NOT for the active exercise) */}
          {mismatchAlert && (
            <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-2 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 min-w-0">
                  <h4 className="text-xs md:text-sm font-black text-rose-900">
                    الحل الموجود في ملف PDF ليس للتمرين النشط!
                  </h4>
                  <p className="text-xs font-bold text-rose-800 leading-relaxed">
                    {mismatchAlert.reason}
                  </p>
                  {mismatchAlert.detectedSummary && (
                    <div className="p-2.5 rounded-xl bg-white/80 border border-rose-200 text-[11px] text-slate-800 font-medium">
                      <span className="font-black text-rose-900 block mb-0.5">
                        ما تم رصده داخل ملف PDF:
                      </span>
                      <MathRenderer content={mismatchAlert.detectedSummary} />
                    </div>
                  )}
                  <p className="text-[11px] font-bold text-rose-700 pt-0.5">
                    لم يتم تعديل حل التمرين الحالي. يرجى رفع ملف PDF المطابق للتمرين النشط والمحاولة مرة أخرى.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Local Validation / Network Error */}
          {localError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{localError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-40"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isProcessing || !selectedFile}
              className="flex items-center justify-center gap-2 min-w-[190px] px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>جاري الفحص والاستخراج...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>استخراج وإضافة الحل</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
