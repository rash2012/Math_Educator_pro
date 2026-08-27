import React, { useState, useEffect } from 'react';
import { db, type Document } from '../db';
import { 
  X, 
  Sparkles, 
  Loader2, 
  Check, 
  ChevronRight, 
  Plus, 
  Trash, 
  Lightbulb, 
  FileText,
  MousePointer2,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateCustomQuestion, solveCustomQuestion, generateSvgForTestQuestion } from '../services/gemini';
import { SmartMathEditor } from './SmartMathEditor';

interface QuestionDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (question: any) => void;
  grade: string;
  subject: string;
}

export const QuestionDesignerModal: React.FC<QuestionDesignerModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  grade,
  subject
}) => {
  const [pdfs, setPdfs] = useState<Document[]>([]);
  const [selectedPdfIds, setSelectedPdfIds] = useState<number[]>([]);
  const [subCount, setSubCount] = useState(2);
  const [instructions, setInstructions] = useState('');
  const [recommendations, setRecommendations] = useState('');
  
  const [questionText, setQuestionText] = useState('');
  const [subQuestions, setSubQuestions] = useState<string[]>([]);
  const [solution, setSolution] = useState('');
  const [svgCode, setSvgCode] = useState('');
  const [solutionSvgCode, setSolutionSvgCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [solving, setSolving] = useState(false);
  const [generatingSvg, setGeneratingSvg] = useState(false);

  useEffect(() => {
    if (isOpen) {
      db.documents.where('grade').equals(grade).and(d => d.subject === subject && d.type === 'pdf').toArray().then(setPdfs);
    }
  }, [isOpen, grade, subject]);

  const handleGenerateQuestion = async () => {
    if (selectedPdfIds.length === 0) {
      alert('الرجاء اختيار مرجع واحد على الأقل');
      return;
    }
    setLoading(true);
    try {
      const pdfContents = await db.pdfContents.where('docId').anyOf(selectedPdfIds).toArray();
      const combinedContent = pdfContents.map(pc => pc.textContent).join('\n---\n');
      
      const result = await generateCustomQuestion(combinedContent, {
        subQuestionsCount: subCount,
        instructions
      });
      
      setQuestionText(result.text);
      setSubQuestions(result.subQuestions || []);
      setSolution('');
      setSvgCode('');
      setSolutionSvgCode('');
    } catch (error) {
      console.error(error);
      alert('فشل في توليد السؤال. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleSolveQuestion = async () => {
    if (!questionText) {
      alert('يرجى كتابة نص السؤال أولاً');
      return;
    }
    setSolving(true);
    try {
      let combinedContent = '';
      if (selectedPdfIds.length > 0) {
        const pdfContents = await db.pdfContents.where('docId').anyOf(selectedPdfIds).toArray();
        combinedContent = pdfContents.map(pc => pc.textContent).join('\n---\n');
      }

      const result = await solveCustomQuestion(
        questionText,
        subQuestions,
        recommendations,
        combinedContent
      );
      
      setSolution(result.solution);
      if (result.solutionSvgCode) setSolutionSvgCode(result.solutionSvgCode);
    } catch (error) {
      console.error(error);
      alert('فشل في حل السؤال. يرجى المحاولة مرة أخرى.');
    } finally {
      setSolving(false);
    }
  };

  const handleGenerateSvg = async (type: 'main' | 'solution') => {
    const content = type === 'main' ? questionText : solution;
    if (!content) return;
    
    setGeneratingSvg(true);
    try {
      const code = await generateSvgForTestQuestion(content);
      if (type === 'main') setSvgCode(code);
      else setSolutionSvgCode(code);
    } catch (error) {
       console.error(error);
    } finally {
      setGeneratingSvg(false);
    }
  };

  const handleAddSub = () => setSubQuestions([...subQuestions, '']);
  const handleRemoveSub = (idx: number) => setSubQuestions(subQuestions.filter((_, i) => i !== idx));
  const handleUpdateSub = (idx: number, val: string) => {
    const newSubs = [...subQuestions];
    newSubs[idx] = val;
    setSubQuestions(newSubs);
  };

  const handleFinalAdd = () => {
    if (!questionText) return;
    onAdd({
      text: questionText,
      subQuestions,
      solution,
      svgCode,
      solutionSvgCode,
      points: 1
    });
    onClose();
    // Reset state
    setQuestionText('');
    setSubQuestions([]);
    setSolution('');
    setSvgCode('');
    setSolutionSvgCode('');
    setInstructions('');
    setRecommendations('');
    setSelectedPdfIds([]);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           onClick={onClose}
           className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
          dir="rtl"
        >
          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-2xl">
                <Sparkles size={24} />
              </div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">تصميم سؤال احترافي</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Configuration (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                <section>
                  <label className="block text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                    <FileText size={16} className="text-indigo-500" />
                    اختر المراجع للاعتماد عليها:
                  </label>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto p-1 scrollbar-thin">
                    {pdfs.map(pdf => (
                      <button
                        key={pdf.id}
                        onClick={() => {
                          setSelectedPdfIds(prev => 
                            prev.includes(pdf.id!) ? prev.filter(id => id !== pdf.id) : [...prev, pdf.id!]
                          );
                        }}
                        className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between group ${
                          selectedPdfIds.includes(pdf.id!) 
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                            : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                        }`}
                      >
                        <span className="text-sm font-bold truncate flex-1">{pdf.title}</span>
                        {selectedPdfIds.includes(pdf.id!) ? <Check size={16} /> : <ChevronRight size={16} className="opacity-0 group-hover:opacity-100" />}
                      </button>
                    ))}
                    {pdfs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">لا توجد مراجع متاحة لهذا الصف والمادة</p>}
                  </div>
                </section>

                <section>
                  <label className="block text-sm font-black text-gray-700 mb-2">عدد الطلبات المتوقعة:</label>
                  <input 
                    type="number"
                    min="1" max="10"
                    value={subCount}
                    onChange={(e) => setSubCount(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 outline-none font-bold"
                  />
                </section>

                <section>
                  <label className="block text-sm font-black text-gray-700 mb-2">تعليمات وتوصيات خاصة:</label>
                  <textarea 
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="مثلاً: ركز على مفهوم الاشتقاق، أو اجعل السؤال معقداً..."
                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-indigo-500 outline-none min-h-[100px] text-sm"
                  />
                </section>

                <button
                  onClick={handleGenerateQuestion}
                  disabled={loading || selectedPdfIds.length === 0}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                  توليد نص السؤال بالذكاء الاصطناعي
                </button>
              </div>

              {/* Right Column: Editor & Result (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                
                <section className="bg-gray-50 rounded-3xl p-6 border-2 border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-black text-gray-900">نص السؤال الرئيسي:</label>
                    <button 
                      onClick={() => handleGenerateSvg('main')}
                      disabled={generatingSvg || !questionText}
                      className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 hover:underline"
                    >
                      {generatingSvg ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={14} />}
                      إنشاء رسم توضيحي للسؤال
                    </button>
                  </div>
                  <SmartMathEditor 
                    value={questionText}
                    onChange={setQuestionText}
                    placeholder="اكتب نص السؤال هنا..."
                    className="bg-white min-h-[120px]"
                  />
                  
                  {svgCode && (
                    <div className="mt-4 p-4 bg-white rounded-2xl border border-gray-200 flex justify-center">
                       <div className="w-48 h-48 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svgCode }} />
                    </div>
                  )}

                  <div className="mt-6 space-y-4">
                    <label className="block text-sm font-black text-gray-900">الطلبات (الأسئلة الفرعية):</label>
                    <div className="space-y-3">
                      {subQuestions.map((sq, idx) => (
                        <div key={idx} className="flex gap-2">
                          <span className="w-8 h-10 flex items-center justify-center bg-gray-200 rounded-lg text-sm font-bold shrink-0">{idx + 1}</span>
                          <SmartMathEditor 
                             value={sq}
                             onChange={(val) => handleUpdateSub(idx, val)}
                             placeholder={`طلب ${idx + 1}...`}
                             className="flex-1 bg-white"
                          />
                          <button 
                            onClick={() => handleRemoveSub(idx)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={handleAddSub}
                      className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:underline"
                    >
                      <Plus size={16} /> إضافة طلب جديد
                    </button>
                  </div>
                </section>

                {/* Automation for Solution */}
                <section className="bg-emerald-50/50 rounded-3xl p-6 border-2 border-emerald-100">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-2">
                       <Lightbulb className="text-emerald-600" size={20} />
                       <span className="text-sm font-black text-emerald-900">توصيات الحل والحل الذكي:</span>
                    </div>
                    <button
                      onClick={handleSolveQuestion}
                      disabled={solving || !questionText}
                      className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-sm hover:bg-emerald-700 shadow-sm flex items-center justify-center gap-2"
                    >
                      {solving ? <Loader2 className="animate-spin" size={18} /> : <MousePointer2 size={18} />}
                      حل السؤال بالذكاء الاصطناعي
                    </button>
                  </div>
                  
                  <textarea 
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    placeholder="ضع توصياتك للحل هنا (مثلاً: استعمل مبرهنة معينة، أو اجعل الحل طويلاً)..."
                    className="w-full px-4 py-3 bg-white border-2 border-emerald-100 rounded-2xl focus:border-emerald-500 outline-none text-sm mb-4 min-h-[80px]"
                  />

                  {solution && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
                      <div className="flex items-center justify-between">
                         <span className="text-xs font-black text-emerald-800 uppercase tracking-widest">الحل المقترح:</span>
                         <button 
                            onClick={() => handleGenerateSvg('solution')}
                            disabled={generatingSvg}
                            className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded"
                          >
                            إنشاء رسم للحل
                          </button>
                      </div>
                      <SmartMathEditor 
                        value={solution}
                        onChange={setSolution}
                        placeholder="الحل..."
                        className="bg-white min-h-[200px]"
                      />
                      {solutionSvgCode && (
                        <div className="p-4 bg-white rounded-2xl border border-emerald-100 flex justify-center">
                           <div className="w-48 h-48 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: solutionSvgCode }} />
                        </div>
                      )}
                    </div>
                  )}
                </section>

              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-gray-100 bg-gray-50 flex flex-row-reverse gap-4">
             <button
               onClick={handleFinalAdd}
               disabled={!questionText}
               className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
             >
               <Check size={20} />
               إضافة السؤال للاختبار
             </button>
             <button
               onClick={onClose}
               className="px-8 py-4 bg-white text-gray-700 border-2 border-gray-200 rounded-2xl font-black hover:bg-gray-50 transition-all"
             >
               إلغاء
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
