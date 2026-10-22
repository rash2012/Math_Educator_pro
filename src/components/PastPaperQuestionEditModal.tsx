import React, { useState } from 'react';
import { PastPaperQuestion } from '../db';
import { MathRenderer } from './MathRenderer';
import { 
  X, 
  Save, 
  Eye, 
  Code, 
  Plus, 
  Trash2, 
  Sparkles, 
  Layers, 
  FileText, 
  Check, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  CheckCircle2,
  Columns,
  Maximize2
} from 'lucide-react';
import { reviewPastPaperQuestionSolutionAI } from '../services/gemini';

interface PastPaperQuestionEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: PastPaperQuestion;
  questionIndex: number;
  onSave: (updatedQuestion: PastPaperQuestion) => void;
}

const ORDER_TITLE_CATEGORIES = [
  {
    category: 'الأسئلة',
    titles: [
      'السؤال الأول',
      'السؤال الثاني',
      'السؤال الثالث',
      'السؤال الرابع',
      'السؤال الخامس',
      'السؤال السادس'
    ]
  },
  {
    category: 'التمارين',
    titles: [
      'التمرين الأول',
      'التمرين الثاني',
      'التمرين الثالث',
      'التمرين الرابع',
      'التمرين الخامس',
      'التمرين السادس'
    ]
  },
  {
    category: 'المسائل',
    titles: [
      'المسألة الأولى',
      'المسألة الثانية',
      'المسألة الثالثة',
      'المسألة الرابعة'
    ]
  },
  {
    category: 'الترويسات والأقسام',
    titles: [
      'أولاً: أجب عن السؤالين الآتيين',
      'ثانياً: حل التمارين الأربعة الآتية',
      'ثالثاً: حل المسألتين الآتيتين',
      'أولاً',
      'ثانياً',
      'ثالثاً'
    ]
  }
];

const COMMON_TOPICS = [
  'الأشعة في الفراغ',
  'نهايات واستمرار',
  'الاشتقاق وتطبيقاته',
  'التوابع اللوغاريتمية',
  'التوابع الأسية',
  'التكامل وحساب المساحات',
  'الأعداد المركبة وتطبيقاتها',
  'المتتاليات والاستقراء الرياضي',
  'التحليل التوافقي والاحتمالات',
  'هندسة فراغية ومستويات'
];

export const PastPaperQuestionEditModal: React.FC<PastPaperQuestionEditModalProps> = ({
  isOpen,
  onClose,
  question,
  questionIndex,
  onSave
}) => {
  if (!isOpen) return null;

  // Form State
  const [orderTitle, setOrderTitle] = useState(question.orderTitle || `السؤال ${questionIndex + 1}`);
  const [topic, setTopic] = useState(question.topic || 'عام');
  const [type, setType] = useState<'essay' | 'mcq'>(question.type || 'essay');
  const [questionText, setQuestionText] = useState(question.question || '');
  const [subParts, setSubParts] = useState<string[]>(question.subParts ? [...question.subParts] : []);
  const [solution, setSolution] = useState(question.solution || '');
  const [svgCode, setSvgCode] = useState(question.svgCode || '');
  const [solutionSvgCode, setSolutionSvgCode] = useState(question.solutionSvgCode || '');

  // UI state
  const [showSvgSection, setShowSvgSection] = useState(!!question.svgCode);
  const [showSolutionSvgSection, setShowSolutionSvgSection] = useState(!!question.solutionSvgCode);
  const [activeCategory, setActiveCategory] = useState<'الأسئلة' | 'التمارين' | 'المسائل' | 'الترويسات والأقسام'>('الأسئلة');

  // In-modal AI review state
  const [isReviewingAI, setIsReviewingAI] = useState(false);
  const [reviewNote, setReviewNote] = useState<string | null>(null);

  // Helper to insert snippet into a textarea
  const insertSnippet = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string,
    prefix: string,
    suffix: string = ''
  ) => {
    setter(prev => prev + (prev.endsWith('\n') || prev === '' ? '' : ' ') + prefix + suffix);
  };

  // Handle subParts
  const handleAddSubPart = () => {
    const nextLabel = ['(أ)', '(ب)', '(ج)', '(د)', '(هـ)'][subParts.length] || `(${subParts.length + 1})`;
    setSubParts([...subParts, `${nextLabel} `]);
  };

  const handleUpdateSubPart = (index: number, val: string) => {
    const updated = [...subParts];
    updated[index] = val;
    setSubParts(updated);
  };

  const handleRemoveSubPart = (index: number) => {
    setSubParts(subParts.filter((_, i) => i !== index));
  };

  // Run AI Solution Review directly inside modal
  const handleReviewSolutionInModal = async () => {
    if (!questionText.trim()) {
      alert("يرجى التأكد من كتابة نص السؤال أولاً قبل مراجعة الحل.");
      return;
    }
    setIsReviewingAI(true);
    setReviewNote(null);
    try {
      const res = await reviewPastPaperQuestionSolutionAI(
        orderTitle,
        questionText,
        solution,
        subParts,
        topic
      );
      if (res && res.reviewedSolution) {
        setSolution(res.reviewedSolution);
        if (res.notes) {
          setReviewNote(res.notes);
        }
      }
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء الاتصال بمحرك الذكاء الاصطناعي لمراجعة الحل.");
    } finally {
      setIsReviewingAI(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: PastPaperQuestion = {
      ...question,
      orderTitle: orderTitle.trim(),
      topic: topic.trim() || 'عام',
      type,
      question: questionText.trim(),
      subParts: subParts.map(s => s.trim()).filter(Boolean),
      solution: solution.trim(),
      svgCode: svgCode.trim() || undefined,
      solutionSvgCode: solutionSvgCode.trim() || undefined
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in no-print">
      <div 
        className="bg-white w-full max-w-7xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[94vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black flex items-center gap-2">
                <span>تعديل يدوي كامل:</span>
                <span className="text-red-400 font-black text-sm bg-red-950/80 px-2.5 py-0.5 rounded-md border border-red-500/40">
                  {orderTitle || `السؤال ${questionIndex + 1}`}
                </span>
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5">
                تعديل العناوين، الترويسة، النص والحل يدوياً مع شاشة عرض حية ومباشرة بجانب التعديل
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-lg text-xs font-bold text-slate-200">
              <Columns size={14} className="text-indigo-300" />
              <span>شاشة التعديل (يمين) | شاشة العرض (يسار)</span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
              title="إغلاق"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body - 2 Columns Split Screen */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 overflow-hidden divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200">
          
          {/* ========================================================================= */}
          {/* COLUMN 1: EDIT FORM (شاشة التحرير والتعديل اليدوي) */}
          {/* ========================================================================= */}
          <div className="overflow-y-auto p-4 sm:p-5 space-y-5 bg-white">
            
            {/* Section 1: Order Title & Naming */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <label className="text-xs font-black text-red-600 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
                  <span>اسم وترتيب السؤال (كما ورد في ورقة الامتحان تماماً):</span>
                </label>
                <span className="text-[10px] font-bold text-slate-400">يظهر باللون الأحمر</span>
              </div>

              <input
                type="text"
                required
                value={orderTitle}
                onChange={e => setOrderTitle(e.target.value)}
                placeholder="مثال: السؤال الأول، التمرين الثاني، المسألة الأولى..."
                className="w-full px-3.5 py-2.5 text-sm font-black bg-white border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-red-600 shadow-xs"
              />

              {/* Categorized Quick Title Selector (السؤال، التمرين، المسألة، الترويسات) */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-1 border-b border-slate-200 pb-1 overflow-x-auto text-[11px] font-bold">
                  {ORDER_TITLE_CATEGORIES.map(cat => (
                    <button
                      key={cat.category}
                      type="button"
                      onClick={() => setActiveCategory(cat.category as any)}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer whitespace-nowrap ${
                        activeCategory === cat.category
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.category}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ORDER_TITLE_CATEGORIES.find(c => c.category === activeCategory)?.titles.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderTitle(t)}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer border ${
                        orderTitle === t
                          ? 'bg-red-50 text-red-700 border-red-300 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-red-200 hover:bg-red-50/50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 2: Topic and Question Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
              {/* Topic */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">الموضوع الرياضي:</label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="مثال: الأشعة في الفراغ"
                  className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                />
              </div>

              {/* Type */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">نوع السؤال:</label>
                <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setType('essay')}
                    className={`py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                      type === 'essay'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    مقالي / مسألة
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('mcq')}
                    className={`py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                      type === 'mcq'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    اختيار من متعدد
                  </button>
                </div>
              </div>

              {/* Quick Topic Chips */}
              <div className="sm:col-span-2 pt-1">
                <span className="text-[10px] font-semibold text-slate-500 block mb-1">مواضيع المنهاج الشائعة:</span>
                <div className="flex flex-wrap gap-1">
                  {COMMON_TOPICS.map(tp => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setTopic(tp)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer border ${
                        topic === tp
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      {tp}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 3: Question Text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <FileText size={15} className="text-indigo-600" />
                  <span>نص السؤال الحرفي (النقل الحرفي الدقيق كما ورد في الـ PDF):</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">LaTeX: $...$</span>
              </div>

              {/* Quick math symbol toolbar */}
              <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
                <span className="text-slate-400 font-medium px-1">إدراج:</span>
                <button
                  type="button"
                  onClick={() => insertSnippet(setQuestionText, questionText, '$', '$')}
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono hover:bg-slate-100"
                >
                  {'$x$'}
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet(setQuestionText, questionText, '$\\frac{', '}{}$') }
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono hover:bg-slate-100"
                >
                  {'$\\frac{a}{b}$'}
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet(setQuestionText, questionText, '$\\sqrt{', '}$') }
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono hover:bg-slate-100"
                >
                  {'$\\sqrt{x}$'}
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet(setQuestionText, questionText, '$\\overrightarrow{', '}$') }
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono hover:bg-slate-100"
                >
                  {'$\\overrightarrow{AB}$'}
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet(setQuestionText, questionText, '$\\vec{', '}$') }
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono hover:bg-slate-100"
                >
                  {'$\\vec{u}$'}
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet(setQuestionText, questionText, '$\\lim_{x \\to ', '}$') }
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono hover:bg-slate-100"
                >
                  {'$\\lim$'}
                </button>
              </div>

              <textarea
                rows={5}
                required
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
                placeholder="اكتب نص السؤال حرفياً كما ورد في ورقة الامتحان الأصلية، مع استخدام $...$ للمعادلات والرموز..."
                className="w-full p-3 text-xs sm:text-sm font-sans bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed text-slate-900"
              />
            </div>

            {/* Section 4: SubParts / MCQ Options */}
            {(type === 'mcq' || subParts.length > 0) && (
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800">
                    {type === 'mcq' ? 'خيارات الإجابة (أ، ب، ج، د):' : 'بنود أو طلبات السؤال الفرعية:'}
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSubPart}
                    className="px-2.5 py-1 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>إضافة خيار</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {subParts.map((part, pIdx) => (
                    <div key={pIdx} className="flex items-center gap-2">
                      <span className="w-7 text-center font-bold text-xs text-slate-500 bg-white border border-slate-200 py-1.5 rounded-lg shrink-0">
                        {pIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={part}
                        onChange={e => handleUpdateSubPart(pIdx, e.target.value)}
                        placeholder={`خيار / بند ${pIdx + 1}`}
                        className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSubPart(pIdx)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 5: Question SVG Code (الشكل التوضيحي المرفق بالسؤال) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSvgSection(!showSvgSection)}
                className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon size={15} className="text-indigo-600" />
                  <span>كود SVG للرسم التوضيحي المرفق بالسؤال (اختياري)</span>
                  {svgCode && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      مضاف
                    </span>
                  )}
                </div>
                {showSvgSection ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {showSvgSection && (
                <div className="p-3 bg-white border-t border-slate-200 space-y-2">
                  <textarea
                    rows={3}
                    value={svgCode}
                    onChange={e => setSvgCode(e.target.value)}
                    placeholder="<svg viewBox='0 0 500 350' width='100%' height='auto' ...> ... </svg>"
                    className="w-full p-2.5 font-mono text-[11px] bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-slate-400">
                    💡 يمكنك معاينة الرسم في شاشة العرض الحية المجاورة مباشرة أثناء التعديل.
                  </p>
                </div>
              )}
            </div>

            {/* Section 6: Solution Text & Formatting */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  <span>الحل النموذجي المعتمد (الخطوات والوسوم والترقيم الدائري):</span>
                </label>

                {/* AI Review in Modal */}
                <button
                  type="button"
                  onClick={handleReviewSolutionInModal}
                  disabled={isReviewingAI}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="مراجعة وتدقيق الحل بالذكاء الاصطناعي وفق المنهاج السوري"
                >
                  {isReviewingAI ? (
                    <>
                      <Loader2 size={12} className="animate-spin text-emerald-600" />
                      <span>جاري التدقيق...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} className="text-emerald-600" />
                      <span>مراجعة الحل بالـ AI</span>
                    </>
                  )}
                </button>
              </div>

              {reviewNote && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium flex items-start gap-2">
                  <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">ملاحظات مراجعة الحل: </span>
                    <span>{reviewNote}</span>
                  </div>
                </div>
              )}

              {/* Solution Formatting Toolbar */}
              <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
                <span className="text-slate-400 font-bold px-1">تنسيق:</span>
                <button
                  type="button"
                  onClick={() => insertSnippet(setSolution, solution, '*العنوان الرئيسي باللون الأحمر*')}
                  className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-bold hover:bg-red-100"
                  title="عنوان رئيسي أحمر"
                >
                  *أحمر*
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet(setSolution, solution, '*#العنوان الفرعي باللون الأزرق#*')}
                  className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold hover:bg-blue-100"
                  title="عنوان فرعي أزرق"
                >
                  *#أزرق#*
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet(setSolution, solution, '***دستور أو قانون عام***')}
                  className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-bold hover:bg-amber-100"
                  title="إطار أحمر للدستور"
                >
                  ***دستور***
                </button>
                <span className="text-slate-300">|</span>
                {['①', '②', '③', '④', '⑤', '⑥'].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => insertSnippet(setSolution, solution, `${num} `)}
                    className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 rounded hover:bg-slate-100 font-bold text-slate-800 text-[10px]"
                  >
                    {num}
                  </button>
                ))}
              </div>

              <textarea
                rows={7}
                value={solution}
                onChange={e => setSolution(e.target.value)}
                placeholder="اكتب خطوات الحل المعتمد هنا، مستخدماً الأرقام الدائرية ①، ② والوسوم الملونة للعناوين..."
                className="w-full p-3 text-xs sm:text-sm font-sans bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed text-slate-900"
              />
            </div>

            {/* Section 7: Solution SVG Code (كود رسم الحل) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSolutionSvgSection(!showSolutionSvgSection)}
                className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon size={15} className="text-emerald-600" />
                  <span>كود SVG لجدول التغيرات أو الرسم التوضيحي للحل (اختياري)</span>
                  {solutionSvgCode && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      مضاف
                    </span>
                  )}
                </div>
                {showSolutionSvgSection ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {showSolutionSvgSection && (
                <div className="p-3 bg-white border-t border-slate-200 space-y-2">
                  <textarea
                    rows={3}
                    value={solutionSvgCode}
                    onChange={e => setSolutionSvgCode(e.target.value)}
                    placeholder="<svg viewBox='0 0 500 200' width='100%' height='auto' ...> ... </svg>"
                    className="w-full p-2.5 font-mono text-[11px] bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* COLUMN 2: LIVE PREVIEW SCREEN (شاشة العرض الحية المباشرة بجانب التعديل) */}
          {/* ========================================================================= */}
          <div className="overflow-y-auto p-4 sm:p-6 bg-slate-100/90 flex flex-col space-y-4">
            
            {/* Live Preview Header */}
            <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs shrink-0">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                <Eye size={16} className="text-indigo-600" />
                <span>شاشة العرض الحية المباشرة (ورقة الامتحان والحل):</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                تحديث فوري أثناء الكتابة
              </span>
            </div>

            {/* Exam Card Live Representation */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 space-y-5 shadow-sm">
              
              {/* Top Tags bar in preview */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="bg-orange-50 text-orange-850 px-2.5 py-0.5 rounded-md text-xs font-bold border border-orange-200">
                    {topic || 'عام'}
                  </span>
                  <span className="bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-md text-xs font-bold">
                    {type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي / مسألة'}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold text-gray-500 bg-slate-50 px-2 py-0.5 rounded border border-gray-200">
                  #{questionIndex + 1}
                </span>
              </div>

              {/* Question Content Container */}
              <div className="bg-gray-50/70 border border-gray-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-xs">
                
                {/* Question Order Title in RED (السؤال الأول، التمرين الأول، المسألة الأولى، إلخ) */}
                <div className="pb-2.5 border-b border-red-200/90 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
                    <h4 className="text-red-600 font-black text-base md:text-lg tracking-wide">
                      {orderTitle || `السؤال ${questionIndex + 1}`}
                    </h4>
                  </div>
                </div>

                {/* Question Text */}
                <div className="text-gray-900 leading-relaxed font-sans font-medium text-sm md:text-base">
                  <MathRenderer content={questionText || '*(أدخل نص السؤال في شاشة التعديل باليمين ليظهر هنا فورياً)*'} />
                </div>

                {/* Question SVG Illustration Preview */}
                {svgCode && (
                  <div className="my-3 p-3 bg-white rounded-xl border border-gray-200 shadow-xs flex flex-col items-center justify-center overflow-x-auto">
                    <span className="text-[11px] font-black text-gray-600 mb-2 flex items-center gap-1 self-start">
                      📐 الشكل التوضيحي المرفق بالسؤال:
                    </span>
                    <div 
                      className="w-full flex justify-center items-center overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: svgCode }}
                    />
                  </div>
                )}

                {/* MCQ Options Preview */}
                {type === 'mcq' && subParts.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                    {subParts.map((opt, oIdx) => (
                      <div 
                        key={oIdx}
                        className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold shadow-xs"
                      >
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Solution Live Preview */}
              <div className="border-l-4 border-emerald-500 bg-emerald-50/40 p-4 md:p-5 rounded-r-xl space-y-3">
                <h5 className="font-black text-xs md:text-sm text-emerald-850 flex items-center gap-1.5 border-b border-emerald-200 pb-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>الحل النموذجي المعتمد وزاريّاً:</span>
                </h5>

                <div className="text-gray-900 leading-relaxed font-sans font-medium text-xs md:text-sm">
                  <MathRenderer content={solution || '*(أدخل خطوات الحل في شاشة التعديل باليمين لتظهر هنا فورياً)*'} />
                </div>

                {/* Solution SVG Preview */}
                {solutionSvgCode && (
                  <div 
                    className="flex justify-center my-3 bg-white p-3 rounded-xl border border-emerald-200 overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto" 
                    dangerouslySetInnerHTML={{ __html: solutionSvgCode }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            إلغاء التراجع
          </button>

          <span className="hidden sm:inline-block text-[11px] font-semibold text-slate-500">
            ✨ يتم تحديث شاشة العرض الحية المجاورة تلقائياً مع كل حرف تدخله
          </span>

          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-black rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Save size={16} />
            <span>حفظ تعديلات السؤال والحل</span>
          </button>
        </div>
      </div>
    </div>
  );
};
