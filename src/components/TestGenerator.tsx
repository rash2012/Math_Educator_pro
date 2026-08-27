import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Sparkles, BookOpen, BrainCircuit, Settings, ChevronDown } from 'lucide-react';
import { db, type Document, type PastPaper } from '../db';
import { generateTest } from '../services/gemini';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DEFAULT_COUNTRY, DEFAULT_GRADE, DEFAULT_SUBJECT, DEFAULT_SERIES_NAME, DEFAULT_TEACHER_NAME, DEFAULT_TEACHER_ROLE } from '../constants/academicData';

interface TestGeneratorProps {
  onSuccess: () => void;
}

export const TestGenerator: React.FC<TestGeneratorProps> = ({ onSuccess }) => {
  const [pdfs, setPdfs] = useState<Document[]>([]);
  const [selectedPdfIds, setSelectedPdfIds] = useState<number[]>([]);
  const [pastPapers, setPastPapers] = useState<PastPaper[]>([]);
  const [selectedPastPaperIds, setSelectedPastPaperIds] = useState<number[]>([]);
  const [metadata, setMetadata] = useState({
    title: '',
    country: DEFAULT_COUNTRY,
    grade: DEFAULT_GRADE,
    subject: DEFAULT_SUBJECT,
    difficulty: 'متوسط',
    advancedSettings: '',
    part: '',
    unit: '',
    topic: '',
    seriesName: DEFAULT_SERIES_NAME,
    teacherName: DEFAULT_TEACHER_NAME
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [advancedMapping, setAdvancedMapping] = useState({
    q1: '', q2: '', q3: '',
    e1: '', e2: '', e3: '',
    p1: '', p2: ''
  });

  useEffect(() => {
    const fetchPdfs = async () => {
      const allDocs = await db.documents.where('type').equals('pdf').toArray();
      setPdfs(allDocs);
      const allPastPapers = await db.pastPapers.toArray();
      setPastPapers(allPastPapers);
    };
    fetchPdfs();
  }, []);

  const handleTogglePdf = (id: number) => {
    setSelectedPdfIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const handleTogglePastPaper = (id: number) => {
    setSelectedPastPaperIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (selectedPdfIds.length === 0) {
      setError("الرجاء تحديد مراجع (PDF) لإنشاء الاختبار منها.");
      return;
    }
    if (!metadata.title) {
        setError("الرجاء كتابة عنوان الاختبار.");
        return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Combine PDF Contents
      let combinedPdfContent = "";
      let missingTextDocs: string[] = [];
      
      for (const docId of selectedPdfIds) {
          const pdfContentItem = await db.pdfContents.where('docId').equals(docId).first();
          if (pdfContentItem) {
              if (!pdfContentItem.textContent || pdfContentItem.textContent.trim().length < 100) {
                  const doc = pdfs.find(p => p.id === docId);
                  if (doc) missingTextDocs.push(doc.title);
              }
              combinedPdfContent += `\n\n--- مرجع: ${docId} ---\n` + pdfContentItem.textContent;
          }
      }

      if (missingTextDocs.length > 0) {
          const proceed = window.confirm(`تنبيه: المستندات التالية لا تحتوي على نص مستخلص (قد تكون نسخاً مصورة):\n${missingTextDocs.join('\n')}\n\nتوليد الاختبار الآن سيعتمد على معلومات عامة وقد لا يلتزم بالمصدر. هل تريد المتابعة؟\n\nنصيحة: اذهب للمكتبة واستخدم "استخلاص النص بالذكاء الاصطناعي" لهذه الملفات أولاً.`);
          if (!proceed) {
              setIsGenerating(false);
              return;
          }
      }

      // 2. Fetch Past Questions (Anti-Duplication)
      const pastTests = await db.tests
          .where('[grade+subject]')
          .equals([metadata.grade, metadata.subject])
          .reverse()
          .limit(10)
          .toArray();

      const pastQuestionsSet = new Set<string>();
      pastTests.forEach(test => {
          if (test.testData && test.testData.sections) {
              test.testData.sections.forEach((sec: any) => {
                  sec.questions?.forEach((q: any) => {
                      if (q.text) pastQuestionsSet.add(q.text);
                  });
              });
          }
      });
      const pastQuestions = Array.from(pastQuestionsSet);

      // 3. Generate Test
      const scopeDescriptions = pdfs.filter(p => p.id && selectedPdfIds.includes(p.id)).map(p => p.title).join(', ');
      
      let compiledAdvancedSettings = metadata.advancedSettings;
      let customMappings = `تخصيص الوحدات لكل فقرة (الالتزام الصارم):\n`;
      if (advancedMapping.q1) customMappings += `- السؤال الأول: وحدة ${advancedMapping.q1}\n`;
      if (advancedMapping.q2) customMappings += `- السؤال الثاني: وحدة ${advancedMapping.q2}\n`;
      if (advancedMapping.q3) customMappings += `- السؤال الثالث: وحدة ${advancedMapping.q3}\n`;
      if (advancedMapping.e1) customMappings += `- التمرين الأول: وحدة ${advancedMapping.e1}\n`;
      if (advancedMapping.e2) customMappings += `- التمرين الثاني: وحدة ${advancedMapping.e2}\n`;
      if (advancedMapping.e3) customMappings += `- التمرين الثالث: وحدة ${advancedMapping.e3}\n`;
      if (advancedMapping.p1) customMappings += `- المسألة الأولى: وحدة ${advancedMapping.p1}\n`;
      if (advancedMapping.p2) customMappings += `- المسألة الثانية: وحدة ${advancedMapping.p2}\n`;

      if (customMappings !== `تخصيص الوحدات لكل فقرة (الالتزام الصارم):\n`) {
          compiledAdvancedSettings = (compiledAdvancedSettings + '\n\n' + customMappings).trim();
      }

      // Incorporate Past Exams difficulty simulation
      let pastExamsDifficultyInstruction = "";
      if (selectedPastPaperIds.length > 0) {
        pastExamsDifficultyInstruction = "\n\n⚠️ يرجى محاكاة مستوى صعوبة ونمط الأسئلة المقالية والمسائل للشهادة الثانوية العامة الواردة في الدورات السابقة المذكورة أدناه:\n";
        selectedPastPaperIds.forEach(paperId => {
          const paper = pastPapers.find(p => p.id === paperId);
          if (paper) {
            pastExamsDifficultyInstruction += `\n- دورة [${paper.title}]:\n`;
            paper.questions.forEach((q) => {
              if (q.type === 'essay') {
                pastExamsDifficultyInstruction += `   * سؤال مقالي: [الموضوع: ${q.topic}] نص السؤال: "${q.question.substring(0, 300)}..."\n`;
              }
            });
          }
        });
        pastExamsDifficultyInstruction += "\nتنبيه هام وموثوق: يجب صياغة الأسئلة المقالية والتمارين والمسائل الجديدة في الاختبار الحالي لتتماثل وتتطابق هندسيّاً ورياضيّاً وبنفس معيار التعقيد العلمي والخطوات المنطقية والشروط الدقيقة مع الأسئلة المقالية للدورات المذكورة أعلاه لكي تماثلها تماماً وتحاكيها في الصعوبة.\n";
      }

      if (pastExamsDifficultyInstruction) {
        compiledAdvancedSettings = (compiledAdvancedSettings + '\n\n' + pastExamsDifficultyInstruction).trim();
      }

      const config = {
          grade: metadata.grade,
          subject: metadata.subject,
          difficulty: metadata.difficulty,
          scope: scopeDescriptions,
          advancedSettings: compiledAdvancedSettings,
          part: metadata.part,
          unit: metadata.unit
      };

      const testData = await generateTest(combinedPdfContent, config, pastQuestions);

      // 4. Save to DB
      await db.tests.add({
          title: testData.title || metadata.title,
          country: metadata.country || DEFAULT_COUNTRY,
          grade: metadata.grade,
          subject: metadata.subject,
          part: metadata.part || undefined,
          unit: metadata.unit || undefined,
          topic: metadata.topic || undefined,
          seriesName: metadata.seriesName || DEFAULT_SERIES_NAME,
          teacherName: metadata.teacherName || DEFAULT_TEACHER_NAME,
          teacherRole: DEFAULT_TEACHER_ROLE,
          difficulty: metadata.difficulty,
          scope: scopeDescriptions,
          pdfIds: selectedPdfIds,
          testData: testData,
          createdAt: Date.now()
      });

      onSuccess();
    } catch (err) {
      console.error(err);
      setError("حدث خطأ أثناء توليد الاختبار. يرجى التأكد من اختيار مراجع كافية والمحاولة مرة أخرى.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
        <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-6">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
            <BrainCircuit className="text-emerald-600" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">توليد اختبار ذكي بالذكاء الاصطناعي</h1>
            <p className="text-sm text-gray-550 mt-1">
              قم بإنشاء اختبارات احترافية غير مكررة تعتمد على مراجع الـ PDF المحفوظة
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-200 font-medium">
            {error}
          </div>
        )}

        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-750">عنوان الاختبار</label>
                    <input
                        type="text"
                        value={metadata.title}
                        onChange={e => setMetadata(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="مثال: اختبار شامل منتصف الفصل الأول"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-750">مستوى الصعوبة</label>
                    <select
                        value={metadata.difficulty}
                        onChange={e => setMetadata(prev => ({ ...prev, difficulty: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-semibold text-sm"
                    >
                        <option value="سهل">سهل (تطبيق مباشر)</option>
                        <option value="متوسط">متوسط (تمارين مركبة)</option>
                        <option value="صعب">صعب (مسائل متقدمة)</option>
                        <option value="مهارات تفكير عليا">مهارات تفكير عليا (إبداعي)</option>
                    </select>
                </div>
            </div>

            <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                <AcademicMetadataFields
                    metadata={{
                        country: metadata.country,
                        grade: metadata.grade,
                        subject: metadata.subject,
                        part: metadata.part,
                        unit: metadata.unit,
                        topic: metadata.topic
                    }}
                    showTopic={true}
                    onChange={(updated) => setMetadata(prev => ({
                        ...prev,
                        country: updated.country,
                        grade: updated.grade,
                        subject: updated.subject,
                        part: updated.part || '',
                        unit: updated.unit || '',
                        topic: updated.topic || ''
                    }))}
                    layout="grid"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-750">اسم السلسلة / الكراس (اختياري)</label>
                    <input
                        type="text"
                        value={metadata.seriesName}
                        onChange={e => setMetadata(prev => ({ ...prev, seriesName: e.target.value }))}
                        placeholder="سلسلة التعلم الذكي"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-750">اسم المدرس / المؤلف (اختياري)</label>
                    <input
                        type="text"
                        value={metadata.teacherName}
                        onChange={e => setMetadata(prev => ({ ...prev, teacherName: e.target.value }))}
                        placeholder="حسن راشد العلي"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-sm"
                    />
                </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                <button 
                    type="button"
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                    <div className="flex items-center gap-2 font-bold text-gray-800">
                        <Settings size={20} className="text-emerald-600" />
                        الإعدادات المتقدمة (توزيع الأسئلة على الوحدات)
                    </div>
                    <ChevronDown size={20} className={`text-gray-500 transition-transform duration-200 ${showAdvancedSettings ? 'rotate-180' : ''}`} />
                </button>
                
                {showAdvancedSettings && (
                    <div className="p-4 border-t border-gray-200 space-y-4 bg-white">
                        <p className="text-sm text-gray-600 leading-relaxed font-semibold">
                            يمكنك هنا توجيه الذكاء الاصطناعي بشكل دقيق لربط أسئلة ومسائل الاختبار بوحدات معينة لتلبية الخطة الدرسية تماماً (الالتزام الصارم).
                        </p>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Questions */}
                            <div>
                                <h4 className="font-extrabold text-sm text-gray-800 mb-3 border-b border-gray-200 pb-2">ثانياً: الأسئلة (3 أسئلة)</h4>
                                <div className="space-y-3">
                                    <div className="flex gap-3 items-center">
                                        <span className="text-sm font-bold text-gray-600 w-16">السؤال 1:</span>
                                        <input type="text" placeholder="مثال: وحدة المتتاليات" value={advancedMapping.q1} onChange={e => setAdvancedMapping(prev => ({...prev, q1: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold" />
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        <span className="text-sm font-bold text-gray-600 w-16">السؤال 2:</span>
                                        <input type="text" placeholder="مثال: الاشتقاق" value={advancedMapping.q2} onChange={e => setAdvancedMapping(prev => ({...prev, q2: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold" />
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        <span className="text-sm font-bold text-gray-600 w-16">السؤال 3:</span>
                                        <input type="text" placeholder="الوحدة المحددة..." value={advancedMapping.q3} onChange={e => setAdvancedMapping(prev => ({...prev, q3: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold" />
                                    </div>
                                </div>
                            </div>

                            {/* Exercises */}
                            <div>
                                <h4 className="font-extrabold text-sm text-gray-800 mb-3 border-b border-gray-200 pb-2">ثالثاً: التمارين (3 تمارين)</h4>
                                <div className="space-y-3">
                                    <div className="flex gap-3 items-center">
                                        <span className="text-sm font-bold text-gray-600 w-16">التمرين 1:</span>
                                        <input type="text" placeholder="الوحدة المحددة..." value={advancedMapping.e1} onChange={e => setAdvancedMapping(prev => ({...prev, e1: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold" />
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        <span className="text-sm font-bold text-gray-600 w-16">التمرين 2:</span>
                                        <input type="text" placeholder="مثال: دمج نهايات واشتقاق" value={advancedMapping.e2} onChange={e => setAdvancedMapping(prev => ({...prev, e2: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold" />
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        <span className="text-sm font-bold text-gray-600 w-16">التمرين 3:</span>
                                        <input type="text" placeholder="الوحدة المحددة..." value={advancedMapping.e3} onChange={e => setAdvancedMapping(prev => ({...prev, e3: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold" />
                                    </div>
                                </div>
                            </div>

                            {/* Problems */}
                            <div className="lg:col-span-2">
                                <h4 className="font-extrabold text-sm text-gray-800 mb-3 border-b border-gray-200 pb-2">رابعاً: المسائل (مسألتين)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex gap-3 items-start">
                                        <span className="text-sm font-bold text-gray-600 w-16 mt-2">المسألة 1:</span>
                                        <textarea placeholder="مثال: دمج العقدية والتحويلات الهندسية..." value={advancedMapping.p1} onChange={e => setAdvancedMapping(prev => ({...prev, p1: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[60px] font-semibold" />
                                    </div>
                                    <div className="flex gap-3 items-start">
                                        <span className="text-sm font-bold text-gray-600 w-16 mt-2">المسألة 2:</span>
                                        <textarea placeholder="مثال: مسألة دراسة تغيرات شاملة (دالة أسية)..." value={advancedMapping.p2} onChange={e => setAdvancedMapping(prev => ({...prev, p2: e.target.value}))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[60px] font-semibold" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 mt-6 border-t border-gray-200 pt-4">
                            <label className="text-sm font-bold text-gray-800">إرشادات إضافية للذكاء الاصطناعي (اختياري)</label>
                            <textarea
                                value={metadata.advancedSettings}
                                onChange={e => setMetadata(prev => ({ ...prev, advancedSettings: e.target.value }))}
                                placeholder="مثال: ركز على أسئلة الربط، تجنب الأسئلة المباشرة جداً..."
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none min-h-[80px] text-sm font-semibold"
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                {/* PDF References */}
                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
                        <BookOpen size={18} className="text-emerald-600" />
                        المراجع (نطاق المحتوى المحلل) <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-2">اختر ملفات الـ PDF التي سيعتمد عليها الذكاء الاصطناعي لتوليد الأسئلة.</p>
                    <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {pdfs.length > 0 ? (
                            pdfs.map(pdf => (
                                <label key={pdf.id} className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${selectedPdfIds.includes(pdf.id!) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}>
                                    <input
                                        type="checkbox"
                                        className="mt-1 w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                        checked={selectedPdfIds.includes(pdf.id!)}
                                        onChange={() => handleTogglePdf(pdf.id!)}
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm text-gray-900 line-clamp-1">{pdf.title}</span>
                                        <span className="text-[10px] text-gray-400 mt-1">{pdf.grade} - {pdf.subject}</span>
                                        {pdf.topic && <span className="text-[10px] font-semibold text-amber-700 mt-0.5 line-clamp-1">{pdf.topic}</span>}
                                    </div>
                                </label>
                            ))
                        ) : (
                            <div className="col-span-full py-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                <p className="text-gray-555 font-semibold">لا توجد مراجع PDF محفوظة في المكتبة.</p>
                                <p className="text-xs text-gray-400 mt-1">يجب رفع ملفات PDF كـ "مرجع" للتمكن من توليد الاختبارات وتحديد نطاق المحتوى.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Past Exams simulation references */}
                <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
                        <Sparkles size={18} className="text-indigo-600" />
                        محاكاة الدورات السابقة (اختياري)
                    </label>
                    <p className="text-xs text-gray-500 mb-2">اختر الدورات السابقة لمحاكاة درجة صعوبتها وصياغتها (للأسئلة المقالية).</p>
                    <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {pastPapers.length > 0 ? (
                            pastPapers.map(paper => (
                                <label key={paper.id} className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${selectedPastPaperIds.includes(paper.id!) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}>
                                    <input
                                        type="checkbox"
                                        className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        checked={selectedPastPaperIds.includes(paper.id!)}
                                        onChange={() => handleTogglePastPaper(paper.id!)}
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm text-gray-900 line-clamp-1">{paper.title}</span>
                                        <span className="text-[10px] text-gray-550 mt-1">{paper.grade} - {paper.subject} ({paper.year})</span>
                                        <span className="text-[10px] font-semibold text-indigo-700 mt-0.5">تحوي {paper.questions?.length || 0} أسئلة محلولة</span>
                                    </div>
                                </label>
                            ))
                        ) : (
                            <div className="col-span-full py-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                <p className="text-gray-555 font-semibold">أرشيف الدورات السابقة فارغ حالياً.</p>
                                <p className="text-xs text-gray-400 mt-1">رفع دورة سابقة في قسم "الدورات السابقة" يتيح لك محاكاة صعوبتها هنا.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button
                onClick={handleGenerate}
                disabled={isGenerating || pdfs.length === 0}
                className="w-full mt-6 bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-emerald-700 transition-colors shadow-lg hover:shadow-xl disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="animate-spin" size={24} />
                        يتم تحليل المراجع وتوليد الاختبار الذكي...
                    </>
                ) : (
                    <>
                        <Sparkles size={24} />
                        توليد الاختبار
                    </>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};
