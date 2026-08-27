import React, { useState, useEffect } from 'react';
import { db, type Test, type Document } from '../db';
import { ArrowRight, Loader2, Printer, Edit, Save, RefreshCw, Sparkles, Image as ImageIcon, Lightbulb, Settings, Plus, X, Trash, Lock, LockOpen, CheckCircle2, ClipboardCheck, BrainCircuit, Scale, BarChart3, TrendingUp, Gauge, Clock, ShieldAlert, FileSpreadsheet, BookOpen, CheckCircle, AlertTriangle, Info, ListOrdered } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateAlternativeQuestion, generateSvgForTestQuestion, generateSolutionForQuestion, reviewTest, applyFixesToTest, reviewSingleQuestion } from '../services/gemini';
import Markdown from 'react-markdown';
import { Checkbox } from './ui/Checkbox';

import { MathRenderer } from './MathRenderer';
import { SmartMathEditor } from './SmartMathEditor';
import { QuestionDesignerModal } from './QuestionDesignerModal';

const ARA_ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر"];
const ARA_ORDINALS_FEM = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];

interface TestViewProps {
  testId: number;
  onBack: () => void;
}

export const TestView: React.FC<TestViewProps> = ({ testId, onBack }) => {
  const [test, setTest] = useState<Test | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [generatingForBase, setGeneratingForBase] = useState<string | null>(null);
  const [printPreview, setPrintPreview] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [expandedActions, setExpandedActions] = useState<string | null>(null);
  const [isDesignerModalOpen, setIsDesignerModalOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [reviewingQuestionKey, setReviewingQuestionKey] = useState<string | null>(null);
  const [questionReviewResult, setQuestionReviewResult] = useState<{ analysis: string; suggestedFix: any; indices?: { s: number; q: number } } | null>(null);
  const [showQuestionReview, setShowQuestionReview] = useState(false);
  const [showRecommendationsModal, setShowRecommendationsModal] = useState(false);
  const [userRecommendations, setUserRecommendations] = useState('');
  const [useWatermark, setUseWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('حسن راشد العلي');
  const [watermarkRepeats, setWatermarkRepeats] = useState<number>(3);
  const [printFont, setPrintFont] = useState<'default' | 'cairo' | 'amiri' | 'tajawal' | 'almarai' | 'al-mithaq'>('default');

  useEffect(() => {
    const loadTest = async () => {
      const t = await db.tests.get(testId);
      setTest(t);
      setLoading(false);
    };
    loadTest();
  }, [testId, showAnswers]);

  const getRelatedPdfContent = async () => {
    if (!test) return "";
    
    let combinedPdfContent = "";
    if (test.pdfIds && test.pdfIds.length > 0) {
        const pdfContentsList = await db.pdfContents.where('docId').anyOf(test.pdfIds).toArray();
        combinedPdfContent = pdfContentsList.map(pc => pc.textContent).join('\n---\n');
    } else {
        // Fallback to related PDFs by grade/subject if pdfIds is missing (for older tests)
        const pdfs = await db.documents.where('type').equals('pdf').toArray();
        const relatedPdfs = pdfs.filter(p => !p.grade || (p.grade === test.grade && p.subject === test.subject));
        const relatedPdfIds = relatedPdfs.map(p => p.id!).filter(id => id);
        const pdfContentsList = await db.pdfContents.where('docId').anyOf(relatedPdfIds).toArray();
        combinedPdfContent = pdfContentsList.map(pc => pc.textContent).join('\n---\n');
    }
    return combinedPdfContent;
  };

  const handleRegenerateQuestion = async (sectionIdx: number, questionIdx: number) => {
    if (!test || !test.testData) return;
    
    setGeneratingForBase(`${sectionIdx}-${questionIdx}`);
    try {
        const section = test.testData.sections[sectionIdx];
        
        // Load context
        const combinedPdfContent = await getRelatedPdfContent();

        const pastTests = await db.tests.where('[grade+subject]').equals(`${test.grade}+${test.subject}`).reverse().limit(10).toArray();
        const pastQuestions: string[] = [];
        pastTests.forEach(t => {
            if(t.testData && t.testData.sections) {
                t.testData.sections.forEach((s: any) => {
                    s.questions?.forEach((q: any) => pastQuestions.push(q.text));
                });
            }
        });
        
        // Also add current test questions
        test.testData.sections.forEach((s: any) => {
             s.questions?.forEach((q: any) => pastQuestions.push(q.text));
        });

        const newQuestion = await generateAlternativeQuestion(
            combinedPdfContent,
            section.sectionType,
            { grade: test.grade, subject: test.subject, difficulty: test.difficulty },
            pastQuestions
        );

        const newTestData = { ...test.testData };
        newTestData.sections[sectionIdx].questions[questionIdx] = newQuestion;
        
        setTest({ ...test, testData: newTestData });
        setHasUnsavedChanges(true);
    } catch (error) {
        console.error("Failed to regenerate", error);
        alert("فشل توليد سؤال بديل");
    } finally {
        setGeneratingForBase(null);
    }
  };

  const handleGenerateSvgTest = async (sectionIdx: number, questionIdx: number) => {
    if (!test || !test.testData) return;
    setGeneratingForBase(`svg-${sectionIdx}-${questionIdx}`);
    try {
        const q = test.testData.sections[sectionIdx].questions[questionIdx];
        const contentToVisualize = q.text + '\n' + (q.subQuestions ? q.subQuestions.join('\n') : '');
        
        const svgCode = await generateSvgForTestQuestion(contentToVisualize);
        
        const newTestData = { ...test.testData };
        // If it's a "Draw" question, prefer solutionSvgCode
        const isSolutionGraph = /ارسم|رسم|الخط البياني/i.test(q.text + (q.subQuestions?.join('') || ''));
        
        if (isSolutionGraph) {
            newTestData.sections[sectionIdx].questions[questionIdx].solutionSvgCode = svgCode;
        } else {
            newTestData.sections[sectionIdx].questions[questionIdx].svgCode = svgCode;
        }
        
        setTest({ ...test, testData: newTestData });
        setHasUnsavedChanges(true);
    } catch (e) {
        console.error(e);
        alert("فشل في توليد مستند الرسم");
    } finally {
        setGeneratingForBase(null);
    }
  };

  const handleGenerateSolutionTest = async (sectionIdx: number, questionIdx: number) => {
    if (!test || !test.testData) return;
    setGeneratingForBase(`sol-${sectionIdx}-${questionIdx}`);
    try {
        const q = test.testData.sections[sectionIdx].questions[questionIdx];
        const contentToSolve = q.text + '\n' + (q.subQuestions ? q.subQuestions.join('\n') : '') + '\n' + (q.options ? q.options.join('\n') : '');
        
        const combinedPdfContent = await getRelatedPdfContent();
        const result = await generateSolutionForQuestion(contentToSolve, combinedPdfContent);
        
        const newTestData = { ...test.testData };
        if (result.hasError && result.correctedQuestion) {
            if (result.correctedQuestion.text) {
                newTestData.sections[sectionIdx].questions[questionIdx].text = result.correctedQuestion.text;
            }
            if (result.correctedQuestion.subQuestions && newTestData.sections[sectionIdx].questions[questionIdx].subQuestions) {
                newTestData.sections[sectionIdx].questions[questionIdx].subQuestions = result.correctedQuestion.subQuestions;
            }
        }
        newTestData.sections[sectionIdx].questions[questionIdx].solution = result.solution;
        if (result.solutionSvgCode) {
            newTestData.sections[sectionIdx].questions[questionIdx].solutionSvgCode = result.solutionSvgCode;
        }
        
        setTest({ ...test, testData: newTestData });
        setHasUnsavedChanges(true);
    } catch (e) {
        console.error(e);
        alert("فشل في استخراج حل تفصيلي. يرجى المحاولة مرة أخرى.");
    } finally {
        setGeneratingForBase(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-indigo-600" size={48} />
    </div>
  );

  if (!test) return <div>الاختبار غير موجود</div>;

  const data = test.testData;

  const handlePrint = () => {
      setPrintPreview(true);
  };

  const handleNativePrint = () => {
      window.print();
  };

  const updateQuestionData = (sectionIdx: number, questionIdx: number, updater: (q: any) => void) => {
    setTest(prev => {
      if (!prev || !prev.testData) return prev;
      const newTestData = JSON.parse(JSON.stringify(prev.testData));
      if (newTestData.sections[sectionIdx]?.questions[questionIdx]) {
        updater(newTestData.sections[sectionIdx].questions[questionIdx]);
      }
      return { ...prev, testData: newTestData };
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
      if (!test) return;
      await db.tests.update(testId, { testData: test.testData, title: test.title, isReviewed: test.isReviewed });
      setHasUnsavedChanges(false);
      setIsEditing(false);
      alert('تم حفظ التعديلات بنجاح');
  };

  const toggleReviewStatus = async () => {
    if (!test || !test.id) return;
    const newStatus = !test.isReviewed;
    await db.tests.update(test.id, { isReviewed: newStatus });
    setTest({ ...test, isReviewed: newStatus });
  };

  const handleReviewAI = async () => {
    if (!test || !test.id) return;
    setReviewing(true);
    try {
      const result = await reviewTest(test.title, test.testData, userRecommendations);
      await db.tests.update(testId, { 
        reviewReport: result.reportMarkdown,
        reviewIssues: result.issues 
      });
      setTest({ 
        ...test, 
        reviewReport: result.reportMarkdown,
        reviewIssues: result.issues
      });
      setSelectedIssueIds(result.issues.map(i => i.id)); // Select all by default
      setShowReport(true);
    } catch (error) {
      console.error(error);
      alert("فشل في مراجعة الاختبار");
    } finally {
      setReviewing(false);
    }
  };

  const handleApplyFixes = async () => {
    if (!test || !test.id || !test.reviewIssues) return;
    const selectedIssues = test.reviewIssues.filter(i => selectedIssueIds.includes(i.id));
    if (selectedIssues.length === 0) {
      alert("يرجى تحديد أخطاء لإصلاحها أولاً.");
      return;
    }

    setFixing(true);
    try {
      const updatedTestData = await applyFixesToTest(test.testData, selectedIssues);
      
      // Update local state
      setTest({ ...test, testData: updatedTestData });
      setHasUnsavedChanges(true);
      
      // Clear selection after fix
      setSelectedIssueIds([]);
      setShowReport(false);
      
      alert("تم تطبيق الإصلاحات بنجاح. يرجى مراجعة التغييرات وحفظ الاختبار.");
    } catch (error) {
      console.error(error);
      alert("فشل في تطبيق الإصلاحات.");
    } finally {
      setFixing(false);
    }
  };

  const handleReviewSingleQuestion = async (sectionIdx: number, questionIdx: number) => {
    if (!test || !test.testData) return;
    const key = `${sectionIdx}-${questionIdx}`;
    setReviewingQuestionKey(key);
    
    try {
      const question = test.testData.sections[sectionIdx].questions[questionIdx];
      const pdfContent = await getRelatedPdfContent();
      const result = await reviewSingleQuestion(question, pdfContent);
      setQuestionReviewResult({ ...result, indices: { s: sectionIdx, q: questionIdx } });
      setShowQuestionReview(true);
    } catch (error) {
      console.error(error);
      alert("فشل مراجعة السؤال");
    } finally {
      setReviewingQuestionKey(null);
    }
  };

  const handleApplySingleFix = (sectionIdx: number, questionIdx: number, fixType: 'text' | 'solution' | 'all') => {
    if (!questionReviewResult || !test) return;
    
    const { suggestedFix } = questionReviewResult;
    const newTestData = JSON.parse(JSON.stringify(test.testData));
    const q = newTestData.sections[sectionIdx].questions[questionIdx];
    
    if (fixType === 'text' || fixType === 'all') {
      if (suggestedFix.text) q.text = suggestedFix.text;
      if (suggestedFix.subQuestions) q.subQuestions = suggestedFix.subQuestions;
      if (suggestedFix.options) q.options = suggestedFix.options;
    }
    
    if (fixType === 'solution' || fixType === 'all') {
      if (suggestedFix.solution) q.solution = suggestedFix.solution;
    }
    
    setTest({ ...test, testData: newTestData });
    setHasUnsavedChanges(true);
    setShowQuestionReview(false);
    setQuestionReviewResult(null);
    alert("تم تطبيق التعديلات بنجاح.");
  };

  const handleAddDesignerQuestion = (newQuestion: any) => {
    if (!test || !test.testData) return;
    
    setTest(prev => {
        if (!prev || !prev.testData) return prev;
        const newTestData = JSON.parse(JSON.stringify(prev.testData));
        
        // Find a suitable section (usually the last section that is not MCQ, or just the last section)
        let sectionIdx = newTestData.sections.length - 1;
        if (sectionIdx < 0) {
            newTestData.sections.push({
                sectionType: 'exercises',
                title: 'تمارين مضافة:',
                questions: []
            });
            sectionIdx = 0;
        }
        
        newTestData.sections[sectionIdx].questions.push(newQuestion);
        return { ...prev, testData: newTestData };
    });
    setHasUnsavedChanges(true);
  };

  const handleCancelChanges = async () => {
      setLoading(true);
      const t = await db.tests.get(testId);
      setTest(t);
      setHasUnsavedChanges(false);
      setIsEditing(false);
      setLoading(false);
  };

  const handleRemoveQuestion = (sectionIdx: number, questionIdx: number) => {
      if (!test) return;
      // Remove confirm to avoid potential blocking issues in iFrame
      setTest(prev => {
          if (!prev || !prev.testData) return prev;
          const newTestData = JSON.parse(JSON.stringify(prev.testData));
          newTestData.sections[sectionIdx].questions.splice(questionIdx, 1);
          return { ...prev, testData: newTestData };
      });
      setExpandedActions(null);
      setHasUnsavedChanges(true);
  };

  const handleAddQuestion = (sectionIdx: number, questionIdx: number) => {
      if (!test) return;
      setTest(prev => {
          if (!prev || !prev.testData) return prev;
          const newTestData = JSON.parse(JSON.stringify(prev.testData));
          const sectionType = newTestData.sections[sectionIdx].sectionType;
          const newQuestion = sectionType === 'mcq' 
              ? { text: "سؤال جديد", options: ["خيار A", "خيار B", "خيار C", "خيار D"], correctOptionIndex: Math.floor(Math.random() * 4), solution: "الحل", points: 1 }
              : { text: "سؤال جديد", subQuestions: ["طلب 1", "طلب 2"], solution: "الحل", points: 1 };
          
          newTestData.sections[sectionIdx].questions.splice(questionIdx + 1, 0, newQuestion);
          return { ...prev, testData: newTestData };
      });
      setHasUnsavedChanges(true);
  };

  const handleAddSubQuestion = (sectionIdx: number, questionIdx: number) => {
      if (!test) return;
      updateQuestionData(sectionIdx, questionIdx, (q) => {
          if (!q.subQuestions) q.subQuestions = [];
          q.subQuestions.push("طلب جديد");
      });
  };

  const handleRemoveSubQuestion = (sectionIdx: number, questionIdx: number, subIdx: number) => {
      if (!test) return;
      // Remove confirm to avoid potential blocking issues in some environments
      updateQuestionData(sectionIdx, questionIdx, (q) => {
          if (q.subQuestions) {
              q.subQuestions.splice(subIdx, 1);
          }
      });
  };

  const getQuestionTitleNode = (sectionType: string, qIdx: number, isEdit: boolean) => {
      let title: string | number = qIdx + 1;
      if (sectionType === 'questions') {
          title = `السؤال ${ARA_ORDINALS[qIdx] || (qIdx + 1)} :`;
      } else if (sectionType === 'exercises') {
          title = `التمرين ${ARA_ORDINALS[qIdx] || (qIdx + 1)} :`;
      } else if (sectionType === 'problems') {
          title = `المسألة ${ARA_ORDINALS_FEM[qIdx] || (qIdx + 1)} :`;
      }

      if (typeof title === 'number' || sectionType === 'mcq') {
          return <span className={`flex items-center justify-center w-6 h-6 rounded-full border border-black text-black shrink-0 text-sm ${isEdit ? 'mt-2' : ''}`}>{qIdx + 1}</span>;
      }
      return <span className={`font-bold shrink-0 text-black whitespace-nowrap ${isEdit ? 'mt-2' : ''}`}>{title}</span>;
  };

  return (
    <div className={`mx-auto p-4 md:p-6 pb-24 print:bg-white print:p-0 print:m-0 print:w-full print:max-w-none print:h-auto print:min-h-0 ${printPreview ? 'min-h-screen bg-gray-100 flex flex-col items-center pt-8' : 'max-w-5xl'}`}>
      
      {/* Top Header */}
      {!printPreview ? (
        <div className="flex items-center justify-between mb-8 no-print">
          <div className="flex items-center gap-4">
              <button 
                  onClick={onBack}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                  <ArrowRight size={24} />
              </button>
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <input
                    className="text-3xl font-bold text-gray-900 bg-emerald-50 border border-emerald-300 rounded-lg px-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full md:w-[400px]"
                    value={test.title}
                    onChange={(e) => {
                        const newTitle = e.target.value;
                        const newTestData = { ...test.testData, title: newTitle };
                        setTest({ ...test, title: newTitle, testData: newTestData });
                        setHasUnsavedChanges(true);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-gray-900">{test.title}</h1>
                    {test.isReviewed && (
                      <div className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-3 py-1 rounded-full font-black shadow-sm">
                        <CheckCircle2 size={14} />
                        جاهز للنشر
                      </div>
                    )}
                  </div>
                )}
              </div>
          </div>
          <div className="flex gap-4">
              {isEditing ? (
                  <>
                      <button
                          onClick={handleSaveChanges}
                          className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
                      >
                          <Save size={20} />
                          حفظ التعديلات
                      </button>
                      <button
                          onClick={() => setIsDesignerModalOpen(true)}
                          className="px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-2 border border-indigo-200"
                      >
                          <Sparkles size={20} />
                          تصميم سؤال جديد
                      </button>
                      <button
                          onClick={handleCancelChanges}
                          className="px-4 py-2 border-2 border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors"
                      >
                          إلغاء التعديل
                      </button>
                  </>
              ) : (
                  <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 border-2 border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                      <Edit size={20} />
                      تعديل الاختبار
                  </button>
              )}
              <button
                  onClick={toggleReviewStatus}
                  className={`px-4 py-2 border-2 font-bold rounded-lg transition-colors flex items-center gap-2 ${
                    test.isReviewed 
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-700' 
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                  title="تحديد الاختبار كجاهز ومراجع"
              >
                  {test.isReviewed ? <Lock size={20} /> : <LockOpen size={20} />}
                  {test.isReviewed ? 'جاهز' : 'غير مراجع'}
              </button>
              <button
                  onClick={() => setShowRecommendationsModal(true)}
                  disabled={reviewing}
                  className={`px-4 py-2 border-2 font-bold rounded-lg transition-colors flex items-center gap-2 ${
                    test.reviewReport 
                      ? 'bg-amber-50 border-amber-600 text-amber-700' 
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-amber-50'
                  }`}
                  title="مراجعة الاختبار بالذكاء الاصطناعي"
              >
                  {reviewing ? <Loader2 size={20} className="animate-spin" /> : <ClipboardCheck size={20} />}
                  {test.reviewReport ? 'تحديث المراجعة' : 'مراجعة الاختبار'}
              </button>
              {test.reviewReport && (
                <button
                    onClick={() => setShowReport(true)}
                    className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition-colors"
                >
                    عرض التقرير
                </button>
              )}
              <button
                  onClick={() => setShowAnswers(!showAnswers)}
                  className="px-4 py-2 border-2 border-indigo-600 text-indigo-700 font-bold rounded-lg hover:bg-indigo-50 transition-colors"
              >
                  {showAnswers ? 'إخفاء سلالم الحل' : 'إظهار سلالم الحل'}
              </button>
              <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                  <Printer size={20} />
                  طباعة A4
              </button>
          </div>
        </div>
      ) : (
        <div className="w-[210mm] max-w-full flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6 no-print bg-white p-5 rounded-2xl shadow-md border border-gray-100" dir="rtl">
            <div className="flex flex-col gap-1">
                <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                    <Printer className="text-indigo-600" size={20} />
                    طباعة الاختبار وتخصيص العلامة المائية
                </h2>
                <span className="text-xs text-gray-500">قم بتخصيص نص العلامة المائية ونوع الخط للطباعة ثم اضغط طباعة</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-3 bg-indigo-50/60 px-4 py-2 rounded-xl border border-indigo-100/80">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-indigo-950 select-none">
                        <input
                            type="checkbox"
                            checked={useWatermark}
                            onChange={(e) => setUseWatermark(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        إضافة علامة مائية
                    </label>
                    {useWatermark && (
                        <>
                            <input
                                type="text"
                                value={watermarkText}
                                onChange={(e) => setWatermarkText(e.target.value)}
                                placeholder="اكتب العلامة المائية..."
                                className="p-1 px-3 text-xs border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white shadow-inner font-bold w-40 animate-fade-in"
                            />
                            <div className="flex items-center gap-1.5 animate-fade-in border-r border-indigo-200/40 pr-2 mr-1">
                                <span className="text-[11px] text-indigo-900 font-bold whitespace-nowrap">التكرار:</span>
                                <select
                                    value={watermarkRepeats}
                                    onChange={(e) => setWatermarkRepeats(Number(e.target.value))}
                                    className="p-1 text-[11px] border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white font-bold cursor-pointer"
                                >
                                    <option value={1}>مرة واحدة (1)</option>
                                    <option value={2}>مرتين (2)</option>
                                    <option value={3}>3 مرات</option>
                                </select>
                            </div>
                        </>
                    )}
                </div>

                {/* Font selection */}
                <div className="flex items-center gap-2.5 bg-indigo-50/60 px-4 py-2 rounded-xl border border-indigo-100/80">
                    <span className="text-xs text-indigo-950 font-black whitespace-nowrap">نوع الخط:</span>
                    <select
                        value={printFont}
                        onChange={(e) => setPrintFont(e.target.value as 'default' | 'cairo' | 'amiri' | 'tajawal' | 'almarai' | 'al-mithaq')}
                        className="p-1 px-1.5 text-xs text-indigo-950 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white font-bold cursor-pointer outline-none transition-all"
                    >
                        <option value="default">الخط الحالي</option>
                        <option value="cairo">خط Cairo العريض والمميز</option>
                        <option value="amiri">خط Amiri الأميري للطباعة الكلاسيكية</option>
                        <option value="tajawal">خط Tajawal الحديث الواضح</option>
                        <option value="almarai">خط Almarai الأنيق والمريح</option>
                        <option value="al-mithaq">خط الميثاق العربي Al-Mithaq</option>
                    </select>
                </div>

                <div className="flex gap-2 shrink-0 mr-auto md:mr-0">
                    <button
                        onClick={() => setPrintPreview(false)}
                        className="px-4 py-2 border border-gray-300 font-bold rounded-xl hover:bg-gray-50 text-xs text-gray-700 transition-all"
                    >
                        إغلاق المعاينة
                    </button>
                    <button
                        onClick={handleNativePrint}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl flex items-center gap-2 text-xs shadow-md transition-all scale-100 active:scale-95"
                    >
                        <Printer size={16} />
                        طباعة الآن
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Print / View Area (A4 style) */}
      <div className={`print-area-container bg-white rounded-xl shadow-sm border border-gray-200 p-8 md:p-12 print:!shadow-none print:!border-none print:!p-0 print:!w-full print:!m-0 print:!overflow-visible text-right font-sans relative overflow-hidden max-w-none break-words print-table-wrapper ${printPreview ? 'w-[210mm] shadow-2xl min-h-[297mm] mx-auto' : 'w-full prose'}`} dir="rtl">
        {/* Dynamic print font style overrides */}
        <style dangerouslySetInnerHTML={{ __html: `
          @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Tajawal:wght@400;500;700;800;900&family=Almarai:wght@300;400;700;800&family=Cairo:wght@400;500;600;700;800;900&display=swap');
          
          @font-face {
            font-family: 'Al-Mithaq';
            src: local('Al-Mithaq'), local('Al Mithaq'), local('Mithaq'), local('Mithaq Regular'), local('Al-Mithaq Regular'), local('Al_Mithaq');
          }

          @media print {
            .print-area-container, .print-area-container *:not(.katex):not(.katex *) {
              font-family: ${
                printFont === 'default' ? "'Cairo', sans-serif" :
                printFont === 'cairo' ? "'Cairo', sans-serif" :
                printFont === 'amiri' ? "'Amiri', serif" :
                printFont === 'tajawal' ? "'Tajawal', sans-serif" :
                printFont === 'almarai' ? "'Almarai', sans-serif" :
                printFont === 'al-mithaq' ? "'Al-Mithaq', 'Cairo', sans-serif" :
                "'Cairo', sans-serif"
              } !important;
            }
          }
          .print-area-container, .print-area-container *:not(.katex):not(.katex *) {
            font-family: ${
              printFont === 'default' ? "'Cairo', sans-serif" :
              printFont === 'cairo' ? "'Cairo', sans-serif" :
              printFont === 'amiri' ? "'Amiri', serif" :
              printFont === 'tajawal' ? "'Tajawal', sans-serif" :
              printFont === 'almarai' ? "'Almarai', sans-serif" :
              printFont === 'al-mithaq' ? "'Al-Mithaq', 'Cairo', sans-serif" :
              "'Cairo', sans-serif"
            } !important;
          }
        `}} />
        {/* Watermark Overlay */}
        {useWatermark && watermarkText && (
          <>
            {/* Screen Preview Watermark */}
            <div className="absolute inset-0 z-[99999] overflow-hidden pointer-events-none select-none opacity-[0.05] flex flex-col justify-around items-center rotate-[-30deg] p-12 no-print" style={{ fontFamily: "'Cairo', sans-serif" }}>
              {Array.from({ length: watermarkRepeats }).map((_, idx) => (
                <div key={idx} className="text-3xl md:text-5xl font-sans font-black text-black select-none whitespace-nowrap">{watermarkText}</div>
              ))}
            </div>
            {/* Print-only CSS injection to ensure it overlays on all printed pages and containers */}
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
                  font-size: 3.5rem !important;
                  white-space: nowrap !important;
                  margin: 20px 0 !important;
                  text-align: center !important;
                  user-select: none !important;
                  font-family: 'Cairo', sans-serif !important;
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
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-4 mb-8 print-table-header w-full">
            {isEditing ? (
                <input 
                    className="text-2xl font-bold mb-2 text-center w-full bg-emerald-50 border border-emerald-300 rounded px-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={test.title}
                    onChange={(e) => {
                        const newTitle = e.target.value;
                        const newTestData = { ...test.testData, title: newTitle };
                        setTest({ ...test, title: newTitle, testData: newTestData });
                        setHasUnsavedChanges(true);
                    }}
                />
            ) : (
                <h1 className="text-2xl font-bold mb-2">{test.title}</h1>
            )}
            <div className="flex flex-wrap justify-between items-center text-xs font-bold mt-2 gap-2 text-gray-700 border-t border-gray-200 pt-2 print:border-black">
                <div className="flex items-center gap-4 flex-wrap">
                    <span>الصف: <strong className="text-black">{test.grade}</strong></span>
                    <span>المادة: <strong className="text-black">{test.subject}</strong></span>
                    {test.part && <span>الجزء: <strong className="text-black">{test.part}</strong></span>}
                    {test.unit && <span>الوحدة: <strong className="text-black">{test.unit}</strong></span>}
                    {test.topic && <span>الموضوع: <strong className="text-black">{test.topic}</strong></span>}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                    {test.seriesName && <span>السلسلة: <strong className="text-indigo-800 print:text-black">{test.seriesName}</strong></span>}
                    {test.teacherName && <span>إعداد المدرّس: <strong className="text-indigo-900 print:text-black">{test.teacherName}</strong></span>}
                    <div>
                       الزمن التقديري: {isEditing ? (
                           <input 
                               type="number"
                               className="w-16 p-1 border border-emerald-300 rounded bg-emerald-50 text-center font-sans h-8 align-middle inline-block"
                               value={data.estimatedTimeMinutes || 0}
                               onChange={(e) => {
                                   const newTestData = { ...test.testData, estimatedTimeMinutes: parseInt(e.target.value) || 0 };
                                   setTest({ ...test, testData: newTestData });
                                   setHasUnsavedChanges(true);
                               }}
                           />
                       ) : (
                           <strong className="text-black">{data.estimatedTimeMinutes || 0}</strong>
                       )} دقيقة
                    </div>
                </div>
            </div>
            {/* Platform name in header for first page print */}
            <div className="hidden print:flex justify-between items-center text-[10px] font-bold mt-3 text-gray-600 border-t border-gray-300 pt-1">
                <span>{test.seriesName || 'سلسلة التعلم الذكي'}</span>
                <span>المدرّس: {test.teacherName || 'حسن راشد العلي'}</span>
                <span>تم إعداد وتنسيق هذا الاختبار عبر منصة التعلّم الذكي</span>
            </div>
        </div>

        {/* Sections */}
        <div className="print-table-body w-full">
            {data.sections?.map((section: any, sIdx: number) => {
                if (!section.questions || section.questions.length === 0) return null;
                return (
                    <div key={sIdx} className="mb-8 print:mb-4">
                        <h2 className="text-xl font-bold bg-gray-100 p-2 rounded mb-4 print:mb-2 print:bg-transparent print:border-b print:border-black">{section.title}</h2>
                    <div className="space-y-6 print:space-y-1">
                        {section.questions.map((q: any, qIdx: number) => (
                            <div key={qIdx} className={`mr-0 group relative border border-transparent hover:border-gray-200 p-2 print:p-1 rounded-lg transition-colors ${showAnswers ? 'print:break-inside-auto' : 'print:break-inside-avoid'}`}>
                                {isEditing && (
                                <div className="absolute top-2 left-2 z-10 print:hidden flex items-start flex-col sm:flex-row-reverse gap-2">
                                    {expandedActions === `${sIdx}-${qIdx}` ? (
                                        <div className="flex flex-wrap bg-white shadow-lg border border-gray-200 rounded-lg p-1 gap-1 items-center justify-end animate-in fade-in zoom-in duration-200">
                                            <button 
                                                onClick={() => setExpandedActions(null)}
                                                className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-full"
                                                title="إغلاق"
                                            >
                                                <X size={16} />
                                            </button>
                                            <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>
                                            <button 
                                                onClick={() => handleAddQuestion(sIdx, qIdx)}
                                                className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md shadow-sm flex items-center justify-center gap-1 font-bold text-xs"
                                                title="إضافة سؤال بعد هذا"
                                            >
                                                <Plus size={14} /> إضافة
                                            </button>
                                            <button 
                                                onClick={() => handleRemoveQuestion(sIdx, qIdx)}
                                                className="px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md shadow-sm flex items-center justify-center gap-1 font-bold text-xs"
                                                title="حذف هذا السؤال"
                                            >
                                                <Trash size={14} /> حذف
                                            </button>
                                            <button 
                                                onClick={() => handleRegenerateQuestion(sIdx, qIdx)}
                                                disabled={generatingForBase === `${sIdx}-${qIdx}`}
                                                className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md shadow-sm flex items-center justify-center gap-1 font-bold text-xs"
                                                title="اقتراح سؤال بديل"
                                            >
                                                {generatingForBase === `${sIdx}-${qIdx}` ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <RefreshCw size={14} />
                                                )}
                                                تبديل
                                            </button>
                                            <button 
                                                onClick={() => handleGenerateSvgTest(sIdx, qIdx)}
                                                disabled={generatingForBase === `svg-${sIdx}-${qIdx}`}
                                                className="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md shadow-sm flex items-center justify-center gap-1 font-bold text-xs"
                                                title="إنشاء أو تحديث رسم توضيحي"
                                            >
                                                {generatingForBase === `svg-${sIdx}-${qIdx}` ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <ImageIcon size={14} />
                                                )}
                                                رسم
                                            </button>
                                            <button 
                                                onClick={() => handleReviewSingleQuestion(sIdx, qIdx)}
                                                disabled={reviewingQuestionKey === `${sIdx}-${qIdx}`}
                                                className="px-2 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md shadow-sm flex items-center justify-center gap-1 font-bold text-xs"
                                                title="مراجعة علمية وحسابية ذكية للسؤال"
                                            >
                                                {reviewingQuestionKey === `${sIdx}-${qIdx}` ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <CheckCircle2 size={14} />
                                                )}
                                                مراجعة
                                            </button>
                                            <button 
                                                onClick={() => handleGenerateSolutionTest(sIdx, qIdx)}
                                                disabled={generatingForBase === `sol-${sIdx}-${qIdx}`}
                                                className="px-2 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-md shadow-sm flex items-center justify-center gap-1 font-bold text-xs"
                                                title="حل تفصيلي مقترح وتصحيح"
                                            >
                                                {generatingForBase === `sol-${sIdx}-${qIdx}` ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Lightbulb size={14} />
                                                )}
                                                حل وتصحيح
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => setExpandedActions(`${sIdx}-${qIdx}`)}
                                            className="p-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-full shadow-sm flex items-center justify-center gap-1 font-bold text-xs transition-colors"
                                            title="أدوات السؤال"
                                        >
                                            <Settings size={16} /> تحرير
                                        </button>
                                    )}
                                </div>
                            )}
                            
                            <div className="flex flex-col print:flex-row md:flex-row gap-4 print:gap-2 w-full items-start">
                                {/* Right side: Question Subject and Sub-questions */}
                                <div className="flex-1 min-w-0 w-full print:flex-1">
                                    {isEditing ? (
                                        <div className="flex flex-col gap-2 mb-2 w-full">
                                            <div className="flex gap-2 font-bold break-inside-avoid w-full">
                                                {getQuestionTitleNode(section.sectionType, qIdx, true)}
                                                <SmartMathEditor 
                                                    className="flex-1"
                                                    value={q.text}
                                                    onChange={(val) => updateQuestionData(sIdx, qIdx, (t) => t.text = val)}
                                                    placeholder="نص السؤال..."
                                                />
                                            </div>
                                            <div className="flex flex-col w-full text-right mt-2">
                                                <label className="text-xs text-gray-500 mb-1 font-bold">كود SVG للرسم (اختياري)</label>
                                                <textarea
                                                    dir="ltr"
                                                    className="w-full p-2 border border-emerald-300 rounded bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[60px] text-left text-xs font-mono whitespace-pre"
                                                    value={q.svgCode || ''}
                                                    onChange={(e) => updateQuestionData(sIdx, qIdx, (t) => t.svgCode = e.target.value)}
                                                    placeholder="<svg>...</svg>"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`flex gap-2 font-bold mb-2 break-inside-avoid ${isEditing && 'opacity-70'}`}>
                                            {getQuestionTitleNode(section.sectionType, qIdx, false)}
                                            <MathRenderer className="flex-1" content={q.text} />
                                        </div>
                                    )}
                                    
                                    {/* MCQ Options */}
                                    {section.sectionType === 'mcq' && q.options && (
                                        <div className="w-full mt-2 mb-3 break-inside-avoid">
                                            <table className="w-full border-collapse border border-gray-300 print:border-black text-center" dir="rtl">
                                                <tbody>
                                                    <tr>
                                                        {Array.from({ length: 4 }).map((_, oIdx) => {
                                                            const label = String.fromCharCode(65 + oIdx);
                                                            const opt = q.options && q.options[oIdx] !== undefined ? q.options[oIdx] : '';
                                                            return (
                                                                <React.Fragment key={oIdx}>
                                                                    <td 
                                                                        className="border border-gray-300 print:border-black p-1.5 print:p-1 font-bold align-middle text-center bg-gray-100 print:bg-gray-100 w-[5%] whitespace-nowrap"
                                                                        style={{ backgroundColor: '#eaeaea' }}
                                                                    >
                                                                        {label}
                                                                    </td>
                                                                    <td className="border border-gray-300 print:border-black p-1.5 print:p-1 align-middle text-center w-[20%]">
                                                                        <div className="flex flex-col items-center justify-center gap-2 min-h-fit overflow-visible">
                                                                            {isEditing ? (
                                                                                <SmartMathEditor 
                                                                                    className="w-full"
                                                                                    value={opt}
                                                                                    onChange={(val) => updateQuestionData(sIdx, qIdx, (t) => {
                                                                                        if (!t.options) t.options = ['', '', '', ''];
                                                                                        t.options[oIdx] = val;
                                                                                    })}
                                                                                    placeholder={`الخيار ${label}...`}
                                                                                />
                                                                            ) : (
                                                                                <MathRenderer className="flex-1 break-words whitespace-normal text-center w-full overflow-visible" content={opt} />
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* SubQuestions */}
                                    {q.subQuestions && (
                                        <div className="flex flex-col gap-2 pr-4 mb-4 font-medium break-inside-avoid w-full">
                                            {q.subQuestions.map((sq: string, sqIdx: number) => {
                                                const cleanSq = sq.replace(/^[\s\d\-\.\)\(]*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])?[\s\d\-\.\)\(]*/, '$1');
                                                return (
                                                <div key={sqIdx} className="w-full flex items-start gap-2">
                                                    {isEditing ? (
                                                        <div className="w-full flex items-start gap-2">
                                                            <SmartMathEditor 
                                                                className="w-full mt-1"
                                                                value={sq}
                                                                onChange={(val) => updateQuestionData(sIdx, qIdx, (t) => t.subQuestions[sqIdx] = val)}
                                                                placeholder={`طلب ${sqIdx + 1}...`}
                                                            />
                                                            <button
                                                                onClick={() => handleRemoveSubQuestion(sIdx, qIdx, sqIdx)}
                                                                className="p-1.5 mt-1 bg-red-50 hover:bg-red-100 text-red-600 rounded"
                                                                title="حذف الطلب"
                                                            >
                                                                <Trash size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-black text-xs font-bold shrink-0 mt-0.5" style={{lineHeight: 1}}>{sqIdx + 1}</span>
                                                            <MathRenderer content={cleanSq} className="flex-1" />
                                                        </>
                                                    )}
                                                </div>
                                            )})}
                                            {isEditing && (
                                                <button
                                                    onClick={() => handleAddSubQuestion(sIdx, qIdx)}
                                                    className="self-start mt-2 px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-md text-sm font-bold flex items-center gap-1"
                                                >
                                                    <Plus size={14} /> إضافة طلب
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Left side: SVG (stays left in RTL print) */}
                                {q.svgCode && (
                                    <div className="w-[190px] md:w-[310px] print:w-[190pt] aspect-square shrink-0 border border-gray-200 rounded-lg p-2 bg-white flex items-center justify-center break-inside-avoid shadow-sm print:border-transparent print:shadow-none not-prose overflow-hidden">
                                        <div className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto [shape-rendering:geometricPrecision]" dangerouslySetInnerHTML={{__html: q.svgCode}} />
                                    </div>
                                )}
                            </div>

                            {/* Solution */}
                            {showAnswers && q.solution && (
                                <div className={`mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900 break-inside-avoid print:break-inside-auto flex flex-col min-h-fit overflow-visible ${!showAnswers ? 'no-print' : 'print:bg-gray-50 print:border-gray-300'}`}>
                                    <div className="font-bold mb-2">الحل: </div>
                                    {section.sectionType === 'mcq' && (
                                        <div className="mb-2 font-bold text-green-700 flex items-center gap-2">
                                            الإجابة الصحيحة: 
                                            {isEditing ? (
                                                <select 
                                                    className="p-1 border border-yellow-400 rounded bg-yellow-100"
                                                    value={q.correctOptionIndex || 0}
                                                    onChange={(e) => updateQuestionData(sIdx, qIdx, (t) => t.correctOptionIndex = parseInt(e.target.value))}
                                                >
                                                    {q.options.map((_: any, idx: number) => (
                                                        <option key={idx} value={idx}>{String.fromCharCode(65 + idx)}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                `(${String.fromCharCode(65 + (q.correctOptionIndex || 0))})`
                                            )}
                                        </div>
                                    )}
                                    {isEditing ? (
                                        <div className="flex flex-col gap-2">
                                            <SmartMathEditor 
                                                value={q.solution}
                                                onChange={(val) => updateQuestionData(sIdx, qIdx, (t) => t.solution = val)}
                                                placeholder="اكتب الحل هنا..."
                                            />
                                            <label className="text-xs text-gray-500 font-bold">كود SVG للحل (اختياري)</label>
                                            <textarea
                                                dir="ltr"
                                                className="w-full p-2 border border-emerald-300 rounded bg-emerald-50 focus:outline-none text-left text-xs font-mono whitespace-pre"
                                                value={q.solutionSvgCode || ''}
                                                onChange={(e) => updateQuestionData(sIdx, qIdx, (t) => t.solutionSvgCode = e.target.value)}
                                                placeholder="<svg>...</svg>"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col print:flex-row md:flex-row gap-4 print:gap-2 w-full items-start">
                                            <div className="flex-1 min-w-0">
                                                <MathRenderer content={q.solution} />
                                            </div>
                                            {q.solutionSvgCode && (
                                                <div className="w-[190px] md:w-[310px] print:w-[190pt] aspect-square shrink-0 border border-gray-200 rounded-lg p-2 bg-white flex items-center justify-center break-inside-avoid shadow-sm print:border-transparent print:shadow-none not-prose overflow-hidden">
                                                    <div className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto [shape-rendering:geometricPrecision]" dangerouslySetInnerHTML={{ __html: q.solutionSvgCode }} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
          );
        })}

        <div className="text-center font-bold text-lg mt-12 py-4 border-t-2 border-dashed border-gray-300 print:border-black break-inside-avoid">
            انتهت الأسئلة
        </div>
        </div>
        
        {/* Print Footer */}
        <div className="hidden print:table-footer-group">
            <div className="print-footer-inner w-full flex justify-center items-center text-[10px] text-gray-400 border-t border-gray-200 pt-2 bg-transparent pb-2 px-8">
                <div>تم إنشاء هذا الاختبار في منصة التعلّم الذكي - جميع الحقوق محفوظة للمدرّس حسن راشد العلي</div>
            </div>
        </div>
      </div>

      <QuestionDesignerModal 
        isOpen={isDesignerModalOpen}
        onClose={() => setIsDesignerModalOpen(false)}
        onAdd={handleAddDesignerQuestion}
        grade={test.grade}
        subject={test.subject}
      />

      {/* Report Modal */}
      {showReport && test.reviewReport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md no-print">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
            <div className="p-8 border-b bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl">
                  <ClipboardCheck size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black">تقرير المراجعة الذكي</h3>
                  <p className="text-amber-100 font-bold opacity-80">{test.title}</p>
                </div>
              </div>
              <button onClick={() => setShowReport(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X size={28} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Markdown Report */}
                <div className="markdown-body prose prose-amber max-w-none prose-p:leading-relaxed prose-li:my-1 text-gray-800">
                  <h4 className="text-xl font-bold mb-4 border-b pb-2 flex items-center gap-2">
                    <ClipboardCheck size={20} className="text-amber-600" />
                    التقرير التفصيلي
                  </h4>
                  <Markdown>{test.reviewReport}</Markdown>
                </div>

                {/* Fixable Issues List */}
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                  <h4 className="text-xl font-bold mb-4 border-b pb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles size={20} className="text-indigo-600" />
                      الأخطاء المكتشفة القابلة للإصلاح
                    </span>
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase">
                      {test.reviewIssues?.length || 0} خطأ
                    </span>
                  </h4>
                  
                  {test.reviewIssues && test.reviewIssues.length > 0 ? (
                    <div className="space-y-4">
                      {test.reviewIssues.map((issue) => (
                        <div 
                          key={issue.id} 
                          className={`p-4 rounded-xl border transition-all cursor-pointer ${
                            selectedIssueIds.includes(issue.id) 
                              ? 'bg-white border-indigo-500 ring-1 ring-indigo-500 shadow-md' 
                              : 'bg-white/50 border-gray-200 opacity-80 hover:opacity-100'
                          }`}
                          onClick={() => {
                            setSelectedIssueIds(prev => 
                              prev.includes(issue.id) 
                                ? prev.filter(id => id !== issue.id) 
                                : [...prev, issue.id]
                            );
                          }}
                        >
                          <div className="flex gap-3">
                            <div className="mt-1">
                              <Checkbox 
                                checked={selectedIssueIds.includes(issue.id)} 
                                onChange={() => {}} // Controlled by parent div click
                                color="indigo"
                              />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  issue.category === 'علمي' ? 'bg-red-100 text-red-700' : 
                                  issue.category === 'تنسيق' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {issue.category}
                                </span>
                              </div>
                              <p className="text-sm font-bold text-gray-900 mb-1">{issue.description}</p>
                              <p className="text-xs text-indigo-600 italic">💡 المقترح: {issue.fixSuggestion}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <CheckCircle2 size={48} className="mx-auto mb-2 opacity-20" />
                      <p>لم يتم العثور على أخطاء هيكلية قابلة للإصلاح التلقائي حالياً.</p>
                    </div>
                  )}

                  {selectedIssueIds.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl"
                    >
                      <button
                        onClick={handleApplyFixes}
                        disabled={fixing}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        {fixing ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                        تطبيق {selectedIssueIds.length} إصلاحات ذكية
                      </button>
                      <p className="text-[10px] text-center text-indigo-400 mt-2">
                        ملاحظة: سيقوم الذكاء الاصطناعي بتعديل بيانات الاختبار بناءً على ما اخترته.
                      </p>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowReport(false)}
                className="px-8 py-3 bg-amber-600 text-white rounded-xl font-black hover:bg-amber-700 transition-all shadow-lg"
              >
                إغلاق التقرير
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Single Question Review Modal */}
      {showQuestionReview && questionReviewResult && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md no-print">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
            <div className="p-6 border-b bg-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white/20 rounded-xl">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-xl font-black">مراجعة علمية للسؤال</h3>
              </div>
              <button onClick={() => setShowQuestionReview(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <div className="mb-6">
                <h4 className="text-sm font-bold text-purple-700 mb-2 border-r-4 border-purple-500 pr-2">التحليل العلمي والحسابي:</h4>
                <div className="bg-purple-50 p-4 rounded-xl text-sm leading-relaxed text-gray-800 markdown-body prose prose-purple max-w-none">
                  <Markdown>{questionReviewResult.analysis}</Markdown>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-700 mb-2 border-r-4 border-gray-400 pr-2">التصحيحات المقترحة (اختر للتطبيق):</h4>
                
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => {
                        const indices = questionReviewResult?.indices;
                        if (indices) handleApplySingleFix(indices.s, indices.q, 'text');
                    }}
                    className="flex flex-col items-start p-4 bg-white border border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-right group"
                  >
                    <span className="text-xs font-bold text-purple-600 mb-1">إصلاح نص السؤال فقط</span>
                    <span className="text-xs text-gray-500 line-clamp-2">تطبيق التعديلات المقترحة على نص السؤال والطلبات والخيارات.</span>
                  </button>

                  <button
                     onClick={() => {
                        const indices = questionReviewResult?.indices;
                        if (indices) handleApplySingleFix(indices.s, indices.q, 'solution');
                    }}
                    className="flex flex-col items-start p-4 bg-white border border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-right group"
                  >
                    <span className="text-xs font-bold text-purple-600 mb-1">إصلاح الحل فقط</span>
                    <span className="text-xs text-gray-500 line-clamp-2">تطبيق التعديلات المقترحة على سلم الحل والخطوات الحسابية.</span>
                  </button>

                  <button
                     onClick={() => {
                        const indices = questionReviewResult?.indices;
                        if (indices) handleApplySingleFix(indices.s, indices.q, 'all');
                    }}
                    className="flex flex-col items-start p-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-right shadow-md"
                  >
                    <span className="text-xs font-bold mb-1">تطبيق جميع الإصلاحات (السؤال + الحل)</span>
                    <span className="text-[10px] opacity-80">سيتم تحديث السؤال وحله بناءً على التحليل العلمي للذكاء الاصطناعي.</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowQuestionReview(false)}
                className="px-6 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg transition-colors"
              >
                إغلاق بدون تعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Review Recommendations and Guidelines Modal */}
      {showRecommendationsModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md no-print">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
            <div className="p-6 border-b bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-white/20 rounded-xl">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black">توصيات ومحددات المراجعة بالذكاء الاصطناعي</h3>
                  <p className="text-xs text-amber-100 font-bold opacity-90">إرشادات توجيهية لفحص جودة وموثوقية الاختبار</p>
                </div>
              </div>
              <button 
                onClick={() => setShowRecommendationsModal(false)} 
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                title="إغلاق التوصيات"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-sm leading-relaxed">
                🚨 <strong>حول المراجعة الذكية للذكاء الاصطناعي:</strong>
                <p className="mt-1 text-xs text-amber-800">
                  يقوم المساعد الذكي بفحص بنية وعلمية ومستوى توازن وصعوبة الاختبار بالكامل قياساً مع المعايير التربوية السورية الحديثة بالإضافة إلى التعليمات والتوصيات التي يمكنك كتابتها يدوياً للذكاء الاصطناعي أدناه.
                </p>
              </div>

              {/* Manual Recommendations Input Section */}
              <div className="p-5 bg-gradient-to-br from-amber-500/5 to-indigo-500/5 border border-dashed border-amber-500/30 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-amber-600 shrink-0" size={18} />
                  <h4 className="text-sm font-black text-gray-800">توصياتك الخاصة وتوجيهاتك لعملية فحص الاختبار يدوياً:</h4>
                </div>
                <textarea
                  id="user-manual-recommendations-textarea"
                  value={userRecommendations}
                  onChange={(e) => setUserRecommendations(e.target.value)}
                  placeholder="مثال: يرجى فحص ترميز الأشعة للتأكد من استخدام $ \vec{u} $، فحص السؤال الأول بأن لا يكون معقداً حسابياً، أو أي توجيه تريد فحص الاختبار عليه..."
                  className="w-full min-h-[100px] max-h-[180px] p-3 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white/80 backdrop-blur-sm shadow-inner resize-y leading-relaxed outline-none"
                />

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-500 font-bold">🎯 توجيهات سريعة مقترحة (اضغط للإضافة):</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "تحقق من ترميز الأشعة الفراغية", text: "تأكد من ملاءمة وصحة ترميز الأشعة وعناصر الهندسة الفراغية طبقاً للمنهج السوري." },
                      { label: "توزيع علامات عادل", text: "قم بفحص توزيع الدرجات والتحقق من أن يكون مجموع العلامات معقولاً وموزعاً بصورة متدرجة وعادلة." },
                      { label: "تبسيط الحسابات والتعقيد", text: "تحقق من سهولة وصحة الأرقام المعطاة وخلو السؤال من تعقيدات حسابية زائدة وغير ضرورية للطالب." },
                      { label: "تكامل نهايات واشتقاق", text: "فحص مدى شمولية أسئلة التحليل ووحدات النهاية، الاشتقاق والتكامل في هذا الاختبار." },
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        id={`preset-recom-btn-${idx}`}
                        type="button"
                        onClick={() => {
                          const separator = userRecommendations ? "، " : "";
                          setUserRecommendations((prev) => prev + separator + preset.text);
                        }}
                        className="px-2.5 py-1 text-[10px] bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-amber-50 hover:border-amber-400 hover:text-amber-900 shadow-sm transition-all font-medium"
                      >
                        + {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-black text-gray-800 border-r-4 border-amber-500 pr-2">معايير فحص وتقييم الاختبار:</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg h-9 w-9 flex items-center justify-center shrink-0">
                      <Settings size={18} />
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-900 text-xs mb-1">دقة ومطابقة الصياغة</h5>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        التحقق من صحة صياغة الجمل الرياضية والتأكد من جودة كتابة الرموز الرياضية وتعبيرات LaTeX.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex gap-3">
                    <div className="p-2 bg-red-50 text-red-700 rounded-lg h-9 w-9 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-900 text-xs mb-1">السلامة الرياضية للحسابات</h5>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        فحص قيم التمرين والمعادلات المعطاة للتأكد من وجود حلول حقيقية ومنطقية وخلوها من التناقض.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex gap-3">
                    <div className="p-2 bg-purple-50 text-purple-700 rounded-lg h-9 w-9 flex items-center justify-center shrink-0">
                      <RefreshCw size={18} />
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-900 text-xs mb-1">تدرج مستويات الصعوبة</h5>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        تقييم مدى تدرج الأسئلة من السهل إلى الصعب وفحص شموليتها لمخرجات التعلم الأساسية المطلوبة.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex gap-3">
                    <div className="p-2 bg-green-50 text-green-700 rounded-lg h-9 w-9 flex items-center justify-center shrink-0">
                      <ClipboardCheck size={18} />
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-900 text-xs mb-1">شمولية ووضوح سلالم الحل</h5>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        التأكد من أن جميع الأسئلة تمتلك خطوات حل نموذجية وتفصيلية يسهل على المدرس والطالب قراءتها.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-start gap-3">
                <Sparkles className="text-indigo-600 mt-0.5 shrink-0 animate-pulse" size={18} />
                <div className="text-xs text-indigo-900 leading-relaxed">
                  <span className="font-bold">ميزة الإصلاح التلقائي الذكي:</span>
                  <p className="mt-1 text-indigo-700 text-[11px]">
                    بعد انتهاء المراجعة، سيوفر لك الذكاء الاصطناعي قائمة مخصصة بالأخطاء والعيوب المكتشفة مع إمكانية تطبيق الإصلاح على نص التمارين أو سلالم الحل فوراً بلمسة واحدة.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t flex items-center justify-between gap-4">
              <button
                onClick={() => setShowRecommendationsModal(false)}
                className="px-6 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors text-xs"
              >
                إلغاء التراجع
              </button>
              
              <button
                onClick={() => {
                  setShowRecommendationsModal(false);
                  handleReviewAI();
                }}
                disabled={reviewing}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl transition-all shadow-md flex items-center gap-2 text-xs"
              >
                {reviewing ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                مراجعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
