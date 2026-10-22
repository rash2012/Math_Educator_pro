import React, { useState } from 'react';
import { Printer, ZoomIn, ZoomOut, RotateCcw, X, HelpCircle, CheckCircle2 } from 'lucide-react';
import { Document, UnitQuiz } from '../db';
import { MathRenderer } from './MathRenderer';

interface UnitQuizPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  quiz: UnitQuiz;
  autoTriggerPrint?: boolean;
}

export const UnitQuizPrintPreviewModal: React.FC<UnitQuizPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  quiz,
  autoTriggerPrint = true
}) => {
  if (!isOpen) return null;

  const [includeSolutions, setIncludeSolutions] = useState<boolean>(true);
  const [includeMisconceptions, setIncludeMisconceptions] = useState<boolean>(true);
  const [printFont, setPrintFont] = useState<'cairo' | 'amiri' | 'tajawal' | 'almarai'>('cairo');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  React.useEffect(() => {
    if (isOpen && autoTriggerPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoTriggerPrint]);

  const handlePrint = () => {
    window.print();
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 10, 150));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 10, 70));
  const handleResetZoom = () => setZoomLevel(100);

  const fontFamilies = {
    cairo: "'Cairo', sans-serif",
    amiri: "'Amiri', serif",
    tajawal: "'Tajawal', sans-serif",
    almarai: "'Almarai', sans-serif"
  };

  const optionLetters = ['أ', 'ب', 'ج', 'د'];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/85 backdrop-blur-xs overflow-hidden animate-fade-in print:bg-white print:static print:inset-auto print:z-auto">
      {/* Print styles injected for clean A4 printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Tajawal:wght@400;500;700;800;900&family=Almarai:wght@400;700;800&family=Cairo:wght@400;600;700;800;900&display=swap');

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          html, body, #root, #root > div, main {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 11pt;
            position: static !important;
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            width: 100% !important;
            max-width: none !important;
          }
          .no-print, [data-no-print="true"] {
            display: none !important;
          }
          .unit-quiz-print-sheet {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            transform: none !important;
            background: white !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />

      {/* Top Controls Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shadow-md flex flex-wrap items-center justify-between gap-3 shrink-0 no-print z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <HelpCircle size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 line-clamp-1">
                معاينة وطباعة اختبار الوحدة الشامل (ملحق مستقل): {document.title}
              </h3>
              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold border border-indigo-100">
                A4
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              الصف {document.grade} • {document.subject} • {quiz.questions?.length || 0} أسئلة مؤتمتة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {/* Include Solutions Toggle */}
          <button
            type="button"
            onClick={() => setIncludeSolutions(!includeSolutions)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              includeSolutions
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            <span>{includeSolutions ? '✓ متضمن سلالم الإجابة' : 'نموذج أسئلة فقط'}</span>
          </button>

          {/* Include Misconceptions Toggle */}
          {includeSolutions && (
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={includeMisconceptions}
                onChange={(e) => setIncludeMisconceptions(e.target.checked)}
                className="w-3.5 h-3.5 text-indigo-600 rounded"
              />
              <span>تشخيص المشتتات والأخطاء</span>
            </label>
          )}

          {/* Font Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 font-bold hidden sm:inline">الخط:</span>
            <select
              value={printFont}
              onChange={(e) => setPrintFont(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700"
            >
              <option value="cairo">Cairo (عريض)</option>
              <option value="amiri">Amiri (أميري)</option>
              <option value="tajawal">Tajawal (متوازن)</option>
              <option value="almarai">Almarai (أنيق)</option>
            </select>
          </div>

          {/* Zoom controls */}
          <div className="hidden md:flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-200">
            <button onClick={handleZoomOut} className="p-1 hover:bg-slate-200 rounded text-slate-600">
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-bold text-slate-700 px-1 min-w-[35px] text-center">{zoomLevel}%</span>
            <button onClick={handleZoomIn} className="p-1 hover:bg-slate-200 rounded text-slate-600">
              <ZoomIn size={14} />
            </button>
            <button onClick={handleResetZoom} className="p-1 hover:bg-slate-200 rounded text-slate-600" title="إعادة تعيين">
              <RotateCcw size={13} />
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer border border-slate-200"
          >
            إغلاق
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition cursor-pointer active:scale-95"
          >
            <Printer size={16} />
            <span>معاينة الطباعة / حفظ كـ PDF 🖨️</span>
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-300/70 print:p-0 print:bg-white print:overflow-visible print:block print:h-auto">
        <div 
          className="unit-quiz-print-sheet bg-white text-slate-950 shadow-2xl rounded-2xl border border-slate-300 p-8 sm:p-12 md:p-14 space-y-8 my-auto transition-transform print:border-none print:shadow-none print:p-0 print:m-0"
          style={{
            width: '210mm',
            minHeight: '297mm',
            fontFamily: fontFamilies[printFont],
            transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : 'none',
            transformOrigin: 'top center'
          }}
          dir="rtl"
        >
          {/* Header Block (Double border Syrian ministerial style) */}
          <div className="border-4 double border-slate-900 p-6 rounded-xl text-center space-y-4 print:border-black">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs font-bold text-slate-700 border-b border-slate-300 pb-3 print:text-black">
              <div>الجمهورية العربية السورية - وزارة التربية</div>
              <div className="text-sm font-black text-slate-900 print:text-black">{document.grade}</div>
              <div>المادة: {document.subject}</div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-slate-950 tracking-tight print:text-black">
                اختبار الوحدة الشامل المؤتمت: {document.unit || document.title}
              </h2>
              <div className="flex items-center justify-center gap-3 text-xs font-bold text-slate-600 pt-1">
                <span>المدرّس: حسن راشد العلي</span>
                <span>•</span>
                <span>عدد الأسئلة: {quiz.questions?.length || 0}</span>
                <span>•</span>
                <span className="text-indigo-800 font-extrabold">
                  {includeSolutions ? 'يتضمن سلم التصحيح والحلول النموذجية' : 'نموذج امتحاني بدون حل'}
                </span>
              </div>
            </div>
          </div>

          {/* Student Info Box (When printing test sheet without solutions) */}
          {!includeSolutions && (
            <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/60 flex justify-between items-center text-xs font-bold text-slate-750 print:bg-white">
              <span>اسم الطالب الثلاثي: .................................................</span>
              <span>الشعبة / المدرسة: .......................................</span>
              <span>الدرجة المستحقة: [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 100 ]</span>
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-6">
            {quiz.questions && quiz.questions.map((q, qIdx) => (
              <div key={q.id || qIdx} className="border border-slate-200 rounded-2xl p-5 space-y-3.5 print:border-slate-300 print-avoid-break">
                {/* Question Header & Stem */}
                <div className="flex items-start gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-900 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 print:border print:border-black">
                    {qIdx + 1}
                  </span>
                  <div className="text-sm font-black text-slate-900 leading-relaxed flex-1">
                    <MathRenderer content={q.questionText} />
                  </div>
                </div>

                {/* Question Options (4 Choices) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-9">
                  {q.options && q.options.map((opt, optIdx) => {
                    const isCorrect = opt.isCorrect;
                    return (
                      <div
                        key={opt.id || optIdx}
                        className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all ${
                          includeSolutions && isCorrect
                            ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 font-black print:border-emerald-700'
                            : 'bg-white border-slate-200 text-slate-800 print:border-slate-300'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          includeSolutions && isCorrect
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}>
                          {optionLetters[optIdx] || optIdx + 1}
                        </span>
                        <div className="flex-1 font-bold">
                          <MathRenderer content={opt.text} />
                        </div>
                        {includeSolutions && isCorrect && (
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                            الإجابة الصحيحة ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Solution Ladder / Explanation */}
                {includeSolutions && q.explanation && (
                  <div className="mr-9 mt-2 p-3 bg-emerald-50/50 border-r-4 border-emerald-500 rounded-l-xl text-xs space-y-1.5 print:bg-white print:border-emerald-600">
                    <div className="font-black text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      <span>التعليل الرياضي وسلم الحل النموذجي:</span>
                    </div>
                    <div className="text-slate-850 leading-relaxed font-medium">
                      <MathRenderer content={q.explanation} />
                    </div>
                  </div>
                )}

                {/* Misconceptions Diagnosis */}
                {includeSolutions && includeMisconceptions && q.options && q.options.some((o: any) => o.misconceptionDiagnosis && !o.isCorrect) && (
                  <div className="mr-9 p-2.5 bg-amber-50/50 border border-amber-200 rounded-xl text-[11px] text-amber-950 space-y-1 print:bg-white">
                    <strong className="text-amber-800 block">تشخيص المشتتات الامتحانية الشائعة:</strong>
                    {q.options.filter((o: any) => o.misconceptionDiagnosis && !o.isCorrect).map((opt: any, oIdx) => (
                      <div key={oIdx} className="text-slate-700">
                        • الخيار ({optionLetters[q.options.indexOf(opt)]}): <span className="font-bold text-amber-900">{opt.misconceptionDiagnosis}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Page Footer Details */}
          <div className="border-t border-slate-300 pt-4 flex justify-between items-center text-xs text-slate-500 font-bold">
            <span>منصة المعلم الذكي للرياضيات - Math Educator Pro</span>
            <span>المدرّس حسن راشد العلي</span>
            <span>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
