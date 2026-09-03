import React, { useState, useEffect } from 'react';
import {
  Inbox,
  CheckCircle,
  Edit3,
  Trash2,
  RefreshCw,
  Sparkles,
  Bot,
  AlertCircle,
  Settings,
  Search,
  Filter,
  Eye,
  Check,
  X,
  FileText,
  BookOpen,
  HelpCircle,
  Layers,
  ChevronDown
} from 'lucide-react';
import { getSupabaseClient, getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
import { MathRenderer } from './MathRenderer';

export interface AIDraftItem {
  id: string;
  draft_type: string; // 'lesson_section' | 'exercise' | 'question_bank_item' | 'unit_quiz' | 'exam_summary' | 'mind_map' | string
  document_id?: string;
  unit_title?: string;
  context?: any;
  generated_content: any; // JSON object or string
  source_device?: string;
  is_reviewed: boolean;
  reviewed_at?: string;
  incorporated_into_table?: string;
  incorporated_into_id?: string;
  created_at: string;
}

export const AIDraftsReviewScreen: React.FC = () => {
  const [drafts, setDrafts] = useState<AIDraftItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter and search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Edit Modal State
  const [editingDraft, setEditingDraft] = useState<AIDraftItem | null>(null);
  const [editedContentText, setEditedContentText] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Supabase Connection Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  useEffect(() => {
    const config = getSupabaseConfig();
    setSupabaseUrl(config.url);
    setSupabaseKey(config.anonKey);
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage('يرجى إعداد بيانات الاتصال بقاعدة Supabase (URL و Anon Key) أولاً من أيقونة الإعدادات ⚙️');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('NewAIGeneratedDrafts')
        .select('*')
        .eq('is_reviewed', false)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setDrafts(data || []);
    } catch (err: any) {
      console.error('Error fetching AI drafts:', err);
      setErrorMessage(err.message || 'فشل جلب مسودات الذكاء الاصطناعي من Supabase');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = () => {
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    setIsSettingsOpen(false);
    setSuccessMessage('تم حفظ إعدادات الاتصال بـ Supabase بنجاح');
    loadDrafts();
  };

  // 1. Action: Reject draft
  const handleReject = async (draftId: string) => {
    if (!confirm('هل أنت متأكد من رفض هذه المسودة؟ لن تُضاف لأي جدول.')) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsProcessingAction(true);
    try {
      const { error } = await supabase
        .from('NewAIGeneratedDrafts')
        .update({
          is_reviewed: true,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', draftId);

      if (error) throw error;

      setDrafts(prev => prev.filter(d => d.id !== draftId));
      setSuccessMessage('تم رفض المسودة وتحديث حالتها بنجاح');
    } catch (err: any) {
      setErrorMessage(`فشل رفض المسودة: ${err.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Helper to insert into the target table
  const insertIntoTargetTable = async (draftType: string, content: any, unitTitle?: string): Promise<{ targetTable: string; targetId: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('عميل Supabase غير مهيأ');

    let parsed = typeof content === 'string' ? null : content;
    if (!parsed) {
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { text: content };
      }
    }

    if (draftType.includes('section') || draftType === 'lesson') {
      const payload: any = {
        title: parsed.title || 'فقرة مراجعة معتمدة',
        content: parsed.content || parsed.text || JSON.stringify(parsed),
        svg_code: parsed.svgCode || parsed.svg_code || null,
        guidance: parsed.guidance || null,
        notes: parsed.notes || null,
        traps: parsed.traps || null,
        exam_guidance: parsed.examGuidance || parsed.exam_guidance || null,
        example_text: parsed.exampleText || parsed.example_text || null,
        solution_text: parsed.solutionText || parsed.solution_text || null,
        is_published: true,
      };

      const { data, error } = await supabase
        .from('NewLessonSections')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return { targetTable: 'NewLessonSections', targetId: data.id };
    }

    if (draftType.includes('exercise')) {
      const payload: any = {
        title: parsed.title || 'تمرين معتمد',
        question_text: parsed.questionText || parsed.question_text || parsed.text || '',
        solution_text: parsed.solutionText || parsed.solution_text || '',
        strategy_text: parsed.strategyText || parsed.strategy_text || null,
        svg_code: parsed.svgCode || parsed.svg_code || null,
        kind: 'practice',
        pattern_type: parsed.patternType || parsed.pattern_type || null,
        is_published: true,
      };

      const { data, error } = await supabase
        .from('NewLessonSectionExercises')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return { targetTable: 'NewLessonSectionExercises', targetId: data.id };
    }

    if (draftType.includes('quiz')) {
      const payload: any = {
        title: parsed.title || `اختبار ${unitTitle || 'الوحدة'}`,
        unit: unitTitle || parsed.unit || 'عام',
        grade: parsed.grade || 'الثالث الثانوي العلمي',
        subject: parsed.subject || 'الرياضيات',
        total_questions: Array.isArray(parsed.questions) ? parsed.questions.length : 1,
        questions: parsed.questions || [parsed],
        is_published: true,
      };

      const { data, error } = await supabase
        .from('NewUnitQuizzes')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return { targetTable: 'NewUnitQuizzes', targetId: data.id };
    }

    if (draftType.includes('bank') || draftType.includes('question')) {
      const payload: any = {
        title: parsed.title || `بنك أسئلة - ${unitTitle || 'عام'}`,
        grade: parsed.grade || 'الثالث الثانوي العلمي',
        subject: parsed.subject || 'الرياضيات',
        part: parsed.part || 'الجزء الأول',
        unit: unitTitle || parsed.unit || 'الوحدة',
        items: Array.isArray(parsed.items) ? parsed.items : [parsed],
        is_published: true,
      };

      const { data, error } = await supabase
        .from('NewQuestionBanks')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return { targetTable: 'NewQuestionBanks', targetId: data.id };
    }

    // Default Fallback to NewExamSummaries
    const payload: any = {
      title: parsed.title || `ملخص ${unitTitle || 'الوحدة'}`,
      grade: 'الثالث الثانوي العلمي',
      subject: 'الرياضيات',
      unit: unitTitle || 'عام',
      summary_text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
      is_published: true,
    };

    const { data, error } = await supabase
      .from('NewExamSummaries')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return { targetTable: 'NewExamSummaries', targetId: data.id };
  };

  // 2. Action: Approve As Is
  const handleApproveAsIs = async (draft: AIDraftItem) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsProcessingAction(true);
    setErrorMessage(null);

    try {
      const { targetTable, targetId } = await insertIntoTargetTable(
        draft.draft_type,
        draft.generated_content,
        draft.unit_title
      );

      // Update the draft row in NewAIGeneratedDrafts
      const { error } = await supabase
        .from('NewAIGeneratedDrafts')
        .update({
          is_reviewed: true,
          reviewed_at: new Date().toISOString(),
          incorporated_into_table: targetTable,
          incorporated_into_id: targetId,
        })
        .eq('id', draft.id);

      if (error) throw error;

      setDrafts(prev => prev.filter(d => d.id !== draft.id));
      setSuccessMessage(`تم اعتماد المسودة ونشرها بنجاح إلى جدول "${targetTable}"! 🎉`);
    } catch (err: any) {
      console.error('Error approving draft:', err);
      setErrorMessage(`فشل اعتماد المسودة: ${err.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 3. Action: Open Edit Modal
  const handleOpenEdit = (draft: AIDraftItem) => {
    setEditingDraft(draft);
    if (typeof draft.generated_content === 'string') {
      setEditedContentText(draft.generated_content);
    } else {
      setEditedContentText(JSON.stringify(draft.generated_content, null, 2));
    }
  };

  // Submit Edited Approval
  const handleSaveAndApproveEdited = async () => {
    if (!editingDraft) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsProcessingAction(true);
    setErrorMessage(null);

    try {
      let finalContent: any;
      try {
        finalContent = JSON.parse(editedContentText);
      } catch {
        finalContent = editedContentText;
      }

      const { targetTable, targetId } = await insertIntoTargetTable(
        editingDraft.draft_type,
        finalContent,
        editingDraft.unit_title
      );

      const { error } = await supabase
        .from('NewAIGeneratedDrafts')
        .update({
          is_reviewed: true,
          reviewed_at: new Date().toISOString(),
          incorporated_into_table: targetTable,
          incorporated_into_id: targetId,
          generated_content: finalContent,
        })
        .eq('id', editingDraft.id);

      if (error) throw error;

      setDrafts(prev => prev.filter(d => d.id !== editingDraft.id));
      setEditingDraft(null);
      setSuccessMessage(`تم حفظ التعديلات واعتماد المسودة بنجاح إلى جدول "${targetTable}"! ✨`);
    } catch (err: any) {
      setErrorMessage(`فشل حفظ واعتماد المسودة المعدلة: ${err.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Filtered Drafts
  const filteredDrafts = drafts.filter(draft => {
    const matchesType = typeFilter === 'all' || draft.draft_type === typeFilter;
    const contentStr = typeof draft.generated_content === 'string'
      ? draft.generated_content
      : JSON.stringify(draft.generated_content);
    const matchesSearch = searchQuery === '' ||
      (draft.unit_title && draft.unit_title.includes(searchQuery)) ||
      (draft.draft_type && draft.draft_type.includes(searchQuery)) ||
      contentStr.includes(searchQuery);

    return matchesType && matchesSearch;
  });

  const formatDraftTypeLabel = (type: string) => {
    switch (type) {
      case 'lesson_section':
      case 'lesson':
        return { label: 'درس / فقرة نظرية', color: 'bg-violet-100 text-violet-800 border-violet-200' };
      case 'exercise':
        return { label: 'تمرين ومسألة تطبيقية', color: 'bg-sky-100 text-sky-800 border-sky-200' };
      case 'question_bank_item':
      case 'question_bank':
        return { label: 'عنصر بنك أسئلة', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'unit_quiz':
        return { label: 'اختبار وحدة ذكي', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'exam_summary':
        return { label: 'ملخص امتحاني', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      default:
        return { label: type || 'مسودة ذكية', color: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  const renderContentPreview = (content: any) => {
    if (!content) return <span className="text-slate-400">لا يوجد محتوى</span>;

    if (typeof content === 'string') {
      return <MathRenderer content={content} />;
    }

    if (content.content || content.questionText || content.text) {
      return (
        <div className="space-y-2">
          {content.title && (
            <h4 className="font-black text-slate-900 text-base">{content.title}</h4>
          )}
          <MathRenderer content={content.content || content.questionText || content.text} />
          {content.solutionText && (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs mt-2">
              <span className="font-black text-emerald-900 block mb-1">الحل النموذجي:</span>
              <MathRenderer content={content.solutionText} />
            </div>
          )}
        </div>
      );
    }

    return (
      <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded-xl overflow-x-auto font-mono dir-ltr text-left">
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white flex items-center justify-center shadow-xs shrink-0">
            <Inbox size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                منصة المراجعة السحابية
              </span>
              <span className="text-xs font-bold text-slate-500">
                المصدر: تطبيق الأندرويد 📱 → المراجعة والاعتماد: الويب 💻
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              📥 مراجعة مسودات الذكاء الاصطناعي
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              تصفح، دقّق، واعتمد المسودات المولّدة بواسطة الذكاء الاصطناعي لتنشر مباشرة للطلاب.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadDrafts}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>تحديث المسودات</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer"
            title="إعدادات الاتصال بـ Supabase"
          >
            <Settings size={16} />
            <span>إعدادات السحابة</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X size={16} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث في نصوص المسودات أو عنوان الوحدة..."
            className="w-full pr-9 pl-4 py-2 rounded-xl text-xs sm:text-sm border border-slate-200 bg-slate-50 focus:bg-white focus:border-violet-400 focus:outline-hidden transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <span className="text-xs font-bold text-slate-500 shrink-0">النوع:</span>
          {['all', 'lesson_section', 'exercise', 'unit_quiz', 'question_bank_item'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                typeFilter === t
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {t === 'all' && 'الكل'}
              {t === 'lesson_section' && 'فقرات ودروس'}
              {t === 'exercise' && 'تمارين'}
              {t === 'unit_quiz' && 'اختبارات'}
              {t === 'question_bank_item' && 'بنوك أسئلة'}
            </button>
          ))}
        </div>
      </div>

      {/* Drafts Cards List */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center space-y-3">
          <RefreshCw size={32} className="animate-spin text-violet-600 mx-auto" />
          <p className="text-sm font-bold text-slate-600">جارِ جلب المسودات السحابية غير المعتمدة...</p>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
            <Check size={28} />
          </div>
          <h3 className="text-lg font-black text-slate-900">لا توجد مسودات معلقة للمراجعة!</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            كافة مسودات الذكاء الاصطناعي تم تدقيقها واعتمادها بنجاح، أو لم يتم إرسال مسودات جديدة من تطبيق الأندرويد بعد.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredDrafts.map(draft => {
            const typeBadge = formatDraftTypeLabel(draft.draft_type);
            return (
              <div
                key={draft.id}
                className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs hover:border-violet-300 transition-all space-y-4"
              >
                {/* Draft Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${typeBadge.color}`}>
                      {typeBadge.label}
                    </span>
                    {draft.unit_title && (
                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                        {draft.unit_title}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {new Date(draft.created_at).toLocaleDateString('ar-SY', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 dir-ltr">
                    ID: {draft.id.slice(0, 8)}...
                  </span>
                </div>

                {/* Content Preview */}
                <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 text-slate-800 text-xs sm:text-sm leading-relaxed">
                  {renderContentPreview(draft.generated_content)}
                </div>

                {/* Context Metadata (if provided) */}
                {draft.context && (
                  <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="font-bold text-slate-700">السياق المرفق: </span>
                    {typeof draft.context === 'string' ? draft.context : JSON.stringify(draft.context)}
                  </div>
                )}

                {/* Action Buttons: Three Core Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    onClick={() => handleReject(draft.id)}
                    disabled={isProcessingAction}
                    className="px-3.5 py-2 rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>رفض</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(draft)}
                    disabled={isProcessingAction}
                    className="px-3.5 py-2 rounded-xl text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit3 size={14} />
                    <span>تعديل ثم اعتماد</span>
                  </button>

                  <button
                    onClick={() => handleApproveAsIs(draft)}
                    disabled={isProcessingAction}
                    className="px-4 py-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <CheckCircle size={14} />
                    <span>اعتماد كما هو</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit & Approve Modal */}
      {editingDraft && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit3 className="text-violet-600" size={20} />
                <h3 className="text-lg font-black text-slate-900">
                  تعديل واعتماد المسودة
                </h3>
              </div>
              <button
                onClick={() => setEditingDraft(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  محتوى المسودة (نص / JSON):
                </label>
                <textarea
                  value={editedContentText}
                  onChange={e => setEditedContentText(e.target.value)}
                  rows={10}
                  className="w-full p-4 rounded-2xl border border-slate-200 text-xs sm:text-sm font-mono focus:border-violet-500 focus:outline-hidden leading-relaxed"
                />
              </div>

              {/* Live KaTeX Preview */}
              <div>
                <span className="block text-xs font-black text-slate-700 mb-1.5">
                  المعاينة الحية للمحتوى المعدل:
                </span>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 max-h-48 overflow-y-auto text-xs sm:text-sm">
                  <MathRenderer content={editedContentText} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setEditingDraft(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveAndApproveEdited}
                disabled={isProcessingAction}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <CheckCircle size={16} />
                <span>حفظ التعديل والاعتماد للنشر</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Connection Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Settings className="text-violet-600" size={20} />
                <h3 className="text-lg font-black text-slate-900">
                  إعدادات الربط السحابي (Supabase)
                </h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-black text-slate-700 mb-1">
                  Supabase Project URL (VITE_SUPABASE_URL):
                </label>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:border-violet-500 focus:outline-hidden dir-ltr text-left"
                />
              </div>

              <div>
                <label className="block font-black text-slate-700 mb-1">
                  Supabase Anon Key (VITE_SUPABASE_ANON_KEY):
                </label>
                <input
                  type="password"
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:border-violet-500 focus:outline-hidden dir-ltr text-left"
                />
              </div>

              <div className="p-3 bg-violet-50 rounded-xl border border-violet-150 text-[11px] text-violet-900 leading-relaxed">
                💡 <strong>ملاحظة:</strong> يتم اعتماد البيانات من ملف <code>.env</code> أو من الحقول أعلاه للتخزين المحلي الآمن.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveConfig}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs sm:text-sm shadow-xs cursor-pointer"
              >
                حفظ الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
