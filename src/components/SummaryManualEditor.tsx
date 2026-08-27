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

  return (
    <div className="h-full flex flex-col gap-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        {/* Editor Textarea */}
        <textarea
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
