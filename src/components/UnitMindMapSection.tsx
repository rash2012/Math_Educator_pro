import { InteractiveMindMap } from './InteractiveMindMap';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Loader2, 
  Save, 
  Trash2, 
  Check, 
  Maximize2,
  Minimize2,
  Share2,
  Download,
  AlertCircle
} from 'lucide-react';
import { 
  db, 
  type Document, 
  type LessonSection, 
  type UnitMindMap 
} from '../db';
import { generateUnitMindMapAI } from '../services/gemini';

interface UnitMindMapSectionProps {
  document: Document;
  sections: LessonSection[];
  isAdmin?: boolean;
}

export const UnitMindMapSection: React.FC<UnitMindMapSectionProps> = ({
  document,
  sections,
  isAdmin = true
}) => {
  const [unitMindMap, setUnitMindMap] = useState<UnitMindMap | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'svg' | 'schema'>('svg');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const docId = document.id;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const loadMindMapFromDb = async () => {
    if (!docId) return;
    setIsLoading(true);
    try {
      const storedMap = await db.unitMindMaps.where('docId').equals(docId).first();
      if (storedMap) {
        setUnitMindMap(storedMap);
      } else {
        setUnitMindMap(null);
      }
    } catch (err) {
      console.error('Error loading unit mind map:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMindMapFromDb();
  }, [docId]);

  const handleGenerateAI = async () => {
    if (!docId) return;
    setIsGenerating(true);
    try {
      const res = await generateUnitMindMapAI(document, sections);
      
      if (res && res.svgCode) {
        const newMap: UnitMindMap = {
          docId,
          title: res.title || `خريطة ذهنية: \${document.unit || document.title}`,
          svgCode: res.svgCode,
          markdownSchema: res.markdownSchema,
          treeData: res.treeData,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const existing = await db.unitMindMaps.where('docId').equals(docId).first();
        if (existing?.id) {
          newMap.id = existing.id;
          await db.unitMindMaps.put(newMap);
        } else {
          const insertedId = await db.unitMindMaps.add(newMap);
          newMap.id = insertedId as number;
        }

        setUnitMindMap(newMap);
        showToast('تم توليد الخريطة الذهنية بنجاح! 🎨✨');
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'حدث خطأ أثناء التوليد.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!unitMindMap?.id) return;
    if (window.confirm('هل أنت متأكد من حذف هذه الخريطة الذهنية؟')) {
      try {
        await db.unitMindMaps.delete(unitMindMap.id);
        setUnitMindMap(null);
        showToast('تم حذف الخريطة الذهنية بنجاح.');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDownloadSVG = () => {
    if (!unitMindMap?.svgCode) return;
    const blob = new Blob([unitMindMap.svgCode], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `mindmap_\${document.unit || 'unit'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-400" />
        <p className="text-sm font-medium">جاري تحميل الخريطة الذهنية...</p>
      </div>
    );
  }

  // If no mind map exists yet
  if (!unitMindMap) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-3xl p-8 text-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10 max-w-xl mx-auto space-y-5">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-md border border-indigo-50">
            <Share2 size={36} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-indigo-950 mb-2">الخريطة الذهنية للوحدة</h3>
            <p className="text-sm text-indigo-800/80 leading-relaxed font-medium">
              قم بإنشاء رسم احترافي متحرك يربط جميع أفكار ومفاهيم الوحدة مع بعضها البعض. يساعد هذا الملخص البصري الطلاب على تذكر القوانين وربط المفاهيم بسرعة!
            </p>
          </div>
          
          {isAdmin && (
            <button
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className={`inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-white font-black text-sm transition-all shadow-xl hover:shadow-indigo-300/50 \${
                isGenerating 
                  ? 'bg-indigo-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:scale-105 active:scale-95'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>جاري رسم وتصميم الخريطة... 🎨</span>
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  <span>توليد الخريطة الذهنية بالذكاء الاصطناعي</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-fade-in-up">
          <Check size={18} className="text-emerald-400" />
          <span className="text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center">
            <Share2 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">{unitMindMap.title}</h3>
            <p className="text-xs text-slate-500 font-medium">رسم بياني تفاعلي يربط أفكار الوحدة</p>
          </div>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('svg')}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'svg' ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            الخريطة البصرية (SVG)
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'schema' ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            الهيكل الشجري (Schema)
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              إعادة توليد
            </button>
          )}
          <button
            onClick={handleDownloadSVG}
            className="p-2 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            title="تحميل كصورة SVG"
          >
            <Download size={18} />
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-2 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            title="تكبير"
          >
            <Maximize2 size={18} />
          </button>
          {isAdmin && (
            <button
              onClick={handleDelete}
              className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
              title="حذف الخريطة"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* SVG Container */}
      
      {activeTab === 'svg' ? (
        <div className="bg-[#0F172A] rounded-3xl border border-slate-800 shadow-xl overflow-hidden min-h-[400px] flex items-center justify-center relative p-2">
          
          {unitMindMap.treeData ? (
            <InteractiveMindMap treeData={unitMindMap.treeData} />
          ) : (
            <div 
              className="w-full h-full min-h-[500px] flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: unitMindMap.svgCode }}
            />
          )}

        </div>
      ) : (
        <div className="bg-[#0F172A] rounded-3xl border border-slate-800 shadow-xl overflow-hidden min-h-[400px] p-6 text-slate-200">
          <h4 className="text-lg font-bold mb-4 text-indigo-300">التوصيف الهيكلي البصري الشامل</h4>
          <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-right" style={{ direction: 'rtl', fontFamily: "'Courier New', Courier, monospace" }}>
            {unitMindMap.markdownSchema || 'لا يوجد توصيف هيكلي متاح.'}
          </pre>
        </div>
      )}

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[300] bg-[#0F172A] flex flex-col animate-fade-in">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-[#1E293B]">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Share2 size={20} className="text-indigo-600" />
              {unitMindMap.title}
            </h3>
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors"
            >
              <Minimize2 size={16} />
              تصغير
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#0F172A]">
            <div 
              className="w-full max-w-6xl max-h-full"
              dangerouslySetInnerHTML={{ __html: unitMindMap.svgCode }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
