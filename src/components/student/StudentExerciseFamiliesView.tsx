import React, { useState, useEffect, useMemo } from 'react';
import { 
  db, 
  type Document, 
  type LessonSection, 
  type PracticeExercise,
  addStudentTrainerPoints
} from '../../db';
import { 
  loadUnitExerciseFamilies, 
  type ClassifiedFamilyData, 
  type ClassifiedExercise, 
  type ClassifiedStation 
} from '../../db/exerciseFamiliesRPC';
import { MathRenderer } from '../MathRenderer';
import type { StudentAuthData } from '../AuthModal';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Star,
  Check,
  HelpCircle,
  Lightbulb,
  AlertTriangle,
  Award,
  Sparkles,
  Zap,
  Target,
  RotateCcw,
  Compass,
  Layers,
  Flame,
  CheckCircle,
  Eye,
  Info,
  Trophy,
  ArrowLeft,
  CheckSquare
} from 'lucide-react';

// Pool of randomized encouraging phrases for correct answers
const SUCCESS_PHRASES = [
  'رائع جداً! إجابة دقيقة ومنهجية رياضية ممتازة 👏',
  'إتقان مبهر! لقد وصلت إلى النتيجة الصحيحة ببراعة واقتدار ✨',
  'ممتاز! استيعابك للقانون والخطوات التنفيذية مثالي 🎯',
  'أحسنت صنعاً! تفكير رياضي منظّم وسليم بنسبة 100% 🌟',
  'إجابة نموذجية تُطابق سلم التصحيح الامتحاني المعتمد 🏆'
];

// Pool of randomized supportive phrases for incorrect answers
const MISCONCEPTION_PHRASES = [
  'محاولة جيدة! انتبه إلى نقطة الانحراف المفاهيمي التالية 🔍',
  'لا بأس! فلنتعلم من هذا المطب الحسابي والامتحاني لتجنبه لاحقاً 💡',
  'خطوة طيبة، راجع التشخيص أدناه لتدارك موضع الخطأ فوراً 📘',
  'هذا مطب امتحاني شائع يقع فيه الكثيرون، انتبه للفرق الدقيق ⚠️',
  'معرفة سبب الخطأ هي الخطوة الأولى للإتقان الكامل، إليك التوضيح 🧐'
];

export interface StudentExerciseState {
  status: 'not_started' | 'in_progress' | 'completed_first_try' | 'completed_with_help';
  currentStation: 1 | 2 | 3 | 4;
  hintsUsedStation1: number; // 0, 1, 2
  hintsUsedStation2: number; // 0, 1, 2
  hintsUsedStation3: number; // 0, 1, 2
  stationSelections?: Record<number, number>; // stationOrder -> selected choice index
  station4SelectedChoiceIndex: number | null;
  station4FirstTryCorrect: boolean | null;
  unlockedSolution: boolean;
  completedAt?: number;
  score: number;
}

export interface StudentFamilyState {
  visitedLead: boolean;
  exercises: Record<string, StudentExerciseState>;
  completedAt?: number;
  masteryScore?: number;
}

export interface StudentUnitFamiliesProgress {
  families: Record<string | number, StudentFamilyState>;
}

interface StudentExerciseFamiliesViewProps {
  document: Document;
  sections: LessonSection[];
  studentData: StudentAuthData;
  onAwardPoints?: (points: number, reason?: string) => Promise<void> | void;
}

type ViewStep = 'families_list' | 'lead_worked_example' | 'family_exercises' | 'active_station_trainer';

export const StudentExerciseFamiliesView: React.FC<StudentExerciseFamiliesViewProps> = ({
  document: currentDoc,
  sections,
  studentData,
  onAwardPoints
}) => {
  const [families, setFamilies] = useState<ClassifiedFamilyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFamilyId, setActiveFamilyId] = useState<string | number | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ViewStep>('families_list');
  const [activeStationOrder, setActiveStationOrder] = useState<1 | 2 | 3 | 4>(1);

  // Hints visibility toggles for the active station
  const [showHintLevel1, setShowHintLevel1] = useState(false);
  const [showHintLevel2, setShowHintLevel2] = useState(false);

  // Student progress store in LocalStorage for seamless instant persistence
  const storageKey = `math_educator_families_prog_${studentData.name}_${currentDoc.id || currentDoc.title}`;
  const [progress, setProgress] = useState<StudentUnitFamiliesProgress>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return { families: {} };
  });

  // Completion summary modal for a family
  const [completedFamilySummary, setCompletedFamilySummary] = useState<{
    family: ClassifiedFamilyData;
    firstTryCount: number;
    totalCount: number;
    masteryScore: number;
  } | null>(null);

  // Save progress helper
  const saveProgress = (newProg: StudentUnitFamiliesProgress) => {
    setProgress(newProg);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newProg));
    } catch (e) {
      console.error('Error saving student families progress:', e);
    }
  };

  // Load families for this unit
  useEffect(() => {
    let isMounted = true;
    const fetchFamilies = async () => {
      setLoading(true);
      try {
        let loaded = await loadUnitExerciseFamilies(currentDoc.id!);

        // If no families directly on this doc, find matching exercise document
        if (loaded.length === 0) {
          const matchingExerciseDocs = await db.documents
            .where('type')
            .equals('exercise')
            .toArray();

          const matchedDoc = matchingExerciseDocs.find(
            d => (d.unit && currentDoc.unit && d.unit.trim() === currentDoc.unit.trim()) ||
                 (d.title && currentDoc.title && d.title.trim() === currentDoc.title.trim()) ||
                 (d.unit && currentDoc.title && d.unit.trim() === currentDoc.title.trim())
          );

          if (matchedDoc && matchedDoc.id) {
            loaded = await loadUnitExerciseFamilies(matchedDoc.id);
          }
        }

        // Fallback: If no structured families exist in DB, synthesize from sections practice exercises
        if (loaded.length === 0) {
          const allExercises: PracticeExercise[] = [];
          sections.forEach(s => {
            if (s.practiceExercises && s.practiceExercises.length > 0) {
              allExercises.push(...s.practiceExercises);
            }
          });

          if (allExercises.length > 0) {
            // Group exercises by patternType or primary_concept
            const groups: Record<string, PracticeExercise[]> = {};
            allExercises.forEach(ex => {
              const groupKey = ex.patternType || ex.primary_concept || 'تطبيقات ومسائل عامة';
              if (!groups[groupKey]) groups[groupKey] = [];
              groups[groupKey].push(ex);
            });

            const syntheticFamilies: ClassifiedFamilyData[] = Object.entries(groups).map(([name, exList], idx) => {
              const leadEx = exList.find(e => e.is_lead_exercise) || exList[0];
              return {
                id: `synth_fam_${idx + 1}`,
                docId: currentDoc.id!,
                familyName: name,
                targetConcepts: [name, currentDoc.unit || ''],
                leadExerciseId: leadEx.id,
                exercises: exList.map((pe, peIdx) => {
                  const isLead = pe.id === leadEx.id;
                  const stations: ClassifiedStation[] = (pe.guidedQuestions || []).map((gq, gqIdx) => ({
                    stationOrder: (gq.questionOrder as 1 | 2 | 3 | 4) || ((gqIdx + 1) as 1 | 2 | 3 | 4),
                    title: gq.title || `المحطة ${gq.questionOrder || gqIdx + 1}`,
                    questionText: gq.prompt,
                    choices: gq.options || [],
                    correctChoiceIndex: gq.options?.findIndex(o => o.isCorrect) ?? 0,
                    hintText: gq.hint,
                    hintLevel1: gq.hintLevel1,
                    hintLevel2: gq.hintLevel2,
                    skipExplanation: gq.skipExplanation,
                    conceptMap: gq.conceptMap
                  }));

                  return {
                    id: pe.id,
                    title: pe.title || `تمرين ${peIdx + 1}`,
                    questionText: pe.questionText,
                    solutionText: pe.solutionText,
                    strategyText: pe.strategyText,
                    svgCode: pe.svgCode,
                    isLeadExercise: isLead,
                    primaryConcept: pe.primary_concept || name,
                    secondaryConcepts: pe.secondary_concepts || [],
                    stations: isLead ? [] : stations
                  };
                })
              };
            });

            loaded = syntheticFamilies;
          }
        }

        if (isMounted) {
          setFamilies(loaded);
        }
      } catch (err) {
        console.error('Error loading exercise families for student:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchFamilies();
    return () => { isMounted = false; };
  }, [currentDoc, sections]);

  // Current active family & exercise
  const activeFamily = useMemo(() => {
    if (!activeFamilyId) return null;
    return families.find(f => f.id === activeFamilyId) || null;
  }, [families, activeFamilyId]);

  const activeLeadExercise = useMemo(() => {
    if (!activeFamily) return null;
    return activeFamily.exercises.find(
      ex => ex.id === activeFamily.leadExerciseId || ex.isLeadExercise
    ) || activeFamily.exercises[0] || null;
  }, [activeFamily]);

  const activeAppliedExercises = useMemo(() => {
    if (!activeFamily) return [];
    return activeFamily.exercises.filter(
      ex => ex.id !== activeFamily.leadExerciseId && !ex.isLeadExercise
    );
  }, [activeFamily]);

  const activeExercise = useMemo(() => {
    if (!activeFamily || !activeExerciseId) return null;
    return activeFamily.exercises.find(ex => ex.id === activeExerciseId) || null;
  }, [activeFamily, activeExerciseId]);

  // Handle entering a family
  const handleSelectFamily = (fam: ClassifiedFamilyData) => {
    setActiveFamilyId(fam.id!);
    const famState = progress.families[fam.id!];

    // Rule: Step 1 (Worked Example) is mandatory on first visit, optional afterwards
    if (!famState || !famState.visitedLead) {
      setCurrentStep('lead_worked_example');
    } else {
      setCurrentStep('family_exercises');
    }
  };

  // Step 1 -> Step 2: "فهمت الطريقة، ابدأ التطبيق ←"
  const handleAcknowledgeLeadExample = () => {
    if (!activeFamily) return;
    const famId = activeFamily.id!;
    const famState = progress.families[famId] || {
      visitedLead: true,
      exercises: {}
    };

    const newProg: StudentUnitFamiliesProgress = {
      ...progress,
      families: {
        ...progress.families,
        [famId]: {
          ...famState,
          visitedLead: true
        }
      }
    };
    saveProgress(newProg);
    setCurrentStep('family_exercises');
  };

  // Step 2 -> Step 3: Select an applied exercise
  const handleSelectExercise = (ex: ClassifiedExercise) => {
    if (!activeFamily) return;
    setActiveExerciseId(ex.id);
    setShowHintLevel1(false);
    setShowHintLevel2(false);

    const famId = activeFamily.id!;
    const famState = progress.families[famId] || { visitedLead: true, exercises: {} };
    const exState = famState.exercises[ex.id];

    if (exState && exState.currentStation) {
      setActiveStationOrder(exState.currentStation);
    } else {
      setActiveStationOrder(1);
      const initialExState: StudentExerciseState = {
        status: 'in_progress',
        currentStation: 1,
        hintsUsedStation1: 0,
        hintsUsedStation2: 0,
        hintsUsedStation3: 0,
        stationSelections: {},
        station4SelectedChoiceIndex: null,
        station4FirstTryCorrect: null,
        unlockedSolution: false,
        score: 0
      };

      const newProg: StudentUnitFamiliesProgress = {
        ...progress,
        families: {
          ...progress.families,
          [famId]: {
            ...famState,
            exercises: {
              ...famState.exercises,
              [ex.id]: initialExState
            }
          }
        }
      };
      saveProgress(newProg);
    }

    setCurrentStep('active_station_trainer');
  };

  // Station Hints Toggle & Tracking
  const handleUseHint = (level: 1 | 2) => {
    if (!activeFamily || !activeExercise) return;
    const famId = activeFamily.id!;
    const exId = activeExercise.id;
    const famState = progress.families[famId] || { visitedLead: true, exercises: {} };
    const exState = famState.exercises[exId] || {
      status: 'in_progress',
      currentStation: activeStationOrder,
      hintsUsedStation1: 0,
      hintsUsedStation2: 0,
      hintsUsedStation3: 0,
      stationSelections: {},
      station4SelectedChoiceIndex: null,
      station4FirstTryCorrect: null,
      unlockedSolution: false,
      score: 0
    };

    if (level === 1) {
      setShowHintLevel1(true);
      if (activeStationOrder === 1 && exState.hintsUsedStation1 < 1) exState.hintsUsedStation1 = 1;
      if (activeStationOrder === 2 && exState.hintsUsedStation2 < 1) exState.hintsUsedStation2 = 1;
      if (activeStationOrder === 3 && exState.hintsUsedStation3 < 1) exState.hintsUsedStation3 = 1;
    } else {
      setShowHintLevel2(true);
      if (activeStationOrder === 1) exState.hintsUsedStation1 = 2;
      if (activeStationOrder === 2) exState.hintsUsedStation2 = 2;
      if (activeStationOrder === 3) exState.hintsUsedStation3 = 2;
    }

    const newProg: StudentUnitFamiliesProgress = {
      ...progress,
      families: {
        ...progress.families,
        [famId]: {
          ...famState,
          exercises: {
            ...famState.exercises,
            [exId]: exState
          }
        }
      }
    };
    saveProgress(newProg);
  };

  // Station navigation
  const handleGoToStation = (stationOrder: 1 | 2 | 3 | 4) => {
    if (!activeFamily || !activeExercise) return;
    setActiveStationOrder(stationOrder);
    setShowHintLevel1(false);
    setShowHintLevel2(false);

    const famId = activeFamily.id!;
    const exId = activeExercise.id;
    const famState = progress.families[famId] || { visitedLead: true, exercises: {} };
    const exState = famState.exercises[exId];

    if (exState && exState.status === 'in_progress') {
      const newProg: StudentUnitFamiliesProgress = {
        ...progress,
        families: {
          ...progress.families,
          [famId]: {
            ...famState,
            exercises: {
              ...famState.exercises,
              [exId]: {
                ...exState,
                currentStation: stationOrder
              }
            }
          }
        }
      };
      saveProgress(newProg);
    }
  };

  // Station 1, 2, or 3 Choice Selection
  const handleSelectStationChoice = (stationOrder: 1 | 2 | 3, choiceIndex: number) => {
    if (!activeFamily || !activeExercise) return;
    const famId = activeFamily.id!;
    const exId = activeExercise.id;

    const famState = progress.families[famId] || { visitedLead: true, exercises: {} };
    const prevExState = famState.exercises[exId] || {
      status: 'in_progress',
      currentStation: stationOrder,
      hintsUsedStation1: 0,
      hintsUsedStation2: 0,
      hintsUsedStation3: 0,
      stationSelections: {},
      station4SelectedChoiceIndex: null,
      station4FirstTryCorrect: null,
      unlockedSolution: false,
      score: 0
    };

    const currentSelections = { ...(prevExState.stationSelections || {}) };
    currentSelections[stationOrder] = choiceIndex;

    const updatedExState: StudentExerciseState = {
      ...prevExState,
      stationSelections: currentSelections
    };

    const newProg: StudentUnitFamiliesProgress = {
      ...progress,
      families: {
        ...progress.families,
        [famId]: {
          ...famState,
          exercises: {
            ...famState.exercises,
            [exId]: updatedExState
          }
        }
      }
    };
    saveProgress(newProg);
  };

  // Station 4: Selection with INSTANT UNLOCK & Points Calculation
  const handleSelectStation4Choice = async (choiceIndex: number) => {
    if (!activeFamily || !activeExercise) return;
    const famId = activeFamily.id!;
    const exId = activeExercise.id;

    const station4 = activeExercise.stations?.find(s => s.stationOrder === 4);
    if (!station4 || !station4.choices) return;

    const chosen = station4.choices[choiceIndex];
    const isCorrect = !!chosen?.isCorrect;

    const famState = progress.families[famId] || { visitedLead: true, exercises: {} };
    const prevExState = famState.exercises[exId];

    const isFirstTime = !prevExState || prevExState.station4FirstTryCorrect === null;
    const firstTryCorrect = isFirstTime ? isCorrect : prevExState?.station4FirstTryCorrect;

    const totalHints = (prevExState?.hintsUsedStation1 || 0) + 
                       (prevExState?.hintsUsedStation2 || 0) + 
                       (prevExState?.hintsUsedStation3 || 0);

    const finalStatus = (firstTryCorrect && totalHints === 0)
      ? 'completed_first_try'
      : 'completed_with_help';

    const pointsToAward = finalStatus === 'completed_first_try' ? 25 : 15;

    // Award points only on first completion
    if (isFirstTime) {
      try {
        await addStudentTrainerPoints(
          studentData.name,
          studentData.grade,
          studentData.subject,
          currentDoc.unit || currentDoc.title,
          pointsToAward
        );
        if (onAwardPoints) {
          onAwardPoints(pointsToAward, activeFamily.familyName);
        }
      } catch (err) {
        console.error('Error awarding points to student:', err);
      }
    }

    const currentSelections = { ...(prevExState?.stationSelections || {}) };
    currentSelections[4] = choiceIndex;

    const updatedExState: StudentExerciseState = {
      status: finalStatus,
      currentStation: 4,
      hintsUsedStation1: prevExState?.hintsUsedStation1 || 0,
      hintsUsedStation2: prevExState?.hintsUsedStation2 || 0,
      hintsUsedStation3: prevExState?.hintsUsedStation3 || 0,
      stationSelections: currentSelections,
      station4SelectedChoiceIndex: choiceIndex,
      station4FirstTryCorrect: firstTryCorrect ?? isCorrect,
      unlockedSolution: true,
      completedAt: Date.now(),
      score: finalStatus === 'completed_first_try' ? 100 : 70
    };

    const updatedFamExercises = {
      ...famState.exercises,
      [exId]: updatedExState
    };

    // Check if entire family is now completed
    const appliedExList = activeFamily.exercises.filter(
      e => e.id !== activeFamily.leadExerciseId && !e.isLeadExercise
    );
    const allCompleted = appliedExList.every(
      e => updatedFamExercises[e.id]?.status === 'completed_first_try' || updatedFamExercises[e.id]?.status === 'completed_with_help'
    );

    let familyMastery = 0;
    if (allCompleted && appliedExList.length > 0) {
      const firstTryCount = appliedExList.filter(
        e => updatedFamExercises[e.id]?.status === 'completed_first_try'
      ).length;
      familyMastery = Math.round((firstTryCount / appliedExList.length) * 100);

      // Trigger Celebration Summary Modal
      setCompletedFamilySummary({
        family: activeFamily,
        firstTryCount,
        totalCount: appliedExList.length,
        masteryScore: familyMastery
      });
    }

    const newProg: StudentUnitFamiliesProgress = {
      ...progress,
      families: {
        ...progress.families,
        [famId]: {
          ...famState,
          exercises: updatedFamExercises,
          completedAt: allCompleted ? Date.now() : famState.completedAt,
          masteryScore: allCompleted ? familyMastery : famState.masteryScore
        }
      }
    };
    saveProgress(newProg);
  };

  // Randomized messages helper
  const randomSuccessPhrase = useMemo(() => {
    return SUCCESS_PHRASES[Math.floor(Math.random() * SUCCESS_PHRASES.length)];
  }, [activeExerciseId, activeStationOrder]);

  const randomMisconceptionPhrase = useMemo(() => {
    return MISCONCEPTION_PHRASES[Math.floor(Math.random() * MISCONCEPTION_PHRASES.length)];
  }, [activeExerciseId, activeStationOrder]);

  // Loading State
  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs space-y-4" dir="rtl">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto animate-spin">
          <Layers size={24} />
        </div>
        <h3 className="text-base font-black text-slate-800">جاري تحميل عائلات التمارين والمسائل ومحطات الحل...</h3>
        <p className="text-xs text-slate-500 font-medium">يتم تجهيز الأمثلة المرجعية والمحطات الأربع وفق المنهاج السوري</p>
      </div>
    );
  }

  // No families found state
  if (families.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-slate-200 shadow-xs space-y-4" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto">
          <BookOpen size={32} />
        </div>
        <h3 className="text-lg font-black text-slate-900">
          تمرينات ومسائل الوحدة ({currentDoc.unit || currentDoc.title})
        </h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed font-arabic">
          لم يتم تصنيف عائلات التمارين لهذه الوحدة بعد من قبل المعلم. يمكنك مراجعة شروحات الدروس وتدريباتها أو العودة لاحقاً.
        </p>
      </div>
    );
  }

  // ==========================================
  // VIEW: STEP 0 — ALL FAMILIES LIST
  // ==========================================
  if (currentStep === 'families_list') {
    return (
      <div className="space-y-6 animate-fade-in" dir="rtl">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-violet-700 via-indigo-700 to-indigo-900 text-white rounded-3xl p-6 shadow-md border border-indigo-950/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-violet-100 text-xs font-bold border border-white/20">
                  خريطة عائلات التمارين
                </span>
                <span className="text-xs text-indigo-200 font-medium">
                  {currentDoc.unit || currentDoc.title}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                تمرينات ومسائل الوحدة: التعلم القائم على العائلات
              </h2>
              <p className="text-xs sm:text-sm text-violet-200 font-medium max-w-2xl leading-relaxed font-arabic">
                ادرس أولاً <strong className="text-amber-300 font-bold">المثال المرجعي المحلول (Worked Example)</strong> لكل عائلة، ثم انطلق لحل التمارين التطبيقية عبر المحطات الأربع مع الأسئلة الموجهة والخيارات التفاعلية.
              </p>
            </div>

            {/* Quick Stats Pill */}
            <div className="bg-black/20 backdrop-blur-md rounded-2xl p-4 border border-white/15 shrink-0 flex items-center gap-4">
              <div className="text-center">
                <span className="text-[11px] text-violet-200 font-bold block">إجمالي العائلات</span>
                <span className="text-xl font-black text-white">{families.length}</span>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div className="text-center">
                <span className="text-[11px] text-amber-200 font-bold block">المكتملة</span>
                <span className="text-xl font-black text-amber-300">
                  {families.filter(f => {
                    const famState = progress.families[f.id!];
                    if (!famState) return false;
                    const applied = f.exercises.filter(e => e.id !== f.leadExerciseId && !e.isLeadExercise);
                    return applied.length > 0 && applied.every(e => 
                      famState.exercises[e.id]?.status === 'completed_first_try' || famState.exercises[e.id]?.status === 'completed_with_help'
                    );
                  }).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Families Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {families.map((fam, famIdx) => {
            const famState = progress.families[fam.id!];
            const appliedExercises = fam.exercises.filter(
              e => e.id !== fam.leadExerciseId && !e.isLeadExercise
            );
            const totalCount = appliedExercises.length;
            const completedCount = appliedExercises.filter(
              e => famState?.exercises[e.id]?.status === 'completed_first_try' || famState?.exercises[e.id]?.status === 'completed_with_help'
            ).length;
            const firstTryCount = appliedExercises.filter(
              e => famState?.exercises[e.id]?.status === 'completed_first_try'
            ).length;

            const isCompleted = totalCount > 0 && completedCount === totalCount;
            const isInProgress = completedCount > 0 && !isCompleted;
            const isNotStarted = completedCount === 0;

            const uncompletedPrereq = sections.find(sec => 
              fam.targetConcepts.some(c => sec.title.includes(c) || c.includes(sec.title))
            );

            return (
              <div
                key={fam.id || famIdx}
                onClick={() => handleSelectFamily(fam)}
                className={`group bg-white rounded-3xl p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-xs hover:shadow-md ${
                  isCompleted
                    ? 'border-emerald-300 hover:border-emerald-400 bg-emerald-50/20'
                    : isInProgress
                    ? 'border-indigo-300 hover:border-indigo-500 bg-indigo-50/15'
                    : 'border-slate-200 hover:border-violet-400'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 h-7 rounded-xl bg-violet-100 text-violet-800 text-xs font-black flex items-center justify-center">
                        {famIdx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        عائلة تمارين
                      </span>
                    </div>

                    {isCompleted ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-black flex items-center gap-1">
                        <Sparkles size={12} className="text-emerald-600" />
                        مكتملة بنجاح ({firstTryCount}/{totalCount} 🌟)
                      </span>
                    ) : isInProgress ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-xs font-black flex items-center gap-1">
                        <Target size={12} className="text-amber-700" />
                        قيد التقدّم ({completedCount}/{totalCount})
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold">
                        لم تبدأ بعد
                      </span>
                    )}
                  </div>

                  {/* Family Name */}
                  <div>
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-violet-700 transition-colors">
                      {fam.familyName}
                    </h3>
                  </div>

                  {/* Target Concepts Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {fam.targetConcepts.map((c, cIdx) => (
                      <span
                        key={cIdx}
                        className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold"
                      >
                        🏷️ {c}
                      </span>
                    ))}
                  </div>

                  {/* Non-Blocking Advisory Banner */}
                  {uncompletedPrereq && isNotStarted && (
                    <div 
                      onClick={(e) => e.stopPropagation()} 
                      className="bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900 font-arabic flex items-start gap-2"
                    >
                      <Lightbulb size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">نصيحة مسار التعلم: </span>
                        <span>يُفضَّل مراجعة درس <strong>{uncompletedPrereq.title}</strong> قبل البدء بهذه العائلة لضمان أقصى درجات الإتقان.</span>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>التقدّم في التمارين التطبيقية</span>
                      <span>{completedCount} من {totalCount} تمرين</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isCompleted
                            ? 'bg-emerald-500'
                            : isInProgress
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
                            : 'bg-slate-300'
                        }`}
                        style={{
                          width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-bold">
                    {famState?.visitedLead ? '✓ تمت دراسة المثال المرجعي' : '📘 يحتوي مثالاً مرجعياً محلولاً'}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-black text-violet-600 group-hover:text-violet-800 group-hover:translate-x-[-3px] transition-all">
                    <span>
                      {isCompleted ? 'مراجعة العائلة' : isInProgress ? 'متابعة التطبيق' : 'بدء العائلة'}
                    </span>
                    <ChevronLeft size={16} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==========================================================
  // VIEW: STEP 1 — WORKED EXAMPLE (المثال المرجعي المحلول)
  // ==========================================================
  if (currentStep === 'lead_worked_example' && activeFamily) {
    return (
      <div className="space-y-6 animate-fade-in" dir="rtl">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <button
            onClick={() => setCurrentStep('families_list')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            <ArrowRight size={16} />
            <span>العودة لقائمة العائلات</span>
          </button>

          <div className="text-center">
            <span className="text-[11px] text-slate-400 font-bold block">عائلة التمارين</span>
            <span className="text-sm font-black text-slate-900">{activeFamily.familyName}</span>
          </div>

          <div className="text-xs font-bold text-violet-700 bg-violet-50 px-3 py-1.5 rounded-xl border border-violet-200">
            📘 الخطوة 1: المثال المرجعي المحلول
          </div>
        </div>

        {/* Lead Worked Example Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-200 shadow-sm space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
                <Star size={24} className="text-amber-200 fill-amber-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-white/20 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                    نموذج الفهم والمحاكاة (Worked Example)
                  </span>
                  <span className="text-amber-100 text-xs font-medium">ليس اختباراً — الهدف هنا الدراسة والتحليل</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                  المثال المرجعي: {activeLeadExercise?.title || 'المسألة النموذجية'}
                </h3>
              </div>
            </div>
          </div>

          {/* Question Text */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-black text-slate-700">
              <BookOpen size={16} className="text-indigo-600" />
              <span>نص التمرين المرجعي:</span>
            </div>
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-slate-900 text-sm sm:text-base leading-relaxed font-arabic">
              <MathRenderer content={activeLeadExercise?.questionText || 'نص التمرين غير متوفر'} />
            </div>
          </div>

          {/* Strategy / Core Idea */}
          {activeLeadExercise?.strategyText && (
            <div className="bg-indigo-50/80 border border-indigo-200/90 rounded-2xl p-5 text-indigo-950 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-indigo-900">
                <Lightbulb size={18} className="text-indigo-600" />
                <span>استراتيجية وطريقة التفكير المرجعية:</span>
              </div>
              <div className="text-xs sm:text-sm text-indigo-900 leading-relaxed font-arabic">
                <MathRenderer content={activeLeadExercise.strategyText} />
              </div>
            </div>
          )}

          {/* Complete Detailed Solution */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-black text-emerald-800">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>الحل المفصل والنموذجي بالخطوات الكاملة (سلم التصحيح المعتمد):</span>
            </div>
            <div className="bg-emerald-50/40 p-6 rounded-2xl border border-emerald-200/80 text-slate-800 text-sm sm:text-base leading-relaxed font-arabic space-y-3">
              <MathRenderer content={activeLeadExercise?.solutionText || 'الحل النموذجي قيد التوثيق.'} />
            </div>
          </div>

          {/* SVG Illustration if available */}
          {activeLeadExercise?.svgCode && (
            <div
              className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-center"
              dangerouslySetInnerHTML={{ __html: activeLeadExercise.svgCode }}
            />
          )}

          {/* Bottom Action Button */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500 font-medium font-arabic">
              💡 بعد استيعابك للمثال المرجعي، انتقل لتطبيق نفس الاستراتيجية على بقية تمارين العائلة عبر محطات التفكير التفاعلية.
            </p>

            <button
              onClick={handleAcknowledgeLeadExample}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-700 hover:to-indigo-800 text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <span>فهمت الطريقة، ابدأ التطبيق</span>
              <ArrowLeft size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // VIEW: STEP 2 — FAMILY EXERCISES LIST (قائمة التمارين التطبيقية)
  // ==========================================================
  if (currentStep === 'family_exercises' && activeFamily) {
    const appliedExercises = activeAppliedExercises;
    const famState = progress.families[activeFamily.id!];

    return (
      <div className="space-y-6 animate-fade-in" dir="rtl">
        {/* Top Navigation & Info Header */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep('families_list')}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                title="العودة لكافة العائلات"
              >
                <ArrowRight size={18} />
              </button>
              <div>
                <span className="text-[11px] text-violet-700 font-black px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200">
                  تمارين العائلة التطبيقية
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-1">
                  {activeFamily.familyName}
                </h2>
              </div>
            </div>

            {/* Link back to Worked Example */}
            <button
              onClick={() => setCurrentStep('lead_worked_example')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-black transition-all cursor-pointer"
            >
              <Star size={15} className="text-amber-600 fill-amber-500" />
              <span>مراجعة المثال المرجعي المحلول</span>
            </button>
          </div>

          {/* Target Concepts */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500">المفاهيم المستهدفة:</span>
            {activeFamily.targetConcepts.map((c, idx) => (
              <span key={idx} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Exercises Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {appliedExercises.map((ex, idx) => {
            const exState = famState?.exercises[ex.id];
            const status = exState?.status || 'not_started';

            return (
              <div
                key={ex.id || idx}
                onClick={() => handleSelectExercise(ex)}
                className={`bg-white rounded-3xl p-5 border transition-all cursor-pointer flex flex-col justify-between shadow-xs hover:shadow-md ${
                  status === 'completed_first_try'
                    ? 'border-emerald-300 bg-emerald-50/20 hover:border-emerald-400'
                    : status === 'completed_with_help'
                    ? 'border-indigo-300 bg-indigo-50/15 hover:border-indigo-400'
                    : status === 'in_progress'
                    ? 'border-amber-300 bg-amber-50/15 hover:border-amber-400'
                    : 'border-slate-200 hover:border-violet-300'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-black">
                      تمرين تطبيقي {idx + 1}
                    </span>

                    {status === 'completed_first_try' ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black border border-emerald-200 flex items-center gap-1">
                        <Sparkles size={11} className="text-emerald-600" />
                        إتقان من المحاولة الأولى 🌟 (25 نقطة)
                      </span>
                    ) : status === 'completed_with_help' ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-black border border-indigo-200 flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-indigo-600" />
                        مكتمل مع التوجيه (15 نقطة)
                      </span>
                    ) : status === 'in_progress' ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-black border border-amber-200">
                        قيد الحل (المحطة {exState?.currentStation || 1})
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
                        لم يبدأ
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-black text-slate-900">
                    {ex.title || `تطبيق ${idx + 1}`}
                  </h3>

                  <div className="text-xs text-slate-600 line-clamp-3 font-arabic">
                    <MathRenderer content={ex.questionText} />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">
                    {ex.stations?.length || 4} محطات تفكير موجهة
                  </span>
                  <button className="flex items-center gap-1 text-xs font-black text-violet-600 group-hover:text-violet-800">
                    <span>
                      {status === 'completed_first_try' || status === 'completed_with_help'
                        ? 'مراجعة الحل والمحطات'
                        : status === 'in_progress'
                        ? `استئناف (المحطة ${exState?.currentStation || 1})`
                        : 'بدء الحل والمحطات'}
                    </span>
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==========================================================
  // VIEW: STEP 3 — 4-STATION GUIDED TRAINER
  // ==========================================================
  if (currentStep === 'active_station_trainer' && activeFamily && activeExercise) {
    const famState = progress.families[activeFamily.id!];
    const exState = famState?.exercises[activeExercise.id];

    const currentStation = activeExercise.stations?.find(s => s.stationOrder === activeStationOrder);
    const stationChoices = currentStation?.choices || [];
    const hasChoices = stationChoices.length > 0;

    const currentSelectedChoiceIdx = activeStationOrder === 4 
      ? exState?.station4SelectedChoiceIndex ?? exState?.stationSelections?.[4] ?? null
      : exState?.stationSelections?.[activeStationOrder] ?? null;

    const selectedChoice = typeof currentSelectedChoiceIdx === 'number' ? stationChoices[currentSelectedChoiceIdx] : null;
    const isStationAnswered = typeof currentSelectedChoiceIdx === 'number';
    const isStationCorrect = selectedChoice?.isCorrect ?? false;

    return (
      <div className="space-y-6 animate-fade-in" dir="rtl">
        {/* Top Sub-navigation Bar */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep('family_exercises')}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
              title="العودة لقائمة تمارين العائلة"
            >
              <ArrowRight size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200">
                  {activeFamily.familyName}
                </span>
                <span className="text-xs text-slate-400 font-bold">تطبيق موجه</span>
              </div>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                {activeExercise.title || 'التمرين التطبيقي'}
              </h3>
            </div>
          </div>

          {/* Station Step Indicator Buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl shrink-0 overflow-x-auto">
            {[1, 2, 3, 4].map(num => {
              const isActive = activeStationOrder === num;
              const isStationDone = num === 4 ? !!exState?.unlockedSolution : typeof exState?.stationSelections?.[num] === 'number';

              return (
                <button
                  key={num}
                  onClick={() => handleGoToStation(num as 1 | 2 | 3 | 4)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-xs'
                      : isStationDone
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>المحطة {num}</span>
                  {isStationDone && <Check size={12} className="text-emerald-700" />}
                  {num === 4 && <span className="text-[10px]">🎯</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pinned Exercise Question Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-slate-700">
            <BookOpen size={16} className="text-indigo-600" />
            <span>نص المسألة الأصلي:</span>
          </div>
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 text-sm text-slate-900 leading-relaxed font-arabic">
            <MathRenderer content={activeExercise.questionText} />
          </div>
        </div>

        {/* ACTIVE STATION CONTAINER */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          
          {/* Station Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white font-black flex items-center justify-center shadow-xs text-sm">
                {activeStationOrder}
              </span>
              <div>
                <h4 className="text-base font-black text-slate-900">
                  {activeStationOrder === 1 && 'المحطة 1: الاستكشاف وتشخيص النمط الرياضي'}
                  {activeStationOrder === 2 && 'المحطة 2: اختيار الأداة والقانون المنطلق'}
                  {activeStationOrder === 3 && 'المحطة 3: الخطوة التنفيذية المفصلية الأولى'}
                  {activeStationOrder === 4 && 'المحطة 4: الناتج النهائي والتحقق (4 خيارات MCQ)'}
                </h4>
                <p className="text-xs text-slate-500 font-medium font-arabic">
                  {hasChoices
                    ? 'اختر الإجابة الصحيحة أو حدد العبارة الصائبة لتأكيد فهم هذه الخطوة التوجيهية'
                    : 'فكر في هذا السؤال التوجيهي، ويمكنك الاستعانة بسلم التلميحات عند الحاجة'}
                </p>
              </div>
            </div>

            {/* Station Status Badge */}
            {activeStationOrder === 4 && exState?.unlockedSolution ? (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-200">
                ✓ تم فتح الحل والتوثيق
              </span>
            ) : isStationAnswered && isStationCorrect ? (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-200">
                ✓ خطوة صحيحة
              </span>
            ) : null}
          </div>

          {/* Station Prompt / Question Content */}
          <div className="space-y-3">
            <div className="text-xs font-black text-slate-500">سؤال المحطة التوجيهي:</div>
            <div className="bg-indigo-50/40 p-5 rounded-2xl border border-indigo-100 text-sm sm:text-base text-slate-800 leading-relaxed font-arabic">
              <MathRenderer content={currentStation?.questionText || 'ما هي الخطوة التفكيرية المناسبة في هذه المرحلة؟'} />
            </div>
          </div>

          {/* ========================================================== */}
          {/* INTERACTIVE CHOICES (FOR ANY STATION: 1, 2, 3, OR 4)        */}
          {/* ========================================================== */}
          {hasChoices && (
            <div className="space-y-4 pt-2">
              <div className="text-xs font-black text-slate-600">
                {stationChoices.length === 2 && stationChoices.some(c => c.text.includes('صح') || c.text.includes('صائبة') || c.text.includes('خطأ'))
                  ? 'اختر (صح أو خطأ) بالنسبة للعبارة التوجيهية أعلاه:'
                  : `اختر الإجابة المقترحة الصحيحة من الخيارات (${stationChoices.length} خيارات):`}
              </div>

              {/* Choices Grid */}
              <div className={`grid gap-3.5 ${stationChoices.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : activeStationOrder === 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {stationChoices.map((choice, cIdx) => {
                  const isSelected = currentSelectedChoiceIdx === cIdx;
                  const isCorrect = choice.isCorrect;
                  const isUnlockedStation4 = activeStationOrder === 4 && !!exState?.unlockedSolution;

                  return (
                    <div
                      key={choice.id || cIdx}
                      onClick={() => {
                        if (activeStationOrder === 4) {
                          if (!isUnlockedStation4) handleSelectStation4Choice(cIdx);
                        } else {
                          handleSelectStationChoice(activeStationOrder as 1 | 2 | 3, cIdx);
                        }
                      }}
                      className={`p-4 rounded-2xl border text-right transition-all font-arabic cursor-pointer ${
                        isSelected && isCorrect
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs'
                          : isSelected && !isCorrect
                          ? 'bg-rose-50 border-rose-400 text-rose-950 shadow-xs'
                          : isUnlockedStation4 && isCorrect
                          ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
                          : 'bg-white hover:bg-violet-50/50 hover:border-violet-400 border-slate-200 shadow-2xs hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          isSelected && isCorrect
                            ? 'bg-emerald-600 text-white'
                            : isSelected && !isCorrect
                            ? 'bg-rose-600 text-white'
                            : isUnlockedStation4 && isCorrect
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {['أ', 'ب', 'ج', 'د'][cIdx] || cIdx + 1}
                        </span>

                        {isSelected && (
                          <div>
                            {isCorrect ? (
                              <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded-md font-bold">
                                ✓ إجابة صحيحة
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] rounded-md font-bold">
                                ✗ اختيار خاطئ
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Choice Text */}
                      <div className="text-xs sm:text-sm font-bold text-slate-900">
                        <MathRenderer content={choice.text} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Instant Feedback on Selected Choice */}
              {isStationAnswered && (
                <div className="pt-2 animate-fade-in">
                  {isStationCorrect ? (
                    <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-emerald-950 space-y-1">
                      <div className="flex items-center gap-2 font-black text-emerald-900 text-sm">
                        <Sparkles size={18} className="text-emerald-600" />
                        <span>{randomSuccessPhrase}</span>
                      </div>
                      <p className="text-xs text-emerald-800 font-medium font-arabic">
                        {activeStationOrder < 4 
                          ? 'خطوة ممتازة! يمكنك الآن الانتقال للمحطة التالية بثقة.' 
                          : 'تم اعتماد إجابتك وحساب نقاطك بنجاح! راجع الحل التفصيلي الكامل أدناه.'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-amber-950 space-y-2">
                      <div className="flex items-center gap-2 font-black text-amber-900 text-sm">
                        <AlertTriangle size={18} className="text-amber-600" />
                        <span>{randomMisconceptionPhrase}</span>
                      </div>
                      
                      {/* Misconception diagnosis if available */}
                      {selectedChoice?.misconceptionDiagnosis && (
                        <div className="bg-white/80 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 font-arabic leading-relaxed">
                          <span className="font-bold text-amber-800">تشخيص سبب الخطأ في خيارك: </span>
                          <MathRenderer content={selectedChoice.misconceptionDiagnosis} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* HINTS ACCORDION & NAVIGATION FOR STATIONS 1, 2, 3          */}
          {/* ========================================================== */}
          {activeStationOrder < 4 && (
            <div className="space-y-4 pt-2">
              {/* Hints Box */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {!showHintLevel1 ? (
                    <button
                      onClick={() => handleUseHint(1)}
                      className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Lightbulb size={15} className="text-amber-600" />
                      <span>طلب تلميح المستوى 1 (نقلة مفاهيمية)</span>
                    </button>
                  ) : null}

                  {showHintLevel1 && !showHintLevel2 ? (
                    <button
                      onClick={() => handleUseHint(2)}
                      className="px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-200 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Compass size={15} className="text-orange-600" />
                      <span>طلب تلميح المستوى 2 (مساعد متقدم)</span>
                    </button>
                  ) : null}
                </div>

                {/* Level 1 Hint Box */}
                {showHintLevel1 && (
                  <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 text-xs sm:text-sm text-amber-950 space-y-1 animate-fade-in font-arabic leading-relaxed">
                    <span className="font-bold text-amber-800 block">💡 تلميح المستوى 1:</span>
                    <MathRenderer content={currentStation?.hintLevel1 || currentStation?.hintText || 'تذكر شروط انطلاق المفهوم والقانون الأساسي في المنهاج السوري.'} />
                  </div>
                )}

                {/* Level 2 Hint Box */}
                {showHintLevel2 && (
                  <div className="bg-orange-50 border border-orange-200/90 rounded-2xl p-4 text-xs sm:text-sm text-orange-950 space-y-1 animate-fade-in font-arabic leading-relaxed">
                    <span className="font-bold text-orange-800 block">🔍 تلميح المستوى 2:</span>
                    <MathRenderer content={currentStation?.hintLevel2 || 'طبق القاعدة الحسابية مباشرة وانتبه للإشارات والتعويض الدقيق.'} />
                  </div>
                )}
              </div>

              {/* Next Station Navigation CTA */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  {isStationAnswered && isStationCorrect ? '✓ تم إتقان المحطة' : 'يمكنك متابعة المحطات الأربع'}
                </span>
                <button
                  onClick={() => handleGoToStation((activeStationOrder + 1) as 1 | 2 | 3 | 4)}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>انتقل إلى المحطة {activeStationOrder + 1}</span>
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* STATION 4: INSTANT DETAILED SOLUTION DISPLAY & PROCEEDING  */}
          {/* ========================================================== */}
          {activeStationOrder === 4 && exState?.unlockedSolution && (
            <div className="space-y-5 animate-fade-in pt-4 border-t border-slate-100">
              
              {/* Detailed Solution Display */}
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>الحل التفصيلي الكامل للتمرين (النموذج المرجعي):</span>
                </div>
                <div className="text-xs sm:text-sm text-slate-800 font-arabic leading-relaxed space-y-3">
                  <MathRenderer content={activeExercise.solutionText || 'الحل الكامل موثق بخطوات الحل النموذجية.'} />
                </div>
              </div>

              {/* Actions after solving */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => setCurrentStep('family_exercises')}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check size={16} />
                  <span>العودة لقائمة تمارين العائلة</span>
                </button>

                {/* Next exercise if exists */}
                {(() => {
                  const applied = activeAppliedExercises;
                  const currentIdx = applied.findIndex(e => e.id === activeExercise.id);
                  if (currentIdx >= 0 && currentIdx < applied.length - 1) {
                    const nextEx = applied[currentIdx + 1];
                    return (
                      <button
                        onClick={() => handleSelectExercise(nextEx)}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>الانتقال للتمرين التالي ({nextEx.title || `تطبيق ${currentIdx + 2}`})</span>
                        <ChevronLeft size={16} />
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ==========================================================
  // VIEW: STEP 4 — FAMILY COMPLETION SUMMARY MODAL
  // ==========================================================
  return (
    <>
      {completedFamilySummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 space-y-6 p-6 sm:p-8 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <Trophy size={32} />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                🎉 إنجاز عائلة تمارين مكتمل!
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                أحسنت! أنجزت عائلة {completedFamilySummary.family.familyName}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium font-arabic">
                لقد أنجزت {completedFamilySummary.firstTryCount} من أصل {completedFamilySummary.totalCount} تمارين بأول محاولة صحيحة.
              </p>
            </div>

            {/* Score & Mastery Box */}
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-4 border border-indigo-100 flex items-center justify-around">
              <div>
                <span className="text-[11px] text-indigo-700 font-bold block">نسبة الإتقان المحسوبة</span>
                <span className="text-2xl font-black text-indigo-900">
                  {completedFamilySummary.masteryScore}%
                </span>
              </div>
              <div className="h-8 w-px bg-indigo-200" />
              <div>
                <span className="text-[11px] text-amber-700 font-bold block">النجوم المكتسبة</span>
                <span className="text-2xl font-black text-amber-600 flex items-center justify-center gap-1">
                  {completedFamilySummary.firstTryCount} <Star size={18} className="fill-amber-500 text-amber-500" />
                </span>
              </div>
            </div>

            {/* Target Concepts Mastered */}
            <div className="space-y-1.5 text-right">
              <span className="text-xs font-bold text-slate-500 block">تم تعزيز وإتقان المفاهيم التالية في مسار تعلمك:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {completedFamilySummary.family.targetConcepts.map((c, cIdx) => (
                  <span key={cIdx} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                    ✓ {c}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setCompletedFamilySummary(null);
                setCurrentStep('family_exercises');
              }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-700 hover:to-indigo-800 text-white font-black text-sm shadow-md transition-all cursor-pointer"
            >
              متابعة واستعراض العائلة
            </button>
          </div>
        </div>
      )}
    </>
  );
};
