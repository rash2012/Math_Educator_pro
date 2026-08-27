import React, { useState, useEffect } from 'react';
import {  
  Brain, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Lightbulb, 
  Compass, 
  RotateCcw, 
  Lock, 
  Unlock, 
  Award, 
  Edit3, 
  Save, 
  ChevronRight, 
  ChevronLeft, 
  Loader2, 
  Check, 
  Search,
  Eye,
  AlertTriangle,
  Database,
  X,
  FastForward,
  HelpCircle,
  TrendingUp,
  Zap,
  BookOpen
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { generateGuidedQuestionsForExercise } from '../services/gemini';
import type { 
  GuidedQuestion, 
  GuidedOption, 
  PracticeExercise, 
  StationAttemptData, 
  AttemptSummary 
} from '../db';

export { type StationAttemptData, type AttemptSummary };

interface PatternGuidedTrainerProps {
  exercise: PracticeExercise;
  sectionId: number;
  lessonTitle?: string;
  unitTitle?: string;
  grade?: string;
  subject?: string;
  isAdmin?: boolean;
  onUpdateExercise: (updatedEx: PracticeExercise) => Promise<void> | void;
}

export const PatternGuidedTrainer: React.FC<PatternGuidedTrainerProps> = ({
  exercise,
  sectionId,
  lessonTitle,
  unitTitle,
  grade,
  subject,
  isAdmin = true,
  onUpdateExercise
}) => {
  const [currentStationIdx, setCurrentStationIdx] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isCurrentAnswerSubmitted, setIsCurrentAnswerSubmitted] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [mistakesCount, setMistakesCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Attempt Data Tracking
  // Array / Map for stations 0, 1, 2 (Stations 1, 2, 3)
  const [stationsData, setStationsData] = useState<Record<number, StationAttemptData>>({
    0: { hint_level_reached: 0, hint_source: null, was_skipped: false },
    1: { hint_level_reached: 0, hint_source: null, was_skipped: false },
    2: { hint_level_reached: 0, hint_source: null, was_skipped: false },
  });

  const [station4CorrectFirstTry, setStation4CorrectFirstTry] = useState<boolean | null>(null);
  const [station4SelectedOptionIndex, setStation4SelectedOptionIndex] = useState<number | null>(null);
  const [totalPointsAwarded, setTotalPointsAwarded] = useState(0);
  const [attemptSummary, setAttemptSummary] = useState<AttemptSummary | null>(null);

  // Shuffled options map
  const [shuffledOptionsMap, setShuffledOptionsMap] = useState<Record<string, GuidedOption[]>>({});

  // Admin states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editableQuestions, setEditableQuestions] = useState<GuidedQuestion[]>(exercise.guidedQuestions || []);
  const [editablePatternType, setEditablePatternType] = useState<string>(exercise.patternType || '');
  const [optionsLayoutMode, setOptionsLayoutMode] = useState<'single' | 'grid'>('single');
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  const guidedQuestions = exercise.guidedQuestions || [];
  const currentQuestion = guidedQuestions[currentStationIdx];
  const isFinalStation = currentStationIdx === 3 || currentQuestion?.isFinalResult || currentStationIdx === guidedQuestions.length - 1;

  // Helper to shuffle options
  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Reset Session
  const resetTrainingSession = (questionsToUse = guidedQuestions) => {
    setCurrentStationIdx(0);
    setSelectedOptionId(null);
    setIsCurrentAnswerSubmitted(false);
    setIsCurrentCorrect(null);
    setMistakesCount(0);
    setIsCompleted(false);

    const initialStations: Record<number, StationAttemptData> = {
      0: { hint_level_reached: 0, hint_source: null, was_skipped: false },
      1: { hint_level_reached: 0, hint_source: null, was_skipped: false },
      2: { hint_level_reached: 0, hint_source: null, was_skipped: false },
    };
    setStationsData(initialStations);
    setStation4CorrectFirstTry(null);
    setStation4SelectedOptionIndex(null);
    setTotalPointsAwarded(0);
    setAttemptSummary(null);

    const newShuffledMap: Record<string, GuidedOption[]> = {};
    questionsToUse.forEach(q => {
      newShuffledMap[q.id] = shuffleArray(q.options);
    });
    setShuffledOptionsMap(newShuffledMap);
  };

  useEffect(() => {
    if (guidedQuestions.length > 0) {
      resetTrainingSession(guidedQuestions);
      setEditableQuestions(guidedQuestions);
      setEditablePatternType(exercise.patternType || '');
      if (exercise.lastAttempt) {
        setAttemptSummary(exercise.lastAttempt);
      }
    }
  }, [exercise.id, guidedQuestions.length]);

  // Points Calculation
  const computeStationPoints = (stData: StationAttemptData): number => {
    if (stData.was_skipped) return 0;
    if (stData.hint_level_reached === 0) return 10;
    if (stData.hint_level_reached === 1) return 6;
    if (stData.hint_level_reached === 2) return 2;
    return 0;
  };

  const calculateTotalPoints = (st4Correct: boolean, currentStationsMap: Record<number, StationAttemptData>): number => {
    let pts = 0;
    // Points for stations 1, 2, 3 (indices 0, 1, 2)
    [0, 1, 2].forEach(idx => {
      const st = currentStationsMap[idx] || { hint_level_reached: 0, hint_source: null, was_skipped: false };
      pts += computeStationPoints(st);
    });

    // Points for Station 4:
    // Bonus 20 points if correct on first try AND no hints used in any of stations 1-3.
    // Base 10 points if correct on first try with hints used.
    // 0 if wrong.
    const usedAnyHints = [0, 1, 2].some(idx => {
      const st = currentStationsMap[idx];
      return st && (st.hint_level_reached > 0 || st.was_skipped);
    });

    if (st4Correct) {
      if (!usedAnyHints) {
        pts += 20; // Full independence mastery bonus
      } else {
        pts += 10; // Base score
      }
    }

    return Math.max(0, pts);
  };

  // Double Hint Request Handler (Stations 1, 2, 3 only)
  const handleRequestHint = (isVoluntary: boolean) => {
    if (isFinalStation) return; // Strict: No hint button or hint ladder on Station 4

    setStationsData(prev => {
      const current = prev[currentStationIdx] || { hint_level_reached: 0, hint_source: null, was_skipped: false };
      if (current.hint_level_reached >= 2 || current.was_skipped) return prev;

      const nextLevel = (current.hint_level_reached + 1) as 1 | 2;
      // Record source of first hint only as primary diagnostic indicator
      const nextSource = current.hint_level_reached === 0 
        ? (isVoluntary ? 'voluntary' : 'reactive') 
        : current.hint_source;

      return {
        ...prev,
        [currentStationIdx]: {
          ...current,
          hint_level_reached: nextLevel,
          hint_source: nextSource
        }
      };
    });
  };

  // Skip Station Handler (After 2 hints or stuck in Stations 1-3)
  const handleSkipStation = () => {
    if (isFinalStation) return; // Station 4 cannot be skipped

    const updatedStations = {
      ...stationsData,
      [currentStationIdx]: {
        ...(stationsData[currentStationIdx] || { hint_level_reached: 2, hint_source: null }),
        hint_level_reached: (stationsData[currentStationIdx]?.hint_level_reached || 2) as 1 | 2,
        was_skipped: true
      }
    };
    setStationsData(updatedStations);
    setIsCurrentAnswerSubmitted(true);
    setIsCurrentCorrect(false);
  };

  // Option Selection
  const handleSelectOption = (optionId: string) => {
    const currentData = stationsData[currentStationIdx];
    if (isCurrentCorrect === true || currentData?.was_skipped) return;

    setSelectedOptionId(optionId);

    // If Station 4: Immediately submit on selection without mandatory retry loop
    if (isFinalStation && currentQuestion) {
      const chosenOption = currentQuestion.options.find(opt => opt.id === optionId);
      const isCorrect = !!chosenOption?.isCorrect;
      const optIndex = currentQuestion.options.findIndex(opt => opt.id === optionId);

      setStation4CorrectFirstTry(isCorrect);
      setStation4SelectedOptionIndex(optIndex >= 0 ? optIndex : 0);

      setIsCurrentAnswerSubmitted(true);
      setIsCurrentCorrect(isCorrect);
      setIsCompleted(true);

      const calculatedPoints = calculateTotalPoints(isCorrect, stationsData);
      setTotalPointsAwarded(calculatedPoints);

      const summary: AttemptSummary = {
        stations_data: [
          stationsData[0] || { hint_level_reached: 0, hint_source: null, was_skipped: false },
          stationsData[1] || { hint_level_reached: 0, hint_source: null, was_skipped: false },
          stationsData[2] || { hint_level_reached: 0, hint_source: null, was_skipped: false },
        ],
        station4_correct_first_try: isCorrect,
        station4_selected_option_index: optIndex >= 0 ? optIndex : 0,
        total_points_awarded: calculatedPoints,
        completedAt: Date.now()
      };
      setAttemptSummary(summary);

      // Auto-save attempt to database
      const updatedEx: PracticeExercise = {
        ...exercise,
        lastAttempt: summary
      };
      onUpdateExercise(updatedEx);
    }
  };

  // Verify Option for Stations 1, 2, 3
  const handleVerifyOption = () => {
    if (!currentQuestion || !selectedOptionId || isFinalStation) return;

    const chosenOption = currentQuestion.options.find(opt => opt.id === selectedOptionId);
    const isCorrect = !!chosenOption?.isCorrect;

    if (isCorrect) {
      setIsCurrentAnswerSubmitted(true);
      setIsCurrentCorrect(true);
    } else {
      setMistakesCount(prev => prev + 1);
      setIsCurrentAnswerSubmitted(true);
      setIsCurrentCorrect(false);
      // Reactive hint trigger
      handleRequestHint(false);
    }
  };

  // Advance to next station
  const handleNextStation = () => {
    if (currentStationIdx < guidedQuestions.length - 1) {
      setCurrentStationIdx(prev => prev + 1);
      setSelectedOptionId(null);
      setIsCurrentAnswerSubmitted(false);
      setIsCurrentCorrect(null);
    } else {
      setIsCompleted(true);
    }
  };

  // AI Generation
  const handleGenerateAI = async () => {
    setIsGenerating(true);
    try {
      const res = await generateGuidedQuestionsForExercise(
        {
          title: exercise.title,
          questionText: exercise.questionText,
          solutionText: exercise.solutionText,
          strategyText: exercise.strategyText
        },
        {
          grade,
          subject,
          unit: unitTitle,
          lessonTitle
        }
      );

      if (res && res.guidedQuestions && res.guidedQuestions.length > 0) {
        const updatedEx: PracticeExercise = {
          ...exercise,
          patternType: res.patternType || 'التعرف على النمط البنيوي للمسألة',
          guidedQuestions: res.guidedQuestions
        };
        setEditableQuestions(res.guidedQuestions);
        setEditablePatternType(res.patternType || '');
        await onUpdateExercise(updatedEx);
        resetTrainingSession(res.guidedQuestions);
        setSaveNotification('تم توليد وحفظ مسار التفكير والسلّم التلميحي بنجاح! 💾✨');
        setTimeout(() => setSaveNotification(null), 5000);
      }
    } catch (err) {
      console.error('Failed to generate guided questions:', err);
      alert('حدث خطأ أثناء توليد الأسئلة الموجهة بالذكاء الاصطناعي. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save to DB
  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    try {
      const updatedEx: PracticeExercise = {
        ...exercise,
        patternType: editablePatternType.trim() || exercise.patternType || 'التعرف على النمط البنيوي',
        guidedQuestions: editableQuestions.length > 0 ? editableQuestions : guidedQuestions
      };
      await onUpdateExercise(updatedEx);
      setSaveNotification('تم حفظ محطات التدريب في قاعدة البيانات! 🗄️');
      setTimeout(() => setSaveNotification(null), 4000);
    } catch (err) {
      console.error('Failed to save to database:', err);
      alert('فشل حفظ محطات التدريب في قاعدة البيانات.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Admin Edits
  const handleSaveAdminEdits = async () => {
    setIsSaving(true);
    try {
      const updatedEx: PracticeExercise = {
        ...exercise,
        patternType: editablePatternType.trim() || 'التعرف على النمط البنيوي',
        guidedQuestions: editableQuestions
      };
      await onUpdateExercise(updatedEx);
      setIsEditModalOpen(false);
      resetTrainingSession(editableQuestions);
      setSaveNotification('تم حفظ التعديلات بنجاح! 💾');
      setTimeout(() => setSaveNotification(null), 4000);
    } catch (err) {
      console.error('Failed to save manual edits:', err);
      alert('فشل حفظ التعديلات.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentOptions = currentQuestion 
    ? (shuffledOptionsMap[currentQuestion.id] || currentQuestion.options)
    : [];

  const currentStationData = stationsData[currentStationIdx] || { 
    hint_level_reached: 0, 
    hint_source: null, 
    was_skipped: false 
  };

  const chosenOptionForFeedback = currentQuestion?.options.find(opt => opt.id === selectedOptionId);

  return (
    <div className="bg-slate-50/90 rounded-2xl border border-violet-200/80 shadow-sm overflow-hidden font-sans my-4" dir="rtl">
      
      {/* Top Banner / Header Bar */}
      <div className="bg-gradient-to-r from-violet-100/95 via-indigo-50/80 to-purple-50/95 px-5 py-4 border-b border-violet-200/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white text-violet-700 border border-violet-200 shadow-xs flex items-center justify-center">
            <Brain size={22} className="text-violet-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wide bg-violet-600 text-white px-2.5 py-0.5 rounded-lg shadow-xs">
                ميدان التدريب (Pattern Recognition)
              </span>
              {exercise.patternType && (
                <span className="text-[11px] font-bold text-amber-900 bg-amber-100/80 border border-amber-200 px-2.5 py-0.5 rounded-lg">
                  النمط: {exercise.patternType}
                </span>
              )}
              {guidedQuestions.length > 0 && (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <Database size={11} className="text-emerald-700" />
                  <span>محفوظ في قاعدة البيانات</span>
                </span>
              )}
            </div>
            <h4 className="text-sm md:text-base font-black text-slate-900 mt-1">
              محطات التفكير الأربع: سلم تلميحات مزدوج وفتح حل غير محبط
            </h4>
          </div>
        </div>

        {/* Admin Controls */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {guidedQuestions.length > 0 && (
              <button
                type="button"
                onClick={handleSaveToDatabase}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                title="تأكيد حفظ محطات التدريب في قاعدة البيانات المحلية"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>حفظ في قاعدة البيانات 💾</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="توليد محطات التفكير والأسئلة الموجهة بالذكاء الاصطناعي لهذا التمرين وحفظها"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={13} className="animate-spin text-white" />
                  <span>جارٍ التوليد...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-amber-200" />
                  <span>{guidedQuestions.length > 0 ? 'إعادة التوليد (AI)' : 'توليد ذكي (AI)'}</span>
                </>
              )}
            </button>

            {guidedQuestions.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-gray-200 shadow-xs transition-all cursor-pointer"
                  title="تعديل الأسئلة والتلميحات والخيارات يدوياً"
                >
                  <Edit3 size={13} className="text-violet-600" />
                  <span>تعديل يدوي</span>
                </button>

                <button
                  type="button"
                  onClick={() => resetTrainingSession()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-gray-200 shadow-xs transition-all cursor-pointer"
                  title="إعادة بدء التدريب وخلط الخيارات"
                >
                  <RotateCcw size={13} className="text-slate-500" />
                  <span>إعادة البدء</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Save Notification Toast */}
      {saveNotification && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2.5 text-xs font-black text-emerald-800 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveNotification}</span>
        </div>
      )}

      {/* 📖 Exercise Problem Statement Card (نص المسألة والتمرين الأصلي كاملاً) */}
      <div className="bg-gradient-to-br from-violet-50/70 via-slate-50/50 to-indigo-50/40 border-b border-violet-200/80 p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center font-black shadow-xs shrink-0">
              <BookOpen size={16} />
            </span>
            <div>
              <span className="text-[10px] font-black text-violet-700 bg-violet-100/90 border border-violet-200 px-2 py-0.5 rounded-md inline-block">
                نص المسألة والتمرين المطلوب
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
                {exercise.title || 'مسألة تدريب وتطبيق'}
              </h3>
            </div>
          </div>

          {exercise.patternType && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-bold shadow-2xs">
              <Brain size={14} className="text-amber-600 shrink-0" />
              <span>النمط المستهدف: <strong>{exercise.patternType}</strong></span>
            </div>
          )}
        </div>

        {/* Question Text with KaTeX Support */}
        <div className="bg-white rounded-2xl border border-violet-200/80 p-4 sm:p-5 shadow-xs text-slate-900 text-sm sm:text-base font-bold leading-relaxed overflow-x-auto selection:bg-violet-100">
          {exercise.questionText && exercise.questionText.trim() ? (
            <MathRenderer content={exercise.questionText} />
          ) : (
            <div className="text-slate-600 font-bold">
              {exercise.title ? <MathRenderer content={exercise.title} /> : 'نص المسألة غير متوفر.'}
            </div>
          )}
        </div>

        {/* SVG Diagram if exists */}
        {exercise.svgCode && exercise.svgCode.trim() && (
          <div className="bg-white rounded-2xl border border-violet-200/80 p-4 flex items-center justify-center overflow-x-auto shadow-xs">
            <div
              className="max-w-full flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: exercise.svgCode }}
            />
          </div>
        )}
      </div>

      {/* Main Body */}
      <div className="p-5 sm:p-6 bg-white">
        {guidedQuestions.length === 0 ? (
          /* Empty State */
          <div className="text-center py-8 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-100 text-violet-700 border border-violet-200 flex items-center justify-center shadow-xs">
              <Compass size={28} />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h5 className="text-base font-black text-slate-900">لم يتم إنشاء محطات التدريب البنيوي بعد</h5>
              <p className="text-xs text-slate-600 leading-relaxed">
                تدريب الطالب على التعرف الفوري على نمط المسألة في الامتحان عبر 4 محطات موجهة مع سلّم تلميحات مزدوج وفتح مباشر للحل التفصيلي.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-l from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} className="text-amber-200" />}
                <span>توليد مسار التفكير والسلّم التلميحي (AI) وحفظه</span>
              </button>
            )}
          </div>
        ) : (
          /* Active Training Flow */
          <div className="space-y-6">

            {/* Stepper Progress Indicator */}
            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-3 text-xs font-black text-slate-800">
                <span className="flex items-center gap-2">
                  <span>محطة {currentStationIdx + 1} من {guidedQuestions.length}</span>
                  {isFinalStation ? (
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1">
                      <Lock size={11} className="text-amber-700" />
                      <span>المحطة 4: سؤال الحسم (التزام وتوقع النتيجة)</span>
                    </span>
                  ) : (
                    <span className="bg-violet-100 text-violet-900 border border-violet-200 px-2 py-0.5 rounded-md text-[10px] font-bold">
                      سلم تلميحات (متاح 2 تلميحات)
                    </span>
                  )}
                </span>
                
                {/* Score & Mistakes summary */}
                <div className="flex items-center gap-3 text-xs font-bold">
                  {!isFinalStation && (
                    <span className="text-slate-500">
                      التلميحات المستهلكة في هذه المحطة: <strong className="text-violet-700 font-black">{currentStationData.hint_level_reached}/2</strong>
                    </span>
                  )}
                  <span className="text-slate-500">
                    الأخطاء: <strong className={mistakesCount > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}>{mistakesCount}</strong>
                  </span>
                </div>
              </div>

              {/* Step Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {guidedQuestions.map((q, idx) => {
                  const isPast = idx < currentStationIdx;
                  const isCurrent = idx === currentStationIdx;
                  const st = stationsData[idx];
                  const wasSkipped = st?.was_skipped;

                  let pillStyle = "bg-white border-slate-200 text-slate-400 text-xs font-medium";
                  if (isPast) {
                    if (wasSkipped) {
                      pillStyle = "bg-amber-50 border-amber-200 text-amber-800 font-bold text-xs";
                    } else {
                      pillStyle = "bg-emerald-50 border-emerald-200 text-emerald-800 font-bold text-xs";
                    }
                  } else if (isCurrent) {
                    pillStyle = "bg-violet-600 border-violet-600 text-white font-black text-xs ring-2 ring-violet-400/30 shadow-xs";
                  }

                  const stationTitles = [
                    '1. الاستكشاف والنمط',
                    '2. ربط القانون والأداة',
                    '3. الخطوة الحاسمة',
                    '4. الناتج النهائي'
                  ];

                  return (
                    <div
                      key={q.id || idx}
                      className={`px-3 py-2 rounded-xl border text-center transition-all ${pillStyle}`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        {isPast ? (
                          wasSkipped ? (
                            <FastForward size={13} className="text-amber-600 shrink-0" />
                          ) : (
                            <Check size={13} className="text-emerald-600 shrink-0" />
                          )
                        ) : isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping shrink-0" />
                        ) : null}
                        <span className="truncate">{stationTitles[idx] || q.title || `محطة ${idx + 1}`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Question Box (Only visible if not yet completed or during active step) */}
            {!isCompleted && currentQuestion && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5 shadow-xs">
                
                {/* Station Title, Hint Request Button (Stations 1-3 only) & Prompt */}
                <div className="space-y-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-violet-800 bg-violet-50 border border-violet-200 px-3 py-1 rounded-lg">
                        {currentQuestion.title || `المحطة ${currentStationIdx + 1}`}
                      </span>

                      {/* Station 4 Alert vs Stations 1-3 Hint Indicator */}
                      {isFinalStation ? (
                        <span className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <Zap size={12} className="text-amber-600" />
                          <span>اختر إجابة لفتح الحل المباشر فوراً</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                          المستوى التلميحي: {currentStationData.hint_level_reached} من 2
                        </span>
                      )}
                    </div>

                    {/* 🔍 Optional Voluntary Hint Button (Strictly for Stations 1, 2, 3 only) */}
                    {!isFinalStation && isCurrentCorrect !== true && !currentStationData.was_skipped && (
                      <div className="flex items-center gap-2">
                        {currentStationData.hint_level_reached < 2 ? (
                          <button
                            type="button"
                            onClick={() => handleRequestHint(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="طلب تلميح توجيهي من سلّم التلميحات المزدوج"
                          >
                            <Search size={13} className="text-amber-700" />
                            <span>
                              {currentStationData.hint_level_reached === 0 
                                ? '🔍 أحتاج تلميحاً (تلميح 1 من 2)' 
                                : '🔍 أحتاج تلميحاً إضافياً (تلميح 2 من 2)'}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSkipStation}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-black rounded-xl transition-all cursor-pointer"
                            title="تخطي هذه المحطة ومشاهدة كيفية التفكير بها"
                          >
                            <FastForward size={13} className="text-indigo-600" />
                            <span>تخطَّ هذه المحطة وشاهد كيف نفكر بها</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-sm md:text-base font-black text-slate-900 leading-relaxed pt-1">
                    <MathRenderer content={currentQuestion.prompt} />
                  </div>
                </div>

                {/* 4 Options Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentOptions.map((opt, optIdx) => {
                    const isSelected = selectedOptionId === opt.id;
                    const isSubmitted = isCurrentAnswerSubmitted;
                    const isCorrectOpt = opt.isCorrect;

                    let cardStyle = "bg-white border-slate-200 hover:bg-violet-50/40 hover:border-violet-300 text-slate-800";
                    if (isSubmitted) {
                      if (isSelected && isCorrectOpt) {
                        cardStyle = "bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-400/30";
                      } else if (isSelected && !isCorrectOpt) {
                        cardStyle = "bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-400/30";
                      } else if (isCorrectOpt && isCurrentCorrect === false) {
                        cardStyle = "bg-emerald-50/60 border-emerald-300 text-emerald-900";
                      }
                    } else if (isSelected) {
                      cardStyle = "bg-violet-50 border-violet-500 text-violet-950 ring-2 ring-violet-400/30 font-bold";
                    }

                    return (
                      <button
                        type="button"
                        key={opt.id || optIdx}
                        disabled={isCurrentCorrect === true || currentStationData.was_skipped}
                        onClick={() => handleSelectOption(opt.id)}
                        className={`p-3.5 rounded-xl border text-right transition-all flex items-start gap-3 cursor-pointer text-xs sm:text-sm font-medium ${cardStyle}`}
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-black border mt-0.5 ${
                          isSelected
                            ? isSubmitted
                              ? isCorrectOpt
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : 'bg-rose-600 border-rose-500 text-white'
                              : 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-slate-100 border-slate-300 text-slate-700'
                        }`}>
                          {String.fromCharCode(65 + optIdx)}
                        </span>

                        <div className="flex-1 overflow-hidden leading-relaxed text-slate-900">
                          <MathRenderer content={opt.text} />
                        </div>

                        {isSubmitted && isSelected && (
                          <span className="shrink-0 mt-0.5">
                            {isCorrectOpt ? (
                              <CheckCircle2 size={18} className="text-emerald-600" />
                            ) : (
                              <XCircle size={18} className="text-rose-600" />
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Submission & Action Bar (Stations 1-3) */}
                {!isFinalStation && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-3">
                    <div>
                      {isCurrentCorrect === false && !currentStationData.was_skipped && (
                        <span className="text-xs font-extrabold text-rose-600 flex items-center gap-1.5 animate-fade-in">
                          <XCircle size={15} />
                          إجابة غير دقيقة! طالع التلميح أدناه واختر الإجابة الصحيحة للمتابعة.
                        </span>
                      )}
                      {isCurrentCorrect === true && (
                        <span className="text-xs font-extrabold text-emerald-700 flex items-center gap-1.5 animate-fade-in">
                          <CheckCircle2 size={15} />
                          إجابة صحيحة ومتقنة! أحسنت.
                        </span>
                      )}
                      {currentStationData.was_skipped && (
                        <span className="text-xs font-extrabold text-amber-700 flex items-center gap-1.5 animate-fade-in">
                          <FastForward size={15} />
                          تم تخطي هذه المحطة لمتابعة مسار التعلم.
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mr-auto">
                      {!isCurrentCorrect && !currentStationData.was_skipped && (
                        <button
                          type="button"
                          disabled={!selectedOptionId}
                          onClick={handleVerifyOption}
                          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                          تحقق من الإجابة
                        </button>
                      )}

                      {(isCurrentCorrect === true || currentStationData.was_skipped) && (
                        <button
                          type="button"
                          onClick={handleNextStation}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
                        >
                          <span>الانتقال للمحطة التالية</span>
                          <ChevronLeft size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Double Hint Ladder Display (Level 1 and Level 2) for Stations 1-3 */}
                {!isFinalStation && currentStationData.hint_level_reached > 0 && !currentStationData.was_skipped && (
                  <div className="space-y-3 pt-3 border-t border-slate-100 animate-slide-down">
                    
                    {/* Level 1 Hint Card */}
                    <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 text-amber-950 text-xs leading-relaxed space-y-2 shadow-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2 font-black text-amber-900">
                        <div className="flex items-center gap-2">
                          <Lightbulb size={16} className="text-amber-600" />
                          <span>💡 التلميح الأول: نقلة مفاهيمية عامة</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-200/80 text-amber-900">
                          {currentStationData.hint_source === 'voluntary' ? '🔍 طُلب طوعاً بالزر' : '⚠️ ظهر بعد محاولة غير موفقة'}
                        </span>
                      </div>
                      <div className="text-slate-800 pr-6">
                        <MathRenderer content={currentQuestion.hintLevel1 || currentQuestion.hint || 'تأمل في بنية السؤال وحدد القاعدة الأساسية المباشرة المطبقة هنا.'} />
                      </div>
                    </div>

                    {/* Level 2 Hint Card (Bottom-out hint) */}
                    {currentStationData.hint_level_reached >= 2 && (
                      <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-4 text-indigo-950 text-xs leading-relaxed space-y-2 shadow-xs animate-slide-down">
                        <div className="flex items-center justify-between flex-wrap gap-2 font-black text-indigo-900">
                          <div className="flex items-center gap-2">
                            <Compass size={16} className="text-indigo-600" />
                            <span>🎯 التلميح الثاني: تلميح قريب من الحل (Bottom-out Hint)</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-200/80 text-indigo-900">
                            المستوى الأخير للتلميحات
                          </span>
                        </div>
                        <div className="text-slate-800 pr-6">
                          <MathRenderer content={currentQuestion.hintLevel2 || currentQuestion.conceptMap || 'طبق التحويل الجبري المباشر بضرب البسط والمقام أو عزل المتغير كما في القواعد الأساسية.'} />
                        </div>
                      </div>
                    )}

                    {/* Option to skip after reaching level 2 */}
                    {currentStationData.hint_level_reached >= 2 && isCurrentCorrect !== true && (
                      <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
                        <span className="text-slate-700 font-medium">
                          هل ما زلت تشعر بالتردد بعد استهلاك التلميحين؟
                        </span>
                        <button
                          type="button"
                          onClick={handleSkipStation}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <FastForward size={13} />
                          <span>تخطَّ هذه المحطة وشاهد كيف نفكر بها</span>
                        </button>
                      </div>
                    )}

                  </div>
                )}

                {/* Skipped Station Explanatory Box (Shown when student skips station 1-3) */}
                {!isFinalStation && currentStationData.was_skipped && (
                  <div className="bg-gradient-to-r from-slate-50 to-indigo-50/50 border border-indigo-200 rounded-xl p-4 text-xs space-y-2 animate-fade-in shadow-xs">
                    <div className="flex items-center gap-2 font-black text-indigo-900">
                      <Brain size={16} className="text-indigo-600" />
                      <span>🧠 كيف نفكر في هذه المحطة (مسار التفكير دون كشف الإجابة):</span>
                    </div>
                    <div className="text-slate-800 pr-6 leading-relaxed">
                      <MathRenderer content={currentQuestion.skipExplanation || currentQuestion.conceptMap || 'في هذه الخطوة نبحث عن الرابط المنطقي بين المعطيات والمبرهنة الرياضية المناسبة.'} />
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Station 4 Completion & Non-frustrating Immediate Unlock Card */}
            {isCompleted && (
              <div className="bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 border-2 border-emerald-300 rounded-2xl p-5 sm:p-7 space-y-6 shadow-sm animate-fade-in text-right">
                
                {/* Completion Header */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-emerald-200 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-xs">
                      <Award size={26} />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-emerald-900">
                        اكتملت محطات التدريب وتم فتح الحل الكامل بنجاح 🎉
                      </h4>
                      <p className="text-xs text-emerald-700 font-medium">
                        تم فتح الحل التفصيلي والنموذجي الكامل للتمرين للتدقيق النهائي
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => resetTrainingSession()}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-gray-200 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <RotateCcw size={13} className="text-slate-500" />
                    <span>إعادة التدريب والخلط</span>
                  </button>
                </div>

                {/* Station 4 Instant Diagnostic Feedback Banner */}
                {station4CorrectFirstTry === true ? (
                  <div className="p-4 bg-emerald-100/80 border border-emerald-300 rounded-xl text-xs text-emerald-950 font-bold flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
                    <span>أحسنت! هذا بالضبط ما توقعناه ✅ (إجابة دقيقة وحساب صحيح للناتج النهائي)</span>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1.5">
                    <div className="flex items-center gap-2 font-black text-amber-900">
                      <AlertTriangle size={17} className="text-amber-700 shrink-0" />
                      <span>تشخيص النتيجة في المحطة الرابعة:</span>
                    </div>
                    <p className="text-slate-800 leading-relaxed pr-6">
                      {chosenOptionForFeedback?.misconceptionDiagnosis || 
                        `اختيارك للخيار (${String.fromCharCode(65 + (station4SelectedOptionIndex ?? 0))}) يشير إلى نقطة انحراف محتملة في إشارة أو خطوة حسابية وسيطة. طالع الحل المفصل أدناه لتثبيت الفهم التام.`}
                    </p>
                  </div>
                )}

                {/* Comprehensive Attempt Summary Table */}
                <div className="p-4.5 bg-white rounded-xl border border-slate-200 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-wrap gap-2">
                    <span className="font-black text-slate-900 text-xs flex items-center gap-2">
                      <TrendingUp size={15} className="text-violet-600" />
                      <span>خلاصة محاولة الطالب (سجل الأداء والمكافأة):</span>
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">النقاط الكلية المستحقة:</span>
                      <span className="px-2.5 py-0.5 bg-emerald-600 text-white font-black rounded-lg text-xs">
                        {totalPointsAwarded} نقطة
                      </span>
                    </div>
                  </div>

                  {/* Breakdown Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                    {[0, 1, 2].map(sIdx => {
                      const st = stationsData[sIdx] || { hint_level_reached: 0, hint_source: null, was_skipped: false };
                      const pts = computeStationPoints(st);
                      const stationNames = ['1. الاستكشاف', '2. ربط القانون', '3. الخطوة الحاسمة'];
                      return (
                        <div key={sIdx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>{stationNames[sIdx]}</span>
                            <span className="font-black text-emerald-700">+{pts} نقطة</span>
                          </div>
                          <div className="text-slate-500 text-[10px]">
                            {st.was_skipped ? (
                              <span className="text-amber-700 font-bold">تم التخطي (0 نقطة)</span>
                            ) : st.hint_level_reached === 0 ? (
                              <span className="text-emerald-700 font-bold">بدون تلميحات (مكتملة باستقلالية)</span>
                            ) : (
                              <span>استُهلك {st.hint_level_reached} تلميح ({st.hint_source === 'voluntary' ? 'طوعي' : 'تفاعلي'})</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Station 4 Bonus note */}
                  <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between">
                    <span>المحطة 4 (سؤال الحسم):</span>
                    <span className="font-bold text-slate-800">
                      {station4CorrectFirstTry 
                        ? (totalPointsAwarded >= 30 ? 'مكافأة الاستقلالية الكاملة (+20 نقطة) 🌟' : 'إجابة صحيحة (+10 نقاط) ✅')
                        : 'تم استعراض الحل للتصحيح الفوري (0 نقطة)'}
                    </span>
                  </div>
                </div>

                {/* Quick Strategy if available */}
                {exercise.strategyText && (
                  <div className="p-4 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-950 leading-relaxed space-y-1">
                    <span className="font-extrabold text-amber-900 flex items-center gap-1.5">
                      <Lightbulb size={14} className="text-amber-600" />
                      <span>فكرة واستراتيجية الحل السريعة:</span>
                    </span>
                    <MathRenderer content={exercise.strategyText} />
                  </div>
                )}

                {/* Full Detailed Solution Unlocked */}
                <div className="space-y-2">
                  <span className="text-xs font-black text-emerald-900 flex items-center gap-2">
                    <Unlock size={14} className="text-emerald-600" />
                    <span>الحل التفصيلي والنموذجي الكامل للتمرين:</span>
                  </span>
                  <div className="text-xs sm:text-sm leading-relaxed text-slate-900 p-5 bg-white rounded-xl border border-emerald-200 w-full overflow-x-auto shadow-xs">
                    <MathRenderer content={exercise.solutionText || 'الحل غير متوفر حالياً.'} />
                  </div>
                </div>

              </div>
            )}

          </div>
        )}
      </div>

      {/* Admin Manual Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl text-slate-900">
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-gradient-to-r from-violet-900 to-indigo-900 text-white flex items-center justify-between shrink-0 border-b border-violet-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/10 text-white border border-white/10">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">تعديل محطات التعرف البنيوي وسلّم التلميحات</h3>
                  <p className="text-xs text-violet-200 mt-0.5">تخصيص الأسئلة الموجهة، التلميح الأول والثاني، شرح التخطي، وتشخيص المشتتات</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-violet-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 text-xs bg-slate-50/50">
              
              {/* Pattern Type Input */}
              <div className="bg-white p-4.5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
                <label className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                  <Brain size={15} className="text-violet-600" />
                  <span>اسم النمط البنيوي للمسألة (Pattern Type):</span>
                </label>
                <input
                  type="text"
                  value={editablePatternType}
                  onChange={(e) => setEditablePatternType(e.target.value)}
                  placeholder="مثال: إثبات صحة قضية بالتراجع / دراسة نهاية متتالية عبر مبرهنة الإحاطة"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 font-bold outline-none focus:bg-white focus:border-violet-500 transition-all text-xs"
                />
              </div>

              {/* Questions List */}
              <div className="space-y-6">
                {editableQuestions.map((q, qIdx) => (
                  <div key={q.id || qIdx} className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5">
                    
                    {/* Station Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 font-black text-xs flex items-center justify-center border border-violet-200">
                          {qIdx + 1}
                        </span>
                        <span className="font-black text-violet-800 text-sm">
                          {q.title || `المحطة رقم ${qIdx + 1}`}
                        </span>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100/80 px-3 py-1.5 rounded-xl border border-amber-200 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={!!q.isFinalResult || qIdx === 3}
                          onChange={(e) => {
                            const newQs = [...editableQuestions];
                            newQs[qIdx].isFinalResult = e.target.checked;
                            setEditableQuestions(newQs);
                          }}
                          className="w-4 h-4 text-violet-600 rounded border-gray-300 cursor-pointer"
                        />
                        <span>المحطة 4: سؤال الحسم (فتح الحل المباشر) 🎯</span>
                      </label>
                    </div>

                    {/* Station Title */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 text-xs">عنوان المحطة:</label>
                      <input
                        type="text"
                        value={q.title}
                        onChange={(e) => {
                          const newQs = [...editableQuestions];
                          newQs[qIdx].title = e.target.value;
                          setEditableQuestions(newQs);
                        }}
                        placeholder={`مثال: المحطة ${qIdx + 1} - تحديد الفرض والطلب`}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 font-bold focus:bg-white focus:border-violet-500 outline-none text-xs"
                      />
                    </div>

                    {/* Prompt Text */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 text-xs flex items-center justify-between">
                        <span>نص السؤال الموجه ($...$ للمعادلات الرياضية):</span>
                      </label>
                      <textarea
                        rows={3}
                        value={q.prompt}
                        onChange={(e) => {
                          const newQs = [...editableQuestions];
                          newQs[qIdx].prompt = e.target.value;
                          setEditableQuestions(newQs);
                        }}
                        placeholder="اكتب السؤال الموجه الذي يرشد تفكير الطالب في هذه المحطة..."
                        className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl text-slate-900 font-medium focus:bg-white focus:border-violet-500 outline-none leading-relaxed text-xs resize-y min-h-[70px]"
                      />
                      {q.prompt && (
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-800">
                          <span className="text-[10px] font-bold text-gray-400 block mb-1">معاينة السؤال:</span>
                          <MathRenderer content={q.prompt} />
                        </div>
                      )}
                    </div>

                    {/* 4 Options with Resizable Multiline Textareas, Live Math Preview, and Diagnostics */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-emerald-600" />
                          <span>الخيارات الأربعة وتشخيص سوء الفهم لكل مشتت:</span>
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
                            title="عرض كامل واسع ومريح للخيارات والمعادلات الطويلة"
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

                      {/* Quick Symbols Bar for Math Options */}
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
                              // Append symbol to the first option or active option
                              const newQs = [...editableQuestions];
                              const curText = newQs[qIdx].options[0].text;
                              newQs[qIdx].options[0].text = curText ? `${curText} ${sym.val}` : sym.val;
                              setEditableQuestions(newQs);
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
                                  name={`correct-opt-${q.id || qIdx}`}
                                  checked={opt.isCorrect}
                                  onChange={() => {
                                    const newQs = [...editableQuestions];
                                    newQs[qIdx].options = newQs[qIdx].options.map((o, i) => ({
                                      ...o,
                                      isCorrect: i === optIdx
                                    }));
                                    setEditableQuestions(newQs);
                                  }}
                                  className="w-4 h-4 text-emerald-600 cursor-pointer"
                                />
                                <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                                  opt.isCorrect 
                                    ? 'bg-emerald-600 text-white shadow-xs' 
                                    : 'bg-slate-200 text-slate-700'
                                }`}>
                                  الخيار {String.fromCharCode(65 + optIdx)} ({['أ', 'ب', 'ج', 'د'][optIdx] || optIdx + 1})
                                </span>
                              </label>

                              {opt.isCorrect ? (
                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                                  <Check size={12} />
                                  <span>الإجابة الصحيحة المعتمدة</span>
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
                                <span className="text-[10px] text-violet-600 font-normal">مساحة كتابة مرنة وقابلة للتوسيع</span>
                              </label>
                              <textarea
                                rows={3}
                                value={opt.text}
                                onChange={(e) => {
                                  const newQs = [...editableQuestions];
                                  newQs[qIdx].options[optIdx].text = e.target.value;
                                  setEditableQuestions(newQs);
                                }}
                                className="w-full p-3 bg-white border border-gray-300 rounded-xl text-slate-900 font-medium text-xs sm:text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 outline-none resize-y min-h-[75px] leading-relaxed transition-all shadow-inner"
                                placeholder={`اكتب نص أو معادلات الخيار ${String.fromCharCode(65 + optIdx)} بالتفصيل...`}
                              />
                            </div>

                            {/* Live LaTeX Math Preview of the Option */}
                            {opt.text && opt.text.trim() !== '' && (
                              <div className="p-2.5 bg-white/90 rounded-xl border border-slate-200 text-xs text-slate-800 shadow-2xs space-y-1">
                                <span className="text-[10px] font-black text-slate-400 block">معاينة مباشرة لشكل الخيار:</span>
                                <div className="leading-relaxed">
                                  <MathRenderer content={opt.text} />
                                </div>
                              </div>
                            )}

                            {/* Misconception Diagnostic for this option */}
                            <div className="space-y-1 pt-1">
                              <label className="text-[10px] font-bold text-slate-500 block">
                                {opt.isCorrect ? 'رسالة التعزيز عند الصواب:' : 'تشخيص سبب خطأ الطالب عند اختيار هذا المشتت:'}
                              </label>
                              <input
                                type="text"
                                value={opt.misconceptionDiagnosis || ''}
                                onChange={(e) => {
                                  const newQs = [...editableQuestions];
                                  newQs[qIdx].options[optIdx].misconceptionDiagnosis = e.target.value;
                                  setEditableQuestions(newQs);
                                }}
                                placeholder={opt.isCorrect ? "مثال: رائع! قمت بالتعويض الصحيح وفق الخاصية..." : "مثال: انتبه إلى إشارة السالب عند نقل الحد..."}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 text-xs outline-none focus:border-violet-500 transition-colors"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Double Hint Ladder Fields & Skip Explanation */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2 border-t border-gray-100">
                      {/* Hint Level 1 */}
                      <div className="space-y-1">
                        <label className="font-bold text-amber-900 text-xs flex items-center gap-1">
                          <Lightbulb size={13} className="text-amber-600" />
                          <span>التلميح 1 (نقلة مفاهيمية عامة):</span>
                        </label>
                        <textarea
                          rows={2}
                          value={q.hintLevel1 || q.hint || ''}
                          onChange={(e) => {
                            const newQs = [...editableQuestions];
                            newQs[qIdx].hintLevel1 = e.target.value;
                            setEditableQuestions(newQs);
                          }}
                          placeholder="تلميح عام يوجه للقانون دون كشف الخطوة..."
                          className="w-full p-2 bg-amber-50/40 border border-amber-200 rounded-xl text-amber-950 text-xs focus:bg-white outline-none resize-y min-h-[50px]"
                        />
                      </div>

                      {/* Hint Level 2 */}
                      <div className="space-y-1">
                        <label className="font-bold text-indigo-900 text-xs flex items-center gap-1">
                          <Compass size={13} className="text-indigo-600" />
                          <span>التلميح 2 (قريب من الحل Bottom-out):</span>
                        </label>
                        <textarea
                          rows={2}
                          value={q.hintLevel2 || q.conceptMap || ''}
                          onChange={(e) => {
                            const newQs = [...editableQuestions];
                            newQs[qIdx].hintLevel2 = e.target.value;
                            setEditableQuestions(newQs);
                          }}
                          placeholder="تلميح مقرب من الخطوة الفعلية دون كتابتها..."
                          className="w-full p-2 bg-indigo-50/40 border border-indigo-200 rounded-xl text-indigo-950 text-xs focus:bg-white outline-none resize-y min-h-[50px]"
                        />
                      </div>

                      {/* Skip Explanation */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-800 text-xs flex items-center gap-1">
                          <FastForward size={13} className="text-slate-600" />
                          <span>شرح التفكير عند التخطي (سطران):</span>
                        </label>
                        <textarea
                          rows={2}
                          value={q.skipExplanation || ''}
                          onChange={(e) => {
                            const newQs = [...editableQuestions];
                            newQs[qIdx].skipExplanation = e.target.value;
                            setEditableQuestions(newQs);
                          }}
                          placeholder="موجز لكيفية التفكير دون إعطاء الجواب المباشر..."
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:bg-white outline-none resize-y min-h-[50px]"
                        />
                      </div>
                    </div>

                  </div>
                ))}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAdminEdits}
                className="px-6 py-2.5 bg-gradient-to-l from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>حفظ التعديلات في قاعدة البيانات</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
