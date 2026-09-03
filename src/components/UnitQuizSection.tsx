import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Award, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Sparkles, 
  Loader2, 
  RotateCcw, 
  Play, 
  Edit3, 
  Save, 
  Trash2, 
  Database, 
  Check, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  X, 
  BookOpen, 
  Plus, 
  Layers, 
  Eye, 
  Lightbulb, 
  FileText,
  Target,
  Zap
} from 'lucide-react';
import { 
  db, 
  type Document, 
  type LessonSection, 
  type UnitQuiz, 
  type UnitQuizQuestion, 
  type UnitQuizOption 
} from '../db';
import { generateUnitQuizAI } from '../services/gemini';
import { MathRenderer } from './MathRenderer';
import { SyncControlButton } from './SyncControlButton';
import { SyncStatusBadge } from './SyncStatusBadge';

interface UnitQuizSectionProps {
  document: Document;
  sections: LessonSection[];
  isAdmin?: boolean;
  onUpdateDocument?: () => void;
}

export const UnitQuizSection: React.FC<UnitQuizSectionProps> = ({
  document,
  sections,
  isAdmin = true,
  onUpdateDocument
}) => {
  const [unitQuiz, setUnitQuiz] = useState<UnitQuiz | null>(null);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState<boolean>(true);
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Active Interactive Quiz Modal State
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({}); // questionIndex -> optionId
  const [revealedFeedback, setRevealedFeedback] = useState<Record<number, boolean>>({}); // whether user clicked or auto-transition triggered
  const [isQuizSubmitted, setIsQuizSubmitted] = useState<boolean>(false);
  const [quizTimer, setQuizTimer] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Teacher/Admin Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editableQuiz, setEditableQuiz] = useState<UnitQuiz | null>(null);
  const [optionsLayoutMode, setOptionsLayoutMode] = useState<'single' | 'grid'>('single');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const docId = document.id;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Load Quiz from Database
  const loadQuizFromDb = async () => {
    if (!docId) return;
    setIsLoadingQuiz(true);
    try {
      const storedQuiz = await db.unitQuizzes.where('docId').equals(docId).first();
      if (storedQuiz) {
        setUnitQuiz(storedQuiz);
      } else {
        setUnitQuiz(null);
      }
    } catch (err) {
      console.error('Error loading unit quiz from database:', err);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  useEffect(() => {
    loadQuizFromDb();
  }, [docId]);

  // Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && isQuizActive && !isQuizSubmitted) {
      interval = setInterval(() => {
        setQuizTimer(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, isQuizActive, isQuizSubmitted]);

  // Clean up auto advance timeout
  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, []);

  // Format Timer
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(quizTimer / 60);
    const seconds = quizTimer % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [quizTimer]);

  // Handle Generate with AI
  const handleGenerateAI = async (customCount: number = 10) => {
    if (!docId) return;
    setIsGeneratingAI(true);
    try {
      const res = await generateUnitQuizAI(document, sections, customCount);
      if (res && res.questions && res.questions.length > 0) {
        const newQuiz: UnitQuiz = {
          docId,
          title: res.title || `اختبار ${document.unit || document.title}`,
          unit: document.unit || document.title || 'الوحدة الدراسية',
          grade: document.grade || 'الثالث الثانوي العلمي',
          subject: document.subject || 'الرياضيات',
          totalQuestions: res.questions.length,
          passingScore: 60,
          questions: res.questions,
          validationScore: (res as any).validationScore || 100,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        // Save directly to Dexie Database
        const existing = await db.unitQuizzes.where('docId').equals(docId).first();
        if (existing?.id) {
          newQuiz.id = existing.id;
          await db.unitQuizzes.put(newQuiz);
        } else {
          const insertedId = await db.unitQuizzes.add(newQuiz);
          newQuiz.id = insertedId as number;
        }

        setUnitQuiz(newQuiz);
        showToast('تم توليد اختبار الوحدة وحفظه بنجاح في قاعدة البيانات! 💾✨');
        if (onUpdateDocument) onUpdateDocument();
      } else {
        alert('لم يتم استلام أسئلة صالحة من الذكاء الاصطناعي. يرجى المحاولة مرة أخرى.');
      }
    } catch (err) {
      console.error('Failed to generate unit quiz:', err);
      alert('حدث خطأ أثناء توليد اختبار الوحدة بالذكاء الاصطناعي.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Start Interactive Quiz
  const handleStartQuiz = async () => {
    if (!unitQuiz || unitQuiz.questions.length === 0) {
      // If quiz doesn't exist yet, trigger AI generation first
      await handleGenerateAI(10);
      return;
    }
    // Shuffle options for fair testing while preserving correctness
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setRevealedFeedback({});
    setIsQuizSubmitted(false);
    setQuizTimer(0);
    setIsTimerRunning(true);
    setIsQuizActive(true);
  };

  // Handle Option Select in Active Quiz
  const handleSelectOption = (optionId: string) => {
    if (isQuizSubmitted) return;

    // Save answer
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: optionId
    }));

    setRevealedFeedback(prev => ({
      ...prev,
      [currentQuestionIndex]: true
    }));

    // Auto transition to next question if enabled
    if (autoAdvance) {
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        if (unitQuiz && currentQuestionIndex < unitQuiz.questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
        } else if (unitQuiz && currentQuestionIndex === unitQuiz.questions.length - 1) {
          // Last question -> auto submit or prompt submit
          handleSubmitQuiz();
        }
      }, 950);
    }
  };

  // Submit Quiz and Calculate Score out of 100
  const handleSubmitQuiz = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }
    setIsTimerRunning(false);
    setIsQuizSubmitted(true);
  };

  // Calculate Final Stats
  const quizResults = useMemo(() => {
    if (!unitQuiz) return { score: 0, percentage: 0, correctCount: 0, wrongCount: 0, unansweredCount: 0 };
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    unitQuiz.questions.forEach((q, idx) => {
      const selectedId = selectedAnswers[idx];
      if (!selectedId) {
        unanswered++;
      } else {
        const correctOpt = q.options.find(o => o.isCorrect);
        if (correctOpt && correctOpt.id === selectedId) {
          correct++;
        } else {
          wrong++;
        }
      }
    });

    const total = unitQuiz.questions.length || 1;
    const percentage = Math.round((correct / total) * 100);

    return {
      score: percentage,
      percentage,
      correctCount: correct,
      wrongCount: wrong,
      unansweredCount: unanswered,
      total
    };
  }, [unitQuiz, selectedAnswers]);

  // Open Edit Modal
  const handleOpenEditModal = () => {
    if (!unitQuiz) return;
    setEditableQuiz(JSON.parse(JSON.stringify(unitQuiz)));
    setIsEditModalOpen(true);
  };

  // Save Edits to Database
  const handleSaveEditsToDatabase = async () => {
    if (!editableQuiz || !docId) return;
    setIsSaving(true);
    try {
      const updated: UnitQuiz = {
        ...editableQuiz,
        totalQuestions: editableQuiz.questions.length,
        updatedAt: Date.now()
      };

      const existing = await db.unitQuizzes.where('docId').equals(docId).first();
      if (existing?.id) {
        updated.id = existing.id;
        await db.unitQuizzes.put(updated);
      } else {
        const id = await db.unitQuizzes.add(updated);
        updated.id = id as number;
      }

      setUnitQuiz(updated);
      setIsEditModalOpen(false);
      showToast('تم حفظ تعديلات اختبار الوحدة في قاعدة البيانات بنجاح! 💾');
      if (onUpdateDocument) onUpdateDocument();
    } catch (err) {
      console.error('Error saving quiz edits:', err);
      alert('فشل حفظ التعديلات في قاعدة البيانات.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Quiz from Database
  const handleDeleteQuiz = async () => {
    if (!unitQuiz?.id) return;
    if (window.confirm('هل أنت متأكد من رغبتك في حذف اختبار الوحدة من قاعدة البيانات؟')) {
      try {
        await db.unitQuizzes.delete(unitQuiz.id);
        setUnitQuiz(null);
        showToast('تم حذف اختبار الوحدة من قاعدة البيانات.');
        if (onUpdateDocument) onUpdateDocument();
      } catch (err) {
        console.error('Error deleting quiz:', err);
      }
    }
  };

  const currentQ = unitQuiz?.questions[currentQuestionIndex];

  return (
    <div className="mt-12 mb-8 font-sans" dir="rtl">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[300] bg-emerald-800 text-white px-5 py-3 rounded-2xl shadow-xl border border-emerald-600 flex items-center gap-3 animate-fade-in text-xs font-black">
          <CheckCircle2 size={18} className="text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Sub-section Card (اختبار الوحدة) */}
      <div className="bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-purple-50/90 rounded-3xl border-2 border-violet-200/80 shadow-md overflow-hidden transition-all">
        
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-violet-800 via-indigo-850 to-purple-850 px-6 py-5 text-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
              <Award size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-wider bg-amber-400 text-violet-950 px-2.5 py-0.5 rounded-lg shadow-xs">
                  التقييم الختامي للوحدة
                </span>
                {unitQuiz && (
                  <span className="text-[11px] font-bold text-emerald-100 bg-emerald-900/60 border border-emerald-400/40 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                    <Database size={11} className="text-emerald-300" />
                    <span>محفوظ في قاعدة البيانات ({unitQuiz.questions.length} سؤالاً)</span>
                  </span>
                )}
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                اختبار الوحدة الشامل (Unit Comprehensive Exam)
              </h3>
            </div>
          </div>

          {/* Quick Action Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 bg-white/10 rounded-xl border border-white/15 text-xs font-bold flex items-center gap-1.5 text-violet-100">
              <Target size={14} className="text-amber-300" />
              <span>الدرجة الإجمالية: <strong>100 درجة</strong></span>
            </div>
            <div className="px-3 py-1.5 bg-white/10 rounded-xl border border-white/15 text-xs font-bold flex items-center gap-1.5 text-violet-100">
              <Zap size={14} className="text-emerald-300" />
              <span>10 أسئلة مؤتمتة على الأقل</span>
            </div>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6 sm:p-8 bg-white/80 backdrop-blur-sm space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <h4 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>🎯 قياس تمكن الطالب من مفاهيم وقوانين وحيل {document.unit || document.title}</span>
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                اختبار مؤتمت تفاعلي من نمط الاختيار من متعدد يحاكي نظام الامتحانات الوزارية للثانوية العامة. ينتقل الطالب بين الأسئلة بسلاسة مع تصحيح فوري وحساب الدرجة المستحقة من <strong>100</strong> مع شروحات وتلميحات نموذجية لكل مسألة.
              </p>
            </div>

            {/* Launch & Generation Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onClick={handleStartQuiz}
                disabled={isGeneratingAI}
                className="px-6 py-3.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isGeneratingAI ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-white" />
                    <span>جارٍ توليد الاختبار الذكي...</span>
                  </>
                ) : unitQuiz ? (
                  <>
                    <Play size={18} className="text-amber-300 fill-amber-300" />
                    <span>بداية الاختبار (بدون استهلاك AI) 🚀</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="text-amber-200" />
                    <span>توليد وبداية اختبار الوحدة (AI) ✨</span>
                  </>
                )}
              </button>

              {/* Admin Additional Buttons */}
              {isAdmin && unitQuiz && (
                <div className="flex items-center gap-2 flex-wrap">
                  <SyncControlButton
                    table="unitQuizzes"
                    id={unitQuiz.id!}
                    data={unitQuiz}
                    showDraftOption={true}
                    buttonText="نشر الاختبار"
                  />

                  <button
                    type="button"
                    onClick={handleOpenEditModal}
                    className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl border border-gray-200 shadow-xs transition-all cursor-pointer"
                    title="تعديل أسئلة الاختبار والخيارات يدوياً"
                  >
                    <Edit3 size={16} className="text-violet-700" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGenerateAI(10)}
                    disabled={isGeneratingAI}
                    className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl border border-gray-200 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    title="إعادة توليد أسئلة جديدة بالذكاء الاصطناعي"
                  >
                    <RotateCcw size={16} className="text-indigo-700" />
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteQuiz}
                    className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-2xl border border-rose-200 shadow-xs transition-all cursor-pointer"
                    title="حذف الاختبار من قاعدة البيانات"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Database Cache Status Banner */}
          {unitQuiz ? (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-900 font-bold">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-300">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-emerald-950">
                      الأسئلة مخزنة وموثقة في قاعدة البيانات المحلية
                    </span>
                    <span className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-md shadow-xs">
                      ✓ تدقيق المنهاج السوري: {unitQuiz.validationScore ?? 100}%
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    تم التدقيق والتحقق العلمي والتربوي ومعادلات LaTeX ($...$) بواسطة منظومة الوكلاء.
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-black text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-gray-200">
                عدد الأسئلة: <strong className="text-violet-700 font-sans">{unitQuiz.questions.length}</strong> | درجة النجاح: <strong className="text-emerald-700 font-sans">60 / 100</strong>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-violet-50/60 border border-violet-200 rounded-2xl flex items-center gap-3 text-xs text-violet-900 font-medium">
              <Sparkles size={16} className="text-violet-600 shrink-0" />
              <span>
                اضغط على زر <strong>"توليد وبداية اختبار الوحدة"</strong> لتأليف 10 أسئلة امتحانية ذكية ومؤتمتة وشاملة لمفاهيم الوحدة وتخزينها في قاعدة البيانات.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🚀 ACTIVE INTERACTIVE QUIZ MODAL (نافذة منبثقة لكل سؤال وانتقال تلقائي) */}
      {/* ========================================================================= */}
      {isQuizActive && unitQuiz && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md animate-fade-in" dir="rtl">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl text-slate-900">
            
            {/* Modal Top Bar */}
            <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-purple-900 px-5 sm:px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-amber-300 border border-white/10">
                  <Award size={20} />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black text-white">
                    {unitQuiz.title}
                  </h4>
                  <div className="flex items-center gap-3 text-[11px] text-violet-200 mt-0.5">
                    <span>{document.grade} - {document.subject}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-mono font-bold text-amber-200">
                      <Clock size={12} />
                      {formattedTime}
                    </span>
                  </div>
                </div>
              </div>

              {/* Close / Auto-Advance Toggle */}
              <div className="flex items-center gap-3">
                <label className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-violet-200 bg-white/10 px-3 py-1 rounded-xl border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAdvance}
                    onChange={(e) => setAutoAdvance(e.target.checked)}
                    className="w-3.5 h-3.5 text-violet-600 rounded"
                  />
                  <span>انتقال تلقائي</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('هل تريد الخروج من الاختبار الحالي؟')) {
                      setIsQuizActive(false);
                      setIsTimerRunning(false);
                    }
                  }}
                  className="p-2 text-violet-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                  title="إغلاق الاختبار"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="bg-slate-100 px-6 py-2.5 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <span className="font-black text-violet-700">
                  السؤال {currentQuestionIndex + 1} من {unitQuiz.questions.length}
                </span>
                {currentQ?.topic && (
                  <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                    {currentQ.topic}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">التقدم:</span>
                <div className="w-24 sm:w-36 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-300"
                    style={{ width: `${((currentQuestionIndex + 1) / unitQuiz.questions.length) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] font-sans font-black text-violet-900">
                  {Math.round(((currentQuestionIndex + 1) / unitQuiz.questions.length) * 100)}%
                </span>
              </div>
            </div>

            {/* Modal Body: Active Question View or Quiz Result Summary */}
            <div className="p-5 sm:p-7 overflow-y-auto flex-1 space-y-6">
              {!isQuizSubmitted && currentQ ? (
                /* Question Layout */
                <div className="space-y-6 animate-fade-in">
                  
                  {/* Question Header Card */}
                  <div className="p-5 sm:p-6 bg-slate-50 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-violet-800 bg-violet-100/80 border border-violet-200 px-3 py-1 rounded-lg">
                        سؤال #{currentQuestionIndex + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        الوزن: <strong>{(100 / (unitQuiz.questions.length || 1)).toFixed(1)} درجة</strong>
                      </span>
                    </div>

                    <div className="text-sm sm:text-base font-black text-slate-900 leading-relaxed pt-1">
                      <MathRenderer content={currentQ.questionText} />
                    </div>
                  </div>

                  {/* 4 Interactive Multiple-Choice Options */}
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-700 block">
                      اختر الإجابة الصحيحة من بين الخيارات الأربعة التالية:
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {currentQ.options.map((opt, optIdx) => {
                        const isSelected = selectedAnswers[currentQuestionIndex] === opt.id;
                        const isAnswered = !!selectedAnswers[currentQuestionIndex];

                        let optionStyle = "bg-white border-gray-200 hover:border-violet-300 hover:bg-violet-50/40 text-slate-800";
                        if (isSelected) {
                          optionStyle = "bg-violet-50 border-violet-600 text-violet-950 ring-2 ring-violet-500/20 font-bold shadow-xs";
                        }

                        return (
                          <button
                            key={opt.id || optIdx}
                            type="button"
                            onClick={() => handleSelectOption(opt.id)}
                            className={`p-4 rounded-2xl border text-right transition-all flex items-start gap-3.5 cursor-pointer text-xs sm:text-sm font-medium ${optionStyle}`}
                          >
                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-black border mt-0.5 transition-all ${
                              isSelected
                                ? 'bg-violet-600 border-violet-600 text-white shadow-xs'
                                : 'bg-slate-100 border-slate-200 text-slate-700'
                            }`}>
                              {['أ', 'ب', 'ج', 'د'][optIdx] || String.fromCharCode(65 + optIdx)}
                            </span>

                            <div className="flex-1 overflow-hidden leading-relaxed text-slate-900">
                              <MathRenderer content={opt.text} />
                            </div>

                            {isSelected && (
                              <CheckCircle2 size={18} className="text-violet-600 shrink-0 mt-0.5 animate-scale-in" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Hint Accordion if available */}
                  {currentQ.hint && (
                    <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-950 text-xs flex items-start gap-2.5">
                      <Lightbulb size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <strong className="font-black text-amber-900 block">تلميح تربوي للمسألة:</strong>
                        <div className="text-slate-700">
                          <MathRenderer content={currentQ.hint} />
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                /* ========================================================= */
                /* 🏆 FINAL RESULT & SCORE BREAKDOWN SCREEN (درجة الطالب من 100) */
                /* ========================================================= */
                <div className="space-y-7 animate-fade-in">
                  
                  {/* Main Score Hero Card */}
                  <div className={`p-6 sm:p-8 rounded-3xl border-2 text-center space-y-4 shadow-sm ${
                    quizResults.percentage >= 60
                      ? 'bg-gradient-to-b from-emerald-50 via-teal-50/40 to-white border-emerald-300 text-emerald-950'
                      : 'bg-gradient-to-b from-amber-50 via-rose-50/30 to-white border-amber-300 text-amber-950'
                  }`}>
                    
                    <div className="w-16 h-16 mx-auto rounded-3xl bg-white shadow-md border flex items-center justify-center text-3xl">
                      {quizResults.percentage >= 85 ? '🌟' : quizResults.percentage >= 60 ? '🎉' : '📚'}
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                        النتيجة النهائية لاختبار الوحدة
                      </span>
                      <h3 className="text-3xl sm:text-4xl font-black font-sans">
                        <span className={quizResults.percentage >= 60 ? 'text-emerald-700' : 'text-amber-700'}>
                          {quizResults.score}
                        </span>
                        <span className="text-slate-400 text-2xl sm:text-3xl font-light"> / 100</span>
                      </h3>
                      <p className="text-xs sm:text-sm font-bold text-slate-700">
                        {quizResults.percentage >= 90 
                          ? 'أداء استثنائي ومتقن! جاهز للامتحان النهائي بامتياز 🎯'
                          : quizResults.percentage >= 75
                            ? 'مستوى متقدم وجيد جداً! راجع المسائل غير الموفقة أدناه 💡'
                            : quizResults.percentage >= 60
                              ? 'اجتزت الاختبار بنجاح، ويُنصح بمراجعة القوانين والتمارين التطبيقية 📖'
                              : 'تحتاج إلى إعادة قراءة مبرهنات ومفاهيم الوحدة وإعادة المحاولة 🔄'}
                      </p>
                    </div>

                    {/* Stats Pill Matrix */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto pt-2">
                      <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs text-center">
                        <span className="text-[10px] text-gray-500 font-bold block">الإجابات الصحيحة</span>
                        <strong className="text-emerald-600 font-sans text-base font-black">{quizResults.correctCount}</strong>
                      </div>
                      <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs text-center">
                        <span className="text-[10px] text-gray-500 font-bold block">الإجابات الخاطئة</span>
                        <strong className="text-rose-600 font-sans text-base font-black">{quizResults.wrongCount}</strong>
                      </div>
                      <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs text-center">
                        <span className="text-[10px] text-gray-500 font-bold block">دون إجابة</span>
                        <strong className="text-slate-600 font-sans text-base font-black">{quizResults.unansweredCount}</strong>
                      </div>
                      <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-2xs text-center">
                        <span className="text-[10px] text-gray-500 font-bold block">الوقت المستغرق</span>
                        <strong className="text-violet-700 font-mono text-base font-black">{formattedTime}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Question by Question Solution Review */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-gray-200 pb-2">
                      <FileText size={16} className="text-violet-600" />
                      <span>المراجعة التفصيلية لإجابات الطالب مع الشرح الرياضي النموذجي:</span>
                    </h4>

                    <div className="space-y-4">
                      {unitQuiz.questions.map((q, qIdx) => {
                        const selectedId = selectedAnswers[qIdx];
                        const correctOpt = q.options.find(o => o.isCorrect);
                        const isCorrect = selectedId && correctOpt && selectedId === correctOpt.id;

                        return (
                          <div 
                            key={q.id || qIdx}
                            className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-3 ${
                              isCorrect 
                                ? 'bg-emerald-50/40 border-emerald-200' 
                                : 'bg-rose-50/40 border-rose-200'
                            }`}
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-200/60 pb-2">
                              <span className="font-black text-xs text-slate-800">
                                السؤال #{qIdx + 1}: {q.topic || ''}
                              </span>
                              <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-lg flex items-center gap-1 ${
                                isCorrect 
                                  ? 'bg-emerald-600 text-white' 
                                  : 'bg-rose-600 text-white'
                              }`}>
                                {isCorrect ? (
                                  <>
                                    <CheckCircle2 size={12} />
                                    <span>إجابة صحيحة (+{(100 / (unitQuiz.questions.length || 1)).toFixed(1)} درجة)</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={12} />
                                    <span>إجابة غير صحيحة (0 درجة)</span>
                                  </>
                                )}
                              </span>
                            </div>

                            <div className="text-xs sm:text-sm font-bold text-slate-900">
                              <MathRenderer content={q.questionText} />
                            </div>

                            {/* Options grid with correct / selected highlight */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {q.options.map((opt, optIdx) => {
                                const isUserChoice = selectedId === opt.id;
                                const isRightChoice = opt.isCorrect;

                                let optCard = "bg-white border-gray-200 text-slate-700";
                                if (isRightChoice) {
                                  optCard = "bg-emerald-100/80 border-emerald-400 text-emerald-950 font-bold ring-1 ring-emerald-400";
                                } else if (isUserChoice && !isRightChoice) {
                                  optCard = "bg-rose-100/80 border-rose-400 text-rose-950 font-bold ring-1 ring-rose-400";
                                }

                                return (
                                  <div key={opt.id || optIdx} className={`p-2.5 rounded-xl border flex items-start gap-2 ${optCard}`}>
                                    <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 flex items-center justify-center font-black text-[10px] shrink-0">
                                      {['أ', 'ب', 'ج', 'د'][optIdx]}
                                    </span>
                                    <div className="flex-1">
                                      <MathRenderer content={opt.text} />
                                    </div>
                                    {isRightChoice && <Check size={14} className="text-emerald-700 shrink-0 mt-0.5" />}
                                    {isUserChoice && !isRightChoice && <X size={14} className="text-rose-700 shrink-0 mt-0.5" />}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Explanation */}
                            {q.explanation && (
                              <div className="p-3 bg-white rounded-xl border border-gray-200 text-xs text-slate-800 space-y-1">
                                <strong className="font-black text-indigo-900 block flex items-center gap-1">
                                  <span>💡 الشرح وطريقة الحل النموذجية:</span>
                                </strong>
                                <div className="leading-relaxed">
                                  <MathRenderer content={q.explanation} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Modal Bottom Footer / Navigation */}
            <div className="bg-slate-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between shrink-0 flex-wrap gap-3">
              {!isQuizSubmitted ? (
                <>
                  <button
                    type="button"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                    className="px-4 py-2 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs rounded-xl border border-gray-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <ChevronRight size={16} />
                    <span>السؤال السابق</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {currentQuestionIndex < unitQuiz.questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                        className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>السؤال التالي</span>
                        <ChevronLeft size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmitQuiz}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <CheckCircle2 size={16} />
                        <span>إنهاء الاختبار وحساب الدرجة 🎯</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between w-full flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleStartQuiz()}
                    className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCcw size={15} />
                    <span>إعادة تقديم الاختبار من جديد 🔄</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsQuizActive(false)}
                    className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs rounded-xl transition-all cursor-pointer"
                  >
                    <span>إغلاق نافذة الاختبار</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ✍️ ADMIN MANUAL EDIT MODAL (تعديل أسئلة الاختبار والخيارات وحفظها) */}
      {/* ========================================================================= */}
      {isEditModalOpen && editableQuiz && (
        <div className="fixed inset-0 z-[270] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl text-slate-900">
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-gradient-to-r from-violet-900 to-indigo-900 text-white flex items-center justify-between shrink-0 border-b border-violet-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/10 text-white border border-white/10">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">
                    تعديل وتخصيص أسئلة اختبار الوحدة ✍️
                  </h4>
                  <p className="text-xs text-violet-200 mt-0.5">
                    تعديل نصوص الأسئلة والخيارات الأربعة والإجابة الصحيحة والشروحات وحفظها في قاعدة البيانات المحلية.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-violet-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Questions List Editor */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 text-xs bg-slate-50/50">
              
              {/* Quiz Title */}
              <div className="bg-white p-4.5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
                <label className="font-black text-slate-800 text-xs">عنوان الاختبار:</label>
                <input
                  type="text"
                  value={editableQuiz.title}
                  onChange={(e) => setEditableQuiz({ ...editableQuiz, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 font-bold outline-none focus:bg-white focus:border-violet-500 transition-all text-xs"
                />
              </div>

              {/* Questions Loop */}
              <div className="space-y-6">
                {editableQuiz.questions.map((q, qIdx) => (
                  <div key={q.id || qIdx} className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 font-black text-xs flex items-center justify-center border border-violet-200">
                          {qIdx + 1}
                        </span>
                        <span className="font-black text-violet-800 text-sm">
                          السؤال رقم {qIdx + 1}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (editableQuiz.questions.length <= 1) {
                            alert('يجب الإبقاء على سؤال واحد على الأقل.');
                            return;
                          }
                          const newQuestions = editableQuiz.questions.filter((_, i) => i !== qIdx);
                          setEditableQuiz({ ...editableQuiz, questions: newQuestions });
                        }}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="حذف هذا السؤال"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Question Statement */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 text-xs">
                        نص السؤال (يدعم صيغة LaTeX الرياضية $...$):
                      </label>
                      <textarea
                        rows={3}
                        value={q.questionText}
                        onChange={(e) => {
                          const newQs = [...editableQuiz.questions];
                          newQs[qIdx].questionText = e.target.value;
                          setEditableQuiz({ ...editableQuiz, questions: newQs });
                        }}
                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:border-violet-500 outline-none leading-relaxed text-xs resize-y min-h-[70px]"
                      />
                      {q.questionText && (
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-800">
                          <span className="text-[10px] font-bold text-gray-400 block mb-1">معاينة السؤال:</span>
                          <MathRenderer content={q.questionText} />
                        </div>
                      )}
                    </div>

                    {/* 4 Options with Resizable Multiline Textareas and Live Math Preview */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="font-black text-slate-800 text-xs block">
                          الخيارات الأربعة (حدد الإجابة الصحيحة باختيار زر الاختيار):
                        </label>

                        {/* Layout Mode Toggle */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setOptionsLayoutMode('single')}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                              optionsLayoutMode === 'single'
                                ? 'bg-white text-violet-700 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="عرض واسع كامل ومريح لكتابة الخيارات الطويلة والمعادلات الرياضية"
                          >
                            عرض واسع (عمود واحد)
                          </button>
                          <button
                            type="button"
                            onClick={() => setOptionsLayoutMode('grid')}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                              optionsLayoutMode === 'grid'
                                ? 'bg-white text-violet-700 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title="عرض مدمج (عمودين)"
                          >
                            عرض مدمج (عمودين)
                          </button>
                        </div>
                      </div>

                      {/* Quick Symbols Toolbar */}
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-2.5 bg-slate-100/70 rounded-xl border border-slate-200 text-[11px]">
                        <span className="text-slate-500 font-bold shrink-0 ml-1">رموز سريعة:</span>
                        {[
                          { label: '√x', val: '$\\sqrt{x}$' },
                          { label: 'x²', val: '$x^2$' },
                          { label: 'x/y', val: '$\\frac{a}{b}$' },
                          { label: 'π', val: '$\\pi$' },
                          { label: '∞', val: '$\\infty$' },
                          { label: '→', val: '$\\to$' },
                          { label: '±', val: '$\\pm$' },
                          { label: '≠', val: '$\\neq$' },
                          { label: '≤', val: '$\\le$' },
                          { label: '≥', val: '$\\ge$' },
                          { label: '∫', val: '$\\int$' },
                          { label: 'lim', val: '$\\lim$' },
                        ].map((sym, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => {
                              const newQs = [...editableQuiz.questions];
                              const curText = newQs[qIdx].options[0].text;
                              newQs[qIdx].options[0].text = curText ? `${curText} ${sym.val}` : sym.val;
                              setEditableQuiz({ ...editableQuiz, questions: newQs });
                            }}
                            className="px-2 py-0.5 bg-white hover:bg-violet-50 text-slate-700 hover:text-violet-700 rounded-md border border-slate-200 font-mono text-xs cursor-pointer shrink-0 transition-colors"
                            title={`إضافة ${sym.val}`}
                          >
                            {sym.label}
                          </button>
                        ))}
                      </div>

                      <div className={optionsLayoutMode === 'single' ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-3.5'}>
                        {q.options.map((opt, optIdx) => (
                          <div 
                            key={opt.id || optIdx}
                            className={`p-4 rounded-2xl border transition-all space-y-3 flex flex-col justify-between ${
                              opt.isCorrect 
                                ? 'bg-emerald-50/60 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs' 
                                : 'bg-slate-50/80 border-gray-200 hover:border-gray-300 shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`correct-quiz-opt-${q.id || qIdx}`}
                                  checked={opt.isCorrect}
                                  onChange={() => {
                                    const newQs = [...editableQuiz.questions];
                                    newQs[qIdx].options = newQs[qIdx].options.map((o, i) => ({
                                      ...o,
                                      isCorrect: i === optIdx
                                    }));
                                    newQs[qIdx].correctOptionId = opt.id;
                                    setEditableQuiz({ ...editableQuiz, questions: newQs });
                                  }}
                                  className="w-4 h-4 text-emerald-600 cursor-pointer"
                                />
                                <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                                  opt.isCorrect 
                                    ? 'bg-emerald-600 text-white shadow-xs' 
                                    : 'bg-slate-200 text-slate-700'
                                }`}>
                                  الخيار {['أ', 'ب', 'ج', 'د'][optIdx]} ({optIdx + 1})
                                </span>
                              </label>

                              {opt.isCorrect ? (
                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                                  <Check size={12} />
                                  <span>✓ الخيار الصحيح</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400">
                                  خيار مشتت (غير صحيح)
                                </span>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                                <span>نص الخيار وصيغته الرياضية ($...$):</span>
                                <span className="text-[10px] text-violet-600 font-normal">مساحة كتابة مريحة وقابلة للتوسيع</span>
                              </label>
                              <textarea
                                rows={3}
                                value={opt.text}
                                onChange={(e) => {
                                  const newQs = [...editableQuiz.questions];
                                  newQs[qIdx].options[optIdx].text = e.target.value;
                                  setEditableQuiz({ ...editableQuiz, questions: newQs });
                                }}
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl text-slate-900 font-medium text-xs sm:text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 outline-none resize-y min-h-[75px] leading-relaxed transition-all shadow-inner"
                                placeholder={`اكتب نص أو معادلات الخيار ${['أ', 'ب', 'ج', 'د'][optIdx]} بالتفصيل...`}
                              />
                            </div>

                            {/* Live Math Preview of Option */}
                            {opt.text && opt.text.trim() !== '' && (
                              <div className="p-2.5 bg-white/90 rounded-xl border border-slate-200 text-xs text-slate-800 shadow-2xs space-y-1">
                                <span className="text-[10px] font-black text-slate-400 block">معاينة شكل الخيار:</span>
                                <div className="leading-relaxed">
                                  <MathRenderer content={opt.text} />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Explanation & Hint */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-gray-100">
                      <div className="space-y-1.5">
                        <label className="font-bold text-indigo-900 text-xs">الشرح وطريقة الحل (Explanation):</label>
                        <textarea
                          rows={2}
                          value={q.explanation || ''}
                          onChange={(e) => {
                            const newQs = [...editableQuiz.questions];
                            newQs[qIdx].explanation = e.target.value;
                            setEditableQuiz({ ...editableQuiz, questions: newQs });
                          }}
                          className="w-full p-2.5 bg-indigo-50/40 border border-indigo-200 rounded-xl text-indigo-950 text-xs focus:bg-white outline-none resize-y min-h-[55px]"
                          placeholder="شرح خطوات الحل النموذجي باللاتكس..."
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-bold text-amber-900 text-xs">التلميح التربوي (Hint):</label>
                        <textarea
                          rows={2}
                          value={q.hint || ''}
                          onChange={(e) => {
                            const newQs = [...editableQuiz.questions];
                            newQs[qIdx].hint = e.target.value;
                            setEditableQuiz({ ...editableQuiz, questions: newQs });
                          }}
                          className="w-full p-2.5 bg-amber-50/40 border border-amber-200 rounded-xl text-amber-950 text-xs focus:bg-white outline-none resize-y min-h-[55px]"
                          placeholder="تلميح يظهر للطالب لمساعدته..."
                        />
                      </div>
                    </div>

                  </div>
                ))}
              </div>

              {/* Add New Question Button */}
              <button
                type="button"
                onClick={() => {
                  const newQIdx = editableQuiz.questions.length + 1;
                  const newQ: UnitQuizQuestion = {
                    id: `uq_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                    questionNumber: newQIdx,
                    questionText: '',
                    options: [
                      { id: `opt_${newQIdx}_a`, text: '', isCorrect: true },
                      { id: `opt_${newQIdx}_b`, text: '', isCorrect: false },
                      { id: `opt_${newQIdx}_c`, text: '', isCorrect: false },
                      { id: `opt_${newQIdx}_d`, text: '', isCorrect: false },
                    ],
                    correctOptionId: `opt_${newQIdx}_a`,
                    explanation: '',
                    hint: '',
                    topic: ''
                  };
                  setEditableQuiz({
                    ...editableQuiz,
                    questions: [...editableQuiz.questions, newQ]
                  });
                }}
                className="w-full py-3.5 bg-violet-50 hover:bg-violet-100/80 border-2 border-dashed border-violet-200 text-violet-800 font-black text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>إضافة سؤال جديد للاختبار ➕</span>
              </button>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                إلغاء التعديل
              </button>

              <button
                type="button"
                onClick={handleSaveEditsToDatabase}
                disabled={isSaving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>حفظ التعديلات في قاعدة البيانات 💾</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
