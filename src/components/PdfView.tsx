import React, { useState, useEffect } from 'react';
import { db, type Document, type PdfContent } from '../db';
import { 
  Loader2, 
  ArrowRight, 
  FileText, 
  Sparkles, 
  RefreshCcw, 
  Download, 
  Share2, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Check, 
  Copy, 
  Edit3, 
  Save, 
  FileJson, 
  Eye, 
  EyeOff, 
  AlertTriangle,
  X 
} from 'lucide-react';
import { convertPdfDataToImages } from '../services/pdf';
import { extractTextFromImages, structurePdfText, type TextBlock } from '../services/gemini';
import { MathRenderer } from './MathRenderer';

interface PdfViewProps {
  docId: number;
  onBack: () => void;
}

export const PdfView: React.FC<PdfViewProps> = ({ docId, onBack }) => {
  const [document, setDocument] = useState<Document | undefined>(undefined);
  const [pdfContent, setPdfContent] = useState<PdfContent | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  
  // Custom states for heading distinction, editing, and sharing
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [structuring, setStructuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const getInitialBlocks = (text: string): TextBlock[] => {
    if (!text.trim()) return [];
    // Split by clean line gaps to construct standard blocks
    return text.split(/\n\s*\n/).map(p => ({
      type: 'paragraph' as const,
      text: p.trim()
    })).filter(b => b.text.length > 0);
  };

  const loadData = async () => {
    const doc = await db.documents.get(docId);
    const content = await db.pdfContents.where('docId').equals(docId).first();
    setDocument(doc);
    setPdfContent(content);
    setLoading(false);

    if (content) {
      if (content.structuredContent) {
        try {
          const parsed = JSON.parse(content.structuredContent);
          const loadedBlocks = Array.isArray(parsed) ? parsed : (parsed.blocks || []);
          setBlocks(loadedBlocks);
        } catch (error) {
          setBlocks(getInitialBlocks(content.textContent || ""));
        }
      } else {
        setBlocks(getInitialBlocks(content.textContent || ""));
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [docId]);

  const handleAIRExtract = async () => {
    if (!pdfContent?.originalFile) {
      alert('لا يمكن إعادة الاستخلاص لأن الملف الأصلي غير مخزن في قاعدة البيانات.');
      return;
    }

    setExtracting(true);
    try {
      const images = await convertPdfDataToImages(pdfContent.originalFile);
      const text = await extractTextFromImages(images);
      
      const parsedBlocks = getInitialBlocks(text);
      await db.pdfContents.where('docId').equals(docId).modify({ 
        textContent: text,
        structuredContent: JSON.stringify(parsedBlocks)
      });
      
      await loadData();
      alert('تم استخلاص النص بنجاح باستخدام الذكاء الاصطناعي.');
    } catch (error) {
      console.error(error);
      alert('فشل استخلاص النص. يرجى المحاولة لاحقاً.');
    } finally {
      setExtracting(false);
    }
  };

  // AI Heading distinction call
  const handleAIStructure = async () => {
    if (!pdfContent?.textContent) {
      alert('الرجاء استخلاص نص المرجع أولاً ليتمكن الذكاء الاصطناعي من تصنيف العناوين.');
      return;
    }

    setStructuring(true);
    try {
      const result = await structurePdfText(pdfContent.textContent);
      if (result && result.blocks && result.blocks.length > 0) {
        setBlocks(result.blocks);
        setHasChanges(true);
        alert('تم تحليل مرجع الـ PDF وتمييز العناوين الأساسية والثانوية بنجاح! يمكنك مراجعة العرض المنسق بالأسفل.');
      } else {
        alert('استجاب الذكاء الاصطناعي ببنية فارغة، يرجى إعادة المحاولة.');
      }
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء الاتصال بالذكاء الاصطناعي لتصنيف العناوين.');
    } finally {
      setStructuring(false);
    }
  };

  // Saving updates to local database
  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const updatedText = blocks.map(b => b.text).join('\n\n');
      const updatedStructured = JSON.stringify(blocks);

      await db.pdfContents.where('docId').equals(docId).modify({
        textContent: updatedText,
        structuredContent: updatedStructured
      });

      setPdfContent(prev => prev ? { ...prev, textContent: updatedText, structuredContent: updatedStructured } : undefined);
      setHasChanges(false);
      alert('تم حفظ كتل النصوص والعناوين المعدلة بنجاح في قاعدة البيانات المحلية.');
    } catch (error) {
      console.error(error);
      alert('فشل حفظ التعديلات.');
    } finally {
      setSaving(false);
    }
  };

  // Block Manipulation Utilities
  const handleBlockChange = (index: number, field: keyof TextBlock, value: any) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], [field]: value };
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleAddBlock = (index: number, position: 'above' | 'below') => {
    const insertIndex = position === 'above' ? index : index + 1;
    const newBlocks = [...blocks];
    newBlocks.splice(insertIndex, 0, { type: 'paragraph' as const, text: '' });
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleDeleteBlock = (index: number) => {
    const newBlocks = blocks.filter((_, i) => i !== index);
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newBlocks = [...blocks];
    
    // Swap blocks
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;

    setBlocks(newBlocks);
    setHasChanges(true);
  };

  // Export & Share Options as JSON
  const handleExportJSON = () => {
    if (!document) return;
    const exportData = {
      meta: {
        title: document.title,
        grade: document.grade,
        subject: document.subject,
        part: document.part || '',
        unit: document.unit || '',
        topic: document.topic || '',
        version: "1.0",
        format: "structured_reference_content",
        createdAt: document.createdAt
      },
      blocks: blocks,
      rawText: blocks.map(b => b.text).join('\n\n')
    };

    const dataBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);
    const link = window.document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${document.title}_structured.json`);
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const getFullJSONString = (): string => {
    if (!document) return '';
    return JSON.stringify({
      meta: {
        title: document.title,
        grade: document.grade,
        subject: document.subject,
        part: document.part || '',
        unit: document.unit || '',
        topic: document.topic || '',
        createdAt: document.createdAt
      },
      blocks: blocks
    }, null, 2);
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(getFullJSONString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareJSON = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `ملف مرجع مهيكل: ${document?.title}`,
          text: `ملف JSON يحتوي على مرجع العناوين المنسقة لدرس ${document?.title}`,
          url: window.location.href
        });
      } catch (err) {
        console.log("Web Share API failed or canceled, opening manual share...", err);
        setShowShareModal(true);
      }
    } else {
      setShowShareModal(true);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-amber-600" size={48} />
    </div>
  );

  if (!document) return <div className="text-center py-12 text-gray-500 font-bold">المستند غير موجود</div>;

  const hasPoorText = !pdfContent?.textContent || pdfContent.textContent.trim().length < 500;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 pb-24" dir="rtl">
      {/* Header element */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="رجوع"
          >
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight">{document.title}</h1>
            <div className="flex flex-wrap gap-2 text-xs md:text-sm text-gray-600 mt-2">
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">مرجع PDF</span>
              <span>{document.grade}</span>
              <span>•</span>
              <span>{document.subject}</span>
              {document.part && (
                <>
                  <span>•</span>
                  <span>{document.part}</span>
                </>
              )}
              {document.unit && (
                <>
                  <span>•</span>
                  <span>{document.unit}</span>
                </>
              )}
              {document.topic && (
                <>
                  <span>•</span>
                  <span className="font-bold text-amber-800">الموضوع: {document.topic}</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center">
          {pdfContent?.originalFile && (
            <button
              onClick={handleAIRExtract}
              disabled={extracting}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs transition-all shadow-sm ${
                extracting 
                ? 'bg-gray-100 text-gray-400' 
                : hasPoorText 
                  ? 'bg-amber-600 text-white hover:bg-amber-700 animate-pulse' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <RefreshCcw className={extracting ? "animate-spin" : ""} size={14} />
              {extracting ? 'جاري الاستخلاص الذكي...' : 'إعادة استخلاص النص الكلي'}
            </button>
          )}

          <button
            onClick={handleAIStructure}
            disabled={structuring || hasPoorText}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 rounded-lg font-bold text-xs transition-all shadow-sm"
            title="تحليل النصوص وتحديد العناوين الكبرى والفرعية باستخدام الذكاء الاصطناعي"
          >
            {structuring ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
            {structuring ? 'جاري تمييز العناوين...' : 'تمبيز العناوين بالذكاء الاصطناعي'}
          </button>
        </div>
      </div>

      {hasPoorText && pdfContent?.originalFile && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex gap-3 items-start">
           <AlertTriangle className="flex-shrink-0 mt-0.5 text-amber-600" size={18} />
           <div>
             <p className="font-bold mb-1">تنبيه: نص المرجع يبدو ضعيفاً أو مفقوداً</p>
             <p className="text-xs">يبدو أن ملف الـ PDF المرفوع هو "نسخة مصورة" (Scanned). يرجى النقر على زر <strong>"إعادة استخلاص النص الكلي"</strong> أعلاه ليتمكن البرنامج من قراءته بدقة واستخدامه في توليد الاختبارات.</p>
           </div>
        </div>
      )}

      {/* Editor Container with Save, JSON Export, and Share Buttons */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center">
              <FileJson size={20} />
            </div>
            <div>
              <h2 className="font-black text-gray-800 text-lg">هيكلة وتصنيف المرجع</h2>
              <p className="text-xs text-gray-500">يتضمن العناوين المصنفة لضمان توليد اختبارات دقيقة ومتوافقة.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleExportJSON}
              disabled={blocks.length === 0}
              className="flex items-center gap-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
              title="تنزيل هيكلية المرجع بالكامل كملف JSON"
            >
              <Download size={14} />
              تنزيل JSON
            </button>
            <button
              onClick={handleShareJSON}
              disabled={blocks.length === 0}
              className="flex items-center gap-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
              title="تصدير كود ومشاركة JSON"
            >
              <Share2 size={14} />
              مشاركة JSON
            </button>
            <button
              onClick={handleSaveChanges}
              disabled={saving || !hasChanges}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-all shadow-sm"
              title="حفظ الهيكلية المعدلة في قاعدة البيانات المحلية"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              حفظ وتثبيت التعديلات
            </button>
          </div>
        </div>

        {/* Tab Controls for View vs Edit Mode */}
        <div className="border-b border-gray-200 px-6 py-2 bg-white flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('preview')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'preview' 
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Eye size={14} />
              استعراض النص المنسق (العناوين والمحتوى)
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'edit' 
                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Edit3 size={14} />
              تعديل الفقرات والعناوين
            </button>
          </div>

          <div className="text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded">
             مجموع الكتل: {blocks.length}
          </div>
        </div>

        {/* Core content area */}
        <div className="p-6 bg-white min-h-[450px]">
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FileText className="text-gray-300 mb-4 animate-pulse" size={64} />
              <h3 className="text-lg font-bold text-gray-800">لا توجد هيكلية مجهزة بعد</h3>
              <p className="text-sm text-gray-500 max-w-md mt-1 mb-6">
                انقر على زر <strong>"تمييز العناوين بالذكاء الاصطناعي"</strong> بالأعلى ليقوم المساعد الذكي بتقسيم النص وتحديد العناوين وحفظها بجودة عالية.
              </p>
              <button
                onClick={handleAIStructure}
                disabled={structuring || hasPoorText}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow"
              >
                {structuring ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                تمييز وتقسيم المرجع بالذكاء الاصطناعي
              </button>
            </div>
          ) : mode === 'preview' ? (
            /* PREVIEW DISPLAY MODE WITH SCIENTIFIC LaTeX RENDERING & BADGES */
            <div className="space-y-6 max-w-4xl mx-auto">
              {blocks.map((block, idx) => {
                if (block.type === 'heading1') {
                  return (
                    <div key={idx} className="my-8 border-r-4 border-indigo-600 bg-indigo-50/70 p-4 rounded-l-xl">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white px-2 py-0.5 rounded mb-1.5 inline-block">العنوان الأساسي</span>
                      <h2 className="text-xl md:text-2xl font-black text-indigo-950 leading-relaxed">{block.text || "عنوان فارغ"}</h2>
                    </div>
                  );
                } else if (block.type === 'heading2') {
                  return (
                    <div key={idx} className="my-6 border-r-4 border-purple-500 bg-purple-50/70 p-4 rounded-l-xl">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white px-2 py-0.5 rounded mb-1.5 inline-block">العنوان الثانوي</span>
                      <h3 className="text-lg font-black text-purple-950 leading-relaxed">{block.text || "عنوان ثانوي فارغ"}</h3>
                    </div>
                  );
                } else {
                  return (
                    <div key={idx} className="my-4 border-r-4 border-gray-300 bg-gray-50/50 p-4 rounded-l-xl leading-relaxed text-gray-800 text-sm">
                      <span className="text-[10px] text-gray-500 block mb-1">فقرة محتوى</span>
                      <div className="prose max-w-none text-gray-700">
                        <MathRenderer content={block.text || "محتوى نصي فارغ"} />
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            /* INTERACTIVE BLOCK-BY-BLOCK EDITOR */
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="mb-4 flex justify-between items-center bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                <span className="text-xs text-indigo-800 font-bold">يمكنك تغيير نوع كل فقرة، إضافة أو حذف أو إعادة ترتيبها.</span>
                <button
                  onClick={() => {
                    const newBlocks = [...blocks, { type: 'paragraph' as const, text: '' }];
                    setBlocks(newBlocks);
                    setHasChanges(true);
                  }}
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-all shadow"
                >
                  <Plus size={14} />
                  إضافة فقرة جديدة للنهاية
                </button>
              </div>

              {blocks.map((block, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 rounded-xl border transition-all ${
                    block.type === 'heading1' 
                    ? 'bg-indigo-50/40 border-indigo-200' 
                    : block.type === 'heading2'
                      ? 'bg-purple-50/40 border-purple-200'
                      : 'bg-gray-50/40 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between mb-3 border-b border-gray-100/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                      {/* Segment Type Selector */}
                      <select
                        value={block.type}
                        onChange={(e) => handleBlockChange(idx, 'type', e.target.value)}
                        className="text-xs font-bold border rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="heading1">🎯 عنوان أساسي (رئيسي)</option>
                        <option value="heading2">💡 عنوان ثانوي (فرعي)</option>
                        <option value="paragraph">📖 فقرة محتوى / تمرين</option>
                      </select>
                    </div>

                    {/* Block Controls */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button 
                        onClick={() => handleMoveBlock(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 hover:bg-gray-100 disabled:opacity-30 rounded text-gray-600 transition-colors"
                        title="تحريك لأعلى"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button 
                        onClick={() => handleMoveBlock(idx, 'down')}
                        disabled={idx === blocks.length - 1}
                        className="p-1 hover:bg-gray-100 disabled:opacity-30 rounded text-gray-600 transition-colors"
                        title="تحريك لأسفل"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button 
                        onClick={() => handleAddBlock(idx, 'above')}
                        className="p-1 hover:bg-indigo-50 hover:text-indigo-600 rounded text-gray-600 transition-colors"
                        title="إدراج فقرة للأعلى"
                      >
                        <Plus size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteBlock(idx)}
                        className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-600 transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Input field */}
                  <textarea
                    value={block.text}
                    onChange={(e) => handleBlockChange(idx, 'text', e.target.value)}
                    dir="rtl"
                    rows={block.type === 'paragraph' ? 3 : 1}
                    className="w-full text-sm font-sans border border-gray-200 rounded-lg p-3 bg-white text-gray-800 transition-shadow focus:shadow focus:outline-none leading-relaxed"
                    placeholder={
                      block.type === 'heading1' 
                      ? 'العنوان الأساسي للباب أو الفصل...' 
                      : block.type === 'heading2'
                        ? 'عنوان الفقرة أو القسم الفرعي للدرس...'
                        : 'اكتب الشرح، أو التعريف، أو المسائل الرياضية وصيغ LaTeX مثل $x^2 + y^2 = r^2$'
                    }
                  />
                  
                  {block.type === 'paragraph' && block.text.includes('$') && (
                    <p className="text-[10px] text-amber-600 mt-1">يحتوي هذا النص على صيغ رياضية LaTeX وسيتم عرضها بنوعية ممتازة في وضع الاستعراض.</p>
                  )}
                </div>
              ))}

              <div className="pt-4 flex justify-center">
                <button
                  onClick={() => {
                    const newBlocks = [...blocks, { type: 'paragraph' as const, text: '' }];
                    setBlocks(newBlocks);
                    setHasChanges(true);
                  }}
                  className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <Plus size={16} />
                  إضافة فقرة جديدة في نهاية الملف
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share / Preview Copyable JSON Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="text-indigo-600" size={20} />
                <h3 className="font-black text-gray-900 text-lg">مشاركة وهيكلية النص بصيغة JSON</h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1 hover:bg-gray-200 rounded-full text-gray-500 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                هذا الملف JSON مهيكل يحتوي على المعلومات الأساسية والكتل النصية مع تقسيم العناوين الأساسية والفرعية ليتم تخزينه أو نقله واستخدامه في منصات أخرى.
              </p>

              <div className="relative">
                <pre className="p-4 bg-gray-950 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-[350px] dir-ltr text-left">
                  {getFullJSONString()}
                </pre>
                
                <button
                  onClick={handleCopyJSON}
                  className="absolute top-3 right-3 p-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg transition-all border border-gray-700"
                  title="نسخ محتوى JSON بالكامل"
                >
                  {copied ? <Check className="text-emerald-500" size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {copied ? '✅ تم النسخ إلى الحافظة بنجاح!' : 'تنسيق قياسي ومهيكل'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-100 transition-all"
                >
                  إغلاق
                </button>
                <button
                  onClick={handleCopyJSON}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow"
                >
                  نسخ المحتوى
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
