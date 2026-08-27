import React, { useState } from 'react';
import { 
  GraduationCap, 
  UserCheck, 
  ShieldCheck, 
  Lock, 
  User, 
  Globe, 
  BookOpen, 
  Layers, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Sparkles
} from 'lucide-react';
import { 
  COUNTRIES, 
  GRADES, 
  SUBJECTS, 
  DEFAULT_COUNTRY, 
  DEFAULT_GRADE, 
  DEFAULT_SUBJECT 
} from '../constants/academicData';

export interface StudentAuthData {
  name: string;
  country: string;
  grade: string;
  subject: string;
}

export interface UserSession {
  role: 'student' | 'teacher';
  studentData?: StudentAuthData;
  isSimulatedStudentMode?: boolean; // When teacher is previewing as student
}

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLoginSuccess: (session: UserSession) => void;
  initialRole?: 'student' | 'teacher';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialRole = 'student'
}) => {
  const [activeTab, setActiveTab] = useState<'student' | 'teacher'>(initialRole);

  // Student Form State
  const [studentName, setStudentName] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [grade, setGrade] = useState(DEFAULT_GRADE);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);

  // Teacher Form State
  const [teacherUsername, setTeacherUsername] = useState('حسن العلي');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherError, setTeacherError] = useState('');

  if (!isOpen) return null;

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = studentName.trim() || 'طالب متميز';
    const session: UserSession = {
      role: 'student',
      studentData: {
        name: cleanName,
        country,
        grade,
        subject
      }
    };
    localStorage.setItem('math_educator_session', JSON.stringify(session));
    onLoginSuccess(session);
  };

  const handleTeacherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTeacherError('');

    // Verification for teacher credentials
    if (teacherUsername.trim() === 'حسن العلي' && teacherPassword === 'zxc0123') {
      const session: UserSession = {
        role: 'teacher'
      };
      localStorage.setItem('math_educator_session', JSON.stringify(session));
      onLoginSuccess(session);
    } else {
      setTeacherError('اسم المستخدم أو كلمة المرور غير صحيحة (اسم المستخدم: حسن العلي / كلمة المرور: zxc0123)');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-scale-up">
        {/* Header with App Logo */}
        <div className="bg-gradient-to-br from-violet-700 via-indigo-700 to-indigo-900 text-white p-6 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-amber-400/20 rounded-full blur-xl pointer-events-none" />
          
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-md mb-3">
            <GraduationCap className="text-amber-300 drop-shadow-md" size={32} />
          </div>
          
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            Math Educator Pro
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 shadow-xs">المنهاج السوري</span>
          </h2>
          <p className="text-xs text-violet-100 font-medium mt-1">
            بوابة التعليم والتدريب التفاعلي الذكي في الرياضيات
          </p>

          {/* Dual-Role Tab Switcher */}
          <div className="mt-5 grid grid-cols-2 p-1 bg-black/20 backdrop-blur-md rounded-2xl border border-white/15">
            <button
              type="button"
              onClick={() => { setActiveTab('student'); setTeacherError(''); }}
              className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'student'
                  ? 'bg-white text-violet-900 shadow-md scale-100'
                  : 'text-violet-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <UserCheck size={16} />
              بوابة الطالب
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('teacher'); setTeacherError(''); }}
              className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'teacher'
                  ? 'bg-white text-indigo-950 shadow-md scale-100'
                  : 'text-violet-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <ShieldCheck size={16} />
              دخول المعلم / الإدارة
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="p-6">
          {activeTab === 'student' ? (
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div className="bg-violet-50/70 border border-violet-100 rounded-2xl p-3.5 flex items-start gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Sparkles size={16} />
                </div>
                <div className="text-xs text-violet-950 leading-relaxed">
                  <span className="font-black block text-violet-900 mb-0.5">أهلاً بك يا بطل الرياضيات!</span>
                  أدخل اسمك وحدد صفك للوصول المباشر إلى مسار دراسة وتدريب الوحدات والخرائط والمعلم السقراطي الذكي.
                </div>
              </div>

              {/* Student Name */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User size={14} className="text-violet-600" />
                  اسم الطالب:
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="اكتب اسمك الثلاثي أو لقبك..."
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Country */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Globe size={14} className="text-violet-600" />
                    الدولة:
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all shadow-2xs"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Grade */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Layers size={14} className="text-violet-600" />
                    الصف الدراسي:
                  </label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all shadow-2xs"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-violet-600" />
                  المادة:
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all shadow-2xs"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full mt-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black py-3 px-4 rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer text-sm sm:text-base"
              >
                <span>دخول إلى بوابة الطالب</span>
                <ArrowLeft size={18} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleTeacherSubmit} className="space-y-4">
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 flex items-start gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-700 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <ShieldCheck size={16} />
                </div>
                <div className="text-xs text-indigo-950 leading-relaxed">
                  <span className="font-black block text-indigo-900 mb-0.5">منطقة الإدارة وإعداد المحتوى</span>
                  تسجيل دخول المعلم يتيح إدارة الكراسات، توليد الاختبارات بالذكاء الاصطناعي، تعديل وتوثيق الدروس، والتنقل بين الواجهتين.
                </div>
              </div>

              {teacherError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold text-rose-700 flex items-center gap-2 animate-shake">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{teacherError}</span>
                </div>
              )}

              {/* Username */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User size={14} className="text-indigo-600" />
                  اسم المستخدم:
                </label>
                <input
                  type="text"
                  value={teacherUsername}
                  onChange={(e) => setTeacherUsername(e.target.value)}
                  placeholder="حسن العلي"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Lock size={14} className="text-indigo-600" />
                  كلمة المرور:
                </label>
                <input
                  type="password"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  كلمة المرور الافتراضية للإدارة: <span className="font-mono font-black text-indigo-700">zxc0123</span>
                </p>
              </div>

              <button
                type="submit"
                className="w-full mt-3 bg-gradient-to-r from-indigo-700 to-indigo-900 hover:from-indigo-800 hover:to-indigo-950 text-white font-black py-3 px-4 rounded-2xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer text-sm sm:text-base"
              >
                <span>دخول لوحة تحكم المعلم</span>
                <ArrowLeft size={18} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
