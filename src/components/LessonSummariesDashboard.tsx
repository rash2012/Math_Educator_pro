import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Document, type LessonSection, type PracticeExercise } from '../db';
import { MathRenderer } from './MathRenderer';
import { 
  generateLessonSummary, 
  regenerateSummarySectionAI,
  regenerateSingleFieldAI,
  extractTextFromImages,
  generatePracticeExerciseSolutionAI,
  generatePracticeExerciseSvgAI,
  editPracticeExerciseSvgAI,
  verifyPracticeExerciseSolutionAI,
  verifyLessonSectionAI
} from '../services/gemini';
import { 
  extractPdfText, 
  convertPdfToImages 
} from '../services/pdf';
import { 
  savePdfDocument 
} from '../services/pdfSaver';
import { 
  ArrowRight, 
  BookOpen, 
  Sparkles, 
  Plus, 
  Printer, 
  Edit3, 
  RefreshCw, 
  Trash2, CheckCircle, 
  Loader2, 
  Save, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  AlertTriangle, 
  Check, 
  PlusCircle, 
  BookMarked,
  Download,
  Upload,
  Notebook,
  Compass,
  FileSpreadsheet,
  Globe,
  GraduationCap,
  Layers
} from 'lucide-react';
import { CustomDialog } from './ui/CustomDialog';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { DEFAULT_METADATA } from '../constants/academicData';
import { PatternGuidedTrainer } from './PatternGuidedTrainer';
import { UnitComprehensiveReviewSection } from './UnitComprehensiveReviewSection';
import { UnitQuizSection } from './UnitQuizSection';
import { UnitMindMapSection } from './UnitMindMapSection';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';

export const LessonSummariesDashboard: React.FC = () => {
  // 1. Fetch from Dexie
  const summaries = useLiveQuery(() => 
    db.documents.where('type').equals('lesson_summary').reverse().sortBy('updatedAt')
  );
  
  const allLibraryDocs = useLiveQuery(() => 
    db.documents.filter(d => d.type === 'pdf' || d.type === 'lesson').toArray()
  );

  // 2. States
  const [activeSummaryId, setActiveSummaryId] = useState<number | null>(null);
  const [activeSummary, setActiveSummary] = useState<Document | null>(null);
  const [summarySections, setSummarySections] = useState<LessonSection[]>([]);
  
  const [generationModalOpen, setGenerationModalOpen] = useState(false);
  const [selectedSourceDocId, setSelectedSourceDocId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  
  // Edit Section State
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editSectionForm, setEditSectionForm] = useState<{
    title: string;
    concept: string;
    svgCode: string;
    guidanceLabel: string;
    notesLabel: string;
    trapsLabel: string;
    examGuidanceLabel: string;
    exampleLabel: string;
    solutionLabel: string;
    extraExampleLabel: string;
    extraSolutionLabel: string;
    guidance: string;
    notes: string;
    traps: string;
    examGuidance: string;
    exampleText: string;
    exampleSvg?: string;
    solutionText: string;
    extraExampleText: string;
    extraExampleSvg?: string;
    extraSolutionText: string;
    practiceExercises?: PracticeExercise[];
    practicalExercises?: PracticeExercise[];
    conceptLabel?: string;
    practiceSectionLabel?: string;
    practicalSectionLabel?: string;
    isPracticeOnly?: boolean;
  } | null>(null);

  // States for exercise AI loaders and inputs
  const [aiExLoading, setAiExLoading] = useState<{ [exId: string]: 'solution' | 'svg' | 'svg_edit' | null }>({});
  const [exSvgPrompt, setExSvgPrompt] = useState<{ [exId: string]: string }>({});

  // States for manual exercise editing and AI verification modals
  const [editingTitleSecId, setEditingTitleSecId] = useState<number | null>(null);
  const [newTitleValue, setNewTitleValue] = useState('');

  const [editingExModal, setEditingExModal] = useState<{
    sectionId: number;
    isPractical: boolean;
    exercise: PracticeExercise;
  } | null>(null);

  const [verifyingExModal, setVerifyingExModal] = useState<{
    sectionId: number;
    isPractical: boolean;
    exercise: PracticeExercise;
  } | null>(null);

  const [isVerifyingAI, setIsVerifyingAI] = useState(false);
  const [verifyShorten, setVerifyShorten] = useState(false);
  const [aiFocusPrompt, setAiFocusPrompt] = useState('');
  const [verifyResult, setVerifyResult] = useState<{
    isCorrect: boolean;
    notes: string;
    optimizedSolution: string;
    optimizedSolutionShort: string;
    optimizedStrategy: string;
  } | null>(null);
  const [chosenVersion, setChosenVersion] = useState<'full' | 'short'>('full');

  // States for lesson section AI verification and auditing
  const [verifyingSecModal, setVerifyingSecModal] = useState<{
    section: LessonSection;
    targetField?: 'all' | 'content' | 'guidance' | 'notes' | 'traps' | 'examGuidance' | 'exampleText' | 'extraExampleText';
    fieldName?: string;
  } | null>(null);
  const [isVerifyingSecAI, setIsVerifyingSecAI] = useState(false);
  const [secAiFocusPrompt, setSecAiFocusPrompt] = useState('');
  const [verifySecResult, setVerifySecResult] = useState<{
    isCorrect: boolean;
    notes: string;
    optimizedTitle: string;
    optimizedContent: string;
    optimizedGuidance: string;
    optimizedNotes: string;
    optimizedTraps: string;
    optimizedExamGuidance: string;
    optimizedExampleText?: string;
    optimizedSolutionText?: string;
    optimizedExtraExampleText?: string;
    optimizedExtraSolutionText?: string;
  } | null>(null);

  // State for sub-block manual edit modal (Split-screen: Right = editor, Left = live preview)
  const [editingSubBlockModal, setEditingSubBlockModal] = useState<{
    sectionId: number;
    fieldKey: 'content' | 'guidance' | 'notes' | 'traps' | 'examGuidance' | 'exampleText' | 'solutionText' | 'extraExampleText' | 'extraSolutionText';
    fieldName: string;
    fieldValue: string;
    sectionTitle?: string;
    secondaryFieldKey?: 'solutionText' | 'extraSolutionText';
    secondaryFieldName?: string;
    secondaryFieldValue?: string;
  } | null>(null);
  const [isSubBlockAiRephrasing, setIsSubBlockAiRephrasing] = useState(false);

  // Edit Booklet Details State
  const [editingBookletDoc, setEditingBookletDoc] = useState<Document | null>(null);

  const handleStartEditBooklet = () => {
    if (activeSummary) {
      setEditingBookletDoc(activeSummary);
    }
  };

  // Add Empty Booklet State
  const [emptyBookletModalOpen, setEmptyBookletModalOpen] = useState(false);
  const [emptyBookletForm, setEmptyBookletForm] = useState({
    title: '',
    country: DEFAULT_METADATA.country,
    grade: DEFAULT_METADATA.grade,
    subject: DEFAULT_METADATA.subject,
    part: DEFAULT_METADATA.part,
    unit: DEFAULT_METADATA.unit,
    topic: 'نوطة الدروس الشاملة',
    seriesName: 'سلسلة التبسيط المفهومي الذكية 📚✨',
    teacherName: 'حسن راشد العلي',
    teacherRole: 'مدرّس مادة الرياضيات والعلوم التفاعلية'
  });

  const handleOpenEmptyBookletModal = () => {
    setEmptyBookletForm({
      title: '',
      country: DEFAULT_METADATA.country,
      grade: DEFAULT_METADATA.grade,
      subject: DEFAULT_METADATA.subject,
      part: DEFAULT_METADATA.part,
      unit: DEFAULT_METADATA.unit,
      topic: 'نوطة الدروس الشاملة',
      seriesName: 'سلسلة التبسيط المفهومي الذكية 📚✨',
      teacherName: 'حسن راشد العلي',
      teacherRole: 'مدرّس مادة الرياضيات والعلوم التفاعلية'
    });
    setEmptyBookletModalOpen(true);
  };

  const handleCreateEmptyBooklet = async () => {
    if (!emptyBookletForm.title.trim()) {
      showAlert('تنبيه', 'الرجاء إدخال عنوان لكراسة الدرس أولاً.');
      return;
    }

    try {
      const newDocId = await db.documents.add({
        title: emptyBookletForm.title,
        country: emptyBookletForm.country || DEFAULT_METADATA.country,
        grade: emptyBookletForm.grade || DEFAULT_METADATA.grade,
        subject: emptyBookletForm.subject || DEFAULT_METADATA.subject,
        part: emptyBookletForm.part || '',
        unit: emptyBookletForm.unit || '',
        topic: emptyBookletForm.topic || '',
        type: 'lesson_summary',
        seriesName: emptyBookletForm.seriesName,
        teacherName: emptyBookletForm.teacherName,
        teacherRole: emptyBookletForm.teacherRole,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      setEmptyBookletModalOpen(false);
      setActiveSummaryId(newDocId);
      showAlert('تم إنشاء الكراس 🎉', 'تم إنشاء الكراس الفارغ بنجاح! يمكنك الآن الضغط على "إضافة فقرة جديدة يدوياً ➕" لبدء إضافة وتعديل الدروس والفقرات والمسائل يدوياً.');
    } catch (err: any) {
      console.error(err);
      showAlert('فشل الإنشاء', 'حدث خطأ غير متوقع أثناء إنشاء الكراس الفارغ.');
    }
  };

  const handleExportBookletJson = async (doc: Document, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const sections = await db.lessonSections.where({ docId: doc.id }).sortBy('order');
      const exportData = {
        booklet: doc,
        sections: sections,
        exportedAt: new Date().toISOString(),
        version: '2.0'
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `${doc.title || 'lesson_summary'}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (err) {
      console.error("Export booklet JSON failed", err);
      showAlert('خطأ', 'فشل تصدير كراسة التبسيط كملف JSON');
    }
  };

  // AI Prompt State for Single Section
  const [aiPromptModalOpen, setAiPromptModalOpen] = useState(false);
  const [aiPromptSectionId, setAiPromptSectionId] = useState<number | null>(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiRegenerating, setAiRegenerating] = useState(false);

  // Active Tab for generation mode (Select from Library vs upload PDF)
  const [generationTab, setGenerationTab] = useState<'library' | 'upload'>('library');
  const [pdfMetadata, setPdfMetadata] = useState({
    title: '',
    country: DEFAULT_METADATA.country,
    grade: DEFAULT_METADATA.grade,
    subject: DEFAULT_METADATA.subject,
    part: DEFAULT_METADATA.part,
    unit: DEFAULT_METADATA.unit,
    topic: ''
  });
  const [directUploadFile, setDirectUploadFile] = useState<File | null>(null);

  // States for single field AI regeneration
  const [fieldRegenModalOpen, setFieldRegenModalOpen] = useState(false);
  const [fieldRegenKey, setFieldRegenKey] = useState<string>('');
  const [fieldRegenLabel, setFieldRegenLabel] = useState<string>('');
  const [fieldRegenInstruction, setFieldRegenInstruction] = useState('');
  const [fieldRegenRunning, setFieldRegenRunning] = useState(false);

  // States for custom AI SVG generation box
  const [showAiDrawingPrompt, setShowAiDrawingPrompt] = useState(false);
  const [aiDrawingPromptText, setAiDrawingPromptText] = useState('');
  const [aiDrawingGenerating, setAiDrawingGenerating] = useState(false);

  // States for modifying an existing SVG container using AI
  const [aiEditingSvgIdx, setAiEditingSvgIdx] = useState<number | null>(null);
  const [aiEditingSvgPromptText, setAiEditingSvgPromptText] = useState('');
  const [aiEditingSvgGenerating, setAiEditingSvgGenerating] = useState(false);

  // Print Customization States
  const [printFont, setPrintFont] = useState<'default' | 'cairo' | 'amiri' | 'tajawal' | 'almarai' | 'al-mithaq' | 'scheherazade' | 'aref' | 'notonaskh' | 'reemkufi'>('cairo');
  const [printFontSize, setPrintFontSize] = useState<number>(9);
  const [printHeadingFont, setPrintHeadingFont] = useState<'default' | 'cairo' | 'amiri' | 'tajawal' | 'almarai' | 'al-mithaq' | 'scheherazade' | 'aref' | 'notonaskh' | 'reemkufi'>('cairo');
  const [printHeadingFontSize, setPrintHeadingFontSize] = useState<number>(12);
  const [watermarkText, setWatermarkText] = useState<string>('حسن راشد العلي');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.1);
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [coverBgStyle, setCoverBgStyle] = useState<'classic-white' | 'gradient-violet-sky' | 'gradient-emerald-mint' | 'gradient-gold-amber' | 'gradient-rose-pink' | 'gradient-dark-slate'>('classic-white');
  const [printAllPagesFooter, setPrintAllPagesFooter] = useState<boolean>(true);
  const [printFooterText, setPrintFooterText] = useState<string>('تم إعداد هذا الكراس في منصة التعلّم الذكي - جميع الحقوق محفوظة للمدرس حسن راشد العلي');
  const [printFooterFontSize, setPrintFooterFontSize] = useState<number>(8);
  const [printFooterIsBold, setPrintFooterIsBold] = useState<boolean>(true);
  const [printHeaderRightText, setPrintHeaderRightText] = useState<string>('{title}');
  const [printHeaderLeftText, setPrintHeaderLeftText] = useState<string>('منصة التعلم الذكي');
  const [printAllPagesHeader, setPrintAllPagesHeader] = useState<boolean>(true);
  const [printHeaderFontSize, setPrintHeaderFontSize] = useState<number>(8);
  const [printHeaderBgColor, setPrintHeaderBgColor] = useState<string>('#01277e');
  const [printHeaderHeight, setPrintHeaderHeight] = useState<number>(25);
  const [questionBgColor, setQuestionBgColor] = useState<string>('#f0f9ff');
  const [solutionBgColor, setSolutionBgColor] = useState<string>('#f0fdf4');

  // State for importing a structured lesson section JSON
  const [importSectionModalData, setImportSectionModalData] = useState<{
    metadata: {
      grade: string;
      subject: string;
      part: string;
      unit: string;
      lessonTitle: string;
      sectionTitle: string;
      seriesName: string;
      teacherName: string;
    };
    section: any;
  } | null>(null);

  // General Dialog/Alert
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'alert';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const showAlert = (title: string, message: string) => {
    setDialogConfig({ isOpen: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialogConfig({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  // 3. Load active summary and its related sections
  useEffect(() => {
    if (activeSummaryId) {
      const loadSummaryDetails = async () => {
        const doc = await db.documents.get(activeSummaryId);
        if (doc) {
          setActiveSummary(doc);
          const secs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
          
          // Check if any theoretical lesson contains embedded practice exercises
          const hasMixed = secs.some(s => !s.isPracticeOnly && s.practiceExercises && s.practiceExercises.length > 0);
          if (hasMixed) {
            let currentOrder = 0;
            for (const sec of secs) {
              if (!sec.isPracticeOnly && sec.practiceExercises && sec.practiceExercises.length > 0) {
                const practiceList = [...sec.practiceExercises];
                // Update theoretical lesson: remove practice exercises from it
                await db.lessonSections.update(sec.id!, {
                  order: currentOrder++,
                  practiceExercises: []
                });
                // Create separate dedicated practice lesson
                let cleanTitle = (sec.title || '').replace(/^الدرس\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر|\d+)[\s:：\-–—]*/i, '').trim();
                if (!cleanTitle) cleanTitle = 'الدرس النظري';

                await db.lessonSections.add({
                  docId: activeSummaryId,
                  title: `تدرّب - ${cleanTitle}`,
                  content: '',
                  svgCode: '',
                  order: currentOrder++,
                  isPracticeOnly: true,
                  conceptLabel: '',
                  practiceSectionLabel: '',
                  practicalSectionLabel: '',
                  practiceExercises: practiceList,
                  practicalExercises: [],
                  analysis: { additions: [] }
                });
              } else {
                await db.lessonSections.update(sec.id!, { order: currentOrder++ });
              }
            }
            const refreshedSecs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
            setSummarySections(refreshedSecs);
          } else {
            setSummarySections(secs);
          }
        }
      };
      loadSummaryDetails();
    } else {
      setActiveSummary(null);
      setSummarySections([]);
    }
  }, [activeSummaryId]);

  // Translate Dexter content structures back and forth for summaries
  const getSectionAdditions = (sec: LessonSection) => {
    const additions = sec.analysis?.additions || [];
    
    const getAddition = (index: number, defaultLabel: string, alternativeLabels: string[] = []) => {
      const itemByIndex = additions[index];
      const itemByLabel = additions.find(a => 
        a.label === defaultLabel || alternativeLabels.includes(a.label)
      );
      
      const finalItem = itemByLabel || itemByIndex || { label: defaultLabel, content: '' };
      return {
        label: finalItem.label || defaultLabel,
        content: finalItem.content || '',
        svgCode: finalItem.svgCode || ''
      };
    };

    const guidanceItem = getAddition(0, 'إرشادات ذكية', ['إرشادات ذكية للطالب']);
    const notesItem = getAddition(1, 'ملاحظات هامة', ['ملاحظات ونتائج ذهبية', 'ملاحظات ونتائج ذهبية للفقرة']);
    const trapsItem = getAddition(2, 'مطبات امتحانية', ['مطبات امتحانية وتحذيرات', 'مطب امتحاني - كُن حذراً']);
    const examGuidanceItem = getAddition(3, 'الدليل الامتحاني', ['الدليل المنهجي للامتحان']);
    const exampleItem = getAddition(4, 'تمرين تطبيقي', ['تطبيق عملي مكرّس للفهم (من الكتاب السوري)']);
    const solutionItem = getAddition(5, 'الحل النموذجي', ['خطوات الحل المنهجي النموذجي']);
    const extraExampleItem = getAddition(6, 'تمرين إضافي', ['تمرين إضافي مكرّس ذو صياغة ذكية من الذكاء الاصطناعي']);
    const extraSolutionItem = getAddition(7, 'حل تمرين إضافي', ['الحل النموذجي المفصل للتمرين الإضافي']);

    return {
      guidanceLabel: guidanceItem.label,
      guidance: guidanceItem.content,
      notesLabel: notesItem.label,
      notes: notesItem.content,
      trapsLabel: trapsItem.label,
      traps: trapsItem.content,
      examGuidanceLabel: examGuidanceItem.label,
      examGuidance: examGuidanceItem.content,
      exampleLabel: exampleItem.label,
      exampleText: exampleItem.content,
      exampleSvg: exampleItem.svgCode,
      solutionLabel: solutionItem.label,
      solutionText: solutionItem.content,
      extraExampleLabel: extraExampleItem.label,
      extraExampleText: extraExampleItem.content,
      extraExampleSvg: extraExampleItem.svgCode,
      extraSolutionLabel: extraSolutionItem.label,
      extraSolutionText: extraSolutionItem.content,
    };
  };

  // Export a single lesson section to structured JSON
  const exportSectionAsJson = (sec: LessonSection) => {
    const additions = getSectionAdditions(sec);
    const sectionBundle = {
      type: 'lesson_section_package',
      version: 1,
      metadata: {
        grade: activeSummary?.grade || 'غير محدد',
        subject: activeSummary?.subject || 'غير محدد',
        part: activeSummary?.part || '',
        unit: activeSummary?.unit || '',
        lessonTitle: activeSummary?.title || 'درس مبسط',
        sectionTitle: sec.title || 'فقرة هامة',
        seriesName: activeSummary?.seriesName || '',
        teacherName: activeSummary?.teacherName || '',
        exportedAt: new Date().toISOString()
      },
      section: {
        title: sec.title,
        content: sec.content,
        svgCode: sec.svgCode || '',
        isPracticeOnly: sec.isPracticeOnly || false,
        conceptLabel: sec.conceptLabel ?? 'صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:',
        practiceSectionLabel: sec.practiceSectionLabel ?? 'فقرة "تدرّب" من الكتاب المقرّر لهذا المفهوم:',
        practicalSectionLabel: sec.practicalSectionLabel ?? '📌 التطبيق العملي للفقرة من الكتاب:',
        additions: {
          guidanceLabel: additions.guidanceLabel,
          guidance: additions.guidance,
          notesLabel: additions.notesLabel,
          notes: additions.notes,
          trapsLabel: additions.trapsLabel,
          traps: additions.traps,
          examGuidanceLabel: additions.examGuidanceLabel,
          examGuidance: additions.examGuidance,
          exampleLabel: additions.exampleLabel,
          exampleText: additions.exampleText,
          exampleSvg: additions.exampleSvg || '',
          solutionLabel: additions.solutionLabel,
          solutionText: additions.solutionText,
          extraExampleLabel: additions.extraExampleLabel,
          extraExampleText: additions.extraExampleText,
          extraExampleSvg: additions.extraExampleSvg || '',
          extraSolutionLabel: additions.extraSolutionLabel,
          extraSolutionText: additions.extraSolutionText
        },
        practiceExercises: sec.practiceExercises || [],
        practicalExercises: sec.practicalExercises || []
      }
    };

    const blob = new Blob([JSON.stringify(sectionBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeGrade = (activeSummary?.grade || '').replace(/\s+/g, '_');
    const safeSubject = (activeSummary?.subject || '').replace(/\s+/g, '_');
    const safeTitle = (sec.title || 'فقرة').replace(/\s+/g, '_');
    link.download = `فقرة_${safeGrade}_${safeSubject}_${safeTitle}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export active summary to JSON
  const downloadAsJson = () => {
    if (!activeSummary) return;
    
    const exportBundle = {
      type: 'lesson_summary_package',
      version: 1,
      document: {
        title: activeSummary.title,
        grade: activeSummary.grade,
        subject: activeSummary.subject,
        part: activeSummary.part || '',
        unit: activeSummary.unit || '',
        topic: activeSummary.topic || 'نوطة الدروس الشاملة',
        seriesName: activeSummary.seriesName || '',
        teacherName: activeSummary.teacherName || '',
        teacherRole: activeSummary.teacherRole || ''
      },
      sections: summarySections.map(sec => {
        const additions = getSectionAdditions(sec);
        return {
          title: sec.title,
          content: sec.content,
          svgCode: sec.svgCode || '',
          order: sec.order,
          guidanceLabel: additions.guidanceLabel,
          guidance: additions.guidance,
          notesLabel: additions.notesLabel,
          notes: additions.notes,
          trapsLabel: additions.trapsLabel,
          traps: additions.traps,
          examGuidanceLabel: additions.examGuidanceLabel,
          examGuidance: additions.examGuidance,
          exampleLabel: additions.exampleLabel,
          exampleText: additions.exampleText,
          exampleSvg: additions.exampleSvg || '',
          solutionLabel: additions.solutionLabel,
          solutionText: additions.solutionText,
          extraExampleLabel: additions.extraExampleLabel,
          extraExampleText: additions.extraExampleText,
          extraExampleSvg: additions.extraExampleSvg || '',
          extraSolutionLabel: additions.extraSolutionLabel,
          extraSolutionText: additions.extraSolutionText,
          practiceExercises: sec.practiceExercises || [],
          practicalExercises: sec.practicalExercises || [],
          conceptLabel: sec.conceptLabel ?? 'صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:',
          practiceSectionLabel: sec.practiceSectionLabel ?? 'فقرة "تدرّب" من الكتاب المقرّر لهذا المفهوم:',
          practicalSectionLabel: sec.practicalSectionLabel ?? '📌 التطبيق العملي للفقرة من الكتاب:'
        };
      })
    };

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `نوطة_${activeSummary.title.replace(/\s+/g, '_')}.json`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Add imported section data to a specific summary document
  const addImportedSectionToSummary = async (docId: number, data: any) => {
    try {
      const existingSecs = await db.lessonSections.where({ docId }).sortBy('order');
      const secObj = data.section || data;
      const meta = data.metadata || {};
      
      const isPractice = Boolean(secObj.isPracticeOnly || (!secObj.content && secObj.practiceExercises && secObj.practiceExercises.length > 0));

      let analysisObj = secObj.analysis;
      if (!analysisObj || !Array.isArray(analysisObj.additions) || analysisObj.additions.length === 0) {
        if (!isPractice) {
          const additions = secObj.additions || {};
          const guidance = additions.guidance || secObj.guidance || '';
          const notes = additions.notes || secObj.notes || '';
          const traps = additions.traps || secObj.traps || '';
          const examGuidance = additions.examGuidance || secObj.examGuidance || '';
          const exampleText = additions.exampleText || secObj.exampleText || '';
          const exampleSvg = additions.exampleSvg || secObj.exampleSvg || '';
          const solutionText = additions.solutionText || secObj.solutionText || '';
          const extraExampleText = additions.extraExampleText || secObj.extraExampleText || '';
          const extraExampleSvg = additions.extraExampleSvg || secObj.extraExampleSvg || '';
          const extraSolutionText = additions.extraSolutionText || secObj.extraSolutionText || '';

          analysisObj = {
            additions: [
              { label: additions.guidanceLabel || secObj.guidanceLabel || 'إرشادات ذكية', content: guidance },
              { label: additions.notesLabel || secObj.notesLabel || 'ملاحظات هامة', content: notes },
              { label: additions.trapsLabel || secObj.trapsLabel || 'مطبات امتحانية', content: traps },
              { label: additions.examGuidanceLabel || secObj.examGuidanceLabel || 'الدليل الامتحاني', content: examGuidance },
              { label: additions.exampleLabel || secObj.exampleLabel || 'تمرين تطبيقي', content: exampleText, svgCode: exampleSvg },
              { label: additions.solutionLabel || secObj.solutionLabel || 'الحل النموذجي', content: solutionText },
              { label: additions.extraExampleLabel || secObj.extraExampleLabel || 'تمرين إضافي', content: extraExampleText, svgCode: extraExampleSvg },
              { label: additions.extraSolutionLabel || secObj.extraSolutionLabel || 'حل تمرين إضافي', content: extraSolutionText }
            ]
          };
        } else {
          analysisObj = { additions: [] };
        }
      }

      await db.lessonSections.add({
        docId,
        title: meta.sectionTitle || secObj.title || 'فقرة هامة',
        content: secObj.content || secObj.concept || '',
        svgCode: secObj.svgCode || '',
        isPracticeOnly: isPractice,
        order: existingSecs.length,
        practiceExercises: Array.isArray(secObj.practiceExercises) ? secObj.practiceExercises : [],
        practicalExercises: Array.isArray(secObj.practicalExercises) ? secObj.practicalExercises : [],
        conceptLabel: secObj.conceptLabel ?? 'صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:',
        practiceSectionLabel: secObj.practiceSectionLabel ?? 'فقرة "تدرّب" من الكتاب المقرّر لهذا المفهوم:',
        practicalSectionLabel: secObj.practicalSectionLabel ?? '📌 التطبيق العملي للفقرة من الكتاب:',
        analysis: analysisObj
      });

      if (activeSummaryId === docId) {
        const updatedSecs = await db.lessonSections.where({ docId }).sortBy('order');
        setSummarySections(updatedSecs);
      }
      await db.documents.update(docId, { updatedAt: Date.now() });
      showAlert('تم الاستيراد بنجاح 🎉', `تمت إضافة فقرة "${meta.sectionTitle || secObj.title}" إلى الكراس بنجاح.`);
    } catch (err: any) {
      console.error(err);
      showAlert('فشل الاستيراد', 'حدث خطأ أثناء إضافة الفقرة المستوردة.');
    }
  };

  // Create a brand new summary document from imported section data
  const createNewSummaryFromImportedSection = async (data: any) => {
    try {
      const meta = data.metadata || {};
      const secObj = data.section || data;

      const newDocId = await db.documents.add({
        title: meta.lessonTitle || 'كراسة درس مستوردة',
        grade: meta.grade || 'غير محدد',
        subject: meta.subject || 'غير محدد',
        part: meta.part || '',
        unit: meta.unit || '',
        topic: 'نوطة الدروس الشاملة',
        type: 'lesson_summary',
        seriesName: meta.seriesName || 'سلسلة التبسيط المفهومي الذكية 📚✨',
        teacherName: meta.teacherName || 'حسن راشد العلي',
        teacherRole: 'مدرّس مادة الرياضيات والعلوم التفاعلية',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      await addImportedSectionToSummary(newDocId, data);
      showAlert('تم إنشاء الكراس واستيراد الفقرة 🎉', `تم إنشاء كراسة "${meta.lessonTitle || 'الدرس'}" واستيراد فقرة "${meta.sectionTitle || secObj.title}" بنجاح!`);
      return newDocId;
    } catch (err: any) {
      console.error(err);
      showAlert('فشل الاستيراد', 'حدث خطأ أثناء إنشاء كراسة جديدة للفقرة.');
      return null;
    }
  };

  // Import summary or single section from JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        // 1. Check if it's a single section package
        if (data.type === 'lesson_section_package' || (data.section && (data.metadata || data.section.title))) {
          const meta = {
            grade: data.metadata?.grade || activeSummary?.grade || 'الثالث الثانوي العلمي',
            subject: data.metadata?.subject || activeSummary?.subject || 'رياضيات',
            part: data.metadata?.part || activeSummary?.part || '',
            unit: data.metadata?.unit || activeSummary?.unit || '',
            lessonTitle: data.metadata?.lessonTitle || activeSummary?.title || 'درس مبسط جديد',
            sectionTitle: data.metadata?.sectionTitle || data.section?.title || data.title || 'فقرة مبسطة',
            seriesName: data.metadata?.seriesName || activeSummary?.seriesName || 'سلسلة التبسيط المفهومي الذكية 📚✨',
            teacherName: data.metadata?.teacherName || activeSummary?.teacherName || 'حسن راشد العلي'
          };
          setImportSectionModalData({
            metadata: meta,
            section: data.section || data
          });
          return;
        }

        // 2. Check if it's a full booklet / lesson summary (Supports v2.0 `booklet`, v1.0 `document`, or direct summary object with `sections`)
        const docData = data.booklet || data.document || (Array.isArray(data.sections) ? data : null);
        const rawSections = Array.isArray(data.sections) ? data.sections : (Array.isArray(docData?.sections) ? docData.sections : null);

        if (!docData || !Array.isArray(rawSections)) {
          throw new Error('صيغة ملف JSON المرفوع غير صالحة، يرجى رفع ملف نوطة درس كاملة أو ملف فقرة مهيكلة بشكل صحيح.');
        }

        const bookletTitle = docData.title || data.title || 'نوطة درس مستوردة';

        const newDocId = await db.documents.add({
          title: bookletTitle,
          grade: docData.grade || DEFAULT_METADATA.grade || 'الثالث الثانوي العلمي',
          subject: docData.subject || DEFAULT_METADATA.subject || 'رياضيات',
          country: docData.country || DEFAULT_METADATA.country,
          part: docData.part || '',
          unit: docData.unit || '',
          topic: docData.topic || 'نوطة الدروس الشاملة',
          type: 'lesson_summary',
          seriesName: docData.seriesName || 'سلسلة التبسيط المفهومي الذكية 📚✨',
          teacherName: docData.teacherName || 'حسن راشد العلي',
          teacherRole: docData.teacherRole || 'مدرّس مادة الرياضيات والعلوم التفاعلية',
          createdAt: typeof docData.createdAt === 'number' ? docData.createdAt : Date.now(),
          updatedAt: Date.now()
        });

        let importOrder = 0;
        for (const sec of rawSections) {
          const isPractice = Boolean(sec.isPracticeOnly || (!sec.content && sec.practiceExercises && sec.practiceExercises.length > 0));

          // Construct or preserve analysis.additions
          let analysisObj = sec.analysis;
          if (!analysisObj || !Array.isArray(analysisObj.additions) || analysisObj.additions.length === 0) {
            if (!isPractice) {
              analysisObj = {
                additions: [
                  { label: sec.guidanceLabel || 'إرشادات ذكية', content: sec.guidance || '' },
                  { label: sec.notesLabel || 'ملاحظات ونتائج هامة', content: sec.notes || '' },
                  { label: sec.trapsLabel || 'مطبات امتحانية', content: sec.traps || '' },
                  { label: sec.examGuidanceLabel || 'الدليل الامتحاني', content: sec.examGuidance || '' },
                  { label: sec.exampleLabel || 'تمرين تطبيقي', content: sec.exampleText || '', svgCode: sec.exampleSvg || '' },
                  { label: sec.solutionLabel || 'الحل النموذجي', content: sec.solutionText || '' },
                  { label: sec.extraExampleLabel || 'تمرين إضافي', content: sec.extraExampleText || '', svgCode: sec.extraExampleSvg || '' },
                  { label: sec.extraSolutionLabel || 'حل تمرين إضافي', content: sec.extraSolutionText || '' }
                ]
              };
            } else {
              analysisObj = { additions: [] };
            }
          }

          if (isPractice) {
            await db.lessonSections.add({
              docId: newDocId,
              title: sec.title || 'تدرّب - تطبيقات وتمارين الدرس',
              content: sec.content || '',
              svgCode: sec.svgCode || '',
              order: typeof sec.order === 'number' ? sec.order : importOrder++,
              isPracticeOnly: true,
              conceptLabel: sec.conceptLabel ?? '',
              practiceSectionLabel: sec.practiceSectionLabel ?? '',
              practicalSectionLabel: sec.practicalSectionLabel ?? '',
              practiceExercises: Array.isArray(sec.practiceExercises) ? sec.practiceExercises : [],
              practicalExercises: Array.isArray(sec.practicalExercises) ? sec.practicalExercises : [],
              analysis: analysisObj
            });
          } else {
            await db.lessonSections.add({
              docId: newDocId,
              title: sec.title || 'فقرة هامة',
              content: sec.content || '',
              svgCode: sec.svgCode || '',
              order: typeof sec.order === 'number' ? sec.order : importOrder++,
              isPracticeOnly: false,
              conceptLabel: sec.conceptLabel ?? 'صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:',
              practiceSectionLabel: sec.practiceSectionLabel ?? '',
              practicalSectionLabel: sec.practicalSectionLabel ?? '📌 التطبيق العملي للفقرة من الكتاب:',
              practiceExercises: Array.isArray(sec.practiceExercises) ? sec.practiceExercises : [],
              practicalExercises: Array.isArray(sec.practicalExercises) ? sec.practicalExercises : [],
              analysis: analysisObj
            });

            // If legacy export had practice exercises embedded inside non-practice section and no dedicated practice section
            if (sec.practiceExercises && sec.practiceExercises.length > 0 && !rawSections.some((s: any) => s.isPracticeOnly)) {
              let cleanTitle = (sec.title || '').replace(/^الدرس\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر|\d+)[\s:：\-–—]*/i, '').trim();
              await db.lessonSections.add({
                docId: newDocId,
                title: `تدرّب - ${cleanTitle || 'تطبيقات الدرس النظري'}`,
                content: '',
                svgCode: '',
                order: importOrder++,
                isPracticeOnly: true,
                conceptLabel: '',
                practiceSectionLabel: '',
                practicalSectionLabel: '',
                practiceExercises: sec.practiceExercises,
                practicalExercises: [],
                analysis: { additions: [] }
              });
            }
          }
        }

        showAlert('اكتمل الاستيراد 🎉', `تم استيراد كراسة النوطة المدرسية الشاملة لـ "${bookletTitle}" بنجاح مع كافة الأفكار والتطبيقات والرسوم والمسائل.`);
        setActiveSummaryId(newDocId);
      } catch (err: any) {
        console.error(err);
        showAlert('فشل الاستيراد ❌', err.message || 'فشل تحليل ملف JSON المستورد وعرضه.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 4. Generate Lesson Summary via Gemini
  const handleGenerateSummary = async () => {
    if (!selectedSourceDocId) {
      showAlert('تنبيه', 'الرجاء اختيار مستند مرجعي من المكتبة أولاً.');
      return;
    }
    
    setGenerating(true);
    setGenerationProgress('جاري تحضير نصوص المرجع واستخراج الأفكار والمفاهيم الأساسية... 📚');
    
    try {
      const sourceDoc = await db.documents.get(selectedSourceDocId);
      if (!sourceDoc) throw new Error('المستند المرجعي غير موجود');
      
      let sourceText = '';
      let originalTitles: string[] = [];
      
      const secs = await db.lessonSections.where({ docId: selectedSourceDocId }).sortBy('order');
      if (secs && secs.length > 0) {
        originalTitles = secs.map(s => s.title);
      }

      if (sourceDoc.type === 'pdf') {
        const content = await db.pdfContents.where({ docId: selectedSourceDocId }).first();
        sourceText = content?.textContent || '';
      } else {
        sourceText = secs.map(s => `${s.title}: ${s.content}`).join('\n\n');
      }
      
      if (!sourceText || sourceText.trim().length < 50) {
        throw new Error('محتوى المصدر فارغ أو قصير جداً للتأليف، تأكد من رفع مرجع تعليمي مهيكل وصحيح.');
      }

      setGenerationProgress('جاري دراسة كافة تدرب والأنشطة والمسائل، ثم صياغة نوطة الدرس الشاملة بأسلوب سلس مع تبيان كيف يأتي سؤال الامتحان وكيف يحل... 🧠✨');
      
      // Request notebook from Gemini
      const summaryResult = await generateLessonSummary(sourceText, {
        title: sourceDoc.title,
        grade: sourceDoc.grade,
        subject: sourceDoc.subject,
        part: sourceDoc.part,
        unit: sourceDoc.unit
      }, originalTitles);

      if (!summaryResult || !summaryResult.sections) {
        throw new Error('فشل الذكاء الاصطناعي في صياغة نوطة الدرس التفصيلية. حاول مرة أخرى.');
      }

      setGenerationProgress('جاري تشييد الرسوم البيانية الهندسية ومطابقتها وتكامل النوطة... 📈🎨');

      // Save summary as a document
      const summaryDocId = await db.documents.add({
        title: summaryResult.lessonTitle || `نوطة الدرس الشاملة: ${sourceDoc.title}`,
        grade: sourceDoc.grade,
        subject: sourceDoc.subject,
        part: sourceDoc.part || '',
        unit: sourceDoc.unit || '',
        topic: summaryResult.topic || 'نوطة الدروس الشاملة',
        type: 'lesson_summary',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Save individual summary sections with guaranteed separation between theory and practice lessons
      let genOrder = 0;
      for (let i = 0; i < summaryResult.sections.length; i++) {
        const sec = summaryResult.sections[i];
        const isPractice = sec.isPracticeOnly || (!sec.concept && sec.practiceExercises && sec.practiceExercises.length > 0);

        if (isPractice) {
          await db.lessonSections.add({
            docId: summaryDocId,
            title: sec.title || 'تدرّب - تطبيقات وتمارين الدرس',
            content: '',
            svgCode: sec.svgCode || '',
            order: genOrder++,
            isPracticeOnly: true,
            conceptLabel: '',
            practiceSectionLabel: sec.practiceSectionLabel ?? '',
            practicalSectionLabel: '',
            practiceExercises: sec.practiceExercises || [],
            practicalExercises: [],
            analysis: { additions: [] }
          });
        } else {
          await db.lessonSections.add({
            docId: summaryDocId,
            title: sec.title || 'فقرة هامة',
            content: sec.concept || '',
            svgCode: sec.svgCode || '',
            order: genOrder++,
            isPracticeOnly: false,
            conceptLabel: 'شرح المفاهيم النظرية والعلمية والتبسيط الموجه:',
            practiceSectionLabel: '',
            practicalSectionLabel: '📌 التطبيق العملي للفقرة من الكتاب:',
            practiceExercises: [],
            practicalExercises: sec.practicalExercises || [],
            analysis: {
              additions: [
                { label: 'إرشادات ذكية', content: sec.guidance || '' },
                { label: 'ملاحظات ونتائج هامة', content: sec.notes || '' },
                { label: 'مطبات امتحانية', content: sec.traps || '' },
                { label: 'دليل امتحاني', content: sec.examGuidance || '' },
                { label: 'تمرينات تطبيقية', content: sec.solvedExample?.exampleText || '', svgCode: sec.solvedExample?.svgCode || '' },
                { label: 'الحل النموذجي', content: sec.solvedExample?.solutionText || '' },
                { label: 'أمثلة محلولة إضافية', content: sec.extraExample?.exampleText || '', svgCode: sec.extraExample?.svgCode || '' },
                { label: 'حل المثال الإضافي', content: sec.extraExample?.solutionText || '' }
              ]
            }
          });

          // If AI mistakenly included practiceExercises inside the theoretical lesson, extract them into a separate lesson immediately
          if (sec.practiceExercises && sec.practiceExercises.length > 0) {
            let cleanTitle = (sec.title || '').replace(/^الدرس\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر|\d+)[\s:：\-–—]*/i, '').trim();
            await db.lessonSections.add({
              docId: summaryDocId,
              title: `تدرّب - ${cleanTitle || 'تطبيقات الدرس النظري'}`,
              content: '',
              svgCode: '',
              order: genOrder++,
              isPracticeOnly: true,
              conceptLabel: '',
              practiceSectionLabel: '',
              practicalSectionLabel: '',
              practiceExercises: sec.practiceExercises,
              practicalExercises: [],
              analysis: { additions: [] }
            });
          }
        }
      }

      setGenerationModalOpen(false);
      setActiveSummaryId(summaryDocId);
      showAlert('اكتمل تأليف النوطة الشاملة 🎉', 'تم توليد وإعداد كراسة النوطة المدرسية الشاملة بأسلوب تدريسي متألق ورسوم بيانية وتطبيقات مثرية!');
    } catch (err: any) {
      console.error(err);
      showAlert('فشل التوليد', err.message || 'حدث خطأ غير متوقع أثناء توليد مراجع المعلم للتأليف.');
    } finally {
      setGenerating(false);
      setGenerationProgress('');
    }
  };

  // 5. Delete Summary Document
  const handleDeleteSummary = async (id: number) => {
    showConfirm('حذف الملخص المفهومي', 'هل أنت متأكد من حذف هذا الملخص؟ سيتم حذف جميع الفصول والفقرات والصياغات المبسطة والرسوم التوضيحية والحلول المرتبطة به بشكل نهائي.', async () => {
      await db.documents.delete(id);
      await db.lessonSections.where('docId').equals(id).delete();
      if (activeSummaryId === id) {
        setActiveSummaryId(null);
      }
      showAlert('تم الحذف', 'تم حذف الملخص الدراسي من المكتبة بنجاح.');
    });
  };

  // 6. Manual Editing Handlers
  const startEditingSection = (sec: LessonSection) => {
    const additions = getSectionAdditions(sec);
    setEditingSectionId(sec.id!);
    setShowAiDrawingPrompt(false);
    setAiDrawingPromptText('');
    setAiDrawingGenerating(false);
    setAiEditingSvgIdx(null);
    setAiEditingSvgPromptText('');
    setAiEditingSvgGenerating(false);
    setEditSectionForm({
      title: sec.title,
      concept: sec.content,
      svgCode: sec.svgCode || '',
      isPracticeOnly: sec.isPracticeOnly || false,
      practiceExercises: sec.practiceExercises || [],
      practicalExercises: sec.practicalExercises || [],
      conceptLabel: sec.conceptLabel ?? 'صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:',
      practiceSectionLabel: sec.practiceSectionLabel ?? 'فقرة "تدرّب" من الكتاب المقرّر لهذا المفهوم:',
      practicalSectionLabel: sec.practicalSectionLabel ?? '📌 التطبيق العملي للفقرة من الكتاب:',
      ...additions
    });
  };

  const saveManualEdit = async () => {
    if (!editingSectionId || !editSectionForm) return;

    try {
      await db.lessonSections.update(editingSectionId, {
        title: editSectionForm.title,
        content: editSectionForm.concept,
        svgCode: editSectionForm.svgCode,
        isPracticeOnly: editSectionForm.isPracticeOnly || false,
        practiceExercises: editSectionForm.practiceExercises || [],
        practicalExercises: editSectionForm.practicalExercises || [],
        conceptLabel: editSectionForm.conceptLabel ?? 'صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:',
        practiceSectionLabel: editSectionForm.practiceSectionLabel ?? 'فقرة "تدرّب" من الكتاب المقرّر لهذا المفهوم:',
        practicalSectionLabel: editSectionForm.practicalSectionLabel ?? '📌 التطبيق العملي للفقرة من الكتاب:',
        analysis: {
          additions: [
            { label: editSectionForm.guidanceLabel, content: editSectionForm.guidance },
            { label: editSectionForm.notesLabel, content: editSectionForm.notes },
            { label: editSectionForm.trapsLabel, content: editSectionForm.traps },
            { label: editSectionForm.examGuidanceLabel, content: editSectionForm.examGuidance },
            { label: editSectionForm.exampleLabel, content: editSectionForm.exampleText, svgCode: editSectionForm.exampleSvg },
            { label: editSectionForm.solutionLabel, content: editSectionForm.solutionText },
            { label: editSectionForm.extraExampleLabel, content: editSectionForm.extraExampleText, svgCode: editSectionForm.extraExampleSvg },
            { label: editSectionForm.extraSolutionLabel, content: editSectionForm.extraSolutionText }
          ]
        }
      });

      // Update updatedAt on Document
      if (activeSummaryId) {
        await db.documents.update(activeSummaryId, { updatedAt: Date.now() });
      }

      setEditingSectionId(null);
      setEditSectionForm(null);
      setShowAiDrawingPrompt(false);
      setAiDrawingPromptText('');
      setAiDrawingGenerating(false);
      setAiEditingSvgIdx(null);
      setAiEditingSvgPromptText('');
      setAiEditingSvgGenerating(false);
      
      // Reload sections
      if (activeSummaryId) {
        const secs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
        setSummarySections(secs);
      }
      
      showAlert('تم الحفظ', 'تم تحديث الفقرة التعليمية وصياغتها بنجاح!');
    } catch (err) {
      console.error(err);
      showAlert('خطأ', 'حدث خطأ عند محاولة حفظ تعديلات الفقرة.');
    }
  };

  // 6.4 Practice Exercises (تدرّب) Handlers
  const addPracticeExercise = () => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = prev.practiceExercises || [];
      const newItem: PracticeExercise = {
        id: Math.random().toString(36).substring(2, 9),
        title: `تمرين تدرب #${currentList.length + 1}`,
        questionText: '',
        solutionText: '',
        strategyText: '',
        svgCode: ''
      };
      return {
        ...prev,
        practiceExercises: [...currentList, newItem]
      };
    });
  };

  const deletePracticeExercise = (id: string) => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = prev.practiceExercises || [];
      return {
        ...prev,
        practiceExercises: currentList.filter(item => item.id !== id)
      };
    });
  };

  const movePracticeExercise = (index: number, direction: 'up' | 'down') => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = [...(prev.practiceExercises || [])];
      if (direction === 'up' && index > 0) {
        const temp = currentList[index];
        currentList[index] = currentList[index - 1];
        currentList[index - 1] = temp;
      } else if (direction === 'down' && index < currentList.length - 1) {
        const temp = currentList[index];
        currentList[index] = currentList[index + 1];
        currentList[index + 1] = temp;
      }
      return {
        ...prev,
        practiceExercises: currentList
      };
    });
  };

  const updatePracticeExerciseField = (id: string, field: keyof PracticeExercise, value: any) => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = (prev.practiceExercises || []).map(item => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      });
      return {
        ...prev,
        practiceExercises: currentList
      };
    });
  };

  const handleSolveExerciseAI = async (ex: PracticeExercise) => {
    if (!ex.questionText.trim()) {
      showAlert('تنبيه', 'يرجى كتابة نص التمرين أولاً لتوليد الحل بالذكاء الاصطناعي.');
      return;
    }
    setAiExLoading(prev => ({ ...prev, [ex.id]: 'solution' }));
    try {
      const result = await generatePracticeExerciseSolutionAI(
        editSectionForm?.title || '',
        ex.questionText,
        ex.solutionText,
        ex.strategyText
      );
      updatePracticeExerciseField(ex.id, 'solutionText', result.solutionText);
      updatePracticeExerciseField(ex.id, 'strategyText', result.strategyText);
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ في الاتصال بالذكاء الاصطناعي', 'حدث خطأ أثناء محاولة توليد الحل التفصيلي والاستراتيجية.');
    } finally {
      setAiExLoading(prev => ({ ...prev, [ex.id]: null }));
    }
  };

  const handleDrawExerciseSvgAI = async (ex: PracticeExercise) => {
    if (!ex.questionText.trim()) {
      showAlert('تنبيه', 'يرجى كتابة نص التمرين أولاً لتصميم رسم توضيحي متوافق.');
      return;
    }
    setAiExLoading(prev => ({ ...prev, [ex.id]: 'svg' }));
    try {
      const svgCode = await generatePracticeExerciseSvgAI(
        editSectionForm?.title || '',
        ex.questionText
      );
      updatePracticeExerciseField(ex.id, 'svgCode', svgCode);
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', 'حدث خطأ أثناء محاولة تصميم ورسم الـ SVG بالذكاء الاصطناعي.');
    } finally {
      setAiExLoading(prev => ({ ...prev, [ex.id]: null }));
    }
  };

  const handleEditExerciseSvgAI = async (ex: PracticeExercise) => {
    const prompt = exSvgPrompt[ex.id];
    if (!prompt || !prompt.trim()) {
      showAlert('تنبيه', 'يرجى إدخال التعديل المطلوب أو فكرة التعديل في صندوق النص.');
      return;
    }
    if (!ex.svgCode || !ex.svgCode.trim()) {
      showAlert('تنبيه', 'لا يوجد رسم SVG حالي لتعديله. يرجى توليد أو إدراج رسم أولاً.');
      return;
    }
    setAiExLoading(prev => ({ ...prev, [ex.id]: 'svg_edit' }));
    try {
      const updatedSvg = await editPracticeExerciseSvgAI(
        ex.svgCode,
        prompt,
        ex.questionText
      );
      updatePracticeExerciseField(ex.id, 'svgCode', updatedSvg);
      setExSvgPrompt(prev => ({ ...prev, [ex.id]: '' })); // Clear prompt
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', 'حدث خطأ أثناء محاولة تعديل وتحديث رسم الـ SVG بالذكاء الاصطناعي.');
    } finally {
      setAiExLoading(prev => ({ ...prev, [ex.id]: null }));
    }
  };


  // 6.5 Practical Exercises (التطبيق العملي) Handlers
  const addPracticalExercise = () => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = prev.practicalExercises || [];
      const newItem: PracticeExercise = {
        id: Math.random().toString(36).substring(2, 9),
        title: `تمرين تطبيقي #${currentList.length + 1}`,
        questionText: '',
        solutionText: '',
        strategyText: '',
        svgCode: ''
      };
      return {
        ...prev,
        practicalExercises: [...currentList, newItem]
      };
    });
  };

  const deletePracticalExercise = (id: string) => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = prev.practicalExercises || [];
      return {
        ...prev,
        practicalExercises: currentList.filter(item => item.id !== id)
      };
    });
  };

  const movePracticalExercise = (index: number, direction: 'up' | 'down') => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = [...(prev.practicalExercises || [])];
      if (direction === 'up' && index > 0) {
        const temp = currentList[index];
        currentList[index] = currentList[index - 1];
        currentList[index - 1] = temp;
      } else if (direction === 'down' && index < currentList.length - 1) {
        const temp = currentList[index];
        currentList[index] = currentList[index + 1];
        currentList[index + 1] = temp;
      }
      return {
        ...prev,
        practicalExercises: currentList
      };
    });
  };

  const updatePracticalExerciseField = (id: string, field: keyof PracticeExercise, value: any) => {
    setEditSectionForm(prev => {
      if (!prev) return null;
      const currentList = (prev.practicalExercises || []).map(item => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      });
      return {
        ...prev,
        practicalExercises: currentList
      };
    });
  };

  const handleSolvePracticalExerciseAI = async (ex: PracticeExercise) => {
    if (!ex.questionText.trim()) {
      showAlert('تنبيه', 'يرجى كتابة نص التمرين أولاً لتوليد الحل بالذكاء الاصطناعي.');
      return;
    }
    setAiExLoading(prev => ({ ...prev, [ex.id]: 'solution' }));
    try {
      const result = await generatePracticeExerciseSolutionAI(
        editSectionForm?.title || '',
        ex.questionText,
        ex.solutionText,
        ex.strategyText
      );
      updatePracticalExerciseField(ex.id, 'solutionText', result.solutionText);
      updatePracticalExerciseField(ex.id, 'strategyText', result.strategyText);
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ في الاتصال بالذكاء الاصطناعي', 'حدث خطأ أثناء محاولة توليد الحل التفصيلي والاستراتيجية.');
    } finally {
      setAiExLoading(prev => ({ ...prev, [ex.id]: null }));
    }
  };

  const handleDrawPracticalExerciseSvgAI = async (ex: PracticeExercise) => {
    if (!ex.questionText.trim()) {
      showAlert('تنبيه', 'يرجى كتابة نص التمرين أولاً لتصميم رسم توضيحي متوافق.');
      return;
    }
    setAiExLoading(prev => ({ ...prev, [ex.id]: 'svg' }));
    try {
      const svgCode = await generatePracticeExerciseSvgAI(
        editSectionForm?.title || '',
        ex.questionText
      );
      updatePracticalExerciseField(ex.id, 'svgCode', svgCode);
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', 'حدث خطأ أثناء محاولة تصميم ورسم الـ SVG بالذكاء الاصطناعي.');
    } finally {
      setAiExLoading(prev => ({ ...prev, [ex.id]: null }));
    }
  };

  const handleEditPracticalExerciseSvgAI = async (ex: PracticeExercise) => {
    const prompt = exSvgPrompt[ex.id];
    if (!prompt || !prompt.trim()) {
      showAlert('تنبيه', 'يرجى إدخال التعديل المطلوب أو فكرة التعديل في صندوق النص.');
      return;
    }
    if (!ex.svgCode || !ex.svgCode.trim()) {
      showAlert('تنبيه', 'لا يوجد رسم SVG حالي لتعديله. يرجى توليد أو إدراج رسم أولاً.');
      return;
    }
    setAiExLoading(prev => ({ ...prev, [ex.id]: 'svg_edit' }));
    try {
      const newSvgCode = await editPracticeExerciseSvgAI(
        ex.svgCode || '',
        prompt,
        ex.questionText
      );
      updatePracticalExerciseField(ex.id, 'svgCode', newSvgCode);
      setExSvgPrompt(prev => ({ ...prev, [ex.id]: '' })); 
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ', 'حدث خطأ أثناء محاولة التعديل الجزئي للرسم بالذكاء الاصطناعي.');
    } finally {
      setAiExLoading(prev => ({ ...prev, [ex.id]: null }));
    }
  };

  const handleSaveManualExercise = async (
    sectionId: number,
    isPractical: boolean,
    updatedExercise: PracticeExercise
  ) => {
    try {
      const section = summarySections.find(s => s.id === sectionId);
      if (!section) return;

      let updatedList: PracticeExercise[] = [];
      if (isPractical) {
        const existing = section.practicalExercises || [];
        const exists = existing.some(ex => ex.id === updatedExercise.id);
        updatedList = exists
          ? existing.map(ex => ex.id === updatedExercise.id ? updatedExercise : ex)
          : [...existing, updatedExercise];
        await db.lessonSections.update(sectionId, { practicalExercises: updatedList });
      } else {
        const existing = section.practiceExercises || [];
        const exists = existing.some(ex => ex.id === updatedExercise.id);
        updatedList = exists
          ? existing.map(ex => ex.id === updatedExercise.id ? updatedExercise : ex)
          : [...existing, updatedExercise];
        await db.lessonSections.update(sectionId, { practiceExercises: updatedList });
      }

      setSummarySections(prev => prev.map(s => {
        if (s.id === sectionId) {
          return {
            ...s,
            [isPractical ? 'practicalExercises' : 'practiceExercises']: updatedList
          };
        }
        return s;
      }));

      if (activeSummaryId) {
        await db.documents.update(activeSummaryId, { updatedAt: Date.now() });
      }

      setEditingExModal(null);
    } catch (error) {
      console.error("Error saving manual exercise:", error);
      showAlert('خطأ في الحفظ', 'حدث خطأ غير متوقع أثناء حفظ التمرين يدوياً.');
    }
  };

  const handleVerifyExerciseAI = async (
    exercise: PracticeExercise,
    focusPrompt?: string
  ) => {
    setIsVerifyingAI(true);
    setVerifyResult(null);
    try {
      const result = await verifyPracticeExerciseSolutionAI(
        exercise.questionText,
        exercise.solutionText,
        exercise.strategyText,
        focusPrompt
      );
      setVerifyResult(result);
      setVerifyShorten(false);
      setChosenVersion('full');
    } catch (error) {
      console.error("Error verifying solution:", error);
      showAlert('خطأ في التدقيق', 'تعذر الاتصال بالذكاء الاصطناعي لتدقيق الحل حالياً.');
    } finally {
      setIsVerifyingAI(false);
    }
  };

  const handleAcceptVerifiedSolution = async (
    sectionId: number,
    isPractical: boolean,
    exerciseId: string,
    optimizedSolution: string,
    optimizedStrategy: string
  ) => {
    try {
      const section = summarySections.find(s => s.id === sectionId);
      if (!section) return;

      let updatedList: PracticeExercise[] = [];
      if (isPractical) {
        updatedList = (section.practicalExercises || []).map(ex => {
          if (ex.id === exerciseId) {
            return {
              ...ex,
              solutionText: optimizedSolution,
              strategyText: optimizedStrategy
            };
          }
          return ex;
        });
        await db.lessonSections.update(sectionId, { practicalExercises: updatedList });
      } else {
        updatedList = (section.practiceExercises || []).map(ex => {
          if (ex.id === exerciseId) {
            return {
              ...ex,
              solutionText: optimizedSolution,
              strategyText: optimizedStrategy
            };
          }
          return ex;
        });
        await db.lessonSections.update(sectionId, { practiceExercises: updatedList });
      }

      setSummarySections(prev => prev.map(s => {
        if (s.id === sectionId) {
          return {
            ...s,
            [isPractical ? 'practicalExercises' : 'practiceExercises']: updatedList
          };
        }
        return s;
      }));

      if (activeSummaryId) {
        await db.documents.update(activeSummaryId, { updatedAt: Date.now() });
      }

      setVerifyingExModal(null);
      setVerifyResult(null);
      showAlert('تم الاعتماد بنجاح', 'تم استبدال الحل والاستراتيجية بالنسخة المدققة والمحسنة.');
    } catch (error) {
      console.error("Error accepting verified solution:", error);
      showAlert('خطأ', 'تعذر اعتماد وتخزين الحل المدقق والمصحح.');
    }
  };

  const saveSectionFieldUpdate = async (
    sectionId: number, 
    fieldUpdates: Partial<{
      title: string;
      content: string;
      guidance: string;
      notes: string;
      traps: string;
      examGuidance: string;
      exampleText: string;
      solutionText: string;
      extraExampleText: string;
      extraSolutionText: string;
      exampleSvg?: string;
      extraExampleSvg?: string;
    }>
  ) => {
    try {
      const section = summarySections.find(s => s.id === sectionId);
      if (!section) return;

      const currentAdditions = getSectionAdditions(section);

      const updatedGuidance = fieldUpdates.guidance !== undefined ? fieldUpdates.guidance : (section.guidance || currentAdditions.guidance || '');
      const updatedNotes = fieldUpdates.notes !== undefined ? fieldUpdates.notes : (section.notes || currentAdditions.notes || '');
      const updatedTraps = fieldUpdates.traps !== undefined ? fieldUpdates.traps : (section.traps || currentAdditions.traps || '');
      const updatedExamGuidance = fieldUpdates.examGuidance !== undefined ? fieldUpdates.examGuidance : (section.examGuidance || currentAdditions.examGuidance || '');
      const updatedExampleText = fieldUpdates.exampleText !== undefined ? fieldUpdates.exampleText : (section.exampleText || currentAdditions.exampleText || '');
      const updatedSolutionText = fieldUpdates.solutionText !== undefined ? fieldUpdates.solutionText : (section.solutionText || currentAdditions.solutionText || '');
      const updatedExtraExampleText = fieldUpdates.extraExampleText !== undefined ? fieldUpdates.extraExampleText : (section.extraExampleText || currentAdditions.extraExampleText || '');
      const updatedExtraSolutionText = fieldUpdates.extraSolutionText !== undefined ? fieldUpdates.extraSolutionText : (section.extraSolutionText || currentAdditions.extraSolutionText || '');

      const updatedAdditions = [
        { label: currentAdditions.guidanceLabel || 'إرشادات ذكية', content: updatedGuidance },
        { label: currentAdditions.notesLabel || 'ملاحظات هامة', content: updatedNotes },
        { label: currentAdditions.trapsLabel || 'مطبات امتحانية', content: updatedTraps },
        { label: currentAdditions.examGuidanceLabel || 'الدليل الامتحاني', content: updatedExamGuidance },
        { label: currentAdditions.exampleLabel || 'تمرين تطبيقي', content: updatedExampleText, svgCode: fieldUpdates.exampleSvg !== undefined ? fieldUpdates.exampleSvg : (currentAdditions.exampleSvg || '') },
        { label: currentAdditions.solutionLabel || 'الحل النموذجي', content: updatedSolutionText },
        { label: currentAdditions.extraExampleLabel || 'تمرين إضافي', content: updatedExtraExampleText, svgCode: fieldUpdates.extraExampleSvg !== undefined ? fieldUpdates.extraExampleSvg : (currentAdditions.extraExampleSvg || '') },
        { label: currentAdditions.extraSolutionLabel || 'حل تمرين إضافي', content: updatedExtraSolutionText },
      ];

      const dbUpdates: any = {
        guidance: updatedGuidance,
        notes: updatedNotes,
        traps: updatedTraps,
        examGuidance: updatedExamGuidance,
        exampleText: updatedExampleText,
        solutionText: updatedSolutionText,
        extraExampleText: updatedExtraExampleText,
        extraSolutionText: updatedExtraSolutionText,
        analysis: {
          ...(section.analysis || {}),
          additions: updatedAdditions
        }
      };

      if (fieldUpdates.title !== undefined) dbUpdates.title = fieldUpdates.title;
      if (fieldUpdates.content !== undefined) dbUpdates.content = fieldUpdates.content;

      await db.lessonSections.update(sectionId, dbUpdates);

      const updatedSection = {
        ...section,
        ...dbUpdates
      };

      setSummarySections(prev => prev.map(s => s.id === sectionId ? updatedSection : s));

      if (activeSummaryId) {
        await db.documents.update(activeSummaryId, { updatedAt: Date.now() });
      }
    } catch (error) {
      console.error("Error saving section field update:", error);
      showAlert('خطأ في الحفظ', 'تعذر حفظ التعديل في قاعدة البيانات.');
    }
  };

  const handleSaveTitle = async (sectionId: number) => {
    if (!newTitleValue.trim()) {
      setEditingTitleSecId(null);
      return;
    }
    await saveSectionFieldUpdate(sectionId, { title: newTitleValue.trim() });
    setEditingTitleSecId(null);
  };

  const handleVerifySectionAI = async (
    section: LessonSection,
    focusPrompt?: string
  ) => {
    setIsVerifyingSecAI(true);
    setVerifySecResult(null);
    try {
      const additions = getSectionAdditions(section);
      const fullGuidance = section.guidance || additions.guidance || '';
      const fullNotes = section.notes || additions.notes || '';
      const fullTraps = section.traps || additions.traps || '';
      const fullExamGuidance = section.examGuidance || additions.examGuidance || '';
      const fullExampleText = section.exampleText || additions.exampleText || '';
      const fullSolutionText = section.solutionText || additions.solutionText || '';
      const fullExtraExampleText = section.extraExampleText || additions.extraExampleText || '';
      const fullExtraSolutionText = section.extraSolutionText || additions.extraSolutionText || '';

      const result = await verifyLessonSectionAI(
        section.title || '',
        section.content || '',
        fullGuidance,
        fullNotes,
        fullTraps,
        fullExamGuidance,
        focusPrompt,
        fullExampleText,
        fullSolutionText,
        fullExtraExampleText,
        fullExtraSolutionText
      );
      setVerifySecResult(result);
    } catch (error) {
      console.error("Error verifying section:", error);
      showAlert('خطأ في التدقيق', 'تعذر الاتصال بالذكاء الاصطناعي لتدقيق الفقرة حالياً.');
    } finally {
      setIsVerifyingSecAI(false);
    }
  };

  const handleAcceptVerifiedSection = async (
    sectionId: number,
    optimizedTitle: string,
    optimizedContent: string,
    optimizedGuidance: string,
    optimizedNotes: string,
    optimizedTraps: string,
    optimizedExamGuidance: string,
    optimizedExampleText?: string,
    optimizedSolutionText?: string,
    optimizedExtraExampleText?: string,
    optimizedExtraSolutionText?: string
  ) => {
    try {
      await saveSectionFieldUpdate(sectionId, {
        title: optimizedTitle,
        content: optimizedContent,
        guidance: optimizedGuidance,
        notes: optimizedNotes,
        traps: optimizedTraps,
        examGuidance: optimizedExamGuidance,
        exampleText: optimizedExampleText,
        solutionText: optimizedSolutionText,
        extraExampleText: optimizedExtraExampleText,
        extraSolutionText: optimizedExtraSolutionText
      });

      setVerifyingSecModal(null);
      setVerifySecResult(null);
      setSecAiFocusPrompt('');
      showAlert('تم الاعتماد بنجاح', 'تم التحديث بنجاح واعتماد النسخة المحسنة والمدققة لفقرة الشرح.');
    } catch (error) {
      console.error("Error saving verified section:", error);
      showAlert('خطأ في الحفظ', 'تعذر حفظ التعديلات في قاعدة البيانات.');
    }
  };

  const handleSaveSubBlockEditDirect = async (
    sectionId: number, 
    fieldKey: string, 
    fieldValue: string,
    secondaryFieldKey?: string,
    secondaryFieldValue?: string
  ) => {
    const updates: any = { [fieldKey]: fieldValue };
    if (secondaryFieldKey && secondaryFieldValue !== undefined) {
      updates[secondaryFieldKey] = secondaryFieldValue;
    }
    await saveSectionFieldUpdate(sectionId, updates);
    showAlert('تم الحفظ بنجاح', 'تمت إضافة واعتماد التعديل والتدقيق بنجاح.');
  };

  const insertSymbolToSubBlock = (symbol: string) => {
    if (!editingSubBlockModal) return;
    setEditingSubBlockModal(prev => prev ? {
      ...prev,
      fieldValue: (prev.fieldValue || '') + symbol
    } : null);
  };

  const handleSubBlockAiRephrase = async () => {
    if (!editingSubBlockModal) return;
    setIsSubBlockAiRephrasing(true);
    try {
      const result = await verifyLessonSectionAI(
        editingSubBlockModal.sectionTitle || '',
        editingSubBlockModal.fieldKey === 'content' ? editingSubBlockModal.fieldValue : '',
        editingSubBlockModal.fieldKey === 'guidance' ? editingSubBlockModal.fieldValue : '',
        editingSubBlockModal.fieldKey === 'notes' ? editingSubBlockModal.fieldValue : '',
        editingSubBlockModal.fieldKey === 'traps' ? editingSubBlockModal.fieldValue : '',
        editingSubBlockModal.fieldKey === 'examGuidance' ? editingSubBlockModal.fieldValue : '',
        `أعد صياغة وتنقيح وتنسيق فقرة (${editingSubBlockModal.fieldName}) فقط بأرقى أسلوب تعليمي ذكي ورموز ملونة صريحة ودقيقة.`
      );

      let newVal = editingSubBlockModal.fieldValue;
      if (editingSubBlockModal.fieldKey === 'content') newVal = result.optimizedContent;
      else if (editingSubBlockModal.fieldKey === 'guidance') newVal = result.optimizedGuidance;
      else if (editingSubBlockModal.fieldKey === 'notes') newVal = result.optimizedNotes;
      else if (editingSubBlockModal.fieldKey === 'traps') newVal = result.optimizedTraps;
      else if (editingSubBlockModal.fieldKey === 'examGuidance') newVal = result.optimizedExamGuidance;

      setEditingSubBlockModal(prev => prev ? { ...prev, fieldValue: newVal } : null);
      showAlert('تمت إعادة الصياغة بنجاح', `تم تحسين وتنقيح نص (${editingSubBlockModal.fieldName}) بالذكاء الاصطناعي بنجاح.`);
    } catch (err) {
      console.error("Error rephrasing sub-block:", err);
      showAlert('خطأ في الصياغة', 'تعذر الاتصال بالذكاء الاصطناعي حالياً.');
    } finally {
      setIsSubBlockAiRephrasing(false);
    }
  };

  const handleSaveSubBlockEdit = async () => {
    if (!editingSubBlockModal) return;
    try {
      const updates: any = {
        [editingSubBlockModal.fieldKey]: editingSubBlockModal.fieldValue
      };
      if (editingSubBlockModal.secondaryFieldKey) {
        updates[editingSubBlockModal.secondaryFieldKey] = editingSubBlockModal.secondaryFieldValue || '';
      }
      if (editingSubBlockModal.sectionTitle !== undefined && editingSubBlockModal.sectionTitle.trim()) {
        updates.title = editingSubBlockModal.sectionTitle.trim();
      }
      await saveSectionFieldUpdate(editingSubBlockModal.sectionId, updates);
      setEditingSubBlockModal(null);
      showAlert('تم الحفظ بنجاح', 'تمت إضافة واعتماد التعديل اليدوي للفقرة بنجاح.');
    } catch (err) {
      console.error("Error saving sub-block edit:", err);
      showAlert('خطأ في الحفظ', 'تعذر حفظ التعديل في قاعدة البيانات.');
    }
  };

  const handleUpdatePracticeExercise = async (sectionId: number, updatedEx: PracticeExercise) => {
    try {
      const currentSec = await db.lessonSections.get(sectionId);
      if (!currentSec || !currentSec.practiceExercises) return;
      const updatedList = currentSec.practiceExercises.map(ex => ex.id === updatedEx.id ? updatedEx : ex);
      await db.lessonSections.update(sectionId, { practiceExercises: updatedList });
      if (activeSummaryId) {
        await db.documents.update(activeSummaryId, { updatedAt: Date.now() });
        const secs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
        setSummarySections(secs);
      }
    } catch (err) {
      console.error("Error updating practice exercise:", err);
    }
  };

  // 7. Core AI Single Part Regeneration
  const triggerAiRegenForSection = (sectionId: number) => {
    setAiPromptSectionId(sectionId);
    setAiInstruction('');
    setAiPromptModalOpen(true);
  };

  const executeAiSectionRegen = async () => {
    if (!aiPromptSectionId || !aiInstruction.trim()) return;
    
    setAiRegenerating(true);
    try {
      const currentSec = await db.lessonSections.get(aiPromptSectionId);
      if (!currentSec) throw new Error('الفقرة المطلوبة غير موجودة');
      
      const additions = getSectionAdditions(currentSec);
      const payloadFormat = {
        title: currentSec.title,
        concept: currentSec.content,
        svgCode: currentSec.svgCode || '',
        guidance: additions.guidance,
        notes: additions.notes,
        traps: additions.traps,
        examGuidance: additions.examGuidance,
        solvedExample: {
          exampleText: additions.exampleText,
          solutionText: additions.solutionText
        },
        extraExample: {
          exampleText: additions.extraExampleText,
          solutionText: additions.extraSolutionText
        }
      };

      const updated = await regenerateSummarySectionAI(payloadFormat, aiInstruction);
      
      if (!updated || typeof updated !== 'object') {
        throw new Error('الاستجابة المستلمة ليست كائن بنية JSON صالح.');
      }

      // Overwrite the database section
      await db.lessonSections.update(aiPromptSectionId, {
        title: updated.title || currentSec.title,
        content: updated.concept || currentSec.content,
        svgCode: updated.svgCode || currentSec.svgCode || '',
        analysis: {
          additions: [
            { label: additions.guidanceLabel, content: updated.guidance || '' },
            { label: additions.notesLabel, content: updated.notes || '' },
            { label: additions.trapsLabel, content: updated.traps || '' },
            { label: additions.examGuidanceLabel, content: updated.examGuidance || '' },
            { label: additions.exampleLabel, content: updated.solvedExample?.exampleText || '' },
            { label: additions.solutionLabel, content: updated.solvedExample?.solutionText || '' },
            { label: additions.extraExampleLabel, content: updated.extraExample?.exampleText || '' },
            { label: additions.extraSolutionLabel, content: updated.extraExample?.solutionText || '' }
          ]
        }
      });

      // Update document modified time
      if (activeSummaryId) {
        await db.documents.update(activeSummaryId, { updatedAt: Date.now() });
        const secs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
        setSummarySections(secs);
      }

      setAiPromptModalOpen(false);
      setAiPromptSectionId(null);
      showAlert('جاهز ✨', 'تم تعديل وإعادة إنشاء الفقرة بذكاء واحترافية فائقة بناءً على طلبك!');
    } catch (err: any) {
      console.error(err);
      showAlert('إخفاق التعديل بالذكاء الاصطناعي', err.message || 'فشل الاتصال بنظام التعديل الذكي للفقرة، تأكد من وضوح توجيهاتك.');
    } finally {
      setAiRegenerating(false);
    }
  };

  // 7b. Direct PDF Upload and Generate Comprehensive Booklet
  const handleDirectPdfUploadAndGenerate = async () => {
    if (!directUploadFile) {
      showAlert('تنبيه', 'يرجى اختيار ملف PDF أولاً.');
      return;
    }
    if (!pdfMetadata.title.trim()) {
      showAlert('تنبيه', 'الرجاء إدخال عنوان لكراسة الدرس أولاً.');
      return;
    }

    setGenerating(true);
    setGenerationProgress('جاري استخراج وقراءة نصوص ملف الـ PDF... 📄🔍');

    try {
      // 1. Extract PDF text
      const { text: fastText, originalFile } = await extractPdfText(directUploadFile);
      let finalText = fastText;

      // Fallback to Gemini OCR if needed
      if (!fastText || fastText.trim().length < 200) {
        setGenerationProgress('جاري معالجة صفحات الـ PDF وصقلها بالذكاء الاصطناعي (OCR)... 📸🤖');
        const images = await convertPdfToImages(directUploadFile);
        finalText = await extractTextFromImages(images);
      }

      if (!finalText || finalText.trim().length < 50) {
        throw new Error('فشل استخراج نصوص كافية من هذا الملف. يرجى التأكد من أنه ملف صالح ومقروء.');
      }

      setGenerationProgress('جاري حفظ المرجع وتوثيقه في مكتبتك المدرسية... 📂');

      // 2. Save PDF reference document in DB
      const pdfDocId = await savePdfDocument(finalText, {
        title: pdfMetadata.title,
        grade: pdfMetadata.grade,
        subject: pdfMetadata.subject,
        part: pdfMetadata.part,
        unit: pdfMetadata.unit,
        topic: 'مرجع PDF للدرس',
        type: 'pdf'
      }, originalFile);

      setGenerationProgress('جاري قراءة المرجع وتشييد كراسة النوطة الاحترافية بالترتيب الأصلي والدقيق... 🚀🧠');

      // 3. Request booklet generation from Gemini
      const summaryResult = await generateLessonSummary(finalText, {
        title: pdfMetadata.title,
        grade: pdfMetadata.grade,
        subject: pdfMetadata.subject,
        part: pdfMetadata.part,
        unit: pdfMetadata.unit
      }, []);

      if (!summaryResult || !summaryResult.sections) {
        throw new Error('فشل الذكاء الاصطناعي في صياغة نوطة الدرس التفصيلية. حاول مرة أخرى.');
      }

      setGenerationProgress('جاري ترحيل وبناء الرسوم البيانية الهندسية والتطبيقات... 📈🎨');

      // 4. Save the summary booklet Document
      const summaryDocId = await db.documents.add({
        title: summaryResult.lessonTitle || `نوطة الدرس الشاملة: ${pdfMetadata.title}`,
        grade: pdfMetadata.grade,
        subject: pdfMetadata.subject,
        part: pdfMetadata.part || '',
        unit: pdfMetadata.unit || '',
        topic: summaryResult.topic || 'نوطة الدروس الشاملة',
        type: 'lesson_summary',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // 5. Save sections with guaranteed separation between theory and practice lessons
      let directGenOrder = 0;
      for (let i = 0; i < summaryResult.sections.length; i++) {
        const sec = summaryResult.sections[i];
        const isPractice = sec.isPracticeOnly || (!sec.concept && sec.practiceExercises && sec.practiceExercises.length > 0);

        if (isPractice) {
          await db.lessonSections.add({
            docId: summaryDocId,
            title: sec.title || 'تدرّب - تطبيقات وتمارين الدرس',
            content: '',
            svgCode: sec.svgCode || '',
            order: directGenOrder++,
            isPracticeOnly: true,
            conceptLabel: '',
            practiceSectionLabel: sec.practiceSectionLabel ?? '',
            practicalSectionLabel: '',
            practiceExercises: sec.practiceExercises || [],
            practicalExercises: [],
            analysis: { additions: [] }
          });
        } else {
          await db.lessonSections.add({
            docId: summaryDocId,
            title: sec.title || 'فقرة هامة',
            content: sec.concept || '',
            svgCode: sec.svgCode || '',
            order: directGenOrder++,
            isPracticeOnly: false,
            conceptLabel: 'شرح المفاهيم النظرية والعلمية والتبسيط الموجه:',
            practiceSectionLabel: '',
            practicalSectionLabel: '📌 التطبيق العملي للفقرة من الكتاب:',
            practiceExercises: [],
            practicalExercises: sec.practicalExercises || [],
            analysis: {
              additions: [
                { label: 'إرشادات ذكية', content: sec.guidance || '' },
                { label: 'ملاحظات ونتائج هامة', content: sec.notes || '' },
                { label: 'مطبات امتحانية', content: sec.traps || '' },
                { label: 'دليل امتحاني', content: sec.examGuidance || '' },
                { label: 'تمرينات تطبيقية', content: sec.solvedExample?.exampleText || '', svgCode: sec.solvedExample?.svgCode || '' },
                { label: 'الحل النموذجي', content: sec.solvedExample?.solutionText || '' },
                { label: 'أمثلة محلولة إضافية', content: sec.extraExample?.exampleText || '', svgCode: sec.extraExample?.svgCode || '' },
                { label: 'حل المثال الإضافي', content: sec.extraExample?.solutionText || '' }
              ]
            }
          });

          // If AI mistakenly embedded practiceExercises, create a distinct dedicated practice lesson immediately
          if (sec.practiceExercises && sec.practiceExercises.length > 0) {
            let cleanTitle = (sec.title || '').replace(/^الدرس\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر|\d+)[\s:：\-–—]*/i, '').trim();
            await db.lessonSections.add({
              docId: summaryDocId,
              title: `تدرّب - ${cleanTitle || 'تطبيقات الدرس النظري'}`,
              content: '',
              svgCode: '',
              order: directGenOrder++,
              isPracticeOnly: true,
              conceptLabel: '',
              practiceSectionLabel: '',
              practicalSectionLabel: '',
              practiceExercises: sec.practiceExercises,
              practicalExercises: [],
              analysis: { additions: [] }
            });
          }
        }
      }

      setGenerationModalOpen(false);
      setDirectUploadFile(null);
      // Reset upload metadata title
      setPdfMetadata(prev => ({ ...prev, title: '' }));
      setActiveSummaryId(summaryDocId);
      showAlert('تم تلخيص وتأسيس النوطة بنجاح! 🎉', `تمت قراءة المرجع بترميز فائق، وتشييد كراسة النوطة الاحترافية لـ "${pdfMetadata.title}" كاملة في ملف بنفس الترتيب الأصلي!`);
    } catch (err: any) {
      console.error(err);
      showAlert('فشل التوليد مجهرياً ❌', err.message || 'حدث خطأ غير متوقع أثناء تلخيص ملف PDF.');
    } finally {
      setGenerating(false);
      setGenerationProgress('');
    }
  };

  // 7c. Trigger single field AI regeneration
  const triggerSingleFieldRegen = (fieldKey: string, fieldLabel: string) => {
    if (!editSectionForm) return;
    setFieldRegenKey(fieldKey);
    setFieldRegenLabel(fieldLabel);
    setFieldRegenInstruction('');
    setFieldRegenModalOpen(true);
  };

  // 7d. Execute single field AI regeneration
  const executeSingleFieldRegen = async () => {
    if (!editSectionForm || !fieldRegenKey || !fieldRegenInstruction.trim()) return;

    setFieldRegenRunning(true);
    try {
      const currentValue = (editSectionForm as any)[fieldRegenKey] || '';
      const resultValue = await regenerateSingleFieldAI(
        editSectionForm.title,
        editSectionForm.concept,
        fieldRegenKey,
        fieldRegenLabel,
        currentValue,
        fieldRegenInstruction
      );

      setEditSectionForm(prev => {
        if (!prev) return null;
        return {
          ...prev,
          [fieldRegenKey]: resultValue
        };
      });

      setFieldRegenModalOpen(false);
      showAlert('مكتمل بالذكاء ✨', `تم تحديث حقل (${fieldRegenLabel}) بالذكاء الاصطناعي بنجاح. عاين القيمة المحدثة في نافذة التعديل، واضغط زر الحفظ لحفظ التعديلات نهائياً!`);
    } catch (err: any) {
      console.error(err);
      showAlert('إخفاق التعديل', err.message || 'فشل الاتصال بخدمة الذكاء الاصطناعي لتعديل هذا الحقل.');
    } finally {
      setFieldRegenRunning(false);
    }
  };

  // Generate independent SVG drawing via custom user prompt
  const handleAiDrawingGenerate = async () => {
    if (!editSectionForm || !aiDrawingPromptText.trim()) return;

    setAiDrawingGenerating(true);
    try {
      const resultValue = await regenerateSingleFieldAI(
        editSectionForm.title,
        editSectionForm.concept,
        'svgCode',
        'رسم توضيحي مستقل جديد بالذكاء',
        '', // new independent drawing
        aiDrawingPromptText
      );

      // Clean potential wrappers
      let cleanedSvg = resultValue.trim();
      if (cleanedSvg.startsWith("```")) {
        cleanedSvg = cleanedSvg.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
      }

      // Valid check
      if (!cleanedSvg.toLowerCase().includes("<svg")) {
        throw new Error("الذكاء الاصطناعي لم يرجع كود SVG صالحاً. يرجى صياغة توجيهاتك بشكل أوضح.");
      }

      setEditSectionForm(prev => {
        if (!prev) return null;
        const currentSvgs = extractSvgs(prev.svgCode);
        currentSvgs.push(cleanedSvg);
        return {
          ...prev,
          svgCode: currentSvgs.join('\n\n')
        };
      });

      setShowAiDrawingPrompt(false);
      setAiDrawingPromptText('');
      showAlert('تم توليد الرسم بنجاح! 🎨🤖', 'تم تصميم الرسم البياني بالذكاء الاصطناعي وإضافته كحاوية مستقلة جديدة بنجاح في الأسفل!');
    } catch (err: any) {
      console.error(err);
      showAlert('فشل التوليد الذكي للرسم ❌', err.message || 'حدث خطأ أثناء محاولة تصميم وتوليد الرسم البياني بالذكاء الاصطناعي.');
    } finally {
      setAiDrawingGenerating(false);
    }
  };

  // 8. Add Empty Manual Section (درس نظري)
  const handleAddNewManualSection = async () => {
    if (!activeSummaryId) return;
    
    const maxOrder = summarySections.length > 0 
      ? Math.max(...summarySections.map(s => s.order)) 
      : -1;
      
    const nextIdx = summarySections.length + 1;
    const lessonOrdinal = `الدرس ${getArabicOrdinal(nextIdx)}`;

    const newId = await db.lessonSections.add({
      docId: activeSummaryId,
      title: `${lessonOrdinal}: مفهوم نظري جديد`,
      content: 'اكتب الشرح المفهومي التبسيطي والعلمي بأسلوب سهل للطالب هنا...',
      svgCode: '',
      order: maxOrder + 1,
      conceptLabel: 'شرح المفاهيم النظرية والعلمية والتبسيط الموجه:',
      analysis: {
        additions: [
          { label: 'ملاحظات ونتائج هامة', content: 'ملاحظات وقوانين هامة ونتائج أساسية...' },
          { label: 'مطبات امتحانية', content: 'احذر من الأخطاء والزلات الشائعة التالية...' },
          { label: 'دليل امتحاني', content: 'طريقة ورود الفكرة في الامتحان وكيفية صياغة الحل المنهجي...' },
          { label: 'تمرينات تطبيقية', content: 'تمرين تطبيقي مباشر لتثبيت المفهوم...' },
          { label: 'الحل النموذجي', content: '① خطوات الحل النموذجي المفصلة...' },
          { label: 'أمثلة محلولة إضافية', content: 'مثال محلول إضافي لتكريس المهارة...' },
          { label: 'حل المثال الإضافي', content: 'الحل المفصل والكامل للمثال الإضافي...' }
        ]
      }
    });

    // Update summary order
    const updatedSecs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
    setSummarySections(updatedSecs);
    
    // Automatically open edit on it
    const newSec = updatedSecs.find(s => s.id === newId);
    if (newSec) {
      startEditingSection(newSec);
    }
  };

  // 8b. Add Empty Practice Section Only ("إضافة درس تدرّب مستقل")
  const handleAddNewPracticeOnlySection = async () => {
    if (!activeSummaryId) return;
    
    const maxOrder = summarySections.length > 0 
      ? Math.max(...summarySections.map(s => s.order)) 
      : -1;
      
    const nextIdx = summarySections.length + 1;
    const lessonOrdinal = `الدرس ${getArabicOrdinal(nextIdx)}`;

    const newId = await db.lessonSections.add({
      docId: activeSummaryId,
      title: `${lessonOrdinal}: تدرّب - تطبيقات وتمارين الكتاب`,
      content: '',
      svgCode: '',
      order: maxOrder + 1,
      isPracticeOnly: true,
      conceptLabel: '',
      practiceSectionLabel: '',
      practicalSectionLabel: '',
      practiceExercises: [
        {
          id: `ex_${Date.now()}_1`,
          title: 'تمرين تدرّب #1',
          questionText: 'نص التمرين كما هو في المرجع تماماً (الكتاب المدرسي)...',
          strategyText: 'فكرة واستراتيجية الحل السريعة...',
          solutionText: '① الخطوة الأولى: ...\n② الخطوة الثانية: ...',
          svgCode: ''
        }
      ],
      practicalExercises: [],
      analysis: {
        additions: []
      }
    });

    // Update summary order
    const updatedSecs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
    setSummarySections(updatedSecs);
    
    // Automatically open edit on it
    const newSec = updatedSecs.find(s => s.id === newId);
    if (newSec) {
      startEditingSection(newSec);
    }
  };

  // 8c. Split embedded practice exercises into separate dedicated lessons
  const handleSplitPracticeLessons = async () => {
    if (!activeSummaryId) return;
    const sections = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
    
    const hasMixed = sections.some(s => !s.isPracticeOnly && s.practiceExercises && s.practiceExercises.length > 0);
    if (!hasMixed) {
      showAlert('معلومة', 'جميع فقرات تدرّب مفصولة بالفعل كدروس مستقلة في هذه الوحدة!');
      return;
    }

    showConfirm(
      'تقسيم الوحدة إلى دروس نظرية ودروس تدرّب منفصلة',
      'سيتم تحويل جميع فقرات (تدرّب) إلى دروس مستقلة تماماً مرقمة (الدرس الأول، الدرس الثاني...) وفق البنية المنهجية المعتمدة. هل تريد المتابعة؟',
      async () => {
        let currentOrder = 0;
        for (const sec of sections) {
          if (!sec.isPracticeOnly && sec.practiceExercises && sec.practiceExercises.length > 0) {
            const practiceList = [...sec.practiceExercises];
            
            // 1. Update theoretical lesson
            await db.lessonSections.update(sec.id!, {
              order: currentOrder++,
              practiceExercises: []
            });
            
            // 2. Insert new dedicated practice lesson
            let cleanTitle = (sec.title || '').replace(/^الدرس\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر|\d+)[\s:：\-–—]*/i, '').trim();
            if (!cleanTitle) cleanTitle = 'الدرس النظري';

            await db.lessonSections.add({
              docId: activeSummaryId,
              title: `تدرّب - ${cleanTitle}`,
              content: '',
              svgCode: '',
              order: currentOrder++,
              isPracticeOnly: true,
              practiceSectionLabel: '',
              practicalSectionLabel: '',
              practiceExercises: practiceList,
              practicalExercises: [],
              analysis: {
                additions: []
              }
            });
          } else {
            await db.lessonSections.update(sec.id!, {
              order: currentOrder++
            });
          }
        }

        const updated = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
        setSummarySections(updated);
        await db.documents.update(activeSummaryId, { updatedAt: Date.now() });
        showAlert('تم التقسيم بنجاح 🎉', 'تم فصل جميع فقرات تدرّب كدروس مستقلة وتحديث ترقيم الدروس بدقة.');
      }
    );
  };

  // 9. Move Section Up or Down
  const reorderSection = async (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= summarySections.length) return;

    const current = summarySections[idx];
    const target = summarySections[targetIdx];

    await db.lessonSections.update(current.id!, { order: target.order });
    await db.lessonSections.update(target.id!, { order: current.order });

    if (activeSummaryId) {
      const secs = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
      setSummarySections(secs);
    }
  };

  // Helper to determine text contrast color based on background color
  const getContrastColor = (hex: string) => {
    if (!hex || hex.length < 6) return '#ffffff';
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  };

  // 10. Helper to make inline nested SVGs responsive
  const makeSvgResponsive = (svg: string | undefined) => {
    if (!svg) return '';
    let processed = svg.trim();
    if (!processed.startsWith('<svg')) {
      // Sometimes code returns ```xml wrapper or random string - extract svg if any
      const match = processed.match(/<svg[\s\S]*<\/svg>/);
      if (match) {
        processed = match[0];
      } else {
        return '';
      }
    }
    if (!processed.includes('viewBox=') && !processed.includes('viewBox =')) {
      const widthMatch = processed.match(/width="?(\d+(?:\.\d+)?)"?/);
      const heightMatch = processed.match(/height="?(\d+(?:\.\d+)?)"?/);
      if (widthMatch && heightMatch) {
        processed = processed.replace(/<svg\b/, `<svg viewBox="0 0 ${widthMatch[1]} ${heightMatch[1]}"`);
      }
    }
    processed = processed.replace(/width="[^"]+"/, 'width="100%"').replace(/height="[^"]+"/, 'height="100%"');
    return processed;
  };

  // Extract custom title or fallback for an SVG tag
  const getSvgTitle = (svgStr: string, index: number): string => {
    const match = svgStr.match(/data-title="([^"]*)"/i) || svgStr.match(/data-title='([^']*)'/i);
    if (match) {
      return match[1];
    }
    const isHidden = isSvgTitleHidden(svgStr);
    if (isHidden) {
      return '';
    }
    return `حاوية الرسم المستقلة #${index + 1}`;
  };

  const isSvgTitleHidden = (svgStr: string): boolean => {
    const lower = svgStr.toLowerCase();
    return lower.includes('data-title-hidden="true"') || lower.includes("data-title-hidden='true'");
  };

  // Set custom title for an SVG tag, and optionally hide it
  const setSvgTitle = (svgStr: string, title: string, isHidden: boolean = false): string => {
    let cleanSvg = svgStr;
    // Remove existing data-title and data-title-hidden first to be safe and clean
    cleanSvg = cleanSvg.replace(/\s*data-title="[^"]*"/gi, '');
    cleanSvg = cleanSvg.replace(/\s*data-title-hidden="[^"]*"/gi, '');

    // Add back the attributes right after <svg
    if (isHidden) {
      return cleanSvg.replace(/<svg/i, `<svg data-title-hidden="true"`);
    } else {
      return cleanSvg.replace(/<svg/i, `<svg data-title="${title}"`);
    }
  };

  // 10.5 Extract all individual <svg> tags from a single concatenated string
  const extractSvgs = (svgCodeStr?: string): string[] => {
    if (!svgCodeStr) return [];
    // Use regex to find all <svg>...</svg> blocks
    const matches = svgCodeStr.match(/<svg[\s\S]*?<\/svg>/gi);
    if (matches && matches.length > 0) {
      return matches;
    }
    // Fallback: if it starts with <svg but match failed, return the whole thing
    if (svgCodeStr.trim().startsWith('<svg')) {
      return [svgCodeStr.trim()];
    }
    return [];
  };

  // Helper to convert number into formal Arabic ordinal word
  const getArabicOrdinal = (num: number): string => {
    const ordinals: { [key: number]: string } = {
      1: 'الأول',
      2: 'الثاني',
      3: 'الثالث',
      4: 'الرابع',
      5: 'الخامس',
      6: 'السادس',
      7: 'السابع',
      8: 'الثامن',
      9: 'التاسع',
      10: 'العاشر',
      11: 'الحادي عشر',
      12: 'الثاني عشر',
      13: 'الثالث عشر',
      14: 'الرابع عشر',
      15: 'الخامس عشر',
      16: 'السادس عشر',
      17: 'السابع عشر',
      18: 'الثامن عشر',
      19: 'التاسع عشر',
      20: 'العشرون',
      21: 'الحادي والعشرون',
      22: 'الثاني والعشرون',
      23: 'الثالث والعشرون',
      24: 'الرابع والعشرون',
      25: 'الخامس والعشرون',
      26: 'السادس والعشرون',
      27: 'السابع والعشرون',
      28: 'الثامن والعشرون',
      29: 'التاسع والعشرون',
      30: 'الثلاثون'
    };
    return ordinals[num] || `${num}`;
  };

  // Format the lesson header title strictly according to standard: (الدرس الأول + عنوان الدرس)
  const formatLessonHeaderTitle = (title: string, index: number, isPracticeOnly?: boolean) => {
    const lessonNumberLabel = `الدرس ${getArabicOrdinal(index + 1)}`;
    let cleanTitle = (title || '').trim();
    
    // Remove icon if present
    cleanTitle = cleanTitle.replace(/^(✍️|📘)\s*/, '').trim();
    // Remove existing ordinal prefix if present to prevent double numbering
    cleanTitle = cleanTitle.replace(/^الدرس\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر|الثالث\s+عشر|الرابع\s+عشر|الخامس\s+عشر|السادس\s+عشر|السابع\s+عشر|الثامن\s+عشر|التاسع\s+عشر|العشرون|\d+)[\s:：\-–—]*/i, '').trim();
    cleanTitle = cleanTitle.replace(/^(الدرس\s+)?(\d+|[٠-٩]+)[\s:：\-–—.]*/i, '').trim();
    
    if (!cleanTitle) {
      cleanTitle = isPracticeOnly ? 'تدرّب وتطبيقات الكتاب' : 'شرح المفاهيم والنظريات';
    }

    const fullDisplayTitle = isPracticeOnly 
      ? `✍️ ${lessonNumberLabel}: ${cleanTitle}`
      : `${lessonNumberLabel}: ${cleanTitle}`;
    return { mainTitle: fullDisplayTitle, cleanTitle, lessonNumberLabel };
  };

  const getCoverStyles = () => {
    switch (coverBgStyle) {
      case 'gradient-violet-sky':
        return {
          wrapper: 'bg-gradient-to-br from-violet-50 to-sky-50 border-violet-300 text-slate-900',
          title: 'text-gray-950',
          teacherLabel: 'text-gray-500',
          teacherRole: 'text-violet-600',
          seriesBadge: 'bg-violet-100 text-violet-700',
          footerText: 'text-gray-500 border-violet-100',
          badgeViolet: 'bg-violet-100/70 border-violet-200 text-violet-900',
          badgeIndigo: 'bg-indigo-100/70 border-indigo-200 text-indigo-900',
          badgeSky: 'bg-sky-100/70 border-sky-200 text-sky-900',
          badgeEmerald: 'bg-emerald-100/70 border-emerald-200 text-emerald-900',
        };
      case 'gradient-emerald-mint':
        return {
          wrapper: 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300 text-emerald-950',
          title: 'text-emerald-950',
          teacherLabel: 'text-emerald-700/80',
          teacherRole: 'text-emerald-600',
          seriesBadge: 'bg-emerald-100 text-emerald-800',
          footerText: 'text-emerald-700 border-emerald-100',
          badgeViolet: 'bg-emerald-100/70 border-emerald-200 text-emerald-900',
          badgeIndigo: 'bg-teal-100/70 border-teal-200 text-teal-950',
          badgeSky: 'bg-emerald-50 border-emerald-150 text-emerald-900',
          badgeEmerald: 'bg-emerald-100/90 border-emerald-200 text-emerald-950',
        };
      case 'gradient-gold-amber':
        return {
          wrapper: 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-300 text-amber-950',
          title: 'text-amber-950',
          teacherLabel: 'text-amber-700/85',
          teacherRole: 'text-amber-600',
          seriesBadge: 'bg-amber-100 text-amber-800',
          footerText: 'text-amber-700 border-amber-100',
          badgeViolet: 'bg-amber-100/70 border-amber-200 text-amber-900',
          badgeIndigo: 'bg-yellow-100/70 border-yellow-200 text-yellow-950',
          badgeSky: 'bg-amber-50 border-amber-150 text-amber-900',
          badgeEmerald: 'bg-yellow-100/90 border-yellow-200 text-yellow-950',
        };
      case 'gradient-rose-pink':
        return {
          wrapper: 'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-300 text-rose-950',
          title: 'text-rose-950',
          teacherLabel: 'text-rose-700/80',
          teacherRole: 'text-rose-600',
          seriesBadge: 'bg-rose-100 text-rose-800',
          footerText: 'text-rose-700 border-rose-100',
          badgeViolet: 'bg-rose-100/70 border-rose-200 text-rose-900',
          badgeIndigo: 'bg-pink-100/70 border-pink-200 text-pink-950',
          badgeSky: 'bg-rose-50 border-rose-150 text-rose-900',
          badgeEmerald: 'bg-pink-100/90 border-pink-200 text-pink-950',
        };
      case 'gradient-dark-slate':
        return {
          wrapper: 'bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-sky-500 text-white',
          title: 'text-white drop-shadow-[0_2px_10px_rgba(56,189,248,0.15)]',
          teacherLabel: 'text-slate-300',
          teacherRole: 'text-sky-400',
          seriesBadge: 'bg-slate-800 text-sky-400',
          footerText: 'text-slate-400 border-slate-850',
          badgeViolet: 'bg-slate-800/90 border-slate-700 text-slate-100',
          badgeIndigo: 'bg-slate-800/90 border-slate-700 text-slate-100',
          badgeSky: 'bg-slate-800/90 border-slate-700 text-slate-100',
          badgeEmerald: 'bg-slate-800/90 border-slate-700 text-slate-100',
        };
      case 'classic-white':
      default:
        return {
          wrapper: 'bg-white border-violet-200 text-slate-900',
          title: 'text-gray-950',
          teacherLabel: 'text-gray-500',
          teacherRole: 'text-violet-600',
          seriesBadge: 'bg-violet-100 text-violet-700',
          footerText: 'text-gray-500 border-violet-100',
          badgeViolet: 'bg-violet-100/60 border-violet-200 text-violet-900',
          badgeIndigo: 'bg-indigo-100/60 border-indigo-200 text-indigo-900',
          badgeSky: 'bg-sky-100/60 border-sky-200 text-sky-900',
          badgeEmerald: 'bg-emerald-100/60 border-emerald-200 text-emerald-900',
        };
    }
  };

  const getCoverPrintCss = () => {
    switch (coverBgStyle) {
      case 'gradient-violet-sky':
        return `
          background: linear-gradient(135deg, #f5f3ff 0%, #f0f9ff 100%) !important;
          border: 6px double #c084fc !important;
          color: #0f172a !important;
        `;
      case 'gradient-emerald-mint':
        return `
          background: linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%) !important;
          border: 6px double #34d399 !important;
          color: #022c22 !important;
        `;
      case 'gradient-gold-amber':
        return `
          background: linear-gradient(135deg, #fef3c7 0%, #fffde7 100%) !important;
          border: 6px double #fbbf24 !important;
          color: #451a03 !important;
        `;
      case 'gradient-rose-pink':
        return `
          background: linear-gradient(135deg, #fff1f2 0%, #fdf2f8 100%) !important;
          border: 6px double #f43f5e !important;
          color: #4c0519 !important;
        `;
      case 'gradient-dark-slate':
        return `
          background: linear-gradient(135deg, #0f172a 0%, #020617 100%) !important;
          border: 6px double #38bdf8 !important;
          color: #ffffff !important;
        `;
      case 'classic-white':
      default:
        return `
          background: #ffffff !important;
          border: 6px double #7c3aed !important;
          color: #0f172a !important;
        `;
    }
  };

  const coverMaskBg = coverBgStyle === 'gradient-dark-slate' ? '#020617' : 
                      coverBgStyle === 'gradient-violet-sky' ? '#f0f9ff' :
                      coverBgStyle === 'gradient-emerald-mint' ? '#f0fdfa' :
                      coverBgStyle === 'gradient-gold-amber' ? '#fffde7' :
                      coverBgStyle === 'gradient-rose-pink' ? '#fdf2f8' :
                      '#ffffff';

  // Trigger browser printer
  const handlePrint = () => {
    window.print();
  };

  const cov = getCoverStyles();

  return (
    <div id="dashboard-main-container" className="max-w-7xl mx-auto p-4 md:p-6 pb-24">
      
      {/* 🟢 VIEW SUMMARY SCREEN */}
      {activeSummary && activeSummaryId ? (
        <div id="active-summary-wrapper" className="space-y-6">
          
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm gap-4 no-print transition-all">
            <button 
              onClick={() => setActiveSummaryId(null)} 
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-extrabold transition-all hover:translate-x-1"
            >
              <ArrowRight size={18} />
              العودة لكراسات الملخصات (المجموعات)
            </button>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-extrabold shadow-md transition-all h-11"
              >
                <Printer size={16} />
                تحميل كـ PDF / طباعة 🖨️
              </button>
              <button 
                onClick={downloadAsJson}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-extrabold shadow-md transition-all h-11"
                title="تصدير هذا الملخص كملف JSON لحفظه خارجياً أو مشاركته مع الآخرين"
              >
                <Download size={16} />
                تصدير الملخص JSON 💾
              </button>
              <button 
                onClick={handleStartEditBooklet}
                className="flex items-center gap-2 px-4 py-2.5 bg-sky-550 hover:bg-sky-650 text-white rounded-xl text-sm font-extrabold shadow-md transition-all h-11"
                title="تعديل العناوين والتفاصيل الأساسية للكراسة"
              >
                <Edit3 size={16} />
                تعديل المسميات/الصف 📝
              </button>
              <button 
                onClick={handleAddNewManualSection}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-750 border border-emerald-200 rounded-xl text-sm font-black hover:bg-emerald-100 transition-all h-11 shadow-xs"
                title="إضافة درس نظري جديد يتضمن المفاهيم والقواعد والملاحظات والمطبات والأمثلة"
              >
                <Plus size={16} />
                إضافة درس نظري 📘➕
              </button>
              <button 
                onClick={handleAddNewPracticeOnlySection}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-850 border border-amber-200 rounded-xl text-sm font-black hover:bg-amber-100 transition-all h-11 shadow-xs"
                title="إضافة درس تدرّب مستقل يحتوي على نص مسائل الكتاب واستراتيجية الحل والحل المفصل"
              >
                <Plus size={16} />
                إضافة درس تدرّب ✍️➕
              </button>
              <button 
                onClick={handleSplitPracticeLessons}
                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-800 border border-purple-200 rounded-xl text-sm font-black hover:bg-purple-100 transition-all h-11 shadow-xs"
                title="فصل جميع فقرات تدرّب الموجودة داخل الدروس النظرية لتصبح دروساً مستقلة ومنفصلة مرقمة بالتتابع"
              >
                <BookMarked size={16} />
                فصل دروس التدرّب 📑
              </button>
            </div>
          </div>

          {/* User guidance for saving to PDF */}
          <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 flex items-start gap-3 text-sky-800 text-xs font-semibold no-print shadow-sm">
            <Info size={18} className="text-sky-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">💡 إرشاد ذكي لتحميل الملخص كملف PDF احترافي:</span>
              <p>اضغط على زر (تحميل كـ PDF / طباعة) بالأعلى، ثم اختر الوجهة (حفظ بتنسيق PDF أو Save as PDF)، وتأكد من تفعيل خيار (رسومات الخلفية أو Background graphics) في الإعدادات الإضافية لكي تظهر الألوان والخلفيات الأنيقة والرسوم البيانية الرائعة للملخص!</p>
            </div>
          </div>

          {/* Customize Print Settings Card (no-print) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm space-y-4 no-print text-right" dir="rtl">
            <div className="flex items-center gap-2 border-b pb-2 text-indigo-950 font-bold text-sm">
              <Printer size={18} className="text-violet-600" />
              <span>تخصيص إعدادات وإخراج الطباعة (PDF)</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Column 1: Body Font Family selection */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">خط الشرح والفقرات:</span>
                <select
                  value={printFont}
                  onChange={(e) => setPrintFont(e.target.value as any)}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value="default">الخط الافتراضي الحالي</option>
                  <option value="cairo">خط Cairo العريض والمميز</option>
                  <option value="amiri">خط Amiri الأميري للطباعة الكلاسيكية</option>
                  <option value="tajawal">خط Tajawal الحديث الواضح</option>
                  <option value="almarai">خط Almarai الأنيق والمريح</option>
                  <option value="al-mithaq">خط الميثاق العربي Al-Mithaq</option>
                  <option value="scheherazade">خط نسخ شهرزاد الأصيل (Scheherazade)</option>
                  <option value="aref">خط الرقعة العربي الكلاسيكي (Aref Ruqaa)</option>
                  <option value="notonaskh">خط نوتو لنسخ الكتب المدرسية (Noto Naskh)</option>
                  <option value="reemkufi">خط الكوفي العربي الفني (Reem Kufi)</option>
                </select>
              </div>

              {/* Column 2: Body Font Size selection (Starts from 8pt as requested) */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">حجم خط الشرح والمفهوم:</span>
                <select
                  value={printFontSize}
                  onChange={(e) => setPrintFontSize(parseInt(e.target.value))}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value={8}>8pt (صغير جداً)</option>
                  <option value={9}>9pt (الافتراضي)</option>
                  <option value={10}>10pt</option>
                  <option value={11}>11pt</option>
                  <option value={12}>12pt</option>
                  <option value={13}>13pt</option>
                  <option value={14}>14pt</option>
                  <option value={15}>15pt</option>
                  <option value={16}>16pt</option>
                  <option value={17}>17pt</option>
                  <option value={18}>18pt</option>
                </select>
              </div>

              {/* Column 3: Heading Font Family selection */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">نوع خط عناوين الدروس:</span>
                <select
                  value={printHeadingFont}
                  onChange={(e) => setPrintHeadingFont(e.target.value as any)}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value="default">الافتراضي (مثل الشرح)</option>
                  <option value="cairo">خط Cairo العريض والمميز</option>
                  <option value="amiri">خط Amiri الأميري للطباعة الكلاسيكية</option>
                  <option value="tajawal">خط Tajawal الحديث الواضح</option>
                  <option value="almarai">خط Almarai الأنيق والمريح</option>
                  <option value="al-mithaq">خط الميثاق العربي Al-Mithaq</option>
                  <option value="scheherazade">خط نسخ شهرزاد الأصيل (Scheherazade)</option>
                  <option value="aref">خط الرقعة العربي الكلاسيكي (Aref Ruqaa)</option>
                  <option value="notonaskh">خط نوتو لنسخ الكتب المدرسية (Noto Naskh)</option>
                  <option value="reemkufi">خط الكوفي العربي الفني (Reem Kufi)</option>
                </select>
              </div>

              {/* Column 4: Heading Font Size selection */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">حجم خط عناوين الدروس:</span>
                <select
                  value={printHeadingFontSize}
                  onChange={(e) => setPrintHeadingFontSize(parseInt(e.target.value))}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value={12}>12pt</option>
                  <option value={13}>13pt</option>
                  <option value={14}>14pt</option>
                  <option value={15}>15pt</option>
                  <option value={16}>16pt</option>
                  <option value={17}>17pt</option>
                  <option value={18}>18pt (الافتراضي)</option>
                  <option value={19}>19pt</option>
                  <option value={20}>20pt</option>
                  <option value={21}>21pt</option>
                  <option value={22}>22pt</option>
                  <option value={23}>23pt</option>
                  <option value={24}>24pt</option>
                </select>
              </div>

              {/* Column 5: Watermark controls */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">العلامة المائية للطباعة:</span>
                <div className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    id="show-watermark-toggle"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
                  />
                  <input
                    type="text"
                    placeholder="نص العلامة المائية..."
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    disabled={!showWatermark}
                    className="flex-1 p-1.5 border border-gray-200 rounded-xl hover:border-violet-400 focus:ring-1 focus:ring-violet-400 outline-none text-xs font-bold bg-gray-50/50 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Column 6: Watermark Opacity selector */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">وضوح العلامة المائية:</span>
                <select
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                  disabled={!showWatermark}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50 disabled:opacity-50"
                >
                  <option value={0.02}>2% (خفيفة جداً)</option>
                  <option value={0.04}>4% (خفيفة)</option>
                  <option value={0.06}>6%</option>
                  <option value={0.10}>10% (افتراضية)</option>
                  <option value={0.15}>15% (واضحة)</option>
                  <option value={0.20}>20% (غامقة)</option>
                  <option value={0.30}>30% (غامقة جداً)</option>
                  <option value={0.40}>40% (تغطية واضحة)</option>
                </select>
              </div>

              {/* Column 7: Cover Page Background Style choice */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">خلفية غلاف الكراسة:</span>
                <select
                  value={coverBgStyle}
                  onChange={(e) => setCoverBgStyle(e.target.value as any)}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value="classic-white">كلاسيكي - أبيض ناصع ⚪</option>
                  <option value="gradient-violet-sky">متدرج - بنفسجي وسماوي 🌌</option>
                  <option value="gradient-emerald-mint">متدرج - زمردي ونعناعي 🌿</option>
                  <option value="gradient-gold-amber">متدرج - ذهبي ومرجاني 🔸</option>
                  <option value="gradient-rose-pink">متدرج - وردي مخملي 🌸</option>
                  <option value="gradient-dark-slate">متدرج - كحلي داكن فاخر 🌃</option>
                </select>
              </div>

              {/* Column 8: Print All Pages Footer toggle */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">تذييل لكافة الصفحات:</span>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="print-all-pages-footer-toggle"
                    checked={printAllPagesFooter}
                    onChange={(e) => setPrintAllPagesFooter(e.target.checked)}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
                  />
                  <label htmlFor="print-all-pages-footer-toggle" className="text-gray-700 font-medium cursor-pointer">
                    تفعيل التذييل لكافة صفحات الطباعة
                  </label>
                </div>
              </div>

              {/* Column 8.5: Print All Pages Header toggle */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">رأس لكافة الصفحات:</span>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="print-all-pages-header-toggle"
                    checked={printAllPagesHeader}
                    onChange={(e) => setPrintAllPagesHeader(e.target.checked)}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
                  />
                  <label htmlFor="print-all-pages-header-toggle" className="text-gray-700 font-medium cursor-pointer">
                    تفعيل رأس الصفحة لكافة صفحات الطباعة
                  </label>
                </div>
              </div>

              {/* Column 9: Footer Text */}
              <div className="flex flex-col gap-1.5 text-xs md:col-span-2">
                <span className="text-gray-500 font-bold">نص التذييل: (استخدم {'{teacherName}'} لاسم المعلم)</span>
                <input
                  type="text"
                  value={printFooterText}
                  onChange={(e) => setPrintFooterText(e.target.value)}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                  placeholder="نص التذييل..."
                />
              </div>

              {/* Column 9.1: Header Right Text */}
              <div className="flex flex-col gap-1.5 text-xs md:col-span-1">
                <span className="text-gray-500 font-bold">رأس الصفحة (يمين): (استخدم {'{title}'} لعنوان الكراسة، {'{unitName}'} للوحدة)</span>
                <input
                  type="text"
                  value={printHeaderRightText}
                  onChange={(e) => setPrintHeaderRightText(e.target.value)}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                  placeholder="رأس الصفحة يمين..."
                />
              </div>

              {/* Column 9.2: Header Left Text */}
              <div className="flex flex-col gap-1.5 text-xs md:col-span-1">
                <span className="text-gray-500 font-bold">رأس الصفحة (يسار): (استخدم {'{title}'} لعنوان الكراسة، {'{unitName}'} للوحدة)</span>
                <input
                  type="text"
                  value={printHeaderLeftText}
                  onChange={(e) => setPrintHeaderLeftText(e.target.value)}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                  placeholder="رأس الصفحة يسار..."
                />
              </div>

              {/* Column 10: Footer Font Size */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">حجم خط التذييل:</span>
                <select
                  value={printFooterFontSize}
                  onChange={(e) => setPrintFooterFontSize(parseFloat(e.target.value))}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value={5}>5pt</option>
                  <option value={6}>6pt</option>
                  <option value={7}>7pt</option>
                  <option value={8}>8pt (الافتراضي)</option>
                  <option value={8.5}>8.5pt</option>
                  <option value={9}>9pt</option>
                  <option value={10}>10pt</option>
                  <option value={11}>11pt</option>
                  <option value={12}>12pt</option>
                  <option value={13}>13pt</option>
                  <option value={14}>14pt</option>
                  <option value={15}>15pt</option>
                </select>
              </div>

              {/* Column 11: Footer Font Weight */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">نمط خط التذييل:</span>
                <select
                  value={printFooterIsBold ? 'bold' : 'normal'}
                  onChange={(e) => setPrintFooterIsBold(e.target.value === 'bold')}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value="bold">غامق 🔠</option>
                  <option value="normal">عادي 🔤</option>
                </select>
              </div>

              {/* Column 12: Header Font Size */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">حجم خط رأس الصفحة:</span>
                <select
                  value={printHeaderFontSize}
                  onChange={(e) => setPrintHeaderFontSize(parseFloat(e.target.value))}
                  className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-xs font-bold bg-gray-50/50"
                >
                  <option value={5}>5pt</option>
                  <option value={6}>6pt</option>
                  <option value={7}>7pt</option>
                  <option value={8}>8pt (الافتراضي)</option>
                  <option value={9}>9pt</option>
                  <option value={10}>10pt</option>
                  <option value={11}>11pt</option>
                  <option value={12}>12pt</option>
                  <option value={13}>13pt</option>
                  <option value={14}>14pt</option>
                  <option value={15}>15pt</option>
                  <option value={16}>16pt</option>
                </select>
              </div>

              {/* Column 13: Header Height */}
              <div className="flex flex-col gap-1.5 text-xs min-w-[150px]">
                <span className="text-gray-500 font-bold">ارتفاع حاوية رأس الصفحة:</span>
                <div className="flex items-center gap-1.5">
                  <button 
                    type="button"
                    onClick={() => setPrintHeaderHeight(prev => Math.max(15, prev - 5))}
                    className="w-7 h-7 flex items-center justify-center bg-gray-150 hover:bg-gray-250 active:scale-95 border border-gray-300 rounded-lg text-sm font-extrabold select-none transition-all"
                    title="تصغير الارتفاع"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={15}
                    max={150}
                    value={printHeaderHeight}
                    onChange={(e) => setPrintHeaderHeight(Math.max(15, Math.min(150, parseInt(e.target.value) || 45)))}
                    className="w-14 p-1 text-center border border-gray-200 rounded-lg font-bold bg-white outline-none focus:border-violet-500"
                  />
                  <span className="text-gray-400 font-medium">px</span>
                  <button 
                    type="button"
                    onClick={() => setPrintHeaderHeight(prev => Math.min(150, prev + 5))}
                    className="w-7 h-7 flex items-center justify-center bg-gray-150 hover:bg-gray-250 active:scale-95 border border-gray-300 rounded-lg text-sm font-extrabold select-none transition-all"
                    title="تكبير الارتفاع"
                  >
                    +
                  </button>
                </div>
                <input
                  type="range"
                  min={15}
                  max={150}
                  value={printHeaderHeight}
                  onChange={(e) => setPrintHeaderHeight(parseInt(e.target.value))}
                  className="w-full accent-violet-600 cursor-pointer mt-1"
                />
              </div>

              {/* Column 14: Header Background Color */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">لون خلفية رأس الصفحة:</span>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={printHeaderBgColor}
                    onChange={(e) => setPrintHeaderBgColor(e.target.value)}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={printHeaderBgColor}
                    onChange={(e) => setPrintHeaderBgColor(e.target.value)}
                    className="flex-1 p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-2xs font-mono font-bold bg-gray-50/50"
                  />
                </div>
              </div>

              {/* Column 15: Question Background Color */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">لون خلفية نص السؤال:</span>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={questionBgColor}
                    onChange={(e) => setQuestionBgColor(e.target.value)}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={questionBgColor}
                    onChange={(e) => setQuestionBgColor(e.target.value)}
                    className="flex-1 p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-2xs font-mono font-bold bg-gray-50/50"
                  />
                </div>
              </div>

              {/* Column 16: Solution Background Color */}
              <div className="flex flex-col gap-1.5 text-xs">
                <span className="text-gray-500 font-bold">لون خلفية الحل التفصيلي:</span>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={solutionBgColor}
                    onChange={(e) => setSolutionBgColor(e.target.value)}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={solutionBgColor}
                    onChange={(e) => setSolutionBgColor(e.target.value)}
                    className="flex-1 p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none transition-all text-2xs font-mono font-bold bg-gray-50/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Book Print Content Area */}
          <div id="print-area" className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden p-6 md:p-12 relative transition-all">
            
            {/* Global Watermark (Print only, in absolute foreground, positioned fixedly across content pages) */}
            {showWatermark && (
              <div className="hidden print:block print-global-watermark font-sans">
                {watermarkText}
              </div>
            )}
            
            {/* Cover/Title Page (صفحة غلاف النوطة) */}
            <div className={`print-cover-page relative flex flex-col justify-between border-2 p-8 md:p-16 rounded-3xl mb-12 min-h-[500px] md:min-h-[750px] overflow-hidden select-none ${cov.wrapper}`} style={{ breakAfter: 'page', pageBreakAfter: 'always' }}>
              {/* Elegant Background watermarks/patterns */}
              <div className="absolute -right-24 -top-24 w-96 h-96 bg-violet-200/10 rounded-full blur-3xl pointer-events-none no-print"></div>
              <div className="absolute -left-24 -bottom-24 w-96 h-96 bg-sky-200/10 rounded-full blur-3xl pointer-events-none no-print"></div>
              
              {/* TOP RIGHT: Metadata Information (المادة - الصف - الجزء - الوحدة) */}
              <div className="flex flex-col items-start text-right space-y-2.5 z-10 font-sans">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-black text-xs md:text-sm ${cov.badgeViolet}`}>
                  <span className="font-bold opacity-80">المادة:</span>
                  <span>{activeSummary.subject || 'غير محدد'}</span>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-black text-xs md:text-sm ${cov.badgeIndigo}`}>
                  <span className="font-bold opacity-80">الصف:</span>
                  <span>{activeSummary.grade || 'غير محدد'}</span>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-black text-xs md:text-sm ${cov.badgeSky}`}>
                  <span className="font-bold opacity-80">الجزء:</span>
                  <span>{activeSummary.part || 'غير محدد'}</span>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-black text-xs md:text-sm ${cov.badgeEmerald}`}>
                  <span className="font-bold opacity-80">الوحدة:</span>
                  <span>{activeSummary.unit || 'غير محدد'}</span>
                </div>
              </div>
              
              {/* CENTER/MIDDLE: Main Title & Teacher Info */}
              <div className="flex flex-col items-center justify-center text-center my-auto py-12 z-10 space-y-5">
                <div className={`inline-block px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest mb-2 shadow-sm ${cov.seriesBadge}`}>
                  {activeSummary.seriesName || 'سلسلة التبسيط المفهومي الذكية 📚✨'}
                </div>
                
                <h1 className={`text-4xl md:text-6xl font-black tracking-tight leading-tight max-w-2xl font-sans drop-shadow-sm ${cov.title}`}>
                  {activeSummary.title}
                </h1>
                
                <div className="flex flex-col items-center gap-1.5 mt-4">
                  {/* Teacher Line - بخط أنعم وأصغر */}
                  <span className={`text-base md:text-xl font-medium tracking-wide font-sans ${cov.teacherLabel}`}>
                    إعداد المدرّس: {activeSummary.teacherName || 'حسن راشد العلي'}
                  </span>
                  <span className={`text-xs font-bold font-sans ${cov.teacherRole}`}>
                    {activeSummary.teacherRole || 'مدرّس مادة الرياضيات والعلوم التفاعلية'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleStartEditBooklet}
                  className="no-print mt-4 px-4 py-2 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm border border-violet-200"
                >
                  <Edit3 size={13} />
                  تعديل بيانات وبيانات الغلاف 📝
                </button>
              </div>

              {/* BOTTOM CENTER: Platform details & Rights with fine separator line */}
              <div className={`flex flex-col items-center text-center mt-auto pt-6 border-t z-10 w-full max-w-xl mx-auto font-sans relative ${cov.footerText.split(' ')[1] || 'border-violet-150'}`}>
                <div className="w-32 h-0.5 bg-gradient-to-r from-transparent via-violet-300 to-transparent mb-4"></div>
                <p className={`text-[10px] md:text-xs font-bold leading-relaxed ${cov.footerText.split(' ')[0]}`}>
                  {printFooterText.replace('{teacherName}', activeSummary?.teacherName || 'حسن راشد العلي')}
                </p>
              </div>
            </div>

            {/* Content Pages Area Container (starts after Cover Page break) */}
            <table className="relative block print:table w-full border-collapse">
              {/* Repeating Page Header */}
              {printAllPagesHeader && (
                <thead className="hidden print:table-header-group print-page-header font-sans">
                  <tr>
                    <td>
                      <div 
                        className="print-header-bar flex justify-between items-center w-full rounded-full px-6 mb-2 font-black shadow-sm" 
                        style={{ 
                          direction: 'rtl',
                          backgroundColor: printHeaderBgColor,
                          fontSize: `${printHeaderFontSize}pt`,
                          height: `${printHeaderHeight}px`,
                          color: getContrastColor(printHeaderBgColor)
                        }}
                      >
                        <span>{printHeaderRightText.replace('{unitName}', activeSummary?.unit || 'غير محدد').replace('{title}', activeSummary?.title || '')}</span>
                        <span>{printHeaderLeftText.replace('{unitName}', activeSummary?.unit || 'غير محدد').replace('{title}', activeSummary?.title || '')}</span>
                      </div>
                      <div className="border-b border-gray-300 w-full mb-4" />
                    </td>
                  </tr>
                </thead>
              )}

              {/* Conditional Page Footer */}
              {printAllPagesFooter && (
                <tfoot className="hidden print:table-footer-group print-page-footer font-sans">
                  <tr>
                    <td>
                      <div className="border-t border-gray-300 w-full mt-2 mb-2" />
                      <div 
                        className="flex justify-between items-center w-full px-8 pt-2 pb-2"
                        style={{
                          fontSize: `${printFooterFontSize}pt`,
                          fontWeight: printFooterIsBold ? 'bold' : 'normal'
                        }}
                      >
                        <span className="text-right">{printFooterText.replace('{teacherName}', activeSummary?.teacherName || 'حسن راشد العلي')}</span>
                        <span className="text-left font-black print-page-number"></span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}

              <tbody className="block print:table-row-group w-full">
                <tr className="block print:table-row w-full">
                  <td className="block print:table-cell w-full">
                    <div className="print:pt-4 print:pb-4 print:px-2">
                  
                  {/* Academic Textbook Header Ornaments - Hidden in Print (no duplicate title page!) */}
              <div className="border-b-4 border-double border-violet-600 pb-6 mb-8 text-center print:hidden no-print">
                <div className="flex justify-between items-center text-xs md:text-sm text-gray-500 font-extrabold mb-3">
                  <span className="bg-violet-50 text-violet-700 px-3 py-1 rounded-full print:bg-transparent print:p-0 print:text-violet-600">الصف الدراسي: {activeSummary.grade}</span>
                  <span className="text-gray-400">سلسلة كراسات التبسيط المفهومي 📚</span>
                  <span className="bg-violet-50 text-violet-700 px-3 py-1 rounded-full print:bg-transparent print:p-0 print:text-violet-600">المادة: {activeSummary.subject}</span>
                </div>
                
                <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight mt-1 mb-2">
                  كراسة ملخص: {activeSummary.title}
                </h1>
                
                <div className="text-sm text-gray-500 font-medium max-w-xl mx-auto flex items-center justify-center gap-2 mt-2">
                  <Compass size={16} className="text-violet-500" />
                  <span>تبسيط الأفكار العلمية بعيداً عن صرامة النظريات وتيسير عُقد الفهم الصعبة للطالب</span>
                </div>
              </div>

            {/* Unit Lessons Index & Table of Contents (No-Print Navigation) */}
            {summarySections.length > 0 && (
              <div className="bg-white p-5 rounded-2xl border border-violet-150 shadow-xs space-y-3 no-print text-right transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-violet-600" />
                    <span className="text-sm font-black text-gray-900">
                      فهرس وتوزيع دروس الوحدة ({summarySections.length} درس):
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs font-black">
                    <span className="bg-violet-50 text-violet-800 border border-violet-200 px-2.5 py-1 rounded-lg">
                      📘 {summarySections.filter(s => !s.isPracticeOnly).length} درس نظري
                    </span>
                    <span className="bg-amber-50 text-amber-850 border border-amber-200 px-2.5 py-1 rounded-lg">
                      ✍️ {summarySections.filter(s => s.isPracticeOnly).length} درس تدرّب
                    </span>
                  </div>
                </div>

                {/* Lessons Quick Jump Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                  {summarySections.map((sec, idx) => {
                    const isPractice = !!sec.isPracticeOnly;
                    const { mainTitle } = formatLessonHeaderTitle(sec.title, idx, isPractice);
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`lesson-section-${sec.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className={`text-right px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-between gap-2 shadow-2xs hover:scale-[1.01] cursor-pointer ${
                          isPractice 
                            ? 'bg-amber-50/60 hover:bg-amber-100/80 text-amber-950 border-amber-200' 
                            : 'bg-violet-50/60 hover:bg-violet-100/80 text-violet-950 border-violet-200'
                        }`}
                      >
                        <span className="truncate flex items-center gap-1.5">
                          <span>{isPractice ? '✍️' : '📘'}</span>
                          <span className="truncate">{mainTitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Book Body Chapters Sections */}
            {summarySections.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Notebook size={48} className="mx-auto mb-4 opacity-30 text-violet-600" />
                <p className="text-lg">لم يتم إنشاء أي فقرة مبسطة في هذا الملخص بعد.</p>
              </div>
            ) : (
              <div className="space-y-12">
                {summarySections.map((sec, idx) => {
                  const { 
                    guidanceLabel, guidance, 
                    notesLabel, notes, 
                    trapsLabel, traps, 
                    examGuidanceLabel, examGuidance, 
                    exampleLabel, exampleText, exampleSvg,
                    solutionLabel, solutionText, 
                    extraExampleLabel, extraExampleText, extraExampleSvg,
                    extraSolutionLabel, extraSolutionText 
                  } = getSectionAdditions(sec);
                  const isEditingThis = editingSectionId === sec.id;

                  return (
                    <div 
                      key={sec.id} 
                      className="page-break-avoid border-2 border-gray-100 hover:border-violet-100 rounded-3xl p-6 md:p-8 bg-gray-50/30 shadow-sm relative group overflow-hidden transition-all"
                    >
                      {/* Integrated Educational Background Watermark - Hidden on cover, beautifully integrated inside content cards behind text */}
                      {showWatermark && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden screen-only-watermark" style={{ opacity: watermarkOpacity }}>
                          <span className="text-3xl md:text-5xl lg:text-6xl font-black rotate-[-25deg] whitespace-nowrap text-violet-600 font-sans tracking-widest uppercase">
                            {watermarkText}
                          </span>
                        </div>
                      )}
                      {/* Section Administrative Actions Menu (Hidden in Print) */}
                      <div className="absolute left-4 top-4 flex items-center gap-1.5 no-print bg-white/95 backdrop-blur-md p-2 rounded-xl shadow-md border border-gray-150 z-[100] transition-all">
                        <button 
                          onClick={() => reorderSection(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 text-gray-400 hover:text-violet-600 disabled:opacity-20 hover:bg-gray-100 rounded"
                          title="ترتيب للأعلى"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button 
                          onClick={() => reorderSection(idx, 'down')}
                          disabled={idx === summarySections.length - 1}
                          className="p-1.5 text-gray-400 hover:text-violet-600 disabled:opacity-20 hover:bg-gray-100 rounded"
                          title="ترتيب للأسفل"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <span className="w-px h-4 bg-gray-200 mx-1"></span>
                        <button 
                          onClick={() => triggerAiRegenForSection(sec.id!)}
                          className="p-1.5 text-violet-600 hover:bg-violet-50 rounded font-bold flex items-center gap-1 text-xs"
                          title="إعادة صياغة المفهوم كلياً بالذكاء الاصطناعي مع تقديم طلبات خاصة"
                        >
                          <Sparkles size={14} className="text-violet-500" />
                          تعديل كلي بالذكاء 🤖
                        </button>
                        <button 
                          onClick={() => startEditingSection(sec)}
                          className="px-2.5 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                          title="تعديل يدوي تفصيلي للفقرة"
                        >
                          <Edit3 size={13} />
                          <span>تعديل يدوي</span>
                        </button>
                        <button 
                          onClick={() => {
                            setVerifyingSecModal({ section: { ...sec } });
                            setVerifySecResult(null);
                            setSecAiFocusPrompt('');
                          }}
                          className="px-2.5 py-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                          title="تصحيح وتنقيح وتنسيق ذكي للفقرة"
                        >
                          <Sparkles size={13} className="text-emerald-600" />
                          <span>تصحيح وتنقيح وتنسيق ذكي</span>
                        </button>
                        <button 
                          onClick={() => exportSectionAsJson(sec)}
                          className="px-2.5 py-1 text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                          title="تصدير هذه الفقرة كملف JSON مهيكل مع كافة محتوياتها ومسائلها وتسمياتها"
                        >
                          <Download size={13} className="text-amber-600" />
                          <span>تصدير JSON 📥</span>
                        </button>
                        <button 
                          onClick={async () => {
                            showConfirm('حذف هذه الفقرة', 'هل تريد حذف هذه الفقرة والحلول المرافقة لها بالكامل من كراسة التبسيط؟', async () => {
                              await db.lessonSections.delete(sec.id!);
                              const updated = await db.lessonSections.where({ docId: activeSummaryId }).sortBy('order');
                              setSummarySections(updated);
                            });
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title="حذف الفقرة"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Editing Mode UI (Surgical replacements) */}
                      {isEditingThis && editSectionForm ? (
                        <div className="space-y-4 no-print bg-white p-6 rounded-2xl border-2 border-violet-400 relative z-10">
                          <h3 className="text-lg font-black text-violet-800 border-b pb-2 mb-3">✍️ التعديل اليدوي للفقرة الدراسية</h3>
                          
                          <div className="bg-amber-50/25 border border-amber-200/60 rounded-xl p-3 text-xs text-amber-950 leading-relaxed font-sans font-medium text-right flex items-start gap-2 shadow-sm mb-4">
                            <span className="text-sm">💡</span>
                            <div>
                              <span className="font-extrabold text-amber-900 block mb-1">تلميح ذكي للمسافات المتعددة:</span> 
                              لإضافة <span className="font-extrabold underline">5 فراغات متتالية</span> بين العبارات في نفس السطر يدوياً، اكتب ببساطة الرمز <code className="bg-white border border-amber-200/80 px-1 py-0.5 rounded font-mono font-extrabold text-amber-900 mx-0.5">,,</code> أو <code className="bg-white border border-amber-200/80 px-1 py-0.5 rounded font-mono font-extrabold text-amber-900 mx-0.5">،،</code> أو <code className="bg-white border border-amber-200/80 px-1 py-0.5 rounded font-mono font-extrabold text-amber-900 mx-0.5">[فراغ]</code> في أي صندوق نصي، وسيتم تمثيلها فوراً كخمس مسافات فارغة في لوحة العرض والطباعة!
                            </div>
                          </div>
                          
                          <div className={editSectionForm.isPracticeOnly ? "w-full mb-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
                            <div className={editSectionForm.isPracticeOnly ? "w-full" : ""}>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-black text-gray-500">{editSectionForm.isPracticeOnly ? 'عنوان قسم التدرّب (مثال: تدرّب صفحة 45):' : 'العنوان المبسط للفقرة:'}</label>
                                {!editSectionForm.isPracticeOnly && (
                                  <button 
                                    type="button"
                                    onClick={() => triggerSingleFieldRegen('title', 'العنوان المبسط للفقرة')}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-md transition-all shadow-sm"
                                  >
                                    <Sparkles size={11} className="text-violet-600 animate-pulse" />
                                    صياغة ذكية 🤖
                                  </button>
                                )}
                              </div>
                              <input 
                                type="text"
                                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-violet-500 font-bold"
                                value={editSectionForm.title}
                                onChange={e => setEditSectionForm(prev => ({ ...prev!, title: e.target.value }))}
                              />
                            </div>

                             {/* Multi-container SVG Graphics Editor (independent blocks visual hierarchy) */}
                             {!editSectionForm.isPracticeOnly && (
                               <div className="md:col-span-2 space-y-4 pt-4 border-t border-gray-150/80">
                               <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                 <div className="flex items-center gap-2 text-violet-900 flex-1 font-sans">
                                   {/* illustrationsLabel removed */}
                                 </div>
                                 <div className="flex gap-1.5 flex-wrap">
                                   <button 
                                     type="button"
                                     onClick={() => {
                                       const newSvgTemplate = `<svg width="400" height="250" viewBox="0 0 400 250" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">\n  <!-- خلفية بيضاء صلبة للطباعة وحجم خط 24 وبدون رموز مفتاحية -->\n  <rect width="100%" height="100%" fill="#ffffff" />\n  <!-- ارسم هنا بخط مقاس 24 وبدون مفاتيح جانبية -->\n  <text x="50" y="125" font-family="sans-serif" font-size="24" font-weight="bold" fill="#0f172a">رسم توضيحي جديد</text>\n</svg>`;
                                       setEditSectionForm(prev => {
                                         if (!prev) return null;
                                         const currentSvgs = extractSvgs(prev.svgCode);
                                         currentSvgs.push(newSvgTemplate);
                                         return {
                                           ...prev,
                                           svgCode: currentSvgs.join('\n\n')
                                         };
                                       });
                                     }}
                                     className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-850 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all shadow-sm bg-white"
                                     title="إضافة حاوية رسم بياني SVG جديدة"
                                   >
                                     <Plus size={14} className="text-emerald-600" />
                                     إضافة حاوية رسم جديدة ➕
                                   </button>
                                   <button 
                                     type="button"
                                     onClick={() => triggerSingleFieldRegen('svgCode', 'كود الرسم التوضيحي SVG')}
                                     className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all shadow-sm bg-white"
                                   >
                                     <Sparkles size={11} className="text-violet-600 animate-pulse" />
                                     توليد ذكي بالكامل 🤖🎨
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => setShowAiDrawingPrompt(prev => !prev)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-violet-750 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all shadow-sm bg-white"
                                      title="توليد رسم بياني SVG جديد بناءً على توجيهات مخصصة"
                                    >
                                      <Sparkles size={11} className="text-violet-600 animate-pulse" />
                                      رسم جديد بالذكاء 🤖✨
                                    </button>
                                  </div>
                                </div>

                                {showAiDrawingPrompt && (
                                  <div className="p-4 bg-violet-50/50 rounded-2xl border border-violet-250 space-y-3 transition-all my-3">
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-extrabold text-violet-900 flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-violet-600 animate-pulse" />
                                        قرر ما تود رسمه بالذكاء (SVG) 🪄:
                                      </span>
                                      <span className="text-[10px] text-gray-400">مثال: "ارسم دالة جيب الزاوية بلون أزرق، مع تفاصيل المحاور والشبكة المتعامدة"</span>
                                    </div>
                                    <textarea
                                      className="w-full px-3 py-2 text-xs border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-500 h-16 bg-white placeholder-gray-405 font-medium text-right shadow-inner"
                                      placeholder="اكتب التوصيات أو الإرشادات أو الأفكار الرياضية هنا لنقوم بتصميم ورسم حاوية الـ SVG لك فورا..."
                                      value={aiDrawingPromptText}
                                      onChange={e => setAiDrawingPromptText(e.target.value)}
                                      disabled={aiDrawingGenerating}
                                      style={{ direction: 'rtl' }}
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setShowAiDrawingPrompt(false)}
                                        className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-750 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                        disabled={aiDrawingGenerating}
                                      >
                                        إلغاء
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleAiDrawingGenerate}
                                        className="px-3.5 py-1.5 text-xs font-black text-white bg-violet-600 hover:bg-violet-750 rounded-lg flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                                        disabled={aiDrawingGenerating || !aiDrawingPromptText.trim()}
                                      >
                                        {aiDrawingGenerating ? (
                                          <>
                                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin font-bold"></span>
                                            جاري ابتكار ورسم اللوحة... 🤖🎨
                                          </>
                                        ) : (
                                          <>
                                            توليد كود الرسم 🤖🎨
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                )}
                                <div style={{ display: 'none' }} className="hidden">
                                  <div style={{ display: 'none' }}>
                                    <button style={{ display: 'none' }} type="button">
                                   </button>
                                 </div>
                               </div>

                               <div className="space-y-4">
                                 {extractSvgs(editSectionForm.svgCode).length === 0 ? (
                                   <div className="p-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-center text-gray-500 text-xs font-bold leading-normal">
                                     لا توجد حاويات رسوم حالية لهذه الفقرة. اضغط على الزر أعلاه لإضافة حاوية رسم مستقلة!
                                   </div>
                                 ) : (
                                   extractSvgs(editSectionForm.svgCode).map((svgStr, sIdx, array) => (
                                     <div key={sIdx} className="space-y-3 p-4 bg-gray-50/50 rounded-2xl border border-gray-200 shadow-sm relative">
                                       <div className="flex justify-between items-center border-b border-gray-200/60 pb-2 mb-1">
                                         <div className="flex items-center gap-2">
                                           <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black flex items-center justify-center">
                                             {sIdx + 1}
                                           </span>
                                           <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-0.5 shadow-sm">
                                              <span className="text-[10px] font-bold text-gray-400">العنوان:</span>
                                              <input
                                                type="text"
                                                className="px-1.5 py-0.5 text-xs border-0 bg-transparent font-extrabold text-gray-850 focus:ring-0 focus:outline-none w-48 placeholder-gray-400"
                                                value={isSvgTitleHidden(svgStr) ? '' : getSvgTitle(svgStr, sIdx)}
                                                disabled={isSvgTitleHidden(svgStr)}
                                                onChange={(e) => {
                                                  const newTitle = e.target.value;
                                                  const updatedStr = setSvgTitle(svgStr, newTitle, false);
                                                  const updatedArray = [...array];
                                                  updatedArray[sIdx] = updatedStr;
                                                  setEditSectionForm(prev => prev ? { ...prev, svgCode: updatedArray.join('\n\n') } : null);
                                                }}
                                                placeholder={isSvgTitleHidden(svgStr) ? "عنوان محذوف ❌" : `حاوية الرسم المستقلة #${sIdx + 1}`}
                                              />
                                              {isSvgTitleHidden(svgStr) ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updatedStr = setSvgTitle(svgStr, `حاوية الرسم المستقلة #${sIdx + 1}`, false);
                                                    const updatedArray = [...array];
                                                    updatedArray[sIdx] = updatedStr;
                                                    setEditSectionForm(prev => prev ? { ...prev, svgCode: updatedArray.join('\n\n') } : null);
                                                  }}
                                                  className="text-[9px] text-violet-600 hover:text-violet-800 font-extrabold flex items-center gap-0.5 transition-colors px-1 py-0.5 rounded bg-violet-50 hover:bg-violet-100"
                                                  title="استعادة العنوان التلقائي"
                                                >
                                                  استعادة العنوان 🔄
                                                </button>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updatedStr = setSvgTitle(svgStr, '', true);
                                                    const updatedArray = [...array];
                                                    updatedArray[sIdx] = updatedStr;
                                                    setEditSectionForm(prev => prev ? { ...prev, svgCode: updatedArray.join('\n\n') } : null);
                                                  }}
                                                  className="text-[9px] text-rose-600 hover:text-rose-800 font-extrabold flex items-center gap-0.5 transition-colors px-1 py-0.5 rounded bg-rose-50 hover:bg-rose-100"
                                                  title="حذف عنوان هذه الحاوية"
                                                >
                                                  حذف العنوان 🗑️
                                                </button>
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (aiEditingSvgIdx === sIdx) {
                                                  setAiEditingSvgIdx(null);
                                                } else {
                                                  setAiEditingSvgIdx(sIdx);
                                                  setAiEditingSvgPromptText('');
                                                }
                                              }}
                                              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-extrabold text-violet-750 bg-white hover:bg-violet-50 border border-violet-200 rounded-md transition-all shadow-sm mr-2"
                                              title="تعديل هذا الرسم البياني بالذكاء الاصطناعي"
                                            >
                                              <Sparkles size={11} className="text-violet-600 animate-pulse" />
                                              تعديل كود لرسم 🪄
                                            </button>
                                         </div>
                                         <button
                                           type="button"
                                           onClick={() => {
                                             const updated = [...array];
                                             updated.splice(sIdx, 1);
                                             setEditSectionForm(prev => prev ? { ...prev, svgCode: updated.join('\n\n') } : null);
                                           }}
                                           className="text-[10px] text-rose-600 hover:text-rose-800 font-extrabold flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100/50"
                                         >
                                           <Trash2 size={11} />
                                           حذف هذه الحاوية ❌</button></div>

                                        {aiEditingSvgIdx === sIdx && (
                                          <div className="p-3 bg-violet-50/50 rounded-2xl border border-violet-100 space-y-2.5 transition-all text-right my-2">
                                            <div className="flex justify-between items-center flex-wrap gap-2 animate-fadeIn font-sans">
                                              <span className="text-xs font-black text-violet-900 flex items-center gap-1.5">
                                                <Sparkles size={13} className="text-violet-600 animate-pulse" />
                                                توصيات لتعديل الرسم بالذكاء الاصطناعي 🪄:
                                              </span>
                                              <span className="text-[10px] text-gray-400">مثال: "اجعل لون المنحنى أحمر غامق، واكتب تفاصيل المحاور والرموز الرياضية بوضوح وبحجم خط كبير"</span>
                                            </div>
                                            <textarea
                                              className="w-full px-3 py-1.5 text-xs border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-500 h-16 bg-white placeholder-gray-400 font-medium text-right shadow-inner placeholder:text-gray-400"
                                              placeholder="اكتب التعديلات المطلوبة أو الإرشادات أو التوصيات الخاصة بهذا الرسم البياني تحديداً..."
                                              value={aiEditingSvgPromptText}
                                              onChange={e => setAiEditingSvgPromptText(e.target.value)}
                                              disabled={aiEditingSvgGenerating}
                                              style={{ direction: 'rtl' }}
                                            />
                                            <div className="flex justify-end gap-2">
                                              <button
                                                type="button"
                                                onClick={() => setAiEditingSvgIdx(null)}
                                                className="px-3 py-1 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                                disabled={aiEditingSvgGenerating}
                                              >
                                                إلغاء التعديل
                                              </button>
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  if (!aiEditingSvgPromptText.trim()) return;
                                                  setAiEditingSvgGenerating(true);
                                                  try {
                                                    const resultValue = await regenerateSingleFieldAI(
                                                      editSectionForm.title,
                                                      editSectionForm.concept,
                                                      'svgCode',
                                                      `حاوية الرسم المستقلة #${sIdx + 1}`,
                                                      svgStr,
                                                      aiEditingSvgPromptText
                                                    );

                                                    let cleanedSvg = resultValue.trim();
                                                    if (cleanedSvg.startsWith("```")) {
                                                      cleanedSvg = cleanedSvg.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
                                                    }

                                                    if (!cleanedSvg.toLowerCase().includes("<svg")) {
                                                      throw new Error("الذكاء الاصطناعي لم يرجع كود SVG صالحاً للاستبدال.");
                                                    }

                                                    const updated = [...array];
                                                    updated[sIdx] = cleanedSvg;

                                                    setEditSectionForm(prev => {
                                                      if (!prev) return null;
                                                      return {
                                                        ...prev,
                                                        svgCode: updated.join('\n\n')
                                                      };
                                                    });

                                                    setAiEditingSvgIdx(null);
                                                    setAiEditingSvgPromptText('');
                                                    showAlert('تم تعديل الرسم وتحديثه! 🎨🤖', 'تم تطبيق مراجعاتك وتحديث كود الرسم البياني بنجاح بواسطة الذكاء الاصطناعي!');
                                                  } catch (err: any) {
                                                    console.error(err);
                                                    showAlert('فشل تعديل وتوليد الرسم ❌', err.message || 'حدث خطأ أثناء محاولة تعديل الرسم بالذكاء الاصطناعي.');
                                                  } finally {
                                                    setAiEditingSvgGenerating(false);
                                                  }
                                                }}
                                                className="px-3.5 py-1.5 text-xs font-black text-white bg-violet-600 hover:bg-violet-750 rounded-lg flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                                                disabled={aiEditingSvgGenerating || !aiEditingSvgPromptText.trim()}
                                              >
                                                {aiEditingSvgGenerating ? (
                                                  <>
                                                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                    جاري التحديث... 🤖🎨
                                                  </>
                                                ) : (
                                                  <>
                                                    تطبيق التعديلات بالذكاء 🤖🎨
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                        <div className="hidden"><button className="hidden">
                                         </button>
                                       </div>
                                       
                                       <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                         <div className="lg:col-span-8 space-y-1">
                                           <span className="text-[10px] text-gray-400 font-extrabold block">الكود البرمجي الخاص بالحاوية #{sIdx + 1}:</span>
                                           <textarea
                                             className="w-full px-3 py-2 font-mono text-xs border rounded-xl focus:ring-2 focus:ring-violet-500 h-24 bg-white"
                                             value={svgStr}
                                             onChange={e => {
                                               const updated = [...array];
                                               updated[sIdx] = e.target.value;
                                               setEditSectionForm(prev => prev ? { ...prev, svgCode: updated.join('\n\n') } : null);
                                             }}
                                             placeholder="اكتب كود الـ <svg> هنا..."
                                           />
                                         </div>
                                         
                                         <div className="lg:col-span-4 p-3 bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center min-h-[120px] shadow-inner relative overflow-hidden">
                                           <span className="absolute top-1 right-2 text-[8px] font-extrabold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border">معاينة مباشرة</span>
                                           <div 
                                             className="w-full h-full max-h-[110px] [&>svg]:mx-auto [&>svg]:max-h-[90px] [&>svg]:w-full [&>svg]:h-auto flex items-center justify-center overflow-hidden"
                                             dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgStr) }}
                                           />
                                         </div>
                                       </div>
                                     </div>
                                   ))
                                 )}
                               </div>
                             </div>
                            )}
                          </div>

                          {!editSectionForm.isPracticeOnly && (
                            <div>
                              <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-1 font-sans">
                                  <span className="text-xs">📖</span>
                                  <span className="text-xs font-black text-gray-500 whitespace-nowrap">ترويسة المفهوم:</span>
                                  <input 
                                    type="text"
                                    className="px-2.5 py-1 text-xs border border-violet-200 bg-violet-50/20 rounded-lg font-bold text-violet-800 focus:ring-1 focus:ring-violet-500 outline-none flex-1 max-w-sm"
                                    value={editSectionForm.conceptLabel || ''}
                                    onChange={e => setEditSectionForm(prev => prev ? { ...prev, conceptLabel: e.target.value } : null)}
                                    placeholder="صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:"
                                  />
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => triggerSingleFieldRegen('concept', 'الشرح التبسيطي المفهومي')}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-md transition-all shadow-sm font-sans"
                                >
                                  <Sparkles size={11} className="text-violet-600 animate-pulse" />
                                  تبسيط الشرح بالذكاء 🤖✍️
                                </button>
                              </div>
                              <textarea 
                                className="w-full p-3 text-sm border rounded-xl focus:ring-2 focus:ring-violet-500 min-h-[100px]"
                                value={editSectionForm.concept}
                                onChange={e => setEditSectionForm(prev => ({ ...prev!, concept: e.target.value }))}
                              />
                            </div>
                          )}

                          {!editSectionForm.isPracticeOnly && (
                            <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                <div className="flex items-center gap-1 flex-1">
                                  <span className="text-xs">💡</span>
                                  <input 
                                    type="text"
                                    className="px-2 py-0.5 text-xs border border-blue-200 bg-blue-50/30 rounded-lg font-black text-blue-750 focus:ring-1 focus:ring-blue-500 outline-none w-full"
                                    value={editSectionForm.guidanceLabel}
                                    onChange={e => setEditSectionForm(prev => prev ? { ...prev, guidanceLabel: e.target.value } : null)}
                                  />
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => triggerSingleFieldRegen('guidance', editSectionForm.guidanceLabel)}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 border border-blue-200 rounded-md transition-all shadow-sm"
                                >
                                  <Sparkles size={11} className="text-blue-500 animate-pulse" />
                                  توليد إرشادات 🤖
                                </button>
                              </div>
                              <textarea 
                                className="w-full p-2.5 text-xs border border-blue-200 bg-blue-50/20 rounded-xl focus:ring-2 focus:ring-blue-500 h-24"
                                value={editSectionForm.guidance}
                                onChange={e => setEditSectionForm(prev => ({ ...prev!, guidance: e.target.value }))}
                              />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                <div className="flex items-center gap-1 flex-1">
                                  <span className="text-xs">🏆</span>
                                  <input 
                                    type="text"
                                    className="px-2 py-0.5 text-xs border border-amber-200 bg-amber-50/30 rounded-lg font-black text-amber-750 focus:ring-1 focus:ring-amber-500 outline-none w-full"
                                    value={editSectionForm.notesLabel}
                                    onChange={e => setEditSectionForm(prev => prev ? { ...prev, notesLabel: e.target.value } : null)}
                                  />
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => triggerSingleFieldRegen('notes', editSectionForm.notesLabel)}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-50/50 hover:bg-amber-100/50 border border-amber-200 rounded-md transition-all shadow-sm"
                                >
                                  <Sparkles size={11} className="text-amber-500 animate-pulse" />
                                  توليد ملاحظات 🤖
                                </button>
                              </div>
                              <textarea 
                                className="w-full p-2.5 text-xs border border-amber-200 bg-amber-50/20 rounded-xl focus:ring-2 focus:ring-amber-500 h-24"
                                value={editSectionForm.notes}
                                onChange={e => setEditSectionForm(prev => ({ ...prev!, notes: e.target.value }))}
                              />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                <div className="flex items-center gap-1 flex-1">
                                  <span className="text-xs">⚠️</span>
                                  <input 
                                    type="text"
                                    className="px-2 py-0.5 text-xs border border-rose-200 bg-rose-50/30 rounded-lg font-black text-rose-750 focus:ring-1 focus:ring-rose-500 outline-none w-full"
                                    value={editSectionForm.trapsLabel}
                                    onChange={e => setEditSectionForm(prev => prev ? { ...prev, trapsLabel: e.target.value } : null)}
                                  />
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => triggerSingleFieldRegen('traps', editSectionForm.trapsLabel)}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-rose-700 bg-rose-50/50 hover:bg-rose-100/50 border border-rose-200 rounded-md transition-all shadow-sm"
                                >
                                  <Sparkles size={11} className="text-rose-500 animate-pulse" />
                                  كشف المطبات 🤖
                                </button>
                              </div>
                              <textarea 
                                className="w-full p-2.5 text-xs border border-rose-200 bg-rose-50/20 rounded-xl focus:ring-2 focus:ring-rose-500 h-24"
                                value={editSectionForm.traps}
                                onChange={e => setEditSectionForm(prev => ({ ...prev!, traps: e.target.value }))}
                              />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                <div className="flex items-center gap-1 flex-1">
                                  <span className="text-xs">🎯</span>
                                  <input 
                                    type="text"
                                    className="px-2 py-0.5 text-xs border border-indigo-200 bg-indigo-50/30 rounded-lg font-black text-indigo-750 focus:ring-1 focus:ring-indigo-500 outline-none w-full"
                                    value={editSectionForm.examGuidanceLabel}
                                    onChange={e => setEditSectionForm(prev => prev ? { ...prev, examGuidanceLabel: e.target.value } : null)}
                                  />
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => triggerSingleFieldRegen('examGuidance', editSectionForm.examGuidanceLabel)}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50 border border-indigo-200 rounded-md transition-all shadow-sm"
                                >
                                  <Sparkles size={11} className="text-indigo-500 animate-pulse" />
                                  توليد منهجية الامتحان 🤖
                                </button>
                              </div>
                              <textarea 
                                className="w-full p-2.5 text-xs border border-indigo-200 bg-indigo-50/20 rounded-xl focus:ring-2 focus:ring-indigo-500 h-24"
                                value={editSectionForm.examGuidance}
                                onChange={e => setEditSectionForm(prev => ({ ...prev!, examGuidance: e.target.value }))}
                              />
                            </div>
                          </div>

                          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
                            <div>
                              <h4 className="text-xs font-black text-violet-800 border-b pb-1 mb-2">📌 التطبيق العملي للفقرة من الكتاب</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                    <input 
                                      type="text"
                                      className="px-2 py-0.5 border border-gray-200 bg-white rounded-md text-[10px] font-extrabold text-gray-700 w-full max-w-[200px] focus:ring-1 focus:ring-violet-500 outline-none"
                                      value={editSectionForm.exampleLabel}
                                      onChange={e => setEditSectionForm(prev => prev ? { ...prev, exampleLabel: e.target.value } : null)}
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => triggerSingleFieldRegen('exampleText', editSectionForm.exampleLabel)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-all"
                                    >
                                      صياغة تمرين 🤖
                                    </button>
                                  </div>
                                  <textarea 
                                    className="w-full p-2 text-xs border rounded-lg h-24 bg-white"
                                    value={editSectionForm.exampleText}
                                    onChange={e => setEditSectionForm(prev => ({ ...prev!, exampleText: e.target.value }))}
                                  />
                                  <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[10px] font-black text-violet-800">📈 رسم توضيحي بياني/هندسي (SVG)</span>
                                      <button
                                        type="button"
                                        onClick={() => triggerSingleFieldRegen('exampleSvg', editSectionForm.exampleLabel)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-all"
                                      >
                                        <Sparkles size={10} /> رسم بالذكاء 🤖
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                      <textarea 
                                        className="w-full p-2 text-xs border rounded-lg h-20 bg-white font-mono text-2xs"
                                        placeholder="كود SVG للتمرين (اختياري)"
                                        value={editSectionForm.exampleSvg || ''}
                                        onChange={e => setEditSectionForm(prev => ({ ...prev!, exampleSvg: e.target.value }))}
                                      />
                                      <div className="p-2 bg-white rounded-lg border border-gray-200 flex items-center justify-center min-h-[80px] relative overflow-hidden">
                                        <span className="absolute top-0.5 right-1 text-[8px] font-extrabold text-gray-400">معاينة مباشرة</span>
                                        {editSectionForm.exampleSvg ? (
                                          <div 
                                            className="w-full h-full max-h-[70px] [&>svg]:mx-auto [&>svg]:max-h-[60px] [&>svg]:w-full [&>svg]:h-auto flex items-center justify-center overflow-hidden"
                                            dangerouslySetInnerHTML={{ __html: makeSvgResponsive(editSectionForm.exampleSvg) }}
                                          />
                                        ) : (
                                          <span className="text-[9px] text-gray-400">لا يوجد رسم</span>
                                        )}
                                      </div>
                                    </div>

                                    {editSectionForm.exampleSvg && extractSvgs(editSectionForm.exampleSvg).length > 0 && (
                                      <div className="mt-2 space-y-2 text-right">
                                        {extractSvgs(editSectionForm.exampleSvg).map((svgStr, sIdx, array) => (
                                          <div key={sIdx} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
                                            <span className="text-[10px] font-bold text-gray-400">عنوان الرسم {sIdx + 1}:</span>
                                            <input
                                              type="text"
                                              className="px-1.5 py-0.5 text-xs border-0 bg-transparent font-extrabold text-gray-850 focus:ring-0 focus:outline-none w-48 placeholder-gray-400 text-right"
                                              value={isSvgTitleHidden(svgStr) ? '' : getSvgTitle(svgStr, sIdx)}
                                              disabled={isSvgTitleHidden(svgStr)}
                                              onChange={(e) => {
                                                const newTitle = e.target.value;
                                                const updatedStr = setSvgTitle(svgStr, newTitle, false);
                                                const updatedArray = [...array];
                                                updatedArray[sIdx] = updatedStr;
                                                setEditSectionForm(prev => prev ? { ...prev, exampleSvg: updatedArray.join('\n\n') } : null);
                                              }}
                                              placeholder={isSvgTitleHidden(svgStr) ? "عنوان محذوف ❌" : `حاوية الرسم المستقلة #${sIdx + 1}`}
                                            />
                                            {isSvgTitleHidden(svgStr) ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updatedStr = setSvgTitle(svgStr, `حاوية الرسم المستقلة #${sIdx + 1}`, false);
                                                  const updatedArray = [...array];
                                                  updatedArray[sIdx] = updatedStr;
                                                  setEditSectionForm(prev => prev ? { ...prev, exampleSvg: updatedArray.join('\n\n') } : null);
                                                }}
                                                className="text-[9px] text-violet-600 hover:text-violet-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-violet-50 hover:bg-violet-100"
                                              >
                                                استعادة العنوان 🔄
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updatedStr = setSvgTitle(svgStr, '', true);
                                                  const updatedArray = [...array];
                                                  updatedArray[sIdx] = updatedStr;
                                                  setEditSectionForm(prev => prev ? { ...prev, exampleSvg: updatedArray.join('\n\n') } : null);
                                                }}
                                                className="text-[9px] text-rose-600 hover:text-rose-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100"
                                              >
                                                حذف العنوان 🗑️
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                    <input 
                                      type="text"
                                      className="px-2 py-0.5 border border-gray-200 bg-white rounded-md text-[10px] font-extrabold text-gray-700 w-full max-w-[200px] focus:ring-1 focus:ring-violet-500 outline-none"
                                      value={editSectionForm.solutionLabel}
                                      onChange={e => setEditSectionForm(prev => prev ? { ...prev, solutionLabel: e.target.value } : null)}
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => triggerSingleFieldRegen('solutionText', editSectionForm.solutionLabel)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-all"
                                    >
                                      صياغة حل 🤖
                                    </button>
                                  </div>
                                  <textarea 
                                    className="w-full p-2 text-xs border rounded-lg h-24 bg-white"
                                    value={editSectionForm.solutionText}
                                    onChange={e => setEditSectionForm(prev => ({ ...prev!, solutionText: e.target.value }))}
                                  />
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-black text-emerald-800 border-b pb-1 mb-2">✨ تمرين إضافي مكرّس ذو صياغة ذكية من AI</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                    <input 
                                      type="text"
                                      className="px-2 py-0.5 border border-gray-200 bg-white rounded-md text-[10px] font-extrabold text-gray-700 w-full max-w-[200px] focus:ring-1 focus:ring-emerald-500 outline-none"
                                      value={editSectionForm.extraExampleLabel}
                                      onChange={e => setEditSectionForm(prev => prev ? { ...prev, extraExampleLabel: e.target.value } : null)}
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => triggerSingleFieldRegen('extraExampleText', editSectionForm.extraExampleLabel)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-all"
                                    >
                                      توليد سؤال 🤖
                                    </button>
                                  </div>
                                  <textarea 
                                    className="w-full p-2 text-xs border rounded-lg h-24 bg-white"
                                    value={editSectionForm.extraExampleText}
                                    onChange={e => setEditSectionForm(prev => ({ ...prev!, extraExampleText: e.target.value }))}
                                  />
                                  <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[10px] font-black text-emerald-800">📈 رسم توضيحي بياني/هندسي (SVG)</span>
                                      <button
                                        type="button"
                                        onClick={() => triggerSingleFieldRegen('extraExampleSvg', editSectionForm.extraExampleLabel)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-all"
                                      >
                                        <Sparkles size={10} /> رسم بالذكاء 🤖
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                      <textarea 
                                        className="w-full p-2 text-xs border rounded-lg h-20 bg-white font-mono text-2xs"
                                        placeholder="كود SVG للتمرين الإضافي (اختياري)"
                                        value={editSectionForm.extraExampleSvg || ''}
                                        onChange={e => setEditSectionForm(prev => ({ ...prev!, extraExampleSvg: e.target.value }))}
                                      />
                                      <div className="p-2 bg-white rounded-lg border border-gray-200 flex items-center justify-center min-h-[80px] relative overflow-hidden">
                                        <span className="absolute top-0.5 right-1 text-[8px] font-extrabold text-gray-400">معاينة مباشرة</span>
                                        {editSectionForm.extraExampleSvg ? (
                                          <div 
                                            className="w-full h-full max-h-[70px] [&>svg]:mx-auto [&>svg]:max-h-[60px] [&>svg]:w-full [&>svg]:h-auto flex items-center justify-center overflow-hidden"
                                            dangerouslySetInnerHTML={{ __html: makeSvgResponsive(editSectionForm.extraExampleSvg) }}
                                          />
                                        ) : (
                                          <span className="text-[9px] text-gray-400">لا يوجد رسم</span>
                                        )}
                                      </div>
                                    </div>

                                    {editSectionForm.extraExampleSvg && extractSvgs(editSectionForm.extraExampleSvg).length > 0 && (
                                      <div className="mt-2 space-y-2 text-right">
                                        {extractSvgs(editSectionForm.extraExampleSvg).map((svgStr, sIdx, array) => (
                                          <div key={sIdx} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
                                            <span className="text-[10px] font-bold text-gray-400">عنوان الرسم {sIdx + 1}:</span>
                                            <input
                                              type="text"
                                              className="px-1.5 py-0.5 text-xs border-0 bg-transparent font-extrabold text-gray-850 focus:ring-0 focus:outline-none w-48 placeholder-gray-400 text-right"
                                              value={isSvgTitleHidden(svgStr) ? '' : getSvgTitle(svgStr, sIdx)}
                                              disabled={isSvgTitleHidden(svgStr)}
                                              onChange={(e) => {
                                                const newTitle = e.target.value;
                                                const updatedStr = setSvgTitle(svgStr, newTitle, false);
                                                const updatedArray = [...array];
                                                updatedArray[sIdx] = updatedStr;
                                                setEditSectionForm(prev => prev ? { ...prev, extraExampleSvg: updatedArray.join('\n\n') } : null);
                                              }}
                                              placeholder={isSvgTitleHidden(svgStr) ? "عنوان محذوف ❌" : `حاوية الرسم المستقلة #${sIdx + 1}`}
                                            />
                                            {isSvgTitleHidden(svgStr) ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updatedStr = setSvgTitle(svgStr, `حاوية الرسم المستقلة #${sIdx + 1}`, false);
                                                  const updatedArray = [...array];
                                                  updatedArray[sIdx] = updatedStr;
                                                  setEditSectionForm(prev => prev ? { ...prev, extraExampleSvg: updatedArray.join('\n\n') } : null);
                                                }}
                                                className="text-[9px] text-violet-600 hover:text-violet-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-violet-50 hover:bg-violet-100"
                                              >
                                                استعادة العنوان 🔄
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updatedStr = setSvgTitle(svgStr, '', true);
                                                  const updatedArray = [...array];
                                                  updatedArray[sIdx] = updatedStr;
                                                  setEditSectionForm(prev => prev ? { ...prev, extraExampleSvg: updatedArray.join('\n\n') } : null);
                                                }}
                                                className="text-[9px] text-rose-600 hover:text-rose-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100"
                                              >
                                                حذف العنوان 🗑️
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                                    <input 
                                      type="text"
                                      className="px-2 py-0.5 border border-gray-200 bg-white rounded-md text-[10px] font-extrabold text-gray-700 w-full max-w-[200px] focus:ring-1 focus:ring-emerald-500 outline-none"
                                      value={editSectionForm.extraSolutionLabel}
                                      onChange={e => setEditSectionForm(prev => prev ? { ...prev, extraSolutionLabel: e.target.value } : null)}
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => triggerSingleFieldRegen('extraSolutionText', editSectionForm.extraSolutionLabel)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-all"
                                    >
                                      توليد حل 🤖
                                    </button>
                                  </div>
                                  <textarea 
                                    className="w-full p-2 text-xs border rounded-lg h-24 bg-white"
                                    value={editSectionForm.extraSolutionText}
                                    onChange={e => setEditSectionForm(prev => ({ ...prev!, extraSolutionText: e.target.value }))}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Practical Exercises (التطبيق العملي من الكتاب) */}
                            <div className="p-4 bg-violet-50/30 rounded-2xl border border-violet-150/50 space-y-4 font-sans">
                              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b pb-2">
                                <div className="flex items-center gap-2 text-violet-900 flex-1 font-sans">
                                  <span>✍️</span>
                                  <span className="text-xs font-black text-gray-500 whitespace-nowrap">ترويسة فقرة "التطبيق العملي":</span>
                                  <input 
                                    type="text"
                                    className="px-2.5 py-1 text-xs border border-violet-200 bg-violet-50/20 rounded-lg font-bold text-violet-800 focus:ring-1 focus:ring-violet-500 outline-none w-full max-w-sm"
                                    value={editSectionForm.practicalSectionLabel || ''}
                                    onChange={e => setEditSectionForm(prev => prev ? { ...prev, practicalSectionLabel: e.target.value } : null)}
                                    placeholder='فقرة "التطبيق العملي" من الكتاب المقرّر لهذا المفهوم:'
                                  />
                                  <span className="text-[10px] font-medium text-gray-500">({(editSectionForm.practicalExercises || []).length} تمارين)</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={addPracticalExercise}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold rounded-lg shadow transition-all"
                                >
                                  <Plus size={12} />
                                  إضافة تمرين "تطبيقي" جديد ➕
                                </button>
                              </div>

                              {(editSectionForm.practicalExercises || []).length === 0 ? (
                                <div className="text-center py-6 text-xs text-gray-400 font-sans font-medium bg-white rounded-xl border border-dashed border-gray-200">
                                  لا توجد أي تمارين "تدرّب" مضافة حالياً لهذه الفقرة. اضغط على الزر أعلاه لإضافة أول تمرين.
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {(editSectionForm.practicalExercises || []).map((ex, exIdx) => {
                                    const isLoadingSolution = aiExLoading[ex.id] === 'solution';
                                    const isLoadingSvg = aiExLoading[ex.id] === 'svg';
                                    const isLoadingSvgEdit = aiExLoading[ex.id] === 'svg_edit';
                                    const isAnyLoading = !!aiExLoading[ex.id];

                                    return (
                                      <div key={ex.id} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm relative space-y-3">
                                        {/* Header Controls for Single Exercise */}
                                        <div className="flex justify-between items-center bg-gray-50 -mx-4 -mt-4 px-4 py-2 rounded-t-xl border-b border-gray-150">
                                          <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black flex items-center justify-center">
                                              {exIdx + 1}
                                            </span>
                                            <input
                                              type="text"
                                              className="px-2 py-0.5 text-xs font-black text-violet-900 bg-transparent border-0 focus:ring-0 focus:outline-none w-48"
                                              value={ex.title}
                                              onChange={e => updatePracticalExerciseField(ex.id, 'title', e.target.value)}
                                              placeholder={`تمرين تدرّب #${exIdx + 1}`}
                                            />
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              disabled={exIdx === 0}
                                              onClick={() => movePracticalExercise(exIdx, 'up')}
                                              className="p-1 text-gray-500 hover:text-violet-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
                                              title="نقل للأعلى"
                                            >
                                              <ChevronUp size={14} />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={exIdx === (editSectionForm.practicalExercises || []).length - 1}
                                              onClick={() => movePracticalExercise(exIdx, 'down')}
                                              className="p-1 text-gray-500 hover:text-violet-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
                                              title="نقل للأسفل"
                                            >
                                              <ChevronDown size={14} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => deletePracticalExercise(ex.id)}
                                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                              title="حذف التمرين"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </div>

                                        {/* Main Content Fields */}
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                          {/* Question Text */}
                                          <div className="space-y-1">
                                            <span className="text-[10px] font-extrabold text-violet-800 block">📝 نص تمرين الكتاب:</span>
                                            <textarea
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 h-28 resize-y"
                                              value={ex.questionText}
                                              onChange={e => updatePracticalExerciseField(ex.id, 'questionText', e.target.value)}
                                              placeholder="اكتب هنا نص التمرين من كتاب الطالب مع الرموز الرياضية..."
                                            />
                                          </div>

                                          {/* Strategy Text */}
                                          <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                              <span className="text-[10px] font-extrabold text-amber-800 block">💡 فكرة واستراتيجية الحل (مختصرة):</span>
                                            </div>
                                            <textarea
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 h-28 resize-y bg-amber-50/10"
                                              value={ex.strategyText}
                                              onChange={e => updatePracticalExerciseField(ex.id, 'strategyText', e.target.value)}
                                              placeholder="اكتب هنا فكرة أو استراتيجية الحل باختصار لتوجيه عقل الطالب..."
                                            />
                                          </div>

                                          {/* Solution Text */}
                                          <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                              <span className="text-[10px] font-extrabold text-emerald-800 block">🔑 الحل التفصيلي النموذجى:</span>
                                              <button
                                                type="button"
                                                disabled={isAnyLoading}
                                                onClick={() => handleSolvePracticalExerciseAI(ex)}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-all disabled:opacity-50"
                                              >
                                                {isLoadingSolution ? (
                                                  <>
                                                    <Loader2 size={10} className="animate-spin" />
                                                    جاري التفكير... 🤖
                                                  </>
                                                ) : (
                                                  <>
                                                    <Sparkles size={10} />
                                                    توليد الحل بالذكاء 🤖
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                            <textarea
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 h-28 resize-y"
                                              value={ex.solutionText}
                                              onChange={e => updatePracticalExerciseField(ex.id, 'solutionText', e.target.value)}
                                              placeholder="اكتب هنا خطوات الحل النموذجي المفصل بالتفصيل مع LaTeX..."
                                            />
                                          </div>
                                        </div>

                                        {/* SVG Graphical drawing for this practice exercise */}
                                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-150 space-y-3">
                                          <div className="flex justify-between items-center flex-wrap gap-2">
                                            <span className="text-[10px] font-black text-violet-800 flex items-center gap-1">
                                              📈 رسم توضيحي بياني/هندسي خاص بالتمرين (SVG)
                                            </span>
                                            <button
                                              type="button"
                                              disabled={isAnyLoading}
                                              onClick={() => handleDrawPracticalExerciseSvgAI(ex)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold text-violet-700 bg-white hover:bg-gray-100 border border-violet-200 rounded transition-all disabled:opacity-50"
                                            >
                                              {isLoadingSvg ? (
                                                <>
                                                  <Loader2 size={10} className="animate-spin" />
                                                  جاري الرسم بالذكاء... 🎨🤖
                                                </>
                                              ) : (
                                                <>
                                                  <Sparkles size={10} />
                                                  رسم الـ SVG بالذكاء الاصطناعي ✨🤖
                                                </>
                                              )}
                                            </button>
                                          </div>

                                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                                            <div className="lg:col-span-8 space-y-1">
                                              <textarea
                                                className="w-full px-2 py-1.5 font-mono text-2xs border border-gray-200 bg-white rounded-lg focus:ring-1 focus:ring-violet-500 h-20"
                                                value={ex.svgCode || ''}
                                                onChange={e => updatePracticalExerciseField(ex.id, 'svgCode', e.target.value)}
                                                placeholder="اكتب هنا كود الـ <svg> مباشرة أو دعه فارغاً إن لم يحتاج التمرين لرسم..."
                                              />
                                            </div>

                                            <div className="lg:col-span-4 p-2 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center min-h-[80px] shadow-inner relative overflow-hidden">
                                              <span className="absolute top-0.5 right-1 text-[8px] font-extrabold text-gray-400">معاينة مباشرة</span>
                                              {ex.svgCode ? (
                                                <div 
                                                  className="w-full h-full max-h-[70px] [&>svg]:mx-auto [&>svg]:max-h-[60px] [&>svg]:w-full [&>svg]:h-auto flex items-center justify-center overflow-hidden"
                                                  dangerouslySetInnerHTML={{ __html: makeSvgResponsive(ex.svgCode) }}
                                                />
                                              ) : (
                                                <span className="text-[9px] text-gray-400 font-sans font-medium">لا يوجد رسم حالياً</span>
                                              )}
                                            </div>
                                          </div>

                                          {ex.svgCode && extractSvgs(ex.svgCode).length > 0 && (
                                            <div className="space-y-2 mt-2 text-right">
                                              {extractSvgs(ex.svgCode).map((svgStr, sIdx, array) => (
                                                <div key={sIdx} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
                                                  <span className="text-[10px] font-bold text-gray-400">عنوان الرسم {sIdx + 1}:</span>
                                                  <input
                                                    type="text"
                                                    className="px-1.5 py-0.5 text-xs border-0 bg-transparent font-extrabold text-gray-850 focus:ring-0 focus:outline-none w-48 placeholder-gray-400 text-right"
                                                    value={isSvgTitleHidden(svgStr) ? '' : getSvgTitle(svgStr, sIdx)}
                                                    disabled={isSvgTitleHidden(svgStr)}
                                                    onChange={(e) => {
                                                      const newTitle = e.target.value;
                                                      const updatedStr = setSvgTitle(svgStr, newTitle, false);
                                                      const updatedArray = [...array];
                                                      updatedArray[sIdx] = updatedStr;
                                                      updatePracticalExerciseField(ex.id, 'svgCode', updatedArray.join('\n\n'));
                                                    }}
                                                    placeholder={isSvgTitleHidden(svgStr) ? "عنوان محذوف ❌" : `حاوية الرسم المستقلة #${sIdx + 1}`}
                                                  />
                                                  {isSvgTitleHidden(svgStr) ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const updatedStr = setSvgTitle(svgStr, `حاوية الرسم المستقلة #${sIdx + 1}`, false);
                                                        const updatedArray = [...array];
                                                        updatedArray[sIdx] = updatedStr;
                                                        updatePracticalExerciseField(ex.id, 'svgCode', updatedArray.join('\n\n'));
                                                      }}
                                                      className="text-[9px] text-violet-600 hover:text-violet-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-violet-50 hover:bg-violet-100"
                                                    >
                                                      استعادة العنوان 🔄
                                                    </button>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const updatedStr = setSvgTitle(svgStr, '', true);
                                                        const updatedArray = [...array];
                                                        updatedArray[sIdx] = updatedStr;
                                                        updatePracticalExerciseField(ex.id, 'svgCode', updatedArray.join('\n\n'));
                                                      }}
                                                      className="text-[9px] text-rose-600 hover:text-rose-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100"
                                                    >
                                                      حذف العنوان 🗑️
                                                    </button>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* AI prompt box to edit/tweak SVG */}
                                          {ex.svgCode && ex.svgCode.trim() && (
                                            <div className="flex gap-2 items-center bg-white p-2 rounded-lg border border-gray-150">
                                              <input
                                                type="text"
                                                className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 outline-none"
                                                placeholder="اكتب تعليمات لتعديل الرسم (مثال: أضف نقطة A إضافية عند الإحداثيات...)"
                                                value={exSvgPrompt[ex.id] || ''}
                                                onChange={e => setExSvgPrompt(prev => ({ ...prev, [ex.id]: e.target.value }))}
                                                disabled={isAnyLoading}
                                              />
                                              <button
                                                type="button"
                                                onClick={() => handleEditPracticalExerciseSvgAI(ex)}
                                                disabled={isAnyLoading || !exSvgPrompt[ex.id]?.trim()}
                                                className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-extrabold shadow disabled:opacity-50 flex items-center gap-1 transition-all whitespace-nowrap"
                                              >
                                                {isLoadingSvgEdit ? (
                                                  <>
                                                    <Loader2 size={12} className="animate-spin" />
                                                    جاري تعديل الرسم... ✍️
                                                  </>
                                                ) : (
                                                  <>
                                                    <Sparkles size={11} />
                                                    تعديل الرسم بواسطة AI ✏️🤖
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            </div>
                            </div>
                          )}
                            {/* Textbook Practice Exercises (فقرة تدرّب من الكتاب) */}
                            <div className="p-4 bg-violet-50/30 rounded-2xl border border-violet-150/50 space-y-4 font-sans">
                              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b pb-2">
                                <div className="flex items-center gap-2 text-violet-900 flex-1 font-sans">
                                  <span>✍️</span>
                                  <span className="text-xs font-black text-gray-500 whitespace-nowrap">ترويسة فقرة "تدرّب":</span>
                                  <input 
                                    type="text"
                                    className="px-2.5 py-1 text-xs border border-violet-200 bg-violet-50/20 rounded-lg font-bold text-violet-800 focus:ring-1 focus:ring-violet-500 outline-none w-full max-w-sm"
                                    value={editSectionForm.practiceSectionLabel || ''}
                                    onChange={e => setEditSectionForm(prev => prev ? { ...prev, practiceSectionLabel: e.target.value } : null)}
                                    placeholder='فقرة "تدرّب" من الكتاب المقرّر لهذا المفهوم:'
                                  />
                                  <span className="text-[10px] font-medium text-gray-500">({(editSectionForm.practiceExercises || []).length} تمارين)</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={addPracticeExercise}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-extrabold rounded-lg shadow transition-all"
                                >
                                  <Plus size={12} />
                                  إضافة تمرين "تدرّب" جديد ➕
                                </button>
                              </div>

                              {(editSectionForm.practiceExercises || []).length === 0 ? (
                                <div className="text-center py-6 text-xs text-gray-400 font-sans font-medium bg-white rounded-xl border border-dashed border-gray-200">
                                  لا توجد أي تمارين "تدرّب" مضافة حالياً لهذه الفقرة. اضغط على الزر أعلاه لإضافة أول تمرين.
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {(editSectionForm.practiceExercises || []).map((ex, exIdx) => {
                                    const isLoadingSolution = aiExLoading[ex.id] === 'solution';
                                    const isLoadingSvg = aiExLoading[ex.id] === 'svg';
                                    const isLoadingSvgEdit = aiExLoading[ex.id] === 'svg_edit';
                                    const isAnyLoading = !!aiExLoading[ex.id];

                                    return (
                                      <div key={ex.id} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm relative space-y-3">
                                        {/* Header Controls for Single Exercise */}
                                        <div className="flex justify-between items-center bg-gray-50 -mx-4 -mt-4 px-4 py-2 rounded-t-xl border-b border-gray-150">
                                          <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black flex items-center justify-center">
                                              {exIdx + 1}
                                            </span>
                                            <input
                                              type="text"
                                              className="px-2 py-0.5 text-xs font-black text-violet-900 bg-transparent border-0 focus:ring-0 focus:outline-none w-48"
                                              value={ex.title}
                                              onChange={e => updatePracticeExerciseField(ex.id, 'title', e.target.value)}
                                              placeholder={`تمرين تدرّب #${exIdx + 1}`}
                                            />
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              disabled={exIdx === 0}
                                              onClick={() => movePracticeExercise(exIdx, 'up')}
                                              className="p-1 text-gray-500 hover:text-violet-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
                                              title="نقل للأعلى"
                                            >
                                              <ChevronUp size={14} />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={exIdx === (editSectionForm.practiceExercises || []).length - 1}
                                              onClick={() => movePracticeExercise(exIdx, 'down')}
                                              className="p-1 text-gray-500 hover:text-violet-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
                                              title="نقل للأسفل"
                                            >
                                              <ChevronDown size={14} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => deletePracticeExercise(ex.id)}
                                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                                              title="حذف التمرين"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </div>

                                        {/* Main Content Fields */}
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                          {/* Question Text */}
                                          <div className="space-y-1">
                                            <span className="text-[10px] font-extrabold text-violet-800 block">📝 نص تمرين الكتاب:</span>
                                            <textarea
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 h-28 resize-y"
                                              value={ex.questionText}
                                              onChange={e => updatePracticeExerciseField(ex.id, 'questionText', e.target.value)}
                                              placeholder="اكتب هنا نص التمرين من كتاب الطالب مع الرموز الرياضية..."
                                            />
                                          </div>

                                          {/* Strategy Text */}
                                          <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                              <span className="text-[10px] font-extrabold text-amber-800 block">💡 فكرة واستراتيجية الحل (مختصرة):</span>
                                            </div>
                                            <textarea
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 h-28 resize-y bg-amber-50/10"
                                              value={ex.strategyText}
                                              onChange={e => updatePracticeExerciseField(ex.id, 'strategyText', e.target.value)}
                                              placeholder="اكتب هنا فكرة أو استراتيجية الحل باختصار لتوجيه عقل الطالب..."
                                            />
                                          </div>

                                          {/* Solution Text */}
                                          <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                              <span className="text-[10px] font-extrabold text-emerald-800 block">🔑 الحل التفصيلي النموذجى:</span>
                                              <button
                                                type="button"
                                                disabled={isAnyLoading}
                                                onClick={() => handleSolveExerciseAI(ex)}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-all disabled:opacity-50"
                                              >
                                                {isLoadingSolution ? (
                                                  <>
                                                    <Loader2 size={10} className="animate-spin" />
                                                    جاري التفكير... 🤖
                                                  </>
                                                ) : (
                                                  <>
                                                    <Sparkles size={10} />
                                                    توليد الحل بالذكاء 🤖
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                            <textarea
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 h-28 resize-y"
                                              value={ex.solutionText}
                                              onChange={e => updatePracticeExerciseField(ex.id, 'solutionText', e.target.value)}
                                              placeholder="اكتب هنا خطوات الحل النموذجي المفصل بالتفصيل مع LaTeX..."
                                            />
                                          </div>
                                        </div>

                                        {/* SVG Graphical drawing for this practice exercise */}
                                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-150 space-y-3">
                                          <div className="flex justify-between items-center flex-wrap gap-2">
                                            <span className="text-[10px] font-black text-violet-800 flex items-center gap-1">
                                              📈 رسم توضيحي بياني/هندسي خاص بالتمرين (SVG)
                                            </span>
                                            <button
                                              type="button"
                                              disabled={isAnyLoading}
                                              onClick={() => handleDrawExerciseSvgAI(ex)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold text-violet-700 bg-white hover:bg-gray-100 border border-violet-200 rounded transition-all disabled:opacity-50"
                                            >
                                              {isLoadingSvg ? (
                                                <>
                                                  <Loader2 size={10} className="animate-spin" />
                                                  جاري الرسم بالذكاء... 🎨🤖
                                                </>
                                              ) : (
                                                <>
                                                  <Sparkles size={10} />
                                                  رسم الـ SVG بالذكاء الاصطناعي ✨🤖
                                                </>
                                              )}
                                            </button>
                                          </div>

                                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                                            <div className="lg:col-span-8 space-y-1">
                                              <textarea
                                                className="w-full px-2 py-1.5 font-mono text-2xs border border-gray-200 bg-white rounded-lg focus:ring-1 focus:ring-violet-500 h-20"
                                                value={ex.svgCode || ''}
                                                onChange={e => updatePracticeExerciseField(ex.id, 'svgCode', e.target.value)}
                                                placeholder="اكتب هنا كود الـ <svg> مباشرة أو دعه فارغاً إن لم يحتاج التمرين لرسم..."
                                              />
                                            </div>

                                            <div className="lg:col-span-4 p-2 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center min-h-[80px] shadow-inner relative overflow-hidden">
                                              <span className="absolute top-0.5 right-1 text-[8px] font-extrabold text-gray-400">معاينة مباشرة</span>
                                              {ex.svgCode ? (
                                                <div 
                                                  className="w-full h-full max-h-[70px] [&>svg]:mx-auto [&>svg]:max-h-[60px] [&>svg]:w-full [&>svg]:h-auto flex items-center justify-center overflow-hidden"
                                                  dangerouslySetInnerHTML={{ __html: makeSvgResponsive(ex.svgCode) }}
                                                />
                                              ) : (
                                                <span className="text-[9px] text-gray-400 font-sans font-medium">لا يوجد رسم حالياً</span>
                                              )}
                                            </div>
                                          </div>

                                          {ex.svgCode && extractSvgs(ex.svgCode).length > 0 && (
                                            <div className="space-y-2 mt-2 text-right">
                                              {extractSvgs(ex.svgCode).map((svgStr, sIdx, array) => (
                                                <div key={sIdx} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
                                                  <span className="text-[10px] font-bold text-gray-400">عنوان الرسم {sIdx + 1}:</span>
                                                  <input
                                                    type="text"
                                                    className="px-1.5 py-0.5 text-xs border-0 bg-transparent font-extrabold text-gray-850 focus:ring-0 focus:outline-none w-48 placeholder-gray-400 text-right"
                                                    value={isSvgTitleHidden(svgStr) ? '' : getSvgTitle(svgStr, sIdx)}
                                                    disabled={isSvgTitleHidden(svgStr)}
                                                    onChange={(e) => {
                                                      const newTitle = e.target.value;
                                                      const updatedStr = setSvgTitle(svgStr, newTitle, false);
                                                      const updatedArray = [...array];
                                                      updatedArray[sIdx] = updatedStr;
                                                      updatePracticeExerciseField(ex.id, 'svgCode', updatedArray.join('\n\n'));
                                                    }}
                                                    placeholder={isSvgTitleHidden(svgStr) ? "عنوان محذوف ❌" : `حاوية الرسم المستقلة #${sIdx + 1}`}
                                                  />
                                                  {isSvgTitleHidden(svgStr) ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const updatedStr = setSvgTitle(svgStr, `حاوية الرسم المستقلة #${sIdx + 1}`, false);
                                                        const updatedArray = [...array];
                                                        updatedArray[sIdx] = updatedStr;
                                                        updatePracticeExerciseField(ex.id, 'svgCode', updatedArray.join('\n\n'));
                                                      }}
                                                      className="text-[9px] text-violet-600 hover:text-violet-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-violet-50 hover:bg-violet-100"
                                                    >
                                                      استعادة العنوان 🔄
                                                    </button>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const updatedStr = setSvgTitle(svgStr, '', true);
                                                        const updatedArray = [...array];
                                                        updatedArray[sIdx] = updatedStr;
                                                        updatePracticeExerciseField(ex.id, 'svgCode', updatedArray.join('\n\n'));
                                                      }}
                                                      className="text-[9px] text-rose-600 hover:text-rose-800 font-extrabold flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100"
                                                    >
                                                      حذف العنوان 🗑️
                                                    </button>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* AI prompt box to edit/tweak SVG */}
                                          {ex.svgCode && ex.svgCode.trim() && (
                                            <div className="flex gap-2 items-center bg-white p-2 rounded-lg border border-gray-150">
                                              <input
                                                type="text"
                                                className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-500 outline-none"
                                                placeholder="اكتب تعليمات لتعديل الرسم (مثال: أضف نقطة A إضافية عند الإحداثيات...)"
                                                value={exSvgPrompt[ex.id] || ''}
                                                onChange={e => setExSvgPrompt(prev => ({ ...prev, [ex.id]: e.target.value }))}
                                                disabled={isAnyLoading}
                                              />
                                              <button
                                                type="button"
                                                onClick={() => handleEditExerciseSvgAI(ex)}
                                                disabled={isAnyLoading || !exSvgPrompt[ex.id]?.trim()}
                                                className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-extrabold shadow disabled:opacity-50 flex items-center gap-1 transition-all whitespace-nowrap"
                                              >
                                                {isLoadingSvgEdit ? (
                                                  <>
                                                    <Loader2 size={12} className="animate-spin" />
                                                    جاري تعديل الرسم... ✍️
                                                  </>
                                                ) : (
                                                  <>
                                                    <Sparkles size={11} />
                                                    تعديل الرسم بواسطة AI ✏️🤖
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => { 
                                setEditingSectionId(null); 
                                setEditSectionForm(null); 
                                setShowAiDrawingPrompt(false);
                                setAiDrawingPromptText('');
                                setAiDrawingGenerating(false);
                                setAiEditingSvgIdx(null);
                                setAiEditingSvgPromptText('');
                                setAiEditingSvgGenerating(false);
                              }} 
                              className="px-4 py-2 border rounded-xl text-xs font-bold"
                            >
                              إلغاء التراجع
                            </button>
                            <button 
                              onClick={saveManualEdit}
                              className="px-5 py-2 bg-violet-600 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                            >
                              <Save size={14} />
                              حفظ التعديلات الرائعة 💾
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Standard Layout for Educational Book View (Stunning Student Design)
                        <div className="space-y-6 print:space-y-2 relative z-10">
                          
                          {/* Heading badge layout */}
                          {(() => {
                            const isPractice = !!sec.isPracticeOnly;
                            const { mainTitle, cleanTitle, lessonNumberLabel } = formatLessonHeaderTitle(sec.title, idx, isPractice);
                            return (
                              <div id={`lesson-section-${sec.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-violet-100 pb-3 print:pb-1">
                                <div className="flex items-center gap-3 flex-1 flex-wrap">
                                  <span className={`px-3 py-1 rounded-xl font-black text-xs sm:text-sm shadow-xs flex items-center gap-1.5 print:px-2 print:py-0.5 print:text-xs shrink-0 ${
                                    isPractice ? 'bg-amber-500 text-white' : 'bg-violet-600 text-white'
                                  }`}>
                                    <span>{isPractice ? '✍️' : '📘'}</span>
                                    <span>{lessonNumberLabel}</span>
                                  </span>

                                  {editingTitleSecId === sec.id ? (
                                    <div className="flex items-center gap-2 flex-1 max-w-xl no-print">
                                      <input
                                        type="text"
                                        value={newTitleValue}
                                        onChange={(e) => setNewTitleValue(e.target.value)}
                                        className="px-3 py-1.5 border-2 border-violet-400 rounded-xl text-sm font-bold w-full bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        placeholder="اكتب عنوان الدرس الجديد..."
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSaveTitle(sec.id!);
                                          if (e.key === 'Escape') setEditingTitleSecId(null);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSaveTitle(sec.id!)}
                                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                                      >
                                        حفظ 💾
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingTitleSecId(null)}
                                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                                      >
                                        إلغاء
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 group/title">
                                      <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight print:text-base">
                                        {cleanTitle}
                                      </h2>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingTitleSecId(sec.id!);
                                          setNewTitleValue(sec.title || '');
                                        }}
                                        className="p-1 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all no-print cursor-pointer"
                                        title="تعديل عنوان هذا الدرس"
                                      >
                                        <Edit3 size={15} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Core Layout: Explanations with Floated SVG Graphics to optimize space */}
                          {!sec.isPracticeOnly && (
                            <div className="p-6 print:p-2 print:pt-1 bg-white rounded-2xl border border-gray-100/80 shadow-inner relative overflow-hidden clearfix">
                              
                              {/* Interactive Teacher Controls Bar for Explanation Paragraph */}
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 no-print bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
                                <span className="text-xs font-black text-slate-700 flex items-center gap-1.5 font-sans">
                                  <BookOpen size={14} className="text-violet-600" />
                                  📖 فقرة شرح المفهوم العلمي والتبسيط:
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingSubBlockModal({
                                      sectionId: sec.id!,
                                      fieldKey: 'content',
                                      fieldName: 'فقرة شرح المفهوم الأساسية',
                                      fieldValue: sec.content || '',
                                      sectionTitle: sec.title
                                    })}
                                    className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-900 text-xs font-extrabold rounded-lg border border-blue-200 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="تعديل يدوي لفقرة الشرح مع معاينة حية بالجهة المقابلة"
                                  >
                                    <Edit3 size={13} />
                                    تعديل يدوي
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVerifyingSecModal({
                                        section: { ...sec, guidance, notes, traps, examGuidance, exampleText, solutionText, extraExampleText, extraSolutionText },
                                        targetField: 'content',
                                        fieldName: 'فقرة شرح المفهوم الأساسية'
                                      });
                                      setVerifySecResult(null);
                                      setSecAiFocusPrompt('');
                                    }}
                                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="تصحيح وتنقيح وتنسيق ذكي لفقرة الشرح"
                                  >
                                    <Sparkles size={13} />
                                    تصحيح وتنقيح وتنسيق ذكي
                                  </button>
                                </div>
                              </div>

                              {sec.conceptLabel && sec.conceptLabel !== 'صياغة الفكرة بأسلوب الطالب والتبسيط العلمي الموجه:' && sec.conceptLabel.trim() !== '' && (
                                <h4 className="text-xs font-black uppercase text-violet-600 tracking-widest flex items-center gap-1.5 mb-3">
                                  <BookOpen size={14} />
                                  {sec.conceptLabel}
                                </h4>
                              )}

                              {sec.svgCode && (
                                <div className="float-left w-[180px] xs:w-[240px] sm:w-[280px] md:w-[320px] mr-4 sm:mr-6 mb-4 sm:mb-6 p-4 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100 flex flex-col items-center gap-4 shadow-sm print:float-left print:w-[260px] print:border-solid print:border-gray-250 print:bg-white">
                                  {extractSvgs(sec.svgCode).map((svgHtml, sIdx) => {
                                    const isHidden = isSvgTitleHidden(svgHtml);
                                    const title = getSvgTitle(svgHtml, sIdx);
                                    return (
                                      <div key={sIdx} className="w-full text-center border-b last:border-b-0 border-gray-200/40 pb-3 last:pb-0">
                                        {!isHidden && title && (
                                          <div className="text-[11px] font-black text-violet-800 bg-violet-100/40 border border-violet-150/45 rounded-lg px-2 py-0.5 mb-2 font-sans inline-block">
                                            {title}
                                          </div>
                                        )}
                                        <div 
                                          className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                                          dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Theoretical text content - wraps around the floated SVG on desktop! */}
                              <div className="text-[15px] leading-relaxed text-gray-850 tracking-wide font-sans md:min-h-[140px]">
                                <MathRenderer content={sec.content} className="prose max-w-none text-right" />
                              </div>

                              {/* Clear float for proper sub blocks rendering */}
                              <div className="clear-both"></div>
                            </div>
                          )}

                          {/* Sub pedagogical boxes column blocks */}
                          {!sec.isPracticeOnly && (() => {
                            const isGuidanceActive = !!(guidance && guidance.trim());
                            const isNotesActive = !!(notes && notes.trim());
                            const isTrapsActive = !!(traps && traps.trim());
                            const isExamGuidanceActive = !!(examGuidance && examGuidance.trim());
                            const activeSubBoxes = [isGuidanceActive, isNotesActive, isTrapsActive, isExamGuidanceActive].filter(Boolean).length;
                            
                            if (activeSubBoxes === 0) return null;

                            const subBoxesClass = activeSubBoxes === 1
                              ? "grid grid-cols-1 gap-4"
                              : activeSubBoxes === 2
                              ? "grid grid-cols-1 md:grid-cols-2 gap-4"
                              : activeSubBoxes === 3
                              ? "grid grid-cols-1 md:grid-cols-3 gap-4"
                              : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4";

                            return (
                              <div className={subBoxesClass}>
                                
                                {/* Smart Guidance block */}
                                {isGuidanceActive && (
                                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 shadow-sm flex flex-col relative overflow-hidden">
                                    <span className="absolute top-0 right-0 w-16 h-1 bg-blue-400"></span>
                                    <div className="flex items-center justify-between gap-1 mb-2">
                                      <h5 className="flex items-center gap-1.5 text-xs font-black text-blue-700">
                                        💡 {guidanceLabel}:
                                      </h5>
                                      <div className="flex items-center gap-1.5 no-print">
                                        <button
                                          type="button"
                                          onClick={() => setEditingSubBlockModal({
                                            sectionId: sec.id!,
                                            fieldKey: 'guidance',
                                            fieldName: guidanceLabel || 'إرشادات وتوجيهات ذهبية',
                                            fieldValue: guidance || '',
                                            sectionTitle: sec.title
                                          })}
                                          className="px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-md border border-blue-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تعديل يدوي لهذا الجزء"
                                        >
                                          <Edit3 size={11} />
                                          تعديل يدوي
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyingSecModal({
                                              section: { ...sec },
                                              targetField: 'guidance',
                                              fieldName: guidanceLabel || 'إرشادات وتوجيهات ذهبية'
                                            });
                                            setVerifySecResult(null);
                                            setSecAiFocusPrompt('');
                                          }}
                                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تصحيح وتنقيح وتنسيق ذكي"
                                        >
                                          <Sparkles size={11} />
                                          تصحيح وتنقيح وتنسيق ذكي
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-xs text-blue-950 leading-relaxed font-sans font-medium">
                                      <MathRenderer content={guidance} />
                                    </div>
                                  </div>
                                )}

                                {/* Summary Notes block */}
                                {isNotesActive && (
                                  <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100/50 shadow-sm flex flex-col relative overflow-hidden">
                                    <span className="absolute top-0 right-0 w-16 h-1 bg-amber-400"></span>
                                    <div className="flex items-center justify-between gap-1 mb-2">
                                      <h5 className="flex items-center gap-1.5 text-xs font-black text-amber-700">
                                        🏆 {notesLabel}:
                                      </h5>
                                      <div className="flex items-center gap-1.5 no-print">
                                        <button
                                          type="button"
                                          onClick={() => setEditingSubBlockModal({
                                            sectionId: sec.id!,
                                            fieldKey: 'notes',
                                            fieldName: notesLabel || 'ملاحظات وقواعد هامة',
                                            fieldValue: notes || '',
                                            sectionTitle: sec.title
                                          })}
                                          className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-800 text-[11px] font-bold rounded-md border border-amber-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تعديل يدوي لهذا الجزء"
                                        >
                                          <Edit3 size={11} />
                                          تعديل يدوي
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyingSecModal({
                                              section: { ...sec },
                                              targetField: 'notes',
                                              fieldName: notesLabel || 'ملاحظات وقواعد هامة'
                                            });
                                            setVerifySecResult(null);
                                            setSecAiFocusPrompt('');
                                          }}
                                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تصحيح وتنقيح وتنسيق ذكي"
                                        >
                                          <Sparkles size={11} />
                                          تصحيح وتنقيح وتنسيق ذكي
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-xs text-amber-955 leading-relaxed font-sans font-medium">
                                      <MathRenderer content={notes} />
                                    </div>
                                  </div>
                                )}

                                {/* Traps warning block */}
                                {isTrapsActive && (
                                  <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100/50 shadow-sm flex flex-col relative overflow-hidden">
                                    <span className="absolute top-0 right-0 w-16 h-1 bg-rose-400"></span>
                                    <div className="flex items-center justify-between gap-1 mb-2">
                                      <h5 className="flex items-center gap-1.5 text-xs font-black text-rose-700">
                                        ⚠️ {trapsLabel}:
                                      </h5>
                                      <div className="flex items-center gap-1.5 no-print">
                                        <button
                                          type="button"
                                          onClick={() => setEditingSubBlockModal({
                                            sectionId: sec.id!,
                                            fieldKey: 'traps',
                                            fieldName: trapsLabel || 'مطبات وأخطاء امتحانية شائعة',
                                            fieldValue: traps || '',
                                            sectionTitle: sec.title
                                          })}
                                          className="px-2 py-0.5 bg-white hover:bg-rose-100 text-rose-800 text-[11px] font-bold rounded-md border border-rose-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تعديل يدوي لهذا الجزء"
                                        >
                                          <Edit3 size={11} />
                                          تعديل يدوي
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyingSecModal({
                                              section: { ...sec },
                                              targetField: 'traps',
                                              fieldName: trapsLabel || 'مطبات وأخطاء امتحانية شائعة'
                                            });
                                            setVerifySecResult(null);
                                            setSecAiFocusPrompt('');
                                          }}
                                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تصحيح وتنقيح وتنسيق ذكي"
                                        >
                                          <Sparkles size={11} />
                                          تصحيح وتنقيح وتنسيق ذكي
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-xs text-rose-955 leading-normal font-sans font-semibold">
                                      <MathRenderer content={traps} />
                                    </div>
                                  </div>
                                )}

                                {/* Exam Guidance block */}
                                {isExamGuidanceActive && (
                                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 shadow-sm flex flex-col relative overflow-hidden">
                                    <span className="absolute top-0 right-0 w-16 h-1 bg-indigo-400"></span>
                                    <div className="flex items-center justify-between gap-1 mb-2">
                                      <h5 className="flex items-center gap-1.5 text-xs font-black text-indigo-700">
                                        🎯 {examGuidanceLabel}:
                                      </h5>
                                      <div className="flex items-center gap-1.5 no-print">
                                        <button
                                          type="button"
                                          onClick={() => setEditingSubBlockModal({
                                            sectionId: sec.id!,
                                            fieldKey: 'examGuidance',
                                            fieldName: examGuidanceLabel || 'طريقة ورود الفكرة في الامتحان',
                                            fieldValue: examGuidance || '',
                                            sectionTitle: sec.title
                                          })}
                                          className="px-2 py-0.5 bg-white hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold rounded-md border border-indigo-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تعديل يدوي لهذا الجزء"
                                        >
                                          <Edit3 size={11} />
                                          تعديل يدوي
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyingSecModal({
                                              section: { ...sec },
                                              targetField: 'examGuidance',
                                              fieldName: examGuidanceLabel || 'طريقة ورود الفكرة في الامتحان'
                                            });
                                            setVerifySecResult(null);
                                            setSecAiFocusPrompt('');
                                          }}
                                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تصحيح وتنقيح وتنسيق ذكي"
                                        >
                                          <Sparkles size={11} />
                                          تصحيح وتنقيح وتنسيق ذكي
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-xs text-indigo-950 leading-normal font-sans font-semibold">
                                      <MathRenderer content={examGuidance} />
                                    </div>
                                  </div>
                                )}

                              </div>
                            );
                          })()}

                          {/* Student Practice Homework/Example/Exercises Block */}
                          {!sec.isPracticeOnly && (() => {
                            const isExampleActive = !!(exampleText && exampleText.trim());
                            const isExtraExampleActive = !!(extraExampleText && extraExampleText.trim());
                            const hasPracticalExercises = sec.practicalExercises && sec.practicalExercises.length > 0;
                            
                            if (!isExampleActive && !isExtraExampleActive && !hasPracticalExercises) return null;
                            
                            return (
                              <div className="grid grid-cols-1 gap-6 mt-6">
                                {/* Textbook Exercise / Solved Example (Legacy) */}
                                {isExampleActive && (
                                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-violet-600 p-6 print:shadow-none print:border-gray-300 print:bg-white relative overflow-hidden text-right">
                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100 flex-wrap gap-2">
                                      <h5 className="flex items-center gap-2 text-sm font-black text-violet-800 font-sans">
                                        📌 {exampleLabel}:
                                      </h5>
                                      <div className="flex items-center gap-1.5 no-print">
                                        <button
                                          type="button"
                                          onClick={() => setEditingSubBlockModal({
                                            sectionId: sec.id!,
                                            fieldKey: 'exampleText',
                                            fieldName: exampleLabel || '📌 التطبيق العملي للفقرة من الكتاب',
                                            fieldValue: exampleText || '',
                                            sectionTitle: sec.title,
                                            secondaryFieldKey: 'solutionText',
                                            secondaryFieldName: solutionLabel || 'الحل النموذجي',
                                            secondaryFieldValue: solutionText || ''
                                          })}
                                          className="px-2.5 py-1 bg-white hover:bg-violet-50 text-violet-700 text-xs font-extrabold rounded-lg border border-violet-200 shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تعديل يدوي لهذا الجزء"
                                        >
                                          <Edit3 size={12} />
                                          تعديل يدوي
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyingSecModal({
                                              section: { ...sec, guidance, notes, traps, examGuidance, exampleText, solutionText, extraExampleText, extraSolutionText },
                                              targetField: 'exampleText',
                                              fieldName: exampleLabel || '📌 التطبيق العملي للفقرة من الكتاب'
                                            });
                                            setVerifySecResult(null);
                                            setSecAiFocusPrompt('');
                                          }}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تصحيح وتنقيح وتنسيق ذكي"
                                        >
                                          <Sparkles size={12} />
                                          تصحيح وتنقيح وتنسيق ذكي
                                        </button>
                                      </div>
                                    </div>
                                    
                                    {exampleSvg && (
                                      <div className="float-left w-[180px] xs:w-[240px] sm:w-[280px] md:w-[320px] mr-4 sm:mr-6 mb-4 sm:mb-6 p-3 bg-white rounded-xl border border-gray-200 flex flex-col items-center gap-3 shadow-none print:float-left print:w-[240px] print:border-gray-300 print:bg-white animate-fade-in">
                                        {extractSvgs(exampleSvg).map((svgHtml, sIdx) => {
                                          const isHidden = isSvgTitleHidden(svgHtml);
                                          const hasTitleAttr = svgHtml.includes('data-title="');
                                          const title = isHidden 
                                            ? '' 
                                            : (hasTitleAttr 
                                                ? (getSvgTitle(svgHtml, sIdx) || '') 
                                                : 'الشكل الهندسي للتمرين');
                                          return (
                                            <div key={sIdx} className="w-full text-center border-b last:border-b-0 border-gray-200/40 pb-3 last:pb-0">
                                              {!isHidden && title && (
                                                <div className="text-[11px] font-black text-violet-800 bg-violet-100/40 border border-violet-150/45 rounded-lg px-2 py-0.5 mb-2 font-sans inline-block">
                                                  {title}
                                                </div>
                                              )}
                                              <div 
                                                className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                                                dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <div className="text-[14px] leading-relaxed text-gray-900 p-4 rounded-lg border border-slate-200/60 mb-4 w-full font-medium question-box" style={{ backgroundColor: questionBgColor }}>
                                      <MathRenderer content={exampleText} />
                                    </div>
                                    
                                    {solutionText && solutionText.trim() && (
                                      <div className="space-y-2 clear-both text-right">
                                        <h6 className="text-xs font-black text-emerald-700 flex items-center gap-1 font-sans">
                                          <CheckCircle size={14} />
                                          {solutionLabel}:
                                        </h6>
                                        <div className="text-[14px] leading-relaxed text-slate-850 p-4 border-r-2 border-emerald-500 rounded-l-lg rounded-r-none border-t border-b border-l border-emerald-100/50 text-right w-full solution-box" style={{ backgroundColor: solutionBgColor }}>
                                          <MathRenderer content={solutionText} />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Extra AI Generated Exercise (Legacy) */}
                                {isExtraExampleActive && (
                                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-pink-600 p-6 print:shadow-none print:border-gray-300 print:bg-white relative overflow-hidden text-right">
                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100 flex-wrap gap-2">
                                      <h5 className="flex items-center gap-2 text-sm font-black text-pink-700 font-sans">
                                        <Sparkles size={16} />
                                        {extraExampleLabel}:
                                      </h5>
                                      <div className="flex items-center gap-1.5 no-print">
                                        <button
                                          type="button"
                                          onClick={() => setEditingSubBlockModal({
                                            sectionId: sec.id!,
                                            fieldKey: 'extraExampleText',
                                            fieldName: extraExampleLabel || '✨ تمرين إضافي مكرّس ذو صياغة ذكية من AI',
                                            fieldValue: extraExampleText || '',
                                            sectionTitle: sec.title,
                                            secondaryFieldKey: 'extraSolutionText',
                                            secondaryFieldName: extraSolutionLabel || 'حل التمرين الإضافي',
                                            secondaryFieldValue: extraSolutionText || ''
                                          })}
                                          className="px-2.5 py-1 bg-white hover:bg-pink-50 text-pink-700 text-xs font-extrabold rounded-lg border border-pink-200 shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تعديل يدوي لهذا الجزء"
                                        >
                                          <Edit3 size={12} />
                                          تعديل يدوي
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setVerifyingSecModal({
                                              section: { ...sec, guidance, notes, traps, examGuidance, exampleText, solutionText, extraExampleText, extraSolutionText },
                                              targetField: 'extraExampleText',
                                              fieldName: extraExampleLabel || '✨ تمرين إضافي مكرّس ذو صياغة ذكية من AI'
                                            });
                                            setVerifySecResult(null);
                                            setSecAiFocusPrompt('');
                                          }}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer"
                                          title="تصحيح وتنقيح وتنسيق ذكي"
                                        >
                                          <Sparkles size={12} />
                                          تصحيح وتنقيح وتنسيق ذكي
                                        </button>
                                      </div>
                                    </div>
                                    
                                    {extraExampleSvg && (
                                      <div className="float-left w-[180px] xs:w-[240px] sm:w-[280px] md:w-[320px] mr-4 sm:mr-6 mb-4 sm:mb-6 p-3 bg-white rounded-xl border border-gray-200 flex flex-col items-center gap-3 shadow-none print:float-left print:w-[240px] print:border-gray-300 print:bg-white animate-fade-in">
                                        {extractSvgs(extraExampleSvg).map((svgHtml, sIdx) => {
                                          const isHidden = isSvgTitleHidden(svgHtml);
                                          const hasTitleAttr = svgHtml.toLowerCase().includes('data-title="') || svgHtml.toLowerCase().includes("data-title='");
                                          const title = isHidden 
                                            ? '' 
                                            : (hasTitleAttr 
                                                ? (getSvgTitle(svgHtml, sIdx) || '') 
                                                : 'الشكل الهندسي للتمرين');
                                          return (
                                            <div key={sIdx} className="w-full text-center border-b last:border-b-0 border-gray-200/40 pb-3 last:pb-0">
                                              {!isHidden && title && (
                                                <div className="text-[11px] font-black text-pink-800 bg-pink-100/40 border border-pink-150/45 rounded-lg px-2 py-0.5 mb-2 font-sans inline-block">
                                                  {title}
                                                </div>
                                              )}
                                              <div 
                                                className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                                                dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    
                                    <div className="text-[14px] leading-relaxed text-gray-900 p-4 rounded-lg border border-slate-200/60 mb-4 w-full font-medium question-box" style={{ backgroundColor: questionBgColor }}>
                                      <MathRenderer content={extraExampleText} />
                                    </div>

                                    {extraSolutionText && extraSolutionText.trim() && (
                                      <div className="space-y-2 clear-both text-right">
                                        <h6 className="text-xs font-black text-emerald-700 flex items-center gap-1 font-sans">
                                          <CheckCircle size={14} />
                                          {extraSolutionLabel}:
                                        </h6>
                                        <div className="text-[14px] leading-relaxed text-slate-850 p-4 border-r-2 border-emerald-500 rounded-l-lg rounded-r-none border-t border-b border-l border-emerald-100/50 text-right w-full solution-box" style={{ backgroundColor: solutionBgColor }}>
                                          <MathRenderer content={extraSolutionText} />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                {/* Dynamic Practical Exercises */}
                                {hasPracticalExercises && sec.practicalExercises!.map((ex, exIdx) => (
                                  <div key={ex.id} className="bg-white rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-violet-600 p-6 print:shadow-none print:border-gray-300 print:bg-white relative overflow-hidden text-right">
                                    <div className="flex justify-between items-center mb-4 flex-wrap gap-2 pb-2 border-b border-gray-100 no-print:pb-2 no-print:border-b">
                                      <h5 className="flex items-center gap-2 text-sm font-black text-violet-800 font-sans">
                                        <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center">
                                          {exIdx + 1}
                                        </span>
                                        {ex.title || `تمرين تطبيقي #${exIdx + 1}`}
                                      </h5>

                                      {/* Practical Actions (no-print) */}
                                      <div className="flex items-center gap-2 no-print">
                                        <button
                                          onClick={() => setEditingExModal({
                                            sectionId: sec.id!,
                                            isPractical: true,
                                            exercise: { ...ex }
                                          })}
                                          className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-violet-50 text-violet-700 hover:text-violet-950 text-xs font-extrabold rounded-lg border border-violet-200 transition-all shadow-sm cursor-pointer"
                                        >
                                          <Edit3 size={12} />
                                          تعديل يدوياً
                                        </button>
                                        
                                        <button
                                          onClick={() => {
                                            setVerifyingExModal({
                                              sectionId: sec.id!,
                                              isPractical: true,
                                              exercise: { ...ex }
                                            });
                                            setVerifyResult(null);
                                            setVerifyShorten(false);
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg transition-all shadow-sm cursor-pointer"
                                        >
                                          <CheckCircle size={12} />
                                          تحقق الذكي
                                        </button>
                                      </div>
                                    </div>
                                    
                                    {/* Print Title Only */}
                                    <h5 className="hidden print:flex items-center gap-2 text-sm font-black text-violet-800 mb-3 font-sans">
                                      <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center">
                                        {exIdx + 1}
                                      </span>
                                      {ex.title || `تمرين تطبيقي #${exIdx + 1}`}:
                                    </h5>
                                    
                                    {ex.svgCode && ex.svgCode.trim() && (
                                      <div className="float-left w-[180px] xs:w-[240px] sm:w-[280px] md:w-[320px] mr-4 sm:mr-6 mb-4 sm:mb-6 p-3 bg-white rounded-xl border border-gray-200 flex flex-col items-center gap-3 shadow-none print:float-left print:w-[240px] print:border-gray-300 print:bg-white animate-fade-in">
                                        {extractSvgs(ex.svgCode).map((svgHtml, sIdx) => {
                                          const isHidden = isSvgTitleHidden(svgHtml);
                                          const hasTitleAttr = svgHtml.toLowerCase().includes('data-title="') || svgHtml.toLowerCase().includes("data-title='");
                                          const title = isHidden 
                                            ? '' 
                                            : (hasTitleAttr 
                                                ? (getSvgTitle(svgHtml, sIdx) || '') 
                                                : 'الشكل الهندسي للتمرين');
                                          return (
                                            <div key={sIdx} className="w-full text-center border-b last:border-b-0 border-gray-200/40 pb-3 last:pb-0">
                                              {!isHidden && title && (
                                                <div className="text-[11px] font-black text-violet-800 bg-violet-100/40 border border-violet-150/45 rounded-lg px-2 py-0.5 mb-2 font-sans inline-block">
                                                  {title}
                                                </div>
                                              )}
                                              <div 
                                                className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                                                dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <div className="text-[14px] leading-relaxed text-gray-900 p-4 rounded-lg border border-slate-200/60 mb-4 w-full font-medium question-box" style={{ backgroundColor: questionBgColor }}>
                                      <MathRenderer content={ex.questionText} />
                                    </div>
                                    
                                    {ex.strategyText && ex.strategyText.trim() && (
                                      <div className="p-3.5 mb-4 bg-yellow-50/80 rounded-xl border border-[#78350f] text-xs text-amber-950 leading-relaxed font-sans font-medium text-right w-full clear-both print:bg-[#fefce8] print:border-[#78350f]">
                                        <span className="font-extrabold text-amber-900 block mb-0.5">💡 فكرة واستراتيجية الحل السريعة:</span>
                                        <MathRenderer content={ex.strategyText} />
                                      </div>
                                    )}

                                    {ex.solutionText && ex.solutionText.trim() && (
                                      <div className="space-y-2 clear-both text-right">
                                        <h6 className="text-xs font-black text-emerald-700 flex items-center gap-1 font-sans">
                                          <CheckCircle size={14} />
                                          الحل النموذجي:
                                        </h6>
                                        <div className="text-[14px] leading-relaxed text-slate-850 p-4 border-r-2 border-emerald-500 rounded-l-lg rounded-r-none border-t border-b border-l border-emerald-100/50 text-right w-full solution-box" style={{ backgroundColor: solutionBgColor }}>
                                          <MathRenderer content={ex.solutionText} />
                                        </div>
                                      </div>
                                    )}

                                    {/* Training Field (ميدان التدريب) */}
                                    <div className="pt-4 mt-4 border-t border-violet-100 no-print">
                                      <PatternGuidedTrainer
                                        exercise={ex}
                                        sectionId={sec.id!}
                                        lessonTitle={activeSummary?.title}
                                        unitTitle={activeSummary?.unit}
                                        grade={activeSummary?.grade}
                                        subject={activeSummary?.subject}
                                        isAdmin={true}
                                        onUpdateExercise={async (updatedEx) => {
                                          await handleSaveManualExercise(sec.id!, true, updatedEx);
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}

                              </div>
                            );
                          })()}
                          
                          {/* Practice Exercises (تدرّب) Student View */}
                          {sec.practiceExercises && sec.practiceExercises.length > 0 ? (
                            <div className="mt-8 space-y-4">
                              <div className="flex items-center justify-between border-b border-violet-100 pb-2 flex-wrap gap-2">
                                {sec.practiceSectionLabel && 
                                 sec.practiceSectionLabel.trim() !== "" && 
                                 sec.practiceSectionLabel !== 'تدرّب خاص بالدرس النظري (من الكتاب المدرسي المقرّر):' && 
                                 sec.practiceSectionLabel !== '✍️ تدرّب خاص بالدرس النظري (تمارين الكتاب)' && 
                                 sec.practiceSectionLabel !== 'فقرة "تدرّب" من الكتاب المقرّر لهذا المفهوم:' ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">✍️</span>
                                    <h3 className="text-base font-black text-violet-900 font-sans">{sec.practiceSectionLabel}</h3>
                                  </div>
                                ) : (
                                  <div />
                                )}
                                <button
                                  onClick={() => {
                                    const nextIndex = (sec.practiceExercises?.length || 0) + 1;
                                    const newExId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                                    const newEx: PracticeExercise = {
                                      id: newExId,
                                      title: `تمرين تدرّب #${nextIndex}`,
                                      questionText: '',
                                      strategyText: '',
                                      solutionText: '',
                                      svgCode: ''
                                    };
                                    setEditingExModal({
                                      sectionId: sec.id!,
                                      isPractical: false,
                                      exercise: newEx
                                    });
                                  }}
                                  className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
                                  title="إضافة تمرين جديد لهذه الفقرة"
                                >
                                  <Plus size={14} />
                                  إضافة تمرين جديد
                                </button>
                              </div>

                              <div className="space-y-4">
                                {sec.practiceExercises.map((ex, exIdx) => (
                                  <div key={ex.id} className="bg-white rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-violet-650 overflow-hidden text-right print:shadow-none print:border-gray-300">
                                    <div className="bg-violet-50/10 px-5 py-3 border-b border-gray-200/60 flex justify-between items-center flex-wrap gap-2 print:bg-white print:border-gray-300">
                                      <span className="text-xs font-black text-violet-900 flex items-center gap-1.5 font-sans">
                                        <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center">
                                          {exIdx + 1}
                                        </span>
                                        {ex.title || `تمرين تدرّب #${exIdx + 1}`}
                                      </span>

                                      {/* Action buttons (no-print) */}
                                      <div className="flex items-center gap-2 no-print">
                                        <button
                                          onClick={() => setEditingExModal({
                                            sectionId: sec.id!,
                                            isPractical: false,
                                            exercise: { ...ex }
                                          })}
                                          className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-violet-50 text-violet-700 hover:text-violet-950 text-xs font-extrabold rounded-lg border border-violet-200 transition-all shadow-sm cursor-pointer"
                                          title="تعديل هذا التمرين يدوياً مع الرسم SVG واستراتيجية الحل"
                                        >
                                          <Edit3 size={12} />
                                          تعديل يدوياً
                                        </button>
                                        
                                        <button
                                          onClick={() => {
                                            setVerifyingExModal({
                                              sectionId: sec.id!,
                                              isPractical: false,
                                              exercise: { ...ex }
                                            });
                                            setVerifyResult(null);
                                            setVerifyShorten(false);
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg transition-all shadow-sm cursor-pointer"
                                          title="التحقق من صحة الحل ودقته رياضياً وإملائياً"
                                        >
                                          <CheckCircle size={12} />
                                          تحقق الذكي
                                        </button>
                                      </div>
                                    </div>

                                    <div className="p-5 space-y-4">
                                                                            {/* SVG block (Render at the top of the exercise if present) */}
                                      {ex.svgCode && ex.svgCode.trim() && (
                                        <div className="float-left w-[180px] xs:w-[240px] sm:w-[280px] md:w-[320px] mr-4 sm:mr-6 mb-4 sm:mb-6 p-3 bg-white rounded-xl border border-gray-200 flex flex-col items-center gap-3 shadow-none print:float-left print:w-[240px] print:border-gray-300 print:bg-white animate-fade-in">
                                          {extractSvgs(ex.svgCode).map((svgHtml, sIdx) => {
                                            const isHidden = isSvgTitleHidden(svgHtml);
                                            const hasTitleAttr = svgHtml.toLowerCase().includes('data-title="') || svgHtml.toLowerCase().includes("data-title='");
                                            const title = isHidden 
                                              ? '' 
                                              : (hasTitleAttr 
                                                  ? (getSvgTitle(svgHtml, sIdx) || '') 
                                                  : 'الشكل الهندسي للتمرين');
                                            return (
                                              <div key={sIdx} className="w-full text-center border-b last:border-b-0 border-gray-200/40 pb-3 last:pb-0">
                                                {!isHidden && title && (
                                                  <div className="text-[11px] font-black text-violet-800 bg-violet-100/40 border border-violet-150/45 rounded-lg px-2 py-0.5 mb-2 font-sans inline-block">
                                                    {title}
                                                  </div>
                                                )}
                                                <div 
                                                  className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                                                  dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                                                />
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {/* Question & Strategy block (Always stretches to full container width) */}
                                      <div className="space-y-3 w-full">
                                        <div className="text-[14px] leading-relaxed text-gray-900 p-4 rounded-lg border border-slate-200/60 text-right w-full font-medium question-box" style={{ backgroundColor: questionBgColor }}>
                                          <MathRenderer content={ex.questionText} />
                                        </div>
                                        {ex.strategyText && ex.strategyText.trim() && (
                                          <div className="p-3.5 bg-yellow-50/80 rounded-xl border border-[#78350f] text-xs text-amber-950 leading-relaxed font-sans font-medium text-right w-full clear-both print:bg-[#fefce8] print:border-[#78350f]">
                                            <span className="font-extrabold text-amber-900 block mb-0.5">💡 فكرة واستراتيجية الحل السريعة:</span>
                                            <MathRenderer content={ex.strategyText} />
                                          </div>
                                        )}
                                      </div>
                                      {/* Solution steps */}
                                      {ex.solutionText && ex.solutionText.trim() && (
                                        <div className="pt-3 border-t border-gray-150 space-y-2 text-right">
                                          <span className="text-xs font-black text-emerald-800 block font-sans">🔑 الحل التفصيلي والنموذجي للتمرين:</span>
                                          <div className="text-[14px] leading-relaxed text-slate-850 p-4 border-r-2 border-emerald-500 rounded-l-lg rounded-r-none border-t border-b border-l border-emerald-100/50 text-right w-full solution-box" style={{ backgroundColor: solutionBgColor }}>
                                            <MathRenderer content={ex.solutionText} />
                                          </div>
                                        </div>
                                      )}

                                      {/* Training Field (ميدان التدريب) */}
                                      <div className="pt-4 border-t border-violet-100 no-print">
                                        <PatternGuidedTrainer
                                          exercise={ex}
                                          sectionId={sec.id!}
                                          lessonTitle={activeSummary?.title}
                                          unitTitle={activeSummary?.unit}
                                          grade={activeSummary?.grade}
                                          subject={activeSummary?.subject}
                                          isAdmin={true}
                                          onUpdateExercise={async (updatedEx) => {
                                            await handleSaveManualExercise(sec.id!, false, updatedEx);
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {/* Add Another Exercise Button at the bottom of the list */}
                                <div className="no-print pt-2">
                                  <button
                                    onClick={() => {
                                      const nextIndex = (sec.practiceExercises?.length || 0) + 1;
                                      const newExId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                                      const newEx: PracticeExercise = {
                                        id: newExId,
                                        title: `تمرين تدرّب #${nextIndex}`,
                                        questionText: '',
                                        strategyText: '',
                                        solutionText: '',
                                        svgCode: ''
                                      };
                                      setEditingExModal({
                                        sectionId: sec.id!,
                                        isPractical: false,
                                        exercise: newEx
                                      });
                                    }}
                                    className="w-full py-3 bg-violet-50/60 hover:bg-violet-100/80 border-2 border-dashed border-violet-200 text-violet-800 hover:text-violet-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
                                  >
                                    <Plus size={16} />
                                    إضافة تمرين جديد إلى هذه الفقرة ✍️
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : sec.isPracticeOnly ? (
                            /* Empty Practice-Only Section State */
                            <div className="p-8 text-center bg-violet-50/50 rounded-2xl border-2 border-dashed border-violet-200 space-y-3 no-print my-6">
                              <div className="w-12 h-12 bg-violet-100 text-violet-700 rounded-full flex items-center justify-center mx-auto text-xl shadow-sm">
                                ✍️
                              </div>
                              <h4 className="text-sm font-black text-violet-950 font-sans">
                                فقرة تدرّب فارغة (جاهزة لكتابة التمارين والحلول)
                              </h4>
                              <p className="text-xs text-gray-500 font-medium max-w-md mx-auto leading-relaxed">
                                اضغط على الزر أدناه لإضافة تمرين جديد وكتابة نص المسألة، استراتيجية وفكرة الحل، خطوات الحل النموذجي، وكود الرسم إن وجد.
                              </p>
                              <div className="pt-2">
                                <button
                                  onClick={() => {
                                    const newExId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                                    const newEx: PracticeExercise = {
                                      id: newExId,
                                      title: `تمرين تدرّب #1`,
                                      questionText: '',
                                      strategyText: '',
                                      solutionText: '',
                                      svgCode: ''
                                    };
                                    setEditingExModal({
                                      sectionId: sec.id!,
                                      isPractical: false,
                                      exercise: newEx
                                    });
                                  }}
                                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                                >
                                  <Plus size={16} />
                                  إضافة تمرين جديد وكتابة السؤال والحل
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}

            {/* Unit Comprehensive Review Section (مراجعة شاملة للوحدة) */}
            {activeSummary && (
              <div className="mt-12 page-break-before">
                <UnitComprehensiveReviewSection
                  document={activeSummary}
                  sections={summarySections}
                  isAdmin={true}
                  onUpdate={() => {
                    // Refresh if needed
                  }}
                />
              </div>
            )}

            {/* Unit Quiz Section */}
            {activeSummary && (
              <div className="mt-12 no-print page-break-before">
                <UnitQuizSection
                  document={activeSummary}
                  sections={summarySections}
                  isAdmin={true}
                  onUpdateDocument={() => {
                    // Refresh parent if needed
                  }}
                />
              </div>
            )}

            {/* Unit Mind Map Section */}
            {activeSummary && (
              <div className="mt-12 no-print page-break-before">
                <UnitMindMapSection
                  document={activeSummary}
                  sections={summarySections}
                  isAdmin={true}
                />
              </div>
            )}

            {/* Academic Textbook Footer Details (Print only) */}
            <div className="hidden print:flex justify-between items-center text-xs text-gray-400 mt-12 pt-4 border-t-2 border-double border-gray-205">
              <span>اسم الطالب وملاحظاته: .......................................</span>
              <span>تاريخ التلخيص: {new Date().toLocaleDateString('ar-EG')}</span>
              <span>إخراج احترافي بأيدي منصة المعلم الذكي 📚</span>
            </div>

            {/* Last Page Footer when "Print All Pages Footer" is disabled */}
            {!printAllPagesFooter && (
              <div className="hidden print:flex justify-center items-center font-sans mt-8 pt-4 border-t border-gray-200 w-full text-gray-600" style={{ fontSize: `${printFooterFontSize}pt` }}>
                <span>{printFooterText.replace('{teacherName}', activeSummary?.teacherName || 'حسن راشد العلي')}</span>
              </div>
            )}

            </div> {/* Close print:pt-4... */}
                  </td>
                </tr>
              </tbody>
            </table> {/* Close Content Pages Area Container */}
          </div> {/* Close print-area */}
        </div>
      ) : (
        // 🔵 SUMMARIES MAIN INDEX TABLE & CREATOR VIEW
        <div className="space-y-6 animate-fade-in no-print" dir="rtl">
          
          {/* Unified Page Header */}
          <UnifiedPageHeader
            icon={BookOpen}
            title="كراسات التبسيط المفهومي للطلاب"
            subtitle="ابتكار كراسات ذكية ملخصّة بدقة متناهية من مراجع PDF أو مستندات الدروس في مكتبتك لمواكبة الطالب خطوة بخطوة"
            badgeText={`${summaries?.length || 0} كراسة`}
            badgeColor="violet"
            actions={
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSourceDocId(null);
                    setGenerationModalOpen(true);
                  }}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={14} className="text-yellow-300 animate-pulse" />
                  <span>تأليف كراسة ذكية</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenEmptyBookletModal}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Notebook size={14} />
                  <span>كراس فارغ</span>
                </button>

                <label className="px-3.5 py-2 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer">
                  <Upload size={14} />
                  <span>استيراد JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJson}
                    className="hidden"
                  />
                </label>
              </>
            }
          />

          {/* List section */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-gray-800">كراسات التبسيط المتاحة في مكتبتك:</h2>
            </div>
            
            {!summaries || summaries.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-gray-100/80 shadow-sm space-y-4 font-sans">
                <BookOpen className="text-violet-300 mx-auto" size={48} />
                <div className="space-y-1">
                  <h3 className="font-black text-gray-750 text-base">لا توجد ملخصات حالياً في مكتبتك</h3>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto mb-4">
                    اضغط على الأزرار أعلاه لتوليد نوطة بالذكاء الاصطناعي أو بدء كراس فارغ لإضافة الدروس يدوياً.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleOpenEmptyBookletModal}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold rounded-xl text-xs border border-emerald-100 transition-all cursor-pointer"
                    >
                      <PlusCircle size={15} />
                      <span>إضافة كراس فارغ ➕</span>
                    </button>
                    <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 font-extrabold rounded-xl text-xs border border-violet-100 transition-all cursor-pointer">
                      <Upload size={15} />
                      <span>استيراد كراسة جاهزة (JSON) 📂</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportJson}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {summaries.map(sum => (
                  <div 
                    key={sum.id} 
                    className="bg-white rounded-2xl p-5 border border-gray-200 hover:border-violet-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div>
                      {/* Top Header Row */}
                      <div className="flex justify-between items-start gap-3 mb-3">
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-lg border bg-purple-50 text-purple-700 border-purple-100">
                          نوطة تبسيط الدروس
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingBookletDoc(sum);
                            }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="تعديل البيانات الأكاديمية للكراسة"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleExportBookletJson(sum, e)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="تصدير كملف JSON"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSummary(sum.id!);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف هذا الملخص بالكامل"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 
                        onClick={() => setActiveSummaryId(sum.id!)}
                        className="text-base font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-violet-700 transition-colors cursor-pointer mb-2.5"
                      >
                        {sum.title}
                      </h3>

                      {/* Academic Badges */}
                      <div className="space-y-2.5 mb-4">
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                            <Globe size={11} className="text-slate-500" />
                            <span>{sum.country || 'سوريا'}</span>
                          </span>
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1">
                            <GraduationCap size={11} className="text-indigo-500" />
                            <span>{sum.grade || 'مستوى عام'}</span>
                          </span>
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                            <BookOpen size={11} className="text-emerald-500" />
                            <span>{sum.subject || 'الرياضيات'}</span>
                          </span>
                        </div>

                        {(sum.part || sum.unit) && (
                          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-gray-600">
                            {sum.part && (
                              <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200/60 flex items-center gap-1">
                                <Layers size={10} className="text-amber-600" />
                                <span>{sum.part}</span>
                              </span>
                            )}
                            {sum.unit && (
                              <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200/60 flex items-center gap-1">
                                <BookMarked size={10} className="text-purple-600" />
                                <span>{sum.unit}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Row */}
                    <div className="pt-3.5 border-t border-gray-100 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-gray-400 font-medium">
                        {new Date(sum.updatedAt || sum.createdAt || Date.now()).toLocaleDateString('ar-EG')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveSummaryId(sum.id!)}
                        className="py-1.5 px-3 bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white font-extrabold rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer border border-violet-200 hover:border-transparent"
                      >
                        <Sparkles size={13} />
                        معاينة وتعديل النوطة
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🟣 MODAL: CHOOSE DOCUMENT FROM LIBRARY OR UPLOAD PDF TO SUMMARIZE */}
      {generationModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transition-all text-right" dir="rtl">
            
            <div className="bg-gradient-to-r from-violet-600 to-indigo-700 p-6 text-white flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-black">🤖 مخرّج نوّطات الدروس وكراسات التبسيط المنهجي</h3>
                <p className="text-xs text-violet-100 mt-1">توليد تلقائي فائق الذكاء مستشف تماماً من كراسة أو مرجع PDF</p>
              </div>
              <button 
                onClick={() => setGenerationModalOpen(false)} 
                disabled={generating}
                className="p-1.5 hover:bg-white/10 rounded-full text-white transition-colors disabled:opacity-30 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* TABS HEADER */}
            {!generating && (
              <div className="flex bg-gray-100 p-1.5 rounded-2xl mx-6 md:mx-8 mb-2">
                <button
                  type="button"
                  onClick={() => setGenerationTab('library')}
                  className={`flex-1 py-1.5 text-xs font-black rounded-xl transition-all ${
                    generationTab === 'library' 
                      ? 'bg-white text-violet-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  📂 الاختيار من المكتبة
                </button>
                <button
                  type="button"
                  onClick={() => setGenerationTab('upload')}
                  className={`flex-1 py-1.5 text-xs font-black rounded-xl transition-all ${
                    generationTab === 'upload' 
                      ? 'bg-white text-violet-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  📄 رفع مرجع PDF خارجي
                </button>
              </div>
            )}

            <div className="px-6 md:px-8 pb-6 md:pb-8 pt-2 space-y-4">
              
              {generating ? (
                // LOADING PROGRESS AND EDUCATIONAL QUOTES ANIMATIONS
                <div className="py-8 text-center space-y-5 animate-pulse">
                  <Loader2 className="animate-spin text-violet-600 mx-auto" size={48} />
                  <div className="space-y-2">
                    <p className="font-extrabold text-violet-850 text-base leading-relaxed">{generationProgress}</p>
                    <p className="text-xs text-violet-600/60 max-w-sm mx-auto">
                      "الرياضيات لا تعني جمع الأرقام المعقدة، إنما تعني تبسيط الفضاء وتصميم السبل الأيسر لاستيعاب الطالب مجهرياً" 🎓📖
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {generationTab === 'library' ? (
                    // TAB 1: SELECT SOURCE DOCUMENT MENU (FROM LIBRARY)
                    <div className="space-y-4">
                      <label className="block text-xs font-black text-gray-500">
                        الرجاء اختيار مستند الدرس أو المرجع من مكتبتك لتلخيصه وتبسيطه للطالب بأسلوب مبسط:
                      </label>
                      
                      <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-2xl divide-y">
                        {!allLibraryDocs || allLibraryDocs.length === 0 ? (
                          <div className="p-6 text-center text-gray-400 text-xs font-medium">
                            المكتبة خالية حالياً. اذهب لقسم المكتبة ورفع مستند PDF أو استخدم تبويب "رفع مرجع PDF خارجي" المباشر باليسار!
                          </div>
                        ) : (
                          allLibraryDocs.map(doc => (
                            <div 
                              key={doc.id}
                              onClick={() => setSelectedSourceDocId(doc.id!)}
                              className={`p-4 flex justify-between items-center cursor-pointer transition-all ${
                                selectedSourceDocId === doc.id ? 'bg-violet-50 font-black' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex flex-col gap-1 text-sm">
                                <span className="font-bold text-gray-800">{doc.title}</span>
                                <span className="text-[10px] text-gray-400">
                                  مستوى: {doc.grade} • مادة: {doc.subject} • نوع: {doc.type === 'pdf' ? 'مرجع PDF' : 'درس مهيكل'}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <input 
                                  type="radio" 
                                  name="source-selector" 
                                  checked={selectedSourceDocId === doc.id} 
                                  onChange={() => setSelectedSourceDocId(doc.id!)}
                                  className="w-4 h-4 text-violet-600"
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      <div className="flex gap-2.5 pt-4">
                        <button 
                          type="button"
                          onClick={() => setGenerationModalOpen(false)} 
                          className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-650 font-bold rounded-2xl text-xs"
                        >
                          إلغاء التراجع
                        </button>
                        <button 
                          type="button"
                          onClick={handleGenerateSummary}
                          disabled={!selectedSourceDocId}
                          className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-extrabold rounded-2xl text-xs shadow-md transition-all cursor-pointer"
                        >
                          توليد كراسة التبسيط الذكية 🧠🤖
                        </button>
                      </div>
                    </div>
                  ) : (
                    // TAB 2: DIRECT PDF UPLOAD & BOOKLET SYNCHRONOUS FLOW
                    <div className="space-y-3.5">
                      <AcademicMetadataFields
                        metadata={pdfMetadata}
                        onChange={(m) => setPdfMetadata(prev => ({ ...prev, ...m }))}
                      />

                      {/* File Selection Area */}
                      <div className="border-2 border-dashed border-gray-250 hover:border-violet-400 transition-colors p-6 rounded-2xl text-center bg-gray-50/50">
                        <input 
                          type="file" 
                          accept=".pdf" 
                          id="direct-pdf-uploader-input"
                          className="hidden" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              setDirectUploadFile(file);
                              if (!pdfMetadata.title) {
                                setPdfMetadata(p => ({ 
                                  ...p, 
                                  title: file.name.replace(/\.[^/.]+$/, "") 
                                }));
                              }
                            }
                          }}
                        />
                        <label htmlFor="direct-pdf-uploader-input" className="cursor-pointer space-y-2 block">
                          <Upload className="mx-auto text-violet-600 animate-bounce" size={32} />
                          <div className="text-xs">
                            {directUploadFile ? (
                              <span className="font-extrabold text-emerald-600 block bg-emerald-50 py-1.5 px-3 rounded-lg border border-emerald-200 animate-pulse">
                                ✔️ الملف المختار: {directUploadFile.name} ({Math.round(directUploadFile.size / 1024)} KB)
                              </span>
                            ) : (
                              <span className="text-gray-500 font-bold block">اضغط هنا لاستعراض ورفع ملف الـ PDF مفرداً 📄</span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 block font-medium">الحد الأقصى للمستند: 12MB. ستقوم المنصة بقراءة المنهج وتفريغه بدقة هائلة وترتيب مطابق لمرجعك.</span>
                        </label>
                      </div>

                      <div className="flex gap-2.5 pt-3">
                        <button 
                          type="button"
                          onClick={() => setGenerationModalOpen(false)} 
                          className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-650 font-bold rounded-2xl text-xs"
                        >
                          إلغاء
                        </button>
                        <button 
                          type="button"
                          onClick={handleDirectPdfUploadAndGenerate}
                          disabled={!directUploadFile || !pdfMetadata.title.trim()}
                          className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                        >
                          بدء صياغة كراسة المرجع 🚀✨
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 🟢 MODAL: CREATE EMPTY BOOKLET */}
      {emptyBookletModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden transition-all text-right max-h-[90vh] flex flex-col" dir="rtl">
            
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-black flex items-center gap-2">
                  <Notebook size={22} />
                  <span>إنشاء كراس تفاعلي فارغ جديد</span>
                </h3>
                <p className="text-xs text-emerald-100 mt-1">تجهيز كراس جديد وتعبئة بياناته الأساسية وتوليد الدروس يدوياً</p>
              </div>
              <button 
                onClick={() => setEmptyBookletModalOpen(false)} 
                className="p-1.5 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-4 overflow-y-auto font-sans text-xs sm:text-sm">
              <AcademicMetadataFields
                metadata={emptyBookletForm}
                onChange={(m) => setEmptyBookletForm(prev => ({ ...prev, ...m }))}
                showTopic={true}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-3 mt-3">
                {/* Series Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-750 font-black">اسم السلسلة:</label>
                  <input
                    type="text"
                    value={emptyBookletForm.seriesName}
                    onChange={(e) => setEmptyBookletForm(prev => ({ ...prev, seriesName: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none transition-all text-gray-800 text-xs"
                  />
                </div>

                {/* Teacher Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-750 font-black">اسم المدرس:</label>
                  <input
                    type="text"
                    value={emptyBookletForm.teacherName}
                    onChange={(e) => setEmptyBookletForm(prev => ({ ...prev, teacherName: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none transition-all text-gray-800 text-xs"
                  />
                </div>

                {/* Teacher Role */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-750 font-black">الصفة التعليمية للمدرس:</label>
                  <input
                    type="text"
                    value={emptyBookletForm.teacherRole}
                    onChange={(e) => setEmptyBookletForm(prev => ({ ...prev, teacherRole: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none transition-all text-gray-800 text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t shrink-0">
                <button
                  type="button"
                  onClick={() => setEmptyBookletModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold rounded-2xl text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  إلغاء ❌
                </button>
                <button
                  type="button"
                  onClick={handleCreateEmptyBooklet}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-xs sm:text-sm shadow-md transition-colors cursor-pointer"
                >
                  إنشاء الكراس الآن ✨📚
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 🟣 MODAL: SINGLE FIELD AI REGENERATION */}
      {fieldRegenModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transition-all text-right" dir="rtl">
            
            <div className="bg-gradient-to-r from-violet-600 to-indigo-700 p-5 text-white flex justify-between items-center bg-violet-700">
              <h3 className="font-black text-sm flex items-center gap-1.5">
                <Sparkles size={16} className="text-yellow-300 animate-pulse" />
                تحوير وصقل ذكي لحقل: {fieldRegenLabel}
              </h3>
              <button 
                onClick={() => setFieldRegenModalOpen(false)} 
                disabled={fieldRegenRunning}
                className="p-1 hover:bg-white/15 rounded-full text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {fieldRegenRunning ? (
                <div className="py-8 text-center space-y-4 animate-pulse">
                  <Loader2 className="animate-spin text-violet-600 mx-auto" size={36} />
                  <p className="text-xs font-black text-violet-800">جاري إعادة صياغة وهندسة القيمة بأعلى السبل المنهجية... 🧠🎨</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-xs font-black text-gray-500">
                    اكتب التوجيهات أو التغييرات التي تريد من المعلم الذكي الالتزام بها أثناء التحديث:
                  </label>
                  
                  <textarea 
                    className="w-full p-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-violet-500 text-xs leading-relaxed min-h-[100px]"
                    placeholder={fieldRegenKey === 'svgCode' ? `مثال: 
- ارسم دالة جيبية متذبذبة متناقصة باللون الأزرق.
- أضف محاور إحداثيات واضحة ومسماة X و Y بخط عريض.` : `مثال:
- بسط الصياغة تماماً ليفهمها طالب ضعيف علمياً.
- اذكر خطوات تفصيلية مرتبة مع شرح مغزى كل خطوة.`}
                    value={fieldRegenInstruction}
                    onChange={e => setFieldRegenInstruction(e.target.value)}
                  />

                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setFieldRegenModalOpen(false)} 
                      className="flex-1 py-1.5 border rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      إلغاء الإجراء
                    </button>
                    <button 
                      type="button"
                      onClick={executeSingleFieldRegen}
                      disabled={!fieldRegenInstruction.trim()}
                      className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 shadow-md transition-colors cursor-pointer"
                    >
                      صياغة وتوليد 🪄🤖
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 🟣 MODAL: CHOOSE DOCUMENT FROM LIBRARY TO SUMMARIZE */}
      {generationModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transition-all">
            
            <div className="bg-gradient-to-r from-violet-600 to-indigo-700 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black">🤖 كاشف ومنقح ملخصات المناهج بدقة</h3>
                <p className="text-xs text-violet-100 mt-1">توليد تلقائي فائق الذكاء مستشف تماماً من كراسات ومراجع مكتبتك</p>
              </div>
              <button 
                onClick={() => setGenerationModalOpen(false)} 
                disabled={generating}
                className="p-1.5 hover:bg-white/10 rounded-full text-white transition-colors disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              
              {generating ? (
                // LOADING PROGRESS AND EDUCATIONAL QUOTES ANIMATIONS
                <div className="py-8 text-center space-y-5 animate-pulse">
                  <Loader2 className="animate-spin text-violet-600 mx-auto" size={48} />
                  <div className="space-y-2">
                    <p className="font-extrabold text-violet-800 text-base">{generationProgress}</p>
                    <p className="text-xs text-gray-400 px-4">
                      "الرياضيات لا تعني جمع الأرقام المعقدة، إنما تعني تبسيط الفضاء وفهم السلوك الإنساني والعمراني من حولنا" 🎓📖
                    </p>
                  </div>
                </div>
              ) : (
                // SELECT SOURCE DOCUMENT MENU
                <div className="space-y-4">
                  <label className="block text-sm font-black text-gray-700">
                    الرجاء اختيار مستند الدرس أو المرجع من المكتبة لتلخيصه وتبسيطه للطالب:
                  </label>
                  
                  <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-2xl divide-y">
                    {!allLibraryDocs || allLibraryDocs.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm font-medium">
                        المكتبة خالية ومعدمة حالياً. الرجاء الذهاب لقسم المكتبة ورفع مستند PDF في المبتدأ لكي تتمكن من تلخيصه.
                      </div>
                    ) : (
                      allLibraryDocs.map(doc => (
                        <div 
                          key={doc.id}
                          onClick={() => setSelectedSourceDocId(doc.id!)}
                          className={`p-4 flex justify-between items-center cursor-pointer transition-all ${
                            selectedSourceDocId === doc.id ? 'bg-violet-50 font-black' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex flex-col gap-1 text-sm">
                            <span className="font-bold text-gray-800">{doc.title}</span>
                            <span className="text-[10px] text-gray-400">
                              مستوى: {doc.grade} • مادة: {doc.subject} • نوع: {doc.type === 'pdf' ? 'مرجع PDF' : 'درس مهيكل'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <input 
                              type="radio" 
                              name="source-selector" 
                              checked={selectedSourceDocId === doc.id} 
                              onChange={() => setSelectedSourceDocId(doc.id!)}
                              className="w-4 h-4 text-violet-600"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="flex gap-2.5 pt-4">
                    <button 
                      onClick={() => setGenerationModalOpen(false)} 
                      className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold rounded-2xl text-sm"
                    >
                      إلغاء التراجع
                    </button>
                    <button 
                      onClick={handleGenerateSummary}
                      disabled={!selectedSourceDocId}
                      className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-black rounded-2xl text-sm shadow-md transition-all"
                    >
                      توليد كراسة التبسيط الذكية 🧠🤖
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 🟣 MODAL: AI SPECIAL CONTEXTUAL SINGLE SECTION RE-CREATION */}
      {aiPromptModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-fade-in no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transition-all">
            
            <div className="bg-violet-700 p-5 text-white flex justify-between items-center">
              <h3 className="font-black text-base flex items-center gap-1.5">
                <Sparkles size={18} className="text-yellow-300 animate-spin" />
                تعديل وإعادة صياغة ذكية بالذكاء الاصطناعي
              </h3>
              <button 
                onClick={() => setAiPromptModalOpen(false)} 
                disabled={aiRegenerating}
                className="p-1 hover:bg-white/15 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {aiRegenerating ? (
                <div className="py-8 text-center space-y-4 animate-pulse">
                  <Loader2 className="animate-spin text-violet-600 mx-auto" size={36} />
                  <p className="text-sm font-bold text-gray-600">جاري مراجعة المعادلة، تبويب الرسم البياني والتنقيب صياغياً... 🧠✨</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-xs font-black text-gray-500">
                    اكتب التوجيهات أو التغييرات التي ترغب من الذكاء الاصطناعي تطبيقها على هذه الفقرة:
                  </label>
                  
                  <textarea 
                    className="w-full p-3 border rounded-2xl focus:ring-2 focus:ring-violet-500 text-xs leading-relaxed min-h-[120px]"
                    placeholder="امثلة:
- أعد صياغة الشرح بلغة سهلة جداً ومثلها للربط بالواقع الملموس.
- غير كود الرسم التوضيحي SVG ليكون منحنى متناقص ذو لون أحمر حاد ومحورين متعامدين ميزهما.
- غير أرقام التمرين التطبيقي وحله لتبنى على دالة الجيب f(x)=sin(x) بدلاً من اللوغاريتم."
                    value={aiInstruction}
                    onChange={e => setAiInstruction(e.target.value)}
                  />

                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAiPromptModalOpen(false)} 
                      className="flex-1 py-2.5 border rounded-xl text-xs font-bold text-gray-500"
                    >
                      إلغاء التراجع
                    </button>
                    <button 
                      onClick={executeAiSectionRegen}
                      disabled={!aiInstruction.trim()}
                      className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 shadow-md"
                    >
                      تأكيد الصياغة بالذكاء 🤖✨
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 🛠️ Manual Exercise Editor Modal */}
      {editingExModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden text-right" dir="rtl">
            
            {/* Modal Header */}
            <div className="bg-violet-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black font-sans flex items-center gap-2">
                <span>🛠️</span>
                تعديل التمرين يدوياً ورسم الـ SVG
              </h3>
              <button 
                onClick={() => setEditingExModal(null)}
                className="text-white hover:text-red-200 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
              
              {/* Right Side: Editor Fields */}
              <div className="space-y-4 overflow-y-auto pr-1">
                <h4 className="text-sm font-black text-gray-700 border-b pb-1">✍️ بيانات ومعطيات التمرين:</h4>
                
                {/* Title */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600">عنوان التمرين:</label>
                  <input 
                    type="text"
                    value={editingExModal.exercise.title}
                    onChange={e => setEditingExModal({
                      ...editingExModal,
                      exercise: { ...editingExModal.exercise, title: e.target.value }
                    })}
                    className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-sans font-medium"
                    placeholder="مثال: تمرين تدرّب #1"
                  />
                </div>

                {/* Question Text */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600">نص السؤال أو المسألة (يدعم LaTeX):</label>
                  <textarea 
                    rows={4}
                    value={editingExModal.exercise.questionText}
                    onChange={e => setEditingExModal({
                      ...editingExModal,
                      exercise: { ...editingExModal.exercise, questionText: e.target.value }
                    })}
                    className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-mono leading-relaxed"
                    placeholder="اكتب السؤال هنا..."
                  />
                </div>

                {/* Strategy Text */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600">فكرة واستراتيجية الحل السريعة (تظهر في صندوق المساعدة):</label>
                  <textarea 
                    rows={3}
                    value={editingExModal.exercise.strategyText}
                    onChange={e => setEditingExModal({
                      ...editingExModal,
                      exercise: { ...editingExModal.exercise, strategyText: e.target.value }
                    })}
                    className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-medium leading-relaxed"
                    placeholder="💡 فكرة الحل السريع..."
                  />
                </div>

                {/* Solution Text */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600">خطوات الحل التفصيلية والنموذجية (يدعم LaTeX والترقيم الدائري والترميز الملون):</label>
                  <textarea 
                    rows={6}
                    value={editingExModal.exercise.solutionText}
                    onChange={e => setEditingExModal({
                      ...editingExModal,
                      exercise: { ...editingExModal.exercise, solutionText: e.target.value }
                    })}
                    className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-mono leading-relaxed"
                    placeholder="اكتب خطوات الحل بالتفصيل..."
                  />
                </div>

                {/* SVG Code */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-600">كود الرسم SVG التوضيحي (اختياري، يبدأ بـ &lt;svg&gt;):</label>
                  <textarea 
                    rows={5}
                    value={editingExModal.exercise.svgCode || ''}
                    onChange={e => setEditingExModal({
                      ...editingExModal,
                      exercise: { ...editingExModal.exercise, svgCode: e.target.value }
                    })}
                    className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-mono leading-relaxed"
                    placeholder="<svg ...> ... </svg>"
                  />
                </div>
              </div>

              {/* Left Side: Real-time Live Preview */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 overflow-y-auto flex flex-col gap-4">
                <h4 className="text-sm font-black text-gray-700 border-b pb-1 flex items-center gap-1">
                  <span>👀</span>
                  معاينة مباشرة في الوقت الفعلي:
                </h4>

                {/* Title Preview */}
                <div>
                  <h5 className="text-sm font-extrabold text-violet-900 font-sans">
                    {editingExModal.exercise.title || 'العنوان فارغ'}
                  </h5>
                </div>

                {/* SVG Render Preview */}
                {editingExModal.exercise.svgCode && editingExModal.exercise.svgCode.trim() && (
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center">
                    {extractSvgs(editingExModal.exercise.svgCode).map((svgHtml, sIdx) => (
                      <div 
                        key={sIdx} 
                        className="w-full overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto flex justify-center"
                        dangerouslySetInnerHTML={{ __html: makeSvgResponsive(svgHtml) }} 
                      />
                    ))}
                  </div>
                )}

                {/* Question Preview */}
                <div className="p-4 bg-white rounded-xl border border-slate-200/80">
                  <span className="text-xs font-black text-gray-500 block mb-1">نص السؤال:</span>
                  {editingExModal.exercise.questionText ? (
                    <MathRenderer content={editingExModal.exercise.questionText} />
                  ) : (
                    <span className="text-xs text-gray-400 italic">اكتب نص السؤال لتظهر المعاينة هنا...</span>
                  )}
                </div>

                {/* Strategy Preview */}
                {editingExModal.exercise.strategyText && (
                  <div className="p-4 bg-yellow-50/80 rounded-xl border border-[#78350f] text-amber-950">
                    <span className="font-extrabold text-amber-900 text-xs block mb-1">💡 فكرة واستراتيجية الحل السريعة:</span>
                    <MathRenderer content={editingExModal.exercise.strategyText} />
                  </div>
                )}

                {/* Solution Preview */}
                <div className="p-4 bg-emerald-50/30 rounded-xl border border-emerald-100">
                  <span className="text-xs font-black text-emerald-800 block mb-1">🔑 الحل التفصيلي والنموذجي:</span>
                  {editingExModal.exercise.solutionText ? (
                    <MathRenderer content={editingExModal.exercise.solutionText} />
                  ) : (
                    <span className="text-xs text-gray-400 italic">اكتب خطوات الحل لتظهر المعاينة هنا...</span>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setEditingExModal(null)}
                className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-gray-700 text-sm font-bold rounded-xl transition-all cursor-pointer"
              >
                إلغاء وإغلاق
              </button>
              <button
                onClick={() => handleSaveManualExercise(
                  editingExModal.sectionId,
                  editingExModal.isPractical,
                  editingExModal.exercise
                )}
                className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-600/10 transition-all cursor-pointer"
              >
                حفظ التعديلات يدوياً
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 🧠 AI Solution Verification & Truncation Modal */}
      {verifyingExModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className={`bg-white rounded-2xl shadow-2xl w-full transition-all duration-300 flex flex-col overflow-hidden text-right ${verifyShorten ? 'max-w-6xl' : 'max-w-5xl'} max-h-[90vh]`} dir="rtl">
            
            {/* Modal Header */}
            <div className="bg-emerald-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black font-sans flex items-center gap-2">
                <span>🧠</span>
                التدقيق الرياضي والإملائي الذكي بالذكاء الاصطناعي
              </h3>
              <button 
                onClick={() => {
                  setVerifyingExModal(null);
                  setVerifyResult(null);
                  setAiFocusPrompt('');
                }}
                className="text-white hover:text-red-200 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 min-h-0">
              
              {/* Exercise Metadata Summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] font-black text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md mb-2 inline-block">
                  {verifyingExModal.exercise.title}
                </span>
                <h4 className="text-sm font-extrabold text-slate-800 font-sans mb-1">نص المسألة المطلوب مراجعتها:</h4>
                <div className="text-sm bg-white p-3 rounded-lg border border-slate-200/50">
                  <MathRenderer content={verifyingExModal.exercise.questionText} />
                </div>
              </div>

              {/* Settings Controls */}
              {!verifyResult && !isVerifyingAI && (
                <div className="bg-emerald-50/50 border border-emerald-100 p-5 rounded-2xl space-y-4 text-right">
                  <div className="text-center space-y-1">
                    <h4 className="text-sm font-black text-emerald-900 font-sans">⚙️ جاهز لبدء عملية التدقيق والتحقق الذكي بالذكاء الاصطناعي</h4>
                    <p className="text-xs text-slate-600 max-w-xl mx-auto leading-relaxed text-center">
                      سيقوم الذكاء الاصطناعي بفحص وتدقيق الخطوات الحسابية لغوياً ورياضياً، وإضافة الترميز الرياضي والتنسيق البصري المتكامل وفقاً لمنهاجك المعتمد.
                    </p>
                  </div>

                  {/* AI Focus Directions Input */}
                  <div className="bg-white border border-emerald-100 p-4 rounded-xl space-y-2 shadow-sm text-right">
                    <label className="block text-xs font-black text-emerald-950 flex items-center gap-1.5 justify-start">
                      <span>🎯 التركيز المخصص على التدقيق الذكي (توجيه المعلم):</span>
                      <span className="text-[10px] font-normal text-slate-500 font-sans">(اختياري - لتوجيه ذكاء الآلة نحو نقاط معينة)</span>
                    </label>
                    <textarea
                      value={aiFocusPrompt}
                      onChange={e => setAiFocusPrompt(e.target.value)}
                      placeholder="مثال: ركز على تبسيط المقامات، تأكد من شروط المبرهنة، أو أضف شرحاً إضافياً لخطوة تفريق الأشعة لتبدو أسهل للطالب..."
                      className="w-full h-20 p-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder-slate-400 font-sans"
                    />
                  </div>

                  <div className="pt-2 text-center">
                    <button
                      onClick={() => handleVerifyExerciseAI(verifyingExModal.exercise, aiFocusPrompt)}
                      className="w-full sm:w-auto px-10 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer text-sm"
                    >
                      <Sparkles size={16} />
                      ابدأ التدقيق والتحقق الذكي الآن
                    </button>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isVerifyingAI && (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-slate-800 font-sans">جاري فحص وتدقيق الحل بالذكاء الاصطناعي...</h4>
                    <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                      نقوم الآن بالتدقيق العلمي للخطوات الحسابية، فحص الصياغة الإملائية العربية، التأكد من استخدام المصطلحات الصحيحة ومواءمتها مع المنهاج السوري، وتطبيق التنسيق البصري الملون والرموز المتجهة.
                    </p>
                  </div>
                </div>
              )}

              {/* Verify Results Display */}
              {verifyResult && !isVerifyingAI && (
                <div className="space-y-5 flex-1 flex flex-col min-h-0">
                  
                  {/* Status & Review Notes */}
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3.5">
                    <span className="text-2xl shrink-0">📋</span>
                    <div className="space-y-1 flex-1">
                      <h4 className="text-xs font-black text-blue-900 font-sans flex items-center gap-1.5">
                        تقرير التدقيق والملاحظات اللغوية والرياضية:
                        <span className={`px-2 py-0.5 text-[9px] rounded-full font-black ${verifyResult.isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {verifyResult.isCorrect ? 'الحل سليم بالأساس' : 'تم العثور على ملاحظات وتعديلها'}
                        </span>
                      </h4>
                      <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-line font-medium">
                        {verifyResult.notes}
                      </p>
                    </div>
                  </div>

                  {/* Dynamic Settings Switch: Shorten Solution Details */}
                  <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 select-none text-right">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={verifyShorten}
                        onChange={e => {
                          const val = e.target.checked;
                          setVerifyShorten(val);
                          if (val) {
                            setChosenVersion('short');
                          } else {
                            setChosenVersion('full');
                          }
                        }}
                        className="mt-0.5 w-4.5 h-4.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-emerald-950 block">إمكانية حذف بعض تفاصيل الحل ومقارنة النسخ (اختياري - لتوفير المساحة والحبر عند الطباعة)</span>
                        <p className="text-[11px] text-emerald-800 leading-relaxed">
                          فعّل هذا الخيار لعرض ومقارنة <strong>الحل المختصر والموجز</strong> بجانب <strong>الحل الكامل والمفصل</strong> واختيار النسخة المفضلة لديك للاعتماد.
                        </p>
                      </div>
                    </label>
                    <div className="shrink-0 flex items-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-black shadow-sm ${verifyShorten ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                        {verifyShorten ? "✨ وضع المقارنة الثنائية نشط" : "معاينة: النسخة المفصلة"}
                      </span>
                    </div>
                  </div>

                  {/* Solutions Comparison View */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 overflow-hidden">
                    
                    {!verifyShorten ? (
                      <>
                        {/* Column 1: Original Solution */}
                        <div className="border border-slate-200 rounded-xl p-4 flex flex-col min-h-0 bg-slate-50/50 text-right">
                          <h5 className="text-xs font-black text-slate-600 border-b pb-1.5 mb-2.5 flex items-center justify-between">
                            <span>❌ النسخة الحالية (قبل التدقيق):</span>
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">الأصلية</span>
                          </h5>
                          <div className="flex-1 overflow-y-auto space-y-4">
                            <div>
                              <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">الاستراتيجية الأصلية:</span>
                              <div className="p-2.5 bg-white border rounded-lg text-xs">
                                <MathRenderer content={verifyingExModal.exercise.strategyText || 'لا توجد استراتيجية حالياً.'} />
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">الحل التفصيلي الأصلي:</span>
                              <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifyingExModal.exercise.solutionText || 'لا يوجد حل تفصيلي حالياً.'} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Optimized Solution (Full) */}
                        <div className="border-2 border-emerald-500 bg-emerald-50/10 rounded-xl p-4 flex flex-col min-h-0 text-right ring-2 ring-emerald-500/10">
                          <h5 className="text-xs font-black text-emerald-800 border-b border-emerald-100 pb-1.5 mb-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-1">✨ النسخة الكاملة والمفصلة (المدققة):</span>
                            <span className="text-[10px] bg-emerald-650 text-emerald-850 px-2.5 py-0.5 rounded-full font-bold">محددة للاعتماد تلقائياً</span>
                          </h5>
                          <div className="flex-1 overflow-y-auto space-y-4">
                            <div>
                              <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">الاستراتيجية المدققة:</span>
                              <div className="p-2.5 bg-white border border-emerald-100 rounded-lg text-xs">
                                <MathRenderer content={verifyResult.optimizedStrategy || 'لا توجد استراتيجية مدققة.'} />
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">خطوات الحل المفصل والمحسن بالكامل:</span>
                              <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifyResult.optimizedSolution} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Column 1: Optimized Full Solution (Side-by-side with short) */}
                        <div 
                          onClick={() => setChosenVersion('full')}
                          className={`border-2 rounded-xl p-4 flex flex-col min-h-0 text-right cursor-pointer transition-all ${
                            chosenVersion === 'full' 
                              ? 'border-emerald-500 bg-emerald-50/20 shadow-lg ring-2 ring-emerald-500/10 scale-[1.01]' 
                              : 'border-slate-200 bg-white hover:border-slate-300 opacity-85 hover:opacity-100'
                          }`}
                        >
                          <h5 className="text-xs font-black border-b pb-1.5 mb-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-bold">
                              {chosenVersion === 'full' ? '🟢' : '⚪'} النسخة الكاملة والمفصلة (المدققة)
                            </span>
                            {chosenVersion === 'full' ? (
                              <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-black">نشطة ومحددة للاعتماد</span>
                            ) : (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">اضغط للاختيار</span>
                            )}
                          </h5>
                          <div className="flex-1 overflow-y-auto space-y-4">
                            <div>
                              <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">الاستراتيجية المدققة:</span>
                              <div className="p-2.5 bg-white border border-slate-100 rounded-lg text-xs">
                                <MathRenderer content={verifyResult.optimizedStrategy || 'لا توجد استراتيجية مدققة.'} />
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">خطوات الحل التفصيلي والخطوات الكاملة:</span>
                              <div className="p-3 bg-white border border-slate-100 rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifyResult.optimizedSolution} />
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-center">
                            <div className={`w-full py-2 rounded-lg text-xs font-extrabold text-center transition-all ${
                              chosenVersion === 'full' 
                                ? 'bg-emerald-600 text-white shadow-sm' 
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}>
                              {chosenVersion === 'full' ? "✓ تم اختيار هذه النسخة" : "اختر النسخة الكاملة"}
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Optimized Shortened Solution */}
                        <div 
                          onClick={() => setChosenVersion('short')}
                          className={`border-2 rounded-xl p-4 flex flex-col min-h-0 text-right cursor-pointer transition-all ${
                            chosenVersion === 'short' 
                              ? 'border-amber-500 bg-amber-50/20 shadow-lg ring-2 ring-amber-500/10 scale-[1.01]' 
                              : 'border-slate-200 bg-white hover:border-slate-300 opacity-85 hover:opacity-100'
                          }`}
                        >
                          <h5 className="text-xs font-black border-b pb-1.5 mb-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-bold">
                              {chosenVersion === 'short' ? '🟡' : '⚪'} النسخة المختصرة والموجزة (بعد حذف الحشو)
                            </span>
                            {chosenVersion === 'short' ? (
                              <span className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded font-black">نشطة ومحددة للاعتماد</span>
                            ) : (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">اضغط للاختيار</span>
                            )}
                          </h5>
                          <div className="flex-1 overflow-y-auto space-y-4">
                            <div>
                              <span className="text-[10px] font-extrabold text-amber-600 block mb-0.5">استراتيجية الحل:</span>
                              <div className="p-2.5 bg-white border border-slate-100 rounded-lg text-xs">
                                <MathRenderer content={verifyResult.optimizedStrategy || 'لا توجد استراتيجية مدققة.'} />
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold text-amber-600 block mb-0.5">خطوات الحل المختصر بعد حذف التفاصيل:</span>
                              <div className="p-3 bg-white border border-slate-100 rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifyResult.optimizedSolutionShort} />
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-center">
                            <div className={`w-full py-2 rounded-lg text-xs font-extrabold text-center transition-all ${
                              chosenVersion === 'short' 
                                ? 'bg-amber-600 text-white shadow-sm' 
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}>
                              {chosenVersion === 'short' ? "✓ تم اختيار هذه النسخة" : "اختر النسخة المختصرة"}
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                  </div>

                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              {verifyResult ? (
                <button
                  onClick={() => handleVerifyExerciseAI(verifyingExModal.exercise)}
                  disabled={isVerifyingAI}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} className={isVerifyingAI ? 'animate-spin' : ''} />
                  أعد التدقيق وتحديث الحلول
                </button>
              ) : (
                <div />
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setVerifyingExModal(null);
                    setVerifyResult(null);
                  }}
                  className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-gray-700 text-sm font-bold rounded-xl transition-all cursor-pointer"
                >
                  إغلاق وإلغاء
                </button>
                {verifyResult && (
                  <button
                    onClick={() => handleAcceptVerifiedSolution(
                      verifyingExModal.sectionId,
                      verifyingExModal.isPractical,
                      verifyingExModal.exercise.id,
                      chosenVersion === 'short' ? verifyResult.optimizedSolutionShort : verifyResult.optimizedSolution,
                      verifyResult.optimizedStrategy
                    )}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/10 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    {chosenVersion === 'short' ? "اعتماد واستبدال الحل بالنسخة المختصرة" : "اعتماد واستبدال الحل بالنسخة الكاملة"}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 🧠 AI Lesson Section Verification & Formatting Modal */}
      {verifyingSecModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] transition-all duration-300 flex flex-col overflow-hidden text-right" dir="rtl">
            
            {/* Modal Header */}
            <div className="bg-emerald-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black font-sans flex items-center gap-2">
                <span>🧠</span>
                {verifyingSecModal.targetField && verifyingSecModal.fieldName 
                  ? `التدقيق العلمي واللغوي والتنسيق لـ (${verifyingSecModal.fieldName})` 
                  : 'التدقيق العلمي واللغوي والتنسيق الاحترافي لفقرة الشرح'}
              </h3>
              <button 
                onClick={() => {
                  setVerifyingSecModal(null);
                  setVerifySecResult(null);
                  setSecAiFocusPrompt('');
                }}
                className="text-white hover:text-red-200 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 min-h-0">
              
              {/* Section Metadata Summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-[10px] font-black text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md mb-2 inline-block">
                  {verifyingSecModal.section.title || 'فقرة الشرح والمفاهيم'}
                </span>
                <h4 className="text-sm font-extrabold text-slate-800 font-sans mb-1">
                  {verifyingSecModal.fieldName ? `المحتوى الحالي لـ (${verifyingSecModal.fieldName}):` : 'المحتوى الحالي للفقرة المراد تدقيقها وتنقيحها:'}
                </h4>
                <div className="text-sm bg-white p-3 rounded-lg border border-slate-200/50 max-h-36 overflow-y-auto">
                  <MathRenderer content={
                    verifyingSecModal.targetField === 'content' ? (verifyingSecModal.section.content || 'لا يوجد نص.') :
                    verifyingSecModal.targetField === 'guidance' ? (verifyingSecModal.section.guidance || 'لا يوجد نص.') :
                    verifyingSecModal.targetField === 'notes' ? (verifyingSecModal.section.notes || 'لا يوجد نص.') :
                    verifyingSecModal.targetField === 'traps' ? (verifyingSecModal.section.traps || 'لا يوجد نص.') :
                    verifyingSecModal.targetField === 'examGuidance' ? (verifyingSecModal.section.examGuidance || 'لا يوجد نص.') :
                    verifyingSecModal.targetField === 'exampleText' ? (verifyingSecModal.section.exampleText || 'لا يوجد نص.') :
                    verifyingSecModal.targetField === 'extraExampleText' ? (verifyingSecModal.section.extraExampleText || 'لا يوجد نص.') :
                    (verifyingSecModal.section.content || 'لا يوجد نص حالي.')
                  } />
                </div>
              </div>

              {/* Settings Controls */}
              {!verifySecResult && !isVerifyingSecAI && (
                <div className="bg-emerald-50/50 border border-emerald-100 p-5 rounded-2xl space-y-4 text-right">
                  <div className="text-center space-y-1">
                    <h4 className="text-sm font-black text-emerald-900 font-sans">⚙️ جاهز لبدء التدقيق العلمي واللغوي والتنسيق الاحترافي الذكي</h4>
                    <p className="text-xs text-slate-600 max-w-xl mx-auto leading-relaxed text-center">
                      سيقوم الذكاء الاصطناعي بمراجعة فقرة الشرح علمياً، وتصحيح الصياغات الإملائية واللغوية، إضافة التنسيق البصري الجذاب والرموز الملونة ومحددات LaTeX مع الحفاظ الكامل على الدقة المنهجية.
                    </p>
                  </div>

                  {/* AI Focus Directions Input */}
                  <div className="bg-white border border-emerald-100 p-4 rounded-xl space-y-2 shadow-sm text-right">
                    <label className="block text-xs font-black text-emerald-950 flex items-center gap-1.5 justify-start">
                      <span>🎯 التركيز المخصص على التدقيق الذكي (توجيه المعلم):</span>
                      <span className="text-[10px] font-normal text-slate-500 font-sans">(اختياري - لتوجيه الذكاء نحو نقاط محددة)</span>
                    </label>
                    <textarea
                      value={secAiFocusPrompt}
                      onChange={e => setSecAiFocusPrompt(e.target.value)}
                      placeholder="مثال: ركز على توضيح شرط الاستمرار، أو أضف تأكيداً لغوياً على الفرق بين التابع المستمر والتابع المالي..."
                      className="w-full h-20 p-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder-slate-400 font-sans"
                    />
                  </div>

                  <div className="pt-2 text-center">
                    <button
                      onClick={() => handleVerifySectionAI(verifyingSecModal.section, secAiFocusPrompt)}
                      className="w-full sm:w-auto px-10 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer text-sm"
                    >
                      <Sparkles size={16} />
                      ابدأ التدقيق والتنقيح والتنسيق الذكي الآن
                    </button>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isVerifyingSecAI && (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-slate-800 font-sans">جاري التدقيق العلمي واللغوي والتنسيق الاحترافي للفقرة...</h4>
                    <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                      نقوم الآن بالتدقيق العلمي لفقرة الشرح، فحص التنسيق والإملاء العربي، تطبيق رموز LaTeX والترميز الملون وتأكيد المصطلحات المنهجية السورية.
                    </p>
                  </div>
                </div>
              )}

              {/* Verify Results Display */}
              {verifySecResult && !isVerifyingSecAI && (
                <div className="space-y-5 flex-1 flex flex-col min-h-0">
                  
                  {/* Status & Review Notes */}
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3.5">
                    <span className="text-2xl shrink-0">📋</span>
                    <div className="space-y-1 flex-1">
                      <h4 className="text-xs font-black text-blue-900 font-sans flex items-center gap-1.5">
                        تقرير التدقيق والملاحظات اللغوية والعلمية:
                        <span className={`px-2 py-0.5 text-[9px] rounded-full font-black ${verifySecResult.isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {verifySecResult.isCorrect ? 'الفقرة سليمة بالأساس وتم تحسين تنسيقها' : 'تم العثور على ملاحظات وتصحيحها'}
                        </span>
                      </h4>
                      <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-line font-medium">
                        {verifySecResult.notes}
                      </p>
                    </div>
                  </div>

                  {/* Section Comparison View */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 overflow-hidden">
                    
                    {/* Column 1: Original Section */}
                    <div className="border border-slate-200 rounded-xl p-4 flex flex-col min-h-0 bg-slate-50/50 text-right">
                      <h5 className="text-xs font-black text-slate-600 border-b pb-1.5 mb-2.5 flex items-center justify-between">
                        <span>❌ النص الحالي (قبل التدقيق والتحسين):</span>
                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">الأصلية</span>
                      </h5>
                      <div className="flex-1 overflow-y-auto space-y-4">
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">عنوان الفقرة:</span>
                          <div className="p-2 bg-white border rounded text-xs font-bold">
                            {verifyingSecModal.section.title || 'بدون عنوان'}
                          </div>
                        </div>

                        {(!verifyingSecModal.targetField || verifyingSecModal.targetField === 'all' || verifyingSecModal.targetField === 'content') && (
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">فقرة شرح المفهوم:</span>
                            <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifyingSecModal.section.content || 'لا يوجد محتوى.'} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'guidance' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">💡 إرشادات وتوجيهات ذهبية:</span>
                            <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifyingSecModal.section.guidance || 'لا يوجد نص.'} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'notes' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">🏆 ملاحظات وقواعد هامة:</span>
                            <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifyingSecModal.section.notes || 'لا يوجد نص.'} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'traps' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">⚠️ مطبات وأخطاء امتحانية:</span>
                            <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifyingSecModal.section.traps || 'لا يوجد نص.'} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'examGuidance' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">🎯 طريقة ورود الفكرة في الامتحان:</span>
                            <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifyingSecModal.section.examGuidance || 'لا يوجد نص.'} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'exampleText' && (
                          <div className="space-y-3">
                            <div>
                              <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">📌 نص التمرين من الكتاب:</span>
                              <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifyingSecModal.section.exampleText || 'لا يوجد نص تمرين.'} />
                              </div>
                            </div>
                            {verifyingSecModal.section.solutionText && (
                              <div>
                                <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">🔑 الحل النموذجى الحالي:</span>
                                <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                                  <MathRenderer content={verifyingSecModal.section.solutionText} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'extraExampleText' && (
                          <div className="space-y-3">
                            <div>
                              <span className="text-[10px] font-extrabold text-slate-400 block mb-0.5">✨ التمرين الإضافي ذو الصياغة الذكية:</span>
                              <div className="p-3 bg-white border rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifyingSecModal.section.extraExampleText || 'لا يوجد نص تمرين إضافي.'} />
                              </div>
                            </div>
                            {verifyingSecModal.section.extraSolutionText && (
                              <div>
                                <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">🔑 حل التمرين الإضافي الحالي:</span>
                                <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                                  <MathRenderer content={verifyingSecModal.section.extraSolutionText} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Optimized Section */}
                    <div className="border-2 border-emerald-500 bg-emerald-50/10 rounded-xl p-4 flex flex-col min-h-0 text-right ring-2 ring-emerald-500/10">
                      <h5 className="text-xs font-black text-emerald-800 border-b border-emerald-100 pb-1.5 mb-2.5 flex items-center justify-between">
                        <span className="flex items-center gap-1">✨ النص المعدل والمدقق المنسق (النتيجة الذكية):</span>
                        <span className="text-[10px] bg-emerald-600 text-white px-2.5 py-0.5 rounded-full font-bold">جاهزة للاعتماد</span>
                      </h5>
                      <div className="flex-1 overflow-y-auto space-y-4">
                        <div>
                          <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">العنوان المدقق:</span>
                          <div className="p-2 bg-white border border-emerald-100 rounded text-xs font-bold text-emerald-900">
                            {verifySecResult.optimizedTitle}
                          </div>
                        </div>

                        {(!verifyingSecModal.targetField || verifyingSecModal.targetField === 'all' || verifyingSecModal.targetField === 'content') && (
                          <div>
                            <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">فقرة الشرح المنسقة والمدققة:</span>
                            <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifySecResult.optimizedContent} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'guidance' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">💡 الإرشادات والتوجيهات المدققة:</span>
                            <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifySecResult.optimizedGuidance || verifySecResult.optimizedContent} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'notes' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">🏆 الملاحظات والقواعد المدققة:</span>
                            <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifySecResult.optimizedNotes || verifySecResult.optimizedContent} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'traps' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">⚠️ المطبات والأخطاء الامتحانية المدققة:</span>
                            <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifySecResult.optimizedTraps || verifySecResult.optimizedContent} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'examGuidance' && (
                          <div>
                            <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">🎯 منهجية الامتحان المدققة:</span>
                            <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                              <MathRenderer content={verifySecResult.optimizedExamGuidance || verifySecResult.optimizedContent} />
                            </div>
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'exampleText' && (
                          <div className="space-y-3">
                            <div>
                              <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">📌 نص التمرين المدقق والمنسق:</span>
                              <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifySecResult.optimizedExampleText || verifySecResult.optimizedContent} />
                              </div>
                            </div>
                            {verifySecResult.optimizedSolutionText && (
                              <div>
                                <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">🔑 الحل النموذجي المدقق والمنسق:</span>
                                <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                                  <MathRenderer content={verifySecResult.optimizedSolutionText} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {verifyingSecModal.targetField === 'extraExampleText' && (
                          <div className="space-y-3">
                            <div>
                              <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">✨ التمرين الإضافي المدقق والمنسق:</span>
                              <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                                <MathRenderer content={verifySecResult.optimizedExtraExampleText || verifySecResult.optimizedContent} />
                              </div>
                            </div>
                            {verifySecResult.optimizedExtraSolutionText && (
                              <div>
                                <span className="text-[10px] font-extrabold text-emerald-600 block mb-0.5">🔑 حل التمرين الإضافي المدقق والمنسق:</span>
                                <div className="p-3 bg-white border border-emerald-100 rounded-lg text-xs whitespace-pre-line">
                                  <MathRenderer content={verifySecResult.optimizedExtraSolutionText} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              {verifySecResult ? (
                <button
                  onClick={() => handleVerifySectionAI(verifyingSecModal.section, secAiFocusPrompt)}
                  disabled={isVerifyingSecAI}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} className={isVerifyingSecAI ? 'animate-spin' : ''} />
                  أعد التدقيق وتحديث النتيجة
                </button>
              ) : (
                <div />
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setVerifyingSecModal(null);
                    setVerifySecResult(null);
                    setSecAiFocusPrompt('');
                  }}
                  className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-gray-700 text-sm font-bold rounded-xl transition-all cursor-pointer"
                >
                  إغلاق وإلغاء
                </button>
                {verifySecResult && (
                  <button
                    onClick={() => {
                      if (verifyingSecModal.targetField && verifyingSecModal.targetField !== 'all') {
                        const field = verifyingSecModal.targetField;
                        let updatedVal = verifySecResult.optimizedContent;
                        let secFieldKey: string | undefined = undefined;
                        let secFieldVal: string | undefined = undefined;

                        if (field === 'guidance') updatedVal = verifySecResult.optimizedGuidance;
                        else if (field === 'notes') updatedVal = verifySecResult.optimizedNotes;
                        else if (field === 'traps') updatedVal = verifySecResult.optimizedTraps;
                        else if (field === 'examGuidance') updatedVal = verifySecResult.optimizedExamGuidance;
                        else if (field === 'exampleText') {
                          updatedVal = verifySecResult.optimizedExampleText || verifySecResult.optimizedContent;
                          if (verifySecResult.optimizedSolutionText) {
                            secFieldKey = 'solutionText';
                            secFieldVal = verifySecResult.optimizedSolutionText;
                          }
                        } else if (field === 'extraExampleText') {
                          updatedVal = verifySecResult.optimizedExtraExampleText || verifySecResult.optimizedContent;
                          if (verifySecResult.optimizedExtraSolutionText) {
                            secFieldKey = 'extraSolutionText';
                            secFieldVal = verifySecResult.optimizedExtraSolutionText;
                          }
                        }

                        handleSaveSubBlockEditDirect(verifyingSecModal.section.id!, field, updatedVal, secFieldKey, secFieldVal);
                        setVerifyingSecModal(null);
                        setVerifySecResult(null);
                      } else {
                        handleAcceptVerifiedSection(
                          verifyingSecModal.section.id!,
                          verifySecResult.optimizedTitle,
                          verifySecResult.optimizedContent,
                          verifySecResult.optimizedGuidance,
                          verifySecResult.optimizedNotes,
                          verifySecResult.optimizedTraps,
                          verifySecResult.optimizedExamGuidance,
                          verifySecResult.optimizedExampleText,
                          verifySecResult.optimizedSolutionText,
                          verifySecResult.optimizedExtraExampleText,
                          verifySecResult.optimizedExtraSolutionText
                        );
                      }
                    }}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/10 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    اعتماد واستبدال بالنسخة المدققة
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 📝 GRANULAR SUB-BLOCK MANUAL EDIT MODAL (Side-by-side split screen) */}
      {editingSubBlockModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-right" dir="rtl">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-violet-700 to-indigo-700 px-6 py-4 text-white flex justify-between items-center shrink-0 shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-black text-lg">
                  ✏️
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-black font-sans">
                    تعديل يدوي فرعي لـ: ({editingSubBlockModal.fieldName})
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-violet-200 font-bold shrink-0">عنوان الدرس:</span>
                    <input
                      type="text"
                      value={editingSubBlockModal.sectionTitle || ''}
                      onChange={(e) => setEditingSubBlockModal(prev => prev ? { ...prev, sectionTitle: e.target.value } : null)}
                      className="px-2.5 py-0.5 text-xs bg-white/10 hover:bg-white/20 focus:bg-white text-white focus:text-slate-900 border border-white/25 rounded-lg outline-none transition-all font-bold"
                      placeholder="عنوان الدرس..."
                    />
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setEditingSubBlockModal(null)}
                className="text-white/80 hover:text-white hover:bg-white/15 p-2 rounded-xl transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Symbols Toolbar & AI Rephrase Bar */}
            <div className="bg-slate-50 border-b border-slate-200 p-3 shrink-0 flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full">
                <span className="text-[11px] font-black text-slate-600 shrink-0 ml-1">إدراج رموز رياضية:</span>
                {['√', '∫', 'lim', 'α', 'β', 'π', 'θ', 'Δ', '≠', '≤', '≥', '±', 'x²', 'x/y', '∞'].map((sym, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => insertSymbolToSubBlock(sym)}
                    className="px-2 py-1 bg-white hover:bg-violet-50 hover:text-violet-700 text-slate-700 text-xs font-bold border border-slate-200 rounded-lg shadow-2xs transition-all cursor-pointer shrink-0 font-mono"
                  >
                    {sym}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSubBlockAiRephrase}
                disabled={isSubBlockAiRephrasing}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Sparkles size={13} className={isSubBlockAiRephrasing ? 'animate-spin' : ''} />
                {isSubBlockAiRephrasing ? 'جاري التحسين بالذكاء الاصطناعي...' : 'صياغة ذكية بالـ AI'}
              </button>
            </div>

            {/* Split Screen Body: Right = Text Editor, Left = Live Math & Formatted Preview */}
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-5 min-h-0 bg-slate-100/50">
              
              {/* RIGHT COLUMN: Text Area Editor (التحرير على اليمين) */}
              <div className="flex flex-col gap-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-h-[300px]">
                <div className="flex flex-col flex-1">
                  <label className="text-xs font-black text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>📝 {editingSubBlockModal.secondaryFieldKey ? (editingSubBlockModal.fieldName || 'نص التمرين (اليمين)') : 'التحرير اليدوي لكتابة وصياغة النص والمعادلات (اليمين)'}:</span>
                    <span className="text-[10px] text-violet-600 font-bold">يدعم معادلات LaTeX وصيغ الرياضيات</span>
                  </label>
                  <textarea
                    value={editingSubBlockModal.fieldValue}
                    onChange={(e) => setEditingSubBlockModal(prev => prev ? { ...prev, fieldValue: e.target.value } : null)}
                    placeholder="اكتب هنا النص المعدل، يمكنك إضافة معادلات LaTeX أو فقرات مفسرة..."
                    className="w-full flex-1 min-h-[160px] p-3 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all font-sans leading-relaxed resize-none bg-slate-50/50"
                    dir="rtl"
                  />
                </div>

                {editingSubBlockModal.secondaryFieldKey && (
                  <div className="flex flex-col flex-1 border-t border-slate-200 pt-3">
                    <label className="text-xs font-black text-emerald-800 mb-1.5 flex items-center justify-between">
                      <span>✅ {editingSubBlockModal.secondaryFieldName || 'الحل النموذجي (اليمين)'}:</span>
                      <span className="text-[10px] text-emerald-600 font-bold">تعديل خطوات الحل</span>
                    </label>
                    <textarea
                      value={editingSubBlockModal.secondaryFieldValue || ''}
                      onChange={(e) => setEditingSubBlockModal(prev => prev ? { ...prev, secondaryFieldValue: e.target.value } : null)}
                      placeholder="اكتب هنا خطوات الحل النموذجي والتفصيلي..."
                      className="w-full flex-1 min-h-[140px] p-3 text-xs sm:text-sm border border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all font-sans leading-relaxed resize-none bg-emerald-50/30"
                      dir="rtl"
                    />
                  </div>
                )}
              </div>

              {/* LEFT COLUMN: Live Render Preview (المعاينة والمظهر المعدل على اليسار) */}
              <div className="flex flex-col bg-white rounded-xl border-2 border-violet-200 p-4 shadow-sm min-h-[300px]">
                <div className="text-xs font-black text-violet-800 border-b border-violet-100 pb-2 mb-3 flex items-center justify-between">
                  <span>👁️ المعاينة الحية وشكل الفقرة النهائي (اليسار):</span>
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-md font-bold">تحديث فوري</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 text-right font-sans text-xs sm:text-sm leading-relaxed space-y-4">
                  <div>
                    <h6 className="text-xs font-black text-violet-900 mb-1">
                      📌 {editingSubBlockModal.fieldName || 'نص الفقرة/التمرين'}:
                    </h6>
                    {editingSubBlockModal.fieldValue && editingSubBlockModal.fieldValue.trim() !== '' ? (
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <MathRenderer content={editingSubBlockModal.fieldValue} />
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">سوف يظهر المظهر والتنسيق المباشر هنا بمجرد الكتابة...</span>
                    )}
                  </div>

                  {editingSubBlockModal.secondaryFieldKey && (
                    <div className="border-t border-slate-200 pt-3">
                      <h6 className="text-xs font-black text-emerald-800 mb-1">
                        ✅ {editingSubBlockModal.secondaryFieldName || 'الحل النموذجي'}:
                      </h6>
                      {editingSubBlockModal.secondaryFieldValue && editingSubBlockModal.secondaryFieldValue.trim() !== '' ? (
                        <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
                          <MathRenderer content={editingSubBlockModal.secondaryFieldValue} />
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">سوف يظهر الحل النموذجي هنا...</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              <button
                type="button"
                onClick={() => setEditingSubBlockModal(null)}
                className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-gray-700 font-bold rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
              >
                إلغاء ❌
              </button>
              <button
                type="button"
                onClick={handleSaveSubBlockEdit}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-extrabold rounded-xl text-xs sm:text-sm shadow-lg shadow-violet-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save size={15} />
                حفظ التعديل الفرعي المعتمد 💾
              </button>
            </div>

          </div>
        </div>
      )}

      {/* General Alert Center */}
      <CustomDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onConfirm={dialogConfig.onConfirm}
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Book Printing & Live Preview Stylesheet */}
      <style>{`
        @font-face {
          font-family: 'Al-Mithaq';
          src: local('Al-Mithaq'), local('Al Mithaq'), local('Mithaq'), local('Mithaq Regular'), local('Al-Mithaq Regular'), local('Al_Mithaq');
        }

        /* 1. Font Family Customization for body text in Screen Preview and Print */
        #print-area, 
        #print-area *:not(h2):not(h2 *):not(h3):not(h3 *):not(h4):not(h4 *):not(.print-heading):not(.print-heading *):not(.katex):not(.katex *) {
          font-family: ${
            printFont === 'default' ? "'Cairo', sans-serif" :
            printFont === 'cairo' ? "'Cairo', sans-serif" :
            printFont === 'amiri' ? "'Amiri', serif" :
            printFont === 'tajawal' ? "'Tajawal', sans-serif" :
            printFont === 'almarai' ? "'Almarai', sans-serif" :
            printFont === 'al-mithaq' ? "'Al-Mithaq', 'Cairo', sans-serif" :
            printFont === 'scheherazade' ? "'Scheherazade New', serif" :
            printFont === 'aref' ? "'Aref Ruqaa', serif" :
            printFont === 'notonaskh' ? "'Noto Naskh Arabic', serif" :
            printFont === 'reemkufi' ? "'Reem Kufi', sans-serif" :
            "'Cairo', sans-serif"
          } !important;
        }

        /* 2. Headings Font Family Customization (Excluding cover page elements as requested) */
        #print-area h2:not(.print-cover-page *), 
        #print-area h2:not(.print-cover-page *) *, 
        #print-area h3:not(.print-cover-page *),
        #print-area h3:not(.print-cover-page *) *,
        #print-area h4:not(.print-cover-page *),
        #print-area h4:not(.print-cover-page *) *,
        #print-area .print-heading,
        #print-area .print-heading *:not(.katex):not(.katex *) {
          font-family: ${
            printHeadingFont === 'default' ? (
              printFont === 'default' ? "'Cairo', sans-serif" :
              printFont === 'cairo' ? "'Cairo', sans-serif" :
              printFont === 'amiri' ? "'Amiri', serif" :
              printFont === 'tajawal' ? "'Tajawal', sans-serif" :
              printFont === 'almarai' ? "'Almarai', sans-serif" :
              printFont === 'al-mithaq' ? "'Al-Mithaq', 'Cairo', sans-serif" :
              printFont === 'scheherazade' ? "'Scheherazade New', serif" :
              printFont === 'aref' ? "'Aref Ruqaa', serif" :
              printFont === 'notonaskh' ? "'Noto Naskh Arabic', serif" :
              printFont === 'reemkufi' ? "'Reem Kufi', sans-serif" :
              "'Cairo', sans-serif"
            ) :
            printHeadingFont === 'cairo' ? "'Cairo', sans-serif" :
            printHeadingFont === 'amiri' ? "'Amiri', serif" :
            printHeadingFont === 'tajawal' ? "'Tajawal', sans-serif" :
            printHeadingFont === 'almarai' ? "'Almarai', sans-serif" :
            printHeadingFont === 'al-mithaq' ? "'Al-Mithaq', 'Cairo', sans-serif" :
            printHeadingFont === 'scheherazade' ? "'Scheherazade New', serif" :
            printHeadingFont === 'aref' ? "'Aref Ruqaa', serif" :
            printHeadingFont === 'notonaskh' ? "'Noto Naskh Arabic', serif" :
            printHeadingFont === 'reemkufi' ? "'Reem Kufi', sans-serif" :
            "'Cairo', sans-serif"
          } !important;
        }

        /* 3. Font Size and Line Height for explanation text */
        #print-area .prose, 
        #print-area .prose p, 
        #print-area .prose li,
        #print-area .math-renderer,
        #print-area .math-renderer p,
        #print-area .math-renderer span:not(.katex *),
        #print-area p:not(.print-cover-page *):not(.print-page-footer *):not(h2):not(h2 *):not(h3):not(h3 *),
        #print-area li:not(.print-cover-page *),
        #print-area td,
        #print-area th {
          font-size: ${printFontSize}pt !important;
          line-height: 1.85 !important;
        }

        /* 4. Heading Font Size for lesson titles (Excludes cover page titles) */
        #print-area h2:not(.print-cover-page *), 
        #print-area h2:not(.print-cover-page *) * {
          font-size: ${printHeadingFontSize}pt !important;
        }

        /* 5. Watermark Configuration has been moved inside lesson cards to prevent cover page rendering and overlapping issues */

        /* 6. Cover Page dimensions - customized precisely to A4 paper height to fit 252mm */
        .print-cover-page {
          page-break-after: always !important;
          break-after: page !important;
          margin: 0 !important;
          height: 252mm !important; /* Sized perfectly inside A4 content height when bottom margin is 30mm */
          min-height: 252mm !important;
          width: 100% !important; /* Match content width perfectly for 100% symmetric margins */
          box-sizing: border-box !important;
          padding: 3rem !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          position: relative !important;
          z-index: 10000 !important; /* Above watermark (9999) */
          background-color: white !important; /* Opaque white background */
          overflow: visible !important; /* Allow cover mask to extend into bottom margin */
          border: 2px solid #e5e7eb !important; /* Elegant single border around cover page */
          border-radius: 12px !important;
          counter-reset: page 0; /* Reset page counter on cover page */
          ${getCoverPrintCss()}
        }

        /* Ensure SVGs inside normal text (math-renderer) have their container and drawing size controlled by their code attributes */
        .math-markdown-content div[style*="width"] {
          max-width: none !important;
          max-height: none !important;
        }
        .math-markdown-content div[style*="width"] svg {
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
        }

        @media print {
          @page {
            size: A4;
            margin-top: 15mm;
            margin-bottom: 15mm;
            margin-left: 15mm;
            margin-right: 15mm;
            ${printAllPagesFooter ? `
            @bottom-left {
              content: "الصفحة " counter(page);
              font-family: ${printFont === 'default' ? "'Cairo', sans-serif" : "inherit"};
              font-size: ${printFooterFontSize}pt;
              font-weight: bold;
              color: #4b5563;
              direction: rtl;
            }
            @bottom-right {
              content: "${printFooterText.replace('{teacherName}', activeSummary?.teacherName || 'حسن راشد العلي')}";
              font-family: ${printFont === 'default' ? "'Cairo', sans-serif" : "inherit"};
              font-size: ${printFooterFontSize}pt;
              font-weight: ${printFooterIsBold ? 'bold' : 'normal'};
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
          
          /* Full horizontal width and zero-margin resets on all outer page structure containers to prevent shifting/cutting off */
          html, body, main, #root, #root > div, #print-area, #dashboard-main-container, #active-summary-wrapper {
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

          /* General resets for Tailwind layout constraint classes */
          [class*="max-w-"], .min-h-screen {
            max-width: none !important;
            min-height: 0 !important;
            height: auto !important;
          }
          
          /* Ensure all content div trees have visible overflow to prevent page break clipping/failures */
          #print-area,
          #print-area div,
          .page-break-avoid {
            overflow: visible !important;
          }

          body {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            counter-reset: page;
          }
          .no-print {
            display: none !important;
          }
          #print-area {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            position: static !important;
          }
          
          /* Force transforms/transitions off on structural wrappers during printing, excluding KaTeX and the global watermark */
          body, main, div:not(.katex):not(.katex *):not(.math-renderer *):not(.latex *):not(.print-global-watermark) {
            transform: none !important;
            transition: none !important;
            perspective: none !important;
            animation: none !important;
          }
          
          /* Force all responsive grids to stack vertically in a single column on print to prevent horizontal width overflows and text cutoffs */
          #print-area .grid, 
          #print-area [class*="grid-cols-"],
          #print-area .sub-boxes-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            display: grid !important;
            gap: 1.5rem !important;
            width: 100% !important;
          }

          /* Hide screen-only watermarks during printing */
          .screen-only-watermark {
            display: none !important;
          }

          /* Clean, textbook aesthetic: strip nested borders, shadows, and background gray fills on print */
          #print-area .page-break-avoid,
          #print-area .section-card,
          #print-area .chapter-item,
          #print-area div[class*="bg-gray-"],
          #print-area div[class*="bg-violet-"],
          #print-area div[class*="bg-sky-"] {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          /* Remove print padding/margin on content pages container to enforce absolute symmetry of margins */
          #print-area > div:not(.print-cover-page) {
            padding-left: 0 !important;
            padding-right: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            display: block !important;
            width: 100% !important;
          }
          #print-area .space-y-12 {
            display: block !important;
            margin: 0 !important;
          }

          /* Elegant spacing and thin separator lines between sections */
          #print-area .page-break-avoid {
            border-bottom: 1px solid #e5e7eb !important;
            padding-top: 0.75rem !important;
            padding-bottom: 1rem !important;
            margin-bottom: 1rem !important;
            display: block !important;
          }

          /* Remove borders and shadows from the outer layout table, header, footer, and direct cells */
          #print-area > table,
          #print-area > table > thead,
          #print-area > table > tbody,
          #print-area > table > tfoot,
          #print-area > table > tbody > tr > td,
          #print-area > table > thead > tr > td,
          #print-area > table > tfoot > tr > td {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }

          /* Reset page number counter specifically for the content table, bypassing the cover page */
          #print-area > table {
            counter-reset: page 0;
            page-break-before: always !important;
            break-before: page !important;
          }

          /* Retain clean borders only for actual data tables nested inside the content, NOT the outer structural layout table */
          #print-area table table,
          #print-area table th,
          #print-area table td {
            border: 1px solid #d1d5db !important; /* Retain clean borders for actual data tables */
          }

          /* Strip ALL borders from nested sub-containers in print (never print borders of sub-containers, except data tables) */
          #print-area .page-break-avoid div:not(.katex):not(.katex *):not(.math-renderer *):not(.latex *):not(.question-box):not(.solution-box),
          #print-area .page-break-avoid section:not(.question-box):not(.solution-box) {
            border: none !important;
            border-width: 0 !important;
            box-shadow: none !important;
          }

          /* Prevent SVG containers from breaking across pages */
          #print-area svg,
          #print-area [class*="float-left"] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /* Remove borders and padding for print header/footer table rows and cells, adding explicit lines */
          #print-area .print-page-header td {
            border: none !important;
            padding-top: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            padding-bottom: 8px !important;
          }
          #print-area .print-page-footer td {
            border: none !important;
            border-top: 1.5px solid #cbd5e1 !important; /* Beautiful solid line above the footer */
            padding-top: 8px !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            padding-bottom: 0 !important;
          }

          /* Global Foreground Watermark rotated exactly at 45 degrees and centered */
          body #print-area .print-global-watermark {
            display: block !important;
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            width: auto !important;
            height: auto !important;
            transform: translate(-50%, -50%) rotate(-45deg) !important; /* Perfect 45-degree angle as requested */
            -webkit-transform: translate(-50%, -50%) rotate(-45deg) !important;
            font-size: 70pt !important; /* Robust display size */
            font-weight: 900 !important;
            color: rgba(124, 58, 237, ${watermarkOpacity}) !important;
            white-space: nowrap !important;
            pointer-events: none !important;
            z-index: 9999 !important; /* Foreground watermark */
            user-select: none !important;
            direction: rtl !important;
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* Custom question background and styles for printing */
          #print-area .question-box {
            background-color: ${questionBgColor} !important;
            background: ${questionBgColor} !important;
            padding: 1rem !important;
            border-radius: 0.5rem !important;
            border: 1px solid #cbd5e1 !important;
            margin-bottom: 1rem !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            display: block !important;
          }

          /* Custom solution background and styles for printing */
          #print-area .solution-box {
            background-color: ${solutionBgColor} !important;
            background: ${solutionBgColor} !important;
            padding: 1rem !important;
            border-radius: 0.5rem !important;
            border-right: 4px solid #10b981 !important;
            border-top: 1px solid #e2e8f0 !important;
            border-bottom: 1px solid #e2e8f0 !important;
            border-left: 1px solid #e2e8f0 !important;
            margin-bottom: 1rem !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            display: block !important;
          }

          /* Custom header background and styles for printing */
          #print-area .print-page-header .print-header-bar {
            background-color: ${printHeaderBgColor} !important;
            background: ${printHeaderBgColor} !important;
            font-size: ${printHeaderFontSize}pt !important;
            height: ${printHeaderHeight}px !important;
            line-height: ${printHeaderHeight}px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            color: ${getContrastColor(printHeaderBgColor)} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Compress spacing between section/lesson title and text under it in print */
          #print-area .page-break-avoid .space-y-6 {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          #print-area .page-break-avoid .space-y-6 > :not([hidden]) ~ :not([hidden]),
          #print-area .space-y-6 > :not([hidden]) ~ :not([hidden]),
          #print-area .page-break-avoid .space-y-6 > * + * {
            margin-top: 0.25rem !important; /* reduce spacing between title and content card in print */
          }
          #print-area .page-break-avoid .border-b {
            padding-bottom: 0.25rem !important; /* reduce title bottom padding from pb-3 to pb-1 */
          }
          #print-area .page-break-avoid div.p-6 {
            padding-top: 0.25rem !important; /* reduce card top padding inside the printed layout */
            padding-bottom: 0.25rem !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
          }

          /* Repeating fixed footer at the bottom of the printable area */
          .print-page-footer {
            height: auto !important;
            font-size: ${printFooterFontSize}pt !important;
            font-weight: ${printFooterIsBold ? 'bold' : 'normal'} !important;
            color: #4b5563 !important;
            direction: rtl !important;
            background-color: transparent !important;
          }
          
          .print-page-footer > tr > td > div {
            border-top: none !important; /* Remove individual div border to rely on table cell border */
            padding-top: 2mm !important;
            padding-bottom: 2mm !important;
          }
          
          .print-page-footer > tr > td > div * {
            visibility: hidden !important; /* Hide duplicate content text and page numbers inside tfoot spacer */
          }

          /* Avoid breaking intermediate sections midway through page boundary */
          .chapter-item, .section-card, .print-page-section, .page-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            display: block !important;
          }
        }
      `}</style>

      {/* 🟢 MODAL: IMPORT STRUCTURED SECTION JSON */}
      {importSectionModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] overflow-y-auto font-sans no-print" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-gray-150 relative animate-fade-in my-8 text-right">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <Upload className="text-emerald-600" size={24} />
                  استيراد فقرة دراسية مهيكلة (JSON) 📑
                </h3>
                <p className="text-xs text-gray-500 mt-1 font-bold">
                  تحديد وتخصيص التسميات المعيارية للفقرة (الصف - المادة - الجزء - الوحدة - الدرس)
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setImportSectionModalData(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-gray-600 font-medium leading-relaxed bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 text-amber-950">
              💡 يحتوي هذا الملف على فقرة تعليمية كاملة مع كود الشرح، الإرشادات، التحذيرات والتمارين. يمكنك مراجعة وتعديل التسميات المرافقة لها أدناه قبل الحفظ.
            </p>

            {/* Metadata Editable Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 text-xs font-sans">
              <div>
                <label className="block font-black text-slate-700 mb-1.5">الصف الدراسي (Grade):</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={importSectionModalData.metadata.grade}
                  onChange={(e) => setImportSectionModalData(prev => prev ? { ...prev, metadata: { ...prev.metadata, grade: e.target.value } } : null)}
                  placeholder="مثال: الثالث الثانوي العلمي"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1.5">المادة الدراسية (Subject):</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={importSectionModalData.metadata.subject}
                  onChange={(e) => setImportSectionModalData(prev => prev ? { ...prev, metadata: { ...prev.metadata, subject: e.target.value } } : null)}
                  placeholder="مثال: رياضيات"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1.5">الجزء (Part):</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={importSectionModalData.metadata.part}
                  onChange={(e) => setImportSectionModalData(prev => prev ? { ...prev, metadata: { ...prev.metadata, part: e.target.value } } : null)}
                  placeholder="مثال: الجزء الأول"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1.5">الوحدة (Unit):</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={importSectionModalData.metadata.unit}
                  onChange={(e) => setImportSectionModalData(prev => prev ? { ...prev, metadata: { ...prev.metadata, unit: e.target.value } } : null)}
                  placeholder="مثال: الوحدة الثالثة: الأشعة"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-black text-slate-700 mb-1.5">عنوان كراسة الدرس (Lesson Title):</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs"
                  value={importSectionModalData.metadata.lessonTitle}
                  onChange={(e) => setImportSectionModalData(prev => prev ? { ...prev, metadata: { ...prev.metadata, lessonTitle: e.target.value } } : null)}
                  placeholder="عنوان الدرس المنهجي الشامل..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-black text-slate-700 mb-1.5">عنوان الفقرة المستوردة (Section Title):</label>
                <input 
                  type="text" 
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs text-emerald-950"
                  value={importSectionModalData.metadata.sectionTitle}
                  onChange={(e) => setImportSectionModalData(prev => prev ? { ...prev, metadata: { ...prev.metadata, sectionTitle: e.target.value } } : null)}
                  placeholder="عنوان الفقرة الفرعية..."
                />
              </div>
            </div>

            {/* Preview Box */}
            <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-1.5 text-xs text-emerald-950 font-medium">
              <span className="font-extrabold text-emerald-900 block">معاينة محتوى المفهوم:</span>
              <p className="line-clamp-3 text-slate-700 leading-relaxed dir-rtl">
                {importSectionModalData.section.content || importSectionModalData.section.concept || 'فقرة تعليمية مكتملة تحتوي على كامل الأفكار والتطبيقات والحلول.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setImportSectionModalData(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              {activeSummaryId && (
                <button
                  type="button"
                  onClick={async () => {
                    await addImportedSectionToSummary(activeSummaryId, importSectionModalData);
                    setImportSectionModalData(null);
                  }}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  إضافة كـ فقرة في الدرس الحالي ➕
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const newDocId = await createNewSummaryFromImportedSection(importSectionModalData);
                  setImportSectionModalData(null);
                  if (newDocId) setActiveSummaryId(newDocId);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={15} />
                إنشاء كراسة درس جديد بهذه الفقرة 📄✨
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Metadata Edit Modal */}
      {editingBookletDoc && (
        <DocumentMetadataModal
          isOpen={!!editingBookletDoc}
          onClose={() => setEditingBookletDoc(null)}
          document={editingBookletDoc}
          onSaveSuccess={() => {
            if (activeSummaryId) {
              db.documents.get(activeSummaryId).then(d => d && setActiveSummary(d));
            }
          }}
        />
      )}

    </div>
  );
};
