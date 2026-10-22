import React, { useState, useEffect, useRef } from 'react';
import { Save, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { MathRenderer } from './MathRenderer';

interface SummaryManualEditorProps {
  initialText: string;
  onSave: (text: string) => void;
  onChange: (text: string) => void;
}

export const SummaryManualEditor: React.FC<SummaryManualEditorProps> = ({
  initialText,
  onSave,
  onChange,
}) => {
  const [localText, setLocalText] = useState(initialText);
  const [previewText, setPreviewText] = useState(initialText);
  const [autoPreview, setAutoPreview] = useState(true);

  const localTextRef = useRef(localText);
  localTextRef.current = localText;

  // Sync state ONLY if the parent changes the text to something different from our local state
  // (e.g., when the user selects a completely different summary or AI updates the summary text)
  useEffect(() => {
    if (initialText !== localTextRef.current) {
      setLocalText(initialText);
      setPreviewText(initialText);
    }
  }, [initialText]);

  // Debounce effect for rendering the math preview & notifying the parent state
  useEffect(() => {
    if (!autoPreview) {
      // Just notify parent after a delay, but do not update the heavy live preview state
      const handler = setTimeout(() => {
        onChange(localText);
      }, 800);
      return () => clearTimeout(handler);
    }

    const handler = setTimeout(() => {
      setPreviewText(localText);
      onChange(localText);
    }, 1000); // 1000ms delay to ensure fluid typing without any rendering lockups

    return () => {
      clearTimeout(handler);
    };
  }, [localText, onChange, autoPreview]);

  // Handle manual saving
  const handleSave = () => {
    onSave(localText);
  };

  // Force manual refresh of preview
  const handleForceRefresh = () => {
    setPreviewText(localText);
    onChange(localText);
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapOrInsertTag = (prefix: string, suffix: string, defaultPlaceholder: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const selected = localText.substring(start, end);
      const textToWrap = selected || defaultPlaceholder;
      const inserted = prefix + textToWrap + suffix;
      const newVal = localText.substring(0, start) + inserted + localText.substring(end);
      setLocalText(newVal);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const cursorStart = start + prefix.length;
          const cursorEnd = cursorStart + textToWrap.length;
          textareaRef.current.setSelectionRange(cursorStart, cursorEnd);
        }
      }, 0);
    } else {
      setLocalText(prev => prev + prefix + defaultPlaceholder + suffix);
    }
  };

  const insertSymbol = (sym: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newVal = localText.substring(0, start) + sym + localText.substring(end);
      setLocalText(newVal);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const nextPos = start + sym.length;
          textareaRef.current.setSelectionRange(nextPos, nextPos);
        }
      }, 0);
    } else {
      setLocalText(prev => prev + sym);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-xl border border-gray-150">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-black text-gray-700">
            محرر الـ Markdown الاحترافي: (يدعم LaTeX المضمن بين $)
          </span>
          
          <div className="flex items-center gap-2 border-r pr-4 border-gray-200">
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={autoPreview} 
                onChange={(e) => {
                  setAutoPreview(e.target.checked);
                  if (e.target.checked) {
                    setPreviewText(localText);
                  }
                }}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
              <span className="mr-2 text-xs font-bold text-gray-600 flex items-center gap-1">
                {autoPreview ? <Eye size={13} className="text-rose-600" /> : <EyeOff size={13} className="text-gray-400" />}
                معاينة تلقائية نشطة
              </span>
            </label>

            {!autoPreview && (
              <button
                type="button"
                onClick={handleForceRefresh}
                className="mr-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-md transition-all shadow-sm active:scale-95"
              >
                <RefreshCw size={11} className="animate-spin-slow" />
                تحديث المعاينة الآن 🔄
              </button>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-3.5 py-2 rounded-lg transition-colors active:scale-95 shadow-sm cursor-pointer self-stretch sm:self-auto justify-center"
        >
          <Save size={14} />
          حفظ المحتوى اليدوي للملخص
        </button>
      </div>

      {/* Formatting & Tags Quick Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
        {/* Soft Violet Highlight **عبارة** */}
        <button
          type="button"
          onClick={() => wrapOrInsertTag('**', '**', 'عبارة هامة')}
          className="h-7 px-2.5 flex items-center gap-1 bg-[#ede9fe] hover:bg-[#ddd6fe] text-[#4c1d95] border border-violet-300 rounded-lg shadow-2xs text-xs font-black transition-all cursor-pointer shrink-0"
          title="الوسم **عبارة**: تظليل كلمات وعبارات هامة ومفتاحية بلون بنفسجي ناعم (كما يظلل الطالب أثناء الدراسة - ولا يستخدم لعناوين الفقرات)"
        >
          <span>🖍️</span>
          <span>**تظليل عبارة**</span>
        </button>

        {/* Red Main Heading <main-title> */}
        <button
          type="button"
          onClick={() => wrapOrInsertTag('<main-title>', '</main-title>', 'العنوان الرئيسي')}
          className="h-7 px-2.5 flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-lg shadow-2xs text-xs font-black transition-all cursor-pointer shrink-0"
          title="وسم أحمر للعناوين الرئيسية: <main-title>العنوان الرئيسي</main-title>"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
          <span>عنوان رئيسي (أحمر)</span>
        </button>

        {/* Blue Subheading <sub-title> */}
        <button
          type="button"
          onClick={() => wrapOrInsertTag('<sub-title>', '</sub-title>', 'العنوان الفرعي')}
          className="h-7 px-2.5 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-lg shadow-2xs text-xs font-black transition-all cursor-pointer shrink-0"
          title="وسم أزرق للعناوين الفرعية: <sub-title>العنوان الفرعي</sub-title>"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
          <span>عنوان فرعي (أزرق)</span>
        </button>

        {/* Formula Red Box ***قانون*** */}
        <button
          type="button"
          onClick={() => wrapOrInsertTag('***دستور: $', '$***', 'قانون أو مبرهنة')}
          className="h-7 px-2 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg shadow-2xs text-xs font-bold transition-all cursor-pointer shrink-0"
          title="قانون عام أو دستور رياضي: ***دستور: $...$***"
        >
          <span>📐</span>
          <span>قانون / دستور</span>
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />

        {/* Numbering Icons 1-10 */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="text-[10px] font-black text-slate-500 ml-1 select-none">أرقام:</span>
          {['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'].map((num, nIdx) => (
            <button
              key={nIdx}
              type="button"
              onClick={() => insertSymbol(num + ' ')}
              className="w-6 h-6 flex items-center justify-center bg-white hover:bg-violet-50 text-violet-850 hover:text-violet-900 border border-violet-200/90 rounded-md text-xs font-black transition-all cursor-pointer shadow-2xs hover:border-violet-400 active:scale-95"
              title={`إدراج رقم الخطوة ${num}`}
            >
              {num}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />

        {/* Professional Quick Icons */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="text-[10px] font-black text-slate-500 ml-1 select-none">أيقونات:</span>
          {['💡', '🏆', '⚠️', '🎯', '✨', '📌', '🔹', '🔸', '📝', '📐', '🔍', '🚀'].map((ico, iIdx) => (
            <button
              key={iIdx}
              type="button"
              onClick={() => insertSymbol(ico + ' ')}
              className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-100 border border-slate-200 rounded-md text-xs transition-all cursor-pointer shadow-2xs active:scale-95"
              title={`إدراج أيقونة ${ico}`}
            >
              {ico}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />

        {/* Math Quick Symbols */}
        {['√', '∫', 'lim', 'α', 'β', 'π', 'θ', 'Δ', '≠', '≤', '≥', '±', 'x²', '∞'].map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => insertSymbol(s)}
            className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded text-xs font-bold font-mono transition-all cursor-pointer shadow-2xs"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        {/* Editor Textarea */}
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          placeholder="تعديل تفاصيل الملخص..."
          className="w-full min-h-[45vh] bg-gray-900 text-gray-100 p-4 rounded-xl border border-gray-800 font-mono text-xs leading-relaxed focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 resize-y"
        />

        {/* Live side-by-side math render preview - renders debounced text */}
        <div className="min-h-[45vh] bg-gray-50 p-4 rounded-xl border border-gray-200 overflow-y-auto max-h-[45vh]">
          <span className="block text-[10px] font-black text-rose-600 border-b pb-1 mb-2 flex items-center justify-between">
            <span>معاينة مباشرة للمعادلات والنصوص</span>
            {!autoPreview && <span className="text-gray-400">موقوفة مؤقتاً لتسريع الكتابة</span>}
          </span>
          <MathRenderer content={previewText} />
        </div>
      </div>
    </div>
  );
};
