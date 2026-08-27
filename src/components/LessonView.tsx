import React, { useState, useEffect } from 'react';
import { db, type LessonSection, type Document } from '../db';
import { MathRenderer } from './MathRenderer';
import { 
  ArrowRight, 
  Printer, 
  Edit3, 
  RefreshCw, 
  Save, 
  X,
  Loader2,
  Settings,
  PlusCircle,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Info,
  AlertTriangle,
  Lightbulb,
  Target,
  BookOpen,
  Check,
  Type,
  Cloud,
  Image as ImageIcon
} from 'lucide-react';
import { 
  analyzeLessonSection, 
  generateSvgForSection,
  generateDetailedSolution
} from '../services/gemini';
import { CustomDialog } from './ui/CustomDialog';
import { UnitComprehensiveReviewSection } from './UnitComprehensiveReviewSection';
import { UnitQuizSection } from './UnitQuizSection';
import { UnitMindMapSection } from './UnitMindMapSection';

interface LessonViewProps {
  docId: number;
  onBack: () => void;
}

export const LessonView: React.FC<LessonViewProps> = ({ docId, onBack }) => {
  const [document, setDocument] = useState<Document | undefined>(undefined);
  const [sections, setSections] = useState<LessonSection[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);

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
  
  const loadData = async () => {
    const doc = await db.documents.get(docId);
    setDocument(doc);
    const s = await db.lessonSections.where({ docId }).sortBy('order');
    setSections(s);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [docId]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<Partial<LessonSection>>({});
  const [analyzingIds, setAnalyzingIds] = useState<number[]>([]);
  const [generatingSvgIds, setGeneratingSvgIds] = useState<number[]>([]);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [tempMetadata, setTempMetadata] = useState({ 
    title: '', 
    grade: '', 
    subject: '', 
    part: '', 
    unit: ''
  });
  const [solvingExercises, setSolvingExercises] = useState<number[]>([]);
  const [isFormatting, setIsFormatting] = useState(false);

  const defaultTitles = ['تعريف', 'مبرهنة', 'نظرية', 'نتيجة', 'مثال محلول', 'مثال', 'ملاحظة', 'نص عام'];
  const [allTitles, setAllTitles] = useState<string[]>(defaultTitles);

  useEffect(() => {
    if (sections) {
      const uniqueTitles = Array.from(new Set([...defaultTitles, ...sections.map(s => s.title)]));
      setAllTitles(uniqueTitles);
    }
  }, [sections]);

  useEffect(() => {
    if (document) {
      setTempMetadata({ 
        title: document.title, 
        grade: document.grade, 
        subject: document.subject,
        part: document.part || '',
        unit: document.unit || ''
      });
    }
  }, [document]);

  const handleSaveMetadata = async () => {
    if (document) {
      await db.documents.update(docId, tempMetadata);
      setIsEditingMetadata(false);
      loadData();
    }
  };

  const formatContent = (content: string) => {
    if (!content) return '';
    let text = content;
    
    // 1. حماية كتل الرياضيات (LaTeX) لمنع تمزيقها بالتعابير النمطية
    const mathBlocks: string[] = [];
    text = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g, (match) => {
      mathBlocks.push(match);
      return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    // 2. معالجة النقاط والقوائم
    // تحويل الشرطات في بداية السطر أو بعد نقطة إلى بنية قائمة مع سطر جديد
    text = text.replace(/^- /gm, '\n\n- ');
    text = text.replace(/\.\s*- /g, '.\n\n- ');

    // 3. فرض سطر جديد بعد كل نقطة (بشرط ألا تكون جزءاً من رقم عشري أو اختصار)
    // نبحث عن نقطة يتبعها فراغ أو نهاية سطر، ولا يسبقها رقم (لتجنب الأرقام العشرية)
    text = text.replace(/([^0-9\n])\.\s+(?=[^0-9]|$)/g, '$1.\n\n');

    const getCircledNumber = (numStr: string, filled: boolean = false) => {
      const num = parseInt(numStr);
      if (isNaN(num) || num < 1 || num > 20) return `(${numStr})`;
      if (filled) {
        const filledCircles = ['❶','❷','❸','❹','❺','❻','❼','❽','❾','❿','⓫','⓬','⓭','⓮','⓯','⓰','⓱','⓲','⓳','⓴'];
        return filledCircles[num - 1];
      } else {
        const outlinedCircles = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
        return outlinedCircles[num - 1];
      }
    };

    // 4. ترقيم احترافي: "1. ", "2. " في بداية السطر (خلفية شفافة)
    text = text.replace(/^(\d+)\.\s+/gm, (match, num) => {
      return `${getCircledNumber(num, false)} `;
    });

    // 5. الترقيم الفرعي: "1) " أو " (1) " (خلفية سوداء)
    text = text.replace(/^(\s*)(\d+)\)\s+/gm, (match, indent, num) => {
      return `${indent}${getCircledNumber(num, true)} `;
    });
    text = text.replace(/^(\s*)\((\d+)\)\s+/gm, (match, indent, num) => {
      return `${indent}${getCircledNumber(num, true)} `;
    });

    // 6. الترقيم بالأحرف العربية
    text = text.replace(/^(\s*)([أ-ي])\)\s+/gm, (match, indent, letter) => {
      return `${indent}(${letter}) `;
    });

    // 7. إضافة رموز احترافية للعناوين والكلمات المفتاحية
    text = text.replace(/^(الحل|حل التمرين|حل السؤال|طريقة الحل|الإجابة)(\s*:?)/gm, '✍️ $1$2');
    text = text.replace(/^(ملاحظة|تنبيه|انتبه|هام)(\s*:?)/gm, '💡 $1$2');
    text = text.replace(/^(تذكر|تذكر أن)(\s*:?)/gm, '🧠 $1$2');
    text = text.replace(/^(مثال|أمثلة)(\s*:?)/gm, '📝 $1$2');
    text = text.replace(/^(تعريف|مفهوم)(\s*:?)/gm, '📖 $1$2');
    text = text.replace(/^(نتيجة|استنتاج)(\s*:?)/gm, '🎯 $1$2');
    text = text.replace(/^(مبرهنة|نظرية)(\s*:?)/gm, '⚖️ $1$2');
    text = text.replace(/^(اثبات|إثبات|برهان)(\s*:?)/gm, '🔍 $1$2');
    text = text.replace(/^(سؤال|تمرين)(\s*:?)/gm, '❓ $1$2');
    text = text.replace(/^(الطلب|الطلبات)(\s*:?)/gm, '📋 $1$2');

    // 8. استعادة كتل الرياضيات
    text = text.replace(/__MATH_BLOCK_(\d+)__/g, (match, index) => {
      return mathBlocks[parseInt(index)];
    });

    return text.trim();
  };

  const handleApplyFormatting = async () => {
    if (!sections) return;
    setIsFormatting(true);
    try {
      const updates = sections.map(section => {
        const newContent = formatContent(section.content);
        return db.lessonSections.update(section.id!, { content: newContent });
      });
      await Promise.all(updates);
      await loadData();
      showAlert('تم التنسيق', 'تم تنسيق جميع فقرات الدرس بنجاح بنظام الفقرات والترقيم الاحترافي.');
    } catch (err) {
      console.error(err);
      showAlert('خطأ', 'فشل تطبيق التنسيق.');
    } finally {
      setIsFormatting(false);
    }
  };

  const solveExercise = async (sectionId: number) => {
    const section = await db.lessonSections.get(sectionId);
    if (!section || !sections) return;

    setSolvingExercises(prev => [...prev, sectionId]);
    try {
      // الجمع بين محتوى الفقرات السابقة لتوفير السياق
      const context = sections
        .filter(s => s.order < section.order)
        .map(s => `${s.title}:\n${s.content}`)
        .join('\n\n');

      const solution = await generateDetailedSolution(section.content, context);
      
      const additions = [...(section.analysis?.additions || [])];
      // إزالة أي حل سابق إذا وجد
      const filteredAdditions = additions.filter(a => a.label !== 'الحل التفصيلي');
      filteredAdditions.push({ label: 'الحل التفصيلي', content: solution });
      
      await db.lessonSections.update(sectionId, {
        analysis: { ...(section.analysis || {}), additions: filteredAdditions }
      });
      loadData();
    } catch (err) {
      console.error(err);
      showAlert('خطأ', 'فشل في توليد الحل التفصيلي.');
    } finally {
      setSolvingExercises(prev => prev.filter(id => id !== sectionId));
    }
  };

  const exportToPdf = () => {
    window.print();
  };

  const handleEdit = (section: LessonSection) => {
    setEditingId(section.id!);
    setEditContent({ ...section });
  };

  const handleSave = async (id: number) => {
    await db.lessonSections.update(id, editContent);
    setEditingId(null);
    loadData();
  };

  const handleAddManual = async () => {
    if (!document) return;
    const maxOrder = sections && sections.length > 0 
      ? Math.max(...sections.map(s => s.order)) 
      : -1;
    const newId = await db.lessonSections.add({
      docId,
      title: 'تعريف',
      content: 'اكتب محتوى الفقرة هنا...',
      order: maxOrder + 1
    });
    setEditingId(newId);
    setEditContent({ title: 'تعريف', content: 'اكتب محتوى الفقرة هنا...', order: maxOrder + 1 });
    loadData();
  };

  const handleDeleteSection = async (id: number) => {
    showConfirm('حذف الفقرة', 'هل أنت متأكد من حذف هذه الفقرة؟ لا يمكن التراجع عن هذا الإجراء.', async () => {
      await db.lessonSections.delete(id);
      loadData();
    });
  };

  const handleAnalyze = async (id: number) => {
    setAnalyzingIds(prev => [...prev, id]);
    try {
      await analyzeLessonSection(id);
      loadData();
    } catch (err) {
      console.error(err);
      showAlert('خطأ', 'فشل في تحليل الفقرة.');
    } finally {
      setAnalyzingIds(prev => prev.filter(aid => aid !== id));
    }
  };

  const handleGenerateSvg = async (id: number) => {
    setGeneratingSvgIds(prev => [...prev, id]);
    try {
      await generateSvgForSection(id);
      loadData();
    } catch (err) {
      console.error(err);
      showAlert('خطأ', 'فشل في توليد الرسم.');
    } finally {
      setGeneratingSvgIds(prev => prev.filter(aid => aid !== id));
    }
  };

  const makeSvgResponsive = (svg: string | undefined) => {
    if (!svg) return '';
    let processed = svg;
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

  const moveSection = async (idx: number, direction: 'up' | 'down') => {
    if (!sections) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sections.length) return;

    const current = sections[idx];
    const target = sections[targetIdx];

    // Ensure unique orders by swapping or re-indexing if they are the same
    if (current.order === target.order) {
      // If orders are identical, we must re-index to allow movement
      const updates = sections.map((s, i) => {
        let newOrder = i;
        if (i === idx) newOrder = targetIdx;
        else if (i === targetIdx) newOrder = idx;
        return db.lessonSections.update(s.id!, { order: newOrder });
      });
      await Promise.all(updates);
    } else {
      await db.lessonSections.update(current.id!, { order: target.order });
      await db.lessonSections.update(target.id!, { order: current.order });
    }
    loadData();
  };

  const applyAnalysisSuggestion = async (id: number, field: 'content' | 'svgCode', value: string) => {
    if (field === 'content') {
      await db.lessonSections.update(id, { content: value });
    } else if (field === 'svgCode') {
      await db.lessonSections.update(id, { svgCode: value });
    }
    loadData();
  };

  if (loading || !document || !sections) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-purple-600" size={48} />
    </div>
  );

  const getSectionColor = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('تعريف')) return 'border-blue-200 bg-blue-50/50 text-blue-800';
    if (t.includes('مبرهنة') || t.includes('نظرية')) return 'border-purple-200 bg-purple-50/50 text-purple-800';
    if (t.includes('نتيجة')) return 'border-green-200 bg-green-50/50 text-green-800';
    if (t.includes('مثال') || t.includes('تكريسا للفهم')) return 'border-amber-200 bg-amber-50/50 text-amber-800';
    if (t.includes('ملاحظة')) return 'border-red-200 bg-red-50/50 text-red-800';
    return 'border-gray-200 bg-gray-50/50 text-gray-800';
  };

  return (
    <div className="max-w-5xl mx-auto p-6 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 no-print">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowRight size={20} />
          العودة للمكتبة
        </button>
        
        <div className="flex gap-4">
          <button 
            onClick={handleApplyFormatting} 
            disabled={isFormatting}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="تنسيق الفقرات والترقيم بشكل دائم"
          >
            {isFormatting ? <Loader2 size={20} className="animate-spin" /> : <Type size={20} />}
            تنسيق
          </button>
          <button onClick={() => setIsEditingMetadata(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings size={20} />
          </button>
          <button onClick={exportToPdf} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
            <Printer size={20} />
            طباعة الدرس
          </button>
        </div>
      </div>

      {/* Metadata Edit */}
      {isEditingMetadata && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h2 className="text-2xl font-bold mb-6">تعديل بيانات الدرس</h2>
            <div className="space-y-4 mb-8">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 mr-1">العنوان</label>
                <input type="text" value={tempMetadata.title} onChange={e => setTempMetadata(prev => ({ ...prev, title: e.target.value }))} className="w-full px-4 py-2 border rounded-lg" placeholder="العنوان" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 mr-1">الصف</label>
                  <input type="text" value={tempMetadata.grade} onChange={e => setTempMetadata(prev => ({ ...prev, grade: e.target.value }))} className="w-full px-4 py-2 border rounded-lg" placeholder="الصف" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 mr-1">المادة</label>
                  <input type="text" value={tempMetadata.subject} onChange={e => setTempMetadata(prev => ({ ...prev, subject: e.target.value }))} className="w-full px-4 py-2 border rounded-lg" placeholder="المادة" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 mr-1">الجزء</label>
                  <input type="text" value={tempMetadata.part} onChange={e => setTempMetadata(prev => ({ ...prev, part: e.target.value }))} className="w-full px-4 py-2 border rounded-lg" placeholder="الجزء" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 mr-1">الوحدة</label>
                  <input type="text" value={tempMetadata.unit} onChange={e => setTempMetadata(prev => ({ ...prev, unit: e.target.value }))} className="w-full px-4 py-2 border rounded-lg" placeholder="الوحدة" />
                </div>
              </div>

            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveMetadata} className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-xl font-bold">حفظ</button>
              <button onClick={() => setIsEditingMetadata(false)} className="px-6 py-2 border rounded-xl font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div id="lesson-content">
        {/* Print Header */}
        <div className="print-only print-header">
          <div className="print-header-inner border-b-[3px] border-double border-gray-700 pb-4 mb-6">
            <div className="flex justify-between items-center mb-6 text-sm text-gray-600 border-b pb-2">
              <div className="flex gap-4">
                <span><strong>المادة:</strong> {document.subject}</span>
                <span><strong>الصف:</strong> {document.grade}</span>
              </div>
              <div className="font-bold text-purple-600">منصة المعلم الذكي</div>
            </div>
            <h1 className="text-4xl font-black text-gray-900 mb-2">{document.title}</h1>
            <div className="w-24 h-1 bg-purple-600 mx-auto rounded-full"></div>
          </div>
        </div>

        <div className="space-y-8">
          <button onClick={handleAddManual} className="w-full py-4 border-2 border-dashed border-purple-300 rounded-xl text-purple-500 hover:bg-purple-50 transition-all flex items-center justify-center gap-2 no-print">
            <PlusCircle size={24} />
            إضافة فقرة يدوياً
          </button>

          {sections.map((section, idx) => {
            const colorClasses = getSectionColor(section.title);
            return (
              <div key={section.id} className={`rounded-2xl shadow-sm border overflow-hidden page-break-avoid transition-all hover:shadow-md lesson-section ${colorClasses}`}>
                <div className="p-6">
                  {editingId === section.id ? (
                    <div className="space-y-4">
                      <div className="flex gap-4 items-end">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-gray-500 mb-1 block">عنوان الفقرة:</label>
                          <input 
                            list="titles-list"
                            value={editContent.title} 
                            onChange={e => setEditContent(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full px-4 py-2 border rounded-lg font-bold text-purple-700 outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="اختر أو اكتب عنواناً جديداً..."
                          />
                          <datalist id="titles-list">
                            {allTitles.map(t => (
                              <option key={t} value={t} />
                            ))}
                          </datalist>
                        </div>
                        <button onClick={() => handleDeleteSection(section.id!)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg h-10 mb-0.5"><Trash2 size={20}/></button>
                      </div>
                      <textarea 
                        value={editContent.content} 
                        onChange={e => setEditContent(prev => ({ ...prev, content: e.target.value }))}
                        className="w-full p-4 border rounded-lg min-h-[150px] outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                      <textarea 
                        value={editContent.svgCode || ''} 
                        onChange={e => setEditContent(prev => ({ ...prev, svgCode: e.target.value }))}
                        className="w-full p-2 border rounded-lg font-mono text-xs bg-white"
                        placeholder="SVG Code (Optional)"
                      />

                      {/* Educational Additions Editing */}
                      <div className="space-y-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-purple-700 text-sm flex items-center gap-2">
                            <Sparkles size={16} /> الإضافات التربوية:
                          </h4>
                          <button 
                            onClick={() => {
                              const additions = [...(editContent.analysis?.additions || [])];
                              additions.push({ label: 'إضافة جديدة', content: '' });
                              setEditContent(prev => ({
                                ...prev,
                                analysis: { ...(prev.analysis || {}), additions }
                              }));
                            }}
                            className="text-xs bg-white text-purple-600 px-2 py-1 rounded border border-purple-200 hover:bg-purple-100 transition-colors flex items-center gap-1"
                          >
                            <PlusCircle size={14} /> إضافة يدويّة
                          </button>
                        </div>

                        {editContent.analysis?.rephrasedContent !== undefined && (
                          <div className="space-y-2 bg-white p-3 rounded-lg border border-purple-100 relative group">
                            <div className="flex justify-between items-center mb-1">
                              <h5 className="text-xs font-bold text-purple-700 flex items-center gap-1">
                                <Type size={14} /> إعادة صياغة مقترحة:
                              </h5>
                              <button 
                                onClick={() => {
                                  setEditContent(prev => ({
                                    ...prev,
                                    analysis: { ...(prev.analysis || {}), rephrasedContent: undefined }
                                  }));
                                }}
                                className="text-red-400 hover:text-red-600 transition-colors"
                                title="حذف إعادة الصياغة"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <textarea 
                              value={editContent.analysis.rephrasedContent}
                              onChange={e => setEditContent(prev => ({
                                ...prev,
                                analysis: { ...(prev.analysis || {}), rephrasedContent: e.target.value }
                              }))}
                              className="w-full p-2 text-sm border rounded bg-gray-50 min-h-[80px] focus:ring-1 focus:ring-purple-400 outline-none"
                              placeholder="محتوى إعادة الصياغة..."
                            />
                          </div>
                        )}
                        
                        {(editContent.analysis?.additions || []).map((addition, aIdx) => (
                          <div key={aIdx} className="space-y-2 bg-white p-3 rounded-lg border border-purple-100 relative group">
                            <button 
                              onClick={() => {
                                const additions = (editContent.analysis?.additions || []).filter((_, i) => i !== aIdx);
                                setEditContent(prev => ({
                                  ...prev,
                                  analysis: { ...(prev.analysis || {}), additions }
                                }));
                              }}
                              className="absolute top-2 left-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={14} />
                            </button>
                            <input 
                              type="text"
                              value={addition.label}
                              onChange={e => {
                                const additions = [...(editContent.analysis?.additions || [])];
                                additions[aIdx] = { ...additions[aIdx], label: e.target.value };
                                setEditContent(prev => ({
                                  ...prev,
                                  analysis: { ...(prev.analysis || {}), additions }
                                }));
                              }}
                              className="w-full px-2 py-1 text-sm font-bold text-purple-800 border-b border-dashed focus:border-purple-400 outline-none"
                              placeholder="عنوان الإضافة (مثلاً: الربط بالواقع)"
                            />
                            <textarea 
                              value={addition.content}
                              onChange={e => {
                                const additions = [...(editContent.analysis?.additions || [])];
                                additions[aIdx] = { ...additions[aIdx], content: e.target.value };
                                setEditContent(prev => ({
                                  ...prev,
                                  analysis: { ...(prev.analysis || {}), additions }
                                }));
                              }}
                              className="w-full p-2 text-sm border rounded bg-gray-50 min-h-[60px] focus:ring-1 focus:ring-purple-400 outline-none"
                              placeholder="محتوى الإضافة..."
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="px-4 py-2 text-gray-600">إلغاء</button>
                        <button onClick={() => handleSave(section.id!)} className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold">حفظ</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex justify-between items-start no-print">
                        <div className="flex gap-2">
                          <button onClick={() => moveSection(idx, 'up')} className="p-1 hover:bg-white/50 rounded"><ChevronUp size={18}/></button>
                          <button onClick={() => moveSection(idx, 'down')} className="p-1 hover:bg-white/50 rounded"><ChevronDown size={18}/></button>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleAnalyze(section.id!)} 
                            disabled={analyzingIds.includes(section.id!)}
                            className="flex items-center gap-1 bg-white/80 text-purple-600 hover:bg-white px-3 py-1 rounded-lg text-sm font-bold border border-purple-100 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            {analyzingIds.includes(section.id!) ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Sparkles size={16} />
                            )}
                            {analyzingIds.includes(section.id!) ? 'جاري التحليل...' : 'تحليل الذكاء الاصطناعي'}
                          </button>
                          <button onClick={() => handleEdit(section)} className="p-1 text-gray-400 hover:text-purple-600"><Edit3 size={18}/></button>
                          <button onClick={() => handleDeleteSection(section.id!)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={18}/></button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-1.5 bg-current rounded-full opacity-50"></div>
                          <h3 className="text-xl font-bold">{section.title}</h3>
                        </div>
                        
                        {(section.title.includes('تدرّب') || section.title.includes('تدرب') || section.title.includes('تمرين')) && (
                          <button 
                            onClick={() => solveExercise(section.id!)}
                            disabled={solvingExercises.includes(section.id!)}
                            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50 no-print"
                          >
                            {solvingExercises.includes(section.id!) ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <Check size={18} />
                            )}
                            {solvingExercises.includes(section.id!) ? 'جاري الحل...' : 'الحل التفصيلي'}
                          </button>
                        )}
                      </div>

                      <div className={`flex flex-col sm:flex-row gap-8 ${section.svgCode ? 'items-start' : ''}`}>
                        <div className={`text-[15px] leading-relaxed tracking-wide ${section.svgCode ? 'flex-1' : 'w-full'}`}>
                          <MathRenderer content={section.content} />
                        </div>

                        {section.svgCode ? (
                          <div className="relative group w-full sm:w-1/3 shrink-0">
                            <div className="flex justify-center py-6 bg-white/50 rounded-xl border border-white/20 shadow-inner [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: makeSvgResponsive(section.svgCode) }} />
                            <button 
                              onClick={() => handleGenerateSvg(section.id!)}
                              disabled={generatingSvgIds.includes(section.id!)}
                              className="absolute top-2 left-2 bg-white/80 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:text-purple-600 no-print"
                              title="إعادة توليد الرسم بالذكاء الاصطناعي"
                            >
                              {generatingSvgIds.includes(section.id!) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-center py-4 no-print shrink-0">
                            <button 
                              onClick={() => handleGenerateSvg(section.id!)}
                              disabled={generatingSvgIds.includes(section.id!)}
                              className="flex items-center gap-2 text-sm text-gray-400 hover:text-purple-600 transition-colors"
                            >
                              {generatingSvgIds.includes(section.id!) ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                              إضافة رسم توضيحي
                            </button>
                          </div>
                        )}
                      </div>

                      {section.analysis && (
                        <div className="mt-8 space-y-4">
                          {section.analysis.rephrasedContent && (
                            <div className="p-4 bg-white/80 rounded-xl border border-purple-100 relative group shadow-sm">
                              <h4 className="flex items-center gap-2 font-bold text-purple-700 mb-2"><Type size={18}/> إعادة صياغة مقترحة:</h4>
                              <div className="text-sm text-purple-900"><MathRenderer content={section.analysis.rephrasedContent} /></div>
                              <button 
                                onClick={() => applyAnalysisSuggestion(section.id!, 'content', section.analysis!.rephrasedContent!)}
                                className="absolute top-4 left-4 bg-purple-600 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center gap-1 text-xs no-print"
                                title="تطبيق هذه الصياغة"
                              >
                                <Check size={14} /> تطبيق
                              </button>
                            </div>
                          )}

                          {section.analysis.additions && section.analysis.additions.length > 0 && (
                            <div className="space-y-4">
                              {/* عرض الحل التفصيلي بشكل مستقل وكامل العرض */}
                              {section.analysis.additions.filter(a => a.label === 'الحل التفصيلي').map((addition, aIdx) => (
                                <div key={`solution-${aIdx}`} className="p-6 bg-indigo-50/50 rounded-2xl border-2 border-indigo-100 shadow-sm">
                                  <h4 className="flex items-center gap-2 font-black text-indigo-700 mb-4 text-lg">
                                    <Check size={20} className="bg-indigo-600 text-white rounded-full p-0.5" /> الحل:
                                  </h4>
                                  <div className="text-[15px] leading-relaxed text-gray-900 bg-white p-4 rounded-xl border border-indigo-50 shadow-inner">
                                    <MathRenderer content={addition.content} />
                                  </div>
                                </div>
                              ))}

                              {/* عرض باقي الإضافات في شبكة */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {section.analysis.additions.filter(a => a.label !== 'الحل التفصيلي').map((addition, aIdx) => (
                                  <div key={aIdx} className="p-4 bg-white/80 rounded-xl border border-blue-100 shadow-sm">
                                    <h4 className="flex items-center gap-2 font-bold text-blue-700 mb-2">
                                      <Info size={18}/> {addition.label}:
                                    </h4>
                                    <div className="text-sm text-blue-900">
                                      <MathRenderer content={addition.content} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unit Comprehensive Review Section (مراجعة شاملة للوحدة) */}
        {document && sections && (
          <div className="mt-12 page-break-before">
            <UnitComprehensiveReviewSection
              document={document}
              sections={sections}
              isAdmin={true}
              onUpdate={() => {
                // Refresh if needed
              }}
            />
          </div>
        )}

        {/* Unit Quiz Section */}
        {document && sections && (
          <div className="mt-12 no-print page-break-before">
            <UnitQuizSection
              document={document}
              sections={sections}
              isAdmin={true}
              onUpdateDocument={() => {
                // Refresh if needed
              }}
            />
          </div>
        )}

        {/* Unit Mind Map Section */}
        {document && sections && (
          <div className="mt-12 no-print page-break-before">
            <UnitMindMapSection
              document={document}
              sections={sections}
              isAdmin={true}
            />
          </div>
        )}

        {/* Print Footer */}
        <div className="print-only print-footer w-full">
          <div className="print-footer-inner flex justify-between items-center w-full pt-2 border-t border-black text-[10px] bg-white">
            <div className="flex flex-col">
              <span className="font-bold">{document.title}</span>
              <span className="text-[8px]">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</span>
            </div>
            <div className="font-bold text-lg">المدرّس حسن راشد العلي</div>
          </div>
        </div>
      </div>

      <CustomDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onConfirm={dialogConfig.onConfirm}
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
