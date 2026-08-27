import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Document, type ExamSummary, type Test } from '../db';
import { MathRenderer } from './MathRenderer';
import { 
  generateExamSummaryText, 
  generateCustomizedExamSummaryText 
} from '../services/gemini';
import { 
  BookOpen, 
  Sparkles, 
  Plus, 
  Printer, 
  Edit3, 
  Trash2, 
  Loader2, 
  Check, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Bookmark, 
  Compass, 
  Settings, 
  Eye, 
  Type as FontIcon, 
  Type, 
  RefreshCw,
  PlusCircle, 
  Save, 
  FileText,
  AlertTriangle,
  HelpCircle,
  Scissors,
  ArrowRight,
  Maximize2,
  Minimize2,
  Globe,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CustomDialog } from './ui/CustomDialog';
import { SummaryManualEditor } from './SummaryManualEditor';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';

export const ExamSummariesDashboard: React.FC = () => {
  // 1. Live Queries of DB
  const examSummaries = useLiveQuery(() => 
    db.examSummaries.orderBy('createdAt').reverse().toArray()
  );
  
  const libraryDocs = useLiveQuery(() => 
    db.documents.filter(d => d.type === 'pdf' || d.type === 'lesson').toArray()
  );

  const testsList = useLiveQuery(() => 
    db.tests.orderBy('createdAt').reverse().toArray()
  );

  // 2. Main Selected State
  const [activeSummaryId, setActiveSummaryId] = useState<number | null>(null);
  const [activeSummary, setActiveSummary] = useState<ExamSummary | null>(null);
  const [editingSummary, setEditingSummary] = useState<ExamSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'editor'>('preview');

  // Generation Panel States
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newMetadata, setNewMetadata] = useState({
    country: 'سوريا',
    grade: 'الثالث الثانوي العلمي',
    subject: 'الرياضيات',
    part: '',
    unit: ''
  });
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');

  // AI Refinement Prompt Modal States
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiActionType, setAiActionType] = useState<'expand' | 'condense' | 'custom'>('expand');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiRegenerating, setAiRegenerating] = useState(false);

  // Injection Modal States
  const [injectModalOpen, setInjectModalOpen] = useState(false);
  const [selectedTestsToInject, setSelectedTestsToInject] = useState<number[]>([]);

  // Manual Editing States
  const [editedText, setEditedText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Print Configuration States
  const [printFont, setPrintFont] = useState<'default' | 'cairo' | 'amiri' | 'tajawal' | 'almarai' | 'notonaskh' | 'aref' | 'reemkufi'>('cairo');
  const [printFontSize, setPrintFontSize] = useState<number>(13);
  const [printColumns, setPrintColumns] = useState<1 | 2>(1);
  const [printContentMode, setPrintContentMode] = useState<'summary_only' | 'summary_and_questions' | 'summary_and_solutions'>('summary_and_solutions');
  const [useWatermark, setUseWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState('المدرّس حسن راشد العلي');

  // Manual overridden content for printing (Defaults to null if automatic)
  const [customPrintContent, setCustomPrintContent] = useState<string | null>(null);
  const [isEditingCustomPrint, setIsEditingCustomPrint] = useState(false);

  // Global Dialog States
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

  // Close creation panel & reset
  const resetCreationForm = () => {
    setIsCreatingNew(false);
    setSelectedDocs([]);
    setNewTitle('');
    setGenerating(false);
    setGenerationProgress('');
  };

  // Load active summary details
  useEffect(() => {
    if (activeSummaryId) {
      const loadDetails = async () => {
        const sum = await db.examSummaries.get(activeSummaryId);
        if (sum) {
          setActiveSummary(sum);
          setEditedText(sum.summaryText);
          setEditedTitle(sum.title);
          // Sync with custom override if saved or reset to null
          setCustomPrintContent(null);
          setIsEditingCustomPrint(false);
        }
      };
      loadDetails();
    } else {
      setActiveSummary(null);
      setEditedText('');
      setEditedTitle('');
      setCustomPrintContent(null);
    }
  }, [activeSummaryId]);

  // Set suggested title based on checked library books
  useEffect(() => {
    if (selectedDocs.length > 0 && libraryDocs) {
      const selectedTitles = libraryDocs
        .filter(d => selectedDocs.includes(d.id!))
        .map(d => d.title.replace("تحميل مرجع ", "").replace("مرجع ", "").trim());
      
      const suggested = `ملخص امتحاني سريّع: ${selectedTitles.join(' و ')}`;
      setNewTitle(suggested);
      
      // Auto-extract grade and subject from the first selected book
      const firstBook = libraryDocs.find(d => selectedDocs.includes(d.id!));
      if (firstBook) {
        setNewMetadata(prev => ({
          ...prev,
          country: firstBook.country || prev.country || 'سوريا',
          grade: firstBook.grade || prev.grade,
          subject: firstBook.subject || prev.subject,
          part: firstBook.part || prev.part,
          unit: firstBook.unit || prev.unit
        }));
      }
    } else {
      setNewTitle('');
    }
  }, [selectedDocs, libraryDocs]);

  // Handle Initial Exam Summary Generation
  const handleGenerateSummary = async () => {
    if (selectedDocs.length === 0) {
      showAlert('تنبيه', 'الرجاء اختيار مرجع واحد على الأقل للتلخيص.');
      return;
    }
    if (!newTitle.trim()) {
      showAlert('تنبيه', 'الرجاء إدخال عنوان للملخص الإمتحاني.');
      return;
    }

    setGenerating(true);
    setGenerationProgress('جاري استرجاع المحتويات النصية للمراجع المحددة...');

    try {
      const contentsList: { bookTitle: string; textContent: string }[] = [];
      
      for (const id of selectedDocs) {
        const doc = libraryDocs?.find(d => d.id === id);
        const pdfContent = await db.pdfContents.where('docId').equals(id).first();
        if (doc && pdfContent) {
          contentsList.push({
            bookTitle: doc.title,
            textContent: pdfContent.textContent
          });
        }
      }

      if (contentsList.length === 0) {
        throw new Error('لم يتم العثور على محتوى نصي مستخرج لهذه المراجع. تأكد من رفعها وقراءتها.');
      }

      setGenerationProgress('يقوم الذكاء الاصطناعي الآن بمسح وحذف القسم النظري والحشو وصياغة المهارات الامتحانية المكثفة بدون تكرار...');
      
      const summaryResult = await generateExamSummaryText(contentsList, {
        grade: newMetadata.grade,
        subject: newMetadata.subject
      });

      if (!summaryResult) {
        throw new Error('أرجع الذكاء الاصطناعي نتيجة فارغة. يرجى المحاولة لاحقاً.');
      }

      setGenerationProgress('جاري حفظ وحياكة الملخص في قاعدة البيانات المحلية...');

      const newId = await db.examSummaries.add({
        title: newTitle.trim(),
        country: newMetadata.country,
        grade: newMetadata.grade,
        subject: newMetadata.subject,
        part: newMetadata.part || undefined,
        unit: newMetadata.unit || undefined,
        summaryText: summaryResult,
        pdfIds: selectedDocs,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        injectedTests: []
      });

      setActiveSummaryId(newId);
      resetCreationForm();
      showAlert('تم النجاح', 'تمت هندسة وتوليد الملخص الامتحاني المكثف بنجاح!');
    } catch (err: any) {
      console.error(err);
      showAlert('خطأ أثناء التوليد', err?.message || 'فشلت عملية توليد الملخص.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSummaryMetadata = async (updated: {
    title: string;
    country: string;
    grade: string;
    subject: string;
    part?: string;
    unit?: string;
  }) => {
    if (!editingSummary?.id) return;
    await db.examSummaries.update(editingSummary.id, {
      title: updated.title,
      country: updated.country,
      grade: updated.grade,
      subject: updated.subject,
      part: updated.part || undefined,
      unit: updated.unit || undefined,
      updatedAt: Date.now()
    });
    setEditingSummary(null);
    // Reload active summary if editing currently open one
    if (activeSummaryId === editingSummary.id) {
      const refreshed = await db.examSummaries.get(editingSummary.id);
      if (refreshed) {
        setActiveSummary(refreshed);
        setEditedTitle(refreshed.title);
      }
    }
  };

  // Save manual modifications to Dexie
  const handleSaveDocChanges = async () => {
    if (!activeSummary || !activeSummaryId) return;

    try {
      await db.examSummaries.update(activeSummaryId, {
        summaryText: editedText,
        title: editedTitle,
        updatedAt: Date.now()
      });

      const updated = await db.examSummaries.get(activeSummaryId);
      if (updated) {
        setActiveSummary(updated);
        setIsEditingTitle(false);
        showAlert('حفظ التغييرات', 'تم حفظ التعديلات اليدوية بنجاح!');
      }
    } catch (err) {
      showAlert('خطأ', 'تعذر حفظ التغييرات في قاعدة البيانات.');
    }
  };

  // Save changes to title only
  const handleSaveTitleOnly = async () => {
    if (!activeSummaryId || !editedTitle.trim()) return;
    try {
      await db.examSummaries.update(activeSummaryId, {
        title: editedTitle.trim(),
        updatedAt: Date.now()
      });
      setIsEditingTitle(false);
      const updated = await db.examSummaries.get(activeSummaryId);
      if (updated) setActiveSummary(updated);
    } catch (err) {
      showAlert('خطأ', 'تعذر حفظ العنوان.');
    }
  };

  // AI Refinement of the active Exam Summary
  const handleAiRefinementSubmit = async () => {
    if (!activeSummary || !activeSummaryId) return;
    if (!aiInstruction.trim()) {
      showAlert('إدخال فارغ', 'يرجى كتابة تعليمات للذكاء الاصطناعي تفصل طلبك.');
      return;
    }

    setAiRegenerating(true);
    try {
      const result = await generateCustomizedExamSummaryText(
        editedText, // Current text
        aiInstruction.trim(),
        aiActionType,
        { grade: activeSummary.grade, subject: activeSummary.subject }
      );

      if (!result) {
        throw new Error('أرجع النموذج ردًا فارغًا.');
      }

      setEditedText(result);
      await db.examSummaries.update(activeSummaryId, {
        summaryText: result,
        updatedAt: Date.now()
      });

      const updated = await db.examSummaries.get(activeSummaryId);
      if (updated) setActiveSummary(updated);

      setAiModalOpen(false);
      setAiInstruction('');
      showAlert('تمت التعديلات الذكية', 'قام الذكاء الاصطناعي بإعادة تنقيح وتحديث الملخص بنجاح!');
    } catch (err: any) {
      showAlert('خطأ في التنقيح بالذكاء الاصطناعي', err?.message || 'حدث خطأ في معالجة طلبك.');
    } finally {
      setAiRegenerating(false);
    }
  };

  // Format a Test's sections & question items into clean Markdown
  const formatTestMarkDown = (test: Test, showSolutions: boolean): string => {
    let output = `\n\n---\n\n## 📝 اختبار محقون: ${test.title}\n`;
    output += `*الصف: ${test.grade} | المادة: ${test.subject} | مستوى الصعوبة: ${test.difficulty}*\n\n`;

    const sections = test.testData?.sections || [];
    if (sections.length === 0) {
      output += `*(لا توجد بنود أسئلة في هذا الاختبار)*\n`;
      return output;
    }

    sections.forEach((sec: any, sIdx: number) => {
      output += `### القسم ${sIdx + 1}: ${sec.sectionType || sec.title || 'أسئلة عامة'}\n`;
      if (sec.questions && sec.questions.length > 0) {
        sec.questions.forEach((q: any, qIdx: number) => {
          output += `**س ${qIdx + 1}.** ${q.text}\n`;
          
          if (q.choices && q.choices.length > 0) {
            output += q.choices.map((c: string, cIdx: number) => `   * [ ] ${c}`).join('\n') + '\n';
          }

          if (q.subQuestions && q.subQuestions.length > 0) {
            q.subQuestions.forEach((sub: any, subIdx: number) => {
              output += `   **(${subIdx + 1})** ${sub.text}\n`;
              if (showSolutions && sub.solution) {
                output += `   > **💡 الحل الفرعي المساعد:** ${sub.solution}\n`;
              }
            });
          }

          if (showSolutions && q.solution) {
            output += `\n> **💡 الإجابة والحل النموذجي:** ${q.solution}\n\n`;
          }
          output += `\n`;
        });
      } else {
        output += `*(خالٍ من الأسئلة)*\n`;
      }
    });

    return output;
  };

  // Handle Injecting Selected Tests
  const handleInjectTestsSubmit = async () => {
    if (selectedTestsToInject.length === 0) {
      showAlert('تنبيه', 'يرجى اختيار اختبار واحد على الأقل لحقنه.');
      return;
    }
    if (!activeSummary || !activeSummaryId) return;

    try {
      const currentInjected = activeSummary.injectedTests || [];
      const newlyAdded = selectedTestsToInject.filter(id => !currentInjected.includes(id));
      
      if (newlyAdded.length === 0) {
        showAlert('تنبيه', 'جميع الاختبارات المحددة محقونة مسبقاً في هذا الملخص.');
        setInjectModalOpen(false);
        return;
      }

      const mergedInjectedList = [...currentInjected, ...newlyAdded];

      // Update in db
      await db.examSummaries.update(activeSummaryId, {
        injectedTests: mergedInjectedList,
        updatedAt: Date.now()
      });

      const updated = await db.examSummaries.get(activeSummaryId);
      if (updated) setActiveSummary(updated);

      setInjectModalOpen(false);
      setSelectedTestsToInject([]);
      showAlert('حقن ناجح', `تم بنجاح حقن ودراسة اختبارات جديدة لدعم الملخص الامتحاني!`);
    } catch (err) {
      showAlert('خطأ', 'تعذر إتمام عملية حقن الاختبارات.');
    }
  };

  // Remove an injected test referenced
  const handleRemoveInjected = async (testId: number) => {
    if (!activeSummary || !activeSummaryId) return;
    const currentInjected = activeSummary.injectedTests || [];
    const filtered = currentInjected.filter(id => id !== testId);
    
    try {
      await db.examSummaries.update(activeSummaryId, {
        injectedTests: filtered,
        updatedAt: Date.now()
      });
      const updated = await db.examSummaries.get(activeSummaryId);
      if (updated) setActiveSummary(updated);
    } catch (err) {
      showAlert('خطأ', 'تعذر إزالة الاختبار المحقون.');
    }
  };

  // Delete entire Exam Summary from DB
  const handleDeleteSummary = (id: number) => {
    showConfirm('تأكيد الحذف', 'هل أنت متأكد تماماً من رغبتك في حذف هذا الملخص الامتحاني نهائياً؟ لا يمكن التراجع عن هذا الإجراء.', async () => {
      try {
        await db.examSummaries.delete(id);
        if (activeSummaryId === id) {
          setActiveSummaryId(null);
        }
        showAlert('تم الحذف', 'تم حذف الملخص الامتحاني بنجاح.');
      } catch (err) {
        showAlert('خطأ', 'تعذر حذف الملخص.');
      }
    });
  };

  // Compile combined content representing what should be printed / previewed
  const compileAutomaticPrintContent = (): string => {
    if (!activeSummary) return '';
    
    let combined = `${activeSummary.summaryText}`;
    
    const injectedIds = activeSummary.injectedTests || [];
    if (injectedIds.length > 0 && testsList && printContentMode !== 'summary_only') {
      const showSolutions = printContentMode === 'summary_and_solutions';
      
      combined += `\n\n# 📄 الملحق المرفق: أسئلة الاختبارات والمقالي المدمجة\n`;
      combined += `*تم دمج هذه الاختبارات تلبية لطلب المعلم لتمكين المراجعة الشاملة للأسئلة المرافقة للمهارات.*\n\n`;
      
      injectedIds.forEach(id => {
        const test = testsList.find(t => t.id === id);
        if (test) {
          combined += formatTestMarkDown(test, showSolutions);
        }
      });
    }
    
    return combined;
  };

  // Initialize the manual custom printer editor with the automatic compilation
  const handleActivateManualPrintEdit = () => {
    const autoContent = compileAutomaticPrintContent();
    setCustomPrintContent(autoContent);
    setIsEditingCustomPrint(true);
  };

  // Reset custom print override back to automatic compilation
  const handleResetToAutomaticPrint = () => {
    showConfirm('استعادة التلقائي', 'هل تود السير في استعادة المحتوى الإفتراضي المولد تلقائياً؟ سيُلغى أي تعديل يدوّي قمت به في محتوى الطباعة.', () => {
      setCustomPrintContent(null);
      setIsEditingCustomPrint(false);
    });
  };

  // Print Action
  const triggerNativePrint = () => {
    window.print();
  };

  // CSS Font family helpers
  const getFontFamilyCSS = () => {
    switch(printFont) {
      case 'cairo': return '"Cairo", sans-serif';
      case 'amiri': return '"Amiri", serif';
      case 'tajawal': return '"Tajawal", sans-serif';
      case 'almarai': return '"Almarai", sans-serif';
      case 'notonaskh': return '"Noto Naskh Arabic", sans-serif';
      case 'aref': return '"Aref Ruqaa", serif';
      case 'reemkufi': return '"Reem Kufi", sans-serif';
      default: return '"Inter", sans-serif';
    }
  };

  // Active print content
  const activePrintBody = customPrintContent !== null ? customPrintContent : compileAutomaticPrintContent();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24" dir="rtl">
      {/* 1. Unified Top Header */}
      <div className="no-print">
        <UnifiedPageHeader
          icon={BookOpen}
          title="الملخصات الامتحانية المكثفة"
          subtitle="مراجعة المناهج في ساعتين بفضل دمج مهارات مسائل الوحدة وحذف الحشو التكراري"
          badgeText={`${examSummaries?.length || 0} ملخص`}
          badgeColor="rose"
          actions={
            <button
              onClick={() => setIsCreatingNew(true)}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black px-4 py-2 rounded-xl transition-all shadow-xs active:scale-95 text-xs cursor-pointer"
            >
              <Plus size={15} />
              <span>إنشاء ملخص ليلة الامتحان</span>
            </button>
          }
        />
      </div>

      {/* Main Dashboard Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 no-print">
        
        {/* Left column / List of existing summaries (col-span-4) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm">
            <span className="block text-sm font-black text-gray-800 border-b pb-2 mb-4">الملخصات المخزنة لديك</span>
            
            {!examSummaries || examSummaries.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Bookmark className="text-rose-200 mx-auto mb-3" size={48} />
                <p className="text-sm text-gray-500 font-bold mb-4">لا توجد ملخصات امتحانية حالية</p>
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="inline-flex items-center gap-2 text-xs font-black bg-rose-50 text-rose-600 px-4 py-2 rounded-lg hover:bg-rose-100 transition-colors"
                >
                  <Plus size={14} />
                  اصنع ملخصك الأول الآن
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                {examSummaries.map((sum) => {
                  const isActive = sum.id === activeSummaryId;
                  return (
                    <div
                      key={sum.id}
                      className={`group p-4 rounded-2xl border transition-all duration-200 cursor-pointer relative ${
                        isActive
                          ? 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-400/20 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-rose-300 hover:shadow-sm'
                      }`}
                      onClick={() => setActiveSummaryId(sum.id ?? null)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-2.5">
                          <FileText className={`mt-0.5 flex-shrink-0 ${isActive ? 'text-rose-600' : 'text-gray-400'}`} size={18} />
                          <div>
                            <h4 className="text-sm font-black text-gray-900 line-clamp-2 leading-relaxed group-hover:text-rose-600 transition-colors">
                              {sum.title}
                            </h4>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSummary(sum);
                            }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="تعديل البيانات الأكاديمية"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSummary(sum.id!);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="حذف الملخص"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                          <Globe size={10} className="text-slate-500" />
                          <span>{sum.country || 'سوريا'}</span>
                        </span>
                        <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1">
                          <GraduationCap size={10} className="text-indigo-500" />
                          <span>{sum.grade}</span>
                        </span>
                        <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-rose-100 flex items-center gap-1">
                          <BookOpen size={10} className="text-rose-500" />
                          <span>{sum.subject}</span>
                        </span>
                        {sum.injectedTests && sum.injectedTests.length > 0 && (
                          <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-100">
                            +{sum.injectedTests.length} اختبار محقون
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column / Workspace and Detail view (col-span-8) */}
        <div className="lg:col-span-8">
          {activeSummary && activeSummaryId ? (
            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden flex flex-col min-h-[70vh]">
              
              {/* Header inside workspace */}
              <div className="p-6 bg-gradient-to-r from-gray-50 to-white border-b border-gray-150 relative">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1">
                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-rose-50 to-pink-50 text-rose-700 font-bold text-xs px-2.5 py-1 rounded-full mb-2">
                      <Sparkles size={12} className="animate-pulse" />
                      ملخص مراجعة ليلة الامتحان (ساعتين كحد أقصى)
                    </span>
                    
                    {isEditingTitle ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="text-xl font-black bg-white border-2 border-rose-400 p-1 px-2 rounded-lg w-full max-w-md focus:outline-none"
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveTitleOnly()}
                        />
                        <button
                          onClick={handleSaveTitleOnly}
                          className="p-1 px-3 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700"
                        >
                          حفظ
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingTitle(false);
                            setEditedTitle(activeSummary.title);
                          }}
                          className="p-1 px-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-300"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <h3 className="text-xl font-black text-gray-900 leading-tight">{activeSummary.title}</h3>
                        <button
                          onClick={() => setEditingSummary(activeSummary)}
                          className="p-1 text-gray-400 hover:text-rose-600 rounded"
                          title="تعديل البيانات الأكاديمية"
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    )}
                    
                    {/* Metatags */}
                    <div className="flex flex-wrap gap-2 items-center mt-2.5">
                      <span className="bg-slate-100 text-slate-700 text-xs font-black px-2.5 py-0.5 rounded-md border border-slate-200">
                        الدولة: {activeSummary.country || 'سوريا'}
                      </span>
                      <span className="bg-indigo-50 text-indigo-700 text-xs font-black px-2.5 py-0.5 rounded-md border border-indigo-100">
                        الصف: {activeSummary.grade}
                      </span>
                      <span className="bg-amber-50 text-amber-700 text-xs font-black px-2.5 py-0.5 rounded-md border border-amber-100">
                        المادة: {activeSummary.subject}
                      </span>
                      {activeSummary.part && (
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-black px-2.5 py-0.5 rounded-md border border-emerald-100">
                          الجزء: {activeSummary.part}
                        </span>
                      )}
                      {activeSummary.unit && (
                        <span className="bg-blue-50 text-blue-700 text-xs font-black px-2.5 py-0.5 rounded-md border border-blue-100">
                          الوحدة: {activeSummary.unit}
                        </span>
                      )}
                      <span className="text-xs text-rose-600 font-bold mr-2">
                        المراجع المستخدمة: ({activeSummary.pdfIds?.length || 1}) مراجع
                      </span>
                    </div>
                  </div>

                  {/* Print and Export Buttons */}
                  <div className="flex items-center gap-2 self-stretch md:self-auto">
                    <button
                      onClick={triggerNativePrint}
                      className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-black px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 text-xs float-left"
                    >
                      <Printer size={16} />
                      تجهيز وبدء الطباعة الفورية
                    </button>
                  </div>
                </div>

                {/* Tabs selection: Preview vs Text Editor */}
                <div className="flex border-t border-gray-150 mt-6 pt-3 -mx-6 -mb-6 px-6 bg-white gap-4">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`pb-3 font-bold text-sm border-b-2 transition-all ${
                      activeTab === 'preview'
                        ? 'border-rose-600 text-rose-600 font-black'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    العرض والقراءة والتعليم الذكي
                  </button>
                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`pb-3 font-bold text-sm border-b-2 transition-all ${
                      activeTab === 'editor'
                        ? 'border-rose-600 text-rose-600 font-black'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    التعديل اليدوي للنص وصياغته
                  </button>
                </div>
              </div>

              {/* Main Workspace Contents Layout with inline components and print adjustments */}
              <div className="flex-1 flex flex-col md:flex-row min-h-[50vh]">
                
                {/* Visual rendering standard board */}
                <div className="flex-1 p-6 overflow-y-auto">
                  {activeTab === 'preview' ? (
                    <div className="space-y-6">
                      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-150 text-emerald-950 text-xs font-medium leading-relaxed">
                        💡 <strong>توجيه طباعي وتربوي:</strong> هذا الملخص الإمتحاني مبرمج لحذف السرد والنظريات التقليدية والتركيز عـلى <strong>أسرار ومهارات المسائل</strong> مـع حظر أي تكرار مجهد. يمكنك حقن باقات من نماذج الاختبارات وسحبها بنقرة واحدة من اللوحة الجانبية، مع إمكانية طباعتها منفصلة أو مدمجة.
                      </div>
                      
                      {/* Active Preview Content */}
                      <div className="bg-gray-50 p-6 rounded-xl border border-gray-150 min-h-[40vh]">
                        <MathRenderer content={editedText} />
                        
                        {/* Display Injected Tests if Any */}
                        {activeSummary.injectedTests && activeSummary.injectedTests.length > 0 && testsList && (
                          <div className="mt-10 pt-10 border-t-2 border-dashed border-gray-300">
                            <h3 className="text-xl font-black text-rose-950 mb-4 border-b-2 pb-2">📂 باقة الاختبارات المحقونة في هذا الملف:</h3>
                            {activeSummary.injectedTests.map((testId) => {
                              const testObj = testsList.find(t => t.id === testId);
                              if (!testObj) return null;
                              return (
                                <div key={testId} className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
                                  <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-black text-gray-900">{testObj.title}</h4>
                                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">
                                      مدمج وجاهز للطباعة
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed opacity-85">
                                    {testObj.testData?.sections?.map((s: any, idx: number) => (
                                      <span key={idx} className="inline-block bg-gray-50 px-2 py-1 rounded ml-1 mb-1">
                                         {s.sectionType || s.title || `قسم ${idx + 1}`} ({s.questions?.length || 0} أسئلة)
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <SummaryManualEditor
                      key={activeSummaryId}
                      initialText={editedText}
                      onSave={handleSaveDocChanges}
                      onChange={setEditedText}
                    />
                  )}
                </div>

                {/* Right hand side Tuning Sidebar (col-span-1) */}
                <div className="w-full md:w-80 border-t md:border-t-0 md:border-r border-gray-150 p-6 bg-gradient-to-b from-white to-gray-50/50 space-y-6">
                  
                  {/* Print customisations */}
                  <div className="space-y-4">
                    <span className="block font-black text-xs text-rose-950 uppercase tracking-widest border-b pb-2">خصائص الطباعة والـ PDF</span>
                    
                    {/* Font Selection */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500">نوع الخط العربي:</label>
                      <select
                        value={printFont}
                        onChange={(e) => setPrintFont(e.target.value as any)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-xs font-bold outline-none"
                      >
                        <option value="cairo">خط Cairo العريض والمميز</option>
                        <option value="amiri">خط Amiri الكلاسيكي</option>
                        <option value="tajawal">خط Tajawal الحديث</option>
                        <option value="almarai">خط Almarai الأنيق</option>
                        <option value="notonaskh">خط نوتو لنسخ الكتب</option>
                        <option value="aref">خط الرقعة التراثي</option>
                        <option value="reemkufi">خط الكوفي المربع</option>
                      </select>
                    </div>

                    {/* Font Size */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500">حجم الخط الأساسي:</label>
                      <select
                        value={printFontSize}
                        onChange={(e) => setPrintFontSize(parseInt(e.target.value))}
                        className="w-full p-2 border border-gray-200 rounded-lg text-xs font-bold outline-none"
                      >
                        <option value={10}>10pt</option>
                        <option value={11}>11pt</option>
                        <option value={12}>12pt</option>
                        <option value={13}>13pt (افتراضي)</option>
                        <option value={14}>14pt</option>
                        <option value={15}>15pt</option>
                        <option value={16}>16pt مريح</option>
                      </select>
                    </div>

                    {/* Watermark Section */}
                    <div className="pt-2 border-t border-gray-100">
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={useWatermark}
                          onChange={(e) => setUseWatermark(e.target.checked)}
                          className="rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                        />
                        <span className="text-xs font-bold text-gray-700">تفعيل العلامة المائية</span>
                      </label>
                      
                      {useWatermark && (
                        <input
                          type="text"
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          placeholder="نص العلامة المائية..."
                          className="w-full p-2 border border-gray-250 rounded-md text-xs font-bold outline-none"
                        />
                      )}
                    </div>

                    {/* Print Mode preference */}
                    <div className="space-y-1 border-t pt-3">
                      <label className="text-xs font-bold text-gray-500">تغطية محتوى الطباعة:</label>
                      <select
                        value={printContentMode}
                        onChange={(e) => setPrintContentMode(e.target.value as any)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-xs font-bold bg-rose-50/50 text-rose-700 outline-none"
                      >
                        <option value="summary_only">الملخص فقط</option>
                        <option value="summary_and_questions">الملخص والأسئلة (بدون الحل)</option>
                        <option value="summary_and_solutions">الملخص والأسئلة مع الحل النموذجي</option>
                      </select>
                    </div>

                    {/* Manual Override of Print Content */}
                    <div className="border-t pt-3 space-y-2">
                      <span className="block text-xs font-bold text-gray-500">تخصيص المحتوى يدوياً للطباعة:</span>
                      
                      {isEditingCustomPrint ? (
                        <div className="space-y-2 bg-rose-50/30 p-2 rounded-lg border border-rose-100">
                          <span className="text-[10px] text-rose-700 font-bold block">مفعل حالياً (تعديل مباشر للطباعة)</span>
                          
                          <textarea
                            value={customPrintContent || ''}
                            onChange={(e) => setCustomPrintContent(e.target.value)}
                            className="w-full p-2 h-32 text-[10px] font-mono bg-white border border-gray-200 rounded focus:outline-none"
                            placeholder="تعديل المحتوى الخاص بالطباعة..."
                          />
                          
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setIsEditingCustomPrint(false);
                                if (!customPrintContent?.trim()) setCustomPrintContent(null);
                              }}
                              className="bg-emerald-600 text-white text-[10px] font-black px-2 py-1 rounded"
                            >
                              موافق
                            </button>
                            <button
                              onClick={handleResetToAutomaticPrint}
                              className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-1 rounded"
                            >
                              إلغاء التخصيص
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={handleActivateManualPrintEdit}
                          className="w-full bg-white hover:bg-gray-50 border border-gray-200 font-bold text-xs p-2 rounded-lg flex items-center justify-center gap-1.5"
                        >
                          <Edit3 size={13} />
                          تعديل محتوى الطباعة يدوياً
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Injection Control Panel */}
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="block font-black text-xs text-rose-950 uppercase tracking-widest">الاختبارات المدمجة</span>
                      <button
                        onClick={() => setInjectModalOpen(true)}
                        className="text-xs font-black text-rose-600 hover:text-rose-700 flex items-center gap-1"
                      >
                        <PlusCircle size={14} />
                        حقن جديد
                      </button>
                    </div>

                    {/* Current Injected tests List */}
                    {!activeSummary.injectedTests || activeSummary.injectedTests.length === 0 ? (
                      <p className="text-[11px] text-gray-400 font-medium">لا توجد اختبارات مدمجة لطباعتها رفقة هذا الملخص.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {activeSummary.injectedTests.map((testId) => {
                          const testObj = testsList?.find(t => t.id === testId);
                          if (!testObj) return null;
                          return (
                            <div key={testId} className="flex justify-between items-center text-xs bg-gray-100/80 p-2 rounded-lg border border-gray-200 text-gray-700 font-medium group">
                              <span className="truncate flex-1 max-w-[150px] font-bold">{testObj.title}</span>
                              <button
                                onClick={() => handleRemoveInjected(testId)}
                                className="text-gray-400 hover:text-red-600"
                                title="إلغاء دمج هذا الاختبار"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* AI Quick Assistants */}
                  <div className="border-t pt-4 space-y-2">
                    <span className="block font-black text-xs text-rose-950 uppercase tracking-widest border-b pb-2 mb-2">صقل ذكي بالذكاء الاصطناعي</span>
                    
                    <button
                      onClick={() => {
                        setAiActionType('expand');
                        setAiModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold p-2.5 rounded-xl transition-all border border-purple-150 text-xs"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={14} className="text-purple-600" />
                        توسيع وتعميق مهارات الملخص
                      </span>
                      <ChevronDown size={14} />
                    </button>

                    <button
                      onClick={() => {
                        setAiActionType('condense');
                        setAiModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold p-2.5 rounded-xl transition-all border border-amber-150 text-xs"
                    >
                      <span className="flex items-center gap-1.5">
                        <Scissors size={14} className="text-amber-600" />
                        تقليص وتكثيف فائق للملخص
                      </span>
                      <ChevronUp size={14} />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            /* Selected empty state dashboard view */
            <div className="bg-white rounded-2xl border border-gray-150 p-12 text-center shadow-sm min-h-[50vh] flex flex-col justify-center items-center">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 mb-4 animate-bounce">
                <Bookmark size={32} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">مرحباً بك في قسم ملخصات الامتحان</h3>
              <p className="text-sm text-gray-500 font-medium max-w-md mx-auto mb-6 leading-relaxed">
                هندسة ملخصات امتحانية مكثفة تهدف إلى ليلة المذاكرة السريعة (ساعتين حد أقصى) مع تلخيص وحقن المسائل ودمج المهارات المتقدمة بدون تكرار.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-sm px-6 py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2"
                >
                  <Plus size={16} />
                  توليد ملخص امتحاني جديد
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ========================================== */}
      {/* 🔮 PRINT READY OVERLAY PAGE (Rendered under browser print rules) */}
      {/* ========================================== */}
      <div className="print-only py-8 leading-relaxed text-right font-medium text-gray-900 overflow-visible" dir="rtl">
        {/* Style sheet injection tailored directly for this printing stream */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            body { background: white !important; }
            
            .print-summary-container {
              font-family: ${getFontFamilyCSS()} !important;
              font-size: ${printFontSize}pt !important;
              line-height: 1.8 !important;
            }

            .print-summary-container h1 {
              font-size: ${printFontSize + 8}pt !important;
              font-weight: 900 !important;
              border-bottom: 2px solid black !important;
              padding-bottom: 6pt !important;
              margin-bottom: 14pt !important;
              text-align: center !important;
            }

            .print-summary-container h2 {
              font-size: ${printFontSize + 4}pt !important;
              font-weight: 800 !important;
              border-bottom: 1px solid #777777 !important;
              padding-bottom: 4pt !important;
              margin-top: 18pt !important;
              margin-bottom: 10pt !important;
            }

            .print-summary-container h3 {
              font-size: ${printFontSize + 2}pt !important;
              font-weight: 700 !important;
              margin-top: 12pt !important;
              margin-bottom: 8pt !important;
            }

            .katex {
              font-size: 1.05em !important;
            }

            /* Watermark Overlay configuration */
            .print-watermark-holder {
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
              opacity: 0.08 !important;
              transform: rotate(-30deg) !important;
              font-size: 40pt !important;
              font-weight: 900 !important;
              font-family: ${getFontFamilyCSS()} !important;
              color: #000000 !important;
            }
          }
        `}} />

        {/* Watermark items */}
        {useWatermark && watermarkText && (
          <div className="print-watermark-holder select-none">
            <div>{watermarkText}</div>
            <div>{watermarkText}</div>
            <div>{watermarkText}</div>
            <div>{watermarkText}</div>
          </div>
        )}

        {/* Beautiful Header content for print */}
        <div className="print-summary-container">
          <div className="text-center mb-6 border-b pb-4">
            <h1 className="font-black text-gray-900">{activeSummary?.title || editedTitle}</h1>
            <p className="text-xs font-bold text-gray-600 mt-1">
              أوراق المراجعة الشاملة والدقيقة لليلة الامتحان - الأفكار والمهارات الكبرى
            </p>
            <p className="text-[10px] text-gray-500 mt-2">
              الصف المحدد: {activeSummary?.grade} | المادة: {activeSummary?.subject} | إعداد المعلم حسن راشد العلي
            </p>
          </div>

          {/* Core Content Body Printed */}
          <div className="whitespace-pre-wrap">
            <MathRenderer content={activePrintBody} />
          </div>
        </div>
      </div>


      {/* ========================================== */}
      {/* ⚙️ MODALS & DIALOG BOXES */}
      {/* ========================================== */}
      
      {/* Creation and Merging panel modal */}
      <AnimatePresence>
        {isCreatingNew && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] text-right"
              dir="rtl"
            >
              {/* Modal header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-rose-500/10 to-pink-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100 text-rose-700 flex items-center justify-center rounded-xl">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight">هندسة ملخص ليلة الامتحان الجديد</h3>
                    <p className="text-xs text-gray-400 font-bold mt-1">الذكاء الاصطناعي يقوم بحذف التكرار الحشوي والتسجيل بساعتين مراجعة.</p>
                  </div>
                </div>
                <button
                  onClick={resetCreationForm}
                  className="p-2 hover:bg-gray-150 rounded-full text-gray-400 hover:text-gray-900 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                
                {/* Reference list checklist */}
                <div className="space-y-2">
                  <label className="block text-sm font-black text-gray-800">
                    اختر المراجع والكتب المراد تلخيصها ودمجها معاً: 
                    <span className="text-rose-600 text-xs font-bold mr-1"> (يمكنك تحديد أكثر من مرجع للمواضيع المشتركة)</span>
                  </label>
                  
                  {!libraryDocs || libraryDocs.length === 0 ? (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs font-bold text-center">
                      ⚠️ لا يوجد أي مراجع مرفوعة في المكتبة حالياً. الرجاء الذهاب لقسم رفع الملفات أولاً لتتمكن من دمجها.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1 text-xs">
                      {libraryDocs.map((doc) => {
                        const isChecked = selectedDocs.includes(doc.id!);
                        return (
                          <label
                            key={doc.id}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                              isChecked
                                ? 'border-rose-500 bg-rose-50/20'
                                : 'border-gray-150 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => setSelectedDocs(prev =>
                                prev.includes(doc.id!) ? prev.filter(id => id !== doc.id!) : [...prev, doc.id!]
                              )}
                              className="mt-0.5 rounded border-gray-300 text-rose-600 focus:ring-rose-550 h-4 w-4"
                            />
                            <div>
                              <strong className="text-gray-900 font-black leading-relaxed">{doc.title}</strong>
                              <p className="text-[10px] text-gray-400 mt-1">{doc.grade} | {doc.subject}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Title Input */}
                <div className="space-y-1">
                  <label className="block text-sm font-black text-gray-800">عنوان الملخص الإمتحاني:</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="مثال: المكثفة النهائية لليلة الامتحان - الأعداد المركبة والتحليل"
                    className="w-full border-2 border-gray-150 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-rose-400"
                  />
                  <p className="text-[10px] text-gray-400 font-medium font-bold mr-1 mt-0.5">
                    يتم اقتراح العنوان بشكل ذكي حسب الكتب المحددة للدمج وسحب التكرار تلقائياً.
                  </p>
                </div>

                {/* Academic Metadata Fields */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <AcademicMetadataFields
                    metadata={newMetadata}
                    onChange={(updated) => setNewMetadata(updated)}
                  />
                </div>

                {/* Pedagogical disclaimer constraints */}
                <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-150/40 text-rose-950 text-xs space-y-1 font-medium leading-relaxed">
                  <h4 className="font-black text-rose-900">🚨 القيود التربوية والتحذيرية المطبقة برمجياً:</h4>
                  <ul className="list-disc list-inside space-y-1 pr-2">
                    <li>يتم إزاحة الحشو الكلامي السردي والأمثلة المحلولة الكلاسيكية لتقليص وقت المذاكرة.</li>
                    <li>عند وجود تمارين ذات مهارات عقلية متميزة، يتم صياغة تلميح وسر حركي مختصر جداً للحل.</li>
                    <li>في صميم دمج المراجع المتعددة، يلغي المعالج تكرار المهارات المتشابهة للحفاظ على وقت الطالب.</li>
                  </ul>
                </div>
              </div>

              {/* Generation status and footer */}
              <div className="p-6 border-t border-gray-100 bg-gray-50">
                {generating ? (
                  <div className="space-y-3 text-center py-2 animate-pulse">
                    <div className="flex items-center justify-center gap-2 text-rose-600 font-black text-sm">
                      <Loader2 size={18} className="animate-spin" />
                      {generationProgress || 'جاري سبر وصهر المستندات وتحرير مهارات ليلة الامتحان...'}
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mx-auto max-w-sm">
                      <div className="bg-gradient-to-r from-rose-500 to-pink-500 h-full w-4/5 rounded-full animate-infinite-loading" />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={resetCreationForm}
                      className="p-3 px-6 border-2 border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors"
                    >
                      إلغاء التراجع
                    </button>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={selectedDocs.length === 0}
                      className={`p-3 px-6 rounded-xl text-sm font-black text-white flex items-center gap-2 transition-all shadow-md active:scale-95 ${
                        selectedDocs.length === 0
                          ? 'bg-gray-300 cursor-not-allowed shadow-none'
                          : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700'
                      }`}
                    >
                      <Sparkles size={16} />
                      توليد ملخص ليلة الامتحان بالذكاء الاصطناعي
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Prompt / Tuning Instruction Modal */}
      <AnimatePresence>
        {aiModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-right"
              dir="rtl"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 text-purple-700 flex items-center justify-center rounded-xl">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 leading-tight">
                      {aiActionType === 'expand' ? 'توجيهات توسيع مهارات الملخص' : 'توجيهات تقليص وتكثيف الملخص'}
                    </h3>
                    <p className="text-xs text-gray-400 font-bold mt-1">اكتب أي تعليمات محددة ترغب في أن يلتزم بها الذكاء الاصطناعي.</p>
                  </div>
                </div>
                <button
                  onClick={() => setAiModalOpen(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder={
                    aiActionType === 'expand'
                      ? "مثال: أضف مهارة حل المتراجحات الأسية عن طريق تغيير المتحول مع شرح مختصر جداً وبسيط بدون تكرار للقوانين الأساسية."
                      : "مثال: ركز فقط على تلخيص وحساب اللوغاريتم المشتق ومقررات الأشعة والتحليل، واحذف التفاصيل الجانبية والتمارين الإضافية."
                  }
                  className="w-full border-2 border-gray-150 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-rose-450 h-32 leading-relaxed"
                />
              </div>

              {/* Footer */}
              <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
                {aiRegenerating ? (
                  <div className="flex items-center gap-2 text-rose-600 font-black text-xs min-h-[36px]">
                    <Loader2 size={15} className="animate-spin" />
                    جاري صياغة التعديلات الذكية في نسيج المعارف والمهارات...
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setAiModalOpen(false)}
                      className="p-2 px-4 border border-gray-200 text-gray-600 font-bold text-xs rounded-lg hover:bg-gray-100"
                    >
                      إلغاء التراجع
                    </button>
                    <button
                      onClick={handleAiRefinementSubmit}
                      className="p-2 px-5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-lg shadow-md active:scale-95"
                    >
                      إرسال الطلب وتنفيذ الصقل الذكي
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tests Injection Selection Modal */}
      <AnimatePresence>
        {injectModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh] text-right"
              dir="rtl"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-700 flex items-center justify-center rounded-xl">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 leading-tight">اختر الاختبارات لحقن بنودها</h3>
                    <p className="text-xs text-gray-400 font-bold mt-1">سيتم سحب الأسئلة والأقسام المقررة وصهرها رفقة مراجعة الملخص.</p>
                  </div>
                </div>
                <button
                  onClick={() => setInjectModalOpen(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body checklist */}
              <div className="p-6 overflow-y-auto space-y-3 flex-1">
                {!testsList || testsList.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs font-bold">
                     لا يوجد اختبارات مولدة حالياً. الرجاء الانتقال لصفحة "توليد اختبار" وصنع اختبارات مسبقاً.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {testsList.map((test) => {
                      const isChecked = selectedTestsToInject.includes(test.id!);
                      const isAlreadyInjected = activeSummary?.injectedTests?.includes(test.id!) || false;
                      
                      return (
                        <label
                          key={test.id}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                            isAlreadyInjected
                              ? 'bg-gray-50 border-gray-150 cursor-not-allowed opacity-60'
                              : isChecked
                              ? 'border-emerald-500 bg-emerald-50/10'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked || isAlreadyInjected}
                            disabled={isAlreadyInjected}
                            onChange={() => {
                              if (isAlreadyInjected) return;
                              setSelectedTestsToInject(prev =>
                                prev.includes(test.id!) ? prev.filter(id => id !== test.id!) : [...prev, test.id!]
                              );
                            }}
                            className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          />
                          <div>
                            <strong className="text-xs text-gray-900 font-black leading-relaxed">
                              {test.title} {isAlreadyInjected && <span className="text-[10px] text-gray-400 font-bold">(محاقن مسبقاً)</span>}
                            </strong>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {test.grade} | {test.subject} | {test.difficulty}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
                <button
                  onClick={() => setInjectModalOpen(false)}
                  className="p-2 px-4 border border-gray-200 text-gray-600 font-bold text-xs rounded-lg hover:bg-gray-100"
                >
                  إلغاء التراجع
                </button>
                <button
                  onClick={handleInjectTestsSubmit}
                  disabled={selectedTestsToInject.length === 0}
                  className={`p-2 px-5 text-white font-black text-xs rounded-lg shadow-md transition-all ${
                    selectedTestsToInject.length === 0
                      ? 'bg-gray-300 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                  }`}
                >
                  تأكيد حقن الاختبارات المدمجة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global alert / confirm custom dialog wrapper */}
      <CustomDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onConfirm={dialogConfig.onConfirm}
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Edit Metadata Modal */}
      {editingSummary && (
        <DocumentMetadataModal
          isOpen={!!editingSummary}
          onClose={() => setEditingSummary(null)}
          document={{
            id: editingSummary.id,
            title: editingSummary.title,
            country: editingSummary.country || 'سوريا',
            grade: editingSummary.grade,
            subject: editingSummary.subject,
            part: editingSummary.part,
            unit: editingSummary.unit
          }}
          onSave={handleSaveSummaryMetadata}
        />
      )}

    </div>
  );
};
