import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Document, type LessonSection, type PracticeExercise } from '../db';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { 
  ArrowRight, Plus, Trash2, Edit3, Printer, Download, Upload, Save, X, Eye, EyeOff, 
  FileText, Globe, GraduationCap, BookOpen, Layers, BookMarked,
  Sparkles, Loader2, Filter, Settings2, CheckCircle2, Cloud
} from 'lucide-react';
import { SyncControlButton } from './SyncControlButton';
import { UnitSyncIndicator } from './UnitSyncIndicator';
import { CustomDialog } from './ui/CustomDialog';
import { COUNTRIES, GRADES, SUBJECTS, ALL_DEFAULT_MATH_UNITS, DEFAULT_METADATA } from '../constants/academicData';
import { 
  generatePracticeExerciseSolutionAI,
  generatePracticeExerciseSvgAI,
  shortenPracticeExerciseSolutionAI,
  extractUnitExercisesFromReference
} from '../services/gemini';

// Modular Subcomponents
import { 
  DEFAULT_PRINT_SETTINGS, 
  type PrintSettingsState, 
  getContrastColor,
  getCoverPrintCss,
  getFontFamilyCss
} from './exercises/exercisePrintTypes';
import { ExerciseCard } from './exercises/ExerciseCard';
import { ExerciseEditModal } from './exercises/ExerciseEditModal';
import { ExerciseVerifyModal } from './exercises/ExerciseVerifyModal';
import { ExercisePrintSettingsPanel } from './exercises/ExercisePrintSettingsModal';
import { ExerciseCoverPage } from './exercises/ExerciseCoverPage';
import { ExerciseFamiliesModal } from './exercises/ExerciseFamiliesModal';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';
import { type RawUnitExerciseInput } from '../services/exerciseFamiliesAI';
import { loadUnitExerciseFamilies, saveExerciseFamilyAtomic } from '../db/exerciseFamiliesRPC';

export const ExercisesAndProblemsDashboard: React.FC<{ onBack?: () => void; initialDocId?: number }> = ({ onBack, initialDocId }) => {
  // DB Queries
  const allDocuments = useLiveQuery(() => 
    db.documents.orderBy('updatedAt').reverse().toArray()
  );

  const allLessonSections = useLiveQuery(() => 
    db.lessonSections.toArray()
  );

  const pdfReferences = useLiveQuery(() => 
    db.documents.where('type').equals('pdf').reverse().sortBy('updatedAt')
  );

  const [activeDocId, setActiveDocId] = useState<number | null>(initialDocId || null);
  
  const activeDocument = useLiveQuery(() => 
    activeDocId ? db.documents.get(activeDocId) : Promise.resolve(null)
  , [activeDocId]);

  const rawSections = useLiveQuery(() => 
    activeDocId ? db.lessonSections.where({ docId: activeDocId }).sortBy('order') : Promise.resolve([])
  , [activeDocId]);

  // Filters State
  const [countryFilter, setCountryFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Booklet State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReferenceId, setSelectedReferenceId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newBooklet, setNewBooklet] = useState({
    title: '',
    country: DEFAULT_METADATA.country,
    grade: DEFAULT_METADATA.grade,
    subject: DEFAULT_METADATA.subject,
    part: DEFAULT_METADATA.part,
    unit: DEFAULT_METADATA.unit,
    topic: 'تمرينات ومسائل الوحدة',
    seriesName: 'سلسلة التعلم الذكي📚✨',
    teacherName: 'حسن راشد العلي'
  });

  // UI States
  const [showSolutions, setShowSolutions] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSolvingAll, setIsSolvingAll] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [showPrintSettings, setShowPrintSettings] = useState(false);

  // Print Settings State
  const [printSettings, setPrintSettings] = useState<PrintSettingsState>(DEFAULT_PRINT_SETTINGS);

  // Exercise Modals State
  const [editingExModal, setEditingExModal] = useState<{
    sectionId: number;
    exercise: PracticeExercise;
  } | null>(null);

  const [verifyingExModal, setVerifyingExModal] = useState<{
    sectionId: number;
    exercise: PracticeExercise;
  } | null>(null);

  const [aiLoading, setAiLoading] = useState<{
    exId: string;
    type: 'solution' | 'shorten' | 'svg';
  } | null>(null);

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'alert';
    onConfirm?: () => void;
  }>({
    isOpen: false, title: '', message: '', type: 'alert'
  });

  // Exercise Families AI Classification Modal State
  const [familiesModalData, setFamiliesModalData] = useState<{
    docId: number;
    unitTitle: string;
    exercises: RawUnitExerciseInput[];
  } | null>(null);

  const handleOpenFamiliesModal = (doc: Document) => {
    if (!doc.id) return;
    const docSections = allLessonSections?.filter(s => s.docId === doc.id) || [];
    const exerciseList: RawUnitExerciseInput[] = [];

    for (const sec of docSections) {
      if (sec.practiceExercises && sec.practiceExercises.length > 0) {
        for (const pe of sec.practiceExercises) {
          exerciseList.push({
            id: pe.id,
            title: pe.title || `تمرين`,
            questionText: pe.questionText || '',
            solutionText: pe.solutionText || '',
            strategyText: pe.strategyText || '',
            svgCode: pe.svgCode || ''
          });
        }
      }
    }

    if (exerciseList.length === 0) {
      showAlert('لا توجد تمارين', 'هذه الكراسة لا تحتوي على أي تمارين بعد. يُرجى إضافة تمارين أولاً ليتم تصنيفها وتوليد محطاتها.');
      return;
    }

    setFamiliesModalData({
      docId: doc.id,
      unitTitle: doc.unit || doc.title || 'الوحدة الحالية',
      exercises: exerciseList
    });
  };

  const showAlert = (title: string, message: string) => {
    setDialogConfig({ isOpen: true, title, message, type: 'alert' });
  };
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialogConfig({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  // Map exercise counts for all documents
  const docExerciseCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!allLessonSections) return counts;

    for (const sec of allLessonSections) {
      if (sec.docId) {
        const count = (sec.practiceExercises?.length || 0) + (sec.practicalExercises?.length || 0);
        counts.set(sec.docId, (counts.get(sec.docId) || 0) + count);
      }
    }
    return counts;
  }, [allLessonSections]);

  // Filtered documents list
  const filteredDocuments = useMemo(() => {
    if (!allDocuments) return [];

    return allDocuments.filter(doc => {
      if (doc.type !== 'exercise') return false; // This section is strictly for Unit Exercises & Problems

      if (countryFilter && doc.country !== countryFilter) return false;
      if (gradeFilter && doc.grade !== gradeFilter) return false;
      if (subjectFilter && doc.subject !== subjectFilter) return false;
      if (unitFilter && doc.unit !== unitFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = doc.title?.toLowerCase().includes(q);
        const matchTopic = doc.topic?.toLowerCase().includes(q);
        const matchUnit = doc.unit?.toLowerCase().includes(q);
        if (!matchTitle && !matchTopic && !matchUnit) return false;
      }

      return true;
    });
  }, [allDocuments, countryFilter, gradeFilter, subjectFilter, unitFilter, searchQuery]);

  // Handlers for Creating / Deleting Booklets
  const handleCreateBooklet = async () => {
    let effectiveTitle = newBooklet.title.trim();
    
    // Auto-calculate title if empty so user is never blocked
    if (!effectiveTitle) {
      if (selectedReferenceId) {
        const selectedRef = pdfReferences?.find(r => r.id === selectedReferenceId);
        effectiveTitle = selectedRef 
          ? `تمرينات ومسائل - ${selectedRef.unit ? selectedRef.unit : selectedRef.title}` 
          : `تمرينات ومسائل - ${newBooklet.unit || 'الوحدة'}`;
      } else {
        effectiveTitle = newBooklet.unit 
          ? `تمرينات ومسائل - ${newBooklet.unit}` 
          : (newBooklet.subject ? `تمرينات ومسائل - ${newBooklet.subject}` : 'تمرينات ومسائل الوحدة');
      }
    }

    setIsCreating(true);
    try {
      let docId: number;
      if (selectedReferenceId) {
        docId = await extractUnitExercisesFromReference(selectedReferenceId, {
          ...newBooklet,
          title: effectiveTitle,
          seriesName: newBooklet.seriesName || 'سلسلة التعلم الذكي📚✨'
        });
      } else {
        docId = (await db.documents.add({
          title: effectiveTitle,
          country: newBooklet.country || DEFAULT_METADATA.country,
          grade: newBooklet.grade || DEFAULT_METADATA.grade,
          subject: newBooklet.subject || DEFAULT_METADATA.subject,
          part: newBooklet.part || '',
          unit: newBooklet.unit || '',
          topic: newBooklet.topic || 'تمرينات ومسائل الوحدة',
          type: 'exercise',
          seriesName: newBooklet.seriesName || 'سلسلة التعلم الذكي📚✨',
          teacherName: newBooklet.teacherName || 'حسن راشد العلي',
          createdAt: Date.now(),
          updatedAt: Date.now()
        })) as number;

        // Create a dedicated practice section
        await db.lessonSections.add({
          docId,
          title: 'تمرينات ومسائل الوحدة',
          content: '',
          order: 0,
          isPracticeOnly: true,
          practiceSectionLabel: 'تمرينات ومسائل الوحدة:',
          practiceExercises: [],
          practicalExercises: []
        });
      }

      setIsCreateOpen(false);
      setActiveDocId(docId);
      setNewBooklet({
        title: '',
        country: DEFAULT_METADATA.country,
        grade: DEFAULT_METADATA.grade,
        subject: DEFAULT_METADATA.subject,
        part: DEFAULT_METADATA.part,
        unit: DEFAULT_METADATA.unit,
        topic: 'تمرينات ومسائل الوحدة',
        seriesName: 'سلسلة التعلم الذكي📚✨',
        teacherName: 'حسن راشد العلي'
      });
      setSelectedReferenceId(null);
      showAlert('تم الإنشاء بنجاح 🎉', 'تم إنشاء كراسة التمارين والمسائل بنجاح!');
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', err?.message || 'فشل إنشاء الكراسة.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteBooklet = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm('تأكيد الحذف', 'هل أنت متأكد من حذف كراسة التمارين بالكامل بجميع مسائله وحلولها؟', async () => {
      await db.documents.delete(id);
      await db.lessonSections.where({ docId: id }).delete();
      await db.exercises.where({ docId: id }).delete();
      if (activeDocId === id) setActiveDocId(null);
    });
  };

  // Handlers for Practice Exercises
  const handleSaveExercise = async (sectionId: number, updatedEx: PracticeExercise) => {
    try {
      const sec = await db.lessonSections.get(sectionId);
      if (sec) {
        const list = sec.practiceExercises || [];
        const existingIdx = list.findIndex(e => e.id === updatedEx.id);
        if (existingIdx >= 0) {
          list[existingIdx] = updatedEx;
        } else {
          list.push(updatedEx);
        }
        await db.lessonSections.update(sectionId, { practiceExercises: list });
        if (activeDocId) {
          await db.documents.update(activeDocId, { updatedAt: Date.now() });
        }
      }
      setEditingExModal(null);
      setVerifyingExModal(null);
    } catch (err) {
      console.error(err);
      showAlert('خطأ', 'حدث خطأ أثناء حفظ التمرين.');
    }
  };

  const handleDeleteExercise = async (sectionId: number, exerciseId: string) => {
    showConfirm('تأكيد الحذف', 'هل أنت متأكد من حذف هذا التمرين بشكل نهائي؟', async () => {
      const sec = await db.lessonSections.get(sectionId);
      if (sec && sec.practiceExercises) {
        const filtered = sec.practiceExercises.filter(e => e.id !== exerciseId);
        await db.lessonSections.update(sectionId, { practiceExercises: filtered });
        if (activeDocId) {
          await db.documents.update(activeDocId, { updatedAt: Date.now() });
        }
      }
    });
  };

  const handleDuplicateExercise = async (sectionId: number, ex: PracticeExercise) => {
    const sec = await db.lessonSections.get(sectionId);
    if (sec && sec.practiceExercises) {
      const duplicated: PracticeExercise = {
        ...ex,
        id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title: `${ex.title} (نسخة مكررة)`
      };
      const list = [...sec.practiceExercises, duplicated];
      await db.lessonSections.update(sectionId, { practiceExercises: list });
      showAlert('تم التكرار 📋', 'تم تكرار التمرين بنجاح.');
    }
  };

  const handleCopyExercise = (ex: PracticeExercise) => {
    const textToCopy = `📌 ${ex.title}\n\nنص المسألة:\n${ex.questionText}\n\n${ex.strategyText ? `💡 استراتيجية الحل:\n${ex.strategyText}\n\n` : ''}${ex.solutionText ? `🔑 الحل النموذجي:\n${ex.solutionText}` : ''}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(ex.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // AI Generation Handlers
  const handleAIGenerateSolution = async (sectionId: number, ex: PracticeExercise) => {
    if (!ex.questionText.trim()) {
      showAlert('تنبيه', 'يرجى كتابة نص المسألة أولاً لتوليد الحل بالذكاء الاصطناعي.');
      return;
    }
    setAiLoading({ exId: ex.id, type: 'solution' });
    try {
      const res = await generatePracticeExerciseSolutionAI(
        activeDocument?.title || 'تمرين تدرّب',
        ex.questionText,
        ex.solutionText || '',
        ex.strategyText || ''
      );
      if (res && res.solutionText) {
        const updated: PracticeExercise = {
          ...ex,
          solutionText: res.solutionText,
          strategyText: res.strategyText || ex.strategyText
        };
        await handleSaveExercise(sectionId, updated);
        showAlert('تم التوليد بنجاح ✨', 'تم توليد الحل النموذجي بالذكاء الاصطناعي بنجاح.');
      }
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', 'فشل توليد الحل بالذكاء الاصطناعي.');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAIShortenSolution = async (sectionId: number, ex: PracticeExercise) => {
    if (!ex.solutionText || !ex.solutionText.trim()) {
      showAlert('تنبيه', 'لا يوجد حل حالي لتقليصه.');
      return;
    }
    setAiLoading({ exId: ex.id, type: 'shorten' });
    try {
      const shortened = await shortenPracticeExerciseSolutionAI(
        ex.questionText,
        ex.solutionText
      );
      if (shortened && shortened.trim()) {
        const updated: PracticeExercise = {
          ...ex,
          solutionText: shortened.trim()
        };
        await handleSaveExercise(sectionId, updated);
        showAlert('تم تقليص الحل ✂️', 'تم تقليص واختصار خطوات الحل بنجاح.');
      }
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', 'فشل تقليص الحل بالذكاء الاصطناعي.');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAIGenerateSvg = async (sectionId: number, ex: PracticeExercise) => {
    if (!ex.questionText.trim()) {
      showAlert('تنبيه', 'يرجى كتابة نص المسألة أولاً لتوليد الرسم بالذكاء الاصطناعي.');
      return;
    }
    setAiLoading({ exId: ex.id, type: 'svg' });
    try {
      const svgCode = await generatePracticeExerciseSvgAI(
        activeDocument?.title || 'تمرين تدرّب',
        ex.questionText
      );
      if (svgCode && svgCode.trim()) {
        const updated: PracticeExercise = {
          ...ex,
          svgCode: svgCode.trim()
        };
        await handleSaveExercise(sectionId, updated);
        showAlert('تم توليد الرسم بنجاح 🎨', 'تم توليد وتطبيق رسم الـ SVG بنجاح.');
      }
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', 'فشل توليد رسم الـ SVG.');
    } finally {
      setAiLoading(null);
    }
  };

  const handleSolveAllUnsolved = async () => {
    if (!rawSections || rawSections.length === 0) return;
    showConfirm(
      'توليد حلول المسائل',
      'هل تريد فحص كافة المسائل في هذه الكراسة وتوليد الحلول النموذجية لأي مسألة غير محلولة بالذكاء الاصطناعي؟',
      async () => {
        setIsSolvingAll(true);
        try {
          for (const sec of rawSections) {
            let changed = false;
            const list = [...(sec.practiceExercises || [])];
            for (let i = 0; i < list.length; i++) {
              if (!list[i].solutionText || !list[i].solutionText.trim()) {
                try {
                  const res = await generatePracticeExerciseSolutionAI(
                    activeDocument?.title || 'تمرين تدرّب',
                    list[i].questionText,
                    list[i].solutionText || '',
                    list[i].strategyText || ''
                  );
                  if (res && res.solutionText) {
                    list[i] = {
                      ...list[i],
                      solutionText: res.solutionText,
                      strategyText: res.strategyText || list[i].strategyText
                    };
                    changed = true;
                  }
                } catch (e) {
                  console.error(e);
                }
              }
            }
            if (changed) {
              await db.lessonSections.update(sec.id!, { practiceExercises: list });
            }
          }
          if (activeDocId) {
            await db.documents.update(activeDocId, { updatedAt: Date.now() });
          }
          showAlert('اكتمل التوليد 🎉', 'تم توليد حلول المسائل غير المحلولة بنجاح!');
        } finally {
          setIsSolvingAll(false);
        }
      }
    );
  };

  // Export Booklet as Comprehensive JSON (100% Data Fidelity)
  const handleExportBookletJSON = async (doc: Document, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!doc.id) {
      showAlert('خطأ', 'لم يتم العثور على معرّف الكراسة للتصدير.');
      return;
    }
    try {
      const docId = doc.id;

      // 1. Fetch all lesson sections sorted by order
      const sections = await db.lessonSections.where({ docId }).sortBy('order');

      // 2. Fetch exercise families related to this document
      const exerciseFamilies = await db.exerciseFamilies.where('docId').equals(docId).toArray();

      // 3. Fetch classified families structured object
      let classifiedFamilies: any[] = [];
      try {
        classifiedFamilies = await loadUnitExerciseFamilies(docId);
      } catch (famErr) {
        console.warn('Could not load classified exercise families:', famErr);
      }

      // 4. Fetch exercise stations related to all exercises in this document
      const exerciseIds: (string | number)[] = [];
      sections.forEach(sec => {
        sec.practiceExercises?.forEach(ex => {
          if (ex.id) exerciseIds.push(ex.id);
        });
        sec.practicalExercises?.forEach(ex => {
          if (ex.id) exerciseIds.push(ex.id);
        });
      });

      let exerciseStations: any[] = [];
      if (exerciseIds.length > 0) {
        exerciseStations = await db.exerciseStations.where('exerciseId').anyOf(exerciseIds).toArray();
      }

      // 5. Fetch Unit Comprehensive Review, Quiz, MindMap, and PDF Content if present
      const comprehensiveReview = await db.unitComprehensiveReviews.where('docId').equals(docId).first();
      const unitQuiz = await db.unitQuizzes.where('docId').equals(docId).first();
      const unitMindMap = await db.unitMindMaps.where('docId').equals(docId).first();
      const pdfContent = await db.pdfContents.where('docId').equals(docId).first();

      const exportData = {
        type: 'comprehensive_exercise_package',
        version: '3.0',
        exportedAt: new Date().toISOString(),
        document: doc,
        booklet: doc, // for backward compatibility
        sections: sections.map(sec => ({
          ...sec,
          practiceExercises: sec.practiceExercises || [],
          practicalExercises: sec.practicalExercises || [],
          analysis: sec.analysis || { additions: [] }
        })),
        exerciseFamilies,
        exerciseStations,
        classifiedFamilies,
        unitComprehensiveReview: comprehensiveReview || null,
        comprehensiveReview: comprehensiveReview || null,
        unitQuiz: unitQuiz || null,
        quiz: unitQuiz || null,
        unitMindMap: unitMindMap || null,
        mindMap: unitMindMap || null,
        pdfContent: pdfContent ? { textContent: pdfContent.textContent, structuredContent: pdfContent.structuredContent } : null
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (doc.title || doc.unit || 'كراسة_التمارين_والمسائل').replace(/[/\\?%*:|"<> ]/g, '_');
      a.download = `${safeTitle}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      showAlert('فشل التصدير ❌', err.message || 'حدث خطأ أثناء تجميع وتصدير ملف JSON.');
    }
  };

  const handleExportJSON = async () => {
    if (!activeDocument) return;
    await handleExportBookletJSON(activeDocument);
  };

  // Import Booklet/Exercises from JSON (100% Comprehensive Fidelity)
  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = ev.target?.result as string;
        const data = JSON.parse(content);

        // 1. Resolve Document Object
        const docData = data.document || data.booklet || (Array.isArray(data.sections) ? data : null) || (Array.isArray(data.exercises) ? data : null);
        const importedSections = Array.isArray(data.sections) ? data.sections : (Array.isArray(docData?.sections) ? docData.sections : null);
        const directExercises = Array.isArray(data.exercises) ? data.exercises : (Array.isArray(data) ? data : null);

        const bookletTitle = docData?.title || data.title || file.name.replace(/\.json$/i, '') || 'كراسة تمارين ومسائل مستوردة';

        // 2. Insert Document with full academic metadata
        const newDocId = await db.documents.add({
          title: bookletTitle,
          grade: docData?.grade || DEFAULT_METADATA.grade || 'الثالث الثانوي العلمي',
          subject: docData?.subject || DEFAULT_METADATA.subject || 'رياضيات',
          country: docData?.country || DEFAULT_METADATA.country || 'سوريا',
          part: docData?.part || '',
          unit: docData?.unit || 'الوحدة الأولى',
          topic: docData?.topic || 'تمارين ومسائل وتطبيقات',
          type: 'exercise',
          seriesName: docData?.seriesName || 'سلسلة التمارين والمسائل الشاملة 📋✨',
          teacherName: docData?.teacherName || 'حسن راشد العلي',
          teacherRole: docData?.teacherRole || 'مدرّس مادة الرياضيات والعلوم التفاعلية',
          familiesAnalysis: docData?.familiesAnalysis || '',
          createdAt: typeof docData?.createdAt === 'number' ? docData.createdAt : Date.now(),
          updatedAt: Date.now()
        });

        // 3. Process Exercise Families (Map Old IDs -> New IDs)
        const familyIdMap = new Map<string | number, string | number>();
        if (Array.isArray(data.exerciseFamilies) && data.exerciseFamilies.length > 0) {
          for (const fam of data.exerciseFamilies) {
            const oldId = fam.id;
            const { id, ...famData } = fam;
            const newFamilyId = await db.exerciseFamilies.add({
              ...famData,
              docId: newDocId,
              createdAt: famData.createdAt || Date.now(),
              updatedAt: Date.now()
            });
            if (oldId !== undefined) {
              familyIdMap.set(oldId, newFamilyId);
            }
          }
        }

        // Helper to remap family_id in exercises while preserving 100% of exercise fields
        const remapExercises = (exercises: any[]) => {
          if (!Array.isArray(exercises)) return [];
          return exercises.map((ex: any, idx: number) => {
            const questionVal = ex.questionText || ex.question || '';
            const solutionVal = ex.solutionText || ex.solution || '';
            const strategyVal = ex.strategyText || ex.strategy_text || ex.tactic || '';
            const cleanEx: PracticeExercise = {
              id: ex.id || `ex_${Date.now()}_${idx}`,
              title: ex.title || `تمرين ${idx + 1}`,
              questionText: questionVal,
              solutionText: solutionVal,
              strategyText: strategyVal,
              svgCode: ex.svgCode || '',
              guidedQuestions: Array.isArray(ex.guidedQuestions) ? ex.guidedQuestions : undefined,
              family_id: ex.family_id !== undefined && familyIdMap.has(ex.family_id) ? familyIdMap.get(ex.family_id) : ex.family_id,
              is_lead_exercise: Boolean(ex.is_lead_exercise),
              primary_concept: ex.primary_concept || '',
              secondary_concepts: Array.isArray(ex.secondary_concepts) ? ex.secondary_concepts : [],
              patternType: ex.patternType || ''
            };
            return cleanEx;
          });
        };

        // 4. Process Sections (preserve 100% of fields, exercises, practical exercises, and analysis)
        if (Array.isArray(importedSections) && importedSections.length > 0) {
          let order = 0;
          for (const sec of importedSections) {
            let exercises = Array.isArray(sec.practiceExercises) 
              ? sec.practiceExercises 
              : (Array.isArray(sec.exercises) ? sec.exercises : []);

            exercises = remapExercises(exercises);
            const practicalExercises = remapExercises(sec.practicalExercises || []);

            await db.lessonSections.add({
              docId: newDocId,
              title: sec.title || `مجموعة تمارين #${order + 1}`,
              content: sec.content || '',
              svgCode: sec.svgCode || '',
              order: typeof sec.order === 'number' ? sec.order : order++,
              isPracticeOnly: sec.isPracticeOnly !== undefined ? Boolean(sec.isPracticeOnly) : true,
              conceptLabel: sec.conceptLabel ?? '',
              practiceSectionLabel: sec.practiceSectionLabel ?? '',
              practicalSectionLabel: sec.practicalSectionLabel ?? '',
              practiceExercises: exercises,
              practicalExercises: practicalExercises,
              analysis: sec.analysis || { additions: [] }
            });
          }
        } else if (Array.isArray(directExercises) && directExercises.length > 0) {
          const remappedDirect = remapExercises(directExercises);
          await db.lessonSections.add({
            docId: newDocId,
            title: `تمارين ومسائل - ${bookletTitle}`,
            content: '',
            svgCode: '',
            order: 0,
            isPracticeOnly: true,
            conceptLabel: '',
            practiceSectionLabel: '',
            practicalSectionLabel: '',
            practiceExercises: remappedDirect,
            practicalExercises: [],
            analysis: { additions: [] }
          });
        } else {
          await db.lessonSections.add({
            docId: newDocId,
            title: 'تمارين ومسائل الوحدة',
            content: '',
            svgCode: '',
            order: 0,
            isPracticeOnly: true,
            conceptLabel: '',
            practiceSectionLabel: '',
            practicalSectionLabel: '',
            practiceExercises: [],
            practicalExercises: [],
            analysis: { additions: [] }
          });
        }

        // 5. Process Classified Families if available
        if (Array.isArray(data.classifiedFamilies) && data.classifiedFamilies.length > 0) {
          for (const fam of data.classifiedFamilies) {
            try {
              await saveExerciseFamilyAtomic(newDocId, fam);
            } catch (famErr) {
              console.warn('Error saving classified family atomically:', famErr);
            }
          }
        }

        // 6. Process Exercise Stations (Ensure all 4 stations + choices + misconceptions + hints are added)
        if (Array.isArray(data.exerciseStations) && data.exerciseStations.length > 0) {
          const stationsToAdd = data.exerciseStations.map((st: any) => {
            const { id, ...stData } = st;
            return {
              ...stData,
              choices: Array.isArray(stData.choices) ? stData.choices : [],
              createdAt: stData.createdAt || Date.now(),
              updatedAt: Date.now()
            };
          });
          if (stationsToAdd.length > 0) {
            await db.exerciseStations.bulkAdd(stationsToAdd);
          }
        }

        // 7. Process Unit Comprehensive Review if available
        const revData = data.unitComprehensiveReview || data.comprehensiveReview || docData?.unitComprehensiveReview;
        if (revData && typeof revData === 'object') {
          await db.unitComprehensiveReviews.add({
            docId: newDocId,
            title: revData.title || `مراجعة شاملة: ${bookletTitle}`,
            unit: revData.unit || bookletTitle,
            grade: revData.grade || docData?.grade || DEFAULT_METADATA.grade,
            subject: revData.subject || docData?.subject || DEFAULT_METADATA.subject,
            summaryText: revData.summaryText || '',
            definitions: Array.isArray(revData.definitions) ? revData.definitions : [],
            theorems: Array.isArray(revData.theorems) ? revData.theorems : [],
            results: Array.isArray(revData.results) ? revData.results : [],
            trapsAndTips: Array.isArray(revData.trapsAndTips) ? revData.trapsAndTips : [],
            formulasSummary: revData.formulasSummary || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }

        // 8. Process Unit Quiz if available
        const quizData = data.unitQuiz || data.quiz || docData?.unitQuiz;
        if (quizData && typeof quizData === 'object' && Array.isArray(quizData.questions) && quizData.questions.length > 0) {
          await db.unitQuizzes.add({
            docId: newDocId,
            title: quizData.title || `اختبار الوحدة الشامل: ${bookletTitle}`,
            unit: quizData.unit || bookletTitle,
            grade: quizData.grade || docData?.grade || DEFAULT_METADATA.grade,
            subject: quizData.subject || docData?.subject || DEFAULT_METADATA.subject,
            totalQuestions: typeof quizData.totalQuestions === 'number' ? quizData.totalQuestions : quizData.questions.length,
            passingScore: typeof quizData.passingScore === 'number' ? quizData.passingScore : 70,
            questions: quizData.questions,
            validationScore: quizData.validationScore,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }

        // 9. Process Unit Mind Map if available
        const mindMapData = data.unitMindMap || data.mindMap || docData?.unitMindMap;
        if (mindMapData && typeof mindMapData === 'object' && (mindMapData.svgCode || mindMapData.treeData || mindMapData.markdownSchema)) {
          await db.unitMindMaps.add({
            docId: newDocId,
            title: mindMapData.title || `خريطة المفاهيم: ${bookletTitle}`,
            svgCode: mindMapData.svgCode || '',
            markdownSchema: mindMapData.markdownSchema || '',
            treeData: mindMapData.treeData || null,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }

        // 10. Process PDF Content if available
        const pdfData = data.pdfContent || docData?.pdfContent;
        if (pdfData && typeof pdfData === 'object' && (pdfData.textContent || pdfData.structuredContent)) {
          await db.pdfContents.add({
            docId: newDocId,
            textContent: pdfData.textContent || '',
            structuredContent: pdfData.structuredContent || undefined
          });
        }

        setActiveDocId(newDocId);
        showAlert('اكتمل الاستيراد بنجاح 100% 🎉', `تم استيراد كراسة التمارين والمسائل "${bookletTitle}" بكافة عناصرها (المسائل، الحلول الكاملة، الرسوم، عائلات التمارين، المحطات التوجيهية الـ 4، والخيارات والمشتتات والتلميحات) دون أي نقصان!`);
      } catch (err: any) {
        console.error(err);
        showAlert('فشل الاستيراد ❌', err.message || 'فشل تحليل ملف JSON المستورد وعرضه.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="w-full min-h-screen bg-gray-50/50 p-4 md:p-6 text-right font-sans" dir="rtl">
      {/* Dynamic Print CSS Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Ensure SVGs inside math renderer have dimensions properly managed */
        .math-markdown-content div[style*="width"],
        #print-area div[style*="width"] {
          max-width: none !important;
          max-height: none !important;
        }
        .math-markdown-content div[style*="width"] svg,
        #print-area div[style*="width"] svg,
        #print-area svg {
          max-width: none !important;
        }

        @media print {
          @page {
            size: A4;
            margin-top: 15mm;
            margin-bottom: 15mm;
            margin-left: 15mm;
            margin-right: 15mm;
            ${printSettings.printAllPagesFooter ? `
            @bottom-left {
              content: "الصفحة " counter(page);
              font-family: ${printSettings.printFont === 'default' ? "'Cairo', sans-serif" : "inherit"};
              font-size: ${printSettings.printFooterFontSize}pt;
              font-weight: bold;
              color: #4b5563;
              direction: rtl;
            }
            @bottom-right {
              content: "${printSettings.printFooterText.replace('{teacherName}', activeDocument?.teacherName || 'حسن راشد العلي')}";
              font-family: ${printSettings.printFont === 'default' ? "'Cairo', sans-serif" : "inherit"};
              font-size: ${printSettings.printFooterFontSize}pt;
              font-weight: ${printSettings.printFooterIsBold ? 'bold' : 'normal'};
              color: #4b5563;
              direction: rtl;
            }
            ` : ''}
          }

          @page :first {
            @bottom-left {
              content: none !important;
            }
            @bottom-right {
              content: none !important;
            }
          }

          /* Full horizontal width and zero-margin resets on outer wrappers */
          html, body, main, #root, #root > div, #print-area {
            position: static !important;
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
            transition: none !important;
            width: 100% !important;
            max-width: none !important;
            float: none !important;
          }

          [class*="max-w-"], .min-h-screen {
            max-width: none !important;
            min-height: 0 !important;
            height: auto !important;
          }

          body {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            counter-reset: page;
          }

          .no-print, header, nav, button, input, select, textarea {
            display: none !important;
          }

          #print-area {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            position: static !important;
          }

          .print-cover-page {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
            height: 245mm !important;
            max-height: 245mm !important;
            box-sizing: border-box !important;
            padding: 2.5rem !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            border-radius: 12px !important;
            counter-reset: page 0;
            position: relative !important;
            z-index: 50 !important;
            isolation: isolate !important;
            background-color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            ${getCoverPrintCss(printSettings.coverBgStyle)}
          }

          #print-area > table {
            counter-reset: page 0;
            width: 100% !important;
          }

          .print-page-header {
            display: table-header-group !important;
          }

          .print-page-footer {
            display: none !important;
          }

          /* Global Foreground Watermark rotated at 45 degrees - placed below cover page */
          body #print-area .print-global-watermark {
            display: block !important;
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            width: auto !important;
            height: auto !important;
            transform: translate(-50%, -50%) rotate(-45deg) !important;
            -webkit-transform: translate(-50%, -50%) rotate(-45deg) !important;
            font-size: 70pt !important;
            font-weight: 900 !important;
            color: rgba(124, 58, 237, ${printSettings.watermarkOpacity}) !important;
            white-space: nowrap !important;
            pointer-events: none !important;
            z-index: 1 !important;
            user-select: none !important;
            direction: rtl !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          .print-page-counter::after {
            content: counter(page);
          }

          /* Custom question background and styles for printing */
          #print-area .question-box {
            background-color: ${printSettings.questionBgColor || '#f0f9ff'} !important;
            background: ${printSettings.questionBgColor || '#f0f9ff'} !important;
            padding: 0.75rem 1rem !important;
            border-radius: 0.5rem !important;
            border: 1px solid #cbd5e1 !important;
            margin-bottom: 0.5rem !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            display: block !important;
          }

          /* Custom solution background and styles for printing */
          #print-area .solution-box {
            background-color: ${printSettings.solutionBgColor || '#f0fdf4'} !important;
            background: ${printSettings.solutionBgColor || '#f0fdf4'} !important;
            padding: 0.75rem 1rem !important;
            border-radius: 0.5rem !important;
            border-right: 4px solid #10b981 !important;
            border-top: 1px solid #e2e8f0 !important;
            border-bottom: 1px solid #e2e8f0 !important;
            border-left: 1px solid #e2e8f0 !important;
            margin-bottom: 0.5rem !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            display: block !important;
          }

          /* Strategy box in print */
          #print-area .strategy-box {
            background-color: #fefce8 !important;
            background: #fefce8 !important;
            border: 1px solid #78350f !important;
            padding: 0.6rem 0.9rem !important;
            border-radius: 0.5rem !important;
            margin-bottom: 0.5rem !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            display: block !important;
          }

          /* Avoid breaking cards inside printed page & remove outer card container */
          .page-break-avoid, #print-area .page-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            display: block !important;
            margin-bottom: 1rem !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: transparent !important;
          }

          #print-area svg,
          #print-area [class*="float-left"] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /* Header bar in print */
          #print-area .print-page-header .print-header-bar {
            background-color: ${printSettings.printHeaderBgColor} !important;
            background: ${printSettings.printHeaderBgColor} !important;
            font-size: ${printSettings.printHeaderFontSize}pt !important;
            height: ${printSettings.printHeaderHeight}px !important;
            line-height: ${printSettings.printHeaderHeight}px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            color: ${getContrastColor(printSettings.printHeaderBgColor)} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        #print-area,
        #print-area *:not(h1):not(h1 *):not(h2):not(h2 *):not(h3):not(h3 *):not(.katex):not(.katex *) {
          font-family: ${getFontFamilyCss(printSettings.printFont)} !important;
        }

        #print-area h2:not(.print-cover-page *), 
        #print-area h3:not(.print-cover-page *) {
          font-family: ${getFontFamilyCss(printSettings.printHeadingFont === 'default' ? printSettings.printFont : printSettings.printHeadingFont)} !important;
          font-size: ${printSettings.printHeadingFontSize}pt !important;
        }

        #print-area .math-renderer,
        #print-area .math-renderer p,
        #print-area p:not(.print-cover-page *),
        #print-area span:not(.katex *) {
          font-size: ${printSettings.printFontSize}pt !important;
          line-height: 1.85 !important;
        }
      `}} />

      {/* Unified Top Header Bar */}
      <div className="no-print">
        <UnifiedPageHeader
          icon={BookOpen}
          title="كراسات تمرينات ومسائل الوحدة"
          subtitle="استعراض وحل وتدقيق تمرينات ومسائل الوحدة الشاملة بتنسيق تفاعلي وطباعي فاخر"
          badgeText={`${filteredDocuments.length} كراسة`}
          badgeColor="violet"
          actions={
            <>
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
                >
                  <ArrowRight size={15} />
                  <span>العودة للمكتبة</span>
                </button>
              )}
              <label className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer">
                <Upload size={14} />
                <span>استيراد تمارين ومسائل</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                <Plus size={15} />
                <span>كراسة تمارين جديدة</span>
              </button>
            </>
          }
        />
      </div>

      {/* MAIN VIEW: BOOKLETS LIST vs ACTIVE BOOKLET VIEW */}
      {!activeDocId ? (
        <div className="space-y-6 no-print">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                <Filter size={15} className="text-violet-600" />
                <span>تصفية كراسات تمرينات ومسائل الوحدة</span>
              </div>
              {(countryFilter || gradeFilter || subjectFilter || unitFilter || searchQuery) && (
                <button
                  onClick={() => {
                    setCountryFilter('');
                    setGradeFilter('');
                    setSubjectFilter('');
                    setUnitFilter('');
                    setSearchQuery('');
                  }}
                  className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                >
                  <X size={12} />
                  <span>إعادة ضبط التصفية</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* Country */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">الدولة</label>
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">كل الدول</option>
                  {COUNTRIES.filter(c => c !== 'آخر').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Grade */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">الصف</label>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">كل الصفوف</option>
                  {GRADES.filter(g => g !== 'آخر').map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">المادة</label>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">كل المواد</option>
                  {SUBJECTS.filter(s => s !== 'آخر').map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Unit */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">الوحدة</label>
                <select
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">كل الوحدات</option>
                  {ALL_DEFAULT_MATH_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">بحث بالعنوان</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث..."
                  className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          {filteredDocuments.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl shadow-xs border-2 border-dashed border-gray-200">
              <FileText size={56} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-600 text-base font-bold">لا توجد كراسات تمارين أو دروس مطابقة للتصفية.</p>
              <p className="text-gray-400 text-xs mt-1">ابدأ بإنشاء كراسة تمارين جديدة أو استخراج المسائل من كتاب PDF!</p>
              <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer">
                  <Upload size={16} />
                  <span>استيراد تمارين ومسائل (JSON) 📂</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJSON}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-violet-700 transition-all cursor-pointer"
                >
                  <Plus size={16} /> إنشاء كراسة تمارين جديدة ➕
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map(doc => {
                const exCount = docExerciseCounts.get(doc.id!) || 0;
                return (
                  <div 
                    key={doc.id}
                    className="bg-white rounded-2xl p-5 border border-gray-200 hover:border-violet-300 hover:shadow-md transition-all duration-200 relative flex flex-col justify-between group overflow-hidden"
                  >
                    <div>
                      {/* Header with Badges & Actions */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg border ${
                            doc.type === 'exercise' 
                              ? 'bg-violet-50 text-violet-700 border-violet-100' 
                              : doc.type === 'lesson'
                                ? 'bg-purple-50 text-purple-700 border-purple-100'
                                : 'bg-amber-50 text-amber-800 border-amber-100'
                          }`}>
                            {doc.type === 'exercise' ? 'كراسة تدرّب (مسائل)' : doc.type === 'lesson' ? 'شرح درس (تدرّب)' : 'مرجع (PDF)'}
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                            ✨ {exCount} تمرين
                          </span>
                          {doc.id && <UnitSyncIndicator docId={doc.id} compact={true} />}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleExportBookletJSON(doc, e)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                            title="تصدير كراسة التمارين والمسائل 100% كملف JSON"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDoc(doc);
                            }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                            title="تعديل بيانات وترويسة الكراسة"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteBooklet(doc.id!, e)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف الكراسة"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 
                        className="text-base font-black text-slate-900 mb-2.5 leading-snug line-clamp-2 hover:text-violet-600 cursor-pointer transition-colors" 
                        onClick={() => setActiveDocId(doc.id!)}
                      >
                        {doc.title}
                      </h3>

                      {/* Metadata Badges */}
                      <div className="space-y-2.5 mb-4">
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                            <Globe size={11} className="text-slate-500" />
                            <span>{doc.country || 'سوريا'}</span>
                          </span>
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1">
                            <GraduationCap size={11} className="text-indigo-500" />
                            <span>{doc.grade}</span>
                          </span>
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                            <BookOpen size={11} className="text-emerald-500" />
                            <span>{doc.subject}</span>
                          </span>
                        </div>

                        {(doc.part || doc.unit) && (
                          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-gray-600">
                            {doc.part && (
                              <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200/60 flex items-center gap-1">
                                <Layers size={10} className="text-amber-600" />
                                <span>{doc.part}</span>
                              </span>
                            )}
                            {doc.unit && (
                              <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200/60 flex items-center gap-1">
                                <BookMarked size={10} className="text-purple-600" />
                                <span>{doc.unit}</span>
                              </span>
                            )}
                          </div>
                        )}

                        {doc.topic && (
                          <p className="text-[11px] text-gray-600 font-bold bg-gray-50/80 border border-gray-100 px-2.5 py-1 rounded-lg line-clamp-1">
                            {doc.topic}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-3.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFamiliesModal(doc);
                        }}
                        className="py-1.5 px-2.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-black rounded-xl text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                        title="تصنيف تمارين هذه الوحدة في عائلات وتوليد محطات الحل الموجّه"
                      >
                        <span>🔀 تصنيف العائلات والمحطات</span>
                      </button>
                      <button 
                        onClick={() => setActiveDocId(doc.id!)}
                        className="py-1.5 px-3 bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white font-extrabold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      >
                        <span>فتح وتصفح الكراسة</span>
                        <ArrowRight size={13} className="rotate-180" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ACTIVE BOOKLET VIEW */
        <div className="space-y-6">
          {/* Cloud Synchronization & Publishing Banner */}
          {activeDocument?.id && (
            <div className="bg-gradient-to-r from-violet-50 via-indigo-50/60 to-purple-50 p-4 rounded-2xl border border-violet-200/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
                  <Cloud size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-slate-900">اعتماد ونشر كراسة التمارين والمسائل سحابياً (Supabase)</h4>
                    <UnitSyncIndicator docId={activeDocument.id} compact={false} />
                  </div>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    يشمل المزامنة الكاملة: نص السؤال • الحل المفصل والتكتيك • رسوم الـ SVG • عائلات التمارين • المحطات التوجيهية الـ 4 والخيارات والمشتتات والتلميحات
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
                <SyncControlButton
                  table="documents"
                  id={activeDocument.id}
                  data={activeDocument}
                  showDraftOption={true}
                  buttonText="نشر ومزامنة التمارين والمسائل بالكامل"
                />
              </div>
            </div>
          )}

          {/* Action & Control Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveDocId(null)}
                className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-all cursor-pointer"
                title="رجوع لكافة الكراسات"
              >
                <ArrowRight size={18} />
              </button>
              <div>
                <h2 className="text-lg font-black text-slate-900">{activeDocument?.title}</h2>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-500 mt-1">
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">{activeDocument?.country || 'سوريا'}</span>
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">{activeDocument?.grade}</span>
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100">{activeDocument?.subject}</span>
                  {activeDocument?.unit && (
                    <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-100">الوحدة: {activeDocument?.unit}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Cloud Sync Direct Button */}
              {activeDocument?.id && (
                <SyncControlButton
                  table="documents"
                  id={activeDocument.id}
                  data={activeDocument}
                  variant="compact"
                  showDraftOption={true}
                />
              )}

              {/* AI Family Classification & Stations Generator */}
              <button
                onClick={() => activeDocument && handleOpenFamiliesModal(activeDocument)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer"
                title="تصنيف تمارين هذه الوحدة في عائلات وتوليد محطات الحل الموجّه"
              >
                <span>🔀 تصنيف العائلات وتوليد محطات الحل</span>
              </button>

              {/* Batch Solve Unsolved */}
              <button
                onClick={handleSolveAllUnsolved}
                disabled={isSolvingAll}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer disabled:opacity-50"
                title="توليد حلول كافة المسائل غير المحلولة بالذكاء الاصطناعي"
              >
                {isSolvingAll ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>{isSolvingAll ? 'جاري الحل...' : 'حل غير المحلول بالذكاء ✨'}</span>
              </button>

              {/* Show / Hide Solutions */}
              <button
                onClick={() => setShowSolutions(!showSolutions)}
                className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  showSolutions ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                }`}
              >
                {showSolutions ? <Eye size={15} /> : <EyeOff size={15} />}
                <span>{showSolutions ? 'إخفاء الحلول' : 'عرض الحلول'}</span>
              </button>

              {/* Edit Booklet Metadata */}
              <button
                onClick={() => setEditingDoc(activeDocument)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer"
                title="تعديل العناوين والتفاصيل الأساسية وبيانات الغلاف"
              >
                <Edit3 size={14} />
                <span>تعديل المسميات/الغلاف 📝</span>
              </button>

              {/* Print Settings Toggle */}
              <button
                onClick={() => setShowPrintSettings(!showPrintSettings)}
                className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  showPrintSettings ? 'bg-violet-100 text-violet-800 border-violet-300' : 'bg-white text-gray-700 border-gray-200'
                }`}
                title="تخصيص الخطوط والغلاف وإعدادات الطباعة"
              >
                <Settings2 size={15} />
                <span>إعدادات الطباعة ⚙️</span>
              </button>

              {/* Import JSON */}
              <label className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all cursor-pointer">
                <Upload size={15} />
                <span>استيراد تمارين ومسائل 📂</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>

              {/* Export JSON */}
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="تصدير الكراسة والتمارين كملف JSON"
              >
                <Download size={15} />
                <span>تصدير JSON 💾</span>
              </button>

              {/* Print */}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-l from-violet-600 to-indigo-600 text-white rounded-xl text-xs font-black hover:opacity-95 transition-all cursor-pointer shadow-xs"
              >
                <Printer size={15} />
                <span>طباعة / PDF 🖨️</span>
              </button>
            </div>
          </div>

          {/* Print Settings Panel */}
          <ExercisePrintSettingsPanel
            settings={printSettings}
            onChange={(updated) => setPrintSettings(prev => ({ ...prev, ...updated }))}
            isOpen={showPrintSettings}
            onClose={() => setShowPrintSettings(false)}
            onPrint={() => window.print()}
          />

          {/* PRINT AREA CONTAINER */}
          <div id="print-area" className="space-y-6">
            {/* Global Watermark (Print Only) */}
            {printSettings.showWatermark && (
              <div className="hidden print:block print-global-watermark font-sans">
                {printSettings.watermarkText}
              </div>
            )}

            {/* Cover Page */}
            {printSettings.includeCoverPage && activeDocument && (
              <ExerciseCoverPage
                document={activeDocument}
                coverBgStyle={printSettings.coverBgStyle}
                footerText={printSettings.printFooterText}
                onEditMetadata={() => setEditingDoc(activeDocument)}
              />
            )}

            {/* Content Table Wrapper with Repeating Header */}
            <table className="relative block print:table w-full border-collapse">
              {/* Repeating Page Header */}
              {printSettings.printAllPagesHeader && activeDocument && (
                <thead className="hidden print:table-header-group print-page-header font-sans">
                  <tr>
                    <td>
                      <div 
                        className="flex justify-between items-center w-full rounded-full px-6 mb-2 font-black shadow-xs" 
                        style={{ 
                          direction: 'rtl',
                          backgroundColor: printSettings.printHeaderBgColor,
                          fontSize: `${printSettings.printHeaderFontSize}pt`,
                          height: `${printSettings.printHeaderHeight}px`,
                          color: getContrastColor(printSettings.printHeaderBgColor)
                        }}
                      >
                        <span>{printSettings.printHeaderRightText.replace('{unitName}', activeDocument.unit || '').replace('{title}', activeDocument.title || '').replace('{seriesName}', activeDocument.seriesName || 'سلسلة التعلم الذكي📚✨')}</span>
                        <span>{printSettings.printHeaderLeftText.replace('{unitName}', activeDocument.unit || '').replace('{title}', activeDocument.title || '').replace('{seriesName}', activeDocument.seriesName || 'سلسلة التعلم الذكي📚✨')}</span>
                      </div>
                      <div className="border-b border-gray-300 w-full mb-4" />
                    </td>
                  </tr>
                </thead>
              )}

              {/* Main Content Body */}
              <tbody className="block print:table-row-group">
                <tr className="block print:table-row">
                  <td className="block print:table-cell">
                    <div className="space-y-8">
                      {rawSections?.map((sec, secIdx) => {
                        const exercises = sec.practiceExercises || [];
                        return (
                          <div key={sec.id || secIdx} className="bg-white p-6 rounded-3xl border border-violet-100 print:p-0 print:border-none print:shadow-none print:bg-transparent shadow-xs space-y-6 print:space-y-4">
                            {/* Section Header (Hidden in Print to prevent redundant title after cover page) */}
                            <div className="flex items-center justify-between border-b border-violet-100 pb-3 no-print">
                              <h3 className="text-base font-black text-violet-900 font-sans flex items-center gap-2">
                                <span className="w-2 h-5 bg-violet-600 rounded-full" />
                                <span>{sec.practiceSectionLabel || sec.title || 'التمارين والمسائل (فقرة تدرّب)'}</span>
                              </h3>
                              <button
                                onClick={() => {
                                  const newEx: PracticeExercise = {
                                    id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                    title: `التمرين ${exercises.length + 1}`,
                                    questionText: '',
                                    strategyText: '',
                                    solutionText: '',
                                    svgCode: ''
                                  };
                                  setEditingExModal({ sectionId: sec.id!, exercise: newEx });
                                }}
                                className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer"
                              >
                                <Plus size={14} /> إضافة تمرين جديد ➕
                              </button>
                            </div>

                            {/* Exercises List */}
                            {exercises.length > 0 ? (
                              <div className="space-y-6">
                                {exercises.map((ex, exIdx) => (
                                  <ExerciseCard
                                    key={ex.id}
                                    exercise={ex}
                                    index={exIdx}
                                    sectionId={sec.id!}
                                    showSolutions={showSolutions}
                                    copiedId={copiedId}
                                    aiLoading={aiLoading}
                                    onEdit={() => setEditingExModal({ sectionId: sec.id!, exercise: { ...ex } })}
                                    onVerify={() => setVerifyingExModal({ sectionId: sec.id!, exercise: { ...ex } })}
                                    onGenerateSolution={() => handleAIGenerateSolution(sec.id!, ex)}
                                    onShortenSolution={() => handleAIShortenSolution(sec.id!, ex)}
                                    onGenerateSvg={() => handleAIGenerateSvg(sec.id!, ex)}
                                    onCopy={() => handleCopyExercise(ex)}
                                    onDuplicate={() => handleDuplicateExercise(sec.id!, ex)}
                                    onDelete={() => handleDeleteExercise(sec.id!, ex.id)}
                                  />
                                ))}

                                {/* Add New Exercise Bottom Button */}
                                <div className="no-print pt-2">
                                  <button
                                    onClick={() => {
                                      const newEx: PracticeExercise = {
                                        id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                        title: `التمرين ${exercises.length + 1}`,
                                        questionText: '',
                                        strategyText: '',
                                        solutionText: '',
                                        svgCode: ''
                                      };
                                      setEditingExModal({ sectionId: sec.id!, exercise: newEx });
                                    }}
                                    className="w-full py-3 bg-violet-50/60 hover:bg-violet-100/80 border-2 border-dashed border-violet-200 text-violet-800 hover:text-violet-950 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                                  >
                                    <Plus size={16} />
                                    <span>إضافة تمرين جديد إلى هذه الكراسة ✍️</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Empty State */
                              <div className="p-8 text-center bg-violet-50/40 rounded-2xl border-2 border-dashed border-violet-200 space-y-3 no-print">
                                <div className="w-12 h-12 bg-violet-100 text-violet-700 rounded-full flex items-center justify-center mx-auto text-xl shadow-xs">
                                  ✍️
                                </div>
                                <h4 className="text-sm font-black text-violet-950 font-sans">
                                  الكراسة فارغة (جاهزة لإضافة المسائل والحلول)
                                </h4>
                                <p className="text-xs text-gray-500 font-medium max-w-md mx-auto leading-relaxed">
                                  اضغط على الزر أدناه لإضافة تمرين جديد وكتابة نص المسألة، استراتيجية وفكرة الحل، خطوات الحل النموذجي، والرسوم الهندسية.
                                </p>
                                <div className="pt-2">
                                  <button
                                    onClick={() => {
                                      const newEx: PracticeExercise = {
                                        id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                        title: `التمرين 1`,
                                        questionText: '',
                                        strategyText: '',
                                        solutionText: '',
                                        svgCode: ''
                                      };
                                      setEditingExModal({ sectionId: sec.id!, exercise: newEx });
                                    }}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer"
                                  >
                                    <Plus size={16} />
                                    <span>إضافة التمرين الأول ➕</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE BOOKLET MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-150 p-6 max-w-xl w-full shadow-2xl space-y-4 text-right" dir="rtl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-black text-indigo-950">إنشاء كراسة تمارين ومسائل جديدة 📋</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              {/* Reference Selection */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1">
                  المرجع (لاستخراج تمرينات ومسائل الوحدة بالذكاء الاصطناعي - اختياري):
                </label>
                <select 
                  value={selectedReferenceId || ''}
                  onChange={(e) => {
                    const refId = e.target.value ? Number(e.target.value) : null;
                    setSelectedReferenceId(refId);
                    if (refId) {
                      const refDoc = pdfReferences?.find(r => r.id === refId);
                      if (refDoc) {
                        setNewBooklet(prev => ({
                          ...prev,
                          title: prev.title.trim() || `تمرينات ومسائل - ${refDoc.unit ? refDoc.unit : refDoc.title}`,
                          country: refDoc.country || prev.country,
                          grade: refDoc.grade || prev.grade,
                          subject: refDoc.subject || prev.subject,
                          part: refDoc.part || prev.part,
                          unit: refDoc.unit || prev.unit,
                          topic: refDoc.topic || 'تمرينات ومسائل الوحدة'
                        }));
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">كراسة فارغة (بدون مرجع - إضافة التمارين يدوياً)</option>
                  {pdfReferences?.map(ref => (
                    <option key={ref.id} value={ref.id}>{ref.title}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1 font-medium">
                  عند اختيار كتاب أو مرجع PDF، سيقوم الذكاء الاصطناعي باستخلاص قسم "تمرينات ومسائل الوحدة" الموجود في نهاية الوحدة فقط وتوليد كراسة التمارين والمسائل تلقائياً.
                </p>
              </div>

              {/* Title Field (Explicitly visible & editable) */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1">
                  عنوان كراسة التمارين والمسائل: <span className="text-violet-600">*</span>
                </label>
                <input
                  type="text"
                  value={newBooklet.title}
                  onChange={(e) => setNewBooklet(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={
                    selectedReferenceId 
                      ? 'مثال: تمرينات ومسائل - النهايات والاستمرار' 
                      : 'مثال: كراسة تمرينات ومسائل - التحليل الرياضي'
                  }
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:ring-1 focus:ring-violet-500 outline-none"
                />
              </div>

              {/* Academic Metadata Fields */}
              <div className="pt-2 border-t">
                <AcademicMetadataFields
                  metadata={newBooklet}
                  onChange={(m) => setNewBooklet(prev => ({ 
                    ...prev, 
                    ...m,
                    title: prev.title.trim() ? prev.title : (m.unit ? `تمرينات ومسائل - ${m.unit}` : prev.title)
                  }))}
                  showTopic={true}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t text-xs">
              <button
                disabled={isCreating}
                onClick={() => setIsCreateOpen(false)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                disabled={isCreating}
                onClick={handleCreateBooklet}
                className="flex items-center justify-center min-w-[150px] px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black transition-colors shadow-md shadow-violet-100 cursor-pointer"
              >
                {isCreating ? <Loader2 size={16} className="animate-spin" /> : 'إنشاء وتصفح الكراسة ✨'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EXERCISE MODAL */}
      {editingExModal && (
        <ExerciseEditModal
          sectionId={editingExModal.sectionId}
          exercise={editingExModal.exercise}
          onClose={() => setEditingExModal(null)}
          onSave={(updated) => handleSaveExercise(editingExModal.sectionId, updated)}
          onAIGenerateSolution={async (ex) => {
            await handleAIGenerateSolution(editingExModal.sectionId, ex);
          }}
          onAIGenerateSvg={async (ex) => {
            await handleAIGenerateSvg(editingExModal.sectionId, ex);
          }}
          aiLoading={aiLoading?.type || null}
        />
      )}

      {/* VERIFY EXERCISE MODAL */}
      {verifyingExModal && (
        <ExerciseVerifyModal
          sectionId={verifyingExModal.sectionId}
          exercise={verifyingExModal.exercise}
          onClose={() => setVerifyingExModal(null)}
          onApply={(updated) => handleSaveExercise(verifyingExModal.sectionId, updated)}
        />
      )}

      {/* DOCUMENT METADATA MODAL */}
      {editingDoc && (
        <DocumentMetadataModal
          document={editingDoc}
          isOpen={true}
          onClose={() => setEditingDoc(null)}
          onSaveSuccess={() => {
            setEditingDoc(null);
            showAlert('تم التعديل', 'تم تحديث بيانات الكراسة بنجاح.');
          }}
        />
      )}

      {/* EXERCISE FAMILIES & GUIDED STATIONS AI MODAL */}
      {familiesModalData && (
        <ExerciseFamiliesModal
          docId={familiesModalData.docId}
          unitTitle={familiesModalData.unitTitle}
          exercises={familiesModalData.exercises}
          onClose={() => setFamiliesModalData(null)}
          onSavedAll={() => {
            showAlert('تم الحفظ والاعتماد', 'تم حفظ واعتماد عائلات التمارين ومحطات الحل بنجاح في قاعدة البيانات.');
          }}
        />
      )}

      {/* CUSTOM DIALOG */}
      <CustomDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onConfirm={() => {
          setDialogConfig(prev => ({ ...prev, isOpen: false }));
          dialogConfig.onConfirm?.();
        }}
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
