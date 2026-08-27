import React, { useState, useEffect, useRef } from 'react';
import { db, type PastPaper, type PastPaperQuestion } from '../db';
import { solvePastPaperAI } from '../services/gemini';
import { extractPdfText } from '../services/pdf';
import { MathRenderer } from './MathRenderer';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';
import { 
  Loader2, 
  Plus, 
  ArrowRight, 
  Printer, 
  Sparkles, 
  BookOpen, 
  Trash2, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  Upload, 
  HelpCircle,
  Edit3
} from 'lucide-react';

export const PastPapersDashboard: React.FC = () => {
  const [pastPapers, setPastPapers] = useState<PastPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<PastPaper | null>(null);
  const [editingPaper, setEditingPaper] = useState<PastPaper | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<string>('');
  
  // Form fields
  const [title, setTitle] = useState('');
  const [metadata, setMetadata] = useState({
    country: 'سوريا',
    grade: 'الثالث الثانوي العلمي',
    subject: 'الرياضيات',
    part: '',
    unit: ''
  });
  const [year, setYear] = useState('2024');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion state for question solutions
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPastPapers();
  }, []);

  const fetchPastPapers = async () => {
    try {
      const papers = await db.pastPapers.reverse().toArray();
      setPastPapers(papers);
    } catch (err) {
      console.error("Failed to load past papers:", err);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf") {
        setSelectedFile(file);
      } else {
        setError("يرجى اختيار ملف بصيغة PDF فقط.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("يرجى إدخال عنوان للدورة السابقة.");
      return;
    }
    if (!selectedFile) {
      setError("يرجى اختيار ملف PDF لأسئلة الامتحان السابقة.");
      return;
    }

    setError(null);
    setIsGenerating(true);
    setGenerationPhase('جاري قراءة واستخراج النصوص من ملف الـ PDF...');

    try {
      // 1. Extract PDF contents
      const extracted = await extractPdfText(selectedFile);
      
      setGenerationPhase('جاري تحليل الأسئلة بالتفصيل وحل جميع المسائل والتمارين عبر الذكاء الاصطناعي... قد يستغرق هذا دقيقة.');

      // 2. Call Gemini solver
      const solvedData = await solvePastPaperAI(extracted.text, {
        title,
        grade: metadata.grade,
        subject: metadata.subject,
        year
      });

      setGenerationPhase('جاري حفظ الدورة المحلولة وتصنيف الأسئلة في قاعدة البيانات...');

      // 3. Save to database
      const finalPastPaper: PastPaper = {
        title: solvedData.title || title,
        country: metadata.country,
        grade: solvedData.grade || metadata.grade,
        subject: solvedData.subject || metadata.subject,
        part: metadata.part || undefined,
        unit: metadata.unit || undefined,
        year: solvedData.year || year,
        questions: solvedData.questions || [],
        createdAt: Date.now()
      };

      await db.pastPapers.add(finalPastPaper);
      
      // Reset form & state
      setTitle('');
      setSelectedFile(null);
      setIsUploading(false);
      setIsGenerating(false);
      
      // Refresh list
      await fetchPastPapers();
    } catch (err) {
      console.error(err);
      setError("حدث خطأ أثناء تحليل وحل دورة الامتحان. يرجى المحاولة مرة أخرى والتأكد من وضوح نص الـ PDF.");
      setIsGenerating(false);
    }
  };

  const handleSavePaperMetadata = async (updated: {
    title: string;
    country: string;
    grade: string;
    subject: string;
    part?: string;
    unit?: string;
  }) => {
    if (!editingPaper?.id) return;
    await db.pastPapers.update(editingPaper.id, {
      title: updated.title,
      country: updated.country,
      grade: updated.grade,
      subject: updated.subject,
      part: updated.part || undefined,
      unit: updated.unit || undefined
    });
    setEditingPaper(null);
    fetchPastPapers();
  };

  const handleDeletePaper = async (id: number) => {
    if (window.confirm("هل أنت متأكد من حذف هذه الدورة السابقة وحلولها من قاعدة البيانات؟")) {
      try {
        await db.pastPapers.delete(id);
        setSelectedPaper(null);
        await fetchPastPapers();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const toggleSolution = (qId: string) => {
    setExpandedSolutions(prev => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
      {/* Detail view of a selected Past Paper */}
      {selectedPaper ? (
        <div className="space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 no-print">
            <button
              onClick={() => setSelectedPaper(null)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-bold text-sm self-start md:self-auto"
            >
              <ArrowRight size={18} />
              الرجوع للدورات السابقة
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition"
              >
                <Printer size={16} />
                طباعة وتصدير الدورة
              </button>
              <button
                onClick={() => handleDeletePaper(selectedPaper.id!)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-sm transition"
              >
                <Trash2 size={16} />
                حذف الدورة
              </button>
            </div>
          </div>

          {/* Exam Sheet Layout */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-10 space-y-8 print:border-0 print:shadow-none print:p-0">
            {/* Printed Header Block */}
            <div className="border-4 double border-gray-900 p-6 rounded-lg text-center space-y-4 print:border-black">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-gray-600 border-b border-gray-300 pb-3 print:text-black">
                <div>الجمهورية العربية السورية وزارة التربية</div>
                <div className="text-sm font-bold text-gray-900 print:text-black">{selectedPaper.grade}</div>
                <div>المادة: {selectedPaper.subject}</div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-gray-950 font-sans print:text-black">
                  أسئلة الامتحان وحلولها النموذجية: {selectedPaper.title}
                </h2>
                <p className="text-sm text-indigo-700 font-bold no-print">
                  تم استخلاصها وحلها بالذكاء الاصطناعي بنجاح
                </p>
                <p className="text-xs text-gray-500 font-medium">سنة الدورة: {selectedPaper.year}م</p>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-8">
              <h3 className="text-lg font-black text-gray-900 border-b-2 border-gray-800 pb-3 print:text-black flex items-center gap-2">
                <FileText size={20} className="text-orange-500" />
                الأسئلة الرقمية وحلولها النموذجية
              </h3>

              {selectedPaper.questions && selectedPaper.questions.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {selectedPaper.questions.map((q, idx) => (
                    <div key={q.id || idx} className="py-6 first:pt-0 last:pb-0 space-y-4 print:break-inside-avoid">
                      {/* Topic Tag */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-orange-50 text-orange-850 px-2.5 py-1 rounded-md text-xs font-bold border border-orange-200">
                            {q.topic || 'عام'}
                          </span>
                          <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md text-xs font-bold">
                            {q.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي / مسألة'}
                          </span>
                        </div>
                        {/* Interactive toggle for solution (only visible on screen) */}
                        <button
                          onClick={() => toggleSolution(q.id)}
                          className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition no-print"
                        >
                          {expandedSolutions[q.id] ? (
                            <>
                              إخفاء الحل <ChevronUp size={14} />
                            </>
                          ) : (
                            <>
                              عرض الحل <ChevronDown size={14} />
                            </>
                          )}
                        </button>
                      </div>

                      {/* Question Content */}
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 md:p-6 space-y-4 print:bg-white print:border-none print:p-0">
                        <div className="text-gray-900 leading-relaxed font-sans font-medium text-base">
                          <MathRenderer content={q.question} />
                        </div>

                        {/* Optional Question SVG */}
                        {q.svgCode && (
                          <div 
                            className="flex justify-center my-4 overflow-x-auto"
                            dangerouslySetInnerHTML={{ __html: q.svgCode }}
                          />
                        )}

                        {/* MCQ Options */}
                        {q.type === 'mcq' && q.subParts && q.subParts.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 print:grid-cols-2">
                            {q.subParts.map((option, oIdx) => (
                              <div 
                                key={oIdx} 
                                className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg text-sm font-semibold print:border-black"
                              >
                                <span>{option}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Solution Area */}
                      {/* Note: Always show when printing, or if expanded on screen */}
                      <div className={`mt-4 space-y-4 border-l-4 border-emerald-500 bg-emerald-50/40 p-4 md:p-6 rounded-r-xl ${(expandedSolutions[q.id] || window.matchMedia('print').matches) ? 'block' : 'hidden no-print'}`}>
                        <h4 className="font-extrabold text-sm text-emerald-800 flex items-center gap-1.5 border-b border-emerald-100 pb-2">
                          <CheckCircle2 size={16} />
                          الحل النموذجي المعتمد وزاريّاً:
                        </h4>

                        <div className="text-gray-900 leading-relaxed font-sans font-medium">
                          <MathRenderer content={q.solution} />
                        </div>

                        {/* Optional Solution SVG */}
                        {q.solutionSvgCode && (
                          <div 
                            className="flex justify-center my-4 overflow-x-auto" 
                            dangerouslySetInnerHTML={{ __html: q.solutionSvgCode }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 font-medium py-4 text-center">لا توجد أسئلة مضافة في هذه الدورة.</p>
              )}
            </div>
          </div>
        </div>
      ) : isUploading ? (
        /* Upload & Analysis Form */
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 md:p-8 space-y-6">
          <div className="flex justify-between items-center border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                <Upload size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-gray-900">رفع وحل دورة امتحانية سابقة</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  أدخل تفاصيل الدورة وارفع ملف الأسئلة PDF ليقوم الذكاء الاصطناعي بتنظيمها وحلها تفصيليّاً
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsUploading(false)}
              className="text-gray-400 hover:text-gray-700 font-semibold text-sm bg-gray-50 px-3 py-1.5 rounded-lg border"
            >
              إلغاء
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 font-bold text-sm">
              {error}
            </div>
          )}

          {isGenerating ? (
            /* Loading Phase Indicator */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Sparkles className="text-indigo-600 animate-pulse" size={24} />
                </div>
              </div>
              <div className="space-y-2 max-w-md">
                <h4 className="font-extrabold text-gray-900">جاري تحليل وحل ومطابقة المسائل...</h4>
                <p className="text-sm text-gray-600 font-medium leading-relaxed animate-pulse">
                  {generationPhase}
                </p>
                <p className="text-xs text-red-500 font-semibold">
                  تحذير: لا تغلق النافذة الحالية حتى تكتمل المعالجة بنجاح.
                </p>
              </div>
            </div>
          ) : (
            /* Form inputs */
            <form onSubmit={handleStartAnalysis} className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-sm font-bold text-gray-700">عنوان الدورة</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: دورة عام 2023 - الدورة الأولى"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-bold text-gray-700">السنة الامتحانية</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: 2023"
                      value={year}
                      onChange={e => setYear(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Academic Metadata Fields */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <AcademicMetadataFields
                    metadata={metadata}
                    onChange={(updated) => setMetadata(updated)}
                  />
                </div>

                {/* PDF Drag Zones */}
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">ملف الأسئلة (PDF)</label>
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 ${
                      dragActive 
                        ? 'border-indigo-600 bg-indigo-50' 
                        : selectedFile 
                          ? 'border-emerald-500 bg-emerald-50/50' 
                          : 'border-gray-300 hover:border-indigo-500 hover:bg-gray-50/50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    
                    {selectedFile ? (
                      <>
                        <CheckCircle2 size={36} className="text-emerald-500 animate-bounce" />
                        <span className="font-extrabold text-sm text-gray-900 line-clamp-1">{selectedFile.name}</span>
                        <span className="text-xs font-bold text-emerald-800">
                          تم تحميل الملف بنجاح ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                        <span className="text-xs text-gray-500">انقر أو اسحب ملفاً لتغييره</span>
                      </>
                    ) : (
                      <>
                        <Upload size={36} className="text-gray-400" />
                        <span className="font-bold text-sm text-gray-800">اسحب وأفلت ملف الـ PDF هنا</span>
                        <span className="text-xs text-gray-500">أو اضغط لتصفح الملفات من جهازك</span>
                        <span className="bg-gray-100 text-gray-650 px-2.5 py-1.5 rounded-md text-[10px] font-bold mt-1">
                          أقصى حجم: 50MB
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedFile || !title.trim()}
                className="w-full bg-indigo-600 text-white font-extrabold py-3.5 rounded-xl hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-md"
              >
                <Sparkles size={18} />
                بدء استخلاص وحل الدورة السابقة
              </button>
            </form>
          )}
        </div>
      ) : (
        /* Grid of Saved Courses */
        <div className="space-y-6">
          {/* Unified Top Header */}
          <UnifiedPageHeader
            icon={BookOpen}
            title="أرشيف حلول الدورات الامتحانية السابقة"
            subtitle="أسئلة الدورات الامتحانية للشهادة الثانوية مع حلولها المنهجية الكاملة والرسومات التوضيحية"
            badgeText={`${pastPapers.length} دورة`}
            badgeColor="amber"
            actions={
              <button
                onClick={() => setIsUploading(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                <Plus size={15} />
                <span>رفع وحل دورة جديدة</span>
              </button>
            }
          />

          {pastPapers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pastPapers.map(paper => (
                <div
                  key={paper.id}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
                >
                  {/* Top bar with card style */}
                  <div className="p-5 flex-1 space-y-4">
                    <div className="flex justify-between items-start gap-2">
                      <span className="bg-orange-50 text-orange-800 px-2.5 py-1 rounded-lg text-xs font-bold border border-orange-200 flex items-center gap-1">
                        <Calendar size={12} />
                        دورات: {paper.year}
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">
                        {new Date(paper.createdAt).toLocaleDateString('ar-SY')}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-extrabold text-base text-gray-950 line-clamp-1 group-hover:text-indigo-600 transition">
                        {paper.title}
                      </h3>
                      
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-black border border-slate-200">
                          {paper.country || 'سوريا'}
                        </span>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-black border border-indigo-100">
                          {paper.grade}
                        </span>
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-[11px] font-black border border-amber-100">
                          {paper.subject}
                        </span>
                        {paper.unit && (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-blue-100">
                            الوحدة: {paper.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question summary badge */}
                    <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <FileText size={16} className="text-indigo-600" />
                      <span className="text-xs font-bold text-gray-700">
                        تحتوي على {paper.questions?.length || 0} سؤالاً رقميّاً محلولاً بالكامل
                      </span>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="border-t border-gray-100 p-3 bg-gray-50 flex justify-between items-center">
                    <button
                      onClick={() => setSelectedPaper(paper)}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-850"
                    >
                      <Eye size={14} />
                      عرض الدورة وحلولها
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingPaper(paper)}
                        className="text-gray-500 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg transition"
                        title="تعديل بيانات الدورة"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeletePaper(paper.id!)}
                        className="text-gray-450 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition"
                        title="حذف دورة"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-3xl p-16 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
                <BookOpen size={30} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-lg text-gray-900">أرشيف حلول الدورات السابقة فارغ</h3>
                <p className="text-sm text-gray-550 leading-relaxed">
                  لم تقم بإضافة أي دورات سابقة حتى الآن. يمكنك رفع ملفات الـ PDF لأسئلة الدورات السابقة من جهازك، وسيقوم الذكاء الاصطناعي برقمنتها، وتحديد موضوع كل سؤال، وكتابة الحل النموذجي والمفصل مع توليد الجداول والإنشاءات الهندسية.
                </p>
              </div>
              <button
                onClick={() => setIsUploading(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition"
              >
                <Plus size={16} />
                أضف أول دورة امتحانية الآن
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingPaper && (
        <DocumentMetadataModal
          isOpen={!!editingPaper}
          onClose={() => setEditingPaper(null)}
          document={{
            id: editingPaper.id,
            title: editingPaper.title,
            country: editingPaper.country || 'سوريا',
            grade: editingPaper.grade,
            subject: editingPaper.subject,
            part: editingPaper.part,
            unit: editingPaper.unit
          }}
          onSave={handleSavePaperMetadata}
        />
      )}
    </div>
  );
};
