import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { UploadZone } from './components/UploadZone';
import { DocumentView } from './components/DocumentView';
import { MergeDialog } from './components/MergeDialog';
import { GraduationCap, Eye, LogOut, ShieldCheck, User, Sparkles, Inbox, RefreshCw } from 'lucide-react';
import { TestGenerator } from './components/TestGenerator';
import { TestsDashboard } from './components/TestsDashboard';
import { QuestionBankDashboard } from './components/QuestionBankDashboard';
import { LessonSummariesDashboard } from './components/LessonSummariesDashboard';
import { ExamSummariesDashboard } from './components/ExamSummariesDashboard';
import { PastPapersDashboard } from './components/PastPapersDashboard';
import { ExercisesAndProblemsDashboard } from './components/ExercisesAndProblemsDashboard';
import { AIDraftsReviewScreen } from './components/AIDraftsReviewScreen';
import { ScrollToTop } from './components/ScrollToTop';
import { AuthModal, type UserSession, type StudentAuthData } from './components/AuthModal';
import { StudentPortal } from './components/StudentPortal';
import { LoginModal } from './components/LoginModal';
import { getCurrentSession, subscribeToAuthChanges, logoutAdmin } from './services/authService';

type ViewState = 'dashboard' | 'upload' | 'view' | 'merge' | 'test-generator' | 'tests-dashboard' | 'question-bank' | 'lesson-summary' | 'exam-summary' | 'past-papers' | 'exercises-problems' | 'ai-drafts';

export default function App() {
  const [view, setView] = useState<ViewState>('dashboard');
  const [currentDocId, setCurrentDocId] = useState<number | null>(null);
  const [mergeIds, setMergeIds] = useState<number[]>([]);
  const [uploadInitialRefId, setUploadInitialRefId] = useState<number | undefined>(undefined);

  // Supabase Auth Session State
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // App User Session & Student Mode State
  const [userSession, setUserSession] = useState<UserSession>(() => {
    try {
      const saved = localStorage.getItem('math_educator_session');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading session:', e);
    }
    return { role: 'teacher' };
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Check Supabase Auth Session on mount
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const session = await getCurrentSession();
        if (isMounted) {
          if (session?.user) {
            setIsAdminAuthenticated(true);
            setAdminEmail(session.user.email || 'مسؤول معتمد');
            setIsLoginModalOpen(false);
          } else {
            setIsAdminAuthenticated(false);
            setAdminEmail(null);
            // If in teacher mode and no session, open login modal
            if (userSession.role === 'teacher') {
              setIsLoginModalOpen(true);
            }
          }
        }
      } catch (err) {
        console.error('Error checking auth session:', err);
      } finally {
        if (isMounted) {
          setIsAuthChecking(false);
        }
      }
    }

    initAuth();

    // Subscribe to auth state changes (login, logout, token refresh)
    const subscription = subscribeToAuthChanges((isLoggedIn, session) => {
      if (isMounted) {
        setIsAdminAuthenticated(isLoggedIn);
        setAdminEmail(session?.user?.email || (isLoggedIn ? 'مسؤول معتمد' : null));
        if (!isLoggedIn && userSession.role === 'teacher') {
          setIsLoginModalOpen(true);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe?.();
    };
  }, [userSession.role]);

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

  const handleAdminLoginSuccess = (email: string) => {
    setIsAdminAuthenticated(true);
    setAdminEmail(email);
    setIsLoginModalOpen(false);
    setUserSession({ role: 'teacher' });
    localStorage.setItem('math_educator_session', JSON.stringify({ role: 'teacher' }));
  };

  const handleLogout = async () => {
    try {
      await logoutAdmin();
    } catch (e) {
      console.warn('Error during sign out:', e);
    }
    localStorage.removeItem('math_educator_session');
    setIsAdminAuthenticated(false);
    setAdminEmail(null);
    setIsLoginModalOpen(true);
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
    setIsLoginModalOpen(false);
  };

  const handleSwitchBackToTeacher = () => {
    const teacherSession: UserSession = {
      role: 'teacher'
    };
    localStorage.setItem('math_educator_session', JSON.stringify(teacherSession));
    setUserSession(teacherSession);
    if (!isAdminAuthenticated) {
      setIsLoginModalOpen(true);
    }
  };

  // If in Student Role or Simulated Student Preview Mode
  if (userSession.role === 'student' && userSession.studentData) {
    return (
      <>
        <StudentPortal
          studentData={userSession.studentData}
          onLogout={handleLogout}
          onSwitchToTeacher={handleSwitchBackToTeacher}
          isSimulatedMode={userSession.isSimulatedStudentMode}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          initialRole="student"
        />
        <LoginModal
          isOpen={isLoginModalOpen}
          onLoginSuccess={handleAdminLoginSuccess}
          onSwitchToStudent={handleSwitchToStudentPreview}
          allowClose={true}
          onClose={() => setIsLoginModalOpen(false)}
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
                onClick={() => setView('ai-drafts')}
                className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  view === 'ai-drafts' ? 'bg-violet-600 text-white shadow-xs' : 'text-violet-700 bg-violet-50/70 hover:bg-violet-100/80 border border-violet-200/60'
                }`}
                title="مراجعة واعتماد مسودات الذكاء الاصطناعي القادمة من الأندرويد"
              >
                <Inbox size={15} />
                <span>مسودات AI</span>
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
                <span className="hidden md:inline">استعراض كطالب</span>
              </button>

              {/* Logged in Admin Indicator & Logout Button */}
              {isAdminAuthenticated ? (
                <div className="flex items-center gap-1">
                  <div 
                    className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold"
                    title={`تم تسجيل الدخول كمسؤول: ${adminEmail}`}
                  >
                    <ShieldCheck size={14} className="text-emerald-600" />
                    <span className="max-w-[120px] truncate">{adminEmail?.split('@')[0]}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                    title="تسجيل الخروج من حساب المسؤول"
                  >
                    <LogOut size={15} />
                    <span className="hidden sm:inline">تسجيل الخروج</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-xs"
                  title="تسجيل الدخول كمسؤول"
                >
                  <ShieldCheck size={15} />
                  <span>تسجيل الدخول</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-8">
        {!isAdminAuthenticated && !isAuthChecking ? (
          <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center">
              <ShieldCheck size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-800">تسجيل الدخول مطلوب للوصول للوحة المعلم</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              يرجى تسجيل الدخول بحساب مسؤول (Supabase Auth) للمزامنة وإدارة المنهاج والاختبارات، أو الانتقال لبوابة الطلاب.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-md cursor-pointer transition-all"
              >
                تسجيل الدخول الآن
              </button>
              <button
                onClick={handleSwitchToStudentPreview}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold cursor-pointer transition-all"
              >
                الدخول كطالب (تصفح وتدريب)
              </button>
            </div>
          </div>
        ) : (
          <>
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

            {view === 'ai-drafts' && (
              <AIDraftsReviewScreen />
            )}
          </>
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

      {/* Primary Supabase Auth Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onLoginSuccess={handleAdminLoginSuccess}
        onSwitchToStudent={handleSwitchToStudentPreview}
        allowClose={isAdminAuthenticated}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* Dual Role Auth Modal (for switching to custom student profile) */}
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


