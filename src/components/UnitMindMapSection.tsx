import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Loader2, 
  Trash2, 
  Check, 
  Maximize2, 
  Minimize2, 
  Share2, 
  Download, 
  Layers, 
  Grid, 
  FileText, 
  Info,
  BookOpen,
  AlertTriangle,
  Zap,
  BookmarkCheck
} from 'lucide-react';
import { 
  db, 
  type Document, 
  type LessonSection, 
  type UnitMindMap 
} from '../db';
import { generateUnitMindMapAI } from '../services/gemini';
import { generateSvgFromConceptMap } from '../utils/mindmapSvgGenerator';
import { 
  normalizeConceptMapData, 
  AdvancedConceptMapData, 
  CATEGORY_CONFIG, 
  NodeCategory 
} from '../utils/mindmapParser';
import { InteractiveMindMap } from './InteractiveMindMap';
import { MathRenderer } from './MathRenderer';
import { SyncControlButton } from './SyncControlButton';

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
  const [activeTab, setActiveTab] = useState<'graph' | 'matrix' | 'schema'>('graph');
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
    if (!docId) {
      alert('لم يتم العثور على معرّف الوحدة.');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await generateUnitMindMapAI(document, sections);
      
      if (res && (res.treeData || res.svgCode || res.markdownSchema)) {
        const svgCode = res.svgCode || generateSvgFromConceptMap(res.treeData, res.title);
        const newMap: UnitMindMap = {
          docId,
          title: res.title || `خريطة المفاهيم: ${document.unit || document.title}`,
          svgCode: svgCode,
          markdownSchema: res.markdownSchema || '',
          treeData: res.treeData || null,
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
        showToast('تم بناء وهندسة خريطة المفاهيم والمعارف بنجاح! 🧭✨');
      } else {
        throw new Error('لم يتم استلام بيانات صالحة من محرك الخرائط المفاهيمية الذكي.');
      }
    } catch (err: any) {
      console.error('Error generating concept map:', err);
      alert(err?.message || 'حدث خطأ أثناء توليد خريطة المفاهيم.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!unitMindMap?.id) return;
    if (window.confirm('هل أنت متأكد من حذف خريطة المفاهيم هذه؟')) {
      try {
        await db.unitMindMaps.delete(unitMindMap.id);
        setUnitMindMap(null);
        showToast('تم حذف الخريطة بنجاح.');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDownloadSVG = () => {
    const svgContent = unitMindMap?.svgCode || (unitMindMap?.treeData ? generateSvgFromConceptMap(unitMindMap.treeData, unitMindMap.title) : '');
    if (!svgContent) {
      alert('لا يتوفر ملف SVG للتحميل حالياً.');
      return;
    }
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `conceptmap_${document.unit || 'unit'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const conceptData: AdvancedConceptMapData = useMemo(() => {
    if (unitMindMap?.treeData) {
      return normalizeConceptMapData(unitMindMap.treeData, unitMindMap.title || document.unit || document.title);
    }
    if (unitMindMap?.markdownSchema) {
      return normalizeConceptMapData(unitMindMap.markdownSchema, unitMindMap.title || document.unit || document.title);
    }
    return normalizeConceptMapData(null, document.unit || document.title);
  }, [unitMindMap, document]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
        <p className="text-sm font-bold text-gray-700">جاري تحميل خريطة المفاهيم والمعارف...</p>
      </div>
    );
  }

  // If no mind map exists yet
  if (!unitMindMap) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-100 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden shadow-xs">
        <div className="relative z-10 max-w-2xl mx-auto space-y-6">
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-indigo-100/80">
            <Share2 size={38} className="text-indigo-600" />
          </div>
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-800 rounded-full text-xs font-black border border-amber-500/20">
              <span>🧭</span>
              <span>نظام هندسة الخرائط الذهنية والمفاهيمية الذكية</span>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-indigo-950">
              الخريطة الذهنية البصرية للوحدة
            </h3>
            <p className="text-sm md:text-base text-indigo-900/80 leading-relaxed font-medium">
              خريطة ذهنية بصرية أنيقة وموجزة تربط بين المفاهيم الأساسية، المبرهنات، والخطوات التطبيقية بصيغة LaTeX الرياضية بتصميم ذهبي متناسق.
            </p>
          </div>
          
          {isAdmin && (
            <div className="pt-2">
              <button
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className={`inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl font-black text-sm md:text-base transition-all shadow-xl hover:shadow-amber-500/20 cursor-pointer ${
                  isGenerating 
                    ? 'bg-slate-700 text-slate-300 cursor-not-allowed opacity-85' 
                    : 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-white hover:scale-105 active:scale-95 border-2 border-amber-300/60 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={22} className="animate-spin text-white" />
                    <span className="text-white font-bold">جاري توليد الخريطة الذهنية... 🧭</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={22} className="text-amber-200 animate-pulse" />
                    <span className="text-white drop-shadow-md font-black tracking-wide">
                      توليد الخريطة الذهنية بالذكاء الاصطناعي
                    </span>
                  </>
                )}
              </button>
            </div>
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center border border-indigo-100">
            <Share2 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">{unitMindMap.title}</h3>
            <p className="text-xs text-slate-500 font-medium">شبكة تفاعلية للمفاهيم، المبرهنات، والروابط المعرفية والفخاخ</p>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'graph' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers size={14} />
            <span>الخريطة الشبكية (Graph)</span>
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'matrix' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Grid size={14} />
            <span>دليل المفاهيم والمطبات ({conceptData.nodes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'schema' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={14} />
            <span>الخلاصة المعرفية</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              <SyncControlButton
                table="unitMindMaps"
                id={unitMindMap.id!}
                data={unitMindMap}
                showDraftOption={true}
                buttonText="نشر الخريطة"
              />
              <button
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>إعادة هندسة</span>
              </button>
            </>
          )}
          <button
            onClick={handleDownloadSVG}
            className="p-2 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="تحميل كصورة SVG عالية الدقة"
          >
            <Download size={18} />
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-2 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="عرض ملء الشاشة"
          >
            <Maximize2 size={18} />
          </button>
          {isAdmin && (
            <button
              onClick={handleDelete}
              className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
              title="حذف الخريطة"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'graph' && (
        <div className="bg-slate-950 rounded-3xl border border-slate-800 shadow-md overflow-hidden min-h-[660px] relative p-1">
          {unitMindMap.treeData || unitMindMap.markdownSchema ? (
            <InteractiveMindMap
              treeData={unitMindMap.treeData}
              markdownSchema={unitMindMap.markdownSchema}
              unitTitle={unitMindMap.title || document.unit || document.title}
            />
          ) : unitMindMap.svgCode ? (
            <div 
              className="w-full h-full min-h-[600px] flex items-center justify-center p-4"
              dangerouslySetInnerHTML={{ __html: unitMindMap.svgCode }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[500px] text-center p-8 space-y-4">
              <p className="text-slate-300 text-sm font-bold">لم يتم العثور على عقد بصرية مسجلة لهذه الخريطة.</p>
              <button
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span>هندسة وتوليد الخريطة الآن 🧭</span>
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'matrix' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xs p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <h4 className="text-base font-black text-slate-900">دليل المفاهيم، المبرهنات، والفخاخ الامتحانية</h4>
              <p className="text-xs text-slate-500">استعراض تفصيلي لكافة العقد المعرفية، شروط الانطلاق، والصيغ الرياضية</p>
            </div>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-xs font-black">
              {conceptData.nodes.length} عقدة معرفية
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {conceptData.nodes.map((node, idx) => {
              const cfg = CATEGORY_CONFIG[node.category as NodeCategory] || CATEGORY_CONFIG.concept;
              const relatedEdges = conceptData.edges.filter(e => e.from === node.id || e.to === node.id);

              return (
                <div 
                  key={node.id || idx}
                  className="bg-slate-50 hover:bg-white rounded-2xl border border-slate-200/80 p-4.5 space-y-3 transition-all hover:shadow-md hover:border-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cfg.badgeBg} border`}>
                      <span>{cfg.badge}</span>
                      <span>{cfg.label}</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">#{node.id}</span>
                  </div>

                  <h5 className="font-black text-sm text-slate-900 leading-snug">
                    <MathRenderer content={node.label} />
                  </h5>

                  {node.latex && (
                    <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-center text-amber-300 font-mono text-xs overflow-x-auto">
                      <MathRenderer content={node.latex} />
                    </div>
                  )}

                  {node.description && (
                    <p className="text-xs text-slate-600 leading-relaxed bg-white/80 p-2.5 rounded-xl border border-slate-100">
                      {node.description}
                    </p>
                  )}

                  {relatedEdges.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <span className="text-[10.5px] font-bold text-slate-500 block mb-1">الروابط الدلالية:</span>
                      <div className="space-y-1">
                        {relatedEdges.map((edge, eIdx) => {
                          const isFrom = edge.from === node.id;
                          const otherId = isFrom ? edge.to : edge.from;
                          const otherLabel = conceptData.nodes.find(n => n.id === otherId)?.label || otherId;
                          return (
                            <div key={eIdx} className="text-[10.5px] flex items-center gap-1 text-slate-600">
                              <span className={isFrom ? 'text-indigo-600 font-bold' : 'text-emerald-600 font-bold'}>
                                {isFrom ? '➔' : '⬅'}
                              </span>
                              <span className="text-amber-700 font-semibold">({edge.label || 'يرتبط بـ'})</span>
                              <span className="truncate text-slate-800 font-medium">{otherLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'schema' && (
        <div className="bg-[#0F172A] rounded-3xl border border-slate-800 shadow-md overflow-hidden min-h-[400px] p-6 text-slate-100 space-y-6">
          {conceptData.summary && (
            <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300 font-black text-sm">
                <BookmarkCheck size={18} />
                <span>الخلاصة المعرفية والترابط الكلي للوحدة</span>
              </div>
              <p className="text-sm text-indigo-100/90 leading-relaxed font-medium">
                {conceptData.summary}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-base font-black text-indigo-300">التوصيف الهيكلي البصري الشامل (Markdown Schema)</h4>
            <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-right text-slate-200 bg-slate-900/90 p-4 rounded-2xl border border-slate-800 max-h-[500px] overflow-y-auto" style={{ direction: 'rtl', fontFamily: "'Courier New', Courier, monospace" }}>
              {unitMindMap.markdownSchema || 'لا يوجد توصيف هيكلي متاح.'}
            </pre>
          </div>
        </div>
      )}

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[300] bg-[#0F172A] flex flex-col animate-fade-in">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-[#1E293B]">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Share2 size={20} className="text-indigo-400" />
              <span>{unitMindMap.title}</span>
            </h3>
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Minimize2 size={16} />
              <span>تصغير</span>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#0F172A]">
            <div className="w-full h-full min-h-[600px]">
              <InteractiveMindMap
                treeData={unitMindMap.treeData}
                markdownSchema={unitMindMap.markdownSchema}
                unitTitle={unitMindMap.title || document.unit || document.title}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
