import React, { useState, useEffect, useRef } from 'react';
import { db, type QuestionBank, type QuestionBankItem, type Document } from '../db';
import { 
  ArrowRight, 
  Save, 
  Sparkles, 
  Loader2, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Star, 
  Info, 
  Lightbulb, 
  Printer, 
  BookOpen,
  Image as ImageIcon,
  RotateCcw,
  PlusCircle,
  HelpCircle,
  Maximize2,
  Minimize2,
  ClipboardCheck,
  AlertCircle,
  FileText,
  Download,
  Globe
} from 'lucide-react';
import { generateQuestionBank, generateSvgForTestQuestion, generateSolutionForQuestion, reviewQuestionBankItem, generateSummaryText, generateExpandedSummaryText, generateCondensedSummaryText, generateOnlyMCQs, generateOnlyEssayQuestions, auditReviewTableInSummary } from '../services/gemini';
import { MathRenderer } from './MathRenderer';
import { SmartMathEditor } from './SmartMathEditor';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { DEFAULT_COUNTRY, DEFAULT_GRADE, DEFAULT_SUBJECT, DEFAULT_SERIES_NAME, DEFAULT_TEACHER_NAME, DEFAULT_TEACHER_ROLE } from '../constants/academicData';
import { motion, AnimatePresence } from 'motion/react';

const getCircledNumber = (index: number): string => {
  const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  return circledNumbers[index] || `(${index + 1})`;
};

const looksLikeMCQParts = (subParts: string[]): boolean => {
  if (!subParts || subParts.length !== 4) return false;
  
  // MCQ options start with specific choices like A, B, C, D or أ, ب, ج, د followed by proper punctuation, 
  // or they are short simple phrases representing 4 choices in a math question.
  const prefixRegex = /^\s*[\(\[\\{]?[أبجدA-Da-d][\)\]\s\-\.\:\\}/]/;
  const matchesPrefix = subParts.filter(opt => prefixRegex.test(opt)).length >= 2;
  
  // Or if all choices are short numeric/algebraic answers (e.g., "0.5", "1", "\frac{1}{2}")
  const isShortMathChoices = subParts.every(opt => opt.trim().length > 0 && opt.trim().length < 25);
  
  return matchesPrefix || isShortMathChoices;
};

const isMCQItem = (item?: Partial<QuestionBankItem> | QuestionBankItem): boolean => {
  if (!item) return false;
  if (item.type) {
    return item.type === 'mcq';
  }
  return looksLikeMCQParts(item.subParts || []);
};

const sanitizeOptionMath = (text: string): string => {
  if (!text) return '';
  let cleaned = text.trim();
  
  // 1. Remove \text{...} wrappers inside math blocks if they contain Arabic letters
  cleaned = cleaned.replace(/\\text\s*\{([^}]*[\u0600-\u06FF][^}]*)\}/gi, '$1');
  
  // 2. Remove $ ... $ or $$ ... $$ wraps if the inner text contains Arabic letters
  cleaned = cleaned.replace(/\$\$([^$]*[\u0600-\u06FF][^$]*)\$\$/g, '$1');
  cleaned = cleaned.replace(/\$([^$]*[\u0600-\u06FF][^$]*)\$/g, '$1');

  return cleaned.trim();
};

const cleanSubpartText = (text: string): string => {
  if (!text) return '';
  let cleaned = text.trim();
  
  // Strip circled numbers ① to ⑳ and general bullet characters at start
  cleaned = cleaned.replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/, '');
  
  // Strip standard numeric list prefixes like "1.", "2.", "1-", "(1)", "١.", "١-", "(١)" at start
  const numberCleaned = cleaned.replace(/^\s*[\(]?[0-9١٢٣٤٥٦٧٨٩٠]+[\s]*[\)\.\-\:]?\s*/, '');
  
  // If the string starts with brackets (like `[1]`), strip that too
  cleaned = numberCleaned.replace(/^\s*\[[0-9١٢٣٤٥٦٧٨٩٠]+\]\s*/, '');
  
  // Strip alphabetical list prefixes like "أ-", "ب-", "[أ]", "(ب)", "أ)", "أ.", "أ:"
  cleaned = cleaned.replace(/^\s*[\[\(\-]?([أبجدهوزحطيكلنعسفضصقرتثخذضظغ])([\]\)\-\s\:\.\,]+)/, '');
  
  return sanitizeOptionMath(cleaned.trim());
};

const getCleanOptionText = (text: string): string => {
  if (!text) return '';
  let cleaned = text.trim();
  // Remove (أ) , (ب) , (ج) , (د) or (A) , (B) , (C) , (D)
  cleaned = cleaned.replace(/^\s*[\[\(\]\}]?[أبجدA-Da-d][\]\)\s\-\.\:\,]+/i, '');
  // Clean any residual opening/closing markers or periods
  cleaned = cleaned.replace(/^\s*[أبجدA-Da-d]\s*[\)\-\.]\s*/i, '');
  return sanitizeOptionMath(cleaned.trim());
};

const THEMES = {
  indigo: {
    name: 'أزرق ليلكي (تحليل وتحسين)',
    bg: 'bg-gradient-to-br from-indigo-50/70 to-blue-50/70',
    border: 'border-indigo-200/80',
    badge: 'bg-indigo-100 text-indigo-700',
    accent: 'text-indigo-600',
    dot: 'bg-indigo-500'
  },
  emerald: {
    name: 'أخضر زمردي (هندسة وفضاء)',
    bg: 'bg-gradient-to-br from-emerald-50/70 to-teal-50/70',
    border: 'border-emerald-200/80',
    badge: 'bg-emerald-100 text-emerald-700',
    accent: 'text-emerald-600',
    dot: 'bg-emerald-500'
  },
  amber: {
    name: 'ذهبي عسلي (جبر ومصفوفات)',
    bg: 'bg-gradient-to-br from-amber-50/70 to-orange-50/70',
    border: 'border-amber-200/80',
    badge: 'bg-amber-100 text-amber-700',
    accent: 'text-amber-600',
    dot: 'bg-amber-500'
  },
  rose: {
    name: 'وردي ملهم (مذاكرات وربط وطني)',
    bg: 'bg-gradient-to-br from-rose-50/70 to-pink-50/70',
    border: 'border-rose-200/80',
    badge: 'bg-rose-100 text-rose-700',
    accent: 'text-rose-600',
    dot: 'bg-rose-500'
  },
  slate: {
    name: 'رمادي مدرسي كلاسيكي (موضوعات عامة)',
    bg: 'bg-gradient-to-br from-slate-50/80 to-zinc-50/80',
    border: 'border-slate-200/80',
    badge: 'bg-slate-200 text-slate-800',
    accent: 'text-slate-600',
    dot: 'bg-slate-500'
  }
};

interface QuestionBankViewProps {
  bankId?: number;
  isNew?: boolean;
  onBack: () => void;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({ bankId, isNew, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [tempSummaryText, setTempSummaryText] = useState('');
  const [bank, setBank] = useState<Partial<QuestionBank>>({
    title: '',
    grade: '',
    subject: '',
    part: '',
    unit: '',
    items: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [tempItem, setTempItem] = useState<QuestionBankItem | null>(null);
  const [showSolution, setShowSolution] = useState<Record<string, boolean>>({});
  const [showGuidance, setShowGuidance] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'order' | 'stars'>('order');

  // Print & Display preferences
  const [useWatermark, setUseWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('حسن راشد العلي');
  const [watermarkRepeats, setWatermarkRepeats] = useState<number>(3);
  const [printFont, setPrintFont] = useState<'default' | 'cairo' | 'amiri' | 'tajawal' | 'almarai' | 'al-mithaq' | 'scheherazade' | 'aref' | 'notonaskh' | 'reemkufi'>('default');
  const [printColumns, setPrintColumns] = useState<1 | 2>(1);
  const [printFontSize, setPrintFontSize] = useState<number>(13);
  const [printMode, setPrintMode] = useState<'questions_only' | 'questions_and_solutions'>('questions_only');
  const [printScope, setPrintScope] = useState<'all' | 'summary_only' | 'questions_only'>('all');
  const [printGuidance, setPrintGuidance] = useState(true);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);

  // Local metadata states to bind with inputs
  const [metaTitle, setMetaTitle] = useState('');
  const [metaCountry, setMetaCountry] = useState(DEFAULT_COUNTRY);
  const [metaGrade, setMetaGrade] = useState('');
  const [metaSubject, setMetaSubject] = useState('');
  const [metaPart, setMetaPart] = useState('');
  const [metaUnit, setMetaUnit] = useState('');
  const [metaTopic, setMetaTopic] = useState('');
  const [metaSeriesName, setMetaSeriesName] = useState(DEFAULT_SERIES_NAME);
  const [metaTeacherName, setMetaTeacherName] = useState(DEFAULT_TEACHER_NAME);
  const [metaTeacherRole, setMetaTeacherRole] = useState(DEFAULT_TEACHER_ROLE);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);

  // Confirmation state
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);

  // Background Theme palette for comprehensive summary
  const [summaryTheme, setSummaryTheme] = useState<'indigo' | 'emerald' | 'amber' | 'rose' | 'slate'>('indigo');

  useEffect(() => {
    if (bank.subject) {
      const sub = bank.subject;
      if (sub.includes('جبر') || sub.includes('مصفوفات')) {
        setSummaryTheme('amber');
      } else if (sub.includes('هندسة') || sub.includes('فراغ') || sub.includes('مستو')) {
        setSummaryTheme('emerald');
      } else if (sub.includes('تحليل') || sub.includes('تفاضل') || sub.includes('تكامل') || sub.includes('نهايات')) {
        setSummaryTheme('indigo');
      } else if (sub.includes('مذاكرة') || sub.includes('اختبار') || sub.includes('امتحان')) {
        setSummaryTheme('rose');
      } else {
        setSummaryTheme('slate');
      }
    }
  }, [bank.subject]);

  // Form selection state
  const [availableDocs, setAvailableDocs] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [isCondensed, setIsCondensed] = useState(false);
  const [condensing, setCondensing] = useState(false);

  const [showRefPreview, setShowRefPreview] = useState(false);
  const [refText, setRefText] = useState<string>('');
  const [showExpandPromptModal, setShowExpandPromptModal] = useState(false);
  const [summaryExpandInstructions, setSummaryExpandInstructions] = useState('');

  // Injection of test questions states
  const [showInjectTestQuestionsModal, setShowInjectTestQuestionsModal] = useState(false);
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [selectedQuestionsToInject, setSelectedQuestionsToInject] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (showInjectTestQuestionsModal) {
      const loadTests = async () => {
        try {
          const tests = await db.tests.toArray();
          setAvailableTests(tests || []);
        } catch (err) {
          console.error("Failed to load tests", err);
        }
      };
      loadTests();
    }
  }, [showInjectTestQuestionsModal]);

  const getFlattenedQuestions = () => {
    if (!selectedTestId) return [];
    const test = availableTests.find(t => t.id === selectedTestId);
    if (!test || !test.testData || !test.testData.sections) return [];

    const qs: any[] = [];
    test.testData.sections.forEach((sec: any, secIdx: number) => {
      const isMcqSection = sec.sectionType === 'mcq' || sec.sectionTitle?.includes('متعدد') || sec.sectionTitle?.includes('إجابة صحيحة');
      (sec.questions || []).forEach((q: any, qIdx: number) => {
        qs.push({
          key: `${secIdx}-${qIdx}`,
          text: q.text,
          type: isMcqSection ? 'mcq' : 'essay',
          options: q.options || [],
          subQuestions: q.subQuestions || [],
          solution: q.solution || '',
          svgCode: q.svgCode || '',
          solutionSvgCode: q.solutionSvgCode || '',
          originalSectionTitle: sec.sectionTitle
        });
      });
    });
    return qs;
  };

  const handleInjectQuestions = () => {
    const qList = getFlattenedQuestions();
    const toInject = qList.filter(q => selectedQuestionsToInject[q.key]);
    if (toInject.length === 0) {
      alert("الرجاء اختيار سؤال واحد على الأقل للحقن.");
      return;
    }

    let nextOrder = Math.max(0, ...(bank.items?.map(i => i.order) || [0])) + 1;
    
    const newItems: QuestionBankItem[] = toInject.map((q, idx) => {
      const isMcq = q.type === 'mcq';
      let subParts: string[] = [];
      if (isMcq) {
        subParts = q.options && q.options.length === 4 ? [...q.options] : ['أ) ', 'ب) ', 'ج) ', 'د) '];
      } else {
        subParts = q.subQuestions && q.subQuestions.length > 0 ? [...q.subQuestions] : [];
      }

      return {
        id: `${q.type}_injected_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        topic: `سؤال محقون من اختبار: ${availableTests.find(t => t.id === selectedTestId)?.title || ''}`,
        difficulty: 3,
        question: q.text,
        subParts,
        solution: q.solution || '🔑 لا يوجد حل تفصيلي متوفر.',
        aiGuidance: '💡 انتبه جلياً لشروط المسألة وقوانينها المتضمنة.',
        order: nextOrder++,
        type: q.type,
        svgCode: q.svgCode || undefined,
        solutionSvgCode: q.solutionSvgCode || undefined
      };
    });

    setBank(prev => ({
      ...prev,
      items: [...(prev.items || []), ...newItems]
    }));

    setSelectedTestId(null);
    setSelectedQuestionsToInject({});
    setShowInjectTestQuestionsModal(false);
    
    alert(`تم حقن عدد ${newItems.length} من الأسئلة بنجاح إلى بنك الأسئلة الحالي! ✨`);
  };

  // AI Proofread & Edit States
  const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [reviewReport, setReviewReport] = useState<{
    status: 'correct' | 'needs_fixes';
    analysis: string;
    suggestedFix?: {
      question?: string;
      subParts?: string[];
      solution?: string;
      aiGuidance?: string;
      topic?: string;
      difficulty?: number;
    };
  } | null>(null);

  useEffect(() => {
    const init = async () => {
      await loadAvailableDocs();
      if (bankId) {
        await loadBank(bankId);
      }
    };
    init();
  }, [bankId]);

  // Robust Auto-Save to IndexedDB whenever the local 'bank' state or metadata changes
  useEffect(() => {
    if (loading) return; // Do not auto-save during loading / extraction
    const saveId = bank.id || bankId;
    if (!saveId) return;

    const timer = setTimeout(() => {
      const dataToSave = {
        ...bank,
        title: metaTitle || bank.title || 'بنك أسئلة غير مسمى',
        country: metaCountry || bank.country || DEFAULT_COUNTRY,
        grade: metaGrade || bank.grade || '',
        subject: metaSubject || bank.subject || '',
        part: metaPart || bank.part || '',
        unit: metaUnit || bank.unit || '',
        topic: metaTopic || bank.topic || undefined,
        seriesName: metaSeriesName || bank.seriesName || undefined,
        teacherName: metaTeacherName || bank.teacherName || undefined,
        teacherRole: metaTeacherRole || bank.teacherRole || undefined,
        docId: selectedDocId || bank.docId || undefined,
        updatedAt: Date.now()
      } as QuestionBank;

      db.questionBanks.put({ ...dataToSave, id: Number(saveId) })
        .catch(err => console.error("Auto-save to Dexie failed", err));
    }, 800); // 800ms debounce to optimize DB writes

    return () => clearTimeout(timer);
  }, [bank, metaTitle, metaCountry, metaGrade, metaSubject, metaPart, metaUnit, metaTopic, metaSeriesName, metaTeacherName, metaTeacherRole, selectedDocId, loading, bankId]);

  const loadBank = async (id: number) => {
    setLoading(true);
    const data = await db.questionBanks.get(id);
    if (data) {
      // Ensure all loaded items have their 'type' populated explicitly for backward compatibility
      const upgradedItems = (data.items || []).map((item: any) => {
        if (item.type) return item;
        const subParts = item.subParts || [];
        const looksLikeMcq = subParts.length === 4 && subParts.some((opt: string) => 
          /[\s(]*[أبجد][\s)]/.test(opt) || 
          /^(أ|ب|ج|د)\s*[-)]/.test(opt.trim()) ||
          opt.trim().startsWith('أ)') || 
          opt.trim().startsWith('ب)') || 
          opt.trim().startsWith('ج)') || 
          opt.trim().startsWith('د)')
        );
        return {
          ...item,
          type: looksLikeMcq ? 'mcq' : 'essay'
        };
      });
      data.items = upgradedItems;

      setBank(data);
      setMetaTitle(data.title || '');
      setMetaCountry(data.country || DEFAULT_COUNTRY);
      setMetaGrade(data.grade || '');
      setMetaSubject(data.subject || '');
      setMetaPart(data.part || '');
      setMetaUnit(data.unit || '');
      setMetaTopic(data.topic || '');
      setMetaSeriesName(data.seriesName || DEFAULT_SERIES_NAME);
      setMetaTeacherName(data.teacherName || DEFAULT_TEACHER_NAME);
      setMetaTeacherRole(data.teacherRole || DEFAULT_TEACHER_ROLE);
      
      const docs = await db.documents.where('type').equals('pdf').toArray();
      setAvailableDocs(docs);

      // Auto-match document
      let matchingDoc = null;
      if (data.docId) {
        matchingDoc = docs.find(d => d.id === data.docId);
      }
      if (!matchingDoc) {
        matchingDoc = docs.find(d => 
          d.grade === data.grade && 
          d.subject === data.subject && 
          d.unit === data.unit
        );
      }
      if (matchingDoc) {
        setSelectedDocId(matchingDoc.id!);
        loadRefText(matchingDoc.id!);
      }
    }
    setLoading(false);
  };

  const loadAvailableDocs = async () => {
    const docs = await db.documents.where('type').equals('pdf').toArray();
    setAvailableDocs(docs);
    return docs;
  };

  const loadRefText = async (docId: number) => {
    const content = await db.pdfContents.where('docId').equals(docId).first();
    if (content) {
      setRefText(content.textContent);
    }
  };

  // Sync edits to metadata and core state
  const handleMetaChange = (field: string, value: string) => {
    if (field === 'title') setMetaTitle(value);
    else if (field === 'country') setMetaCountry(value);
    else if (field === 'grade') setMetaGrade(value);
    else if (field === 'subject') setMetaSubject(value);
    else if (field === 'part') setMetaPart(value);
    else if (field === 'unit') setMetaUnit(value);
    else if (field === 'topic') setMetaTopic(value);
    else if (field === 'seriesName') setMetaSeriesName(value);
    else if (field === 'teacherName') setMetaTeacherName(value);
    else if (field === 'teacherRole') setMetaTeacherRole(value);

    setBank(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveMetadataFromModal = async (updated: {
    title: string;
    country: string;
    grade: string;
    subject: string;
    part?: string;
    unit?: string;
    topic?: string;
    seriesName?: string;
    teacherName?: string;
    teacherRole?: string;
  }) => {
    setMetaTitle(updated.title);
    setMetaCountry(updated.country);
    setMetaGrade(updated.grade);
    setMetaSubject(updated.subject);
    setMetaPart(updated.part || '');
    setMetaUnit(updated.unit || '');
    setMetaTopic(updated.topic || '');
    setMetaSeriesName(updated.seriesName || DEFAULT_SERIES_NAME);
    setMetaTeacherName(updated.teacherName || DEFAULT_TEACHER_NAME);
    setMetaTeacherRole(updated.teacherRole || DEFAULT_TEACHER_ROLE);

    setBank(prev => ({
      ...prev,
      title: updated.title,
      country: updated.country,
      grade: updated.grade,
      subject: updated.subject,
      part: updated.part || '',
      unit: updated.unit || '',
      topic: updated.topic || '',
      seriesName: updated.seriesName || DEFAULT_SERIES_NAME,
      teacherName: updated.teacherName || DEFAULT_TEACHER_NAME,
      teacherRole: updated.teacherRole || DEFAULT_TEACHER_ROLE,
      updatedAt: Date.now()
    }));

    const saveId = bank.id || bankId;
    if (saveId) {
      await db.questionBanks.update(saveId, {
        title: updated.title,
        country: updated.country,
        grade: updated.grade,
        subject: updated.subject,
        part: updated.part || undefined,
        unit: updated.unit || undefined,
        topic: updated.topic || undefined,
        seriesName: updated.seriesName || undefined,
        teacherName: updated.teacherName || undefined,
        teacherRole: updated.teacherRole || undefined,
        updatedAt: Date.now()
      });
    }
    setIsMetadataModalOpen(false);
  };

  // Update selectedDocId when availableDocs or bank changes - prioritize bank.docId
  useEffect(() => {
    if (availableDocs.length > 0) {
      let matchedId: number | null = null;
      if (bank.docId) {
        const testDoc = availableDocs.find(d => d.id === bank.docId);
        if (testDoc) {
          matchedId = testDoc.id!;
        }
      }
      
      if (!matchedId && bank.grade && bank.subject && bank.unit) {
        const matchingDoc = availableDocs.find(d => 
          d.grade === bank.grade && 
          d.subject === bank.subject && 
          d.unit === bank.unit
        );
        if (matchingDoc) {
          matchedId = matchingDoc.id!;
        }
      }

      if (matchedId && matchedId !== selectedDocId) {
        setSelectedDocId(matchedId);
        loadRefText(matchedId);
      }
    }
  }, [bank.docId, bank.grade, bank.subject, bank.unit, availableDocs, selectedDocId]);

  const handleSave = async () => {
    const titleVal = metaTitle || bank.title;
    if (!titleVal || !bank.items?.length) {
      alert('الرجاء إدخال عنوان وتوليد أسئلة أولاً');
      return;
    }

    const dataToSave = {
      ...bank,
      title: titleVal,
      country: metaCountry || bank.country || DEFAULT_COUNTRY,
      grade: metaGrade || bank.grade || '',
      subject: metaSubject || bank.subject || '',
      part: metaPart || bank.part || '',
      unit: metaUnit || bank.unit || '',
      topic: metaTopic || bank.topic || undefined,
      seriesName: metaSeriesName || bank.seriesName || undefined,
      teacherName: metaTeacherName || bank.teacherName || undefined,
      teacherRole: metaTeacherRole || bank.teacherRole || undefined,
      docId: selectedDocId || bank.docId || undefined,
      updatedAt: Date.now()
    } as QuestionBank;

    if (bank.id) {
      await db.questionBanks.put(dataToSave);
    } else if (bankId) {
      await db.questionBanks.put({ ...dataToSave, id: bankId });
    } else {
      const addedId = await db.questionBanks.add(dataToSave);
      setBank(prev => ({ ...prev, id: addedId }));
    }
    alert('تم حفظ بنك الأسئلة بنجاح');
    onBack();
  };

  const handleGenerate = async () => {
    if (!selectedDocId) {
      alert('الرجاء اختيار مرجع دراسي (PDF) أولاً');
      return;
    }

    const doc = availableDocs.find(d => d.id === selectedDocId);
    if (!doc) return;

    setGenerating(true);
    setCurrentAction('generate_bank');
    try {
      const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
      if (!pdfContent) throw new Error('لم يتم العثور على محتوى PDF');

      if (!pdfContent.textContent || pdfContent.textContent.trim().length < 100) {
        const proceed = window.confirm('تنبيه: هذا المرجع لا يحتوي على نص مستخلص (قد يكون نسخة مصورة). توليد بنك الأسئلة الآن سيعتمد على معلومات عامة وقد لا يلتزم بالمصدر. هل تريد المتابعة؟\n\nنصيحة: اذهب لمكتبة المستندات واستخدم "استخلاص النص بالذكاء الاصطناعي" لهذا الملف أولاً.');
        if (!proceed) {
           setGenerating(false);
           setCurrentAction(null);
           return;
        }
      }

      const config = {
        grade: doc.grade,
        subject: doc.subject,
        part: doc.part || '',
        unit: doc.unit || ''
      };

      const generationResult = await generateQuestionBank(pdfContent.textContent, config);
      
      let rawQuestions: any[] = [];
      let generatedSummary = '';

      if (generationResult && typeof generationResult === 'object' && !Array.isArray(generationResult)) {
        rawQuestions = generationResult.questions || generationResult.items || [];
        generatedSummary = generationResult.summaryText || '';
      } else if (Array.isArray(generationResult)) {
        rawQuestions = generationResult;
      }

      const itemsWithOrder = rawQuestions.map((item: any, idx: number) => {
        const subParts = item.subParts || [];
        const looksLikeMcq = subParts.length === 4 && subParts.some((opt: string) => 
          /[\s(]*[أبجد][\s)]/.test(opt) || 
          /^(أ|ب|ج|د)\s*[-)]/.test(opt.trim()) ||
          opt.trim().startsWith('أ)') || 
          opt.trim().startsWith('ب)') || 
          opt.trim().startsWith('ج)') || 
          opt.trim().startsWith('د)')
        );
        return {
          ...item,
          id: crypto.randomUUID(),
          order: idx,
          type: item.type || (looksLikeMcq ? 'mcq' : 'essay')
        };
      });

      const titleText = `بنك أسئلة: ${doc.unit} - ${doc.subject}`;
      setMetaTitle(titleText);
      setMetaGrade(doc.grade);
      setMetaSubject(doc.subject);
      setMetaPart(doc.part || '');
      setMetaUnit(doc.unit || '');

      setBank(prev => ({
        ...prev,
        grade: doc.grade,
        subject: doc.subject,
        part: doc.part || '',
        unit: doc.unit || '',
        docId: selectedDocId,
        title: titleText,
        items: itemsWithOrder,
        summaryText: generatedSummary
      }));

    } catch (error) {
      console.error('Generation failed', error);
      alert('فشل توليد بنك الأسئلة. الرجاء المحاولة مرة أخرى.');
    } finally {
      setGenerating(false);
      setCurrentAction(null);
    }
  };

  const startEditing = (item: QuestionBankItem) => {
    setEditingItemId(item.id);
    setTempItem({ ...item });
  };

  const saveEdit = () => {
    if (!tempItem) return;
    const originalItem = bank.items?.find(item => item.id === tempItem.id);
    const resolvedType = tempItem.type || originalItem?.type || (isMCQItem(tempItem) ? 'mcq' : 'essay');
    const updatedItem = {
      ...tempItem,
      type: resolvedType
    };
    setBank(prev => ({
      ...prev,
      items: prev.items?.map(item => item.id === tempItem.id ? updatedItem : item) || []
    }));
    setEditingItemId(null);
    setTempItem(null);
  };

  const deleteItem = async (id: string) => {
    setBank(prev => ({
      ...prev,
      items: prev.items?.filter(item => item.id !== id) || []
    }));
  };

  const generateSvgForItem = async (id: string) => {
    const item = bank.items?.find(i => i.id === id);
    if (!item) return;

    setGenerating(true);
    setCurrentAction(`generate_svg_${id}`);
    try {
      const svgCode = await generateSvgForTestQuestion(item.question);
      setBank(prev => ({
        ...prev,
        items: prev.items?.map(i => i.id === id ? { ...i, svgCode } : i) || []
      }));
    } catch (error) {
      console.error('SVG generation failed', error);
    } finally {
      setGenerating(false);
      setCurrentAction(null);
    }
  };

  const generateAIGuidance = async (id: string) => {
    const item = bank.items?.find(i => i.id === id);
    if (!item) return;

    setGenerating(true);
    setCurrentAction(`guidance_${id}`);
    try {
      const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
      const result = await generateSolutionForQuestion(item.question, pdfContent?.textContent);
      setBank(prev => ({
        ...prev,
        items: prev.items?.map(i => i.id === id ? { ...i, aiGuidance: "إرشاد: " + result.solution.slice(0, 100) + "..." } : i) || []
      }));
    } catch (error) {
      console.error('Guidance generation failed', error);
    } finally {
      setGenerating(false);
      setCurrentAction(null);
    }
  };

  const startAIReview = async (item: QuestionBankItem) => {
    setReviewingItemId(item.id);
    setIsReviewing(true);
    setReviewReport(null);
    setCurrentAction(`review_${item.id}`);
    try {
      const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId || 0).first();
      const report = await reviewQuestionBankItem(item, pdfContent?.textContent);
      setReviewReport(report);
    } catch (error) {
      console.error("Verification failed", error);
      alert("تعذر تدقيق وفحص السؤال حالياً. يرجى التأكد من اختيار مرجع مناسب للتحقق منه ومحاولة المرة التالية.");
      setReviewingItemId(null);
    } finally {
      setIsReviewing(false);
      setCurrentAction(null);
    }
  };

  const applyReviewedFixes = () => {
    if (!reviewingItemId || !reviewReport || !reviewReport.suggestedFix) return;
    
    setBank(prev => {
      const updatedItems = prev.items?.map(item => {
        if (item.id === reviewingItemId) {
          const fix = reviewReport.suggestedFix!;
          return {
            ...item,
            topic: fix.topic ?? item.topic,
            question: fix.question ?? item.question,
            solution: fix.solution ?? item.solution,
            aiGuidance: fix.aiGuidance ?? item.aiGuidance,
            difficulty: fix.difficulty ?? item.difficulty,
            subParts: fix.subParts ?? item.subParts
          };
        }
        return item;
      }) || [];

      return {
        ...prev,
        items: updatedItems
      };
    });

    setReviewingItemId(null);
    setReviewReport(null);
  };

  const handleAddMCQManually = () => {
    const nextOrder = Math.max(0, ...(bank.items?.map(i => i.order) || [0])) + 1;
    const newItem: QuestionBankItem = {
      id: `mcq_manual_${Date.now()}`,
      topic: 'مفهوم اختيار من متعدد جديد',
      difficulty: 3,
      question: 'اكتب نص سؤال الاختيار من متعدد الجديد هنا بالاستعانة برموز LaTeX...',
      subParts: ['أ) الخيار الأول', 'ب) الخيار الثاني', 'ج) الخيار الثالث', 'د) الخيار الرابع'],
      solution: '🔑 اكتب خطوات الحل النموذجي بالكامل هنا بالاستعانة بصيغ LaTeX...',
      aiGuidance: 'تحديد فخ أو خطأ شائع يمكن أن يقع به الطالب عند حل السؤال.',
      order: nextOrder,
      type: 'mcq'
    };

    setBank(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
    
    startEditing(newItem);
  };

  const handleAddEssayManually = () => {
    const nextOrder = Math.max(0, ...(bank.items?.map(i => i.order) || [0])) + 1;
    const newItem: QuestionBankItem = {
      id: `essay_manual_${Date.now()}`,
      topic: 'مسألة مقالية جديدة',
      difficulty: 3,
      question: 'اكتب نص المسألة الإنشائية الطويلة أو التمرين المقالي هنا الموجه للطلاب...',
      subParts: ['① الطلب الأول للبحث...', '② الطلب الثاني والمطلوب حسابه...'],
      solution: '🔑 اكتب خطوات وجوانب الحل لكل من الطلبات بالتفصيل هنا...',
      aiGuidance: 'إرشاد منهجي للوصول إلى الحل والترتيب السليم.',
      order: nextOrder,
      type: 'essay'
    };

    setBank(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));

    startEditing(newItem);
  };

  const rebuildSummaryAI = async () => {
    if (!selectedDocId) {
       alert('يجب اختيار مرجع لإعادة مسح الملخص وتوليده من جديد');
       return;
    }
    setGenerating(true);
    setCurrentAction('rebuild_summary');
    try {
       const doc = availableDocs.find(d => d.id === selectedDocId);
       const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
       if (!pdfContent || !doc) throw new Error('Invalid setup');

       const config = { grade: doc.grade, subject: doc.subject, part: doc.part || '', unit: doc.unit || '' };
       const text = await generateSummaryText(pdfContent.textContent, config);
       
       setBank(prev => ({
         ...prev,
         summaryText: text
       }));
       alert('تمت إعادة مسح المرجع بالكامل وتوليد ملخص شامل جديد بنجاح!');
    } catch (error) {
       console.error('Failed to regenerate summary:', error);
       alert('فشل إعادة توليد الملخص من جديد، الرجاء المحاولة مرة أخرى.');
    } finally {
       setGenerating(false);
       setCurrentAction(null);
     }
  };

  const expandSummaryAI = async () => {
    if (!selectedDocId) {
       alert('يجب اختيار مرجع لتوسيع الملخص');
       return;
    }
    setGenerating(true);
    setCurrentAction('expand_summary');
    try {
       const doc = availableDocs.find(d => d.id === selectedDocId);
       const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
       if (!pdfContent || !doc) throw new Error('Invalid setup');

       const config = { grade: doc.grade, subject: doc.subject, part: doc.part || '', unit: doc.unit || '' };
       const existingSummary = bank.summaryText || '';
       const text = await generateExpandedSummaryText(
         pdfContent.textContent, 
         config, 
         existingSummary, 
         summaryExpandInstructions
       );
       
       setBank(prev => ({
         ...prev,
         summaryText: text
       }));
       alert('تم إجراء مسح كامل للمرجع وتعميق وتوسيع الملخص الحالي بنجاح بلغة متميزة!');
    } catch (error) {
       console.error('Failed to expand summary:', error);
       alert('فشل توسيع الملخص، الرجاء المحاولة مرة أخرى.');
    } finally {
       setGenerating(false);
       setCurrentAction(null);
    }

  };

  const condenseSummaryAI = async (forceRegen = false) => {
    const existingSummary = bank.summaryText || '';
    if (!existingSummary.trim()) {
       alert('لا يوجد ملخص حالي لتقليصه. الرجاء توليد ملخص شامل أولاً.');
       return;
    }
    
    if (!forceRegen && bank.condensedSummaryText && bank.condensedSummaryText.trim()) {
       setIsCondensed(true);
       return;
    }

    setIsCondensed(false);
    setCondensing(true);
    setGenerating(true);
    setCurrentAction('condense_summary');

    try {
       const text = await generateCondensedSummaryText(existingSummary);
       
       setBank(prev => ({
         ...prev,
         condensedSummaryText: text
       }));
       setIsCondensed(true);
    } catch (error) {
       console.error('Failed to condense summary:', error);
       alert('فشل تقليص الملخص، الرجاء المحاولة مرة أخرى.');
    } finally {
       setCondensing(false);
       setGenerating(false);
       setCurrentAction(null);
    }
  };

  const auditReviewTableAI = async () => {
    if (!selectedDocId) {
       alert('يجب اختيار مرجع للتحقق وتدقيق جدول المراجعة من المرجع المحفوظ.');
       return;
    }
    setGenerating(true);
    setCurrentAction('audit_table');
    try {
       const doc = availableDocs.find(d => d.id === selectedDocId);
       const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
       if (!pdfContent || !doc) throw new Error('Invalid setup');

       const config = { grade: doc.grade, subject: doc.subject, part: doc.part || '', unit: doc.unit || '' };
       const existingSummary = bank.summaryText || '';
       
       const text = await auditReviewTableInSummary(
         existingSummary,
         pdfContent.textContent,
         config
       );
       
       setBank(prev => ({
         ...prev,
         summaryText: text
       }));
       alert('تمت عمليات التدقيق والصقل لجدول المراجعة ودقة الصفحات وإزالة الأفكار المتكررة مع إضافة عمود "الطلب" بنجاح! ✨');
    } catch (error) {
       console.error('Failed to audit review table:', error);
       alert('فشل تدقيق جدول المراجعة من المرجع، الرجاء المحاولة مرة أخرى.');
    } finally {
       setGenerating(false);
       setCurrentAction(null);
    }
  };



  const rebuildMCQsAI = async () => {
    if (!selectedDocId) {
       alert('يجب اختيار مرجع لإعادة توليد الأسئلة الموضوعية من جديد');
       return;
    }
    if (!window.confirm('انتبه: هذا الإجراء سيقوم بحذف جميع أسئلة الاختيار من متعدد المتوفرة حالياً والبدء بمسح جديد تماماً للمرجع وتوليد أسئلة بديلة بدقة علمية. هل تريد المتابعة؟')) {
       return;
    }
    setGenerating(true);
    setCurrentAction('rebuild_mcqs');
    try {
       const doc = availableDocs.find(d => d.id === selectedDocId);
       const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
       if (!pdfContent || !doc) throw new Error('Invalid setup');

       const config = { grade: doc.grade, subject: doc.subject, part: doc.part || '', unit: doc.unit || '' };
       const mcqs = await generateOnlyMCQs(pdfContent.textContent, config, []);

       if (mcqs && mcqs.length > 0) {
         // Keep non-MCQ items
         const otherItems = bank.items?.filter(item => !isMCQItem(item)) || [];
         const newItems = mcqs.map((item: any, idx: number) => ({
           ...item,
           id: crypto.randomUUID(),
           order: otherItems.length + idx,
           type: 'mcq'
         }));

         setBank(prev => ({
           ...prev,
           items: [...otherItems, ...newItems]
         }));
         alert('تم مسح المرجع بنجاح وتوليد باقة جديدة من أسئلة خيار من متعدد!');
       } else {
         alert('لم يتم التمكن من توليد أسئلة خيار من متعدد حالياً. تأكد من توفر نصوص جيدة بالملف.');
       }
    } catch (error) {
       console.error('Failed to rebuild MCQs:', error);
       alert('فشل إعادة توليد أسئلة الاختيار من متعدد.');
    } finally {
       setGenerating(false);
       setCurrentAction(null);
    }
  };

  const expandMCQsAI = async () => {
    if (!selectedDocId) {
       alert('يجب اختيار مرجع لتوليد أسئلة إضافية');
       return;
    }
    setGenerating(true);
    setCurrentAction('expand_mcqs');
    try {
       const doc = availableDocs.find(d => d.id === selectedDocId);
       const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
       if (!pdfContent || !doc) throw new Error('Invalid setup');

       const existingMCQTexts = bank.items?.filter(isMCQItem).map(i => i.question) || [];
       const config = { grade: doc.grade, subject: doc.subject, part: doc.part || '', unit: doc.unit || '' };
       const additional = await generateOnlyMCQs(pdfContent.textContent, config, existingMCQTexts);

       if (additional && additional.length > 0) {
         const newItems = additional.map((item: any, idx: number) => ({
           ...item,
           id: crypto.randomUUID(),
           order: (bank.items?.length || 0) + idx,
           type: 'mcq'
         }));

         setBank(prev => ({
           ...prev,
           items: [...(prev.items || []), ...newItems]
         }));
         alert(`تم المسح الشامل للمرجع وإضافة عدد ${additional.length} من الأسئلة والخيارات الجديدة المتميزة باحتوائها الذكي!`);
       } else {
         alert('لم تتوفر أسئلة إضافية جديدة تتجنب الأسئلة المتوفرة حالياً.');
       }
    } catch (error) {
       console.error('Failed to expand MCQs:', error);
       alert('فشل إضافة وتوليد المزيد من أسئلة خيار من متعدد.');
    } finally {
       setGenerating(false);
       setCurrentAction(null);
    }
  };

  const rebuildEssayAI = async () => {
    if (!selectedDocId) {
       alert('يجب اختيار مرجع لإعادة بناء التمارين والمسائل من جديد');
       return;
    }
    if (!window.confirm('انتبه: هذا الإجراء سيقوم بحذف جميع التمارين والمسائل المقالية الطويلة المتاحة حالياً والبدء بمسح جديد وصاعد للمرجع لتوليد بديل ممتاز عنها. هل تريد المتابعة؟')) {
       return;
    }
    setGenerating(true);
    setCurrentAction('rebuild_essay');
    try {
       const doc = availableDocs.find(d => d.id === selectedDocId);
       const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
       if (!pdfContent || !doc) throw new Error('Invalid setup');

       const config = { grade: doc.grade, subject: doc.subject, part: doc.part || '', unit: doc.unit || '' };
       const essays = await generateOnlyEssayQuestions(pdfContent.textContent, config, []);

       if (essays && essays.length > 0) {
         // Keep only MCQ items
         const otherItems = bank.items?.filter(item => isMCQItem(item)) || [];
         const newItems = essays.map((item: any, idx: number) => ({
           ...item,
           id: crypto.randomUUID(),
           order: otherItems.length + idx,
           type: 'essay'
         }));

         setBank(prev => ({
           ...prev,
           items: [...otherItems, ...newItems]
         }));
         alert('تم مسح المرجع وتوليد باقة جديدة متدرجة الصعوبة لمهارات المسائل والتمارين المقالية الطويلة!');
       } else {
         alert('لم يتم استرجاع مسائل جديدة حالياً.');
       }
    } catch (error) {
       console.error('Failed to rebuild essays:', error);
       alert('فشل إعادة توليد التمارين والمسائل المقالية.');
    } finally {
       setGenerating(false);
       setCurrentAction(null);
    }
  };

  const expandEssayAI = async () => {
    if (!selectedDocId) {
       alert('يجب اختيار مرجع لإضافة تمارين ومسائل مقالية جديدة');
       return;
    }
    setGenerating(true);
    setCurrentAction('expand_essay');
    try {
       const doc = availableDocs.find(d => d.id === selectedDocId);
       const pdfContent = await db.pdfContents.where('docId').equals(selectedDocId).first();
       if (!pdfContent || !doc) throw new Error('Invalid setup');

       const existingEssayTexts = bank.items?.filter(item => !isMCQItem(item)).map(i => i.question) || [];
       const config = { grade: doc.grade, subject: doc.subject, part: doc.part || '', unit: doc.unit || '' };
       const additional = await generateOnlyEssayQuestions(pdfContent.textContent, config, existingEssayTexts);

       if (additional && additional.length > 0) {
         const newItems = additional.map((item: any, idx: number) => ({
           ...item,
           id: crypto.randomUUID(),
           order: (bank.items?.length || 0) + idx,
           type: 'essay'
         }));

         setBank(prev => ({
           ...prev,
           items: [...(prev.items || []), ...newItems]
         }));
         alert(`تم المسح الشامل وإيجاد أفكار غير مغطاة؛ تم إضافة ${additional.length} تمارين ومسائل مقالية جديدة ومعززة ومدروسة بنجاح!`);
       } else {
         alert('لم نجد مسائل جديدة، كافة مفاهيم المرجع مغطاة بمسائل كافية وسليمة.');
       }
    } catch (error) {
       console.error('Failed to expand essays:', error);
       alert('فشل إضافة وتوليد المسائل والتمارين المقالية.');
    } finally {
       setGenerating(false);
       setCurrentAction(null);
    }
  };

  const printBank = () => {
    window.print();
  };

  const exportToWord = () => {
    const titleText = (metaTitle || bank.title || 'بنك تمارين');
    const activeFont = printFont === 'default' ? 'Cairo' : 
                     printFont === 'cairo' ? 'Cairo' :
                     printFont === 'amiri' ? 'Amiri' :
                     printFont === 'tajawal' ? 'Tajawal' :
                     printFont === 'almarai' ? 'Almarai' :
                     printFont === 'al-mithaq' ? 'Al-Mithaq' :
                     printFont === 'scheherazade' ? 'Scheherazade New' :
                     printFont === 'aref' ? 'Aref Ruqaa' :
                     printFont === 'notonaskh' ? 'Noto Naskh Arabic' :
                     printFont === 'reemkufi' ? 'Reem Kufi' : 'Cairo';
                     
    const fontCSS = `font-family: '${activeFont}', 'Cairo', 'Amiri', serif;`;
    
    // Generate clean HTML for MS Word
    let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" 
          xmlns:w="urn:schemas-microsoft-com:office:word" 
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>${titleText}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Almarai&family=Amiri:wght@400;700&family=Cairo:wght@400;700&family=Noto+Naskh+Arabic&family=Scheherazade+New&display=swap');
        @page WordSection1 {
          size: 21.0cm 29.7cm; /* A4 */
          margin: 2.0cm 2.0cm 2.0cm 2.0cm;
          mso-header-margin: 1.0cm;
          mso-footer-margin: 1.0cm;
        }
        div.WordSection1 {
          page: WordSection1;
          direction: rtl;
        }
        body {
          ${fontCSS}
          font-size: 13pt;
          line-height: 1.6;
          color: #1a1a1a;
          direction: rtl;
          text-align: right;
        }
        h1 {
          font-size: 20pt;
          font-weight: bold;
          color: #1a1a1a;
          text-align: center;
          margin-bottom: 5px;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
        }
        h2 {
          font-size: 15pt;
          font-weight: bold;
          color: #111111;
          margin-top: 30px;
          margin-bottom: 15px;
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
        }
        h3 {
          font-size: 13pt;
          font-weight: bold;
          color: #111111;
          margin-top: 20px;
        }
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .meta-table td {
          padding: 8px;
          border: 1px solid #cccccc;
          font-size: 11pt;
          background-color: #f9fafb;
        }
        .summary-box {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-right: 5px solid #4f46e5;
          padding: 15px;
          margin-bottom: 35px;
          border-radius: 8px;
          font-size: 12.5pt;
          text-align: justify;
          line-height: 1.7;
        }
        .question-item {
          margin-bottom: 35px;
          padding-bottom: 25px;
          border-bottom: 1px dashed #cccccc;
          page-break-inside: avoid;
        }
        .question-number {
          font-size: 12pt;
          font-weight: bold;
          color: #111111;
          margin-bottom: 10px;
        }
        .question-text {
          font-size: 14pt;
          font-weight: bold;
          margin-bottom: 15px;
          line-height: 1.7;
        }
        .ai-guidance-box {
          background-color: #fffbeb;
          border: 1px solid #fef3c7;
          border-right: 4px solid #d97706;
          padding: 10px 15px;
          margin: 12px 0;
          font-size: 11pt;
          color: #78350f;
          border-radius: 4px;
        }
        .mcq-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          margin-bottom: 15px;
        }
        .mcq-table td {
          border: 1px solid #000000;
          padding: 10px 15px;
          text-align: right;
          font-size: 12pt;
          vertical-align: middle;
        }
        .mcq-label {
          background-color: #f3f4f6;
          font-weight: bold;
          width: 30px;
          text-align: center;
          color: #000000;
        }
        .essay-list {
          margin-right: 20px;
          margin-top: 10px;
        }
        .essay-item {
          margin-bottom: 8px;
          font-size: 12pt;
        }
        .math-expr {
          font-family: 'Cambria Math', 'Times New Roman', 'Amiri', serif;
          font-style: italic;
          color: #000000;
          direction: ltr;
          unicode-bidi: embed;
        }
        .solution-section {
          page-break-before: always;
        }
        .solution-item {
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid #eaeaea;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="WordSection1">
        <h1>${titleText}</h1>
        
        <table class="meta-table" dir="rtl">
          <tr>
            <td><strong>الصف الدراسي:</strong> ${metaGrade || bank.grade || 'غير محدد'}</td>
            <td><strong>المادة العلمية:</strong> ${metaSubject || bank.subject || 'غير محدد'}</td>
          </tr>
          <tr>
            <td><strong>المحور / الوحدة:</strong> ${metaUnit || bank.unit || 'غير محدد'}</td>
            <td><strong>تاريخ التعديل:</strong> ${new Date().toLocaleDateString('ar-EG')}</td>
          </tr>
        </table>

        <h2>القسم الأول: الملخص الشامل للمرجع (التركيز الامتحاني للوحدة)</h2>
        <div class="summary-box">
  `;

    // Helpers to quickly display cleaner math without markup tags inside Word
    const formatMathForWord = (content: string): string => {
      if (!content) return '';
      let formatted = content;
      formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Replace display math block
      formatted = formatted.replace(/\$\$([^$]+)\$\$/g, '<div style="text-align: center; margin: 10px 0; background-color: #f8fafc; padding: 6px; border-radius: 4px;"><span class="math-expr">$1</span></div>');
      formatted = formatted.replace(/\\\[([^\]]+)\\\]/g, '<div style="text-align: center; margin: 10px 0; background-color: #f8fafc; padding: 6px; border-radius: 4px;"><span class="math-expr">$1</span></div>');
      // Replace inline math block
      formatted = formatted.replace(/\$([^$]+)\$/g, '<span class="math-expr">$1</span>');
      formatted = formatted.replace(/\\\(([^)]+)\\\)/g, '<span class="math-expr">$1</span>');
      // Preserve structured paragraph breaks in word files
      formatted = formatted.replace(/\n/g, '<br/>');
      return formatted;
    };

    const cleanSubpartForWord = (text: string): string => {
      return formatMathForWord(cleanSubpartText(text));
    };

    // Render summary into html first
    const summaryToExport = isCondensed ? (bank.condensedSummaryText || bank.summaryText) : bank.summaryText;
    html += formatMathForWord(summaryToExport || 'لا يوجد ملخص متاح حالياً.');
    html += `
        </div>

        <h2>القسم الثاني: الأسئلة والتمارين والارشادات الذكية</h2>
    `;

    const items = sortedItems;
    items.forEach((item, index) => {
      const qNum = index + 1;
      const isMCQ = isMCQItem(item);
      
      html += `
        <div class="question-item">
          <div class="question-number">التمرين ${qNum} :</div>
          <div class="question-text">${formatMathForWord(item.question)}</div>
      `;

      if (isMCQ && item.subParts && item.subParts.length >= 4) {
        html += `
          <table class="mcq-table" dir="rtl">
            <tr>
              <td class="mcq-label">A</td>
              <td>${formatMathForWord(getCleanOptionText(item.subParts[0]))}</td>
              <td class="mcq-label">B</td>
              <td>${formatMathForWord(getCleanOptionText(item.subParts[1]))}</td>
              <td class="mcq-label">C</td>
              <td>${formatMathForWord(getCleanOptionText(item.subParts[2]))}</td>
              <td class="mcq-label">D</td>
              <td>${formatMathForWord(getCleanOptionText(item.subParts[3]))}</td>
            </tr>
          </table>
        `;
      } else if (item.subParts && item.subParts.length > 0) {
        html += `<div class="essay-list">`;
        item.subParts.forEach((sub, i) => {
          const circled = getCircledNumber(i);
          html += `
            <div class="essay-item">
              <strong>${circled}</strong> &nbsp; ${cleanSubpartForWord(sub)}
            </div>
          `;
        });
        html += `</div>`;
      }

      // Add smart guidance block under the question
      if (item.aiGuidance) {
        html += `
          <div class="ai-guidance-box">
            <strong>💡 إرشاد وتوجيه ذكي للحل:</strong> ${formatMathForWord(item.aiGuidance)}
          </div>
        `;
      }

      html += `</div>`;
    });

    // Solutions box
    html += `
      <div class="solution-section">
        <br clear="all" style="page-break-before:always" />
        <h2>القسم الثالث: الحلول النموذجية للتفوق والتدقيق بالخطوات التفصيلية</h2>
    `;

    items.forEach((item, index) => {
      const qNum = index + 1;
      html += `
        <div class="solution-item">
          <h3>حل التمرين ${qNum}</h3>
          <div style="font-size: 12pt; margin-top: 5px; line-height: 1.6;">
            ${formatMathForWord(item.solution || 'لا يوجد حل تفصيلي متوفر حالياً لهذا التمرين.')}
          </div>
          ${item.aiGuidance ? `
          <div style="background-color: #f1f5f9; border-right: 3px solid #64748b; padding: 6px 12px; margin-top: 10px; font-size: 10.5pt; color: #475569; border-radius: 4px;">
            <strong>توجيه ذكي (أخطاء وحيل مرافقة):</strong> ${formatMathForWord(item.aiGuidance)}
          </div>
          ` : ''}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    </body>
    </html>
    `;

    // Create and trigger download
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${titleText.replace(/\s+/g, '_')}_كامل_للتعديل.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    try {
      const dataToExport = {
        ...bank,
        title: metaTitle || bank.title,
        grade: metaGrade || bank.grade || '',
        subject: metaSubject || bank.subject || '',
        part: metaPart || bank.part || '',
        unit: metaUnit || bank.unit || '',
        docId: selectedDocId || bank.docId || undefined,
        updatedAt: Date.now()
      };
      
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(metaTitle || bank.title || 'question_bank').replace(/\s+/g, '_')}_كاملا.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('حدث خطأ أثناء تصدير بنك الأسئلة كملف JSON.');
    }
  };

  const renderStars = (count: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star 
            key={s} 
            size={14} 
            className={`${s <= count ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`} 
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="animate-spin text-amber-600 mb-4" size={48} />
        <p className="text-gray-500 font-bold">جاري تحميل بنك الأسئلة...</p>
      </div>
    );
  }

  const sortedItems = [...(bank.items || [])].sort((a, b) => {
    if (sortBy === 'stars') {
      return a.difficulty - b.difficulty;
    }
    return a.order - b.order;
  });

  const renderQuestionItem = (item: QuestionBankItem, sIndex: number) => {
     return (
        <motion.div 
          key={item.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`bg-white rounded-2xl border ${editingItemId === item.id ? 'border-amber-400 ring-4 ring-amber-50 shadow-2xl' : 'border-gray-200 shadow-sm'} overflow-hidden relative group`}
        >
          {/* Question Header: Level & Actions */}
          <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 bg-white border-2 border-amber-300 rounded-lg flex items-center justify-center font-extrabold text-amber-600 shadow-sm text-sm">
                {sIndex}
              </span>
              <div className="flex flex-col text-right">
                {editingItemId === item.id ? (
                  <input 
                    type="text"
                    className="text-xs font-bold bg-white border border-gray-200 rounded px-2 py-0.5"
                    value={tempItem?.topic}
                    onChange={(e) => setTempItem({...tempItem!, topic: e.target.value})}
                  />
                ) : (
                  <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">{item.topic}</span>
                )}
                <div className="flex items-center gap-2">
                  {renderStars(item.difficulty)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editingItemId === item.id ? (
                <>
                  <button onClick={saveEdit} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"><Check size={18}/></button>
                  <button onClick={() => setEditingItemId(null)} className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"><X size={18}/></button>
                </>
              ) : (
                <>
                  <button onClick={() => startEditing(item)} className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Edit2 size={16}/></button>
                  <button onClick={() => setConfirmDeleteItem(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                </>
              )}
            </div>
          </div>

          {/* Question Body */}
          <div className="p-6 flex flex-col md:flex-row gap-6">
            <div className="flex-grow order-1 md:order-1">
              {editingItemId === item.id ? (
                <div className="space-y-6 text-right" dir="rtl">
                  <SmartMathEditor 
                    className="w-full"
                    value={tempItem?.question || ''}
                    onChange={(val) => setTempItem({...tempItem!, question: val})}
                    placeholder="نص السؤال..."
                    label="نص السؤال الرئيسي"
                  />
                  
                  <div className="space-y-2">
                     <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">كود الرسم (SVG) للسؤال:</label>
                     <textarea 
                       className="w-full h-32 p-3 font-mono text-xs bg-gray-900 text-emerald-400 rounded-xl"
                       value={tempItem?.svgCode || ''}
                       onChange={(e) => setTempItem({...tempItem!, svgCode: e.target.value})}
                       dir="ltr"
                       placeholder="<svg ...>...</svg>"
                     />
                     {tempItem?.svgCode && (
                        <div className="p-4 bg-white border border-gray-200 rounded-xl flex justify-center">
                           <div className="w-32 h-32 overflow-hidden flex items-center justify-center [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: tempItem.svgCode }} />
                        </div>
                     )}
                  </div>

                  <SmartMathEditor 
                    className="w-full"
                    value={tempItem?.solution || ''}
                    onChange={(val) => setTempItem({...tempItem!, solution: val})}
                    placeholder="خطوات الحل..."
                    label="الحل النموذجي"
                  />

                  <div className="space-y-2">
                     <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">كود الرسم (SVG) للحل:</label>
                     <textarea 
                       className="w-full h-32 p-3 font-mono text-xs bg-gray-900 text-indigo-400 rounded-xl"
                       value={tempItem?.solutionSvgCode || ''}
                       onChange={(e) => setTempItem({...tempItem!, solutionSvgCode: e.target.value})}
                       dir="ltr"
                       placeholder="<svg ...>...</svg>"
                     />
                     {tempItem?.solutionSvgCode && (
                        <div className="p-4 bg-white border border-gray-200 rounded-xl flex justify-center">
                           <div className="w-32 h-32 overflow-hidden flex items-center justify-center [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: tempItem.solutionSvgCode }} />
                        </div>
                     )}
                  </div>
                </div>
              ) : (
                <div className="text-lg font-extrabold text-gray-800 leading-relaxed mb-6 text-right font-sans" dir="rtl">
                  <MathRenderer content={item.question} />
                </div>
              )}

              {/* Subparts */}
              <div className="mr-2 mb-6 text-right" dir="rtl">
                {editingItemId === item.id ? (
                  <div className="space-y-3">
                    {tempItem?.subParts?.map((sub, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="text-amber-600 font-bold mt-1">{getCircledNumber(i)}</span>
                        <div className="flex-1 flex gap-2">
                          <SmartMathEditor 
                            className="flex-1"
                            value={sub}
                            onChange={(val) => {
                              const newSubParts = [...(tempItem?.subParts || [])];
                              newSubParts[i] = val;
                              setTempItem({ ...tempItem!, subParts: newSubParts });
                            }}
                            placeholder="نص الطلب أو الخيار..."
                          />
                          <button 
                            onClick={() => {
                              const newSubParts = [...(tempItem?.subParts || [])];
                              newSubParts.splice(i, 1);
                              setTempItem({ ...tempItem!, subParts: newSubParts });
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg h-10 mt-1"
                            title="حذف هذا البند"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => {
                        const newSubParts = [...(tempItem?.subParts || []), "بند جديد"];
                        setTempItem({ ...tempItem!, subParts: newSubParts });
                      }}
                      className="mr-8 mt-2 flex items-center gap-1 text-amber-700 font-bold text-sm hover:text-amber-800"
                    >
                      <PlusCircle size={14} />
                      إضافة خيار أو طلب جديد
                    </button>
                  </div>
                ) : isMCQItem(item) ? (
                  /* MCQ 8-column Table */
                  <div className="overflow-x-auto my-4 no-print w-full max-w-4xl bg-white border border-gray-200 rounded-xl shadow-sm text-sm" dir="rtl">
                    <table className="w-full border-collapse text-center table-auto min-w-[700px] border-spacing-0">
                      <tbody>
                        <tr className="divide-x divide-x-reverse divide-gray-200">
                          <td className="bg-[#e0e7ff] text-indigo-950 font-black px-3 py-3 w-12 text-center select-none align-middle shadow-sm">A</td>
                          <td className="px-4 py-3 font-semibold text-right text-gray-800 bg-white align-middle whitespace-normal break-words leading-relaxed min-w-[140px]"><MathRenderer content={getCleanOptionText(item.subParts![0])} /></td>
                          
                          <td className="bg-[#e0e7ff] text-indigo-950 font-black px-3 py-3 w-12 text-center select-none align-middle shadow-sm">B</td>
                          <td className="px-4 py-3 font-semibold text-right text-gray-800 bg-white align-middle whitespace-normal break-words leading-relaxed min-w-[140px]"><MathRenderer content={getCleanOptionText(item.subParts![1])} /></td>
                          
                          <td className="bg-[#e0e7ff] text-indigo-950 font-black px-3 py-3 w-12 text-center select-none align-middle shadow-sm">C</td>
                          <td className="px-4 py-3 font-semibold text-right text-gray-800 bg-white align-middle whitespace-normal break-words leading-relaxed min-w-[140px]"><MathRenderer content={getCleanOptionText(item.subParts![2])} /></td>
                          
                          <td className="bg-[#e0e7ff] text-indigo-950 font-black px-3 py-3 w-12 text-center select-none align-middle shadow-sm">D</td>
                          <td className="px-4 py-3 font-semibold text-right text-gray-800 bg-white align-middle whitespace-normal break-words leading-relaxed min-w-[140px]"><MathRenderer content={getCleanOptionText(item.subParts![3])} /></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {item.subParts?.map((sub, i) => (
                      <div key={i} className="flex gap-3 items-start pr-2 group/sub relative">
                        <span className="text-indigo-600 font-bold mt-1 text-sm">{getCircledNumber(i)}</span>
                        <div className="text-gray-700 font-semibold text-sm flex-grow">
                          <MathRenderer content={cleanSubpartText(sub)} />
                        </div>
                        <button
                          onClick={() => {
                            if (window.confirm('هل أنت متأكد من رغبتك في حذف هذا الطلب فقط؟')) {
                              const newSubParts = item.subParts?.filter((_, idx) => idx !== i) || [];
                              setBank(prev => ({
                                ...prev,
                                items: prev.items?.map(bankItem => bankItem.id === item.id ? { ...bankItem, subParts: newSubParts, type: bankItem.type || 'essay' } : bankItem) || []
                              }));
                            }
                          }}
                          className="mr-2 p-1 text-gray-400 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover/sub:opacity-100 no-print flex-shrink-0"
                          title="حذف هذا الطلب فقط"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Question Toolbar */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 no-print flex-wrap">
                <button 
                  onClick={() => setShowSolution(prev => ({...prev, [item.id]: !prev[item.id]}))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showSolution[item.id] ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                >
                  <Check size={16} />
                  {showSolution[item.id] ? 'إخفاء الحل' : 'عرض الحل التفصيلي'}
                </button>
                <button 
                  onClick={() => setShowGuidance(prev => ({...prev, [item.id]: !prev[item.id]}))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showGuidance[item.id] ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                >
                  <Lightbulb size={16} />
                  {showGuidance[item.id] ? 'إخفاء الإرشادات' : 'إرشادات ذكية'}
                </button>
                <button 
                  onClick={() => {
                    generateAIGuidance(item.id);
                    setShowGuidance(prev => ({...prev, [item.id]: true}));
                  }}
                  disabled={generating}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    currentAction === `guidance_${item.id}` 
                    ? 'bg-amber-600 text-white animate-pulse' 
                    : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 disabled:opacity-50'
                  }`}
                  title="إنشاء أو إعادة توليد الإرشادات والمنبهات التعليمية بالكامل بالذكاء الاصطناعي لهذا السؤال"
                >
                  {currentAction === `guidance_${item.id}` ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} className="text-amber-500" />
                  )}
                  توليد إرشاد ذكي AI ✨
                </button>
                {!item.svgCode && (
                  <button 
                    onClick={() => generateSvgForItem(item.id)}
                    disabled={generating}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      currentAction === `generate_svg_${item.id}` 
                      ? 'bg-blue-600 text-white animate-pulse' 
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-50'
                    }`}
                  >
                    {currentAction === `generate_svg_${item.id}` ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ImageIcon size={16} />
                    )}
                    توليد رسم توضيحي
                  </button>
                )}
                <button 
                  onClick={() => startAIReview(item)}
                  disabled={generating}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    currentAction === `review_${item.id}` 
                    ? 'bg-purple-600 text-white animate-pulse' 
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50'
                  }`}
                >
                  {currentAction === `review_${item.id}` ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ClipboardCheck size={16} />
                  )}
                  تدقيق وتصحيح AI
                </button>
              </div>

              {/* AI Review Inline Card */}
              <AnimatePresence>
                {reviewingItemId === item.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden no-print"
                  >
                    <div className="mt-4 p-5 bg-purple-50/50 border-2 border-purple-200 rounded-xl text-right" dir="rtl">
                      {isReviewing ? (
                        <div className="flex items-center gap-3 text-purple-700 font-bold p-2 justify-center">
                          <Loader2 size={20} className="animate-spin" />
                          <span>جاري قيام الذكاء الاصطناعي بتدقيق السؤال وصياغة الرياضيات ومقاطعتها مع المرجع...</span>
                        </div>
                      ) : reviewReport ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b pb-3">
                            <span className="text-sm font-bold text-gray-500">نتيجة التدقيق الذكي</span>
                            <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold ${reviewReport.status === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              {reviewReport.status === 'correct' ? '✅ السؤال دقيق علمياً ومطابق' : '⚠️ تتوفر توصيات تصحيح'}
                            </span>
                          </div>
                          
                          <div className="prose prose-purple max-w-none text-sm text-gray-700 leading-relaxed font-semibold">
                            <MathRenderer content={reviewReport.analysis} />
                          </div>

                          {reviewReport.status === 'needs_fixes' && reviewReport.suggestedFix && (
                            <div className="border-t pt-4 flex justify-end">
                              <button
                                onClick={applyReviewedFixes}
                                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-extrabold rounded-lg hover:bg-purple-700 transition shadow-sm text-sm"
                              >
                                تطبيق التعديلات المقترحة فوراً ✨
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showGuidance[item.id] && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 bg-amber-50 rounded-xl p-5 border border-amber-100 select-none text-right" dir="rtl">
                      <div className="flex gap-3">
                        <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                        <div>
                          <h4 className="font-bold text-sm mb-1 uppercase tracking-wider text-[#78350f]">إرشاد تعليمي من AI للتنبيه من الفخاخ:</h4>
                          <MathRenderer content={item.aiGuidance || 'انتبه لربط المفاهيم واستخدم القوانين الرياضية المناسبة.'} className="text-sm font-bold text-amber-900" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {showSolution[item.id] && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 bg-indigo-50/50 rounded-xl p-6 border border-indigo-100 text-right" dir="rtl">
                       <div className="flex items-center gap-2 mb-4 text-indigo-700">
                         <Save size={18} />
                         <h4 className="text-sm font-extrabold uppercase tracking-widest">خطوات الحل النموذجي:</h4>
                       </div>
                       <MathRenderer content={item.solution} className="text-gray-800 leading-relaxed text-sm font-semibold prose-p:mb-4" />
                        {item.solutionSvgCode && (
                          <div className="mt-4 p-4 bg-white rounded-lg border border-indigo-100 flex justify-center overflow-auto max-h-[400px]">
                            <div dangerouslySetInnerHTML={{ __html: item.solutionSvgCode }} className="w-full h-auto max-w-full" />
                          </div>
                        )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* SVG Illustration (Left/Side in RTL) */}
            {item.svgCode && editingItemId !== item.id && (
              <div className="w-full md:w-1/3 flex-shrink-0 bg-gray-50 rounded-xl p-4 flex items-center justify-center border border-dashed border-gray-200 relative order-2 md:order-2">
                 <div dangerouslySetInnerHTML={{ __html: item.svgCode }} className="w-full h-auto max-h-[300px]" />
                 <button 
                   onClick={() => generateSvgForItem(item.id)}
                   className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-amber-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                   <RotateCcw size={14} />
                 </button>
              </div>
            )}
          </div>
        </motion.div>
     );
  };

  return (
    <>
      {/* Standardized Unified Academic Metadata Modal */}
      <DocumentMetadataModal
        isOpen={isMetadataModalOpen}
        onClose={() => setIsMetadataModalOpen(false)}
        document={{
          id: bank.id || bankId,
          title: metaTitle || bank.title || '',
          country: metaCountry || bank.country || DEFAULT_COUNTRY,
          grade: metaGrade || bank.grade || DEFAULT_GRADE,
          subject: metaSubject || bank.subject || DEFAULT_SUBJECT,
          part: metaPart || bank.part || '',
          unit: metaUnit || bank.unit || '',
          topic: metaTopic || bank.topic || '',
          seriesName: metaSeriesName || bank.seriesName || DEFAULT_SERIES_NAME,
          teacherName: metaTeacherName || bank.teacherName || DEFAULT_TEACHER_NAME,
          teacherRole: metaTeacherRole || bank.teacherRole || DEFAULT_TEACHER_ROLE
        }}
        onSave={handleSaveMetadataFromModal}
      />

      <div className="max-w-6xl mx-auto px-4 pb-20 no-print">
      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDeleteItem}
        onClose={() => setConfirmDeleteItem(null)}
        onConfirm={() => confirmDeleteItem && deleteItem(confirmDeleteItem)}
        title="حذف هذا التمرين؟"
        message="هل أنت متأكد من حذف هذا السؤال من بنك الأسئلة؟ سنقوم بإزالته من القائمة الحالية."
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
          >
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? 'إنشاء بنك أسئلة تدريبية' : (metaTitle || bank.title || 'بنك أسئلة')}
            </h1>
            <p className="text-sm text-gray-500 font-medium">نظام التوليد الذكي ومتدرج الصعوبة</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMetadataModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-bold hover:bg-amber-100 transition-all shadow-sm"
            title="تعديل بيانات وترويسة بنك الأسئلة بالكامل"
          >
            <Edit2 size={18} />
            تعديل الترويسة والبيانات
          </button>
          <button
            onClick={exportToWord}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg font-bold hover:bg-blue-100 transition-all shadow-sm"
            title="تصدير بنك الأسئلة بالكامل والحلول كملف MS Word قابل للتعديل المباشر"
          >
            <FileText size={18} />
            تصدير لـ Word
          </button>
          <button
            onClick={exportToJSON}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 transition-all shadow-sm"
            title="تصدير بنك الأسئلة كاملاً كملف JSON لفتحه على أي جهاز آخر دون أي نقص"
          >
            <Download size={18} />
            تصدير JSON كامل
          </button>
          <button
            onClick={() => setShowInjectTestQuestionsModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-bold transition-all shadow-sm"
            title="حقن أسئلة (اختيار من متعدد ومقالية مع الحلول) مباشرة من اختبارات سابقة في هذه المنصة"
          >
            <PlusCircle size={18} />
            حقن من الاختبارات 📥
          </button>
          <button
            onClick={printBank}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-50 transition-all shadow-sm"
          >
            <Printer size={18} />
            طباعة
          </button>
          <button
            onClick={handleSave}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50"
          >
            <Save size={18} />
            حفظ البنك
          </button>
        </div>
      </div>

      {/* File Configuration, Printing, & JSON Tools Card */}
      {bank.items && bank.items.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50/50 to-indigo-50/40 border border-amber-100 rounded-2xl p-6 mb-8 text-right" dir="rtl">
          <h3 className="text-md font-extrabold text-indigo-950 mb-4 flex items-center gap-2">
            <BookOpen className="text-amber-600" size={18} />
            خصائص بنك الأسئلة والطباعة والتصدير
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Section 1: Metadata Fields (Class, Subject, Title) - Column span 7 */}
            <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2 mb-2">
                <span className="font-bold text-sm text-indigo-950">بيانات وتصنيف الملف الأكاديمية</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsMetadataModalOpen(true)}
                    className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1 transition-colors"
                  >
                    <Edit2 size={13} />
                    نافذة التعديل الشاملة
                  </button>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded">حفظ تلقائي</span>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">اسم بنك الأسئلة:</label>
                  <input
                    type="text"
                    value={metaTitle || bank.title || ''}
                    onChange={(e) => handleMetaChange('title', e.target.value)}
                    placeholder="مثال: مراجعة هندسة الدائرة"
                    className="w-full text-xs font-bold p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none transition-all"
                  />
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <AcademicMetadataFields
                    metadata={{
                      country: metaCountry,
                      grade: metaGrade,
                      subject: metaSubject,
                      part: metaPart,
                      unit: metaUnit,
                      topic: metaTopic
                    }}
                    showTopic={true}
                    onChange={(updated) => {
                      setMetaCountry(updated.country);
                      setMetaGrade(updated.grade);
                      setMetaSubject(updated.subject);
                      setMetaPart(updated.part || '');
                      setMetaUnit(updated.unit || '');
                      setMetaTopic(updated.topic || '');
                      setBank(prev => ({
                        ...prev,
                        country: updated.country,
                        grade: updated.grade,
                        subject: updated.subject,
                        part: updated.part,
                        unit: updated.unit,
                        topic: updated.topic
                      }));
                    }}
                    layout="grid"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Print Settings & PDF Customization - Column span 5 */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Customize print layout card */}
              <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4 flex-1">
                <span className="block font-bold text-sm text-indigo-950 border-b pb-2 mb-2">تخصيص الخروج للطباعة (PDF)</span>
                
                <div className="space-y-3">
                  {/* Print layout selection (1 vs 2 columns) */}
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-gray-500">تخطيط طباعة بنك الأسئلة:</span>
                    <select
                      value={printColumns}
                      onChange={(e) => setPrintColumns(parseInt(e.target.value) as 1 | 2)}
                      className="p-1 px-2 border border-gray-200 rounded hover:border-indigo-400 outline-none transition-all text-xs font-bold"
                    >
                      <option value={1}>عمود واحد (افتراضي)</option>
                      <option value={2}>عمودان متوازيان (يمين ثم يسار)</option>
                    </select>
                  </div>

                  {/* Print font selection */}
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-gray-500">نوع خط الجمل ونصوص البنك:</span>
                    <select
                      value={printFont}
                      onChange={(e) => setPrintFont(e.target.value as any)}
                      className="p-1 px-2 border border-gray-200 rounded hover:border-indigo-400 outline-none transition-all text-xs font-bold"
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

                  {/* Print font size selection */}
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-gray-500">حجم خط الطباعة (نقاط):</span>
                    <select
                      value={printFontSize}
                      onChange={(e) => setPrintFontSize(parseInt(e.target.value))}
                      className="p-1 px-2 border border-gray-200 rounded hover:border-indigo-400 outline-none transition-all text-xs font-bold"
                    >
                      <option value={10}>10pt</option>
                      <option value={11}>11pt</option>
                      <option value={12}>12pt</option>
                      <option value={13}>13pt (الافتراضي)</option>
                      <option value={14}>14pt</option>
                      <option value={15}>15pt</option>
                    </select>
                  </div>

                  {/* Print custom coverage selection */}
                  <div className="flex items-center justify-between text-xs font-bold bg-emerald-50/20 p-1.5 rounded border border-emerald-100">
                    <span className="text-emerald-800">نطاق وتغطية الطباعة:</span>
                    <select
                      value={printScope}
                      onChange={(e) => setPrintScope(e.target.value as 'all' | 'summary_only' | 'questions_only')}
                      className="p-1 px-2 border border-emerald-200 rounded hover:border-emerald-400 outline-none transition-all text-xs font-bold text-emerald-800 bg-emerald-50"
                    >
                      <option value="all">طباعة كاملة وبها الملخص والتمارين</option>
                      <option value="summary_only">القسم الأول فقط (الملخص الشامل)</option>
                      <option value="questions_only">التمارين فقط (دون الملخص)</option>
                    </select>
                  </div>

                  {/* Print mode preference selection */}
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-gray-500">محتوى الأسئلة المطبوعة:</span>
                    <select
                      value={printMode}
                      onChange={(e) => setPrintMode(e.target.value as 'questions_only' | 'questions_and_solutions')}
                      className="p-1 px-2 border border-gray-200 rounded hover:border-indigo-400 outline-none transition-all text-xs font-bold text-indigo-700 bg-indigo-50/50"
                    >
                      <option value="questions_only">طباعة الأسئلة فقط</option>
                      <option value="questions_and_solutions">طباعة الأسئلة مع الحل التفصيلي والإرشادات الذكية</option>
                    </select>
                  </div>

                  {printMode === 'questions_and_solutions' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-center justify-between text-xs font-bold border-t pt-2 mt-1"
                    >
                      <span className="text-gray-500">طباعة فقرة "إرشاد تعليمي ذكي":</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={printGuidance}
                          onChange={(e) => setPrintGuidance(e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-bold text-gray-700 select-none">تفعيل الطباعة</span>
                      </label>
                    </motion.div>
                  )}

                  {/* Watermark checkbox and options */}
                  <div className="border-t pt-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={useWatermark} 
                        onChange={(e) => setUseWatermark(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" 
                      />
                      <span className="text-xs font-bold text-gray-700 select-none">تفعيل العلامة المائية للطباعة</span>
                    </label>

                    {useWatermark && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-3 gap-2 mt-1.5"
                      >
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            placeholder="نص العلامة المائية"
                            className="w-full text-[11px] p-1.5 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-400 outline-none font-bold"
                          />
                        </div>
                        <div>
                          <select
                            value={watermarkRepeats}
                            onChange={(e) => setWatermarkRepeats(parseInt(e.target.value))}
                            className="w-full text-[11px] p-1.5 border border-gray-200 rounded outline-none font-bold"
                          >
                            <option value={1}>تكرار 1</option>
                            <option value={2}>تكرار 2</option>
                            <option value={3}>تكرار 3</option>
                          </select>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Export to Word Quick-button */}
                  <div className="border-t pt-3 mt-1 space-y-2">
                    <button
                      onClick={exportToWord}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 font-extrabold hover:bg-blue-700 text-white rounded-lg transition-all text-xs shadow-md shadow-blue-600/10"
                    >
                      <FileText size={14} />
                      تصدير بنك الأسئلة بالكامل لـ Word (.doc)
                    </button>
                    <button
                      onClick={exportToJSON}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 font-extrabold hover:bg-indigo-700 text-white rounded-lg transition-all text-xs shadow-md shadow-indigo-600/10"
                    >
                      <Download size={14} />
                      تصدير بنك الأسئلة بالكامل كـ JSON للكمبيوتر
                    </button>
                    <p className="text-[10px] text-gray-400 font-bold mt-1.5 text-center leading-relaxed">
                      * يتيح لك التصدير لـ Word التعديل الكامل والحر على الأسئلة وإعداد حلول نموذجية متطابقة مع التنسيق المدرسي.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sorting Control */}
      {bank.items && bank.items.length > 0 && (
        <div className="flex justify-end mb-6">
          <div className="bg-gray-100 p-1.5 rounded-xl flex gap-1 font-bold text-xs shadow-inner" dir="rtl">
             <button 
              onClick={() => setSortBy('order')}
              className={`px-4 py-2 rounded-lg transition-all ${sortBy === 'order' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
             >
                الترتيب حسب المرجع 📖
             </button>
             <button 
              onClick={() => setSortBy('stars')}
              className={`px-4 py-2 rounded-lg transition-all ${sortBy === 'stars' ? 'bg-white shadow-sm text-amber-700' : 'text-gray-500 hover:text-gray-700'}`}
             >
                حسب الصعوبة (الأسهل أولاً) 🌟
             </button>
          </div>
        </div>
      )}

      {/* Setup Form (Only if new or explicitly requested) */}
      {(isNew || !bank.items?.length) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-8 border border-amber-100 shadow-xl shadow-amber-500/5 mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <Sparkles className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">إعدادات التوليد الذكي</h2>
              <p className="text-sm text-gray-500">اختر الوحدة لبناء بنك أسئلة شامل</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-right" dir="rtl">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">عنوان البنك</label>
              <input
                type="text"
                placeholder="مثال: بنك أسئلة مراجعة الوحدة الأولى - هندسة"
                value={bank.title}
                onChange={(e) => setBank({ ...bank, title: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-medium"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2">
                <BookOpen size={18} className="text-amber-600" />
                المراجع (نطاق المحتوى المحلل)
              </label>
              <p className="text-xs text-gray-500 mb-3">اختر ملف الـ PDF الذي سيعتمد عليه الذكاء الاصطناعي لبناء بنك الأسئلة الشامل.</p>
              {availableDocs.length === 0 ? (
                <div className="p-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-center">
                  <p className="text-gray-500 font-bold">لا يوجد مراجع مرفوعة حالياً. يرجى رفع ملفات PDF أولاً من القائمة الرئيسية.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                  {availableDocs.map(doc => (
                    <div 
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id!)}
                      className={`cursor-pointer flex items-start gap-3 p-3 rounded-xl border-2 transition-all relative ${
                        selectedDocId === doc.id 
                        ? 'border-amber-500 bg-amber-50 shadow-md ring-2 ring-amber-100' 
                        : 'border-gray-200 bg-white hover:border-amber-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="mt-1">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedDocId === doc.id ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-300'}`}>
                          {selectedDocId === doc.id && <Check size={10} strokeWidth={4} />}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-bold text-sm text-gray-900 line-clamp-1">{doc.title}</span>
                        <span className="text-[10px] text-gray-500 mt-1">{doc.grade} - {doc.subject}</span>
                        {doc.unit && <span className="text-[10px] font-bold text-amber-700 mt-0.5 line-clamp-1">{doc.unit}</span>}
                        {doc.topic && <span className="text-[10px] font-semibold text-gray-400 mt-0.5 line-clamp-1">{doc.topic}</span>}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDocId(doc.id!);
                            loadRefText(doc.id!);
                            setShowRefPreview(true);
                          }}
                          className="mt-2 text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Maximize2 size={10} />
                          معاينة محتوى المرجع المستخرج
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !selectedDocId}
            className="w-full flex items-center justify-center gap-3 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-extrabold text-lg transition-all shadow-lg shadow-amber-600/20 disabled:opacity-50 disabled:shadow-none translate-y-0 active:translate-y-1"
          >
            {generating ? (
              <>
                <Loader2 className="animate-spin" />
                جاري تحليل المنهج وتوليد الأسئلة...
              </>
            ) : (
              <>
                <Sparkles size={24} />
                توليد بنك الأسئلة التدريبية الآن
              </>
            )}
          </button>
        </motion.div>
      )}

      {/* Dynamic print/screen font style overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Tajawal:wght@400;500;700;800;900&family=Almarai:wght@300;400;700;800&family=Cairo:wght@400;500;600;700;800;900&display=swap');
        
        @font-face {
          font-family: 'Al-Mithaq';
          src: local('Al-Mithaq'), local('Al Mithaq'), local('Mithaq'), local('Mithaq Regular'), local('Al-Mithaq Regular'), local('Al_Mithaq');
        }

        @media print {
          .print-area-custom-font, .print-area-custom-font *:not(.katex):not(.katex *) {
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
        }
        .screen-area-custom-font, .screen-area-custom-font *:not(.katex):not(.katex *) {
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
      `}} />

      {/* Bank Content */}
      <div className="space-y-12 relative overflow-hidden screen-area-custom-font">
        {useWatermark && watermarkText && bank.items && bank.items.length > 0 && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none opacity-[0.02] flex flex-col justify-around items-center rotate-[-30deg] p-12 no-print" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {Array.from({ length: watermarkRepeats }).map((_, idx) => (
              <div key={idx} className="text-3xl md:text-5xl font-black text-black select-none whitespace-nowrap">{watermarkText}</div>
            ))}
          </div>
        )}

        {/* ========================================================== */}
        {/* القسم الأول: الملخص الشامل للمرجع والتركيز الامتحاني */}
        {/* ========================================================== */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 md:p-8 space-y-6 no-print">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5 text-right" dir="rtl">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="text-indigo-600 flex-shrink-0" size={28} />
              <div>
                <h3 className="text-xl font-black text-gray-900 leading-tight">القسم الأول: الملخص الشامل للمرجع (التركيز الامتحاني للوحدة)</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">توليد ملخص مراجعة مركز، شامل للتعاريف والقوانين المهمة للوحدة لتبسيط المذاكرة</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTempSummaryText(bank.summaryText || '');
                  setIsEditingSummary(true);
                }}
                disabled={generating || isEditingSummary}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 font-extrabold rounded-xl text-xs hover:bg-slate-200 transition-all disabled:opacity-50 h-10"
              >
                <Edit2 size={14} />
                تعديل يدوي
              </button>
              <button
                onClick={rebuildSummaryAI}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all h-10 ${
                  currentAction === 'rebuild_summary' 
                  ? 'bg-amber-600 text-white animate-pulse' 
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50'
                }`}
              >
                {currentAction === 'rebuild_summary' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                مسح جديد
              </button>
              <button
                onClick={() => setShowExpandPromptModal(true)}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all h-10 ${
                  currentAction === 'expand_summary' 
                  ? 'bg-indigo-600 text-white animate-pulse' 
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50'
                }`}
              >
                {currentAction === 'expand_summary' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                إضافة (توسيع الملخص)
              </button>
              <button
                onClick={() => {
                  if (isCondensed) {
                    setIsCondensed(false);
                  } else {
                    condenseSummaryAI();
                  }
                }}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all h-10 ${
                  isCondensed 
                    ? 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 shadow-sm' 
                    : condensing 
                    ? 'bg-amber-600 text-white animate-pulse shadow-sm shadow-amber-300'
                    : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 shadow-sm'
                }`}
                title="تقليص محتوى الملخص وتكثيفه بحيث تزال الشروحات المطولة ويبقى الجوهر والقوانين مع الإشارة فقط للأمثلة"
              >
                {condensing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isCondensed ? (
                  <Maximize2 size={14} />
                ) : (
                  <Minimize2 size={14} />
                )}
                {isCondensed ? 'إلغاء التقليص (عرض الكامل)' : 'تقليص الملخص (امتحاني مكثف) ⚡'}
              </button>

              {isCondensed && (
                <button
                  onClick={() => condenseSummaryAI(true)}
                  disabled={generating}
                  className="p-2 text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all h-10 w-10 flex items-center justify-center border border-rose-200"
                  title="إعادة توليد وتحديث الملخص المقلص"
                >
                  <RotateCcw size={14} />
                </button>
              )}

              <button
                onClick={auditReviewTableAI}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all h-10 ${
                  currentAction === 'audit_table' 
                  ? 'bg-violet-600 text-white animate-pulse' 
                  : 'bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50'
                }`}
                title="إعادة تدقيق جدول المراجعة من المرجع بالكامل مع تدقيق أرقام الصفحات ومنع تكرار نفس الأفكار وإضافة خانة فرعية للطلبات الهامة"
              >
                {currentAction === 'audit_table' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ClipboardCheck size={14} className="text-violet-600" />
                )}
                تدقيق جدول المراجعة 🔍
              </button>
            </div>
          </div>

          {/* المرجع المعتمد للمسح والتلخيص */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-right no-print" dir="rtl">
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen size={16} className="text-indigo-600" />
              <span className="text-xs font-black text-gray-700">المرجع النشط المربوط بهذا البنك:</span>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                {availableDocs.find(d => d.id === selectedDocId)?.title || "غير محدد حالياً (يرجى اختيار مرجع أدناه)"}
              </span>
            </div>
            {availableDocs.length > 0 && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-extrabold text-slate-500 whitespace-nowrap">تغيير المرجع:</span>
                <select
                  value={selectedDocId || ''}
                  onChange={async (e) => {
                    const newId = Number(e.target.value);
                    setSelectedDocId(newId);
                    await loadRefText(newId);
                    // Update bank metadata too
                    const selectedDoc = availableDocs.find(d => d.id === newId);
                    if (selectedDoc) {
                      setBank(prev => ({
                        ...prev,
                        docId: newId,
                        grade: selectedDoc.grade || prev.grade,
                        subject: selectedDoc.subject || prev.subject,
                        part: selectedDoc.part || prev.part,
                        unit: selectedDoc.unit || prev.unit
                      }));
                    }
                  }}
                  className="px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- اختر مرجعاً --</option>
                  {availableDocs.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.title} ({doc.grade} - {doc.subject})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {isEditingSummary ? (
            <div className="space-y-4 text-right bg-slate-50 border border-slate-200 rounded-2xl p-6" dir="rtl">
              <h4 className="text-sm font-black text-slate-800">تعديل الملخص يدوياً (يدعم معادلات LaTeX والماركداون):</h4>
              <textarea
                value={tempSummaryText}
                onChange={(e) => setTempSummaryText(e.target.value)}
                className="w-full min-h-[350px] p-4 bg-white border border-slate-300 rounded-xl text-sm font-sans text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setBank(prev => ({ ...prev, summaryText: tempSummaryText }));
                    setIsEditingSummary(false);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all h-10"
                >
                  حفظ المتغيرات
                </button>
                <button
                  onClick={() => setIsEditingSummary(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-black rounded-xl hover:bg-slate-300 transition-all h-10"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : bank.summaryText ? (
            <div className="space-y-4">
              {/* لوحة الألوان لتلوين خلفية الملخص لتلائم المحتوى */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-250/50 p-3 rounded-2xl text-right no-print">
                <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 md:mr-1">
                  <Sparkles size={14} className="text-amber-500 animate-pulse" />
                  تصميم ولون خلفية لوحة الملخص (اختر اللون الأنسب لمحتوى المنهج والفرع الدراسي):
                </span>
                <div className="flex flex-wrap gap-2 justify-end">
                  {(Object.keys(THEMES) as Array<keyof typeof THEMES>).map((tKey) => {
                    const theme = THEMES[tKey];
                    const isActive = summaryTheme === tKey;
                    return (
                      <button
                        key={tKey}
                        onClick={() => setSummaryTheme(tKey)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 border z-10 ${
                          isActive
                            ? `${theme.badge} border-slate-400 ring-2 ring-slate-200`
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${theme.dot}`} />
                        {tKey === 'indigo' ? 'ليلكي (تحليل)' : tKey === 'emerald' ? 'زمردي (هندسة)' : tKey === 'amber' ? 'عسلي (جبر)' : tKey === 'rose' ? 'وردي (مذاكرات)' : 'كلاسيكي'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`${THEMES[summaryTheme].bg} ${THEMES[summaryTheme].border} rounded-3xl border-2 p-6 md:p-8 relative overflow-hidden text-right leading-relaxed shadow-sm`}
                dir="rtl"
              >
                {/* Decorative math styling background elements */}
                <div className={`absolute top-0 left-0 text-[10rem] font-sans font-black select-none pointer-events-none opacity-[0.035] leading-none -translate-x-12 -translate-y-12 ${THEMES[summaryTheme].accent}`}>
                  f(x)
                </div>
                <div className={`absolute bottom-0 right-0 text-[10rem] font-sans font-black select-none pointer-events-none opacity-[0.035] leading-none translate-x-12 translate-y-12 ${THEMES[summaryTheme].accent}`}>
                  &Sigma;
                </div>

                <div className="text-gray-800 text-sm prose max-w-none font-medium leading-relaxed relative z-10">
                  {isCondensed && (
                    <div className="mb-4 p-3 bg-teal-50/80 border border-teal-200 text-teal-900 rounded-xl flex items-center gap-2 text-xs font-bold no-print" dir="rtl">
                      <span className="w-2 h-2 rounded-full bg-teal-600 animate-ping flex-shrink-0" />
                      <span>⚡ أنت تستعرض الآن النسخة المقلّصة (التركيز الامتحاني للوحدة) دون شروحات تفصيلية، وتم التنويه فقط للأمثلة.</span>
                    </div>
                  )}
                  <MathRenderer content={isCondensed ? (bank.condensedSummaryText || 'جاري تقليص وتكثيف الملخص حالياً باستخدام الذكاء الاصطناعي...') : bank.summaryText} />
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 py-10">
              <ClipboardCheck size={40} className="mx-auto text-gray-300 mb-3" />
              <h4 className="text-base font-bold text-gray-700 mb-1">الملخص غير متوفر حالياً</h4>
              <p className="text-xs text-gray-400 font-bold">اضغط على "مسح جديد" لاستخلاص ملخص شامل ودراسي من المرجع بشكل ممتاز ومفيد.</p>
            </div>
          )}
        </section>

        {/* ========================================================== */}
        {/* القسم الثاني: أسئلة الاختيار من متعدد */}
        {/* ========================================================== */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 md:p-8 space-y-6 no-print">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5 text-right" dir="rtl">
            <div className="flex items-center gap-3">
              <HelpCircle className="text-amber-600 flex-shrink-0" size={28} />
              <div>
                <h3 className="text-xl font-black text-gray-900 leading-tight">القسم الثاني: أسئلة خيار من متعدد (تأهيل موضوعي)</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">أسئلة بمستويات متدرجة تركز على الفخاخ الامتحانية والمفاهيم بطريقة "احتوائية" متناسقة</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={rebuildMCQsAI}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all h-10 ${
                  currentAction === 'rebuild_mcqs' 
                  ? 'bg-amber-600 text-white animate-pulse' 
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50'
                }`}
              >
                {currentAction === 'rebuild_mcqs' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                مسح جديد
              </button>
              <button
                onClick={expandMCQsAI}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all h-10 ${
                  currentAction === 'expand_mcqs' 
                  ? 'bg-indigo-600 text-white animate-pulse' 
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50'
                }`}
              >
                {currentAction === 'expand_mcqs' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                إضافة للأسئلة الموجودة
              </button>
              <button
                onClick={handleAddMCQManually}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-extrabold rounded-xl text-xs transition-all h-10 animate-fade-in"
              >
                <PlusCircle size={14} className="text-emerald-600" />
                إضافة سؤال يدوياً
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {sortedItems.filter(isMCQItem).length > 0 ? (
              sortedItems.filter(isMCQItem).map((item, index) => renderQuestionItem(item, index + 1))
            ) : (
              <div className="bg-gray-50 rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 py-10">
                <HelpCircle size={40} className="mx-auto text-gray-300 mb-3" />
                <h4 className="text-base font-bold text-gray-700 mb-1">لا توجد أسئلة اختيار من متعدد في البنك حالياً</h4>
                <p className="text-xs text-gray-400 font-bold">اضغط على "مسح جديد" للقيام بمسح للمرجع وتوليد باقة أولى من خيارات متعدد.</p>
              </div>
            )}
          </div>
        </section>

        {/* ========================================================== */}
        {/* القسم الثالث: التمارين والمسائل المقالية الطويلة */}
        {/* ========================================================== */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 md:p-8 space-y-6 no-print">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5 text-right" dir="rtl">
            <div className="flex items-center gap-3">
              <Sparkles className="text-purple-600 flex-shrink-0" size={28} />
              <div>
                <h3 className="text-xl font-black text-gray-900 leading-tight">القسم الثالث: الأسئلة المقالية</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">مسائل معيارية ذات طلبات متدرجة وشاملة لتعزيز المهارات الرياضية العليا والتطبيقات المركزة</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={rebuildEssayAI}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all h-10 ${
                  currentAction === 'rebuild_essay' 
                  ? 'bg-amber-600 text-white animate-pulse' 
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50'
                }`}
              >
                {currentAction === 'rebuild_essay' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                مسح جديد
              </button>
              <button
                onClick={expandEssayAI}
                disabled={generating}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-all h-10 ${
                  currentAction === 'expand_essay' 
                  ? 'bg-indigo-600 text-white animate-pulse' 
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50'
                }`}
              >
                {currentAction === 'expand_essay' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                إضافة مسائل جديدة
              </button>
              <button
                onClick={handleAddEssayManually}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-extrabold rounded-xl text-xs transition-all h-10 animate-fade-in"
              >
                <PlusCircle size={14} className="text-emerald-600" />
                إضافة سؤال يدوياً
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {sortedItems.filter(item => !isMCQItem(item)).length > 0 ? (
              sortedItems.filter(item => !isMCQItem(item)).map((item, index) => renderQuestionItem(item, index + 1))
            ) : (
              <div className="bg-gray-50 rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 py-10">
                <Sparkles size={40} className="mx-auto text-gray-300 mb-3" />
                <h4 className="text-base font-bold text-gray-700 mb-1">لا توجد تمارين ومسائل مقالية طويلة في البنك حالياً</h4>
                <p className="text-xs text-gray-400 font-bold">اضغط على "مسح جديد" لاستخلاص مسائل متدرجة من مرجع الرياضيات السوري.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Expand Summary Instructions Prompt Modal */}
      <AnimatePresence>
        {showExpandPromptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between" dir="rtl">
                <div className="flex items-center gap-3 text-indigo-600">
                  <Sparkles size={24} />
                  <h3 className="text-lg font-black">توجيهات مخصصة لتوسيع الملخص</h3>
                </div>
                <button onClick={() => setShowExpandPromptModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4 text-right" dir="rtl">
                <p className="text-xs text-slate-500 font-bold leading-relaxed">
                  اكتب هنا إرشاداتك، أو رغبتك في التركيز على نقطة محددة أو نمط معين من المسائل من المرجع المدرسي ليتعامل معه الذكاء الاصطناعي بدقة أثناء صياغة الملحق الموسع.
                </p>
                <textarea
                  value={summaryExpandInstructions}
                  onChange={(e) => setSummaryExpandInstructions(e.target.value)}
                  placeholder="مثال: ركز بالكامل على مراجعة مفاهيم الاحتمال الشرطي، أضف تنبيهات امتحانية هامة حول أخطاء الطلاب الشائعة في التباين الرياضي، وفصل خطوات حساب الإنحراف المعياري..."
                  className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 placeholder:text-xs resize-none"
                />
              </div>
              <div className="p-4 bg-slate-50 border-t rounded-b-2xl flex items-center justify-end gap-2" dir="rtl">
                <button
                  onClick={() => {
                    setShowExpandPromptModal(false);
                    expandSummaryAI();
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1"
                >
                  <Sparkles size={14} />
                  بدء التوسيع بالذكاء الاصطناعي
                </button>
                <button
                  onClick={() => setShowExpandPromptModal(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black rounded-xl transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inject Test Questions Modal */}
      <AnimatePresence>
        {showInjectTestQuestionsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            >
              <div className="p-5 border-b flex items-center justify-between shadow-sm" dir="rtl">
                <div className="flex items-center gap-3 text-purple-700">
                  <PlusCircle size={24} className="text-purple-600" />
                  <h3 className="text-lg font-black">حقن واستيراد أسئلة من قسم الاختبارات</h3>
                </div>
                <button onClick={() => {
                  setShowInjectTestQuestionsModal(false);
                  setSelectedTestId(null);
                  setSelectedQuestionsToInject({});
                }} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6 text-right flex-1" dir="rtl">
                {/* Step 1: Select Test */}
                <div className="space-y-2">
                  <label className="block text-xs font-black text-gray-500">اختر الاختبار المراد سحب الأسئلة منه:</label>
                  <select
                    value={selectedTestId || ''}
                    onChange={(e) => {
                      setSelectedTestId(e.target.value ? Number(e.target.value) : null);
                      setSelectedQuestionsToInject({});
                    }}
                    className="w-full text-sm font-bold p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none transition-all bg-slate-50 cursor-pointer text-gray-800"
                  >
                    <option value="">-- اختر اختباراً من القائمة --</option>
                    {availableTests.map(test => (
                      <option key={test.id} value={test.id}>
                        {test.title} ({test.grade || 'صف غير محدد'} - {test.subject || 'مادة غير محددة'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step 2: Show Questions with checkbox Selection */}
                {selectedTestId && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-xs font-black text-gray-700">حدد الأسئلة التي تريد حقنها بـ بنك الأسئلة الحالي:</span>
                      <button
                        onClick={() => {
                          const allQs = getFlattenedQuestions();
                          const allSelected = allQs.every(q => selectedQuestionsToInject[q.key]);
                          const nextSelect: Record<string, boolean> = {};
                          if (!allSelected) {
                            allQs.forEach(q => { nextSelect[q.key] = true; });
                          }
                          setSelectedQuestionsToInject(nextSelect);
                        }}
                        className="text-xs font-black text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-all"
                      >
                        {getFlattenedQuestions().every(q => selectedQuestionsToInject[q.key]) ? "إلغاء تحديد الجميع" : "تحديد جميع أسئلة الاختبار"}
                      </button>
                    </div>

                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {getFlattenedQuestions().map((q) => {
                        const isSelected = !!selectedQuestionsToInject[q.key];
                        return (
                          <div
                            key={q.key}
                            onClick={() => {
                              setSelectedQuestionsToInject(prev => ({
                                ...prev,
                                [q.key]: !prev[q.key]
                              }));
                            }}
                            className={`p-3.5 border rounded-xl cursor-pointer transition-all flex items-start gap-3 text-right hover:bg-slate-50/80 ${
                              isSelected ? 'bg-purple-50/50 border-purple-300 ring-1 ring-purple-200' : 'border-gray-200 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent onClick
                              className="mt-1.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer h-4.5 w-4.5"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${
                                  q.type === 'mcq' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
                                }`}>
                                  {q.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي'}
                                </span>
                                {q.originalSectionTitle && (
                                  <span className="text-[10px] text-gray-400 font-bold">
                                    المجموعة: {q.originalSectionTitle}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-bold text-gray-800 leading-relaxed max-w-xl truncate">
                                {q.text}
                              </div>
                              {q.solution && (
                                <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                  <span>✔️ يحتوي على حل نموذجي تفصيلي للتصدير</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showInjectTestQuestionsModal && availableTests.length === 0 && (
                  <div className="p-8 text-center bg-slate-50 border border-dashed rounded-xl border-gray-200 py-10">
                    <p className="text-sm font-bold text-gray-400">لا تتوفر أي اختبارات محفوظة في قسم الاختبارات حالياً لحقن الأسئلة منها.</p>
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-slate-50 border-t rounded-b-2xl flex items-center justify-end gap-2" dir="rtl">
                <button
                  disabled={!selectedTestId || Object.values(selectedQuestionsToInject).filter(Boolean).length === 0}
                  onClick={handleInjectQuestions}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-purple-600/10 flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle size={14} />
                  حقن الأسئلة المحددة ({Object.values(selectedQuestionsToInject).filter(Boolean).length || 0}) 📥
                </button>
                <button
                  onClick={() => {
                    setShowInjectTestQuestionsModal(false);
                    setSelectedTestId(null);
                    setSelectedQuestionsToInject({});
                  }}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black rounded-xl transition-all h-10 flex items-center justify-center cursor-pointer"
                >
                  إلغاء التراجع
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reference Preview Modal */}
      <AnimatePresence>
        {showRefPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between">
                <div className="flex items-center gap-3 text-amber-600">
                  <BookOpen size={24} />
                  <h3 className="text-xl font-black">محتوى المرجع (التحليل المستخرج)</h3>
                </div>
                <button onClick={() => setShowRefPreview(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto text-right leading-relaxed font-medium text-gray-700 whitespace-pre-wrap" dir="rtl">
                {refText || "جاري تحميل المحتوى..."}
              </div>
              <div className="p-4 bg-gray-50 border-t rounded-b-2xl text-center text-xs text-gray-500">
                هذا هو النص الذي يعتمد عليه الذكاء الاصطناعي لتوليد الأسئلة. إذا رأيت محتوى غير متعلق بالوحدة، فقد يكون السبب هو خطأ في ملف الـ PDF المرفوع.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>

      {/* Print-only CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .math-renderer { font-size: inherit !important; }
          
          .print-bank-columns {
            column-count: 2 !important;
            column-gap: 24pt !important;
            column-rule: 1px dashed #cccccc !important;
            direction: rtl !important;
            width: 100% !important;
          }
          .print-bank-columns > * {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 16pt !important;
          }

          /* Font size configurations */
          .print-only {
            font-size: ${printFontSize}pt !important;
          }

          .print-number-badge {
            font-size: ${printFontSize}pt !important;
            width: ${printFontSize + 14}pt !important;
            height: ${printFontSize + 14}pt !important;
            line-height: normal !important;
            border-radius: 4px !important;
          }

          .print-question-text, .print-question-text *:not(.katex):not(.katex *) {
            font-size: ${printFontSize}pt !important;
          }

          .print-sub-text, .print-sub-text *:not(.katex):not(.katex *) {
            font-size: ${Math.max(10, printFontSize - 1)}pt !important;
          }

          /* Increase vertical line distance for formulas in print so they don't overlap lines */
          .print-question-text, .print-sub-text {
            line-height: 1.85 !important;
          }

          /* Ensure KaTeX itself prints with proportional math font sizes */
          .katex {
            font-size: 1.05em !important;
            line-height: 1.15 !important;
            text-indent: 0 !important;
          }
          .katex-display {
            margin: 0.6em 0 !important;
            overflow: visible !important;
          }

          /* Strip backgrounds, decorative margins/padding for solutions when printing */
          .print-solution-box {
            padding: 8pt 0 !important;
            margin: 12pt 0 0 0 !important;
            border-top: 1px dashed #dddddd !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          
          .print-solution-box span, .print-solution-box div {
            color: black !important;
          }

          .print-solution-box p, 
          .print-solution-box div, 
          .print-solution-box ol, 
          .print-solution-box ul, 
          .print-solution-box li {
            margin-top: 4pt !important;
            margin-bottom: 8pt !important;
            line-height: 1.75 !important;
          }

          h1, h2, h3, h4, h5, h6 {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }

          /* Compact spacing between questions during print */
          .print-item-container {
            margin-bottom: 24pt !important;
            padding-bottom: 12pt !important;
            border-bottom: 1px dashed #eaeaea !important;
            break-inside: avoid !important;
          }

          /* Block-level clean layout for questions/drawings with floated badges to prevent leftmost SVGs cut-offs */
          .print-question-row {
            display: block !important;
            width: 100% !important;
            overflow: visible !important;
            clear: both !important;
          }

          .print-question-row > .print-number-badge {
            float: right !important;
            margin-left: 10pt !important;
            margin-right: 0 !important;
            margin-bottom: 6pt !important;
          }

          .print-question-row > .flex-grow {
            display: block !important;
            width: auto !important;
            overflow: visible !important;
          }

          /* SVG rendering and scaling on print to avoid clipping at margin (excluding KaTeX math SVGs) */
          .print-only svg:not(.katex *):not(.katex-html *) {
            width: 100% !important;
            height: auto !important;
            max-width: 100% !important;
            display: block !important;
            margin: 0 auto !important;
            overflow: visible !important;
            box-sizing: border-box !important;
          }
          
          /* Centering SVG below the question text and floated badge */
          .print-question-row > .w-48 {
            display: block !important;
            float: none !important;
            clear: both !important;
            width: 160pt !important; /* Perfect fit for both 1-column & 2-column print layouts */
            max-width: 100% !important;
            height: auto !important;
            margin: 14pt auto 8pt auto !important;
            overflow: visible !important;
          }

          /* For inline solutions SVGs */
          .print-only .w-48 {
            max-width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Disable overflow clipping for inline solutions SVGs to guarantee they don't get truncated */
          .print-solution-box .max-h-48 {
            max-height: none !important;
            overflow: visible !important;
          }
        }
      `}</style>
      
      {/* Print Ready View */}
      <div className="print-only py-8 leading-relaxed print-area-custom-font" dir="rtl">
          {useWatermark && watermarkText && (
            <>
              <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                  .print-watermark-overlay {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    z-index: 999999 !important;
                    pointer-events: none !important;
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: space-around !important;
                    align-items: center !important;
                    opacity: 0.1 !important;
                    color: #000000 !important;
                    font-family: 'Cairo', sans-serif !important;
                    font-weight: 900 !important;
                    transform: rotate(-35deg) scale(1.3) !important;
                    transform-origin: center !important;
                  }
                  .print-watermark-overlay div {
                    font-size: 4rem !important;
                    white-space: nowrap !important;
                    margin: 30px 0 !important;
                    text-align: center !important;
                    user-select: none !important;
                  }
                }
              `}} />
              <div className="print-watermark-overlay hidden print:flex">
                {Array.from({ length: watermarkRepeats }).map((_, idx) => (
                  <div key={idx}>{watermarkText}</div>
                ))}
              </div>
            </>
          )}

          <div className="text-center mb-12 border-b-4 border-double border-gray-800 pb-8">
            {(metaSeriesName || bank.seriesName) && (
              <div className="text-sm font-black text-gray-600 mb-1">
                {metaSeriesName || bank.seriesName}
              </div>
            )}
            <h1 className="text-3xl font-black mb-4">{metaTitle || bank.title}</h1>
            <div className="flex justify-center flex-wrap gap-4 font-bold text-gray-700">
                {(metaCountry || bank.country) && <span>{metaCountry || bank.country}</span>}
                {(metaCountry || bank.country) && (metaGrade || bank.grade) && <span>•</span>}
                {(metaGrade || bank.grade) && <span>{metaGrade || bank.grade}</span>}
                {(metaGrade || bank.grade) && (metaSubject || bank.subject) && <span>•</span>}
                {(metaSubject || bank.subject) && <span>{metaSubject || bank.subject}</span>}
                {(metaPart || bank.part) && <span>• الجزء: {metaPart || bank.part}</span>}
                {(metaUnit || bank.unit) && <span>• {metaUnit || bank.unit}</span>}
                {(metaTopic || bank.topic) && <span>• الموضوع: {metaTopic || bank.topic}</span>}
            </div>
            {(metaTeacherName || bank.teacherName) && (
              <div className="mt-3 text-xs font-bold text-gray-600">
                إعداد: {metaTeacherRole || bank.teacherRole || 'المدرّس'} {metaTeacherName || bank.teacherName}
              </div>
            )}
          </div>

          {bank.summaryText && printScope !== 'questions_only' && (
            <div className="mb-8 p-5 border-2 border-black rounded-xl bg-gray-50/50 break-inside-auto shadow-none">
              <div className="flex items-center gap-2 mb-3 border-b-2 border-black pb-1.5">
                <span className="text-base font-black">
                  {isCondensed 
                    ? '📋 ملخص المنهج المقلّص (تركيز مكثف ⚡)' 
                    : '📋 ملخص المراجعة والتركيز الامتحاني (قبل الامتحان بـ 4 أيام)'}
                </span>
              </div>
              <div className="print-question-text leading-relaxed">
                <MathRenderer content={isCondensed ? (bank.condensedSummaryText || bank.summaryText) : bank.summaryText} />
              </div>
            </div>
          )}

          {printScope !== 'summary_only' && (
            <div className="space-y-12">
              {/* القسم الثاني: أسئلة الاختيار من متعدد */}
            {bank.items?.filter(isMCQItem).length > 0 && (
              <div className="space-y-6">
                <h2 className="text-xl font-black border-b-2 border-black pb-2 mt-6">القسم الثاني: أسئلة الاختيار من متعدد (تأهيل موضوعي)</h2>
                
                <div className={`space-y-8 ${printColumns === 2 ? 'print-bank-columns' : ''}`}>
                  {bank.items.filter(isMCQItem).map((item, idx) => (
                    <div key={item.id} className={`print-item-container ${printMode === 'questions_and_solutions' ? 'break-inside-auto' : 'break-inside-avoid'}`}>
                      <div className="flex items-start gap-4 mb-4 print-question-row">
                         <div className="print-number-badge border-2 border-black flex items-center justify-center font-bold flex-shrink-0 rounded-lg bg-gray-100" style={{ width: '32px', height: '32px' }}>
                           {idx + 1}
                         </div>
                         <div className="flex-grow">
                            <div className="font-bold print-question-text mb-3 leading-normal">
                               <MathRenderer content={item.question} />
                            </div>
                            
                            {item.subParts && item.subParts.length === 4 && (
                              /* MCQ 8-column table for Print */
                              <div className="my-3 w-full" dir="rtl">
                                <table className="w-full border-2 border-black text-center text-xs" style={{ borderCollapse: 'collapse', tableLayout: 'auto' }}>
                                  <tbody>
                                    <tr>
                                      <td className="border-2 border-black font-extrabold px-1.5 py-2 bg-gray-100 text-center select-none" style={{ width: '32px', backgroundColor: '#f3f4f6', color: '#000', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>A</td>
                                      <td className="border-2 border-black px-2.5 py-2 font-bold text-right text-black whitespace-normal break-words leading-relaxed" style={{ minWidth: '100px' }}><MathRenderer content={getCleanOptionText(item.subParts[0])} /></td>
                                      
                                      <td className="border-2 border-black font-extrabold px-1.5 py-2 bg-gray-100 text-center select-none" style={{ width: '32px', backgroundColor: '#f3f4f6', color: '#000', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>B</td>
                                      <td className="border-2 border-black px-2.5 py-2 font-bold text-right text-black whitespace-normal break-words leading-relaxed" style={{ minWidth: '100px' }}><MathRenderer content={getCleanOptionText(item.subParts[1])} /></td>
                                      
                                      <td className="border-2 border-black font-extrabold px-1.5 py-2 bg-gray-100 text-center select-none" style={{ width: '32px', backgroundColor: '#f3f4f6', color: '#000', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>C</td>
                                      <td className="border-2 border-black px-2.5 py-2 font-bold text-right text-black whitespace-normal break-words leading-relaxed" style={{ minWidth: '100px' }}><MathRenderer content={getCleanOptionText(item.subParts[2])} /></td>
                                      
                                      <td className="border-2 border-black font-extrabold px-1.5 py-2 bg-gray-100 text-center select-none" style={{ width: '32px', backgroundColor: '#f3f4f6', color: '#000', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>D</td>
                                      <td className="border-2 border-black px-2.5 py-2 font-bold text-right text-black whitespace-normal break-words leading-relaxed" style={{ minWidth: '100px' }}><MathRenderer content={getCleanOptionText(item.subParts[3])} /></td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Solutions and Guidance inside print if enabled */}
                            {printMode === 'questions_and_solutions' && (
                              <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 print-solution-box">
                                {item.aiGuidance && printGuidance && (
                                  <div className="p-3 bg-amber-50/40 rounded-xl border border-amber-200/40 text-xs print-sub-text print-solution-box">
                                    <span className="font-extrabold text-[#78350f] block mb-1">💡 إرشاد تعليمي ذكي:</span>
                                    <div className="font-medium text-amber-900/90 leading-relaxed">
                                      <MathRenderer content={item.aiGuidance} />
                                    </div>
                                  </div>
                                )}
                                {item.solution && (
                                  <div className="p-4 bg-indigo-50/20 rounded-xl border border-indigo-100/50 text-xs print-sub-text print-solution-box">
                                    <span className="font-extrabold text-[#1e1b4b] block mb-1">🔑 الحل النموذجي:</span>
                                    <div className="font-normal text-indigo-950/90 leading-relaxed">
                                      <MathRenderer content={item.solution} />
                                    </div>
                                    {item.solutionSvgCode && (
                                      <div className="mt-2 flex justify-center max-h-48 overflow-hidden">
                                        <div dangerouslySetInnerHTML={{ __html: item.solutionSvgCode }} className="w-48" />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                         </div>
                         {item.svgCode && (
                           <div className="w-48 flex-shrink-0" dangerouslySetInnerHTML={{ __html: item.svgCode }} />
                         )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* القسم الثالث: الأسئلة المقالية */}
            {bank.items?.filter(item => !isMCQItem(item)).length > 0 && (
              <div className={`space-y-6 ${bank.items?.some(isMCQItem) ? 'break-before-page' : ''}`}>
                <h2 className="text-xl font-black border-b-2 border-black pb-2 mt-10">القسم الثالث: الأسئلة المقالية</h2>
                
                <div className={`space-y-8 ${printColumns === 2 ? 'print-bank-columns' : ''}`}>
                  {bank.items.filter(item => !isMCQItem(item)).map((item, idx) => (
                    <div key={item.id} className={`print-item-container ${printMode === 'questions_and_solutions' ? 'break-inside-auto' : 'break-inside-avoid'}`}>
                      <div className="flex items-start gap-4 mb-4 print-question-row">
                         <div className="print-number-badge border-2 border-black flex items-center justify-center font-bold flex-shrink-0 rounded-lg bg-gray-100" style={{ width: '32px', height: '32px' }}>
                           {idx + 1}
                         </div>
                         <div className="flex-grow">
                            <div className="font-bold print-question-text mb-4 leading-normal">
                               <MathRenderer content={item.question} />
                            </div>
                            
                            {item.subParts && item.subParts.length > 0 && (
                              <div className="space-y-2 mb-4 pr-4">
                                 {item.subParts.map((s, i) => (
                                   <div key={i} className="flex gap-2 print-sub-text">
                                     <span className="font-black">{getCircledNumber(i)}</span>
                                     <MathRenderer content={cleanSubpartText(s)} />
                                   </div>
                                 ))}
                              </div>
                            )}

                            {/* Solutions and Guidance inside print if enabled */}
                            {printMode === 'questions_and_solutions' && (
                              <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 print-solution-box">
                                {item.aiGuidance && printGuidance && (
                                  <div className="p-3 bg-amber-50/40 rounded-xl border border-amber-200/40 text-xs print-sub-text print-solution-box">
                                    <span className="font-extrabold text-[#78350f] block mb-1">💡 إرشاد تعليمي ذكي:</span>
                                    <div className="font-medium text-amber-900/90 leading-relaxed">
                                      <MathRenderer content={item.aiGuidance} />
                                    </div>
                                  </div>
                                )}
                                {item.solution && (
                                  <div className="p-4 bg-indigo-50/20 rounded-xl border border-indigo-100/50 text-xs print-sub-text print-solution-box">
                                    <span className="font-extrabold text-[#1e1b4b] block mb-1">🔑 الحل النموذجي:</span>
                                    <div className="font-normal text-indigo-950/90 leading-relaxed">
                                      <MathRenderer content={item.solution} />
                                    </div>
                                    {item.solutionSvgCode && (
                                      <div className="mt-2 flex justify-center max-h-48 overflow-hidden">
                                        <div dangerouslySetInnerHTML={{ __html: item.solutionSvgCode }} className="w-48" />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                         </div>
                         {item.svgCode && (
                           <div className="w-48 flex-shrink-0" dangerouslySetInnerHTML={{ __html: item.svgCode }} />
                         )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          <div className="mt-20 pt-8 border-t border-gray-300 text-center text-xs text-gray-500">
            تم إنشاء بنك الأسئلة التدريبية بواسطة منصة التعلم الذكي
          </div>
      </div>
    </>
  );
};
