import React, { useState, useEffect } from 'react';
import { 
  db, 
  type Document, 
  type LessonSection, 
  type PracticeExercise, 
  type StudentProgress,
  getStudentProgress,
  addStudentTrainerPoints,
  recordStudentQuizScore
} from '../db';
import { MathRenderer } from './MathRenderer';
import { PatternGuidedTrainer } from './PatternGuidedTrainer';
import { UnitComprehensiveReviewSection } from './UnitComprehensiveReviewSection';
import { UnitQuizSection } from './UnitQuizSection';
import { UnitMindMapSection } from './UnitMindMapSection';
import { SocraticLessonChat } from './SocraticLessonChat';
import { StudentExerciseFamiliesView } from './student/StudentExerciseFamiliesView';
import type { StudentAuthData } from './AuthModal';
import { 
  BookOpen, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Layers, 
  Compass, 
  Target, 
  Brain, 
  Bot, 
  Award, 
  ArrowRight, 
  RotateCcw, 
  Check, 
  Eye, 
  HelpCircle, 
  AlertTriangle, 
  Lightbulb,
  Zap,
  Clock,
  CheckCircle,
  FileText,
  Boxes
} from 'lucide-react';

interface StudentUnitStudyViewProps {
  studentData: StudentAuthData;
  initialDocId?: number;
  onBackToUnits?: () => void;
}

export const StudentUnitStudyView: React.FC<StudentUnitStudyViewProps> = ({
  studentData,
  initialDocId,
  onBackToUnits
}) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(initialDocId || null);
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [sections, setSections] = useState<LessonSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Active view inside the unit: section id OR 'review' | 'quiz' | 'mindmap'
  const [activeTab, setActiveTab] = useState<string | number>('initial');
  const [isSocraticModalOpen, setIsSocraticModalOpen] = useState(false);
  const [activeSocraticSection, setActiveSocraticSection] = useState<LessonSection | null>(null);

  // Student progress state
  const [progress, setProgress] = useState<StudentProgress | null>(null);

  // Load available units matching student grade & subject
  useEffect(() => {
    const loadUnits = async () => {
      setLoading(true);
      try {
        let docs = await db.documents
          .where('type')
          .equals('lesson_summary')
          .toArray();

        // Filter by grade and subject if available
        if (studentData.grade) {
          const filtered = docs.filter(d => 
            (!d.grade || d.grade === studentData.grade) &&
            (!d.subject || d.subject === studentData.subject)
          );
          if (filtered.length > 0) {
            docs = filtered;
          }
        }

        setDocuments(docs);

        // Auto select first document if none selected
        if (!selectedDocId && docs.length > 0) {
          setSelectedDocId(docs[0].id!);
        }
      } catch (err) {
        console.error('Error loading documents for student study view:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUnits();
  }, [studentData.grade, studentData.subject]);

  // Load selected unit data and student progress
  useEffect(() => {
    if (!selectedDocId) {
      setCurrentDoc(null);
      setSections([]);
      return;
    }

    const loadUnitDetails = async () => {
      setLoading(true);
      try {
        const doc = await db.documents.get(selectedDocId);
        if (doc) {
          setCurrentDoc(doc);
          const s = await db.lessonSections.where({ docId: selectedDocId }).sortBy('order');
          setSections(s);

          // Set active tab to first section if on initial
          if (s.length > 0) {
            setActiveTab(s[0].id!);
          } else {
            setActiveTab('review');
          }

          // Fetch student progress
          const prog = await getStudentProgress(
            studentData.name,
            studentData.grade,
            studentData.subject,
            doc.unit || doc.title
          );
          setProgress(prog);
        }
      } catch (err) {
        console.error('Error loading unit details:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUnitDetails();
  }, [selectedDocId, studentData]);

  const handleMarkSectionComplete = async (sectionId: number) => {
    if (!currentDoc) return;
    try {
      await addStudentTrainerPoints(
        studentData.name,
        studentData.grade,
        studentData.subject,
        currentDoc.unit || currentDoc.title,
        15, // 15 bonus points for completing a theoretical lesson
        sectionId
      );

      const updated = await getStudentProgress(
        studentData.name,
        studentData.grade,
        studentData.subject,
        currentDoc.unit || currentDoc.title
      );
      setProgress(updated);
    } catch (err) {
      console.error('Error marking section complete:', err);
    }
  };

  const handleUpdateExerciseFromTrainer = async (updatedEx: PracticeExercise, sectionId: number) => {
    if (!currentDoc) return;

    // Update in database section
    const targetSection = sections.find(s => s.id === sectionId);
    if (targetSection) {
      const updatedList = (targetSection.practiceExercises || []).map(ex => 
        ex.id === updatedEx.id ? updatedEx : ex
      );
      await db.lessonSections.update(sectionId, { practiceExercises: updatedList });

      // Award points to student if completed attempt
      if (updatedEx.lastAttempt?.total_points_awarded) {
        await addStudentTrainerPoints(
          studentData.name,
          studentData.grade,
          studentData.subject,
          currentDoc.unit || currentDoc.title,
          updatedEx.lastAttempt.total_points_awarded,
          sectionId
        );
        const updatedProg = await getStudentProgress(
          studentData.name,
          studentData.grade,
          studentData.subject,
          currentDoc.unit || currentDoc.title
        );
        setProgress(updatedProg);
      }
    }
  };

  // If no unit selected or viewing unit selector
  if (!selectedDocId || !currentDoc) {
    return (
      <div className="space-y-6 animate-fade-in" dir="rtl">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white flex items-center justify-center shadow-sm">
              <BookOpen size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                الوحدات الدراسية والمسارات التعليمية
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-bold">
                {studentData.grade} | {studentData.subject}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id!)}
                className="group bg-white hover:bg-violet-50/40 border border-slate-200 hover:border-violet-400 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-violet-100 text-violet-800 border border-violet-200">
                      {doc.part || 'الجزء الأول'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {new Date(doc.createdAt).toLocaleDateString('ar-SY')}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-slate-900 group-hover:text-violet-700 transition-colors mb-2">
                    {doc.unit || doc.title}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-2 font-medium">
                    {doc.topic || 'مسار شامل يحتوي الشروحات النظرية وتدرب والمراجعة واختبار الوحدة والخريطة الذهنية.'}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-violet-600 group-hover:translate-x-[-4px] transition-transform">
                  <span>انقر لبدء دراسة الوحدة</span>
                  <ChevronLeft size={16} />
                </div>
              </div>
            ))}
          </div>

          {documents.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-400 text-sm font-bold">
              لا توجد وحدات دراسية مضافة حالياً لهذا الصف والمادة.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active section finding
  const currentSection = typeof activeTab === 'number' ? sections.find(s => s.id === activeTab) : null;
  const currentSectionIndex = currentSection ? sections.findIndex(s => s.id === currentSection.id) : -1;
  const isCurrentSectionCompleted = currentSection ? (progress?.completedSectionIds || []).includes(currentSection.id!) : false;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Top Banner with Unit Info and Points */}
      <div className="bg-gradient-to-r from-violet-700 via-indigo-700 to-indigo-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-800/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setSelectedDocId(null)}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all cursor-pointer shrink-0"
              title="العودة إلى قائمة الوحدات"
            >
              <ArrowRight size={20} />
            </button>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-white/15 text-violet-100 text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full border border-white/20">
                  {currentDoc.part || 'الجزء الأول'}
                </span>
                <span className="text-violet-200 text-xs font-bold">
                  {studentData.grade}
                </span>
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-white mt-1">
                {currentDoc.unit || currentDoc.title}
              </h2>
            </div>
          </div>

          {/* Student Points Badge */}
          <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto bg-black/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/15">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-xs">
              <Award size={22} />
            </div>
            <div>
              <span className="text-[10px] text-amber-200 font-bold block">مجموع نقاطك في الوحدة</span>
              <span className="text-lg font-black text-white leading-tight">
                {progress?.trainerPoints || 0} <span className="text-xs font-medium text-amber-300">نقطة</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Study Grid: Sub-navigation on Right, Content on Left */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Right Sub-navigation Menu (Tree of Lessons) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs sticky top-20">
            <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
              <Layers size={16} className="text-violet-600" />
              عناصر ومسار الوحدة ({sections.length + 4})
            </h3>

            <div className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 hide-scrollbar">
              {/* Ordered Sections */}
              {sections.map((sec, idx) => {
                const isActive = activeTab === sec.id;
                const isCompleted = (progress?.completedSectionIds || []).includes(sec.id!);
                const isPractice = sec.isPracticeOnly;

                return (
                  <button
                    key={sec.id || idx}
                    onClick={() => setActiveTab(sec.id!)}
                    className={`w-full text-right p-3 rounded-xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${
                      isActive
                        ? 'bg-violet-600 text-white border-violet-600 shadow-xs scale-100'
                        : isCompleted
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 hover:bg-emerald-100/70'
                        : 'bg-slate-50/80 border-slate-200/80 text-slate-700 hover:bg-violet-50/50 hover:text-violet-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                        isActive 
                          ? 'bg-white/20 text-white' 
                          : isPractice 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-violet-100 text-violet-800'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <span className="block truncate font-black">
                          {isPractice ? '✍️ تدرّب - ' : '📘 '}{sec.title}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 size={16} className={isActive ? 'text-white' : 'text-emerald-600'} />
                      ) : (
                        <ChevronLeft size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Comprehensive Review Tab */}
              <button
                onClick={() => setActiveTab('review')}
                className={`w-full text-right p-3 rounded-xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${
                  activeTab === 'review'
                    ? 'bg-violet-700 text-white border-violet-700 shadow-xs'
                    : 'bg-purple-50/60 border-purple-200 text-purple-950 hover:bg-purple-100/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-purple-200/70 text-purple-900 text-xs font-black flex items-center justify-center shrink-0">
                    📑
                  </span>
                  <span className="font-black">مراجعة الوحدة الشاملة</span>
                </div>
                <ChevronLeft size={16} className={activeTab === 'review' ? 'text-white' : 'text-purple-400'} />
              </button>

              {/* Unit Quiz Tab */}
              <button
                onClick={() => setActiveTab('quiz')}
                className={`w-full text-right p-3 rounded-xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${
                  activeTab === 'quiz'
                    ? 'bg-indigo-700 text-white border-indigo-700 shadow-xs'
                    : 'bg-indigo-50/60 border-indigo-200 text-indigo-950 hover:bg-indigo-100/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-indigo-200/70 text-indigo-900 text-xs font-black flex items-center justify-center shrink-0">
                    🎯
                  </span>
                  <span className="font-black">اختبار الوحدة المؤتمت (MCQ)</span>
                </div>
                <ChevronLeft size={16} className={activeTab === 'quiz' ? 'text-white' : 'text-indigo-400'} />
              </button>

              {/* Mind Map Tab */}
              <button
                onClick={() => setActiveTab('mindmap')}
                className={`w-full text-right p-3 rounded-xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${
                  activeTab === 'mindmap'
                    ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                    : 'bg-teal-50/60 border-teal-200 text-teal-950 hover:bg-teal-100/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-teal-200/70 text-teal-900 text-xs font-black flex items-center justify-center shrink-0">
                    🗺️
                  </span>
                  <span className="font-black">الخريطة الذهنية التفاعلية</span>
                </div>
                <ChevronLeft size={16} className={activeTab === 'mindmap' ? 'text-white' : 'text-teal-400'} />
              </button>

              {/* Unit Exercises and Problems (Exercise Families) Tab */}
              <button
                onClick={() => setActiveTab('exercises_and_problems')}
                className={`w-full text-right p-3 rounded-xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs ${
                  activeTab === 'exercises_and_problems'
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50/70 border-amber-200 text-amber-950 hover:bg-amber-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-amber-200/80 text-amber-950 text-xs font-black flex items-center justify-center shrink-0">
                    🔀
                  </span>
                  <div>
                    <span className="font-black block">تمرينات ومسائل الوحدة</span>
                    <span className={`text-[10px] block ${activeTab === 'exercises_and_problems' ? 'text-amber-100' : 'text-amber-700'}`}>
                      عائلات التمارين والمحطات الأربع
                    </span>
                  </div>
                </div>
                <ChevronLeft size={16} className={activeTab === 'exercises_and_problems' ? 'text-white' : 'text-amber-500'} />
              </button>
            </div>
          </div>
        </div>

        {/* Left Content Stage */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* VIEW: Theoretical Lesson Section */}
          {currentSection && !currentSection.isPracticeOnly && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
                {/* Lesson Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800">
                        الدرس النظري {currentSectionIndex + 1}
                      </span>
                      {isCurrentSectionCompleted && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          مكتمل
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                      {currentSection.title}
                    </h3>
                  </div>

                  <button
                    onClick={() => handleMarkSectionComplete(currentSection.id!)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                      isCurrentSectionCompleted
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200'
                    }`}
                  >
                    <CheckCircle size={15} />
                    <span>{isCurrentSectionCompleted ? 'أتقنت الدرس ✓' : 'تمت دراسة الدرس'}</span>
                  </button>
                </div>

                {/* Content Render via MathRenderer */}
                <div className="text-slate-800 leading-relaxed text-sm sm:text-base space-y-4">
                  <MathRenderer content={currentSection.content} />
                </div>

                {/* Guidance & Traps */}
                {(currentSection.guidance || currentSection.traps || currentSection.notes) && (
                  <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
                    {currentSection.traps && (
                      <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 text-amber-950 text-xs sm:text-sm leading-relaxed">
                        <div className="flex items-center gap-2 font-black text-amber-900 mb-1.5">
                          <AlertTriangle size={18} className="text-amber-600" />
                          المطبات والأفخاخ الامتحانية:
                        </div>
                        <MathRenderer content={currentSection.traps} />
                      </div>
                    )}

                    {currentSection.guidance && (
                      <div className="bg-violet-50/80 border border-violet-200/90 rounded-2xl p-4 text-violet-950 text-xs sm:text-sm leading-relaxed">
                        <div className="flex items-center gap-2 font-black text-violet-900 mb-1.5">
                          <Lightbulb size={18} className="text-violet-600" />
                          إرشادات المعلم لحل التمارين:
                        </div>
                        <MathRenderer content={currentSection.guidance} />
                      </div>
                    )}
                  </div>
                )}

                {/* Socratic Tutor Launch Callout */}
                <div className="mt-8 bg-gradient-to-r from-violet-600 to-indigo-700 text-white rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
                      <Bot className="text-amber-300" size={24} />
                    </div>
                    <div>
                      <h4 className="font-black text-sm sm:text-base">
                        هل لديك استفسار أو ترغب في اختبار فهمك؟
                      </h4>
                      <p className="text-xs text-violet-100 mt-0.5">
                        اسأل المعلم السقراطي الذكي ليقودك بحوار تفاعلي مؤتمت بالخيارات.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveSocraticSection(currentSection);
                      setIsSocraticModalOpen(true);
                    }}
                    className="bg-white hover:bg-violet-50 text-violet-900 font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    <Sparkles size={16} className="text-amber-500" />
                    <span>اسأل المعلم السقراطي</span>
                  </button>
                </div>
              </div>

              {/* Embedded Socratic Chat below lesson */}
              <SocraticLessonChat
                context={{
                  sectionTitle: currentSection.title,
                  sectionContent: currentSection.content,
                  unitTitle: currentDoc.unit || currentDoc.title,
                  grade: studentData.grade,
                  subject: studentData.subject,
                  guidance: currentSection.guidance,
                  traps: currentSection.traps,
                  notes: currentSection.notes
                }}
                onMasteryAchieved={() => handleMarkSectionComplete(currentSection.id!)}
              />
            </div>
          )}

          {/* VIEW: Practice Exercise Section (Pattern Guided Trainer) */}
          {currentSection && currentSection.isPracticeOnly && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50 border border-amber-200/80 rounded-2xl p-4 text-amber-950 text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
                    <Target size={18} />
                  </div>
                  <div>
                    <span className="text-amber-900 font-black block">
                      ميدان تدرب التفاعلي بالأنماط ({currentSection.title})
                    </span>
                    <span className="text-[11px] text-amber-800 font-medium">
                      حلول موجهة بمحطات التفكير وسلالم التلميحات المزدوجة وفق المنهاج السوري
                    </span>
                  </div>
                </div>
                <span className="bg-amber-600 text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-xs">
                  وضع الطالب
                </span>
              </div>

              {/* Section Content / Instructions if present */}
              {currentSection.content && currentSection.content.trim() && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-violet-800 font-black text-sm">
                    <BookOpen size={16} className="text-violet-600" />
                    <span>مقدمة وسياق درس التدرّب:</span>
                  </div>
                  <div className="text-sm sm:text-base leading-relaxed text-slate-800">
                    <MathRenderer content={currentSection.content} />
                  </div>
                  {currentSection.svgCode && (
                    <div
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-center"
                      dangerouslySetInnerHTML={{ __html: currentSection.svgCode }}
                    />
                  )}
                </div>
              )}

              {/* Exercises List (practiceExercises or practicalExercises) */}
              {(() => {
                const allExercises = [
                  ...(currentSection.practiceExercises || []),
                  ...(currentSection.practicalExercises || [])
                ];

                if (allExercises.length > 0) {
                  return (
                    <div className="space-y-6">
                      {allExercises.map((ex, exIdx) => (
                        <div key={ex.id || exIdx} className="space-y-2">
                          <PatternGuidedTrainer
                            exercise={ex}
                            sectionId={currentSection.id!}
                            lessonTitle={currentSection.title}
                            unitTitle={currentDoc.unit || currentDoc.title}
                            grade={studentData.grade}
                            subject={studentData.subject}
                            isAdmin={false} // Strict Read-Only / Student Mode
                            onUpdateExercise={(updated) => handleUpdateExerciseFromTrainer(updated, currentSection.id!)}
                          />
                        </div>
                      ))}
                    </div>
                  );
                }

                // If no structured exercises array, but section has content
                if (currentSection.content && currentSection.content.trim()) {
                  return null;
                }

                return (
                  <div className="bg-white rounded-3xl p-8 text-center text-slate-500 font-bold border border-slate-200">
                    لا توجد تمارين تدرب مضافة في هذه الفقرة بعد.
                  </div>
                );
              })()}
            </div>
          )}

          {/* VIEW: Unit Comprehensive Review */}
          {activeTab === 'review' && (
            <div className="animate-fade-in">
              <UnitComprehensiveReviewSection
                document={currentDoc}
                sections={sections}
                isAdmin={false} // Student Mode
              />
            </div>
          )}

          {/* VIEW: Unit Quiz */}
          {activeTab === 'quiz' && (
            <div className="animate-fade-in">
              <UnitQuizSection
                document={currentDoc}
                sections={sections}
                isAdmin={false} // Student Mode
              />
            </div>
          )}

          {/* VIEW: Unit Mind Map */}
          {activeTab === 'mindmap' && (
            <div className="animate-fade-in">
              <UnitMindMapSection
                document={currentDoc}
                sections={sections}
                isAdmin={false} // Student Mode
              />
            </div>
          )}

          {/* VIEW: Unit Exercises & Problems (Exercise Families & 4-Station Flow) */}
          {activeTab === 'exercises_and_problems' && (
            <div className="animate-fade-in">
              <StudentExerciseFamiliesView
                document={currentDoc}
                sections={sections}
                studentData={studentData}
                onAwardPoints={async (pts, reason) => {
                  try {
                    const currentProgress = await db.studentProgress
                      .where({
                        studentName: studentData.name,
                        grade: studentData.grade,
                        subject: studentData.subject,
                        unit: currentDoc.unit || currentDoc.title
                      })
                      .first();
                    if (currentProgress) {
                      setProgress(currentProgress);
                    }
                  } catch (e) {
                    console.error('Error refreshing student progress on award points:', e);
                  }
                }}
              />
            </div>
          )}

        </div>
      </div>

      {/* Socratic Tutor Floating Modal (if triggered) */}
      {isSocraticModalOpen && activeSocraticSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between p-4 bg-violet-700 text-white">
              <div className="flex items-center gap-2">
                <Bot className="text-amber-300" size={20} />
                <h3 className="font-black text-sm">المعلم السقراطي: {activeSocraticSection.title}</h3>
              </div>
              <button
                onClick={() => setIsSocraticModalOpen(false)}
                className="p-1 hover:bg-white/20 rounded-lg text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <SocraticLessonChat
                context={{
                  sectionTitle: activeSocraticSection.title,
                  sectionContent: activeSocraticSection.content,
                  unitTitle: currentDoc.unit || currentDoc.title,
                  grade: studentData.grade,
                  subject: studentData.subject,
                  guidance: activeSocraticSection.guidance,
                  traps: activeSocraticSection.traps,
                  notes: activeSocraticSection.notes
                }}
                onMasteryAchieved={() => handleMarkSectionComplete(activeSocraticSection.id!)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
