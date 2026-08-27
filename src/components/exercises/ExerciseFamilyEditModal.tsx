import React, { useState } from 'react';
import { X, Check, Star, Plus, Trash2, HelpCircle } from 'lucide-react';
import type { ClassifiedFamilyData, ClassifiedExercise, ClassifiedStation } from '../../db/exerciseFamiliesRPC';

interface ExerciseFamilyEditModalProps {
  family: ClassifiedFamilyData;
  allFamilies: ClassifiedFamilyData[];
  onSave: (updatedFamily: ClassifiedFamilyData, reallocatedExercises?: { exerciseId: string; targetFamilyIndex: number }[]) => void;
  onClose: () => void;
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
  const [exercises, setExercises] = useState<ClassifiedExercise[]>(JSON.parse(JSON.stringify(family.exercises)));
  const [selectedExId, setSelectedExId] = useState<string>(exercises[0]?.id || '');
  const [reallocations, setReallocations] = useState<{ exerciseId: string; targetFamilyIndex: number }[]>([]);

  const activeExercise = exercises.find(e => e.id === selectedExId) || exercises[0];

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

  const handleUpdateStation = (
    stationOrder: 1 | 2 | 3 | 4,
    field: keyof ClassifiedStation,
    value: any
  ) => {
    if (!activeExercise || activeExercise.isLeadExercise) return;

    setExercises(exercises.map(ex => {
      if (ex.id !== activeExercise.id) return ex;

      const stations = ex.stations ? [...ex.stations] : [];
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
    optIdx: number,
    field: 'text' | 'isCorrect' | 'misconceptionDiagnosis',
    value: any
  ) => {
    if (!activeExercise || activeExercise.isLeadExercise) return;

    setExercises(exercises.map(ex => {
      if (ex.id !== activeExercise.id) return ex;

      const stations = ex.stations ? [...ex.stations] : [];
      const st4Idx = stations.findIndex(s => s.stationOrder === 4);
      if (st4Idx === -1) return ex;

      const st4 = { ...stations[st4Idx] };
      const choices = st4.choices ? [...st4.choices] : [];

      if (field === 'isCorrect' && value === true) {
        choices.forEach((c, idx) => {
          c.isCorrect = idx === optIdx;
        });
        st4.correctChoiceIndex = optIdx;
      } else if (choices[optIdx]) {
        choices[optIdx] = {
          ...choices[optIdx],
          [field]: value
        };
      }

      st4.choices = choices;
      stations[st4Idx] = st4;

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
    // Keep exercises that were not reallocated
    const remainingExercises = exercises.filter(
      ex => !reallocations.some(r => r.exerciseId === ex.id)
    );

    // If lead was reallocated or missing, pick first remaining
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-100 text-indigo-700 rounded-xl text-lg">✏️</span>
            <div>
              <h3 className="text-lg font-bold text-slate-800">تعديل يدوي لعائلة التمارين ومحطات الحل</h3>
              <p className="text-xs text-slate-500">عدّل اسم العائلة، المفاهيم المستهدفة، التمرين القائد، ونصوص المحطات الأربع</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 1. Family Name & Target Concepts */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم العائلة المفاهيمية:</label>
              <input
                type="text"
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المفاهيم الرياضية المستهدفة بالعائلة:</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {targetConcepts.map((concept, cIdx) => (
                  <span
                    key={cIdx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium"
                  >
                    <span>{concept}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveConcept(cIdx)}
                      className="text-indigo-400 hover:text-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="أدخل مفهوماً إضافياً واضغط إضافة..."
                  value={newConceptInput}
                  onChange={e => setNewConceptInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddConcept()}
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddConcept}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> إضافة
                </button>
              </div>
            </div>
          </div>

          {/* 2. Exercises Selector and Reallocation */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>تمارين هذه العائلة ({exercises.length}):</span>
              <span className="text-xs text-slate-500 font-normal">اختر تمريناً لتعديل محطاته أو تعيينه كقائد ⭐</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {exercises.map((ex) => {
                const isSelected = ex.id === activeExercise?.id;
                const isLead = ex.id === leadExerciseId;
                const realloc = reallocations.find(r => r.exerciseId === ex.id);

                return (
                  <div
                    key={ex.id}
                    onClick={() => setSelectedExId(ex.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition text-right relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-200'
                        : isLead
                        ? 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-xs text-slate-800">{ex.title}</span>
                        {isLead ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> تمرين قائد
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">محطات موجّهة</span>
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
                          className="text-[11px] text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1 hover:underline"
                        >
                          <Star className="w-3 h-3" /> جعله تمرين قائد
                        </button>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-bold">المرجع الرئيسي</span>
                      )}

                      {/* Move to another family dropdown */}
                      {allFamilies.length > 1 && (
                        <select
                          value={realloc ? realloc.targetFamilyIndex : -1}
                          onClick={e => e.stopPropagation()}
                          onChange={e => handleReallocateExercise(ex.id, parseInt(e.target.value, 10))}
                          className="text-[10px] px-2 py-1 bg-slate-100 border border-slate-300 rounded text-slate-700"
                        >
                          <option value={-1}>نقل لعائلة أخرى...</option>
                          {allFamilies.map((f, idx) => {
                            if (f.familyName === familyName) return null;
                            return (
                              <option key={idx} value={idx}>
                                ➔ {f.familyName.substring(0, 20)}...
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

          {/* 3. Station Editor for Active Exercise */}
          {activeExercise && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-800">
                    تعديل محطات: <span className="text-indigo-600">{activeExercise.title}</span>
                  </span>
                  {activeExercise.isLeadExercise && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> تمرين قائد (معفى من المحطات، يعرض الحل الكامل كمرجع)
                    </span>
                  )}
                </div>
              </div>

              {activeExercise.isLeadExercise ? (
                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 text-slate-700 text-xs space-y-2">
                  <p className="font-bold text-amber-900">⭐ التمرين القائد هو المرجع الشامل لعائلة التمارين هذه.</p>
                  <p>لا يتم تقييده بمحطات إجبارية للطالب، بل يُعرض نصه وحله الكامل المعتمد مباشرة كأيقونة ومثال قياسي.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Station 1 */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <h5 className="font-bold text-xs text-indigo-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">1</span>
                      المحطة الأولى: الاستكشاف وتشخيص النمط والمعطيات
                    </h5>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">نص السؤال الموجه:</label>
                      <textarea
                        rows={2}
                        value={activeExercise.stations?.find(s => s.stationOrder === 1)?.questionText || ''}
                        onChange={e => handleUpdateStation(1, 'questionText', e.target.value)}
                        className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        placeholder="صياغة سؤال لتحديد نمط المسألة..."
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">تلميح المستوى 1 (توجيه عام):</label>
                        <input
                          type="text"
                          value={activeExercise.stations?.find(s => s.stationOrder === 1)?.hintLevel1 || ''}
                          onChange={e => handleUpdateStation(1, 'hintLevel1', e.target.value)}
                          className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">تلميح المستوى 2 (قريب من الحل):</label>
                        <input
                          type="text"
                          value={activeExercise.stations?.find(s => s.stationOrder === 1)?.hintLevel2 || ''}
                          onChange={e => handleUpdateStation(1, 'hintLevel2', e.target.value)}
                          className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Station 2 */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <h5 className="font-bold text-xs text-indigo-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">2</span>
                      المحطة الثانية: اختيار الأداة والقانون المنطلق
                    </h5>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">نص السؤال الموجه:</label>
                      <textarea
                        rows={2}
                        value={activeExercise.stations?.find(s => s.stationOrder === 2)?.questionText || ''}
                        onChange={e => handleUpdateStation(2, 'questionText', e.target.value)}
                        className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        placeholder="سؤال عن المبرهنة أو القانون المنطلق..."
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">تلميح المستوى 1:</label>
                        <input
                          type="text"
                          value={activeExercise.stations?.find(s => s.stationOrder === 2)?.hintLevel1 || ''}
                          onChange={e => handleUpdateStation(2, 'hintLevel1', e.target.value)}
                          className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">تلميح المستوى 2:</label>
                        <input
                          type="text"
                          value={activeExercise.stations?.find(s => s.stationOrder === 2)?.hintLevel2 || ''}
                          onChange={e => handleUpdateStation(2, 'hintLevel2', e.target.value)}
                          className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Station 3 */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <h5 className="font-bold text-xs text-indigo-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">3</span>
                      المحطة الثالثة: الخطوة التنفيذية والتحويل الجبري المفصلي
                    </h5>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">نص السؤال الموجه:</label>
                      <textarea
                        rows={2}
                        value={activeExercise.stations?.find(s => s.stationOrder === 3)?.questionText || ''}
                        onChange={e => handleUpdateStation(3, 'questionText', e.target.value)}
                        className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        placeholder="سؤال عن الخطوة الحاسمة أو التحويل الجبري الأول..."
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">تلميح المستوى 1:</label>
                        <input
                          type="text"
                          value={activeExercise.stations?.find(s => s.stationOrder === 3)?.hintLevel1 || ''}
                          onChange={e => handleUpdateStation(3, 'hintLevel1', e.target.value)}
                          className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">تلميح المستوى 2:</label>
                        <input
                          type="text"
                          value={activeExercise.stations?.find(s => s.stationOrder === 3)?.hintLevel2 || ''}
                          onChange={e => handleUpdateStation(3, 'hintLevel2', e.target.value)}
                          className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Station 4 */}
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-3">
                    <h5 className="font-bold text-xs text-emerald-800 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs">4</span>
                      المحطة الرابعة: الناتج النهائي والخلاصة الرياضية (4 خيارات MCQ مع تشخيص سوء الفهم)
                    </h5>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">نص سؤال النتيجة النهائية:</label>
                      <input
                        type="text"
                        value={activeExercise.stations?.find(s => s.stationOrder === 4)?.questionText || 'ما هو الناتج النهائي أو المعادلة المستنتجة؟'}
                        onChange={e => handleUpdateStation(4, 'questionText', e.target.value)}
                        className="w-full p-2 text-xs bg-white border border-emerald-300 rounded-lg"
                      />
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="block text-[11px] font-bold text-slate-600">الخيارات الأربعة (حدد الخيار الصحيح الوحيد بدقة):</label>
                      
                      {activeExercise.stations?.find(s => s.stationOrder === 4)?.choices?.map((choice, optIdx) => (
                        <div
                          key={optIdx}
                          className={`p-2.5 rounded-lg border flex flex-col md:flex-row items-start md:items-center gap-2 ${
                            choice.isCorrect
                              ? 'bg-emerald-100/70 border-emerald-400'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-28">
                            <input
                              type="radio"
                              name={`opt_correct_${activeExercise.id}`}
                              checked={choice.isCorrect}
                              onChange={() => handleUpdateOption(optIdx, 'isCorrect', true)}
                              className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-700">
                              {choice.isCorrect ? 'الخيار الصحيح ✅' : `مشتت ${optIdx + 1}`}
                            </span>
                          </div>

                          <div className="flex-1 w-full">
                            <input
                              type="text"
                              value={choice.text}
                              onChange={e => handleUpdateOption(optIdx, 'text', e.target.value)}
                              placeholder={`نص الخيار بالـ LaTeX مثل $u_n = 2^n$...`}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>

                          <div className="flex-1 w-full">
                            <input
                              type="text"
                              value={choice.misconceptionDiagnosis || ''}
                              onChange={e => handleUpdateOption(optIdx, 'misconceptionDiagnosis', e.target.value)}
                              placeholder="تشخيص سوء الفهم في هذا الخيار..."
                              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-600"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition font-medium"
          >
            إلغاء التعديل
          </button>
          
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> حفظ التعديلات اليدوية
          </button>
        </div>

      </div>
    </div>
  );
};
