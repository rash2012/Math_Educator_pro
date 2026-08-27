import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  RefreshCw,
  Edit3,
  Check,
  CheckCircle2,
  AlertTriangle,
  Star,
  ChevronDown,
  ChevronUp,
  Layers,
  HelpCircle,
  BookOpen,
  ArrowRight,
  ListFilter,
  CheckSquare,
  Plus
} from 'lucide-react';
import { MathRenderer } from '../MathRenderer';
import { ExerciseFamilyEditModal } from './ExerciseFamilyEditModal';
import {
  classifyAndGenerateExerciseFamiliesAI,
  regenerateSingleFamilyAI,
  generateStationChoicesAI,
  generateAllStationsChoicesForFamilyAI,
  type RawUnitExerciseInput
} from '../../services/exerciseFamiliesAI';
import {
  saveExerciseFamilyAtomic,
  loadUnitExerciseFamilies,
  type ClassifiedFamilyData,
  type ClassifiedExercise,
  type ClassifiedStation
} from '../../db/exerciseFamiliesRPC';

interface ExerciseFamiliesModalProps {
  docId: number;
  unitTitle: string;
  exercises: RawUnitExerciseInput[];
  onClose: () => void;
  onSavedAll?: () => void;
}

export const ExerciseFamiliesModal: React.FC<ExerciseFamiliesModalProps> = ({
  docId,
  unitTitle,
  exercises,
  onClose,
  onSavedAll
}) => {
  // State
  const [families, setFamilies] = useState<ClassifiedFamilyData[]>([]);
  const [activeTabIdx, setActiveTabIdx] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<Set<string>>(new Set());
  
  // Generating station choices state
  const [generatingStationKey, setGeneratingStationKey] = useState<string | null>(null);

  // Modals & Dialogs
  const [editingFamilyIdx, setEditingFamilyIdx] = useState<number | null>(null);
  const [confirmRegenFamIdx, setConfirmRegenFamIdx] = useState<number | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  // Load existing saved families on mount
  useEffect(() => {
    async function init() {
      try {
        const saved = await loadUnitExerciseFamilies(docId);
        if (saved && saved.length > 0) {
          setFamilies(saved);
        } else {
          // If none exist, start initial classification
          runInitialClassification();
        }
      } catch (err) {
        console.error('Error loading existing families:', err);
        runInitialClassification();
      }
    }
    init();
  }, [docId]);

  const runInitialClassification = async () => {
    setLoading(true);
    setProgressPct(10);
    setProgressMsg('جاري استقراء نصوص التمارين وبدء التحليل والتصنيف المفاهيمي...');

    try {
      const generated = await classifyAndGenerateExerciseFamiliesAI(
        docId,
        unitTitle,
        exercises,
        (phase, msg, pct) => {
          setProgressMsg(msg);
          setProgressPct(pct);
        }
      );

      setFamilies(generated);
      setActiveTabIdx(0);
      setSaveSuccessMsg('تم تصنيف التمارين في عائلات وتوليد محطات الحل بنجاح! راجع النتائج ثم احفظها.');
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Classification error:', err);
      alert(`حدث خطأ أثناء التصنيف: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (exId: string) => {
    const next = new Set(expandedExerciseIds);
    if (next.has(exId)) {
      next.delete(exId);
    } else {
      next.add(exId);
    }
    setExpandedExerciseIds(next);
  };

  const expandAllInActiveFamily = () => {
    const current = families[activeTabIdx];
    if (!current) return;
    const next = new Set(expandedExerciseIds);
    current.exercises.forEach(e => next.add(e.id));
    setExpandedExerciseIds(next);
  };

  const collapseAllInActiveFamily = () => {
    const current = families[activeTabIdx];
    if (!current) return;
    const next = new Set(expandedExerciseIds);
    current.exercises.forEach(e => next.delete(e.id));
    setExpandedExerciseIds(next);
  };

  // 1. Save single family atomic
  const handleSaveSingleFamily = async (famIdx: number) => {
    const fam = families[famIdx];
    if (!fam) return;

    setSaveLoading(true);
    try {
      const savedId = await saveExerciseFamilyAtomic(docId, fam);
      
      setFamilies(prev => prev.map((f, idx) => {
        if (idx === famIdx) {
          return {
            ...f,
            id: savedId,
            saved: true
          };
        }
        return f;
      }));

      setSaveSuccessMsg(`تم حفظ عائلة "${fam.familyName}" ومحطاتها وإجاباتها بنجاح في قاعدة البيانات! ✅`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error saving family:', err);
      alert(`فشل حفظ العائلة: ${err.message || err}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // 2. Save all families
  const handleSaveAllFamilies = async () => {
    setSaveLoading(true);
    try {
      for (let i = 0; i < families.length; i++) {
        const fam = families[i];
        const savedId = await saveExerciseFamilyAtomic(docId, fam);
        families[i].id = savedId;
        families[i].saved = true;
      }

      setFamilies([...families]);
      setSaveSuccessMsg('تم حفظ واعتماد كافة عائلات التمارين ومحطاتها وإجاباتها بنجاح! 🎉');
      setTimeout(() => setSaveSuccessMsg(null), 5000);
      if (onSavedAll) onSavedAll();
    } catch (err: any) {
      console.error('Error saving all families:', err);
      alert(`فشل الحفظ الشامل: ${err.message || err}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // 3. Trigger Regenerate Single Family
  const handleRegenerateFamilyClick = (famIdx: number) => {
    const fam = families[famIdx];
    if (!fam) return;

    if (fam.hasManualEdits || fam.saved) {
      setConfirmRegenFamIdx(famIdx);
    } else {
      executeRegenerateFamily(famIdx);
    }
  };

  const executeRegenerateFamily = async (famIdx: number) => {
    const fam = families[famIdx];
    if (!fam) return;

    setConfirmRegenFamIdx(null);
    setLoading(true);
    setProgressPct(25);
    setProgressMsg(`جاري إعادة توليد محطات عائلة: "${fam.familyName}"...`);

    try {
      const updated = await regenerateSingleFamilyAI(
        docId,
        unitTitle,
        fam,
        (msg, pct) => {
          setProgressMsg(msg);
          setProgressPct(pct);
        }
      );

      setFamilies(prev => prev.map((f, idx) => idx === famIdx ? updated : f));
      setSaveSuccessMsg(`تمت إعادة توليد عائلة "${fam.familyName}" بنجاح! لا تنسَ حفظ التغييرات.`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error regenerating family:', err);
      alert(`فشل إعادة التوليد: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // 4. Generate suggested choices for a single station
  const handleGenerateStationChoices = async (
    exId: string,
    stationOrder: 1 | 2 | 3 | 4,
    mode: 'mcq' | 'true_false' = 'mcq'
  ) => {
    const fam = families[activeTabIdx];
    if (!fam) return;
    const ex = fam.exercises.find(e => e.id === exId);
    if (!ex) return;
    const station = ex.stations?.find(s => s.stationOrder === stationOrder);

    const stationKey = `${exId}_${stationOrder}`;
    setGeneratingStationKey(stationKey);

    try {
      const { choices, correctIndex } = await generateStationChoicesAI(
        unitTitle,
        ex.title,
        ex.questionText,
        stationOrder,
        station?.questionText || `سؤال المحطة ${stationOrder}`,
        mode
      );

      setFamilies(prev => {
        const next = [...prev];
        const currentFam = next[activeTabIdx];
        if (!currentFam) return prev;

        const targetExIdx = currentFam.exercises.findIndex(e => e.id === exId);
        if (targetExIdx === -1) return prev;

        const targetEx = { ...currentFam.exercises[targetExIdx] };
        const stations = targetEx.stations ? [...targetEx.stations] : [];
        let stIdx = stations.findIndex(s => s.stationOrder === stationOrder);

        if (stIdx === -1) {
          stations.push({
            stationOrder,
            title: `المحطة ${stationOrder}`,
            questionText: `ما هي الخطوة التوجيهية في المحطة ${stationOrder}؟`,
            choices,
            correctChoiceIndex: correctIndex
          });
        } else {
          stations[stIdx] = {
            ...stations[stIdx],
            choices,
            correctChoiceIndex: correctIndex
          };
        }

        targetEx.stations = stations;
        currentFam.exercises[targetExIdx] = targetEx;
        currentFam.hasManualEdits = true;
        currentFam.saved = false;

        return next;
      });

      setSaveSuccessMsg(`تم توليد الخيارات للمحطة ${stationOrder} بنجاح! اضغط "حفظ هذه العائلة" لتثبيتها.`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error generating station choices:', err);
      alert(`فشل توليد الخيارات للمحطة: ${err.message || err}`);
    } finally {
      setGeneratingStationKey(null);
    }
  };

  // 5. Generate all stations choices for current family
  const handleGenerateAllStationsChoicesForFamily = async (mode: 'mcq' | 'true_false' = 'mcq') => {
    const fam = families[activeTabIdx];
    if (!fam) return;

    setLoading(true);
    setProgressPct(10);
    setProgressMsg(`جاري توليد الإجابات المقترحة لكافة محطات عائلة: "${fam.familyName}" (${mode === 'true_false' ? 'صح/خطأ' : 'خيارات متعددة'})...`);

    try {
      const updated = await generateAllStationsChoicesForFamilyAI(
        fam,
        unitTitle,
        mode,
        (msg, pct) => {
          setProgressMsg(msg);
          setProgressPct(pct);
        }
      );

      setFamilies(prev => prev.map((f, idx) => idx === activeTabIdx ? updated : f));
      setSaveSuccessMsg(`تم توليد الخيارات المقترحة لجميع محطات عائلة "${fam.familyName}" بنجاح! احفظ العائلة لتثبيتها في قاعدة البيانات.`);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Error generating all choices:', err);
      alert(`فشل توليد الخيارات: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // 6. Handle Save from Manual Edit Modal
  const handleSaveManualEdit = (
    updatedFamily: ClassifiedFamilyData,
    reallocations?: { exerciseId: string; targetFamilyIndex: number }[]
  ) => {
    if (editingFamilyIdx === null) return;

    const nextFamilies = [...families];
    nextFamilies[editingFamilyIdx] = updatedFamily;

    // Handle exercise reallocations to other families
    if (reallocations && reallocations.length > 0) {
      for (const realloc of reallocations) {
        const targetFam = nextFamilies[realloc.targetFamilyIndex];
        const movedEx = families[editingFamilyIdx].exercises.find(e => e.id === realloc.exerciseId);
        
        if (targetFam && movedEx) {
          targetFam.exercises.push({
            ...movedEx,
            isLeadExercise: false,
            primaryConcept: targetFam.familyName
          });
          targetFam.hasManualEdits = true;
          targetFam.saved = false;
        }
      }
    }

    setFamilies(nextFamilies);
    setEditingFamilyIdx(null);
    setSaveSuccessMsg('تم حفظ التعديلات اليدوية بنجاح! اضغط "حفظ هذه العائلة" لتثبيتها في قاعدة البيانات.');
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const activeFamily = families[activeTabIdx];
  const leadExercise = activeFamily?.exercises.find(e => e.id === activeFamily.leadExerciseId || e.isLeadExercise);
  const nonLeadExercises = activeFamily?.exercises.filter(e => e.id !== leadExercise?.id) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* ==================================================================== */}
        {/* Top App Bar & Workflow Stepper                                      */}
        {/* ==================================================================== */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">تصنيف عائلات التمارين وتوليد محطات الحل</h2>
                <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-bold">
                  {unitTitle}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                تصنيف ذكي وفق المفاهيم • أسئلة موجهة مع خيارات تفاعلية (MCQ / صح وخطأ) • حفظ مباشر في قاعدة البيانات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveAllFamilies}
              disabled={saveLoading || loading || families.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> حفظ كافة العائلات
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* Toast / Notification                                                */}
        {/* ==================================================================== */}
        {saveSuccessMsg && (
          <div className="bg-emerald-600 text-white px-6 py-2.5 text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{saveSuccessMsg}</span>
            </div>
            <button onClick={() => setSaveSuccessMsg(null)} className="text-emerald-200 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ==================================================================== */}
        {/* Main Body                                                            */}
        {/* ==================================================================== */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 space-y-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <Sparkles className="w-6 h-6 text-indigo-600 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-base font-bold text-slate-800">{progressMsg}</h3>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-500">{progressPct}% مكتمل</p>
            </div>
          </div>
        ) : families.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 space-y-4">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800">لم يتم تصنيف تمارين هذه الوحدة بعد</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              اضغط على الزر أدناه ليقوم الذكاء الاصطناعي بتحليل تمارين الوحدة وتجميعها في عائلات وتوليد محطات الحل والخيارات.
            </p>
            <button
              onClick={runInitialClassification}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4" /> بدء التحليل والتصنيف الآن
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/70">
            
            {/* 1. Families Horizontal Tabs Bar */}
            <div className="bg-white border-b border-slate-200 px-6 pt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {families.map((fam, idx) => {
                const isActive = idx === activeTabIdx;
                const exCount = fam.exercises.length;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveTabIdx(idx)}
                    className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-2 border-t-2 cursor-pointer ${
                      isActive
                        ? 'bg-slate-100 text-indigo-700 border-indigo-600 shadow-xs'
                        : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{fam.familyName}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {exCount} تمارين
                    </span>
                    {fam.hasManualEdits && (
                      <span className="text-[10px] text-amber-600 font-bold" title="تعديل يدوي">✏️</span>
                    )}
                    {fam.saved && (
                      <span className="text-[10px] text-emerald-600 font-bold" title="محفوظ">✅</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 2. Active Family Content Panel */}
            {activeFamily && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                
                {/* Family Meta Header */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-xs font-bold">
                        العائلة {activeTabIdx + 1} من {families.length}
                      </span>
                      <h3 className="text-base font-bold text-slate-800">{activeFamily.familyName}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-xs font-bold text-slate-500 ml-1">المفاهيم المستهدفة:</span>
                      {activeFamily.targetConcepts.map((concept, cIdx) => (
                        <span
                          key={cIdx}
                          className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium"
                        >
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions for active family: Generate Choices & Expand/Collapse */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-indigo-50/80 p-1.5 rounded-xl border border-indigo-100">
                      <span className="text-[11px] font-bold text-indigo-900 px-1">توليد خيارات لجميع المحطات:</span>
                      <button
                        onClick={() => handleGenerateAllStationsChoicesForFamily('mcq')}
                        disabled={loading}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                        title="توليد 3-4 خيارات مع مشتتات لجميع محطات تمارين هذه العائلة"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> 3-4 خيارات
                      </button>
                      <button
                        onClick={() => handleGenerateAllStationsChoicesForFamily('true_false')}
                        disabled={loading}
                        className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                        title="توليد عبارات صح أو خطأ لجميع محطات تمارين هذه العائلة"
                      >
                        <CheckSquare className="w-3.5 h-3.5" /> صح / خطأ
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={expandAllInActiveFamily}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
                      >
                        توسيع الكل
                      </button>
                      <button
                        onClick={collapseAllInActiveFamily}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
                      >
                        طي الكل
                      </button>
                    </div>
                  </div>
                </div>

                {/* ============================================================ */}
                {/* ⭐ Lead Exercise Card (Golden Featured Highlight)           */}
                {/* ============================================================ */}
                {leadExercise && (
                  <div className="bg-linear-to-r from-amber-50/90 via-amber-50/50 to-amber-100/40 rounded-2xl border-2 border-amber-300 p-5 shadow-xs space-y-4 relative overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-amber-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                          <Star className="w-5 h-5 fill-white text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 bg-amber-200/80 text-amber-900 text-xs font-bold rounded-lg">
                              ⭐ التمرين القائد (المرجع الشامل للعائلة)
                            </span>
                            <span className="font-bold text-sm text-slate-900">{leadExercise.title}</span>
                          </div>
                          <p className="text-[11px] text-amber-800">
                            تمرين قياسي معفى من البوابات والمحطات، ويُعرض نصه وحله الكامل كمرجع ونموذج استرشادي للطالب
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Lead Question Text */}
                    <div className="bg-white/80 rounded-xl p-4 border border-amber-200/80 text-slate-800 text-sm font-arabic leading-relaxed">
                      <MathRenderer content={leadExercise.questionText} />
                    </div>

                    {/* Strategy & Solution */}
                    {leadExercise.strategyText && (
                      <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-1 font-arabic">
                        <span className="font-bold text-indigo-700">💡 استراتيجية وفكرة الحل:</span>
                        <MathRenderer content={leadExercise.strategyText} />
                      </div>
                    )}

                    {leadExercise.solutionText && (
                      <div className="bg-white rounded-xl p-4 border border-emerald-200 shadow-2xs space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <BookOpen className="w-4 h-4" />
                          <span>الحل التفصيلي المعتمد (النموذج المرجعي):</span>
                        </div>
                        <div className="text-xs text-slate-700 font-arabic leading-relaxed">
                          <MathRenderer content={leadExercise.solutionText} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ============================================================ */}
                {/* 🔄 Guided Exercises Accordions (Non-Lead)                    */}
                {/* ============================================================ */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center justify-between">
                    <span>تمارين المسار والحل الموجّه ({nonLeadExercises.length}):</span>
                    <span className="text-xs text-slate-500 font-normal">
                      مزودة بالأسئلة الموجهة والخيارات التفاعلية المحفوظة (المحطات 1-4)
                    </span>
                  </h4>

                  {nonLeadExercises.map((ex, exIdx) => {
                    const isExpanded = expandedExerciseIds.has(ex.id);
                    const stations = ex.stations || [];

                    return (
                      <div
                        key={ex.id}
                        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition"
                      >
                        {/* Header Bar */}
                        <div
                          onClick={() => toggleExpand(ex.id)}
                          className="px-5 py-3.5 bg-slate-50/80 hover:bg-slate-100 cursor-pointer flex items-center justify-between gap-4 select-none border-b border-slate-100"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                              {exIdx + 1}
                            </span>
                            <div>
                              <span className="font-bold text-xs text-slate-800">{ex.title}</span>
                              <span className="mr-2 text-[11px] text-indigo-600 font-medium">
                                ({ex.primaryConcept})
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">
                              {stations.length} محطات تفكير
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {/* Collapsed/Expanded Body */}
                        {isExpanded && (
                          <div className="p-5 space-y-5 bg-white animate-in fade-in duration-150">
                            
                            {/* Question Statement */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed font-arabic">
                              <MathRenderer content={ex.questionText} />
                            </div>

                            {/* 4 Stations Grid with Interactive Choices Display & On-demand Generation */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              
                              {[1, 2, 3, 4].map(orderNum => {
                                const st = stations.find(s => s.stationOrder === orderNum);
                                const isGenerating = generatingStationKey === `${ex.id}_${orderNum}`;
                                const isStation4 = orderNum === 4;

                                const defaultTitles = [
                                  'المحطة 1: الاستكشاف وتشخيص النمط',
                                  'المحطة 2: اختيار الأداة والقانون المنطلق',
                                  'المحطة 3: الخطوة التنفيذية المفصلية الأولى',
                                  'المحطة 4: الناتج النهائي والخلاصة الرياضية'
                                ];

                                return (
                                  <div
                                    key={orderNum}
                                    className={`p-4 rounded-xl border space-y-3 ${
                                      isStation4
                                        ? 'bg-emerald-50/40 border-emerald-200 md:col-span-2'
                                        : 'bg-slate-50/70 border-indigo-100'
                                    }`}
                                  >
                                    {/* Station Header & Generation Buttons */}
                                    <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-200/60">
                                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                                        <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                                          isStation4 ? 'bg-emerald-200 text-emerald-800' : 'bg-indigo-200 text-indigo-800'
                                        }`}>
                                          {orderNum}
                                        </span>
                                        <span>{st?.title || defaultTitles[orderNum - 1]}</span>
                                      </div>

                                      {/* On-demand generation buttons for this station */}
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => handleGenerateStationChoices(ex.id, orderNum as 1|2|3|4, 'mcq')}
                                          disabled={isGenerating || loading}
                                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                          title="توليد أو إعادة توليد 3-4 خيارات مقترحة"
                                        >
                                          <Sparkles className="w-3 h-3 text-indigo-600" />
                                          <span>{isGenerating ? 'جاري التوليد...' : 'توليد 3-4 خيارات'}</span>
                                        </button>
                                        <button
                                          onClick={() => handleGenerateStationChoices(ex.id, orderNum as 1|2|3|4, 'true_false')}
                                          disabled={isGenerating || loading}
                                          className="px-2 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                          title="توليد خيار صح / خطأ"
                                        >
                                          <CheckSquare className="w-3 h-3 text-violet-600" />
                                          <span>صح/خطأ</span>
                                        </button>
                                      </div>
                                    </div>

                                    {/* Question Text */}
                                    <div className="text-xs text-slate-800 font-arabic font-medium">
                                      <MathRenderer content={st?.questionText || `ما هي الخطوة التوجيهية المناسبة للمحطة ${orderNum}؟`} />
                                    </div>

                                    {/* Choices Display if available */}
                                    {st?.choices && st.choices.length > 0 ? (
                                      <div className="space-y-1.5 pt-1">
                                        <span className="text-[11px] font-bold text-slate-500 block">الإجابات المقترحة والمشتتات المحفوظة:</span>
                                        <div className={`grid gap-2 ${isStation4 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                                          {st.choices.map((choice, cIdx) => (
                                            <div
                                              key={choice.id || cIdx}
                                              className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                                                choice.isCorrect
                                                  ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950 font-bold'
                                                  : 'bg-white border-slate-200 text-slate-700'
                                              }`}
                                            >
                                              <div className="flex items-start justify-between gap-1 mb-1">
                                                <div className="font-arabic">
                                                  <MathRenderer content={choice.text} />
                                                </div>
                                                {choice.isCorrect ? (
                                                  <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] rounded font-bold whitespace-nowrap">
                                                    صحيح ✅
                                                  </span>
                                                ) : (
                                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded border border-slate-200 whitespace-nowrap">
                                                    مشتت
                                                  </span>
                                                )}
                                              </div>
                                              {choice.misconceptionDiagnosis && (
                                                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 font-arabic">
                                                  <span className="font-bold text-slate-600">التشخيص: </span>
                                                  {choice.misconceptionDiagnosis}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-[11px] text-amber-800 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between">
                                        <span>لا توجد خيارات مولدة بعد لهذه المحطة.</span>
                                        <button
                                          onClick={() => handleGenerateStationChoices(ex.id, orderNum as 1|2|3|4, 'mcq')}
                                          className="text-xs font-bold text-indigo-700 hover:underline cursor-pointer"
                                        >
                                          توليد الآن ✨
                                        </button>
                                      </div>
                                    )}

                                    {/* Hints */}
                                    {st?.hintLevel1 && (
                                      <div className="text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200">
                                        <span className="font-bold text-slate-700">💡 تلميح: </span>
                                        {st.hintLevel1}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

            {/* ================================================================ */}
            {/* 3. Bottom Mandatory Action Bar for Current Family                */}
            {/* ================================================================ */}
            {activeFamily && (
              <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    العائلة الحالية: <strong className="text-slate-800">{activeFamily.familyName}</strong>
                  </span>
                  {activeFamily.saved && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-md flex items-center gap-1">
                      <Check className="w-3 h-3" /> تم الحفظ في قاعدة البيانات
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  
                  {/* 1. Save Family */}
                  <button
                    onClick={() => handleSaveSingleFamily(activeTabIdx)}
                    disabled={saveLoading}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-2 cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> حفظ هذه العائلة والخيارات
                  </button>

                  {/* 2. Manual Edit */}
                  <button
                    onClick={() => setEditingFamilyIdx(activeTabIdx)}
                    className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" /> تعديل يدوي
                  </button>

                  {/* 3. Regenerate Single Family */}
                  <button
                    onClick={() => handleRegenerateFamilyClick(activeTabIdx)}
                    disabled={loading}
                    className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" /> إعادة التوليد
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ==================================================================== */}
        {/* Manual Edit Sub-Modal                                               */}
        {/* ==================================================================== */}
        {editingFamilyIdx !== null && families[editingFamilyIdx] && (
          <ExerciseFamilyEditModal
            family={families[editingFamilyIdx]}
            allFamilies={families}
            onSave={handleSaveManualEdit}
            onClose={() => setEditingFamilyIdx(null)}
          />
        )}

        {/* ==================================================================== */}
        {/* Confirmation Dialog for Regeneration                                 */}
        {/* ==================================================================== */}
        {confirmRegenFamIdx !== null && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3 text-amber-600">
                <div className="p-2 bg-amber-100 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800">تأكيد إعادة التوليد</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-arabic">
                تنبيه: توجد تعديلات سابقة محفوظة لعائلة <strong>"{families[confirmRegenFamIdx]?.familyName}"</strong>.
                إعادة التوليد ستستبدل النصوص والمحطات والخيارات بالكامل بما يولده الذكاء الاصطناعي. هل تريد المتابعة بالتأكيد؟
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setConfirmRegenFamIdx(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => executeRegenerateFamily(confirmRegenFamIdx)}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition cursor-pointer"
                >
                  نعم، أعد التوليد
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
