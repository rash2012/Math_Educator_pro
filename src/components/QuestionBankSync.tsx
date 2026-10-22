import React, { useState, useEffect, useMemo } from 'react';
import { 
  RawBankJson, 
  RawJsonItem, 
  McqReviewItem, 
  AvailableUnitInfo,
  cleanOptionText, 
  extractDeterministicAnswer, 
  computeDuplicateGroups, 
  STAR_TO_LEVEL, 
  fetchAllAvailableUnits,
  findBestMatchingUnit,
  fetchUnitDistinctConcepts, 
  getOrCreateBankForUnit, 
  writeReviewedBankItemsToDb, 
  SyncExecutionResult,
  loadReviewProgressFromStorage,
  saveReviewProgressToStorage
} from '../services/bankSyncSimple';
import { MathRenderer } from './MathRenderer';
import { type QuestionBank } from '../db';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  UploadCloud, 
  X, 
  FileUp, 
  Copy, 
  CheckSquare, 
  Square, 
  ChevronDown, 
  ChevronUp, 
  EyeOff, 
  Sparkles, 
  Database,
  Filter,
  RefreshCw,
  Info,
  Layers,
  BookOpen,
  GraduationCap
} from 'lucide-react';

interface QuestionBankSyncProps {
  initialBank?: QuestionBank | null;
  onClose: () => void;
}

export const QuestionBankSync: React.FC<QuestionBankSyncProps> = ({ initialBank, onClose }) => {
  const [rawJson, setRawJson] = useState<RawBankJson | null>(initialBank ? (initialBank as any) : null);
  const [sourceType, setSourceType] = useState<'card' | 'file'>(initialBank ? 'card' : 'file');
  const [fileName, setFileName] = useState<string>(initialBank ? initialBank.title : '');
  
  // Available units from NewUnits in Supabase
  const [availableUnits, setAvailableUnits] = useState<AvailableUnitInfo[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [unitError, setUnitError] = useState<string | null>(null);
  const [availableConcepts, setAvailableConcepts] = useState<string[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Review items state
  const [mcqItems, setMcqItems] = useState<McqReviewItem[]>([]);
  const [ignoredEssayCount, setIgnoredEssayCount] = useState<number>(0);

  // UI Filter
  const [activeFilter, setActiveFilter] = useState<'all' | 'ready' | 'duplicates' | 'excluded' | 'incomplete'>('all');
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});

  // Sync execution state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncExecutionResult | null>(null);

  // 1. Fetch available units from NewUnits on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingUnits(true);
    fetchAllAvailableUnits()
      .then((units) => {
        if (!isMounted) return;
        setAvailableUnits(units);
      })
      .catch((err) => {
        console.warn('Error fetching units:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingUnits(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Process Raw Data into MCQ review items
  useEffect(() => {
    if (!rawJson || !Array.isArray(rawJson.items)) {
      setMcqItems([]);
      setIgnoredEssayCount(0);
      return;
    }

    const unitName = rawJson.unit || rawJson.title || '';
    const savedState = loadReviewProgressFromStorage(unitName);

    let essayCount = 0;
    const extractedMcqs: McqReviewItem[] = [];

    rawJson.items.forEach((item, idx) => {
      if (item.type === 'essay') {
        essayCount++;
        return;
      }

      // Treat type === 'mcq' (or items with 4 subparts)
      const sourceKey = item.id || `mcq_${idx + 1}`;
      const rawOpts = item.subParts || [];
      const cleaned = rawOpts.map(cleanOptionText);

      // Deterministic answer extraction from solution
      const det = extractDeterministicAnswer(item.solution || '', cleaned);

      // Initial difficulty from stars
      const starsRaw = Math.max(1, Math.min(5, Number(item.difficulty) || 3));
      const defaultDifficulty = STAR_TO_LEVEL[starsRaw] || 2;

      // Initial topic
      const rawTopic = (item.topic || '').trim();
      const defaultTopic = rawTopic.startsWith('سؤال محقون') ? '' : rawTopic;

      // Load saved state from LocalStorage if exists
      const saved = savedState[sourceKey] || {};

      const correctIdx = saved.correct_index !== undefined ? saved.correct_index : det.index;
      const isAuto = saved.isAutoSuggested !== undefined ? saved.isAutoSuggested : det.isAuto;

      extractedMcqs.push({
        source_key: sourceKey,
        originalIndex: idx + 1,
        order_index: item.order || idx + 1,
        question: item.question || '',
        rawOptions: rawOpts,
        cleanedOptions: cleaned,
        solution: item.solution || '',
        ai_guidance: item.aiGuidance || '',
        svg_code: item.svgCode || undefined,
        originalTopic: rawTopic,
        topic: saved.topic !== undefined ? saved.topic : defaultTopic,
        starsRaw,
        difficulty: saved.difficulty !== undefined ? saved.difficulty : defaultDifficulty,
        correct_index: correctIdx,
        isAutoSuggested: isAuto && correctIdx === det.index,
        isReviewed: saved.isReviewed !== undefined ? saved.isReviewed : false,
        isExcluded: saved.isExcluded !== undefined ? saved.isExcluded : false,
      });
    });

    // Detect duplicates across MCQ questions
    computeDuplicateGroups(extractedMcqs);

    setMcqItems(extractedMcqs);
    setIgnoredEssayCount(essayCount);
  }, [rawJson]);

  // 3. Match candidate unit when availableUnits or rawJson changes
  useEffect(() => {
    if (!rawJson || availableUnits.length === 0) return;

    const matched = findBestMatchingUnit(availableUnits, rawJson.unit, rawJson.title);
    if (matched) {
      setSelectedUnitId(matched.id);
      setUnitError(null);
    } else {
      setSelectedUnitId('');
      setUnitError(`لم يتم العثور على وحدة مطابقة تلقائياً لـ "${rawJson.unit || rawJson.title}". يرجى اختيار الوحدة يدوياً من القائمة المنسدلة أدناه.`);
    }
  }, [rawJson, availableUnits]);

  // 4. Fetch distinct concepts when selectedUnitId changes
  useEffect(() => {
    if (!selectedUnitId) {
      setAvailableConcepts([]);
      return;
    }
    fetchUnitDistinctConcepts(selectedUnitId)
      .then((concepts) => setAvailableConcepts(concepts))
      .catch((err) => console.warn('Failed to load concepts:', err));
  }, [selectedUnitId]);

  // 5. Persist progress to LocalStorage on change
  const persistState = (updatedItems: McqReviewItem[]) => {
    if (!rawJson) return;
    const unitName = rawJson.unit || rawJson.title || '';
    const stateToSave: Record<string, any> = {};
    updatedItems.forEach((item) => {
      stateToSave[item.source_key] = {
        isReviewed: item.isReviewed,
        isExcluded: item.isExcluded,
        correct_index: item.correct_index,
        topic: item.topic,
        difficulty: item.difficulty,
        isAutoSuggested: item.isAutoSuggested,
      };
    });
    saveReviewProgressToStorage(unitName, stateToSave);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSourceType('file');
    setSyncResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items)) {
          alert('تنسيق الملف غير متوافق: يجب أن يحتوي على مصفوفة items.');
          return;
        }
        setRawJson(parsed);
      } catch (err: any) {
        alert(`فشل قراءة ملف JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // 6. Question Item Updaters
  const updateItem = (sourceKey: string, updates: Partial<McqReviewItem>) => {
    setMcqItems((prev) => {
      const next = prev.map((item) => {
        if (item.source_key === sourceKey) {
          return { ...item, ...updates };
        }
        return item;
      });
      persistState(next);
      return next;
    });
  };

  // Mark all unexcluded items as reviewed
  const handleMarkAllReviewed = () => {
    setMcqItems((prev) => {
      const next = prev.map((item) => {
        if (!item.isExcluded) {
          return { ...item, isReviewed: true };
        }
        return item;
      });
      persistState(next);
      return next;
    });
  };

  const toggleSolution = (sourceKey: string) => {
    setExpandedSolutions((prev) => ({
      ...prev,
      [sourceKey]: !prev[sourceKey]
    }));
  };

  // 7. Ready to Sync Filter & Calculations
  const isQuestionReady = (item: McqReviewItem): boolean => {
    return (
      item.isReviewed &&
      !item.isExcluded &&
      item.correct_index !== null &&
      item.topic.trim() !== ''
    );
  };

  const readyToSyncCount = useMemo(() => {
    return mcqItems.filter(isQuestionReady).length;
  }, [mcqItems]);

  const duplicatesCount = useMemo(() => {
    return mcqItems.filter((i) => !!i.duplicateGroupId).length;
  }, [mcqItems]);

  const excludedCount = useMemo(() => {
    return mcqItems.filter((i) => i.isExcluded).length;
  }, [mcqItems]);

  const filteredItems = useMemo(() => {
    switch (activeFilter) {
      case 'ready':
        return mcqItems.filter(isQuestionReady);
      case 'duplicates':
        return mcqItems.filter((i) => !!i.duplicateGroupId);
      case 'excluded':
        return mcqItems.filter((i) => i.isExcluded);
      case 'incomplete':
        return mcqItems.filter((i) => !isQuestionReady(i) && !i.isExcluded);
      default:
        return mcqItems;
    }
  }, [mcqItems, activeFilter]);

  const selectedUnit = useMemo(() => {
    return availableUnits.find(u => u.id === selectedUnitId) || null;
  }, [availableUnits, selectedUnitId]);

  // 8. Execute Sync to Supabase
  const handleExecuteSync = async () => {
    alert('تم النقر على زر المزامنة!');
    console.log('Sync button clicked!', { selectedUnitId, mcqItemsLength: mcqItems.length });
    if (!selectedUnitId) {
      alert('⚠️ لم يتم اختيار الوحدة المستهدفة في قاعدة البيانات. يرجى اختيار الوحدة من القائمة المنسدلة أولاً.');
      return;
    }

    // Auto-prepare non-excluded items for syncing
    const itemsToSync = mcqItems
      .filter(i => !i.isExcluded)
      .map(i => ({
        ...i,
        isReviewed: true,
        topic: i.topic?.trim() || rawJson?.unit || selectedUnit?.name || 'رياضيات الثالث الثانوي',
        correct_index: i.correct_index !== null ? i.correct_index : 0
      }));

    if (itemsToSync.length === 0) {
      alert('⚠️ لا توجد أي أسئلة صالحة للمزامنة (جميع الأسئلة مستبعدة).');
      return;
    }

    // const confirmed = window.confirm(
    //   `هل أنت متأكد من مزامنة ${itemsToSync.length} سؤالاً إلى الوحدة: "${selectedUnit?.name || selectedUnitId}"؟`
    // );
    // if (!confirmed) return;
    
    // Proceed directly without confirm
    const confirmed = true;
    if (!confirmed) return;

    setSyncing(true);
    setSyncResult(null);

    try {
      const bankTitle = rawJson?.title || selectedUnit?.name || 'بنك الأسئلة';
      const bankId = await getOrCreateBankForUnit(selectedUnitId, bankTitle);
      const result = await writeReviewedBankItemsToDb(bankId, itemsToSync, mcqItems);
      setSyncResult(result);
      alert(`✅ تمت مزامنة وحفظ ${result.syncedCount} سؤالاً بنجاح في جدول "NewQuestionBankItems" سحابياً!`);
    } catch (err: any) {
      console.error('Sync failed:', err);
      alert(
        `❌ فشلت عملية المزامنة ولم يتم رفع الأسئلة إلى جدول "NewQuestionBankItems".\n\n` +
        `السبب التقني / خطأ قاعدة البيانات:\n` +
        `${err.message || err}`
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
      <div 
        className="max-w-5xl w-full h-[95vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" 
        dir="rtl"
      >
        {/* Top Header */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
              <UploadCloud size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>مزامنة ومراجعة بنك الأسئلة</span>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                  مباشرة وبدون ذكاء اصطناعي
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-bold mt-0.5">
                مراجعة الخيارات، استخراج الإجابة الصحيحة من الحل تلقائياً، والربط بالوحدة في NewQuestionBanks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
              title="إغلاق"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Sync Controls & Source Banner */}
        <div className="p-4 sm:px-6 bg-white border-b border-slate-200 shrink-0 space-y-3">
          
          {/* Active Card Source Header (No file picker forced) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <BookOpen size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-900">
                    {sourceType === 'card' ? 'بيانات البطاقة النشطة:' : 'الملف المحمل:'}
                  </span>
                  <span className="text-xs font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {rawJson?.title || fileName || 'بنك أسئلة بدون عنوان'}
                  </span>
                  {rawJson?.unit && (
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                      الوحدة: {rawJson.unit}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-medium">
                  <span>{mcqItems.length} سؤال اختيار من متعدد (MCQ)</span>
                  {ignoredEssayCount > 0 && (
                    <span className="text-amber-700 font-bold">
                      • {ignoredEssayCount} أسئلة مقالية متجاهَلة (وفق المعايير)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Change File button (Optional) */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-lg border border-slate-200 text-xs cursor-pointer transition shadow-2xs">
                <FileUp size={13} className="text-indigo-600" />
                <span>{sourceType === 'card' ? 'رفع ملف JSON بديل' : 'تغيير الملف'}</span>
                <input 
                  type="file" 
                  accept=".json,application/json" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  disabled={syncing}
                />
              </label>
            </div>
          </div>

          {/* Unit Matching & Dropdown Selector */}
          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-950">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>مطابقة الوحدة في قاعدة البيانات (NewUnits):</span>
              </div>
              {selectedUnitId && (
                <div className="text-[11px] font-mono text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
                  UUID: {selectedUnitId}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {loadingUnits ? (
                <div className="flex items-center gap-2 text-xs text-indigo-600 py-1 font-bold">
                  <Loader2 size={14} className="animate-spin" />
                  <span>جاري تحميل قائمة الوحدات من السحابة...</span>
                </div>
              ) : availableUnits.length === 0 ? (
                <div className="text-xs text-amber-800 font-bold">
                  لم يتم العثور على أي وحدات مسجلة في جدول NewUnits. يرجى التأكد من مزامنة الوحدات أولاً.
                </div>
              ) : (
                <div className="flex-1 min-w-[280px]">
                  <select
                    value={selectedUnitId}
                    onChange={(e) => {
                      setSelectedUnitId(e.target.value);
                      setUnitError(null);
                    }}
                    className={`w-full p-2 text-xs rounded-lg border font-bold transition ${
                      !selectedUnitId 
                        ? 'border-amber-300 bg-amber-50 text-amber-900' 
                        : 'border-emerald-300 bg-white text-emerald-950'
                    }`}
                  >
                    <option value="">-- اختر الوحدة المطابقة من القائمة --</option>
                    {availableUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.book_part ? `(${u.book_part})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Ready count & Execute Sync Button */}
              <div className="flex items-center gap-3 mr-auto">
                <div className="text-left text-xs">
                  <span className="font-bold text-slate-500 block">الجاهزية:</span>
                  <span className="font-black text-indigo-700 text-sm">
                    {readyToSyncCount} من {mcqItems.length}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Button clicked explicitly');
                    handleExecuteSync();
                  }}
                  disabled={syncing}
                  style={{ zIndex: 1000, position: 'relative' }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs transition shadow-sm cursor-pointer ${
                    readyToSyncCount > 0 && selectedUnitId && !syncing
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95 shadow-xs'
                  }`}
                >
                  {syncing ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                  <span>مزامنة ({readyToSyncCount})</span>
                </button>
              </div>
            </div>

            {unitError && (
              <p className="text-[11px] text-amber-700 font-bold flex items-center gap-1.5 pt-1">
                <AlertCircle size={13} className="shrink-0" />
                <span>{unitError}</span>
              </p>
            )}
          </div>

          {/* Quick Filters & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold text-slate-600">
              <span className="text-slate-400 pl-1 flex items-center gap-1 text-[11px]">
                <Filter size={12} />
                <span>تصفية:</span>
              </span>
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1 rounded-lg border transition cursor-pointer ${activeFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600 font-black' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}
              >
                الكل ({mcqItems.length})
              </button>
              <button
                onClick={() => setActiveFilter('ready')}
                className={`px-3 py-1 rounded-lg border transition cursor-pointer ${activeFilter === 'ready' ? 'bg-emerald-600 text-white border-emerald-600 font-black' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}
              >
                الجاهزة ({readyToSyncCount})
              </button>
              {duplicatesCount > 0 && (
                <button
                  onClick={() => setActiveFilter('duplicates')}
                  className={`px-3 py-1 rounded-lg border transition cursor-pointer ${activeFilter === 'duplicates' ? 'bg-amber-500 text-white border-amber-500 font-black' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200'}`}
                >
                  مكرّر محتمل ({duplicatesCount})
                </button>
              )}
              <button
                onClick={() => setActiveFilter('incomplete')}
                className={`px-3 py-1 rounded-lg border transition cursor-pointer ${activeFilter === 'incomplete' ? 'bg-slate-700 text-white border-slate-700 font-black' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}
              >
                غير مكتمل ({mcqItems.length - readyToSyncCount - excludedCount})
              </button>
              <button
                onClick={() => setActiveFilter('excluded')}
                className={`px-3 py-1 rounded-lg border transition cursor-pointer ${activeFilter === 'excluded' ? 'bg-rose-600 text-white border-rose-600 font-black' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}
              >
                المستبعد ({excludedCount})
              </button>
            </div>

            {/* Quick Action: Mark all unexcluded as reviewed */}
            <button
              onClick={handleMarkAllReviewed}
              className="text-xs font-black text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              title="تحديد كافة الأسئلة غير المستبعدة بأنها تمت مراجعتها"
            >
              <CheckSquare size={13} />
              <span>تأكيد مراجعة كافة الأسئلة</span>
            </button>
          </div>
        </div>

        {/* Sync Success Detailed Report Banner */}
        {syncResult && (
          <div className="p-4 bg-emerald-50 border-b border-emerald-200 text-xs space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2 text-emerald-950 font-bold">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-sm">اكتملت المزامنة بنجاح في قاعدة البيانات سحابياً:</p>
                  <p className="mt-0.5 text-xs text-emerald-900">
                    تمت مزامنة <strong>{syncResult.syncedCount}</strong> سؤالاً بنجاح (جديد: {syncResult.newCount}، محدث: {syncResult.updatedCount}) | المستبعد: {syncResult.excludedCount} | غير المراجع: {syncResult.unreviewedCount}
                    {syncResult.existingDbCountNotInFile > 0 && ` | أسئلة أخرى محفوظة مسبقاً في البنك: ${syncResult.existingDbCountNotInFile}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSyncResult(null)}
                className="px-3 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-lg font-bold hover:bg-emerald-100 cursor-pointer"
              >
                إغلاق التقرير
              </button>
            </div>

            {/* Stored Examples Preview */}
            {syncResult.examples && syncResult.examples.length > 0 && (
              <div className="bg-white rounded-xl p-3 border border-emerald-200 space-y-2">
                <p className="font-black text-[11px] text-emerald-900">
                  عينات من الأسئلة المنشورة بالنص كما تم تخزينها في NewQuestionBankItems:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  {syncResult.examples.map((ex, exIdx) => (
                    <div key={exIdx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                        <span>المعرف: {ex.source_key}</span>
                        <span className="font-bold text-emerald-700">الخيار الصحيح: {['أ', 'ب', 'ج', 'د'][ex.correct_index ?? 0]} (فهرس: {ex.correct_index})</span>
                      </div>
                      <div className="font-bold text-slate-900 line-clamp-2">
                        <MathRenderer content={ex.question} />
                      </div>
                      <div className="text-[10px] text-slate-600 line-clamp-2 bg-white p-1 rounded border border-slate-100">
                        <strong>الحل:</strong> {ex.solution}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cards Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/60">
          {filteredItems.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 p-8 space-y-2">
              <Info size={36} className="text-slate-300 mx-auto" />
              <p className="font-black text-slate-600 text-sm">لا توجد أسئلة تطابق الفلتر المختار</p>
              <p className="text-xs text-slate-400">يمكنك التبديل إلى فلتر "الكل" لعرض جميع أسئلة الاختيار من متعدد</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const ready = isQuestionReady(item);
              const isExpanded = !!expandedSolutions[item.source_key];

              return (
                <div 
                  key={item.source_key}
                  className={`bg-white rounded-2xl border transition shadow-2xs overflow-hidden ${
                    item.isExcluded
                      ? 'border-rose-200 bg-rose-50/30 opacity-75'
                      : ready
                      ? 'border-emerald-300 ring-1 ring-emerald-200'
                      : item.duplicateGroupId
                      ? 'border-amber-300 bg-amber-50/15'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header Bar */}
                  <div className={`p-3.5 px-4 flex flex-wrap items-center justify-between gap-2 border-b ${
                    item.isExcluded 
                      ? 'bg-rose-50/80 border-rose-200' 
                      : ready 
                      ? 'bg-emerald-50/50 border-emerald-100' 
                      : 'bg-slate-50 border-slate-100'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-200/90 text-slate-700 text-xs font-black flex items-center justify-center">
                        {item.originalIndex}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.source_key}
                      </span>
                      {item.duplicateGroupId && (
                        <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Copy size={10} />
                          <span>{item.duplicateGroupId}</span>
                        </span>
                      )}
                      {ready && (
                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                          مكتمل وجاهز
                        </span>
                      )}
                    </div>

                    {/* Actions: Review Checkbox & Exclude Checkbox */}
                    <div className="flex items-center gap-3 text-xs font-bold">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={item.isReviewed}
                          disabled={item.isExcluded}
                          onChange={(e) => updateItem(item.source_key, { isReviewed: e.target.checked })}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>تمت مراجعته</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer text-rose-700 select-none">
                        <input
                          type="checkbox"
                          checked={item.isExcluded}
                          onChange={(e) => {
                            const excluded = e.target.checked;
                            updateItem(item.source_key, { 
                              isExcluded: excluded,
                              isReviewed: excluded ? false : item.isReviewed 
                            });
                          }}
                          className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                        />
                        <span>استبعاد</span>
                      </label>
                    </div>
                  </div>

                  {/* Card Content Body */}
                  <div className="p-4 sm:p-5 space-y-4">
                    {/* Question Text */}
                    <div className="text-sm font-black text-slate-900 leading-relaxed">
                      <MathRenderer content={item.question} />
                    </div>

                    {/* SVG Diagram if available */}
                    {item.svg_code && (
                      <div 
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center overflow-x-auto max-h-60"
                        dangerouslySetInnerHTML={{ __html: item.svg_code }}
                      />
                    )}

                    {/* 4 Clean Options with Radio Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                        <span>الخيارات الأربعة (حدد الخيار الصحيح):</span>
                        {item.isAutoSuggested && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Sparkles size={11} />
                            <span>محدد تلقائياً وفق الحل</span>
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {item.cleanedOptions.map((opt, optIdx) => {
                          const isSelected = item.correct_index === optIdx;
                          const letterLabel = ['أ', 'ب', 'ج', 'د'][optIdx];

                          return (
                            <label 
                              key={optIdx}
                              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition select-none ${
                                isSelected 
                                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-black shadow-2xs' 
                                  : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-800'
                              }`}
                            >
                              <input 
                                type="radio" 
                                name={`correct_opt_${item.source_key}`} 
                                checked={isSelected}
                                onChange={() => updateItem(item.source_key, { 
                                  correct_index: optIdx, 
                                  isAutoSuggested: false 
                                })}
                                className="mt-0.5 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0" 
                              />
                              <div className="flex-1 text-xs">
                                <span className="font-bold text-slate-400 pl-1">({letterLabel})</span>
                                <MathRenderer content={opt} className="inline" />
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {item.correct_index === null && (
                        <p className="text-[11px] text-amber-600 font-bold">
                          ⚠️ لم يتم تحديد الإجابة الصحيحة بعد. يرجى اختيار أحد الخيارات أعلاه لتأكيد السؤال.
                        </p>
                      )}
                    </div>

                    {/* Metadata: Concept & Difficulty */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                      {/* Concept (المفهوم) */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="font-bold text-slate-600 block">
                          المفهوم (الموضوع المستهدف):
                        </label>
                        <input
                          type="text"
                          list={`concept-list-${item.source_key}`}
                          value={item.topic}
                          placeholder="اكتب المفهوم أو اختر من القائمة المقترحة..."
                          onChange={(e) => updateItem(item.source_key, { topic: e.target.value })}
                          className={`w-full p-2 text-xs rounded-xl border transition ${
                            !item.topic.trim() ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300 bg-white'
                          }`}
                        />
                        <datalist id={`concept-list-${item.source_key}`}>
                          {availableConcepts.map((c, cIdx) => (
                            <option key={cIdx} value={c} />
                          ))}
                        </datalist>
                      </div>

                      {/* Difficulty (الصعوبة) */}
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">
                          مستوى الصعوبة:
                        </label>
                        <select
                          value={item.difficulty}
                          onChange={(e) => updateItem(item.source_key, { difficulty: Number(e.target.value) })}
                          className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white font-bold"
                        >
                          <option value={1}>1 - سهل (★1, ★2)</option>
                          <option value={2}>2 - متوسط (★3)</option>
                          <option value={3}>3 - صعب (★4)</option>
                          <option value={4}>4 - مهارات عليا (★5)</option>
                        </select>
                      </div>
                    </div>

                    {/* Collapsible Solution */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => toggleSolution(item.source_key)}
                        className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>{isExpanded ? 'إخفاء الحل النموذجي' : 'عرض خطوات الحل النموذجي الأصلي'}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed space-y-1 max-h-60 overflow-y-auto">
                          <p className="font-bold text-slate-900 text-[11px]">نص الحل الأصلي:</p>
                          <MathRenderer content={item.solution || 'لا يوجد نص حل متاح.'} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 text-[11px] text-slate-500 font-bold flex items-center justify-between px-6 shrink-0">
          <span>يتم حفظ تقدم المراجعة تلقائياً في المتصفح (LocalStorage) مقيّداً بهذه الوحدة.</span>
          <span className="text-slate-700 font-black">
            المعروض: {filteredItems.length} سؤالاً موضوعياً
          </span>
        </div>
      </div>
    </div>
  );
};
