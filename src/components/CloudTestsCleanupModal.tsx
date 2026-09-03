import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Layers,
  FileText,
  Search,
  Sparkles,
  Database,
  HelpCircle
} from 'lucide-react';
import {
  fetchRemoteTestsDiagnostics,
  deleteRemoteTestCompletely,
  cleanupAllDuplicateTests,
  RemoteTestDiagnosticItem
} from '../services/supabaseSync';

interface CloudTestsCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshParent?: () => void;
}

export const CloudTestsCleanupModal: React.FC<CloudTestsCleanupModalProps> = ({
  isOpen,
  onClose,
  onRefreshParent
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState<boolean>(false);
  const [tests, setTests] = useState<RemoteTestDiagnosticItem[]>([]);
  const [duplicatesCount, setDuplicatesCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetchRemoteTestsDiagnostics();
      if (res.success) {
        setTests(res.tests);
        setDuplicatesCount(res.duplicatesCount);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'فشل جلب الاختبارات السحابية' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'حدث خطأ غير متوقع' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBulkCleanup = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في تنظيف كافة الاختبارات المكررة تلقائياً؟ سيتم الاحتفاظ بالنسخة الأحدث لكل اختبار وحذف النسخ الفائضة وملحقاتها.')) {
      return;
    }

    setBulkLoading(true);
    setStatusMessage(null);
    try {
      const res = await cleanupAllDuplicateTests();
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: res.message + (res.details.length > 0 ? `\n• ` + res.details.join('\n• ') : '')
        });
        await loadData();
        if (onRefreshParent) onRefreshParent();
      } else {
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل التنظيف الآلي' });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDeleteSingle = async (item: RemoteTestDiagnosticItem) => {
    setActionLoading(item.id);
    setStatusMessage(null);
    try {
      const res = await deleteRemoteTestCompletely(item.id);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `تم حذف الاختبار "${item.title}" بنجاح مع كافة أقسامه (${res.deletedSectionsCount}) وأسئلته (${res.deletedQuestionsCount}).`
        });
        setConfirmDeleteId(null);
        await loadData();
        if (onRefreshParent) onRefreshParent();
      } else {
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل حذف الاختبار' });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredTests = tests.filter(t => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.scope.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.difficulty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterDuplicatesOnly) {
      return matchesSearch && t.isDuplicate;
    }
    return matchesSearch;
  });

  const getScopeBadge = (scope: string) => {
    switch (scope) {
      case 'subject_comprehensive':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">شامل لجميع الوحدات</span>;
      case 'part':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">جزء كامل</span>;
      case 'multi_unit':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">متعدد الوحدات</span>;
      case 'unit':
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">وحدة واحدة</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                إدارة وتنظيف الاختبارات السحابية
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-mono">NewTests</span>
              </h2>
              <p className="text-xs text-slate-500">
                فحص السجلات المنشورة على Supabase، إزالة التكرارات، والتأكد من ربط الجداول (NewTests &bull; NewTestSections &bull; NewTestQuestions)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-sm flex items-start gap-2 whitespace-pre-line ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{statusMessage.text}</div>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ابحث عن اختبار بالاسم، المجال، أو المعرّف..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                  filterDuplicatesOnly
                    ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <AlertTriangle className={`w-3.5 h-3.5 ${filterDuplicatesOnly ? 'text-amber-600' : 'text-slate-400'}`} />
                المكررات فقط
                {duplicatesCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                    {duplicatesCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="تحديث البيانات"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-violet-600' : 'text-slate-500'}`} />
                تحديث
              </button>

              <button
                type="button"
                onClick={handleBulkCleanup}
                disabled={bulkLoading || duplicatesCount === 0}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className={`w-3.5 h-3.5 ${bulkLoading ? 'animate-spin' : ''}`} />
                تنظيف التكرارات الذكي ({duplicatesCount})
              </button>
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
            <div className="flex items-center gap-4">
              <span>
                إجمالي السجلات السحابية: <strong className="text-slate-800">{tests.length}</strong>
              </span>
              <span>
                السجلات المكررة المرصودة: <strong className={duplicatesCount > 0 ? 'text-amber-600 font-bold' : 'text-slate-800'}>{duplicatesCount}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <HelpCircle className="w-3.5 h-3.5" />
              الحذف التتابعي يزيل سجل NewTests ومعه سجلات NewTestSections و NewTestQuestions المرتبطة
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-violet-600" />
              <p className="text-sm">جاري فحص جدول NewTests والملحقات السحابية...</p>
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
              <p className="text-sm font-semibold text-slate-700">
                {filterDuplicatesOnly ? 'رائع! لا توجد أي اختبارات مكررة مطابقة.' : 'لا توجد اختبارات مسجلة في قاعدة البيانات.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTests.map(item => {
                const isConfirming = confirmDeleteId === item.id;
                const isDeleting = actionLoading === item.id;

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all ${
                      item.isDuplicate
                        ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Test Info */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                          {getScopeBadge(item.scope)}
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            {item.difficulty || 'متوسط'}
                          </span>
                          {item.isDuplicate && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              نسخة مكررة
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            الأقسام: <strong className="text-slate-700">{item.sectionsCount}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            الأسئلة: <strong className="text-slate-700">{item.questionsCount}</strong>
                          </span>
                          <span className="font-mono text-slate-400" title={item.id}>
                            ID: {item.id.slice(0, 10)}...
                          </span>
                          {item.created_at && (
                            <span className="text-slate-400">
                              تاريخ الإضافة: {new Date(item.created_at).toLocaleString('ar-SA')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center">
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5 bg-rose-50 p-1.5 rounded-xl border border-rose-200">
                            <span className="text-xs font-semibold text-rose-800 px-1">تأكيد الحذف؟</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingle(item)}
                              disabled={isDeleting}
                              className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
                            >
                              {isDeleting ? 'جاري...' : 'نعم، احذف'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs text-slate-600 hover:bg-white rounded-lg transition-colors"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            disabled={isDeleting}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 flex items-center gap-1.5 transition-colors"
                            title="حذف هذا السجل وأقسامه وأسئلته"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            حذف السجل
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            يتم تطبيق قواعد الحذف التتابعي القياسية على الجداول: <code className="text-violet-700 font-mono">NewTestQuestions ➔ NewTestSections ➔ NewTests</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium transition-colors"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
