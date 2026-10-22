import React, { useState, useEffect, useRef } from 'react';
import { db, type PastPaper, type PastPaperQuestion } from '../db';
import { solvePastPaperAI, reviewPastPaperQuestionSolutionAI } from '../services/gemini';
import { extractPdfText, convertPdfToImages } from '../services/pdf';
import { MathRenderer } from './MathRenderer';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';
import { PastPaperQuestionEditModal } from './PastPaperQuestionEditModal';
import { PastPaperQuestionReviewModal } from './PastPaperQuestionReviewModal';
import { PastPaperPrintPreviewModal } from './PastPaperPrintPreviewModal';
import { SyncControlButton } from './SyncControlButton';
import { LocalDatabaseIdBadge } from './common/LocalDatabaseIdBadge';
import { 
  Loader2, 
  Plus, 
  ArrowRight, 
  Printer, 
  Sparkles, 
  BookOpen, 
  Trash2, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  Upload, 
  HelpCircle,
  Edit3,
  Download,
  ShieldCheck,
  X
} from 'lucide-react';

const ordinals = [
  'السؤال الأول', 'السؤال الثاني', 'السؤال الثالث', 'السؤال الرابع',
  'السؤال الخامس', 'السؤال السادس', 'السؤال السابع', 'السؤال الثامن',
  'السؤال التاسع', 'السؤال العاشر', 'السؤال الحادي عشر', 'السؤال الثاني عشر',
  'السؤال الثالث عشر', 'السؤال الرابع عشر', 'السؤال الخامس عشر'
];

function getQuestionOrderInfo(q: PastPaperQuestion, idx: number): { orderTitle: string; questionText: string } {
  const text = q.question || '';
  if (q.orderTitle && q.orderTitle.trim()) {
    return { orderTitle: q.orderTitle.trim(), questionText: text };
  }

  // Check if text already starts with an order title like "السؤال الأول:", "التمرين الأول:", "المسألة الأولى:", "أولاً:"
  const match = text.match(/^(السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر|\d+)|التمرين\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|\d+)|المسألة\s+(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|\d+)|أولاً|ثانياً|ثالثاً|رابعاً|خامساً)([\s:،.-]+)([\s\S]*)$/i);
  if (match) {
    return {
      orderTitle: match[1].trim(),
      questionText: match[3].trim()
    };
  }

  return {
    orderTitle: ordinals[idx] || `السؤال ${idx + 1}`,
    questionText: text
  };
}

export const PastPapersDashboard: React.FC = () => {
  const [pastPapers, setPastPapers] = useState<PastPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<PastPaper | null>(null);
  const [editingPaper, setEditingPaper] = useState<PastPaper | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<string>('');
  
  // Form fields
  const [title, setTitle] = useState('');
  const [metadata, setMetadata] = useState({
    country: 'سوريا',
    grade: 'الثالث الثانوي العلمي',
    subject: 'الرياضيات',
    part: '',
    unit: ''
  });
  const [year, setYear] = useState('2024');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion state for question solutions
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});

  // Question editing and review state
  const [editingQuestion, setEditingQuestion] = useState<{ question: PastPaperQuestion; index: number } | null>(null);
  const [reviewingQuestionId, setReviewingQuestionId] = useState<string | null>(null);
  const [reviewModalData, setReviewModalData] = useState<{
    question: PastPaperQuestion;
    questionIndex: number;
    reviewedSolution: string;
    notes: string;
    isCorrect: boolean;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Print preview state
  const [printingPaper, setPrintingPaper] = useState<PastPaper | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPastPapers();
  }, []);

  const fetchPastPapers = async () => {
    try {
      const papers = await db.pastPapers.reverse().toArray();
      setPastPapers(papers);
    } catch (err) {
      console.error("Failed to load past papers:", err);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf") {
        setSelectedFile(file);
      } else {
        setError("يرجى اختيار ملف بصيغة PDF فقط.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("يرجى إدخال عنوان للدورة السابقة.");
      return;
    }
    if (!selectedFile) {
      setError("يرجى اختيار ملف PDF لأسئلة الامتحان السابقة.");
      return;
    }

    setError(null);
    setIsGenerating(true);
    setGenerationPhase('جاري قراءة واستخراج النصوص والصفحات الأصلية من ملف الـ PDF...');

    try {
      // 1. Extract PDF contents
      const extracted = await extractPdfText(selectedFile);

      // Extract high-resolution page images for multimodal verification
      let pageImages: string[] = [];
      try {
        pageImages = await convertPdfToImages(selectedFile);
      } catch (imgErr) {
        console.warn("Could not extract images from PDF for vision assistance:", imgErr);
      }
      
      setGenerationPhase('جاري استخراج نصوص الأسئلة حرفياً 100% وحل جميع المسائل والتمارين عبر الذكاء الاصطناعي... قد يستغرق هذا دقيقة.');

      // 2. Call Gemini solver with extracted text and original page images
      const solvedData = await solvePastPaperAI(
        extracted.text, 
        {
          title,
          grade: metadata.grade,
          subject: metadata.subject,
          year
        },
        pageImages
      );

      setGenerationPhase('جاري حفظ الدورة المحلولة وتصنيف الأسئلة في قاعدة البيانات...');

      // 3. Save to database
      const finalPastPaper: PastPaper = {
        title: solvedData.title || title,
        country: metadata.country,
        grade: solvedData.grade || metadata.grade,
        subject: solvedData.subject || metadata.subject,
        part: metadata.part || undefined,
        unit: metadata.unit || undefined,
        year: solvedData.year || year,
        questions: (solvedData.questions || []).map((q: any, i: number) => ({
          id: q.id || `q_${i + 1}`,
          orderTitle: q.orderTitle || undefined,
          topic: q.topic || 'عام',
          type: q.type || 'essay',
          question: q.question || '',
          subParts: q.subParts || [],
          solution: q.solution || '',
          svgCode: q.svgCode || '',
          solutionSvgCode: q.solutionSvgCode || ''
        })),
        createdAt: Date.now()
      };

      await db.pastPapers.add(finalPastPaper);
      
      // Reset form & state
      setTitle('');
      setSelectedFile(null);
      setIsUploading(false);
      setIsGenerating(false);
      
      // Refresh list
      await fetchPastPapers();
    } catch (err) {
      console.error(err);
      setError("حدث خطأ أثناء تحليل وحل دورة الامتحان. يرجى المحاولة مرة أخرى والتأكد من وضوح نص الـ PDF.");
      setIsGenerating(false);
    }
  };

  const handleSavePaperMetadata = async (updated: {
    title: string;
    country: string;
    grade: string;
    subject: string;
    part?: string;
    unit?: string;
  }) => {
    if (!editingPaper?.id) return;
    await db.pastPapers.update(editingPaper.id, {
      title: updated.title,
      country: updated.country,
      grade: updated.grade,
      subject: updated.subject,
      part: updated.part || undefined,
      unit: updated.unit || undefined
    });
    setEditingPaper(null);
    fetchPastPapers();
  };

  const handleDeletePaper = async (id: number) => {
    if (window.confirm("هل أنت متأكد من حذف هذه الدورة السابقة وحلولها من قاعدة البيانات؟")) {
      try {
        await db.pastPapers.delete(id);
        setSelectedPaper(null);
        await fetchPastPapers();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const toggleSolution = (qId: string) => {
    setExpandedSolutions(prev => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  const handlePrint = (paper?: PastPaper) => {
    const target = paper || selectedPaper;
    if (target) {
      setPrintingPaper(target);
    }
  };

  const handleDownloadJSON = (paper: PastPaper, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const exportData = {
      title: paper.title,
      country: paper.country || 'سوريا',
      grade: paper.grade,
      subject: paper.subject,
      part: paper.part,
      unit: paper.unit,
      year: paper.year,
      createdAt: paper.createdAt,
      questions: paper.questions
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (paper.title || `past_paper_${paper.year}`).replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${safeTitle}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Question Manual Edit and Review Handlers
  const handleOpenEditQuestion = (q: PastPaperQuestion, idx: number) => {
    setEditingQuestion({ question: q, index: idx });
  };

  const handleAddNewQuestion = () => {
    if (!selectedPaper) return;
    const newIdx = selectedPaper.questions?.length || 0;
    const newQ: PastPaperQuestion = {
      id: `q_${Date.now()}`,
      orderTitle: ordinals[newIdx] || `السؤال ${newIdx + 1}`,
      topic: 'عام',
      type: 'essay',
      question: '',
      subParts: [],
      solution: '',
      svgCode: '',
      solutionSvgCode: ''
    };
    setEditingQuestion({ question: newQ, index: newIdx });
  };

  const handleSaveQuestion = async (updatedQuestion: PastPaperQuestion) => {
    if (!selectedPaper || !selectedPaper.id || editingQuestion === null) return;
    
    const currentQuestions = selectedPaper.questions ? [...selectedPaper.questions] : [];
    if (editingQuestion.index < currentQuestions.length) {
      currentQuestions[editingQuestion.index] = updatedQuestion;
    } else {
      currentQuestions.push(updatedQuestion);
    }

    try {
      await db.pastPapers.update(selectedPaper.id, {
        questions: currentQuestions
      });

      const updatedPaper = { ...selectedPaper, questions: currentQuestions };
      setSelectedPaper(updatedPaper);
      setPastPapers(prev => prev.map(p => p.id === selectedPaper.id ? updatedPaper : p));

      setToastMessage(`تم حفظ وتحديث "${updatedQuestion.orderTitle || 'السؤال'}" بنجاح!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ تعديلات السؤال في قاعدة البيانات.");
    } finally {
      setEditingQuestion(null);
    }
  };

  const handleReviewSolution = async (q: PastPaperQuestion, idx: number) => {
    if (!q.question || !q.question.trim()) {
      alert("لا يمكن مراجعة الحل لأن نص السؤال فارغ.");
      return;
    }
    setReviewingQuestionId(q.id);
    try {
      const { orderTitle, questionText } = getQuestionOrderInfo(q, idx);
      const res = await reviewPastPaperQuestionSolutionAI(
        orderTitle,
        questionText,
        q.solution || '',
        q.subParts,
        q.topic
      );

      setReviewModalData({
        question: q,
        questionIndex: idx,
        reviewedSolution: res.reviewedSolution,
        notes: res.notes,
        isCorrect: res.isCorrect !== false
      });
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء مراجعة الحل بالذكاء الاصطناعي. يرجى التأكد من الاتصال والمحاولة مجدداً.");
    } finally {
      setReviewingQuestionId(null);
    }
  };

  const handleApplyReviewedSolution = async (reviewedSolution: string) => {
    if (!selectedPaper || !selectedPaper.id || !reviewModalData) return;
    const idx = reviewModalData.questionIndex;
    const currentQuestions = selectedPaper.questions ? [...selectedPaper.questions] : [];
    
    if (idx >= currentQuestions.length) return;

    currentQuestions[idx] = {
      ...currentQuestions[idx],
      solution: reviewedSolution
    };

    try {
      await db.pastPapers.update(selectedPaper.id, {
        questions: currentQuestions
      });

      const updatedPaper = { ...selectedPaper, questions: currentQuestions };
      setSelectedPaper(updatedPaper);
      setPastPapers(prev => prev.map(p => p.id === selectedPaper.id ? updatedPaper : p));

      // Expand the solution so the teacher immediately sees it
      setExpandedSolutions(prev => ({
        ...prev,
        [currentQuestions[idx].id]: true
      }));

      setToastMessage(`تم اعتماد الحل المراجع وتحديث "${currentQuestions[idx].orderTitle || 'السؤال'}" بنجاح!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ الحل المراجع.");
    } finally {
      setReviewModalData(null);
    }
  };

  const handleOpenManualEditWithSolution = (solutionText: string) => {
    if (!reviewModalData) return;
    const qWithReviewedSolution: PastPaperQuestion = {
      ...reviewModalData.question,
      solution: solutionText
    };
    setEditingQuestion({
      question: qWithReviewedSolution,
      index: reviewModalData.questionIndex
    });
    setReviewModalData(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
      <div className={printingPaper ? 'no-print print:hidden' : ''}>
        {/* Detail view of a selected Past Paper */}
        {selectedPaper ? (
        <div className="space-y-6">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-between no-print shadow-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span>{toastMessage}</span>
              </div>
              <button 
                onClick={() => setToastMessage(null)} 
                className="text-emerald-600 hover:text-emerald-950 p-1 cursor-pointer"
                title="إغلاق التنبيه"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 no-print">
            <button
              onClick={() => setSelectedPaper(null)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-bold text-sm self-start md:self-auto cursor-pointer"
            >
              <ArrowRight size={18} />
              الرجوع للدورات السابقة
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <LocalDatabaseIdBadge id={selectedPaper.id} tableLabel="pastPapers" compact={false} />
              <SyncControlButton
                table="pastPapers"
                id={selectedPaper.id!}
                data={selectedPaper}
                showDraftOption={true}
                buttonText="مزامنة ونشر الدورة"
                onSyncComplete={(res) => {
                  if (res.success) {
                    setToastMessage(res.message);
                    setTimeout(() => setToastMessage(null), 4000);
                  }
                }}
              />
              <button
                onClick={(e) => handleDownloadJSON(selectedPaper, e)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg font-bold text-sm transition cursor-pointer"
                title="تحميل الدورة كملف JSON"
              >
                <Download size={16} />
                <span>تحميل JSON</span>
              </button>
              <button
                onClick={() => handlePrint(selectedPaper)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition cursor-pointer shadow-sm"
                title="معاينة الطباعة / حفظ كـ PDF"
              >
                <Printer size={16} />
                معاينة الطباعة / حفظ كـ PDF 🖨️
              </button>
              <button
                onClick={() => handleDeletePaper(selectedPaper.id!)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-sm transition cursor-pointer"
              >
                <Trash2 size={16} />
                حذف الدورة
              </button>
            </div>
          </div>

          {/* Exam Sheet Layout */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-10 space-y-8 print:border-0 print:shadow-none print:p-0">
            {/* Printed Header Block */}
            <div className="border-4 double border-gray-900 p-6 rounded-lg text-center space-y-4 print:border-black">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-gray-600 border-b border-gray-300 pb-3 print:text-black">
                <div>الجمهورية العربية السورية وزارة التربية</div>
                <div className="text-sm font-bold text-gray-900 print:text-black">{selectedPaper.grade}</div>
                <div>المادة: {selectedPaper.subject}</div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-gray-950 font-sans print:text-black">
                  أسئلة الامتحان وحلولها النموذجية: {selectedPaper.title}
                </h2>
                <p className="text-sm text-indigo-700 font-bold no-print">
                  تم استخلاصها وحلها بالذكاء الاصطناعي بنجاح
                </p>
                <p className="text-xs text-gray-500 font-medium">سنة الدورة: {selectedPaper.year}م</p>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-8">
              <h3 className="text-lg font-black text-gray-900 border-b-2 border-gray-800 pb-3 print:text-black flex items-center gap-2">
                <FileText size={20} className="text-orange-500" />
                الأسئلة الرقمية وحلولها النموذجية
              </h3>

              {selectedPaper.questions && selectedPaper.questions.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {selectedPaper.questions.map((q, idx) => {
                    const { orderTitle, questionText } = getQuestionOrderInfo(q, idx);
                    return (
                      <div key={q.id || idx} className="py-6 first:pt-0 last:pb-0 space-y-4 print:break-inside-avoid">
                        {/* Topic Tag, Type Tag, Manual Edit, Solution Review, and Toggle */}
                        <div className="flex flex-wrap justify-between items-center gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-orange-50 text-orange-850 px-2.5 py-1 rounded-md text-xs font-bold border border-orange-200">
                              {q.topic || 'عام'}
                            </span>
                            <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md text-xs font-bold">
                              {q.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي / مسألة'}
                            </span>
                          </div>

                          {/* Action Buttons (Visible on screen, hidden in print) */}
                          <div className="flex items-center gap-2 flex-wrap no-print">
                            {/* زر تعديل يدوي */}
                            <button
                              onClick={() => handleOpenEditQuestion(q, idx)}
                              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-indigo-750 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                              title="تعديل يدوي كامل (العناوين، الترويسة، نص السؤال، والحل)"
                            >
                              <Edit3 size={13} className="text-indigo-600" />
                              <span>تعديل يدوي</span>
                            </button>

                            {/* زر مراجعة الحل */}
                            <button
                              onClick={() => handleReviewSolution(q, idx)}
                              disabled={reviewingQuestionId === q.id}
                              className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-60"
                              title="مراجعة وتدقيق الحل بالذكاء الاصطناعي (خطوات منطقية ورياضية صحيحة - حل عادي غير مفصل جداً)"
                            >
                              {reviewingQuestionId === q.id ? (
                                <>
                                  <Loader2 size={13} className="animate-spin text-emerald-600" />
                                  <span>جاري المراجعة...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={13} className="text-emerald-600" />
                                  <span>مراجعة الحل</span>
                                </>
                              )}
                            </button>

                            {/* تفاصيل / إخفاء الحل */}
                            <button
                              onClick={() => toggleSolution(q.id)}
                              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition no-print cursor-pointer"
                            >
                              {expandedSolutions[q.id] ? (
                                <>
                                  إخفاء الحل <ChevronUp size={14} />
                                </>
                              ) : (
                                <>
                                  عرض الحل <ChevronDown size={14} />
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Question Content Container */}
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 md:p-6 space-y-4 print:bg-white print:border-none print:p-0 shadow-xs">
                          {/* Question Order Title in RED (السؤال الأول، السؤال الثاني، إلخ) */}
                          <div className="pb-2.5 border-b border-red-200/90 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
                              <h4 className="text-red-600 font-black text-base md:text-lg tracking-wide">
                                {orderTitle}
                              </h4>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-gray-500 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                              #{idx + 1}
                            </span>
                          </div>

                          <div className="text-gray-900 leading-relaxed font-sans font-medium text-base">
                            <MathRenderer content={questionText} />
                          </div>

                          {/* Question Illustration SVG (الرسم التوضيحي المرفق بالسؤال) */}
                          {q.svgCode && (
                            <div className="my-4 p-3 bg-white rounded-xl border border-gray-200 shadow-xs flex flex-col items-center justify-center overflow-x-auto">
                              <span className="text-[11px] font-black text-gray-600 mb-2 flex items-center gap-1 self-start">
                                📐 الشكل التوضيحي المرفق بالسؤال:
                              </span>
                              <div 
                                className="w-full flex justify-center items-center overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto"
                                dangerouslySetInnerHTML={{ __html: q.svgCode }}
                              />
                            </div>
                          )}

                          {/* MCQ Options */}
                          {q.type === 'mcq' && q.subParts && q.subParts.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 print:grid-cols-2">
                              {q.subParts.map((option, oIdx) => (
                                <div 
                                  key={oIdx} 
                                  className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg text-sm font-semibold print:border-black"
                                >
                                  <span>{option}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Solution Area */}
                        {/* Note: Always show when printing, or if expanded on screen */}
                        <div className={`mt-4 space-y-4 border-l-4 border-emerald-500 bg-emerald-50/40 p-4 md:p-6 rounded-r-xl ${(expandedSolutions[q.id] || window.matchMedia('print').matches) ? 'block' : 'hidden no-print'}`}>
                          <h4 className="font-extrabold text-sm text-emerald-800 flex items-center gap-1.5 border-b border-emerald-100 pb-2">
                            <CheckCircle2 size={16} />
                            الحل النموذجي المعتمد وزاريّاً:
                          </h4>

                          <div className="text-gray-900 leading-relaxed font-sans font-medium">
                            <MathRenderer content={q.solution} />
                          </div>

                          {/* Optional Solution SVG */}
                          {q.solutionSvgCode && (
                            <div 
                              className="flex justify-center my-4 overflow-x-auto" 
                              dangerouslySetInnerHTML={{ __html: q.solutionSvgCode }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 font-medium py-4 text-center">لا توجد أسئلة مضافة في هذه الدورة.</p>
              )}

              {/* Add New Question Button */}
              <div className="pt-6 border-t border-gray-100 flex justify-center no-print">
                <button
                  onClick={handleAddNewQuestion}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                >
                  <Plus size={15} />
                  <span>إضافة سؤال أو تمرين جديد للدورة</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : isUploading ? (
        /* Upload & Analysis Form */
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 md:p-8 space-y-6">
          <div className="flex justify-between items-center border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                <Upload size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-gray-900">رفع وحل دورة امتحانية سابقة</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  أدخل تفاصيل الدورة وارفع ملف الأسئلة PDF ليقوم الذكاء الاصطناعي بتنظيمها وحلها تفصيليّاً
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsUploading(false)}
              className="text-gray-400 hover:text-gray-700 font-semibold text-sm bg-gray-50 px-3 py-1.5 rounded-lg border"
            >
              إلغاء
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 font-bold text-sm">
              {error}
            </div>
          )}

          {isGenerating ? (
            /* Loading Phase Indicator */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Sparkles className="text-indigo-600 animate-pulse" size={24} />
                </div>
              </div>
              <div className="space-y-2 max-w-md">
                <h4 className="font-extrabold text-gray-900">جاري تحليل وحل ومطابقة المسائل...</h4>
                <p className="text-sm text-gray-600 font-medium leading-relaxed animate-pulse">
                  {generationPhase}
                </p>
                <p className="text-xs text-red-500 font-semibold">
                  تحذير: لا تغلق النافذة الحالية حتى تكتمل المعالجة بنجاح.
                </p>
              </div>
            </div>
          ) : (
            /* Form inputs */
            <form onSubmit={handleStartAnalysis} className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-bold text-gray-700">عنوان الدورة</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: دورة عام 2023 - الدورة الأولى"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-bold text-gray-700">السنة الامتحانية</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: 2023"
                      value={year}
                      onChange={e => setYear(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Academic Metadata Fields */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <AcademicMetadataFields
                    metadata={metadata}
                    onChange={(updated) => setMetadata(updated)}
                  />
                </div>

                {/* PDF Drag Zones */}
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">ملف الأسئلة (PDF)</label>
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 ${
                      dragActive 
                        ? 'border-indigo-600 bg-indigo-50' 
                        : selectedFile 
                          ? 'border-emerald-500 bg-emerald-50/50' 
                          : 'border-gray-300 hover:border-indigo-500 hover:bg-gray-50/50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    
                    {selectedFile ? (
                      <>
                        <CheckCircle2 size={36} className="text-emerald-500 animate-bounce" />
                        <span className="font-extrabold text-sm text-gray-900 line-clamp-1">{selectedFile.name}</span>
                        <span className="text-xs font-bold text-emerald-800">
                          تم تحميل الملف بنجاح ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                        <span className="text-xs text-gray-500">انقر أو اسحب ملفاً لتغييره</span>
                      </>
                    ) : (
                      <>
                        <Upload size={36} className="text-gray-400" />
                        <span className="font-bold text-sm text-gray-800">اسحب وأفلت ملف الـ PDF هنا</span>
                        <span className="text-xs text-gray-500">أو اضغط لتصفح الملفات من جهازك</span>
                        <span className="bg-gray-100 text-gray-650 px-2.5 py-1.5 rounded-md text-[10px] font-bold mt-1">
                          أقصى حجم: 50MB
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Strict Zero-Modification Policy Card */}
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl p-3.5 text-xs flex items-start gap-2.5 shadow-2xs">
                  <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black text-emerald-950 text-xs">
                      قاعدة صارمة وملزمة: النقل الحرفي الدقيق لنصوص الأسئلة 100%
                    </p>
                    <p className="text-emerald-850 leading-relaxed font-semibold text-[11px]">
                      يُمنع منعاً باتاً وصارماً التصرف بصيغة السؤال أو تعديل كلماتها أو أرقامها؛ تبقى صيغة كل سؤال وتمرين ومسألة كما هي تماماً في ورقة الامتحان الأصلية دون زيادة أو نقصان.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedFile || !title.trim()}
                className="w-full bg-indigo-600 text-white font-extrabold py-3.5 rounded-xl hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-md cursor-pointer"
              >
                <Sparkles size={18} />
                بدء استخلاص وحل الدورة السابقة (نقل حرفي 100%)
              </button>
            </form>
          )}
        </div>
      ) : (
        /* Grid of Saved Courses */
        <div className="space-y-6">
          {/* Unified Top Header */}
          <UnifiedPageHeader
            icon={BookOpen}
            title="أرشيف حلول الدورات الامتحانية السابقة"
            subtitle="أسئلة الدورات الامتحانية للشهادة الثانوية مع حلولها المنهجية الكاملة والرسومات التوضيحية"
            badgeText={`${pastPapers.length} دورة`}
            badgeColor="amber"
            actions={
              <button
                onClick={() => setIsUploading(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                <Plus size={15} />
                <span>رفع وحل دورة جديدة</span>
              </button>
            }
          />

          {pastPapers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pastPapers.map(paper => (
                <div
                  key={paper.id}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
                >
                  {/* Top bar with card style */}
                  <div className="p-5 flex-1 space-y-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="bg-orange-50 text-orange-800 px-2.5 py-1 rounded-lg text-xs font-bold border border-orange-200 flex items-center gap-1">
                          <Calendar size={12} />
                          دورات: {paper.year}
                        </span>
                        <LocalDatabaseIdBadge id={paper.id} tableLabel="pastPapers" compact={true} />
                      </div>
                      <span className="text-[10px] text-gray-400 font-semibold">
                        {new Date(paper.createdAt).toLocaleDateString('ar-SY')}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-extrabold text-base text-gray-950 line-clamp-1 group-hover:text-indigo-600 transition">
                        {paper.title}
                      </h3>
                      
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-black border border-slate-200">
                          {paper.country || 'سوريا'}
                        </span>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-black border border-indigo-100">
                          {paper.grade}
                        </span>
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-[11px] font-black border border-amber-100">
                          {paper.subject}
                        </span>
                        {paper.unit && (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-blue-100">
                            الوحدة: {paper.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question summary badge */}
                    <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <FileText size={16} className="text-indigo-600" />
                      <span className="text-xs font-bold text-gray-700">
                        تحتوي على {paper.questions?.length || 0} سؤالاً رقميّاً محلولاً بالكامل
                      </span>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="border-t border-gray-100 p-3 bg-gray-50 flex justify-between items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedPaper(paper)}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-850 cursor-pointer"
                    >
                      <Eye size={14} />
                      <span>عرض وحل الدورة</span>
                    </button>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* زر المزامنة السحابية إلى Supabase */}
                      <SyncControlButton
                        table="pastPapers"
                        id={paper.id!}
                        data={paper}
                        showDraftOption={true}
                        buttonText="مزامنة"
                        variant="compact"
                        onSyncComplete={(res) => {
                          if (res.success) {
                            setToastMessage(res.message);
                            setTimeout(() => setToastMessage(null), 4000);
                          }
                        }}
                      />
                      {/* زر معاينة وحفظ كـ PDF مباشرة */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrint(paper);
                        }}
                        className="text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/90 px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="معاينة الطباعة / حفظ كـ PDF"
                      >
                        <Printer size={13} />
                        <span>معاينة الطباعة / PDF</span>
                      </button>
                      {/* زر تحميل الدورة كملف JSON */}
                      <button
                        onClick={(e) => handleDownloadJSON(paper, e)}
                        className="text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        title="تحميل الدورة كملف JSON"
                      >
                        <Download size={13} />
                        <span>JSON</span>
                      </button>
                      <button
                        onClick={() => setEditingPaper(paper)}
                        className="text-gray-500 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                        title="تعديل بيانات الدورة"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeletePaper(paper.id!)}
                        className="text-gray-450 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition cursor-pointer"
                        title="حذف دورة"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-3xl p-16 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
                <BookOpen size={30} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-lg text-gray-900">أرشيف حلول الدورات السابقة فارغ</h3>
                <p className="text-sm text-gray-550 leading-relaxed">
                  لم تقم بإضافة أي دورات سابقة حتى الآن. يمكنك رفع ملفات الـ PDF لأسئلة الدورات السابقة من جهازك، وسيقوم الذكاء الاصطناعي برقمنتها، وتحديد موضوع كل سؤال، وكتابة الحل النموذجي والمفصل مع توليد الجداول والإنشاءات الهندسية.
                </p>
              </div>
              <button
                onClick={() => setIsUploading(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition"
              >
                <Plus size={16} />
                أضف أول دورة امتحانية الآن
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Edit Metadata Modal */}
      {editingPaper && (
        <DocumentMetadataModal
          isOpen={!!editingPaper}
          onClose={() => setEditingPaper(null)}
          document={{
            id: editingPaper.id,
            title: editingPaper.title,
            country: editingPaper.country || 'سوريا',
            grade: editingPaper.grade,
            subject: editingPaper.subject,
            part: editingPaper.part,
            unit: editingPaper.unit
          }}
          onSave={handleSavePaperMetadata}
        />
      )}

      {/* Manual Question Edit Modal */}
      {editingQuestion && (
        <PastPaperQuestionEditModal
          isOpen={!!editingQuestion}
          onClose={() => setEditingQuestion(null)}
          question={editingQuestion.question}
          questionIndex={editingQuestion.index}
          onSave={handleSaveQuestion}
        />
      )}

      {/* AI Solution Review Modal */}
      {reviewModalData && (
        <PastPaperQuestionReviewModal
          isOpen={!!reviewModalData}
          onClose={() => setReviewModalData(null)}
          question={reviewModalData.question}
          questionIndex={reviewModalData.questionIndex}
          reviewedSolution={reviewModalData.reviewedSolution}
          notes={reviewModalData.notes}
          isCorrect={reviewModalData.isCorrect}
          onApply={handleApplyReviewedSolution}
          onOpenManualEditWithSolution={handleOpenManualEditWithSolution}
        />
      )}

      {/* Direct Print Preview Modal */}
      {printingPaper && (
        <PastPaperPrintPreviewModal
          isOpen={!!printingPaper}
          onClose={() => setPrintingPaper(null)}
          paper={printingPaper}
          getQuestionOrderInfo={getQuestionOrderInfo}
        />
      )}
    </div>
  );
};
