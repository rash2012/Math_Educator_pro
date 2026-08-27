import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { UploadZone } from './components/UploadZone';
import { DocumentView } from './components/DocumentView';
import { MergeDialog } from './components/MergeDialog';
import { GraduationCap, Eye, UserCheck, LogOut, ShieldCheck, User } from 'lucide-react';
import { TestGenerator } from './components/TestGenerator';
import { TestsDashboard } from './components/TestsDashboard';
import { QuestionBankDashboard } from './components/QuestionBankDashboard';
import { LessonSummariesDashboard } from './components/LessonSummariesDashboard';
import { ExamSummariesDashboard } from './components/ExamSummariesDashboard';
import { PastPapersDashboard } from './components/PastPapersDashboard';
import { ExercisesAndProblemsDashboard } from './components/ExercisesAndProblemsDashboard';
import { ScrollToTop } from './components/ScrollToTop';
import { AuthModal, type UserSession, type StudentAuthData } from './components/AuthModal';
import { StudentPortal } from './components/StudentPortal';

type ViewState = 'dashboard' | 'upload' | 'view' | 'merge' | 'test-generator' | 'tests-dashboard' | 'question-bank' | 'lesson-summary' | 'exam-summary' | 'past-papers' | 'exercises-problems';

export default function App() {
  const [view, setView] = useState<ViewState>('dashboard');
  const [currentDocId, setCurrentDocId] = useState<number | null>(null);
  const [mergeIds, setMergeIds] = useState<number[]>([]);
  const [uploadInitialRefId, setUploadInitialRefId] = useState<number | undefined>(undefined);

  // Authentication and Role State
  const [userSession, setUserSession] = useState<UserSession>(() => {
    try {
      const saved = localStorage.getItem('math_educator_session');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading session:', e);
    }
    // Default initial session is teacher mode
    return { role: 'teacher' };
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleUploadSuccess = (docId: number) => {
    setCurrentDocId(docId);
    setUploadInitialRefId(undefined);
    setView('view');
  };

  const handleViewDoc = (id: number) => {
    setCurrentDocId(id);
    setView('view');
  };

  const handleExtractExercisesFromRef = (refId: number) => {
    setUploadInitialRefId(refId);
    setView('upload');
  };

  const handleMergeClick = (ids: number[]) => {
    setMergeIds(ids);
    setView('merge');
  };

  const handleMergeSuccess = (newDocId: number) => {
    setCurrentDocId(newDocId);
    setView('view');
  };

  const handleLoginSuccess = (session: UserSession) => {
    setUserSession(session);
    setIsAuthModalOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('math_educator_session');
    setIsAuthModalOpen(true);
  };

  const handleSwitchToStudentPreview = () => {
    const studentPreviewSession: UserSession = {
      role: 'student',
      studentData: {
        name: 'طالب تجريبي (معاينة حية)',
        country: 'سوريا',
        grade: 'الثالث الثانوي العلمي',
        subject: 'الرياضيات'
      },
      isSimulatedStudentMode: true
    };
    setUserSession(studentPreviewSession);
  };

  const handleSwitchBackToTeacher = () => {
    const teacherSession: UserSession = {
      role: 'teacher'
    };
    localStorage.setItem('math_educator_session', JSON.stringify(teacherSession));
    setUserSession(teacherSession);
  };

  // If in Student Role or Simulated Student Preview Mode
  if (userSession.role === 'student' && userSession.studentData) {
    return (
      <>
        <StudentPortal
          studentData={userSession.studentData}
          onLogout={handleLogout}
          onSwitchToTeacher={userSession.isSimulatedStudentMode ? handleSwitchBackToTeacher : undefined}
          isSimulatedMode={userSession.isSimulatedStudentMode}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          initialRole="student"
        />
        <ScrollToTop />
      </>
    );
  }

  // Teacher / Admin Workspace
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white" dir="rtl" lang="ar">
      {/* Unified Navigation Bar */}
      <nav className="bg-white/95 backdrop-blur-md shadow-xs border-b border-slate-200/80 sticky top-0 z-40 no-print transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div 
              className="flex items-center gap-3 cursor-pointer group" 
              onClick={() => setView('dashboard')}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <GraduationCap className="text-white drop-shadow-xs" size={22} />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight tracking-tight flex items-center gap-1.5">
                  Math Educator Pro
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200">الذكي</span>
                </h1>
                <p className="text-[11px] text-slate-500 font-bold tracking-wide">المدرّس حسن راشد العلي</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
              <button 
                onClick={() => setView('dashboard')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'dashboard' ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                المكتبة
              </button>
              <button 
                onClick={() => setView('tests-dashboard')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'tests-dashboard' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                الاختبارات
              </button>
              <button 
                onClick={() => setView('question-bank')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'question-bank' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                بنك الأسئلة
              </button>
              <button 
                onClick={() => setView('lesson-summary')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'lesson-summary' ? 'bg-violet-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                شرح الدروس
              </button>
              <button 
                onClick={() => setView('exercises-problems')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'exercises-problems' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                التمارين والمسائل
              </button>
              <button 
                onClick={() => setView('exam-summary')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'exam-summary' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                ملخصات امتحانية
              </button>
              <button 
                onClick={() => setView('past-papers')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'past-papers' ? 'bg-orange-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                الدورات السابقة
              </button>
              <button 
                onClick={() => setView('test-generator')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer ${
                  view === 'test-generator' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                توليد اختبار
              </button>
              <button 
                onClick={() => setView('upload')}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all shadow-xs active:scale-95 whitespace-nowrap cursor-pointer mr-1"
              >
                رفع جديد
              </button>

              {/* Student View Toggle Button */}
              <button
                onClick={handleSwitchToStudentPreview}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all shadow-xs active:scale-95 whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                title="المعاينة والاستعراض كطالب"
              >
                <Eye size={15} />
                <span>استعراض كطالب</span>
              </button>

              {/* Account / Switch Role Button */}
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="p-2 hover:bg-slate-100 text-slate-600 hover:text-violet-700 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                title="تبديل المستخدم أو تسجيل الدخول"
              >
                <User size={16} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-8">
        {view === 'dashboard' && (
          <Dashboard 
            onUploadClick={() => {
              setUploadInitialRefId(undefined);
              setView('upload');
            }} 
            onViewDoc={handleViewDoc}
            onMergeClick={handleMergeClick}
            onExtractExercisesFromRef={handleExtractExercisesFromRef}
          />
        )}

        {view === 'upload' && (
          <UploadZone 
            onSuccess={handleUploadSuccess} 
            onCancel={() => {
              setUploadInitialRefId(undefined);
              setView('dashboard');
            }} 
            initialType="exercise"
            initialReferenceId={uploadInitialRefId}
          />
        )}

        {view === 'view' && currentDocId && (
          <DocumentView 
            docId={currentDocId} 
            onBack={() => setView('dashboard')} 
          />
        )}

        {view === 'merge' && (
          <MergeDialog 
            docIds={mergeIds} 
            onSuccess={handleMergeSuccess} 
            onCancel={() => setView('dashboard')} 
          />
        )}

        {view === 'test-generator' && (
          <TestGenerator onSuccess={() => setView('tests-dashboard')} />
        )}

        {view === 'tests-dashboard' && (
          <TestsDashboard />
        )}
        
        {view === 'question-bank' && (
          <QuestionBankDashboard />
        )}
        
        {view === 'lesson-summary' && (
          <LessonSummariesDashboard />
        )}
        
        {view === 'exercises-problems' && (
          <ExercisesAndProblemsDashboard onBack={() => setView('dashboard')} />
        )}
        
        {view === 'exam-summary' && (
          <ExamSummariesDashboard />
        )}
        
        {view === 'past-papers' && (
          <PastPapersDashboard />
        )}
      </main>

      {/* Global Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 no-print">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Math Educator Pro - جميع الحقوق محفوظة للمدرّس حسن راشد العلي
          </p>
        </div>
      </footer>

      {/* Dual Role Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialRole={userSession.role}
      />

      {/* Global Floating Scroll To Top Button */}
      <ScrollToTop />
    </div>
  );
}

