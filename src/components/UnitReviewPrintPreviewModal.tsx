import React, { useState } from 'react';
import { Printer, ZoomIn, ZoomOut, RotateCcw, X, Layers, BookOpen, Target, Lightbulb, AlertTriangle } from 'lucide-react';
import { Document, UnitComprehensiveReview } from '../db';
import { MathRenderer } from './MathRenderer';

interface UnitReviewPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  review: UnitComprehensiveReview;
  autoTriggerPrint?: boolean;
}

export const UnitReviewPrintPreviewModal: React.FC<UnitReviewPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  review,
  autoTriggerPrint = true
}) => {
  if (!isOpen) return null;

  const [printFont, setPrintFont] = useState<'cairo' | 'amiri' | 'tajawal' | 'almarai'>('cairo');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [includeTraps, setIncludeTraps] = useState<boolean>(true);
  const [includeFormulas, setIncludeFormulas] = useState<boolean>(true);

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
          .unit-review-print-sheet {
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
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600">
            <Layers size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 line-clamp-1">
                معاينة وطباعة مراجعة الوحدة الشاملة (ملحق مستقل): {document.title}
              </h3>
              <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded text-[11px] font-bold border border-violet-100">
                A4
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              الصف {document.grade} • {document.subject} • {document.unit || 'المراجعة الشاملة'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {/* Include Traps Toggle */}
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={includeTraps}
              onChange={(e) => setIncludeTraps(e.target.checked)}
              className="w-3.5 h-3.5 text-violet-600 rounded"
            />
            <span>المطبات الامتحانية</span>
          </label>

          {/* Include Formulas Toggle */}
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={includeFormulas}
              onChange={(e) => setIncludeFormulas(e.target.checked)}
              className="w-3.5 h-3.5 text-violet-600 rounded"
            />
            <span>خلاصة القوانين</span>
          </label>

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
            className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition cursor-pointer active:scale-95"
          >
            <Printer size={16} />
            <span>معاينة الطباعة / حفظ كـ PDF 🖨️</span>
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-300/70 print:p-0 print:bg-white print:overflow-visible print:block print:h-auto">
        <div 
          className="unit-review-print-sheet bg-white text-slate-950 shadow-2xl rounded-2xl border border-slate-300 p-8 sm:p-12 md:p-14 space-y-8 my-auto transition-transform print:border-none print:shadow-none print:p-0 print:m-0"
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
                المراجعة الشاملة للوحدة ومستودع المفاهيم والقواعد: {document.unit || document.title}
              </h2>
              <div className="flex items-center justify-center gap-3 text-xs font-bold text-slate-600 pt-1">
                <span>المدرّس: حسن راشد العلي</span>
                <span>•</span>
                <span>سلسلة التعلّم الذكي للرياضيات</span>
                <span>•</span>
                <span className="text-violet-800 font-extrabold">ملحق مراجعة مستقل</span>
              </div>
            </div>
          </div>

          {/* Section 1: Summary text */}
          {review.summaryText && (
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-2 print:bg-white print:border-slate-300 print-avoid-break">
              <h3 className="text-sm font-black text-violet-900 flex items-center gap-2 border-b border-slate-200 pb-2">
                <BookOpen size={16} />
                <span>الخلاصة والنسيج المعرفي للوحدة:</span>
              </h3>
              <div className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                <MathRenderer content={review.summaryText} />
              </div>
            </div>
          )}

          {/* Section 2: Definitions */}
          {review.definitions && review.definitions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2 border-b-2 border-indigo-200 pb-1.5">
                <BookOpen size={16} />
                <span>التعاريف والمفاهيم الأساسية ({review.definitions.length}):</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {review.definitions.map((def, idx) => (
                  <div key={def.id || idx} className="border border-indigo-200 rounded-xl p-3.5 space-y-1.5 bg-indigo-50/20 print:bg-white print:border-slate-300 print-avoid-break">
                    <span className="text-xs font-black text-indigo-950 bg-indigo-100 px-2 py-0.5 rounded inline-block">
                      {def.term}
                    </span>
                    <div className="text-xs text-slate-800 leading-relaxed">
                      <MathRenderer content={def.explanation} />
                    </div>
                    {def.formula && (
                      <div className="pt-1 border-t border-indigo-100 text-xs font-mono text-indigo-900">
                        <MathRenderer content={`$${def.formula.replace(/^\$+|\$+$/g, '')}$`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Theorems */}
          {review.theorems && review.theorems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-emerald-900 flex items-center gap-2 border-b-2 border-emerald-200 pb-1.5">
                <Target size={16} />
                <span>المبرهنات والنظريات الأساسية وشروط تطبيقها ({review.theorems.length}):</span>
              </h3>
              <div className="space-y-3">
                {review.theorems.map((thm, idx) => (
                  <div key={thm.id || idx} className="border border-emerald-200 rounded-xl p-4 space-y-2 bg-emerald-50/20 print:bg-white print:border-slate-300 print-avoid-break">
                    <div className="text-sm font-black text-emerald-950 flex items-center gap-2">
                      <span className="text-emerald-700">★</span>
                      <span>{thm.name}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                      <MathRenderer content={thm.statement} />
                    </div>
                    {thm.conditions && (
                      <div className="text-xs bg-emerald-100/40 p-2 rounded border border-emerald-150 text-emerald-950">
                        <strong>شروط الانطلاق والتطبيق: </strong>
                        <MathRenderer content={thm.conditions} />
                      </div>
                    )}
                    {thm.notes && (
                      <div className="text-[11px] text-slate-600 italic">
                        <strong>ملاحظة: </strong>
                        <MathRenderer content={thm.notes} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Results & Properties */}
          {review.results && review.results.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 border-b-2 border-blue-200 pb-1.5">
                <Lightbulb size={16} />
                <span>النتائج والقواعد والخواص الرياضية المنبثقة ({review.results.length}):</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {review.results.map((res, idx) => (
                  <div key={res.id || idx} className="border border-blue-200 rounded-xl p-3.5 space-y-1.5 bg-blue-50/20 print:bg-white print:border-slate-300 print-avoid-break">
                    <div className="text-xs font-black text-blue-950">
                      {res.title}
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed">
                      <MathRenderer content={res.statement} />
                    </div>
                    {res.formula && (
                      <div className="pt-1 border-t border-blue-100 text-xs font-mono text-blue-900">
                        <MathRenderer content={`$${res.formula.replace(/^\$+|\$+$/g, '')}$`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Traps & Golden Tips */}
          {includeTraps && review.trapsAndTips && review.trapsAndTips.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-amber-900 flex items-center gap-2 border-b-2 border-amber-200 pb-1.5">
                <AlertTriangle size={16} />
                <span>المطبات الامتحانية وملاحظات التوجيه الذهبي ({review.trapsAndTips.length}):</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {review.trapsAndTips.map((trap, idx) => (
                  <div key={trap.id || idx} className="border border-amber-200 rounded-xl p-3.5 space-y-2 bg-amber-50/25 print:bg-white print:border-slate-300 print-avoid-break">
                    <div className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>{trap.title}</span>
                    </div>
                    <div className="text-xs text-amber-900 leading-relaxed">
                      <MathRenderer content={trap.trap} />
                    </div>
                    {trap.correctMethod && (
                      <div className="text-xs bg-emerald-50 p-2 rounded border border-emerald-200 text-emerald-950">
                        <strong>التصويب والتوجيه السليم: </strong>
                        <MathRenderer content={trap.correctMethod} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 6: Formulas Summary */}
          {includeFormulas && review.formulasSummary && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b-2 border-slate-300 pb-1.5">
                <span>🧮</span>
                <span>خلاصة القوانين والعلاقات الرياضية الحصرية للوحدة:</span>
              </h3>
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 print:bg-white print:border-slate-300 print-avoid-break">
                <div className="text-xs font-mono font-bold text-slate-950 leading-relaxed">
                  <MathRenderer content={review.formulasSummary} />
                </div>
              </div>
            </div>
          )}

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
