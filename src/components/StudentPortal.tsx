import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  BookOpen, 
  FileText, 
  CheckCircle2, 
  HelpCircle, 
  Sparkles, 
  Award, 
  Target, 
  Layers, 
  Brain, 
  Zap, 
  Compass, 
  ChevronRight, 
  ChevronLeft, 
  Menu, 
  X, 
  LogOut, 
  User, 
  Eye, 
  RotateCcw,
  Clock,
  ArrowRight,
  TrendingUp,
  Flame,
  ShieldAlert,
  Calendar,
  CheckCircle,
  FileCode2,
  FolderOpen
} from 'lucide-react';
import type { StudentAuthData } from './AuthModal';
import { StudentUnitStudyView } from './StudentUnitStudyView';
import { TestsDashboard } from './TestsDashboard';
import { QuestionBankDashboard } from './QuestionBankDashboard';
import { PastPapersDashboard } from './PastPapersDashboard';
import { ExamSummariesDashboard } from './ExamSummariesDashboard';
import { db, type StudentProgress } from '../db';
import { MathRenderer } from './MathRenderer';

export type StudentPortalSection = 
  | 'study_and_train' 
  | 'tests' 
  | 'question_bank' 
  | 'past_papers' 
  | 'exam_summaries' 
  | 'learning_path';

interface StudentPortalProps {
  studentData: StudentAuthData;
  onLogout: () => void;
  onSwitchToTeacher?: () => void;
  isSimulatedMode?: boolean;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  studentData,
  onLogout,
  onSwitchToTeacher,
  isSimulatedMode = false
}) => {
  const [activeSection, setActiveSection] = useState<StudentPortalSection>('study_and_train');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [totalPoints, setTotalPoints] = useState(0);
  const [completedUnitsCount, setCompletedUnitsCount] = useState(0);

  // Load cumulative student stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        const progresses = await db.studentProgress
          .where({ studentName: studentData.name })
          .toArray();

        const pts = progresses.reduce((sum, p) => sum + (p.trainerPoints || 0), 0);
        setTotalPoints(pts);
        setCompletedUnitsCount(progresses.filter(p => (p.completedSectionIds || []).length > 3).length);
      } catch (err) {
        console.error('Error loading student cumulative stats:', err);
      }
    };

    loadStats();
  }, [studentData.name, activeSection]);

  const navItems: Array<{
    id: StudentPortalSection;
    label: string;
    icon: React.FC<{ size?: number; className?: string }>;
    tag?: string;
    description: string;
    badgeColor?: string;
  }> = [
    {
      id: 'study_and_train',
      label: 'دراسة وتدريب (المسار النشط)',
      icon: BookOpen,
      tag: 'المسار الرئيسي',
      description: 'شروحات الدروس، ميدان تدرّب بالأنماط، والمراجعة الشاملة واختبارات الوحدات',
      badgeColor: 'bg-violet-100 text-violet-800'
    },
    {
      id: 'tests',
      label: 'اختبارات شاملة ومؤتمتة',
      icon: Target,
      tag: 'امتحاني',
      description: 'نماذج امتحانية شاملة وجزئية مع سلالم التصحيح النموذجية',
      badgeColor: 'bg-indigo-100 text-indigo-800'
    },
    {
      id: 'question_bank',
      label: 'بنك الأسئلة والتمارين',
      icon: Layers,
      tag: 'تدريب مكثف',
      description: 'أسئلة مصنفة حسب الوحدات والمستويات المعرفية لتعزيز التمكن',
      badgeColor: 'bg-amber-100 text-amber-800'
    },
    {
      id: 'past_papers',
      label: 'أرشيف الدورات السابقة',
      icon: GraduationCap,
      tag: 'وزاري',
      description: 'أسئلة وحلول الدورات الامتحانية الرسمية لشهادة الثانوية العامة',
      badgeColor: 'bg-emerald-100 text-emerald-800'
    },
    {
      id: 'exam_summaries',
      label: 'ملخصات امتحانية مكثفة',
      icon: Zap,
      tag: 'مراجعة سريعة',
      description: 'ملخصات مركزة للقوانين، الخواص، والمطبات الامتحانية للوحدات',
      badgeColor: 'bg-rose-100 text-rose-800'
    },
    {
      id: 'learning_path',
      label: 'إنشاء مسار تعلم مخصص',
      icon: Compass,
      tag: 'ذكي',
      description: 'تخطيط زمني وتشخيصي ذكي لجدول المذاكرة وفق نقاط القوة والضعف',
      badgeColor: 'bg-teal-100 text-teal-800'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col" dir="rtl" lang="ar">
      {/* Simulation Banner (If Teacher is previewing as Student) */}
      {isSimulatedMode && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-black flex items-center justify-between shadow-xs sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <Eye size={16} />
            <span>أنت الآن في وضع **«استعراض الطالب» (Student View)** - المعاينة الحية لتجربة الطالب الصارمة للقراءة والتدريب.</span>
          </div>
          {onSwitchToTeacher && (
            <button
              onClick={onSwitchToTeacher}
              className="bg-slate-950 hover:bg-slate-900 text-amber-300 px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shadow-xs"
            >
              العودة إلى لوحة تحكم المعلم ➔
            </button>
          )}
        </div>
      )}

      {/* Student Portal Top Bar */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo & Student Welcome */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="تبديل القائمة الجانبية"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white flex items-center justify-center shadow-xs">
                <GraduationCap size={22} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-black text-sm sm:text-base text-slate-900 leading-tight">
                    بوابة الطالب
                  </h1>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200">
                    Math Educator
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-bold truncate max-w-[200px] sm:max-w-xs">
                  {studentData.name} • {studentData.grade}
                </p>
              </div>
            </div>
          </div>

          {/* Center/Right Stats Indicators */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Total Points Pill */}
            <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/10 to-amber-600/15 border border-amber-300/60 px-3 py-1.5 rounded-2xl shadow-2xs">
              <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-xs shadow-xs">
                <Flame size={14} />
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-amber-900 block leading-none">مجموع النقاط</span>
                <span className="text-xs sm:text-sm font-black text-amber-950">{totalPoints} نقطة</span>
              </div>
            </div>

            {/* Logout / Switch */}
            <button
              onClick={onLogout}
              className="p-2 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut size={18} />
            </button>
          </div>

        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6">
        
        {/* Right Collapsible Sidebar */}
        <aside className={`transition-all duration-300 shrink-0 ${
          isSidebarOpen ? 'w-64 sm:w-72 block' : 'hidden lg:block lg:w-20'
        }`}>
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-xs sticky top-20 space-y-4">
            
            {/* Student Profile Card (Full vs Collapsed) */}
            {isSidebarOpen ? (
              <div className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-2xl p-4 shadow-xs relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-base border border-white/20 shadow-xs">
                    {studentData.name.charAt(0) || 'ط'}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-black text-sm text-white truncate leading-tight">
                      {studentData.name}
                    </h3>
                    <p className="text-[11px] text-violet-200 font-medium truncate mt-0.5">
                      {studentData.grade}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between text-[11px] font-bold text-violet-100">
                  <span>المادة: {studentData.subject}</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-md text-[10px]">
                    {studentData.country}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center p-2 text-center">
                <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                  {studentData.name.charAt(0) || 'ط'}
                </div>
              </div>
            )}

            {/* Navigation List */}
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full text-right p-3 rounded-2xl border text-xs sm:text-sm font-black transition-all flex items-center gap-3 cursor-pointer shadow-2xs ${
                      isActive
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm scale-100'
                        : 'bg-white hover:bg-violet-50/60 border-slate-200/80 text-slate-700 hover:text-violet-900'
                    }`}
                    title={!isSidebarOpen ? item.label : undefined}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Icon size={18} />
                    </div>

                    {isSidebarOpen && (
                      <div className="flex-1 overflow-hidden truncate">
                        <span className="block truncate">{item.label}</span>
                        {item.tag && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md inline-block mt-0.5 ${
                            isActive ? 'bg-white/20 text-white' : item.badgeColor
                          }`}>
                            {item.tag}
                          </span>
                        )}
                      </div>
                    )}

                    {isSidebarOpen && isActive && (
                      <ChevronLeft size={16} className="text-white shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>

          </div>
        </aside>

        {/* Main Content View Container */}
        <main className="flex-1 overflow-hidden">
          
          {/* Section 1: Study and Train (Main Active Track) */}
          {activeSection === 'study_and_train' && (
            <StudentUnitStudyView studentData={studentData} />
          )}

          {/* Section 2: Comprehensive Tests */}
          {activeSection === 'tests' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-5 sm:p-6 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Target size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-indigo-950">
                      الاختبارات الشاملة والنماذج التدريبية
                    </h2>
                    <p className="text-xs text-indigo-700 font-bold mt-0.5">
                      اختبر مستواك في نماذج اختبارية شاملة مصممة وفق معايير الامتحان النهائي.
                    </p>
                  </div>
                </div>
              </div>
              <TestsDashboard />
            </div>
          )}

          {/* Section 3: Question Bank */}
          {activeSection === 'question_bank' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 sm:p-6 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                    <Layers size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-amber-950">
                      بنك الأسئلة والتمارين التراكمية
                    </h2>
                    <p className="text-xs text-amber-800 font-bold mt-0.5">
                      تمارين مصنفة مفاهيمياً وحسب مستويات الصعوبة مع حلول نموذجية.
                    </p>
                  </div>
                </div>
              </div>
              <QuestionBankDashboard />
            </div>
          )}

          {/* Section 4: Past Papers Archive */}
          {activeSection === 'past_papers' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 sm:p-6 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <GraduationCap size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-emerald-950">
                      أرشيف الدورات الامتحانية السابقة
                    </h2>
                    <p className="text-xs text-emerald-800 font-bold mt-0.5">
                      نماذج امتحانات الشهادة الثانوية العامة للدورات السابقة مع السلالم الرسمية.
                    </p>
                  </div>
                </div>
              </div>
              <PastPapersDashboard />
            </div>
          )}

          {/* Section 5: Exam Summaries */}
          {activeSection === 'exam_summaries' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 sm:p-6 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-rose-950">
                      الملخصات الامتحانية المكثفة
                    </h2>
                    <p className="text-xs text-rose-800 font-bold mt-0.5">
                      قواعد ذهبية، مبرهنات، وتنبيهات من المطبات الشائعة للمراجعة السريعة.
                    </p>
                  </div>
                </div>
              </div>
              <ExamSummariesDashboard />
            </div>
          )}

          {/* Section 6: Smart Learning Path Generator */}
          {activeSection === 'learning_path' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
                    <Compass size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                      مسار التعلم الذكي المخصص
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 font-bold">
                      خطة مذاكرة مقترحة لـ {studentData.name} ({studentData.grade})
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-violet-50/80 border border-violet-200 rounded-2xl p-4">
                    <span className="text-[11px] font-black text-violet-700 block mb-1">المرحلة الأولى</span>
                    <h4 className="font-black text-slate-900 text-sm mb-1">إتقان البنية والمفاهيم</h4>
                    <p className="text-xs text-slate-600">دراسة المفاهيم النظرية وسؤال المعلم السقراطي الذكي عند الحاجة.</p>
                  </div>
                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4">
                    <span className="text-[11px] font-black text-amber-700 block mb-1">المرحلة الثانية</span>
                    <h4 className="font-black text-slate-900 text-sm mb-1">التدريب بمحطات التفكير</h4>
                    <p className="text-xs text-slate-600">حل تمارين تدرّب بالأنماط دون رؤية الحل المباشر وكسب النقاط.</p>
                  </div>
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4">
                    <span className="text-[11px] font-black text-emerald-700 block mb-1">المرحلة الثالثة</span>
                    <h4 className="font-black text-slate-900 text-sm mb-1">الاختبار والمراجعة الشاملة</h4>
                    <p className="text-xs text-slate-600">اجتياز اختبار الوحدة المؤتمت وتثبيت الأفكار عبر الخريطة الذهنية.</p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={24} className="text-teal-600 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold text-slate-800">
                      أنت جاهز لبدء الخطة فوراً من قسم «دراسة وتدريب (المسار النشط)».
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveSection('study_and_train')}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-all shadow-xs active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    الانتقال لمسار الوحدات ➔
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>

      </div>
    </div>
  );
};
