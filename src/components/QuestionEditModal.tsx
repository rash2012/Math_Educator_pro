import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Eye, 
  Edit3, 
  Plus, 
  Image as ImageIcon, 
  CheckCircle2, 
  Sparkles, 
  HelpCircle, 
  Palette,
  FileText,
  Check,
  ChevronDown,
  Layers,
  RotateCcw
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { SmartMathEditor } from './SmartMathEditor';
import { cleanLeadingMarkers } from '../services/supabaseSync';

interface QuestionEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: any;
  sectionIdx: number;
  questionIdx: number;
  question: any;
  onSave: (updatedQuestion: any) => Promise<void> | void;
}

const SVG_PRESETS = [
  {
    name: 'محاور إحداثية ومنحني بياني',
    desc: 'معلم متجانس، محورين متعامدين ومنحني تابع أزرق',
    code: `<svg viewBox="0 0 240 180" width="240" height="180" xmlns="http://www.w3.org/2000/svg" class="bg-white">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/>
    </marker>
  </defs>
  <!-- محاور الإحداثيات -->
  <line x1="20" y1="150" x2="225" y2="150" stroke="#475569" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="45" y1="170" x2="45" y2="15" stroke="#475569" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="218" y="166" font-size="12" font-family="sans-serif" font-weight="bold" fill="#475569">x</text>
  <text x="32" y="22" font-size="12" font-family="sans-serif" font-weight="bold" fill="#475569">y</text>
  <text x="34" y="165" font-size="12" font-family="sans-serif" fill="#64748b">O</text>
  <!-- منحني بياني لتابع -->
  <path d="M 45 150 Q 110 30 160 85 T 215 35" fill="none" stroke="#2563eb" stroke-width="2.5"/>
</svg>`
  },
  {
    name: 'جدول تغيرات تابع',
    desc: 'جدول تغيرات لتابع مشتق وتغيرات القيم',
    code: `<svg viewBox="0 0 260 135" width="260" height="135" xmlns="http://www.w3.org/2000/svg" class="bg-white">
  <rect x="5" y="5" width="250" height="125" fill="#f8fafc" stroke="#334155" stroke-width="1.5" rx="6"/>
  <line x1="55" y1="5" x2="55" y2="130" stroke="#334155" stroke-width="1.5"/>
  <line x1="5" y1="45" x2="255" y2="45" stroke="#334155" stroke-width="1.5"/>
  <line x1="5" y1="85" x2="255" y2="85" stroke="#334155" stroke-width="1.5"/>
  <!-- أسماء الأسطر -->
  <text x="30" y="30" font-size="14" font-weight="bold" text-anchor="middle" fill="#0f172a">x</text>
  <text x="30" y="70" font-size="14" font-weight="bold" text-anchor="middle" fill="#0f172a">f'(x)</text>
  <text x="30" y="112" font-size="14" font-weight="bold" text-anchor="middle" fill="#0f172a">f(x)</text>
  <!-- قيم المجال -->
  <text x="75" y="30" font-size="12" fill="#334155">-∞</text>
  <text x="155" y="30" font-size="12" fill="#334155">1</text>
  <text x="235" y="30" font-size="12" fill="#334155">+∞</text>
  <!-- إشارات المشتق -->
  <text x="115" y="70" font-size="14" font-weight="bold" fill="#16a34a">+</text>
  <text x="155" y="70" font-size="14" font-weight="bold" fill="#334155">0</text>
  <text x="195" y="70" font-size="14" font-weight="bold" fill="#dc2626">-</text>
</svg>`
  },
  {
    name: 'مثلث قائم وهندسة مستوية',
    desc: 'مثلث قائم الزاوية مع تسمية الرؤوس والأضلاع',
    code: `<svg viewBox="0 0 220 170" width="220" height="170" xmlns="http://www.w3.org/2000/svg" class="bg-white">
  <!-- أضلاع المثلث -->
  <polygon points="35,145 190,145 35,35" fill="#eff6ff" stroke="#2563eb" stroke-width="2"/>
  <!-- زاوية قائمة -->
  <rect x="35" y="125" width="20" height="20" fill="none" stroke="#2563eb" stroke-width="1.5"/>
  <!-- الرؤوس -->
  <text x="18" y="152" font-size="13" font-weight="bold" fill="#1e293b">A</text>
  <text x="198" y="152" font-size="13" font-weight="bold" fill="#1e293b">B</text>
  <text x="25" y="28" font-size="13" font-weight="bold" fill="#1e293b">C</text>
</svg>`
  },
  {
    name: 'قالب SVG مخصص فارغ',
    desc: 'إطار SVG فارغ وجاهز لإدراج عناصرك',
    code: `<svg viewBox="0 0 200 150" width="200" height="150" xmlns="http://www.w3.org/2000/svg" class="bg-white">
  <!-- ضع عناصر الرسم هنا -->
</svg>`
  }
];

const ARA_ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
const ARA_ORDINALS_FEM = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];

export const QuestionEditModal: React.FC<QuestionEditModalProps> = ({
  isOpen,
  onClose,
  section,
  sectionIdx,
  questionIdx,
  question,
  onSave
}) => {
  const isMcq = section?.sectionType === 'mcq';

  // Local draft states
  const [text, setText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [solution, setSolution] = useState('');
  const [points, setPoints] = useState<string | number>('');
  const [svgCode, setSvgCode] = useState('');
  const [solutionSvgCode, setSolutionSvgCode] = useState('');

  // UI state
  const [showSolutionInPreview, setShowSolutionInPreview] = useState(true);
  const [showSvgPresets, setShowSvgPresets] = useState(false);
  const [showSolutionSvgPresets, setShowSolutionSvgPresets] = useState(false);
  const [showStandaloneSvgBox, setShowStandaloneSvgBox] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize draft when modal opens or question changes
  useEffect(() => {
    if (question && isOpen) {
      // If question has subQuestions or subParts, format cleanly into text
      let initialText = question.text || '';
      const subQs = question.subQuestions || question.subParts || [];
      if (Array.isArray(subQs) && subQs.length > 0) {
        const subCombined = subQs.map((sq: any, sIdx: number) => {
          const val = typeof sq === 'object' ? (sq.text || sq.prompt || '') : String(sq);
          return `${sIdx + 1}) ${cleanLeadingMarkers(val)}`;
        }).join('\n');
        if (!initialText.includes('1)')) {
          initialText = (initialText ? `${initialText.trim()}\n` : '') + subCombined;
        }
      }

      setText(initialText);
      setOptions(Array.isArray(question.options) && question.options.length >= 4 
        ? [...question.options] 
        : ['', '', '', '']);
      setCorrectOptionIndex(typeof question.correctOptionIndex === 'number' ? question.correctOptionIndex : 0);
      setSolution(question.solution || '');
      setPoints(question.points || '');
      setSvgCode(question.svgCode || '');
      setSolutionSvgCode(question.solutionSvgCode || '');
    }
  }, [question, isOpen]);

  if (!isOpen || !question) return null;

  // Question Title Helper
  const getQuestionHeading = () => {
    if (isMcq) return `السؤال ${questionIdx + 1} (اختيار من متعدد)`;
    if (sectionIdx === 1) return `السؤال ${ARA_ORDINALS[questionIdx] || questionIdx + 1}`;
    if (sectionIdx === 2) return `التمرين ${ARA_ORDINALS[questionIdx] || questionIdx + 1}`;
    if (sectionIdx === 3) return `المسألة ${ARA_ORDINALS_FEM[questionIdx] || questionIdx + 1}`;
    return `السؤال ${ARA_ORDINALS[questionIdx] || questionIdx + 1}`;
  };

  // Insert helper functions
  const insertNextRequest = () => {
    // Count existing requests (e.g. 1), 2), 3))
    const matches = text.match(/^\s*([1-9][0-9]?|[①-⑫])[\.\-\)\:]/gm);
    const nextNum = (matches ? matches.length : 0) + 1;
    const prefix = text.endsWith('\n') || !text ? '' : '\n';
    setText(prev => `${prev}${prefix}${nextNum}) `);
  };

  const insertNextSubPart = () => {
    const prefix = text.endsWith('\n') || !text ? '' : '\n';
    setText(prev => `${prev}${prefix}   a) `);
  };

  const insertSvgCodeAtText = (code: string) => {
    const prefix = text.endsWith('\n') || !text ? '' : '\n';
    const suffix = '\n';
    setText(prev => `${prev}${prefix}${code}${suffix}`);
    setShowSvgPresets(false);
  };

  const insertSvgCodeAtSolution = (code: string) => {
    const prefix = solution.endsWith('\n') || !solution ? '' : '\n';
    const suffix = '\n';
    setSolution(prev => `${prev}${prefix}${code}${suffix}`);
    setShowSolutionSvgPresets(false);
  };

  // Prepare full simulated content
  // If user provided svgCode in standalone field and text does not have <svg, prepend it
  const simulatedQuestionContent = (svgCode.trim() && !text.includes('<svg'))
    ? `${svgCode.trim()}\n${text}`
    : text;

  const simulatedSolutionContent = (solutionSvgCode.trim() && !solution.includes('<svg'))
    ? `${solutionSvgCode.trim()}\n${solution}`
    : solution;

  // Save handler
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const updatedQ: any = {
        ...question,
        text: text.trim(),
        points: points ? Number(points) || points : undefined,
        solution: solution.trim()
      };

      if (isMcq) {
        updatedQ.options = options;
        updatedQ.correctOptionIndex = correctOptionIndex;
      }

      if (svgCode.trim()) {
        updatedQ.svgCode = svgCode.trim();
      } else {
        delete updatedQ.svgCode;
      }

      if (solutionSvgCode.trim()) {
        updatedQ.solutionSvgCode = solutionSvgCode.trim();
      } else {
        delete updatedQ.solutionSvgCode;
      }

      // Remove obsolete subQuestions if unified into text
      delete updatedQ.subQuestions;
      delete updatedQ.subParts;

      await onSave(updatedQ);
      onClose();
    } catch (err: any) {
      alert(`حدث خطأ أثناء حفظ السؤال: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden animate-fade-in"
      dir="rtl"
    >
      <div className="w-full max-w-7xl h-[94vh] max-h-[920px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-700 via-indigo-800 to-violet-800 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white backdrop-blur-sm border border-white/20">
              <Edit3 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/20">
                  {section?.title || (isMcq ? 'أولاً - اختيار من متعدد' : 'قسم مقالي')}
                </span>
                <h3 className="font-black text-lg text-white">
                  {getQuestionHeading()}
                </h3>
              </div>
              <p className="text-xs text-indigo-100 font-medium mt-0.5">
                تعديل فوري مع محاكاة مباشرة لظهور السؤال بورقة الامتحان وسلم التصحيح
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Tab Switcher */}
            <div className="flex lg:hidden bg-white/10 p-1 rounded-xl border border-white/20">
              <button
                type="button"
                onClick={() => setMobileTab('editor')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${mobileTab === 'editor' ? 'bg-white text-indigo-900 shadow-xs' : 'text-white'}`}
              >
                المدخلات
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('preview')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${mobileTab === 'preview' ? 'bg-white text-indigo-900 shadow-xs' : 'text-white'}`}
              >
                المحاكاة
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="إغلاق"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Pane Split (Right: Edit Controls, Left: Live Simulation) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200">
          
          {/* ================= RIGHT PANE: EDIT CONTROLS ================= */}
          <div className={`overflow-y-auto p-4 sm:p-6 space-y-5 bg-white ${mobileTab === 'editor' ? 'block' : 'hidden lg:block'}`}>
            
            {/* Question Text & Requests (Single Unified Block) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <FileText size={16} className="text-indigo-600" />
                  <span>نص السؤال والطلبات (كتلة موحدة)</span>
                </label>
                <span className="text-xs text-slate-500 font-bold">
                  {text.length} حرف
                </span>
              </div>

              {/* Informative Help Banner for SVG Text-Wrapping */}
              <div className="p-2.5 rounded-xl bg-violet-50/80 border border-violet-200/90 text-xs text-violet-900 leading-relaxed flex items-start gap-2">
                <Sparkles size={16} className="text-violet-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">خاصية التفاف النص حول الرسم: </span>
                  اكتب كود <code className="bg-white px-1 py-0.5 rounded text-violet-700 font-mono text-[11px]">&lt;svg&gt;</code> في السطر الذي تريد أن يبدأ منه الرسم، وسيلتف النص تلقائياً حوله على اليمين!
                </div>
              </div>

              {/* Quick Insertion Tools for Question */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-600 ml-1">إدراج سريع:</span>
                
                <button
                  type="button"
                  onClick={insertNextRequest}
                  className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 rounded-lg text-xs transition-colors flex items-center gap-1 shadow-2xs"
                  title="إدراج سطر طلب مرقم"
                >
                  <Plus size={13} />
                  <span>سطر طلب 1)</span>
                </button>

                <button
                  type="button"
                  onClick={insertNextSubPart}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-lg text-xs transition-colors flex items-center gap-1 shadow-2xs"
                  title="إدراج سطر طلب فرعي"
                >
                  <Plus size={13} />
                  <span>فرعي a)</span>
                </button>

                {/* SVG Presets Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSvgPresets(!showSvgPresets)}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <Palette size={13} className="text-emerald-600" />
                    <span>+ رسم SVG بالسؤال 🎨</span>
                    <ChevronDown size={12} className={`transition-transform ${showSvgPresets ? 'rotate-180' : ''}`} />
                  </button>

                  {showSvgPresets && (
                    <div className="absolute top-full right-0 mt-1.5 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-30 space-y-1 animate-scale-up">
                      <div className="text-[11px] font-bold text-slate-500 px-2 py-1 border-b border-slate-100">
                        اختر قالباً للإدراج بنص السؤال:
                      </div>
                      {SVG_PRESETS.map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => insertSvgCodeAtText(preset.code)}
                          className="w-full text-right p-2 hover:bg-emerald-50/70 rounded-xl transition-colors flex flex-col gap-0.5 group"
                        >
                          <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                            {preset.name}
                          </span>
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {preset.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setText(prev => `${prev} $x$ `)}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 font-mono font-bold border border-slate-300 rounded-lg text-xs transition-colors shadow-2xs"
                  title="صيغة رياضية بين علامتي دولار"
                >
                  $صيغة$
                </button>
              </div>

              {/* Textarea for Question */}
              <SmartMathEditor
                value={text}
                onChange={setText}
                placeholder="اكتب نص السؤال هنا... \n1) الطلب الأول \n2) الطلب الثاني..."
                className="w-full min-h-[160px]"
              />
            </div>

            {/* MCQ Options (If MCQ Section) */}
            {isMcq && (
              <div className="space-y-3 p-4 bg-slate-50/90 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <Layers size={16} className="text-indigo-600" />
                    <span>خيارات السؤال المتعدد (A, B, C, D)</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <span>الإجابة الصحيحة:</span>
                    <select
                      value={correctOptionIndex}
                      onChange={(e) => setCorrectOptionIndex(parseInt(e.target.value, 10))}
                      className="bg-white border border-emerald-300 font-black text-emerald-800 rounded px-1.5 py-0.5 text-xs focus:ring-1 focus:ring-emerald-500"
                    >
                      {['A', 'B', 'C', 'D'].map((letter, idx) => (
                        <option key={idx} value={idx}>
                          ({letter})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['A', 'B', 'C', 'D'].map((letter, optIdx) => {
                    const isCorrect = correctOptionIndex === optIdx;
                    return (
                      <div 
                        key={optIdx} 
                        className={`p-3 rounded-xl border transition-all ${
                          isCorrect 
                            ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/30' 
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                            isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {letter}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCorrectOptionIndex(optIdx)}
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                              isCorrect 
                                ? 'bg-emerald-600 text-white' 
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                            }`}
                          >
                            {isCorrect ? '✓ الإجابة الصحيحة' : 'تعيين كصحيحة'}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={options[optIdx] || ''}
                          onChange={(e) => {
                            const newOpts = [...options];
                            newOpts[optIdx] = e.target.value;
                            setOptions(newOpts);
                          }}
                          placeholder={`نص الخيار ${letter}...`}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Points / Score */}
            <div className="flex items-center gap-3 p-3 bg-slate-50/70 rounded-2xl border border-slate-200">
              <label className="text-xs font-bold text-slate-700 shrink-0">
                درجة / علامة السؤال:
              </label>
              <input
                type="number"
                min="0"
                step="5"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder="مثال: 40"
                className="w-24 p-1.5 bg-white border border-slate-300 rounded-xl text-center font-bold text-sm focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-500">
                (تظهر في أعلى بطاقة السؤال وسلم التصحيح)
              </span>
            </div>

            {/* Solution & Rubric */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-amber-600" />
                  <span>الحل النموذجي وسلم التصحيح</span>
                </label>
                <span className="text-xs text-slate-500 font-bold">
                  {solution.length} حرف
                </span>
              </div>

              {/* Solution quick tools */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-amber-50/50 border border-amber-200/70 rounded-xl">
                <span className="text-xs font-bold text-amber-900 ml-1">أدوات الحل:</span>
                
                {/* Solution SVG Presets */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSolutionSvgPresets(!showSolutionSvgPresets)}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <Palette size={13} className="text-amber-600" />
                    <span>+ رسم SVG بالحل 🎨</span>
                    <ChevronDown size={12} className={`transition-transform ${showSolutionSvgPresets ? 'rotate-180' : ''}`} />
                  </button>

                  {showSolutionSvgPresets && (
                    <div className="absolute top-full right-0 mt-1.5 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-30 space-y-1 animate-scale-up">
                      <div className="text-[11px] font-bold text-slate-500 px-2 py-1 border-b border-slate-100">
                        اختر قالباً للإدراج بنص الحل:
                      </div>
                      {SVG_PRESETS.map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => insertSvgCodeAtSolution(preset.code)}
                          className="w-full text-right p-2 hover:bg-amber-50 rounded-xl transition-colors flex flex-col gap-0.5 group"
                        >
                          <span className="text-xs font-bold text-slate-800 group-hover:text-amber-800">
                            {preset.name}
                          </span>
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {preset.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSolution(prev => `${prev} $x$ `)}
                  className="px-2 py-1 bg-white hover:bg-amber-100 text-amber-900 font-mono font-bold border border-amber-300 rounded-lg text-xs transition-colors shadow-2xs"
                  title="صيغة رياضية بين علامتي دولار"
                >
                  $صيغة$
                </button>
              </div>

              <SmartMathEditor
                value={solution}
                onChange={setSolution}
                placeholder="اكتب خطوات الحل بالتفصيل وسلم توزيع الدرجات..."
                className="w-full min-h-[140px]"
              />
            </div>

            {/* Standalone SVG Codes (Optional) */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShowStandaloneSvgBox(!showStandaloneSvgBox)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-indigo-600 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <ImageIcon size={14} className="text-slate-500" />
                  <span>حقول كود SVG المستقلة (اختياري)</span>
                  {(svgCode || solutionSvgCode) && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  )}
                </span>
                <ChevronDown size={14} className={`transition-transform ${showStandaloneSvgBox ? 'rotate-180' : ''}`} />
              </button>

              {showStandaloneSvgBox && (
                <div className="mt-3 space-y-3 pt-3 border-t border-slate-200">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">
                      كود SVG التوضيحي للسؤال:
                    </label>
                    <textarea
                      dir="ltr"
                      rows={3}
                      value={svgCode}
                      onChange={(e) => setSvgCode(e.target.value)}
                      placeholder="<svg viewBox='...'>...</svg>"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono whitespace-pre focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">
                      كود SVG التوضيحي للحل:
                    </label>
                    <textarea
                      dir="ltr"
                      rows={3}
                      value={solutionSvgCode}
                      onChange={(e) => setSolutionSvgCode(e.target.value)}
                      placeholder="<svg viewBox='...'>...</svg>"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono whitespace-pre focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ================= LEFT PANE: LIVE SIMULATION ================= */}
          <div className={`overflow-y-auto p-4 sm:p-6 bg-slate-50/70 flex flex-col gap-4 ${mobileTab === 'preview' ? 'block' : 'hidden lg:block'}`}>
            
            {/* Simulation Header Bar */}
            <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-black text-slate-800">
                  محاكاة ورقة الامتحان المباشرة
                </span>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSolutionInPreview}
                  onChange={(e) => setShowSolutionInPreview(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>معاينة الحل</span>
              </label>
            </div>

            {/* Simulated Question Card (Exact Syrian Exam Style) */}
            <div className="bg-white rounded-2xl border border-gray-300 p-5 shadow-xs transition-all space-y-4">
              
              {/* Question Header */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  {isMcq ? (
                    <span className="flex items-center justify-center w-6 h-6 rounded-full border border-black text-black font-bold text-sm bg-white select-none">
                      {questionIdx + 1}
                    </span>
                  ) : (
                    <span className="font-bold text-black text-base select-none">
                      {getQuestionHeading()} :
                    </span>
                  )}
                  {points && (
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      ({points} درجة)
                    </span>
                  )}
                </div>

                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  معاينة فورية
                </span>
              </div>

              {/* Question Body with Flow-Root & Text-Wrap around SVG */}
              <div className="w-full text-gray-900 leading-relaxed font-normal text-sm overflow-visible">
                {simulatedQuestionContent ? (
                  <MathRenderer 
                    content={simulatedQuestionContent} 
                    className="w-full overflow-visible [&_p]:mb-2 [&_p]:last:mb-0"
                  />
                ) : (
                  <p className="text-slate-400 italic text-sm">
                    (اكتب نص السؤال في القسم الأيمن لتشاهد المحاكاة هنا فوراً...)
                  </p>
                )}
              </div>

              {/* MCQ Options Table (If MCQ) */}
              {isMcq && (
                <div className="w-full mt-3 clear-both break-inside-avoid">
                  <table className="w-full border-collapse border border-gray-400 text-center text-sm" dir="rtl">
                    <tbody>
                      <tr>
                        {['A', 'B', 'C', 'D'].map((letter, optIdx) => {
                          const isCorrect = correctOptionIndex === optIdx;
                          const optText = options[optIdx] || '';
                          return (
                            <React.Fragment key={optIdx}>
                              <td 
                                className={`border border-gray-400 p-1.5 font-bold align-middle text-center w-[5%] whitespace-nowrap ${
                                  isCorrect && showSolutionInPreview 
                                    ? 'bg-emerald-100 text-emerald-900' 
                                    : 'bg-gray-100 text-black'
                                }`}
                              >
                                {letter}
                              </td>
                              <td 
                                className={`border border-gray-400 p-2 align-middle text-center w-[20%] ${
                                  isCorrect && showSolutionInPreview 
                                    ? 'bg-emerald-50/50' 
                                    : 'bg-white'
                                }`}
                              >
                                {optText ? (
                                  <MathRenderer content={optText} className="text-center" />
                                ) : (
                                  <span className="text-gray-300 text-xs">...</span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Solution Preview */}
              {showSolutionInPreview && (simulatedSolutionContent || isMcq) && (
                <div className="mt-4 p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-950 text-sm space-y-2 clear-both">
                  <div className="flex items-center justify-between font-bold text-amber-900 text-xs pb-1 border-b border-amber-200/70">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span>الحل وسلم التصحيح:</span>
                    </span>
                    {isMcq && (
                      <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md font-bold">
                        الخيار الصحيح: ({['A', 'B', 'C', 'D'][correctOptionIndex]})
                      </span>
                    )}
                  </div>
                  {simulatedSolutionContent ? (
                    <MathRenderer 
                      content={simulatedSolutionContent} 
                      className="w-full text-amber-950 [&_p]:mb-2 [&_p]:last:mb-0"
                    />
                  ) : (
                    <p className="text-amber-700/60 text-xs italic">
                      (لا يوجد شرح حل مكتوب حالياً)
                    </p>
                  )}
                </div>
              )}

            </div>

            {/* Preview Hint */}
            <div className="text-[11px] text-slate-500 text-center font-medium">
              💡 هذه المحاكاة مطابقة 100% لما يظهر للطالب وفي الطباعة A4 المدرسية.
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium hidden sm:block">
            💡 سيتم حفظ التعديلات محلياً وتحديث ورقة الاختبار فوراً.
          </div>

          <div className="flex items-center gap-2.5 mr-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-xl text-xs transition-colors"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm hover:shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <span>جارٍ الحفظ...</span>
              ) : (
                <>
                  <Check size={16} />
                  <span>حفظ التعديلات</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
