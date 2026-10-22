import React, { useState } from 'react';
import { PastPaper, PastPaperQuestion } from '../db';
import { MathRenderer } from './MathRenderer';
import { 
  X, 
  Printer, 
  Eye, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  CheckCircle2, 
  FileText, 
  CheckSquare, 
  Square,
  Type
} from 'lucide-react';

interface PastPaperPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: PastPaper;
  getQuestionOrderInfo: (q: PastPaperQuestion, idx: number) => { orderTitle: string; questionText: string };
  autoTriggerPrint?: boolean;
}

export const PastPaperPrintPreviewModal: React.FC<PastPaperPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  paper,
  getQuestionOrderInfo,
  autoTriggerPrint = true
}) => {
  if (!isOpen) return null;

  // Print options
  const [includeSolutions, setIncludeSolutions] = useState(true);
  const [printFont, setPrintFont] = useState<'cairo' | 'amiri' | 'tajawal' | 'almarai'>('cairo');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Auto trigger browser print preview if requested
  React.useEffect(() => {
    if (isOpen && autoTriggerPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 250);
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
            font-size: 13pt;
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
          .past-paper-print-sheet {
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

      {/* Top Controls Toolbar (Hidden on print) */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shadow-md flex flex-wrap items-center justify-between gap-3 shrink-0 no-print z-30">
        {/* Left: Paper info & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Printer size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 line-clamp-1">
                معاينة الطباعة / حفظ كـ PDF: {paper.title}
              </h3>
              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold border border-indigo-100">
                A4
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              دورة عام {paper.year}م • {paper.grade} • {paper.subject}
            </p>
          </div>
        </div>

        {/* Center: Controls (Include solutions, Font, Zoom) */}
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {/* Toggle Include Solutions */}
          <button
            type="button"
            onClick={() => setIncludeSolutions(!includeSolutions)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
              includeSolutions
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="تضمين الحلول النموذجية في ورقة الطباعة"
          >
            {includeSolutions ? <CheckSquare size={15} className="text-emerald-600" /> : <Square size={15} />}
            <span>تضمين الحلول المعتمدة</span>
          </button>

          {/* Font Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700">
            <Type size={14} className="text-slate-500" />
            <select
              value={printFont}
              onChange={(e) => setPrintFont(e.target.value as any)}
              className="bg-transparent border-none outline-none font-bold text-xs cursor-pointer text-slate-800"
            >
              <option value="cairo">خط Cairo (عريض وواضح)</option>
              <option value="amiri">خط Amiri (كلاسيكي ورسمي)</option>
              <option value="tajawal">خط Tajawal (حديث)</option>
              <option value="almarai">خط Almarai (مريح)</option>
            </select>
          </div>

          {/* Zoom controls */}
          <div className="hidden md:flex items-center gap-1 bg-slate-50 border border-slate-200 p-0.5 rounded-lg">
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition cursor-pointer"
              title="تصغير المعاينة"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-[11px] font-mono font-bold text-slate-700 px-1 min-w-[3rem] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition cursor-pointer"
              title="تكبير المعاينة"
            >
              <ZoomIn size={15} />
            </button>
            {zoomLevel !== 100 && (
              <button
                onClick={handleResetZoom}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded transition cursor-pointer"
                title="إعادة ضبط 100%"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions (Close & Print Now) */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer border border-slate-200"
          >
            إغلاق المعاينة
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
          className="past-paper-print-sheet bg-white text-slate-950 shadow-2xl rounded-2xl border border-slate-300 p-8 sm:p-12 md:p-14 space-y-8 my-auto transition-transform print:border-none print:shadow-none print:p-0 print:m-0"
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
              <div className="text-sm font-black text-slate-900 print:text-black">{paper.grade}</div>
              <div>المادة: {paper.subject}</div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-slate-950 tracking-tight print:text-black">
                {includeSolutions ? 'أسئلة الامتحان وحلولها النموذجية:' : 'أسئلة الامتحان الرسمي:'} {paper.title}
              </h2>
              <div className="flex items-center justify-center gap-3 text-xs font-bold text-slate-600 pt-1">
                <span>سنة الدورة: {paper.year}م</span>
                <span>•</span>
                <span>عدد الأسئلة: {paper.questions?.length || 0}</span>
                <span>•</span>
                <span className="text-indigo-800 font-extrabold">
                  {includeSolutions ? 'تتضمن الحل النموذجي المعتمد وزاريّاً' : 'نموذج امتحاني بدون حل'}
                </span>
              </div>
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-8">
            {paper.questions && paper.questions.length > 0 ? (
              <div className="divide-y-2 divide-slate-200">
                {paper.questions.map((q, idx) => {
                  const { orderTitle, questionText } = getQuestionOrderInfo(q, idx);

                  return (
                    <div key={q.id || idx} className="py-6 first:pt-0 last:pb-0 space-y-4 print-avoid-break">
                      
                      {/* Question Top Meta */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-orange-50 text-orange-850 px-2.5 py-0.5 rounded text-xs font-black border border-orange-200 print:border-black print:text-black">
                            {q.topic || 'عام'}
                          </span>
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded text-xs font-bold print:border-black print:text-black">
                            {q.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي / مسألة'}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 print:text-black">
                          #{idx + 1}
                        </span>
                      </div>

                      {/* Question Box */}
                      <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 md:p-6 space-y-4 print:bg-white print:border-black shadow-xs">
                        
                        {/* Question Title in RED (السؤال الأول، التمرين الأول، المسألة الأولى) */}
                        <div className="pb-2.5 border-b border-red-200/90 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block print:bg-red-600"></span>
                            <h4 className="text-red-600 font-black text-lg md:text-xl tracking-wide print:text-red-600">
                              {orderTitle}
                            </h4>
                          </div>
                        </div>

                        {/* Question Text */}
                        <div className="text-slate-900 leading-relaxed font-medium text-base print:text-black">
                          <MathRenderer content={questionText} />
                        </div>

                        {/* SVG Illustration if present */}
                        {q.svgCode && (
                          <div className="my-4 p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col items-center justify-center overflow-x-auto print:border-black">
                            <span className="text-xs font-black text-slate-600 mb-2 flex items-center gap-1 self-start print:text-black">
                              📐 الشكل التوضيحي المرفق بالسؤال:
                            </span>
                            <div 
                              className="w-full flex justify-center items-center overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto"
                              dangerouslySetInnerHTML={{ __html: q.svgCode }}
                            />
                          </div>
                        )}

                        {/* MCQ Options if present */}
                        {q.type === 'mcq' && q.subParts && q.subParts.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                            {q.subParts.map((opt, oIdx) => (
                              <div 
                                key={oIdx}
                                className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg text-sm font-semibold print:border-black"
                              >
                                <span>{opt}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Solution Area (Only shown if includeSolutions is true) */}
                      {includeSolutions && (
                        <div className="mt-4 space-y-4 border-l-4 border-emerald-500 bg-emerald-50/40 p-5 md:p-6 rounded-r-xl print:bg-white print:border-emerald-600">
                          <h4 className="font-black text-sm text-emerald-850 flex items-center gap-1.5 border-b border-emerald-200 pb-2 print:text-emerald-800">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                            <span>الحل النموذجي المعتمد وزاريّاً:</span>
                          </h4>

                          <div className="text-slate-900 leading-relaxed font-medium text-sm md:text-base print:text-black">
                            <MathRenderer content={q.solution || '*(لم يُسجل حل لهذا السؤال)*'} />
                          </div>

                          {/* Solution SVG if present */}
                          {q.solutionSvgCode && (
                            <div 
                              className="flex justify-center my-4 overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto bg-white p-3 rounded-lg border border-emerald-200 print:border-black" 
                              dangerouslySetInnerHTML={{ __html: q.solutionSvgCode }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">لا توجد أسئلة مضافة في هذه الدورة.</p>
            )}
          </div>

          {/* End of Sheet Footer */}
          <div className="pt-8 border-t-2 border-slate-800 text-center space-y-1 print:border-black print-avoid-break">
            <p className="text-sm font-black text-slate-800 print:text-black">
              (انتهت الأسئلة - مع تمنياتنا لجميع الطلبة بالتفوق والنجاح الباهر)
            </p>
            <p className="text-xs text-slate-500 font-medium print:text-slate-600">
              تطبيق خبير ومساعد الرياضيات للمنهاج السوري • Math Educator Pro
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
