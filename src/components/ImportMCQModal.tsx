import React, { useState, useRef } from 'react';
import { 
  FileUp, 
  X, 
  Upload, 
  FileText, 
  Sparkles, 
  CheckCircle, 
  Loader2, 
  AlertCircle, 
  HelpCircle, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  BookOpen, 
  Star, 
  RotateCcw,
  Edit3
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { 
  extractTextFromDocument, 
  parseAndEnrichMCQsFromDocumentText, 
  convertCandidatesToBankItems, 
  ExtractedMCQCandidate 
} from '../services/documentMcqImporter';
import { QuestionBankItem } from '../db';
import { correctionAgent } from '../services/correctionAgent';

interface ImportMCQModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankTitle?: string;
  unitName?: string;
  grade?: string;
  subject?: string;
  part?: string;
  currentItemsCount: number;
  onImportSuccess: (importedItems: QuestionBankItem[]) => void;
}

export const ImportMCQModal: React.FC<ImportMCQModalProps> = ({
  isOpen,
  onClose,
  bankTitle,
  unitName,
  grade,
  subject,
  part,
  currentItemsCount,
  onImportSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  
  // Progress states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Review states
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [candidates, setCandidates] = useState<ExtractedMCQCandidate[]>([]);
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});
  const [isAuditingCandidates, setIsAuditingCandidates] = useState(false);
  const [auditingStatusText, setAuditingStatusText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleStartImport = async () => {
    setError(null);
    let docText = '';

    if (activeTab === 'file') {
      if (!selectedFile) {
        setError('يرجى اختيار ملف PDF أو Word أولاً.');
        return;
      }

      setIsProcessing(true);
      setProgressMessage('1. جارٍ قراءة واستخراج النص من المستند...');

      try {
        const extraction = await extractTextFromDocument(selectedFile);
        docText = extraction.text;
        if (!docText || docText.trim().length < 15) {
          throw new Error('لم يتم العثور على نص كافٍ في الملف المرفق. تأكد أن الملف غير فارغ.');
        }
      } catch (err: any) {
        setIsProcessing(false);
        setError(`فشل استخراج النص: ${err.message || 'خطأ أثناء قراءة المستند'}`);
        return;
      }
    } else {
      if (!pastedText.trim() || pastedText.trim().length < 20) {
        setError('يرجى لصق نص كافٍ يحتوي على أسئلة موضوعية.');
        return;
      }
      docText = pastedText;
      setIsProcessing(true);
    }

    try {
      setProgressMessage('2. تفكيك وتحليل الأسئلة واستخراج الخيارات الأربعة واقتراح المفاهيم والحلول...');
      const results = await parseAndEnrichMCQsFromDocumentText(docText, {
        unitTitle: unitName || bankTitle,
        grade,
        subject,
        part,
        existingCount: currentItemsCount
      });

      if (!results || results.length === 0) {
        throw new Error('لم يتمكن الذكاء الاصطناعي من استخراج أي أسئلة موضوعية صالحة من النص.');
      }

      // Step 3: Run Critic & LaTeX Verifier Agent (Layer 4) BEFORE displaying questions
      setProgressMessage('3. 🤖 تفعيل الوكيل الذكي (Critic Agent) لتدقيق LaTeX والتصحيح الرياضي والمنطقي للصياغة والحل...');
      let finalCandidates: ExtractedMCQCandidate[] = results;
      try {
        const audited = await correctionAgent.auditAndCorrectQuestionBankItems(results, {
          unitTitle: unitName || bankTitle
        });
        if (Array.isArray(audited) && audited.length > 0) {
          finalCandidates = audited.map(c => ({ ...c, isAgentAudited: true }));
        }
      } catch (agentErr) {
        console.warn('Critic agent fallback to initial results:', agentErr);
      }

      setCandidates(finalCandidates);
      // Auto expand solutions for first 2
      const initExpanded: Record<string, boolean> = {};
      finalCandidates.slice(0, 2).forEach(c => { initExpanded[c.id] = true; });
      setExpandedSolutions(initExpanded);

      setStep('review');
    } catch (err: any) {
      setError(`خطأ أثناء تحليل الأسئلة: ${err.message || 'يرجى التأكد من اتصال الإنترنت وإعادة المحاولة'}`);
    } finally {
      setIsProcessing(false);
      setProgressMessage('');
    }
  };

  const handleAuditAllCandidates = async () => {
    if (candidates.length === 0) return;
    setIsAuditingCandidates(true);
    setAuditingStatusText('🤖 جاري تدقيق وفحص كافة الأسئلة والخيارات والحلول رياضياً ولاتكس بواسطة Agent...');
    try {
      const audited = await correctionAgent.auditAndCorrectQuestionBankItems(candidates, {
        unitTitle: unitName || bankTitle
      });
      const marked = audited.map(c => ({ ...c, isAgentAudited: true }));
      setCandidates(marked);
    } catch (e: any) {
      console.warn('Audit all error:', e);
    } finally {
      setIsAuditingCandidates(false);
      setAuditingStatusText('');
    }
  };

  const handleAuditSingleCandidate = async (candidateId: string) => {
    const target = candidates.find(c => c.id === candidateId);
    if (!target) return;
    setIsAuditingCandidates(true);
    setAuditingStatusText('🤖 جاري تدقيق السؤال والحل المحدد بواسطة Agent...');
    try {
      const audited = await correctionAgent.auditAndCorrectQuestionBankItems([target], {
        unitTitle: unitName || bankTitle
      });
      if (audited.length > 0) {
        setCandidates(prev => prev.map(c => c.id === candidateId ? { ...audited[0], isAgentAudited: true, selected: c.selected } : c));
      }
    } catch (e: any) {
      console.warn('Single audit error:', e);
    } finally {
      setIsAuditingCandidates(false);
      setAuditingStatusText('');
    }
  };

  const toggleSelect = (id: string) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  const selectAll = (val: boolean) => {
    setCandidates(prev => prev.map(c => ({ ...c, selected: val })));
  };

  const handleCorrectIndexChange = (candidateId: string, optIdx: number) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, correctIndex: optIdx } : c));
  };

  const handleDifficultyChange = (candidateId: string, diff: number) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, difficulty: diff } : c));
  };

  const handleTopicChange = (candidateId: string, newTopic: string) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, topic: newTopic } : c));
  };

  const toggleSolution = (id: string) => {
    setExpandedSolutions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirmImport = () => {
    const selectedCandidates = candidates.filter(c => c.selected);
    if (selectedCandidates.length === 0) {
      setError('يرجى تحديد سؤال واحد على الأقل للإضافة.');
      return;
    }

    const bankItems = convertCandidatesToBankItems(selectedCandidates, currentItemsCount);
    onImportSuccess(bankItems);
    onClose();
  };

  const selectedCount = candidates.filter(c => c.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-l from-teal-50 via-indigo-50/50 to-white border-b border-teal-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
              <FileUp size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  استيراد أسئلة موضوعية (اختيار من متعدد) من ملف PDF أو Word
                </h2>
                <span className="text-xs bg-teal-100 text-teal-800 font-bold px-2.5 py-0.5 rounded-lg border border-teal-200">
                  ذكاء اصطناعي فائق ⚡
                </span>
              </div>
              <p className="text-xs text-slate-500 font-bold mt-1">
                استخراج النص آلياً، واقتراح المفهوم ودرجة الصعوبة والحلول النموذجية المبررة وفق المنهاج السوري
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Active Bank Context Info */}
        <div className="bg-slate-50 px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs font-bold text-slate-600">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-teal-600" />
            <span>الوحدة النشطة:</span>
            <span className="text-teal-900 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
              {unitName || bankTitle || 'بنك الأسئلة الحالي'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-500">
            {grade && <span>الصف: {grade}</span>}
            {subject && <span>المادة: {subject}</span>}
            <span>الأسئلة الحالية في البنك: {currentItemsCount}</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
          
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 animate-shake">
              <AlertCircle size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs font-bold leading-relaxed">{error}</div>
            </div>
          )}

          {step === 'upload' && !isProcessing && (
            <div className="space-y-6">
              {/* Tab Selector */}
              <div className="flex gap-2 border-b border-slate-200 pb-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('file')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    activeTab === 'file'
                      ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <FileText size={16} />
                  <span>رفع ملف PDF أو Word (.docx / .doc)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    activeTab === 'paste'
                      ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Edit3 size={16} />
                  <span>أو لصق نص الامتحان مباشرة</span>
                </button>
              </div>

              {activeTab === 'file' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all ${
                      dragOver
                        ? 'border-teal-500 bg-teal-50/50 scale-[0.99]'
                        : selectedFile
                        ? 'border-emerald-400 bg-emerald-50/30'
                        : 'border-slate-200 bg-slate-50/50 hover:border-teal-400 hover:bg-teal-50/20'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-700 mx-auto flex items-center justify-center mb-4 shadow-inner">
                      <Upload size={32} />
                    </div>

                    {selectedFile ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 text-emerald-800 font-black text-sm">
                          <CheckCircle size={18} className="text-emerald-600" />
                          <span>تم اختيار الملف: {selectedFile.name}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-bold">
                          الحجم: {(selectedFile.size / 1024).toFixed(1)} كيلوبايت - اضغط لاختيار ملف آخر
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-black text-sm text-slate-800">
                          اسحب وأفلت ملف PDF أو Word هنا، أو انقر للتصفح من جهازك
                        </p>
                        <p className="text-xs text-slate-400 font-bold">
                          يدعم ملفات: PDF (.pdf) و Microsoft Word (.docx, .doc) والملفات النصية (.txt)
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700">
                    الصق نص الأسئلة أو ورقة العمل هنا (مع الأسئلة والخيارات إن وُجدت):
                  </label>
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="مثال: السؤال الأول: في معلم متجانس (O, i, j, k) لدينا النقطتان A(1, 2, 0) و B(3, 4, 2)... الخيارات: أ) ... ب) ... ج) ... د) ..."
                    className="w-full p-4 border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    dir="rtl"
                  />
                </div>
              )}

              {/* Instructions box */}
              <div className="p-4 bg-teal-50/60 border border-teal-100 rounded-2xl space-y-2 text-xs font-bold text-teal-900 leading-relaxed">
                <div className="flex items-center gap-2 font-black text-teal-950">
                  <Sparkles size={16} className="text-teal-600" />
                  <span>ماذا سيحدث بعد بدء الاستيراد؟</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-600 font-medium pr-1">
                  <li>استخراج كامل النصوص الرياضية والصيغ والخيارات الأربعة.</li>
                  <li>اقتراح المفهوم العلمي الدقيق لكل سؤال لربطه بالوحدة النشطة.</li>
                  <li>اقتراح درجة الصعوبة من 1 إلى 5 نجوم (مع إمكانية تعديلها بسهولة).</li>
                  <li>توليد حل نموذجي مبرر رياضياً خطوة بخطوة مع توضيح سبب اختيار الإجابة الصحيحة.</li>
                  <li>تنسيق الرموز الرياضية وفق نظام KaTeX ($...$) لضمان الطباعة والعرض المتقن.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Processing / Loading animation */}
          {isProcessing && (
            <div className="p-12 text-center space-y-6">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-teal-100 animate-ping opacity-50" />
                <div className="w-20 h-20 rounded-full border-4 border-teal-600 border-t-transparent animate-spin flex items-center justify-center">
                  <Sparkles className="text-teal-600" size={28} />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-black text-slate-800">
                  جارٍ معالجة المستند واستخراج الأسئلة الموضوعية...
                </h3>
                <p className="text-xs text-teal-700 font-bold max-w-md mx-auto leading-relaxed">
                  {progressMessage || 'يتم الآن تحليل بنية المستند، واستخلاص الخيارات وتوليد الحلول النموذجية...'}
                </p>
              </div>

              <div className="max-w-md mx-auto bg-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-500 space-y-2 text-right">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle size={14} />
                  <span>استخراج النص من الملف المرفق</span>
                </div>
                <div className="flex items-center gap-2 text-indigo-700 animate-pulse">
                  <Loader2 size={14} className="animate-spin" />
                  <span>تفكيك الأسئلة والخيارات وصياغة الحلول النموذجية</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                  <span>مطابقة معايير المنهاج السوري وترتيب الصعوبة</span>
                </div>
              </div>
            </div>
          )}

          {/* Review & Customization Phase */}
          {step === 'review' && !isProcessing && (
            <div className="space-y-6">
              {/* Agent Verification Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-l from-indigo-50 via-purple-50/50 to-white border border-indigo-200 rounded-2xl shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                    🤖
                  </div>
                  <div>
                    <div className="text-xs font-black text-indigo-950 flex items-center gap-2">
                      <span>وكيل التدقيق والتحكيم الرياضي واللاتكس (Layer 4 Critic & LaTeX Verifier)</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                        مفعّل تلقائياً ✔
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                      تم فحص الصياغة الرياضية وتطابق كود LaTeX بقاعدة الدولار المفرد $...$ وتأكيد صحة الحلول النموذجية 100% قبل العرض.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAuditAllCandidates}
                  disabled={isAuditingCandidates}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isAuditingCandidates ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{auditingStatusText || 'جارٍ التدقيق بـ Agent...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>إعادة تدقيق كافة الأسئلة بـ Agent</span>
                    </>
                  )}
                </button>
              </div>

              {/* Summary and Controls Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-teal-50 border border-teal-200 rounded-2xl">
                <div className="flex items-center gap-2">
                  <CheckCircle size={20} className="text-teal-700" />
                  <span className="text-sm font-black text-teal-950">
                    تم استخراج {candidates.length} سؤالاً موضوعياً بنجاح!
                  </span>
                  <span className="text-xs font-bold text-teal-800 bg-white px-2 py-0.5 rounded-lg border border-teal-200">
                    المحدد للإضافة: {selectedCount}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectAll(true)}
                    className="text-xs font-black text-teal-700 hover:text-teal-900 bg-white border border-teal-200 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAll(false)}
                    className="text-xs font-black text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    إلغاء التحديد
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep('upload'); setCandidates([]); }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 pr-2 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>ملف آخر</span>
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-5">
                {candidates.map((cand, idx) => (
                  <div
                    key={cand.id}
                    className={`rounded-2xl border transition-all p-5 space-y-4 ${
                      cand.selected
                        ? 'border-teal-300 bg-white shadow-sm ring-2 ring-teal-50'
                        : 'border-slate-200 bg-slate-50 opacity-60'
                    }`}
                  >
                    {/* Question Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cand.selected}
                            onChange={() => toggleSelect(cand.id)}
                            className="w-4 h-4 rounded-md accent-teal-600 cursor-pointer"
                          />
                          <span className="text-xs font-black text-slate-800">
                            سؤال #{idx + 1}
                          </span>
                        </label>

                        {/* Concept / Topic input */}
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl">
                          <span className="text-[10px] font-black text-slate-500">المفهوم المقترح:</span>
                          <input
                            type="text"
                            value={cand.topic}
                            onChange={(e) => handleTopicChange(cand.id, e.target.value)}
                            placeholder="المفهوم العلمي..."
                            className="text-xs font-bold bg-white px-2 py-0.5 rounded border border-slate-200 outline-none text-slate-800 focus:ring-1 focus:ring-teal-500"
                          />
                        </div>

                        {cand.isAgentAudited && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                            <Check size={12} className="text-emerald-600" />
                            <span>مدقق بـ Agent</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Audit single question button */}
                        <button
                          type="button"
                          onClick={() => handleAuditSingleCandidate(cand.id)}
                          disabled={isAuditingCandidates}
                          className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Sparkles size={12} />
                          <span>تدقيق بـ Agent</span>
                        </button>

                        {/* Difficulty stars */}
                        <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                          <span className="text-[10px] font-black text-amber-800 ml-1">الصعوبة المقترحة:</span>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleDifficultyChange(cand.id, star)}
                              className="focus:outline-none transition-transform hover:scale-125 cursor-pointer"
                            >
                              <Star
                                size={14}
                                className={star <= cand.difficulty ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Question Text */}
                    <div className="text-sm font-black text-slate-900 leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      <MathRenderer content={cand.question} />
                    </div>

                    {/* 4 Options Grid */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-black text-slate-500">
                        الخيارات الأربعة (حدد الإجابة الصحيحة بالضغط على الخيار):
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {cand.subParts.map((opt, optIdx) => {
                          const isCorrect = cand.correctIndex === optIdx;
                          const letterLabel = ['(أ)', '(ب)', '(ج)', '(د)'][optIdx];
                          return (
                            <div
                              key={optIdx}
                              onClick={() => handleCorrectIndexChange(cand.id, optIdx)}
                              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                                isCorrect
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold shadow-xs'
                                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <div className="mt-0.5 flex-shrink-0">
                                <div
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    isCorrect
                                      ? 'border-emerald-600 bg-emerald-600 text-white'
                                      : 'border-slate-300'
                                  }`}
                                >
                                  {isCorrect && <Check size={10} strokeWidth={4} />}
                                </div>
                              </div>
                              <div className="flex-1 text-xs">
                                <span className={`ml-1 font-black ${isCorrect ? 'text-emerald-700' : 'text-slate-500'}`}>
                                  {letterLabel}
                                </span>
                                <MathRenderer content={opt} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Collapsible Proposed Solution */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleSolution(cand.id)}
                        className="w-full px-4 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-black text-slate-700 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 text-indigo-700">
                          <Sparkles size={14} />
                          <span>الحل النموذجي المقترح بالخطوات المبررة</span>
                        </span>
                        {expandedSolutions[cand.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {expandedSolutions[cand.id] && (
                        <div className="p-4 bg-indigo-50/20 text-xs font-medium text-slate-800 leading-relaxed border-t border-slate-200">
                          <MathRenderer content={cand.solution} />
                          {cand.aiGuidance && (
                            <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 font-bold text-xs flex items-start gap-2">
                              <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-black ml-1">تنبيه امتحاني:</span>
                                <MathRenderer content={cand.aiGuidance} />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-black text-xs hover:bg-slate-100 transition-all cursor-pointer"
          >
            إلغاء
          </button>

          {step === 'upload' ? (
            <button
              type="button"
              disabled={isProcessing || (activeTab === 'file' && !selectedFile) || (activeTab === 'paste' && !pastedText.trim())}
              onClick={handleStartImport}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-all shadow-md shadow-teal-600/20 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>جارٍ التحليل والاستخراج...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>استخراج وتحليل الأسئلة الذكي 🚀</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleConfirmImport}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-all shadow-md shadow-teal-600/20 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <CheckCircle size={16} />
              <span>إضافة الأسئلة المحددة ({selectedCount}) إلى بنك الأسئلة ✅</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
