import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Loader2, 
  Edit3, 
  Save, 
  Trash2, 
  Check, 
  Copy, 
  Printer, 
  BookOpen, 
  Layers, 
  AlertTriangle, 
  Lightbulb, 
  Target, 
  FileText, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  HelpCircle,
  Hash,
  Bookmark
} from 'lucide-react';
import { 
  db, 
  type Document, 
  type LessonSection, 
  type UnitComprehensiveReview 
} from '../db';
import { 
  generateUnitComprehensiveReviewAI, 
  type GeneratedUnitReviewResult 
} from '../services/gemini';
import { MathRenderer } from './MathRenderer';
import { SyncControlButton } from './SyncControlButton';
import { SyncStatusBadge } from './SyncStatusBadge';

interface UnitComprehensiveReviewSectionProps {
  document: Document;
  sections: LessonSection[];
  isAdmin?: boolean;
  onUpdate?: () => void;
}

export const UnitComprehensiveReviewSection: React.FC<UnitComprehensiveReviewSectionProps> = ({
  document,
  sections,
  isAdmin = true,
  onUpdate
}) => {
  const [review, setReview] = useState<UnitComprehensiveReview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'all' | 'definitions' | 'theorems' | 'results' | 'traps' | 'formulas'>('all');
  
  // Custom instruction prompt state
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [showPromptInput, setShowPromptInput] = useState<boolean>(false);

  // Manual Add Modal state
  const [isManualAddModalOpen, setIsManualAddModalOpen] = useState<boolean>(false);
  const [manualCategory, setManualCategory] = useState<'definition' | 'theorem' | 'result' | 'trap' | 'summary' | 'formula'>('definition');
  
  // Form fields for manual addition
  const [defTerm, setDefTerm] = useState<string>('');
  const [defExplanation, setDefExplanation] = useState<string>('');
  const [defFormula, setDefFormula] = useState<string>('');

  const [thmName, setThmName] = useState<string>('');
  const [thmStatement, setThmStatement] = useState<string>('');
  const [thmConditions, setThmConditions] = useState<string>('');
  const [thmNotes, setThmNotes] = useState<string>('');

  const [resTitle, setResTitle] = useState<string>('');
  const [resStatement, setResStatement] = useState<string>('');
  const [resFormula, setResFormula] = useState<string>('');

  const [trapTitle, setTrapTitle] = useState<string>('');
  const [trapText, setTrapText] = useState<string>('');
  const [trapCorrectMethod, setTrapCorrectMethod] = useState<string>('');

  const [summaryAddition, setSummaryAddition] = useState<string>('');
  const [formulaAddition, setFormulaAddition] = useState<string>('');

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editableReview, setEditableReview] = useState<UnitComprehensiveReview | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const docId = document.id;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Open manual add modal
  const handleOpenManualAdd = (category: 'definition' | 'theorem' | 'result' | 'trap' | 'summary' | 'formula' = 'definition') => {
    setManualCategory(category);
    setDefTerm('');
    setDefExplanation('');
    setDefFormula('');
    setThmName('');
    setThmStatement('');
    setThmConditions('');
    setThmNotes('');
    setResTitle('');
    setResStatement('');
    setResFormula('');
    setTrapTitle('');
    setTrapText('');
    setTrapCorrectMethod('');
    setSummaryAddition('');
    setFormulaAddition('');
    setIsManualAddModalOpen(true);
  };

  // Save manual paragraph
  const handleSaveManualParagraph = async () => {
    if (!docId) return;
    setIsSaving(true);
    try {
      let currentReview: UnitComprehensiveReview;

      if (review) {
        currentReview = JSON.parse(JSON.stringify(review));
      } else {
        currentReview = {
          docId,
          title: `مراجعة شاملة: ${document.unit || document.title}`,
          unit: document.unit || document.title,
          grade: document.grade,
          subject: document.subject,
          summaryText: '',
          definitions: [],
          theorems: [],
          results: [],
          trapsAndTips: [],
          formulasSummary: '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }

      if (manualCategory === 'definition') {
        if (!defTerm.trim() || !defExplanation.trim()) {
          alert('يرجى كتابة المصطلح وشرح المفهوم على الأقل.');
          setIsSaving(false);
          return;
        }
        currentReview.definitions = currentReview.definitions || [];
        currentReview.definitions.push({
          id: `def_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          term: defTerm.trim(),
          explanation: defExplanation.trim(),
          formula: defFormula.trim() ? defFormula.trim() : undefined
        });
        setActiveTab('definitions');
      } else if (manualCategory === 'theorem') {
        if (!thmName.trim() || !thmStatement.trim()) {
          alert('يرجى كتابة اسم المبرهنة ونصها الرياضي.');
          setIsSaving(false);
          return;
        }
        currentReview.theorems = currentReview.theorems || [];
        currentReview.theorems.push({
          id: `thm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: thmName.trim(),
          statement: thmStatement.trim(),
          conditions: thmConditions.trim() ? thmConditions.trim() : undefined,
          notes: thmNotes.trim() ? thmNotes.trim() : undefined
        });
        setActiveTab('theorems');
      } else if (manualCategory === 'result') {
        if (!resTitle.trim() || !resStatement.trim()) {
          alert('يرجى كتابة عنوان النتيجة ونصها.');
          setIsSaving(false);
          return;
        }
        currentReview.results = currentReview.results || [];
        currentReview.results.push({
          id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: resTitle.trim(),
          statement: resStatement.trim(),
          formula: resFormula.trim() ? resFormula.trim() : undefined
        });
        setActiveTab('results');
      } else if (manualCategory === 'trap') {
        if (!trapTitle.trim() || !trapText.trim() || !trapCorrectMethod.trim()) {
          alert('يرجى كتابة عنوان المطب، الخطأ الشائع، والتفكير السليم.');
          setIsSaving(false);
          return;
        }
        currentReview.trapsAndTips = currentReview.trapsAndTips || [];
        currentReview.trapsAndTips.push({
          id: `trap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: trapTitle.trim(),
          trap: trapText.trim(),
          correctMethod: trapCorrectMethod.trim()
        });
        setActiveTab('traps');
      } else if (manualCategory === 'summary') {
        if (!summaryAddition.trim()) {
          alert('يرجى كتابة نص الفقرة المراد إضافتها للملخص.');
          setIsSaving(false);
          return;
        }
        currentReview.summaryText = currentReview.summaryText 
          ? `${currentReview.summaryText}\n\n${summaryAddition.trim()}`
          : summaryAddition.trim();
        setActiveTab('all');
      } else if (manualCategory === 'formula') {
        if (!formulaAddition.trim()) {
          alert('يرجى كتابة القانون أو العلاقة الرياضية.');
          setIsSaving(false);
          return;
        }
        currentReview.formulasSummary = currentReview.formulasSummary 
          ? `${currentReview.formulasSummary}\n\n${formulaAddition.trim()}`
          : formulaAddition.trim();
        setActiveTab('formulas');
      }

      currentReview.updatedAt = Date.now();

      if (currentReview.id) {
        await db.unitComprehensiveReviews.put(currentReview);
      } else {
        const id = await db.unitComprehensiveReviews.add(currentReview);
        currentReview.id = id as number;
      }

      setReview(currentReview);
      setIsManualAddModalOpen(false);
      showToast('تمت إضافة الفقرة يدوياً وتحديث المراجعة بنجاح! ✍️✨');
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error saving manual paragraph:', err);
      alert('حدث خطأ أثناء حفظ الفقرة.');
    } finally {
      setIsSaving(false);
    }
  };

  // Load review from DB
  const loadReviewFromDb = async () => {
    if (!docId) return;
    setIsLoading(true);
    try {
      const stored = await db.unitComprehensiveReviews.where('docId').equals(docId).first();
      if (stored) {
        setReview(stored);
      } else {
        setReview(null);
      }
    } catch (err) {
      console.error('Error loading unit review from DB:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviewFromDb();
  }, [docId]);

  // Handle AI Generation
  const handleGenerateAI = async () => {
    if (!docId) return;
    setIsGenerating(true);
    try {
      const res: GeneratedUnitReviewResult = await generateUnitComprehensiveReviewAI(
        document,
        sections,
        customPrompt.trim() ? customPrompt.trim() : undefined
      );

      if (res) {
        const newReview: UnitComprehensiveReview = {
          docId,
          title: res.title || `مراجعة شاملة: ${document.unit || document.title}`,
          unit: res.unit || document.unit || document.title,
          grade: document.grade,
          subject: document.subject,
          summaryText: res.summaryText || '',
          definitions: res.definitions || [],
          theorems: res.theorems || [],
          results: res.results || [],
          trapsAndTips: res.trapsAndTips || [],
          formulasSummary: res.formulasSummary || '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const existing = await db.unitComprehensiveReviews.where('docId').equals(docId).first();
        if (existing?.id) {
          newReview.id = existing.id;
          await db.unitComprehensiveReviews.put(newReview);
        } else {
          const id = await db.unitComprehensiveReviews.add(newReview);
          newReview.id = id as number;
        }

        setReview(newReview);
        setShowPromptInput(false);
        showToast('تم استخلاص المراجعة الشاملة النظرية بنجاح بالذكاء الاصطناعي! 📚✨');
        if (onUpdate) onUpdate();
      }
    } catch (err: any) {
      console.error('Error generating unit review:', err);
      alert(err?.message || 'حدث خطأ أثناء استخلاص المراجعة الشاملة.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save manual edit
  const handleSaveEdit = async () => {
    if (!editableReview || !docId) return;
    setIsSaving(true);
    try {
      const updated: UnitComprehensiveReview = {
        ...editableReview,
        updatedAt: Date.now()
      };

      if (updated.id) {
        await db.unitComprehensiveReviews.put(updated);
      } else {
        const id = await db.unitComprehensiveReviews.add(updated);
        updated.id = id as number;
      }

      setReview(updated);
      setIsEditModalOpen(false);
      showToast('تم حفظ تعديلات المراجعة الشاملة بنجاح! 💾');
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error saving review edit:', err);
      alert('حدث خطأ أثناء حفظ التعديلات.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete review
  const handleDeleteReview = async () => {
    if (!review?.id) return;
    if (window.confirm('هل أنت متأكد من حذف المراجعة الشاملة لهذه الوحدة؟')) {
      try {
        await db.unitComprehensiveReviews.delete(review.id);
        setReview(null);
        showToast('تم حذف المراجعة الشاملة.');
        if (onUpdate) onUpdate();
      } catch (err) {
        console.error('Error deleting review:', err);
      }
    }
  };

  // Copy Markdown to Clipboard
  const handleCopyMarkdown = () => {
    if (!review) return;
    let fullText = `# ${review.title}\n\n`;
    if (review.summaryText) {
      fullText += `## الملخص النظري الشامل:\n${review.summaryText}\n\n`;
    }
    if (review.definitions && review.definitions.length > 0) {
      fullText += `## 📖 التعاريف والمفاهيم:\n`;
      review.definitions.forEach((d, i) => {
        fullText += `### ${i + 1}. ${d.term}\n${d.explanation}\n${d.formula ? `الصيغة: ${d.formula}\n` : ''}\n`;
      });
    }
    if (review.theorems && review.theorems.length > 0) {
      fullText += `## 📐 المبرهنات والنظريات:\n`;
      review.theorems.forEach((t, i) => {
        fullText += `### ${i + 1}. ${t.name}\n${t.statement}\n${t.conditions ? `الشروط: ${t.conditions}\n` : ''}${t.notes ? `ملاحظات: ${t.notes}\n` : ''}\n`;
      });
    }
    if (review.results && review.results.length > 0) {
      fullText += `## ⚡ النتائج والقواعد والخواص:\n`;
      review.results.forEach((r, i) => {
        fullText += `### ${i + 1}. ${r.title}\n${r.statement}\n${r.formula ? `القانون: ${r.formula}\n` : ''}\n`;
      });
    }
    if (review.trapsAndTips && review.trapsAndTips.length > 0) {
      fullText += `## ⚠️ المطبات الامتحانية والتوجيهات الذهبية:\n`;
      review.trapsAndTips.forEach((tr, i) => {
        fullText += `### ${i + 1}. ${tr.title}\n- المطب الشائع: ${tr.trap}\n- الحل والتفكير السليم: ${tr.correctMethod}\n\n`;
      });
    }

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    showToast('تم نسخ نص المراجعة الشاملة كاملاً إلى الحافظة! 📋');
  };

  const hasDefinitions = review?.definitions && review.definitions.length > 0;
  const hasTheorems = review?.theorems && review.theorems.length > 0;
  const hasResults = review?.results && review.results.length > 0;
  const hasTraps = review?.trapsAndTips && review.trapsAndTips.length > 0;
  const hasFormulas = !!(review?.formulasSummary && review.formulasSummary.trim());

  if (isLoading) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-violet-100 shadow-sm space-y-3 font-sans">
        <Loader2 className="animate-spin text-violet-600 mx-auto" size={32} />
        <p className="text-sm font-bold text-gray-600">جارٍ تحميل المراجعة الشاملة للوحدة...</p>
      </div>
    );
  }

  return (
    <div id="unit-comprehensive-review-section" className="space-y-6 scroll-mt-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in border border-slate-700 text-sm font-bold no-print">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header Container */}
      <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden print:bg-white print:text-black print:p-4 print:border-b-2 print:border-violet-900 print:shadow-none">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial-gradient opacity-15 pointer-events-none no-print"></div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3 py-0.5 rounded-full text-xs font-black tracking-wide uppercase flex items-center gap-1.5 print:border-violet-800 print:text-violet-900 print:bg-violet-50">
                <Bookmark size={13} className="text-amber-300 print:text-violet-700" />
                المحطة الختامية للوحدة
              </span>
              <span className="bg-white/15 text-violet-100 px-3 py-0.5 rounded-full text-xs font-bold print:hidden">
                {document.grade} - {document.subject}
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-3">
              <span>مراجعة شاملة للوحدة</span>
              <span className="text-amber-300 text-base md:text-lg font-bold">
                ({document.unit || document.title})
              </span>
            </h2>
            <p className="text-xs md:text-sm text-violet-200 font-medium leading-relaxed print:text-gray-700">
              ملخص مركّز ومحكم لكافة الأفكار والمفاهيم النظرية (التعاريف، المبرهنات، النتائج، المطبات الامتحانية والقوانين) لضمان التثبيت المفهومي والجاهزية التامة للامتحان.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2.5 no-print">
            <button
              onClick={() => handleOpenManualAdd('definition')}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="إضافة فقرة جديدة يدوياً (تعريف، مبرهنة، نتيجة، مطب، قانون)"
            >
              <Plus size={16} className="text-emerald-950 stroke-[3]" />
              <span>إضافة يدوية ✍️</span>
            </button>

            <button
              onClick={() => {
                setShowPromptInput(!showPromptInput);
              }}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              title="استخلاص أو إعادة استخلاص المراجعة بالذكاء الاصطناعي"
            >
              <Sparkles size={16} className="text-amber-900 animate-pulse" />
              <span>{review ? 'إعادة استخلاص بالذكاء الاصطناعي 🤖✨' : 'استخلاص الملخص بالذكاء الاصطناعي 🤖✨'}</span>
            </button>

            {review && (
              <>
                <SyncControlButton
                  table="unitComprehensiveReviews"
                  id={review.id!}
                  data={review}
                  showDraftOption={true}
                  buttonText="نشر المراجعة"
                />

                <button
                  onClick={() => {
                    setEditableReview(JSON.parse(JSON.stringify(review)));
                    setIsEditModalOpen(true);
                  }}
                  className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="تعديل يدوي لنصوص المراجعة"
                >
                  <Edit3 size={15} />
                  <span>تعديل شامل 📝</span>
                </button>

                <button
                  onClick={handleCopyMarkdown}
                  className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="نسخ نص المراجعة بالكامل"
                >
                  {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                  <span>{copied ? 'تم النسخ' : 'نسخ 📋'}</span>
                </button>

                <button
                  onClick={handleDeleteReview}
                  className="p-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 border border-red-500/30 rounded-xl text-xs transition-all cursor-pointer"
                  title="حذف المراجعة"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Optional Custom Instructions Box */}
        {showPromptInput && (
          <div className="mt-5 pt-5 border-t border-white/15 space-y-3 no-print animate-fade-in">
            <label className="block text-xs font-black text-amber-200">
              توجيهات وإضافات خاصة للذكاء الاصطناعي أثناء استخلاص المراجعة (اختياري):
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="مثال: ركّز على شروط مبرهنة الإحاطة، واكتب مقارنة دقيقة بين المتتاليات الحسابية والهندسية، مع إبراز الفخاخ الامتحانية لحساب النهايات..."
              rows={2}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-xl text-xs text-white placeholder:text-violet-300/60 focus:ring-2 focus:ring-amber-400 focus:outline-none font-sans"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPromptInput(false)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="px-5 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-amber-950 text-xs font-black rounded-lg shadow transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>بدء الاستخلاص الفوري 🚀</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generation in Progress State */}
      {isGenerating && (
        <div className="p-12 text-center bg-white rounded-3xl border-2 border-violet-200 shadow-lg space-y-4 animate-pulse no-print font-sans">
          <div className="w-16 h-16 bg-violet-100 text-violet-700 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Sparkles className="animate-spin text-violet-600" size={32} />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-black text-gray-900">جارٍ استخلاص المراجعة الشاملة للنظرية بالذكاء الاصطناعي...</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
              يقوم الذكاء الاصطناعي الآن بقراءة كافة فقرات الوحدة، تصنيف التعاريف، استخراج المبرهنات وشروطها، صياغة النتائج والقواعد، ورصد المطبات الامتحانية بدقة بيداغوجية...
            </p>
          </div>
        </div>
      )}

      {/* Empty State when no review exists yet */}
      {!review && !isGenerating && (
        <div className="p-10 text-center bg-white rounded-3xl border-2 border-dashed border-violet-200 shadow-sm space-y-4 no-print font-sans">
          <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-3xl flex items-center justify-center mx-auto text-2xl shadow-inner">
            📚
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-black text-gray-850">لم يتم استخلاص مراجعة شاملة لهذه الوحدة بعد</h3>
            <p className="text-xs text-gray-500 max-w-lg mx-auto leading-relaxed">
              يمكنك استخلاص الملخص تلقائياً بالذكاء الاصطناعي أو البدء بإضافة الفقرات والتعاريف والمبرهنات يدوياً.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => handleOpenManualAdd('definition')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={16} className="stroke-[3]" />
              <span>إضافة فقرة يدوياً ✍️</span>
            </button>
            <button
              onClick={() => handleGenerateAI()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Sparkles size={16} />
              <span>استخلاص المراجعة الشاملة الآن 🤖✨</span>
            </button>
          </div>
        </div>
      )}

      {/* Rendered Review Content */}
      {review && !isGenerating && (
        <div className="space-y-6">
          
          {/* Navigation / Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 no-print">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Layers size={14} />
              <span>العرض الشامل المتكامل 🌟</span>
            </button>

            {hasDefinitions && (
              <button
                onClick={() => setActiveTab('definitions')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'definitions'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <BookOpen size={14} />
                <span>التعاريف والمفاهيم ({review.definitions?.length}) 📖</span>
              </button>
            )}

            {hasTheorems && (
              <button
                onClick={() => setActiveTab('theorems')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'theorems'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Target size={14} />
                <span>المبرهنات والنظريات ({review.theorems?.length}) 📐</span>
              </button>
            )}

            {hasResults && (
              <button
                onClick={() => setActiveTab('results')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'results'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Lightbulb size={14} />
                <span>النتائج والخواص ({review.results?.length}) ⚡</span>
              </button>
            )}

            {hasTraps && (
              <button
                onClick={() => setActiveTab('traps')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'traps'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <AlertTriangle size={14} />
                <span>المطبات الامتحانية ({review.trapsAndTips?.length}) ⚠️</span>
              </button>
            )}

            {hasFormulas && (
              <button
                onClick={() => setActiveTab('formulas')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'formulas'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Hash size={14} />
                <span>خلاصة القوانين 🧮</span>
              </button>
            )}
            <button
              onClick={() => handleOpenManualAdd('definition')}
              className="mr-auto px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="إضافة فقرة جديدة يدوياً"
            >
              <Plus size={14} className="stroke-[3] text-emerald-700" />
              <span>+ إضافة فقرة ✍️</span>
            </button>
          </div>

          {/* Section 1: Summary Master Text (Visible in 'all' tab or standalone) */}
          {(activeTab === 'all') && review.summaryText && (
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-violet-100 shadow-sm space-y-4 print:p-0 print:border-none print:shadow-none">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 text-violet-900 font-black text-base">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-violet-600" />
                  <span>الملخص النظري المنسق للوحدة:</span>
                </div>
                <button
                  onClick={() => handleOpenManualAdd('summary')}
                  className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-xs font-bold transition-all no-print flex items-center gap-1"
                >
                  <Plus size={13} />
                  <span>إضافة نص للملخص</span>
                </button>
              </div>
              <div className="text-[14px] md:text-[15px] leading-loose text-gray-800 text-right space-y-3 font-medium">
                <MathRenderer content={review.summaryText} />
              </div>
            </div>
          )}

          {/* Section 2: Definitions (التعاريف والمفاهيم) */}
          {(activeTab === 'all' || activeTab === 'definitions') && hasDefinitions && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-indigo-950 font-black text-base md:text-lg">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm">
                    📖
                  </span>
                  <span>التعاريف والمفاهيم الأساسية:</span>
                </div>
                <button
                  onClick={() => handleOpenManualAdd('definition')}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all no-print flex items-center gap-1"
                >
                  <Plus size={14} className="stroke-[3]" />
                  <span>إضافة تعريف جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {review.definitions?.map((def, idx) => (
                  <div 
                    key={def.id || idx}
                    className="bg-indigo-50/40 hover:bg-indigo-50/70 border border-indigo-150/70 rounded-2xl p-5 space-y-2.5 transition-all text-right shadow-xs print:bg-white print:border-gray-300"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                      <span className="text-xs font-black text-indigo-900 bg-indigo-100 px-3 py-1 rounded-lg">
                        {def.term}
                      </span>
                      <span className="text-[11px] font-bold text-indigo-400 font-sans">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="text-xs md:text-sm text-gray-800 leading-relaxed font-medium">
                      <MathRenderer content={def.explanation} />
                    </div>
                    {def.formula && (
                      <div className="pt-2 border-t border-indigo-100/60 text-xs font-mono text-indigo-950 bg-white/80 p-2.5 rounded-xl border border-indigo-100 flex items-center justify-center">
                        <MathRenderer content={def.formula} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Theorems & Principles (المبرهنات والنظريات) */}
          {(activeTab === 'all' || activeTab === 'theorems') && hasTheorems && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-emerald-950 font-black text-base md:text-lg">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm">
                    📐
                  </span>
                  <span>المبرهنات والنظريات الأساسية وشروط تطبيقها:</span>
                </div>
                <button
                  onClick={() => handleOpenManualAdd('theorem')}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all no-print flex items-center gap-1"
                >
                  <Plus size={14} className="stroke-[3]" />
                  <span>إضافة مبرهنة جديدة</span>
                </button>
              </div>

              <div className="space-y-4">
                {review.theorems?.map((thm, idx) => (
                  <div 
                    key={thm.id || idx}
                    className="bg-emerald-50/40 hover:bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-5 space-y-3 transition-all text-right shadow-xs print:bg-white print:border-gray-300"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-emerald-150 pb-2">
                      <h4 className="text-sm md:text-base font-black text-emerald-950 flex items-center gap-2">
                        <span className="text-emerald-700">★</span>
                        <span>{thm.name}</span>
                      </h4>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-100/80 px-2.5 py-0.5 rounded-lg">
                        مبرهنة #{idx + 1}
                      </span>
                    </div>

                    <div className="text-xs md:text-sm text-gray-900 leading-relaxed font-semibold p-3.5 bg-white rounded-xl border border-emerald-100">
                      <span className="text-xs font-black text-emerald-900 block mb-1">📜 نص المبرهنة:</span>
                      <MathRenderer content={thm.statement} />
                    </div>

                    {thm.conditions && (
                      <div className="text-xs text-emerald-950 leading-relaxed font-medium p-3 bg-emerald-100/40 rounded-xl border border-emerald-200/50">
                        <span className="font-black text-emerald-900 block mb-0.5">🔍 شروط الانطلاق والتطبيق:</span>
                        <MathRenderer content={thm.conditions} />
                      </div>
                    )}

                    {thm.notes && (
                      <div className="text-xs text-gray-700 leading-relaxed font-medium p-2.5 bg-gray-50 rounded-xl border border-gray-200/60">
                        <span className="font-black text-gray-900 block mb-0.5">💡 إرشادات وملاحظات تطبيقية:</span>
                        <MathRenderer content={thm.notes} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Results & Corollaries (النتائج والقواعد والخواص) */}
          {(activeTab === 'all' || activeTab === 'results') && hasResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-blue-950 font-black text-base md:text-lg">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-sm">
                    ⚡
                  </span>
                  <span>النتائج والقواعد والخواص الرياضية المنبثقة:</span>
                </div>
                <button
                  onClick={() => handleOpenManualAdd('result')}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all no-print flex items-center gap-1"
                >
                  <Plus size={14} className="stroke-[3]" />
                  <span>إضافة نتيجة / خاصة</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {review.results?.map((res, idx) => (
                  <div 
                    key={res.id || idx}
                    className="bg-blue-50/40 hover:bg-blue-50/60 border border-blue-150/80 rounded-2xl p-5 space-y-2.5 transition-all text-right shadow-xs print:bg-white print:border-gray-300"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-blue-100 pb-2">
                      <span className="text-xs font-black text-blue-950">
                        {res.title}
                      </span>
                      <span className="text-[11px] font-bold text-blue-500">
                        قاعدة #{idx + 1}
                      </span>
                    </div>

                    <div className="text-xs md:text-sm text-gray-850 leading-relaxed font-medium">
                      <MathRenderer content={res.statement} />
                    </div>

                    {res.formula && (
                      <div className="pt-2 border-t border-blue-100 text-xs font-mono text-blue-950 bg-white p-2.5 rounded-xl border border-blue-100 flex items-center justify-center">
                        <MathRenderer content={res.formula} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Traps and Crucial Exam Tips (المطبات الامتحانية والتوجيهات الذهبية) */}
          {(activeTab === 'all' || activeTab === 'traps') && hasTraps && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-amber-950 font-black text-base md:text-lg">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-sm">
                    ⚠️
                  </span>
                  <span>المطبات الامتحانية وملاحظات التوجيه الذهبي:</span>
                </div>
                <button
                  onClick={() => handleOpenManualAdd('trap')}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition-all no-print flex items-center gap-1"
                >
                  <Plus size={14} className="stroke-[3]" />
                  <span>إضافة مطب امتحاني</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {review.trapsAndTips?.map((trap, idx) => (
                  <div 
                    key={trap.id || idx}
                    className="bg-amber-50/50 hover:bg-amber-50/80 border border-amber-200 rounded-2xl p-5 space-y-3 transition-all text-right shadow-xs print:bg-white print:border-gray-300"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-amber-200/70 pb-2">
                      <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                        <span>🚨</span>
                        <span>{trap.title}</span>
                      </span>
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                        مطب امتحاني #{idx + 1}
                      </span>
                    </div>

                    <div className="p-3 bg-red-50/70 border border-red-200/80 rounded-xl text-xs text-red-950 leading-relaxed font-medium">
                      <span className="font-black text-red-900 block mb-0.5">❌ الخطأ الشائع لدى الطلاب:</span>
                      <MathRenderer content={trap.trap} />
                    </div>

                    <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs text-emerald-950 leading-relaxed font-medium">
                      <span className="font-black text-emerald-900 block mb-0.5">✅ القاعدة والتفكير السليم لتفاديه:</span>
                      <MathRenderer content={trap.correctMethod} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 6: Formulas Summary (خلاصة القوانين) */}
          {(activeTab === 'all' || activeTab === 'formulas') && hasFormulas && (
            <div className="bg-amber-50/40 hover:bg-amber-50/70 rounded-3xl p-6 md:p-8 border border-amber-200 shadow-xs space-y-4 transition-all print:bg-white print:p-0 print:border-none print:shadow-none">
              <div className="flex items-center justify-between pb-3 border-b border-amber-200/80 text-amber-950 font-black text-base md:text-lg">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-black">
                    🧮
                  </span>
                  <span>خلاصة القوانين والعلاقات الرياضية الحصرية للوحدة:</span>
                </div>
                <button
                  onClick={() => handleOpenManualAdd('formula')}
                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all no-print flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                >
                  <Plus size={14} className="stroke-[3]" />
                  <span>إضافة قانون</span>
                </button>
              </div>
              <div className="text-[13px] md:text-[14px] leading-loose text-gray-900 text-right space-y-3 font-medium bg-white/95 p-5 rounded-2xl border border-amber-100 shadow-2xs">
                <MathRenderer content={review.formulasSummary || ''} />
              </div>
            </div>
          )}

        </div>
      )}

      {/* Manual Add Paragraph Modal */}
      {isManualAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print font-sans">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 md:p-8 max-h-[92vh] overflow-y-auto space-y-6 shadow-2xl border border-gray-100 text-right">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Plus size={20} className="stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">إضافة فقرة جديدة للمراجعة الشاملة</h3>
                  <p className="text-[11px] font-medium text-gray-500">اختر نوع الفقرة وأدخل تفاصيلها وصيغ LaTeX بدقة</p>
                </div>
              </div>
              <button
                onClick={() => setIsManualAddModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Category Selector Tabs */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-gray-700">نوع الفقرة المراد إضافتها:</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => setManualCategory('definition')}
                  className={`p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    manualCategory === 'definition'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-850 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">📖</span>
                  <span>تعريف / مفهوم</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManualCategory('theorem')}
                  className={`p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    manualCategory === 'theorem'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-850 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">📐</span>
                  <span>مبرهنة / نظرية</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManualCategory('result')}
                  className={`p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    manualCategory === 'result'
                      ? 'bg-blue-50 border-blue-500 text-blue-850 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">⚡</span>
                  <span>نتيجة / خاصة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManualCategory('trap')}
                  className={`p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    manualCategory === 'trap'
                      ? 'bg-amber-50 border-amber-500 text-amber-850 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">⚠️</span>
                  <span>مطب امتحاني</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManualCategory('summary')}
                  className={`p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    manualCategory === 'summary'
                      ? 'bg-violet-50 border-violet-500 text-violet-850 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">📝</span>
                  <span>نص للملخص</span>
                </button>

                <button
                  type="button"
                  onClick={() => setManualCategory('formula')}
                  className={`p-2.5 rounded-xl text-xs font-black border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    manualCategory === 'formula'
                      ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">🧮</span>
                  <span>قانون رياضي</span>
                </button>
              </div>
            </div>

            {/* Category-Specific Form Fields */}
            <div className="space-y-4 pt-2">
              {/* Definition Form */}
              {manualCategory === 'definition' && (
                <>
                  <div>
                    <label className="block text-xs font-black text-indigo-950 mb-1">
                      اسم المفهوم / المصطلح الرياضي: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: التابع المستمر، النقطة الحرجة، الشعاعان المتوازيان..."
                      value={defTerm}
                      onChange={(e) => setDefTerm(e.target.value)}
                      className="w-full p-2.5 border border-indigo-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-indigo-950 mb-1">
                      شرح التعريف والمفهوم (يدعم صيغ LaTeX $...$): <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="اكتب شرح وتفصيل المفهوم، مع الرموز داخل $...$ مثلاً: نقول إن التابع $f$ مستمر عند $x_0$ إذا كان..."
                      value={defExplanation}
                      onChange={(e) => setDefExplanation(e.target.value)}
                      className="w-full p-2.5 border border-indigo-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-indigo-950 mb-1">
                      الصيغة أو العلاقة الرياضية المرتبطة (اختياري - داخل $...$):
                    </label>
                    <input
                      type="text"
                      placeholder="$\lim_{x \to x_0} f(x) = f(x_0)$"
                      value={defFormula}
                      onChange={(e) => setDefFormula(e.target.value)}
                      className="w-full p-2.5 border border-indigo-200 rounded-xl text-xs font-mono text-left focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      dir="ltr"
                    />
                  </div>
                </>
              )}

              {/* Theorem Form */}
              {manualCategory === 'theorem' && (
                <>
                  <div>
                    <label className="block text-xs font-black text-emerald-950 mb-1">
                      اسم المبرهنة / النظرية: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: مبرهنة القيم الوسطى، مبرهنة التابع المشتق، مبرهنة الإحاطة..."
                      value={thmName}
                      onChange={(e) => setThmName(e.target.value)}
                      className="w-full p-2.5 border border-emerald-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-emerald-950 mb-1">
                      نص المبرهنة الدقيق (يدعم $...$): <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="إذا كان التابع $f$ مستمراً على المجال $[a, b]$ وكان..."
                      value={thmStatement}
                      onChange={(e) => setThmStatement(e.target.value)}
                      className="w-full p-2.5 border border-emerald-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-amber-950 mb-1">
                      شروط الانطلاق والتطبيق الدقيقة:
                    </label>
                    <input
                      type="text"
                      placeholder="1) الاستمرار على $[a, b]$ ، 2) $f(a) \cdot f(b) < 0$"
                      value={thmConditions}
                      onChange={(e) => setThmConditions(e.target.value)}
                      className="w-full p-2.5 border border-amber-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-emerald-950 mb-1">
                      إرشادات وملاحظات تطبيقية (اختياري):
                    </label>
                    <input
                      type="text"
                      placeholder="تُستخدم لإثبات وجود حلول للمعادلة $f(x)=0$ دون الحاجة لحلها جبرياً..."
                      value={thmNotes}
                      onChange={(e) => setThmNotes(e.target.value)}
                      className="w-full p-2.5 border border-emerald-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Result Form */}
              {manualCategory === 'result' && (
                <>
                  <div>
                    <label className="block text-xs font-black text-blue-950 mb-1">
                      عنوان النتيجة / الخاصة: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: حالة خاصة في مبرهنة القيم الوسطى، خاصة الارتباط الخطي..."
                      value={resTitle}
                      onChange={(e) => setResTitle(e.target.value)}
                      className="w-full p-2.5 border border-blue-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-blue-950 mb-1">
                      نص النتيجة أو القاعدة (يدعم $...$): <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="إذا كان $f$ مطرداً تماماً على $[a, b]$ فإن الحل وحيد..."
                      value={resStatement}
                      onChange={(e) => setResStatement(e.target.value)}
                      className="w-full p-2.5 border border-blue-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-blue-950 mb-1">
                      الصيغة الرياضية المباشرة (اختياري - داخل $...$):
                    </label>
                    <input
                      type="text"
                      placeholder="$\exists ! c \in ]a, b[ : f(c) = 0$"
                      value={resFormula}
                      onChange={(e) => setResFormula(e.target.value)}
                      className="w-full p-2.5 border border-blue-200 rounded-xl text-xs font-mono text-left focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      dir="ltr"
                    />
                  </div>
                </>
              )}

              {/* Trap Form */}
              {manualCategory === 'trap' && (
                <>
                  <div>
                    <label className="block text-xs font-black text-amber-950 mb-1">
                      عنوان المطب الامتحاني: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: الخلط بين الاستمرار والاشتقاق، نسيان شرط المجال المفتوح..."
                      value={trapTitle}
                      onChange={(e) => setTrapTitle(e.target.value)}
                      className="w-full p-2.5 border border-amber-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-red-900 mb-1">
                      ❌ الخطأ الشائع لدى الطلاب في الامتحان: <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder="افتراض أن كل تابع مستمر هو بالضرورة تابع اشتقاقي..."
                      value={trapText}
                      onChange={(e) => setTrapText(e.target.value)}
                      className="w-full p-2.5 border border-red-200 bg-red-50/30 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-emerald-900 mb-1">
                      ✅ الطريقة والتفكير السليم لتفادي المطب: <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder="الاشتقاق يقتضي الاستمرار ولكن العكس ليس صحيحاً دوماً مثل $f(x)=|x|$ عند الصفر..."
                      value={trapCorrectMethod}
                      onChange={(e) => setTrapCorrectMethod(e.target.value)}
                      className="w-full p-2.5 border border-emerald-200 bg-emerald-50/30 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Summary Paragraph Form */}
              {manualCategory === 'summary' && (
                <div>
                  <label className="block text-xs font-black text-violet-950 mb-1">
                    الفقرة النظرية المضافة للملخص (Markdown & LaTeX $...$): <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={6}
                    placeholder="اكتب الفقرة بالتفصيل... تدعم الرموز والمعادلات داخل $...$ والعناوين والنقاط..."
                    value={summaryAddition}
                    onChange={(e) => setSummaryAddition(e.target.value)}
                    className="w-full p-3 border border-violet-200 rounded-xl text-xs focus:ring-2 focus:ring-violet-500 focus:outline-none font-sans leading-relaxed"
                  />
                </div>
              )}

              {/* Formula Form */}
              {manualCategory === 'formula' && (
                <div>
                  <label className="block text-xs font-black text-amber-950 mb-1">
                    القانون أو العلاقة الرياضية المضافة (Markdown & LaTeX $...$): <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={5}
                    placeholder="مثال: - قانون المسافة بين نقطتين: $d(A, B) = \sqrt{(x_B - x_A)^2 + (y_B - y_A)^2 + (z_B - z_A)^2}$"
                    value={formulaAddition}
                    onChange={(e) => setFormulaAddition(e.target.value)}
                    className="w-full p-3 border border-amber-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  />
                </div>
              )}

              {/* LaTeX Live Preview Area */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-700">
                  <span>👁️</span>
                  <span>معاينة العرض الرياضي المباشر (LaTeX Preview):</span>
                </div>
                <div className="text-xs text-gray-850 p-2.5 bg-white rounded-xl border border-slate-100 min-h-[42px] flex items-center">
                  <MathRenderer
                    content={
                      manualCategory === 'definition'
                        ? `${defExplanation} ${defFormula ? `\n\n$$ ${defFormula} $$` : ''}` || 'اكتب نصاً لمعاينته هنا...'
                        : manualCategory === 'theorem'
                        ? `${thmStatement} ${thmConditions ? `\n\n**الشروط:** ${thmConditions}` : ''}` || 'اكتب نصاً لمعاينته هنا...'
                        : manualCategory === 'result'
                        ? `${resStatement} ${resFormula ? `\n\n${resFormula}` : ''}` || 'اكتب نصاً لمعاينته هنا...'
                        : manualCategory === 'trap'
                        ? `❌ **الخطأ:** ${trapText}\n\n✅ **الصواب:** ${trapCorrectMethod}` || 'اكتب تفاصيل المطب لمعاينته...'
                        : manualCategory === 'summary'
                        ? summaryAddition || 'اكتب نص الملخص لمعاينته...'
                        : formulaAddition || 'اكتب القانون لمعاينته...'
                    }
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setIsManualAddModalOpen(false)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveManualParagraph}
                disabled={isSaving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>حفظ وإضافة الفقرة ✍️💾</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Edit Modal */}
      {isEditModalOpen && editableReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print font-sans">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 md:p-8 max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Edit3 size={18} className="text-violet-600" />
                <span>تعديل المراجعة الشاملة للوحدة يدوياً</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-right">
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1">
                  عنوان المراجعة:
                </label>
                <input
                  type="text"
                  value={editableReview.title}
                  onChange={(e) => setEditableReview({ ...editableReview, title: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1">
                  الملخص النظري الشامل (Markdown & LaTeX):
                </label>
                <textarea
                  value={editableReview.summaryText}
                  onChange={(e) => setEditableReview({ ...editableReview, summaryText: e.target.value })}
                  rows={8}
                  className="w-full p-3 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1">
                  خلاصة القوانين السريعة:
                </label>
                <textarea
                  value={editableReview.formulasSummary || ''}
                  onChange={(e) => setEditableReview({ ...editableReview, formulasSummary: e.target.value })}
                  rows={4}
                  className="w-full p-3 border border-gray-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>حفظ التعديلات 💾</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
