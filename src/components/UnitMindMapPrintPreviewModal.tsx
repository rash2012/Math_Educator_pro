import React, { useState } from 'react';
import { Printer, ZoomIn, ZoomOut, RotateCcw, X, Share2, Compass, Layout } from 'lucide-react';
import { Document, UnitMindMap } from '../db';
import { MathRenderer } from './MathRenderer';

interface UnitMindMapPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  mindMap: UnitMindMap;
  autoTriggerPrint?: boolean;
}

export const UnitMindMapPrintPreviewModal: React.FC<UnitMindMapPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  mindMap,
  autoTriggerPrint = true
}) => {
  if (!isOpen) return null;

  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [includeSchema, setIncludeSchema] = useState<boolean>(true);

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/85 backdrop-blur-xs overflow-hidden animate-fade-in print:bg-white print:static print:inset-auto print:z-auto">
      {/* Print styles injected for clean A4 printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');

        @media print {
          @page {
            size: A4 ${orientation};
            margin: 10mm 12mm;
          }
          html, body, #root, #root > div, main {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 10pt;
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
          .unit-mindmap-print-sheet {
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
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Share2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 line-clamp-1">
                معاينة وطباعة الخريطة الذهنية (ملحق مستقل): {mindMap.title}
              </h3>
              <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded text-[11px] font-bold border border-amber-100">
                A4 {orientation === 'landscape' ? 'أفقي ↔' : 'عمودي ↕'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              الصف {document.grade} • {document.subject} • {document.unit || document.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {/* Orientation toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setOrientation('landscape')}
              className={`px-3 py-1 rounded-lg transition-all ${
                orientation === 'landscape' ? 'bg-white shadow text-amber-700 font-black' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              عرض أفقي (موصى به)
            </button>
            <button
              onClick={() => setOrientation('portrait')}
              className={`px-3 py-1 rounded-lg transition-all ${
                orientation === 'portrait' ? 'bg-white shadow text-amber-700 font-black' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              عرض عمودي
            </button>
          </div>

          {/* Include Schema toggle */}
          {mindMap.markdownSchema && (
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={includeSchema}
                onChange={(e) => setIncludeSchema(e.target.checked)}
                className="w-3.5 h-3.5 text-amber-600 rounded"
              />
              <span>تضمين الدليل المعرفي المكتوب</span>
            </label>
          )}

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
            className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition cursor-pointer active:scale-95"
          >
            <Printer size={16} />
            <span>معاينة الطباعة / حفظ كـ PDF 🖨️</span>
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-300/70 print:p-0 print:bg-white print:overflow-visible print:block print:h-auto">
        <div 
          className="unit-mindmap-print-sheet bg-white text-slate-950 shadow-2xl rounded-2xl border border-slate-300 p-8 sm:p-10 md:p-12 space-y-6 my-auto transition-transform print:border-none print:shadow-none print:p-0 print:m-0"
          style={{
            width: orientation === 'landscape' ? '297mm' : '210mm',
            minHeight: orientation === 'landscape' ? '210mm' : '297mm',
            fontFamily: "'Cairo', sans-serif",
            transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : 'none',
            transformOrigin: 'top center'
          }}
          dir="rtl"
        >
          {/* Header Block (Double border Syrian ministerial style) */}
          <div className="border-4 double border-slate-900 p-5 rounded-xl text-center space-y-3 print:border-black">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs font-bold text-slate-700 border-b border-slate-300 pb-2 print:text-black">
              <div>الجمهورية العربية السورية - وزارة التربية</div>
              <div className="text-sm font-black text-slate-900 print:text-black">{document.grade}</div>
              <div>المادة: {document.subject}</div>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight print:text-black">
                الخريطة الذهنية وشجرة الروابط المعرفية: {document.unit || document.title}
              </h2>
              <div className="flex items-center justify-center gap-3 text-xs font-bold text-slate-600 pt-0.5">
                <span>المدرّس: حسن راشد العلي</span>
                <span>•</span>
                <span>سلسلة التعلّم الذكي</span>
                <span>•</span>
                <span className="text-amber-700 font-extrabold">ملحق الخريطة الذهنية البصرية</span>
              </div>
            </div>
          </div>

          {/* SVG Map Container */}
          {mindMap.svgCode && (
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40 print:bg-white print:border-none print-avoid-break">
              <div 
                className="w-full overflow-hidden flex justify-center [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[175mm] [&>svg]:drop-shadow-xs"
                dangerouslySetInnerHTML={{ __html: mindMap.svgCode }}
              />
            </div>
          )}

          {/* Conceptual Schema Outline (if selected) */}
          {includeSchema && mindMap.markdownSchema && (
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/30 space-y-3 print:bg-white print:border-slate-300 print-avoid-break">
              <h3 className="text-sm font-black text-slate-900 border-b border-slate-200 pb-2 flex items-center gap-2">
                <Compass size={16} className="text-amber-600" />
                <span>دليل البنية المفاهيمية والمحاور المترابطة:</span>
              </h3>
              <div className="text-xs text-slate-800 leading-relaxed font-medium">
                <MathRenderer content={mindMap.markdownSchema} />
              </div>
            </div>
          )}

          {/* Page Footer Details */}
          <div className="border-t border-slate-300 pt-3 flex justify-between items-center text-xs text-slate-500 font-bold">
            <span>منصة المعلم الذكي للرياضيات - Math Educator Pro</span>
            <span>المدرّس حسن راشد العلي</span>
            <span>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
