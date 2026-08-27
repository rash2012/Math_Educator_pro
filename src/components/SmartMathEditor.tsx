import React, { useRef, useEffect, useState } from 'react';
import { Sigma, Brackets, Type, Quote, Trash2, FunctionSquare, Sparkles, Undo2 } from 'lucide-react';

interface SmartMathEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  onClear?: () => void;
}

export const SmartMathEditor: React.FC<SmartMathEditorProps> = ({
  value,
  onChange,
  placeholder,
  label,
  className = "",
  onClear
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<string[]>([]);

  // Auto-resize textarea
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  const insertText = (before: string, after: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const selectedText = currentText.substring(start, end);
    
    const newText = 
      currentText.substring(0, start) + 
      before + selectedText + after + 
      currentText.substring(end);
    
    onChange(newText);
    
    // Set focus back and move cursor
    setTimeout(() => {
      textarea.focus();
      const newPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleFormat = () => {
    // Save to history before formatting
    setHistory(prev => [...prev, value]);

    // Format logic: add newline after dots (not followed by digits to avoid breaking decimals)
    const formatted = value
      .replace(/\.(?!\d)/g, '.\n')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .replace(/\\+$/gm, '')
      .replace(/\s+$/gm, '');
    onChange(formatted);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prevValue = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    onChange(prevValue);
  };

  const mathButtons = [
    { label: '$...$', before: '$', after: '$', icon: <Sigma size={14} />, title: "رياضيات سطرية" },
    { label: '$$...$$', before: '$$\n', after: '\n$$', icon: <Sigma size={16} />, title: "كتلة رياضيات" },
    { label: '\\frac', before: '\\frac{', after: '}{}', icon: <span className="font-serif font-bold text-xs">A/B</span>, title: "كسر" },
    { label: '\\sqrt', before: '\\sqrt{', after: '}', icon: <FunctionSquare size={14} />, title: "جذر" },
    { label: '()', before: '(', after: ')', icon: <Brackets size={14} />, title: "أقواس" },
    { label: 'تابع', before: 'التابع ', after: '', icon: <Type size={14} />, title: "كلمة تابع" },
    { label: 'نص', before: '\\text{', after: '}', icon: <Quote size={14} />, title: "نص داخل اللاتيك" },
  ];

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-[11px] font-extrabold text-gray-500 mr-1 uppercase tracking-wider">{label}</label>}
      <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-50/80 border-b border-slate-200">
          {mathButtons.map((btn, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => insertText(btn.before, btn.after)}
              className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-slate-200"
              title={btn.title}
            >
              {btn.icon}
              <span className="hidden sm:inline">{btn.label}</span>
            </button>
          ))}
          
          <div className="flex-1" />
          
          {history.length > 0 && (
            <button
                type="button"
                onClick={handleUndo}
                className="h-8 px-2 flex items-center gap-1 text-xs font-bold text-amber-600 hover:bg-amber-50 rounded-lg transition-all border border-transparent hover:border-amber-200"
                title="تراجع عن التنسيق"
            >
                <Undo2 size={14} />
                <span className="hidden sm:inline">تراجع</span>
            </button>
          )}

          <button
              type="button"
              onClick={handleFormat}
              className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all border border-transparent hover:border-emerald-200"
              title="تنسيق النص والفقرات (إضافة أسطر عند النقط)"
          >
              <Sparkles size={14} />
              <span className="hidden sm:inline">تنسيق</span>
          </button>
          
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="h-8 w-8 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
              title="مسح النص"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        
        {/* Input Area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onInput={adjustHeight}
          dir="auto"
          className="w-full p-4 border-none focus:ring-0 text-right font-sans text-base leading-relaxed bg-white min-h-[80px] resize-none"
          style={{ direction: 'rtl', unicodeBidi: 'plaintext' }}
        />
      </div>
      <p className="text-[10px] text-gray-400 mr-2">استخدم $ للرموز و $$ للمعادلات الكبيرة. الكلمات العربية تدعم RTL تلقائياً.</p>
    </div>
  );
};
