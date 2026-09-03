import React, { useState } from 'react';
import { 
  X, 
  Check, 
  Star, 
  Plus, 
  Trash2, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  Edit3, 
  BookOpen, 
  Lightbulb, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle,
  Layers,
  LayoutGrid,
  Columns
} from 'lucide-react';
import { MathRenderer } from '../MathRenderer';
import type { ClassifiedFamilyData, ClassifiedExercise, ClassifiedStation } from '../../db/exerciseFamiliesRPC';

interface ExerciseFamilyEditModalProps {
  family: ClassifiedFamilyData;
  allFamilies: ClassifiedFamilyData[];
  onSave: (updatedFamily: ClassifiedFamilyData, reallocatedExercises?: { exerciseId: string; targetFamilyIndex: number }[]) => void;
  onClose: () => void;
}

function ensureStations(exercise: ClassifiedExercise): ClassifiedStation[] {
  const existing = exercise.stations ? [...exercise.stations] : [];
  const result: ClassifiedStation[] = [];

  const titles = [
    'المحطة الأولى: الاستكشاف وتشخيص النمط والمعطيات',
    'المحطة الثانية: اختيار الأداة والقانون المنطلق',
    'المحطة الثالثة: الخطوة التنفيذية والتحويل الجبري المفصلي',
    'المحطة الرابعة: الناتج النهائي والخلاصة الرياضية'
  ];

  for (let order = 1; order <= 4; order++) {
    const found = existing.find(s => s.stationOrder === order);
    if (found) {
      if (order === 4 && (!found.choices || found.choices.length === 0)) {
        result.push({
          ...found,
          title: found.title || titles[order - 1],
          choices: [
            { text: '', isCorrect: true, misconceptionDiagnosis: 'إجابة صحيحة وفق الخطوات المعتمدة' },
            { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ مفاهيمي في تطبيق المبرهنة' },
            { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ حسابي في العمليات الجبرية' },
            { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ إشارة أو تجاهل شروط الانطلاق' }
          ],
          correctChoiceIndex: 0
        });
      } else {
        result.push({
          ...found,
          title: found.title || titles[order - 1]
        });
      }
    } else {
      result.push({
        stationOrder: order as 1 | 2 | 3 | 4,
        title: titles[order - 1],
        questionText: order === 4 ? 'ما هو الناتج النهائي أو المعادلة المستنتجة؟' : '',
        hintLevel1: '',
        hintLevel2: '',
        choices: order === 4 ? [
          { text: '', isCorrect: true, misconceptionDiagnosis: 'إجابة صحيحة' },
          { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ مفاهيمي' },
          { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ حسابي' },
          { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ إشارة' }
        ] : undefined,
        correctChoiceIndex: order === 4 ? 0 : undefined
      });
    }
  }
  return result;
}

export const ExerciseFamilyEditModal: React.FC<ExerciseFamilyEditModalProps> = ({
  family,
  allFamilies,
  onSave,
  onClose
}) => {
  const [familyName, setFamilyName] = useState(family.familyName);
  const [targetConcepts, setTargetConcepts] = useState<string[]>([...family.targetConcepts]);
  const [newConceptInput, setNewConceptInput] = useState('');
  const [leadExerciseId, setLeadExerciseId] = useState(family.leadExerciseId);
  const [exercises, setExercises] = useState<ClassifiedExercise[]>(() => {
    const cloned: ClassifiedExercise[] = JSON.parse(JSON.stringify(family.exercises || []));
    return cloned.map(ex => ({
      ...ex,
      stations: ensureStations(ex)
    }));
  });
  const [selectedExId, setSelectedExId] = useState<string>(exercises[0]?.id || '');
  const [reallocations, setReallocations] = useState<{ exerciseId: string; targetFamilyIndex: number }[]>([]);

  // Expandable sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    problem: true,
    station_1: true,
    station_2: true,
    station_3: true,
    station_4: true,
  });

  // Display mode: 'split' (side by side edit + preview), 'edit' (edit only), 'preview' (simulation only)
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  const activeExercise = exercises.find(e => e.id === selectedExId) || exercises[0];

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleExpandAll = () => {
    setExpandedSections({
      problem: true,
      station_1: true,
      station_2: true,
      station_3: true,
      station_4: true,
    });
  };

  const handleCollapseAll = () => {
    setExpandedSections({
      problem: false,
      station_1: false,
      station_2: false,
      station_3: false,
      station_4: false,
    });
  };

  const handleAddConcept = () => {
    if (newConceptInput.trim() && !targetConcepts.includes(newConceptInput.trim())) {
      setTargetConcepts([...targetConcepts, newConceptInput.trim()]);
      setNewConceptInput('');
    }
  };

  const handleRemoveConcept = (index: number) => {
    setTargetConcepts(targetConcepts.filter((_, i) => i !== index));
  };

  const handleSetLead = (exId: string) => {
    setLeadExerciseId(exId);
    setExercises(exercises.map(e => ({
      ...e,
      isLeadExercise: e.id === exId
    })));
  };

  const handleUpdateExerciseField = (field: 'title' | 'questionText' | 'solutionText' | 'strategyText', value: string) => {
    if (!activeExercise) return;
    setExercises(exercises.map(ex => {
      if (ex.id !== activeExercise.id) return ex;
      return {
        ...ex,
        [field]: value
      };
    }));
  };

  const handleUpdateStation = (
    stationOrder: 1 | 2 | 3 | 4,
    field: keyof ClassifiedStation,
    value: any
  ) => {
    if (!activeExercise) return;

    setExercises(exercises.map(ex => {
      if (ex.id !== activeExercise.id) return ex;

      const stations = ex.stations ? [...ex.stations] : ensureStations(ex);
      let stIdx = stations.findIndex(s => s.stationOrder === stationOrder);

      if (stIdx === -1) {
        stations.push({
          stationOrder,
          title: `المحطة ${stationOrder}`,
          questionText: '',
          choices: stationOrder === 4 ? [
            { text: '', isCorrect: true, misconceptionDiagnosis: 'إجابة صحيحة' },
            { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ مفاهيمي' },
            { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ حسابي' },
            { text: '', isCorrect: false, misconceptionDiagnosis: 'خطأ إشارة' }
          ] : undefined
        });
        stIdx = stations.length - 1;
      }

      stations[stIdx] = {
        ...stations[stIdx],
        [field]: value
      };

      return {
        ...ex,
        stations
      };
    }));
  };

  const handleUpdateOption = (
    stationOrder: 1 | 2 | 3 | 4,
    optIdx: number,
    field: 'text' | 'isCorrect' | 'misconceptionDiagnosis',
    value: any
  ) => {
    if (!activeExercise) return;

    setExercises(exercises.map(ex => {
      if (ex.id !== activeExercise.id) return ex;

      const stations = ex.stations ? [...ex.stations] : ensureStations(ex);
      const stIdx = stations.findIndex(s => s.stationOrder === stationOrder);
      if (stIdx === -1) return ex;

      const st = { ...stations[stIdx] };
      const choices = st.choices ? [...st.choices] : [];

      if (field === 'isCorrect' && value === true) {
        choices.forEach((c, idx) => {
          c.isCorrect = idx === optIdx;
        });
        st.correctChoiceIndex = optIdx;
      } else if (choices[optIdx]) {
        choices[optIdx] = {
          ...choices[optIdx],
          [field]: value
        };
      }

      st.choices = choices;
      stations[stIdx] = st;

      return {
        ...ex,
        stations
      };
    }));
  };

  const handleAddOption = (stationOrder: 1 | 2 | 3 | 4) => {
    if (!activeExercise) return;

    setExercises(exercises.map(ex => {
      if (ex.id !== activeExercise.id) return ex;

      const stations = ex.stations ? [...ex.stations] : ensureStations(ex);
      const stIdx = stations.findIndex(s => s.stationOrder === stationOrder);
      if (stIdx === -1) return ex;

      const st = { ...stations[stIdx] };
      const choices = st.choices ? [...st.choices] : [];

      choices.push({
        text: '',
        isCorrect: choices.length === 0,
        misconceptionDiagnosis: 'تشخيص الخطأ أو المشتت'
      });

      st.choices = choices;
      stations[stIdx] = st;

      return {
        ...ex,
        stations
      };
    }));
  };

  const handleRemoveOption = (stationOrder: 1 | 2 | 3 | 4, optIdx: number) => {
    if (!activeExercise) return;

    setExercises(exercises.map(ex => {
      if (ex.id !== activeExercise.id) return ex;

      const stations = ex.stations ? [...ex.stations] : ensureStations(ex);
      const stIdx = stations.findIndex(s => s.stationOrder === stationOrder);
      if (stIdx === -1) return ex;

      const st = { ...stations[stIdx] };
      let choices = st.choices ? [...st.choices] : [];

      choices = choices.filter((_, i) => i !== optIdx);
      if (choices.length > 0 && !choices.some(c => c.isCorrect)) {
        choices[0].isCorrect = true;
        st.correctChoiceIndex = 0;
      }

      st.choices = choices;
      stations[stIdx] = st;

      return {
        ...ex,
        stations
      };
    }));
  };

  const handleReallocateExercise = (exId: string, targetFamIdx: number) => {
    if (targetFamIdx === -1) {
      setReallocations(reallocations.filter(r => r.exerciseId !== exId));
    } else {
      const existing = reallocations.filter(r => r.exerciseId !== exId);
      setReallocations([...existing, { exerciseId: exId, targetFamilyIndex: targetFamIdx }]);
    }
  };

  const handleSave = () => {
    const remainingExercises = exercises.filter(
      ex => !reallocations.some(r => r.exerciseId === ex.id)
    );

    let effectiveLead = leadExerciseId;
    if (!remainingExercises.some(e => e.id === effectiveLead)) {
      if (remainingExercises.length > 0) {
        effectiveLead = remainingExercises[0].id;
        remainingExercises[0].isLeadExercise = true;
      }
    }

    const updatedFamily: ClassifiedFamilyData = {
      ...family,
      familyName,
      targetConcepts,
      leadExerciseId: effectiveLead,
      exercises: remainingExercises.map(e => ({
        ...e,
        isLeadExercise: e.id === effectiveLead
      })),
      hasManualEdits: true,
      saved: false
    };

    onSave(updatedFamily, reallocations);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs" dir="rtl">
      <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-200">
        
        {/* ==================================================================== */}
        {/* Header                                                               */}
        {/* ==================================================================== */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white flex items-center justify-center shadow-md">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900">تعديل يدوي لعائلة التمارين ومحطات الحل</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-extrabold border border-indigo-200">
                  تحرير تفاعلي + محاكاة حية
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">عدّل نص السؤال، المحطات الأربع، التلميحات، والمشتتات مع محاكاة مطابقة للتطبيق</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>إلغاء</span>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* Body Content                                                         */}
        {/* ==================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* 1. Family Info & Concepts Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-black text-slate-700 mb-1.5">اسم العائلة المفاهيمية:</label>
                <input
                  type="text"
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-black text-slate-700 mb-1.5">المفاهيم الرياضية المستهدفة بالعائلة:</label>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {targetConcepts.map((concept, cIdx) => (
                    <span
                      key={cIdx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 text-violet-800 border border-violet-200 rounded-lg text-xs font-bold"
                    >
                      <span>{concept}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveConcept(cIdx)}
                        className="text-violet-400 hover:text-rose-600 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="أدخل مفهوماً رياضياً جديداً..."
                    value={newConceptInput}
                    onChange={e => setNewConceptInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddConcept()}
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleAddConcept}
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة مفهوم
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Exercises Tabs / Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>تمارين هذه العائلة ({exercises.length}):</span>
                <span className="text-xs text-slate-500 font-normal">اختر التمارين للتعديل وعرض محاكاته في التطبيق</span>
              </h4>

              {/* View Mode Switcher */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'split' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="عرض التعديل والمحاكاة جنباً إلى جنب"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>تعديل ومحاكاة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'edit' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="عرض حقول التعديل فقط"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل فقط</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'preview' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="عرض محاكاة التطبيق فقط"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>محاكاة التطبيق</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {exercises.map((ex) => {
                const isSelected = ex.id === activeExercise?.id;
                const isLead = ex.id === leadExerciseId;
                const realloc = reallocations.find(r => r.exerciseId === ex.id);

                return (
                  <div
                    key={ex.id}
                    onClick={() => setSelectedExId(ex.id)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition text-right relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-300 shadow-sm'
                        : isLead
                        ? 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-black text-xs text-slate-900">{ex.title}</span>
                        {isLead ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-black rounded-md flex items-center gap-1 border border-amber-200">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> تمرين قائد
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">
                            تطبيق موجه (4 محطات)
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 line-clamp-2 mb-2 font-arabic">
                        {ex.questionText}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                      {!isLead ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetLead(ex.id);
                          }}
                          className="text-[11px] text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <Star className="w-3 h-3" /> جعله تمرين قائد
                        </button>
                      ) : (
                        <span className="text-[11px] text-amber-700 font-black">⭐ المرجع الشامل</span>
                      )}

                      {allFamilies.length > 1 && (
                        <select
                          value={realloc ? realloc.targetFamilyIndex : -1}
                          onClick={e => e.stopPropagation()}
                          onChange={e => handleReallocateExercise(ex.id, parseInt(e.target.value, 10))}
                          className="text-[10px] px-2 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium"
                        >
                          <option value={-1}>نقل لعائلة أخرى...</option>
                          {allFamilies.map((f, idx) => {
                            if (f.familyName === familyName) return null;
                            return (
                              <option key={idx} value={idx}>
                                ➔ {f.familyName.substring(0, 18)}...
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. WORKSPACE FOR SELECTED EXERCISE */}
          {activeExercise && (
            <div className="space-y-4">
              
              {/* Exercise Toolbar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-bold">جاري تعديل محطات ومشتتات:</span>
                      <span className="text-sm font-black text-indigo-900">{activeExercise.title}</span>
                      {activeExercise.isLeadExercise && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-md">
                          ⭐ تمرين قائد
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExpandAll}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>توسيع الكل</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCollapseAll}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>طي الكل</span>
                  </button>
                </div>
              </div>

              {/* ========================================================== */}
              {/* SECTION: ORIGINAL PROBLEM STATEMENT                        */}
              {/* ========================================================== */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition">
                <div
                  onClick={() => toggleSection('problem')}
                  className="px-5 py-3.5 bg-slate-100/70 hover:bg-slate-100 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-slate-800 text-white flex items-center justify-center text-xs font-black">
                      📌
                    </span>
                    <span className="font-black text-sm text-slate-900">نص المسألة الأصلي والحالة المرجعية</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                    <span>{expandedSections.problem ? 'طي الحاوية' : 'توسيع للتعديل والمحاكاة'}</span>
                    {expandedSections.problem ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {expandedSections.problem && (
                  <div className="p-5">
                    <div className={`grid ${viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2 gap-5' : 'grid-cols-1 gap-4'}`}>
                      {/* EDIT COLUMN */}
                      {(viewMode === 'split' || viewMode === 'edit') && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                              <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                              <span>تحرير نص المسألة (يدعم LaTeX بصيغة $...$):</span>
                            </label>
                          </div>
                          <textarea
                            rows={4}
                            value={activeExercise.questionText || ''}
                            onChange={e => handleUpdateExerciseField('questionText', e.target.value)}
                            className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed text-slate-900"
                            placeholder="نص المسألة الرياضية..."
                          />

                          {activeExercise.isLeadExercise && (
                            <div className="space-y-2 pt-2 border-t border-slate-100">
                              <label className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                <Star className="w-3.5 h-3.5 text-amber-600" />
                                <span>الحل النموذجي المعتمد (للتمرين القائد):</span>
                              </label>
                              <textarea
                                rows={4}
                                value={activeExercise.solutionText || ''}
                                onChange={e => handleUpdateExerciseField('solutionText', e.target.value)}
                                className="w-full p-3 text-xs bg-amber-50/40 border border-amber-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono leading-relaxed text-slate-900"
                                placeholder="خطوات الحل الكاملة والمبرهنات المعتمدة..."
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* SIMULATION PREVIEW COLUMN */}
                      {(viewMode === 'split' || viewMode === 'preview') && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-black text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span>محاكاة ظهور نص المسألة في التطبيق (للشاشة):</span>
                            </span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              معاينة حية KaTeX
                            </span>
                          </div>

                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-sm text-slate-900 leading-relaxed font-arabic shadow-2xs min-h-[100px]">
                            {activeExercise.questionText ? (
                              <MathRenderer content={activeExercise.questionText} />
                            ) : (
                              <span className="text-slate-400 italic text-xs">اكتب نص المسألة لمعاينته هنا فورياً...</span>
                            )}
                          </div>

                          {activeExercise.isLeadExercise && activeExercise.solutionText && (
                            <div className="mt-3 bg-amber-50/60 p-4 rounded-2xl border border-amber-200 text-xs text-slate-800 leading-relaxed font-arabic">
                              <div className="font-black text-amber-900 mb-1.5 flex items-center gap-1">
                                <span>⭐ الحل المرجعي الكامل:</span>
                              </div>
                              <MathRenderer content={activeExercise.solutionText} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ========================================================== */}
              {/* STATIONS 1 TO 4 EXPANDABLE CONTAINERS                      */}
              {/* ========================================================== */}
              {[1, 2, 3, 4].map(orderNum => {
                const stationOrder = orderNum as 1 | 2 | 3 | 4;
                const sectionKey = `station_${stationOrder}`;
                const isExpanded = expandedSections[sectionKey];
                const station = activeExercise.stations?.find(s => s.stationOrder === stationOrder) || {
                  stationOrder,
                  title: `المحطة ${stationOrder}`,
                  questionText: '',
                  hintLevel1: '',
                  hintLevel2: '',
                  choices: []
                };

                const stationTitles = [
                  'المحطة 1: الاستكشاف وتشخيص النمط والمعطيات',
                  'المحطة 2: اختيار الأداة والقانون المنطلق',
                  'المحطة 3: الخطوة التنفيذية والتحويل الجبري المفصلي',
                  'المحطة 4: الناتج النهائي والخلاصة الرياضية (4 خيارات MCQ مع تشخيص سوء الفهم)'
                ];

                return (
                  <div key={stationOrder} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition">
                    
                    {/* Station Container Header */}
                    <div
                      onClick={() => toggleSection(sectionKey)}
                      className={`px-5 py-3.5 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none transition ${
                        stationOrder === 4 
                          ? 'bg-emerald-50/80 hover:bg-emerald-50 text-emerald-950' 
                          : 'bg-indigo-50/60 hover:bg-indigo-50 text-indigo-950'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shadow-xs ${
                          stationOrder === 4 ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
                        }`}>
                          {stationOrder}
                        </span>
                        <div>
                          <span className="font-black text-sm text-slate-900">{stationTitles[stationOrder - 1]}</span>
                          <span className="mr-2 text-[11px] text-slate-500 font-medium hidden sm:inline">
                            (السؤال + سلم التلميحات + {stationOrder === 4 ? 'الخيارات الأربعة والتشخيص' : 'المشتتات'})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                        <span>{isExpanded ? 'طي' : 'توسيع للتعديل والمحاكاة'}</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Station Container Body */}
                    {isExpanded && (
                      <div className="p-5 space-y-6">
                        
                        <div className={`grid ${viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2 gap-6' : 'grid-cols-1 gap-5'}`}>
                          
                          {/* ========================================================== */}
                          {/* EDIT COLUMN (السؤال + التلميحات + الخيارات والمشتتات)       */}
                          {/* ========================================================== */}
                          {(viewMode === 'split' || viewMode === 'edit') && (
                            <div className="space-y-5 bg-slate-50/60 p-4 rounded-2xl border border-slate-200/80">
                              
                              {/* 1. Station Question Prompt */}
                              <div className="space-y-1.5">
                                <label className="block text-xs font-black text-slate-700 flex items-center gap-1.5">
                                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>1. نص السؤال التوجيهي للمحطة {stationOrder}:</span>
                                </label>
                                <textarea
                                  rows={2}
                                  value={station.questionText || ''}
                                  onChange={e => handleUpdateStation(stationOrder, 'questionText', e.target.value)}
                                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-arabic text-slate-900"
                                  placeholder={`صياغة سؤال المحطة ${stationOrder}...`}
                                />
                              </div>

                              {/* 2. Hints Ladder */}
                              <div className="space-y-3 pt-2 border-t border-slate-200">
                                <label className="block text-xs font-black text-indigo-900 flex items-center gap-1.5">
                                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                                  <span>2. سلم التلميحات التوجيهية (المستوى 1 والمستوى 2):</span>
                                </label>

                                <div className="space-y-2.5">
                                  <div>
                                    <div className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                      <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">1</span>
                                      <span>تلميح المستوى 1 (توجيه عام بدون كشف الجواب):</span>
                                    </div>
                                    <input
                                      type="text"
                                      value={station.hintLevel1 || ''}
                                      onChange={e => handleUpdateStation(stationOrder, 'hintLevel1', e.target.value)}
                                      placeholder="مثال: تذكر استخدام تعريف المتتالية الحسابية أو قانون الأساس..."
                                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-indigo-500 text-slate-800"
                                    />
                                  </div>

                                  <div>
                                    <div className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                      <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black flex items-center justify-center">2</span>
                                      <span>تلميح المستوى 2 (مباشر وقريب من الحل):</span>
                                    </div>
                                    <input
                                      type="text"
                                      value={station.hintLevel2 || ''}
                                      onChange={e => handleUpdateStation(stationOrder, 'hintLevel2', e.target.value)}
                                      placeholder="مثال: احسب الفرق $u_{n+1} - u_n$ ولاحظ إشارة الناتج..."
                                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-1 focus:ring-indigo-500 text-slate-800"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* 3. Choices & Distractors (MCQ Options & Misconceptions) */}
                              <div className="space-y-3 pt-2 border-t border-slate-200">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>3. الخيارات والمشتتات وتشخيص الأخطاء المفاهيمية:</span>
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() => handleAddOption(stationOrder)}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> إضافة خيار/مشتت
                                  </button>
                                </div>

                                {(!station.choices || station.choices.length === 0) ? (
                                  <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                                    <p className="text-xs text-slate-500 mb-2 font-medium">لا توجد خيارات مضافة لهذه المحطة حالياً (محطة مفتوحة).</p>
                                    <button
                                      type="button"
                                      onClick={() => handleAddOption(stationOrder)}
                                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> إضافة 4 خيارات تفاعلية مع تشخيص المشتتات
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-2.5">
                                    {station.choices.map((choice, optIdx) => (
                                      <div
                                        key={optIdx}
                                        className={`p-3 rounded-xl border transition ${
                                          choice.isCorrect
                                            ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-300'
                                            : 'bg-white border-slate-200'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="radio"
                                              name={`opt_correct_${activeExercise.id}_${stationOrder}`}
                                              checked={choice.isCorrect}
                                              onChange={() => handleUpdateOption(stationOrder, optIdx, 'isCorrect', true)}
                                              className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                              id={`radio_${activeExercise.id}_${stationOrder}_${optIdx}`}
                                            />
                                            <label
                                              htmlFor={`radio_${activeExercise.id}_${stationOrder}_${optIdx}`}
                                              className={`text-xs font-black cursor-pointer ${
                                                choice.isCorrect ? 'text-emerald-800' : 'text-slate-700'
                                              }`}
                                            >
                                              {choice.isCorrect ? '✅ الخيار الصحيح المعتمد' : `مشتت رقم ${optIdx + 1}`}
                                            </label>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => handleRemoveOption(stationOrder, optIdx)}
                                            className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer"
                                            title="حذف هذا الخيار"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                        <div className="space-y-2">
                                          <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                              نص الخيار (يدعم LaTeX مثل $u_n = 2^n$):
                                            </label>
                                            <input
                                              type="text"
                                              value={choice.text || ''}
                                              onChange={e => handleUpdateOption(stationOrder, optIdx, 'text', e.target.value)}
                                              placeholder={`نص الخيار بالـ LaTeX...`}
                                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 text-slate-900"
                                            />
                                          </div>

                                          <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                              تشخيص سوء الفهم / سبب اختيار الطالب لهذا المشتت:
                                            </label>
                                            <input
                                              type="text"
                                              value={choice.misconceptionDiagnosis || ''}
                                              onChange={e => handleUpdateOption(stationOrder, optIdx, 'misconceptionDiagnosis', e.target.value)}
                                              placeholder="سبب الخطأ المفاهيمي أو المطب في هذا الخيار..."
                                              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-700"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ========================================================== */}
                          {/* SIMULATION PREVIEW COLUMN (محاكاة ظهور المحطة في التطبيق) */}
                          {/* ========================================================== */}
                          {(viewMode === 'split' || viewMode === 'preview') && (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between text-xs font-black text-slate-700">
                                <span className="flex items-center gap-1.5">
                                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>محاكاة ظهور المحطة في شاشة الطالب:</span>
                                </span>
                                <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 font-bold">
                                  عرض حي متطابق
                                </span>
                              </div>

                              {/* Student Station Container Card Simulation */}
                              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                                
                                {/* Simulated Station Badge */}
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                  <div className="flex items-center gap-2">
                                    <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white font-black flex items-center justify-center text-xs shadow-xs">
                                      {stationOrder}
                                    </span>
                                    <div>
                                      <h5 className="text-xs sm:text-sm font-black text-slate-900">
                                        {stationOrder === 1 && 'المحطة 1: الاستكشاف وتشخيص النمط الرياضي'}
                                        {stationOrder === 2 && 'المحطة 2: اختيار الأداة والقانون المنطلق'}
                                        {stationOrder === 3 && 'المحطة 3: الخطوة التنفيذية المفصلية الأولى'}
                                        {stationOrder === 4 && 'المحطة 4: الناتج النهائي والتحقق (4 خيارات MCQ)'}
                                      </h5>
                                      <p className="text-[11px] text-slate-400 font-medium">
                                        {station.choices && station.choices.length > 0 
                                          ? 'اختر الإجابة الصحيحة أو حدد العبارة الصائبة' 
                                          : 'فكر في هذا السؤال التوجيهي، واستعن بسلم التلميحات'}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {/* Simulated Question Prompt */}
                                <div className="space-y-1.5">
                                  <div className="text-[11px] font-black text-indigo-900">سؤال المحطة التوجيهي:</div>
                                  <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 text-xs sm:text-sm text-slate-800 leading-relaxed font-arabic">
                                    {station.questionText ? (
                                      <MathRenderer content={station.questionText} />
                                    ) : (
                                      <span className="text-slate-400 italic text-xs">لم يُكتب نص سؤال للمحطة بعد...</span>
                                    )}
                                  </div>
                                </div>

                                {/* Simulated Hint Accordions */}
                                {(station.hintLevel1 || station.hintLevel2) && (
                                  <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="text-[11px] font-black text-amber-800 flex items-center gap-1">
                                      <Lightbulb className="w-3.5 h-3.5" />
                                      <span>سلم التلميحات التفاعلي:</span>
                                    </div>

                                    {station.hintLevel1 && (
                                      <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-xs text-slate-800">
                                        <div className="font-bold text-amber-900 mb-1 flex items-center gap-1">
                                          <span>💡 تلميح المستوى 1 (توجيه عام):</span>
                                        </div>
                                        <div className="text-slate-700">
                                          <MathRenderer content={station.hintLevel1} />
                                        </div>
                                      </div>
                                    )}

                                    {station.hintLevel2 && (
                                      <div className="p-3 bg-amber-100/60 rounded-xl border border-amber-300 text-xs text-slate-800">
                                        <div className="font-bold text-amber-950 mb-1 flex items-center gap-1">
                                          <span>🔑 تلميح المستوى 2 (مباشر):</span>
                                        </div>
                                        <div className="text-slate-800 font-medium">
                                          <MathRenderer content={station.hintLevel2} />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Simulated Choices Grid */}
                                {station.choices && station.choices.length > 0 && (
                                  <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="text-[11px] font-black text-slate-700">
                                      الخيارات الأربعة المعروضة للطالب:
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      {station.choices.map((choice, cIdx) => (
                                        <div
                                          key={cIdx}
                                          className={`p-3 rounded-xl border text-right transition flex flex-col justify-between ${
                                            choice.isCorrect
                                              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs'
                                              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-1 mb-1.5">
                                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black flex items-center justify-center">
                                              {String.fromCharCode(65 + cIdx)}
                                            </span>
                                            {choice.isCorrect ? (
                                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> الخيار الصحيح
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-bold text-slate-400">
                                                مشتت
                                              </span>
                                            )}
                                          </div>

                                          <div className="text-xs font-bold leading-relaxed my-1">
                                            {choice.text ? (
                                              <MathRenderer content={choice.text} />
                                            ) : (
                                              <span className="text-slate-300 italic text-[11px]">نص الخيار فارغ</span>
                                            )}
                                          </div>

                                          {choice.misconceptionDiagnosis && !choice.isCorrect && (
                                            <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-rose-700 bg-rose-50/50 p-1.5 rounded-lg font-medium">
                                              <span className="font-bold">⚠️ تشخيص المشتت: </span>
                                              <span>{choice.misconceptionDiagnosis}</span>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================================== */}
        {/* Footer Actions                                                       */}
        {/* ==================================================================== */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0 shadow-md">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            <X className="w-4 h-4 text-slate-500" />
            <span>إلغاء وإغلاق دون حفظ</span>
          </button>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="px-7 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-700 hover:to-indigo-800 text-white rounded-xl text-sm font-black shadow-md transition flex items-center gap-2 cursor-pointer hover:scale-102 active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>حفظ كافة التعديلات اليدوية</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
