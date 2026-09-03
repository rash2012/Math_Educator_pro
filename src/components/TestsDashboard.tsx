import React, { useState, useEffect, useRef } from 'react';
import { db, type Test, type TestCategory } from '../db';
import { 
  BrainCircuit, 
  Loader2, 
  Trash2, 
  Eye, 
  Filter, 
  Download, 
  Upload, 
  FolderPlus, 
  Folder, 
  ChevronLeft, 
  Plus, 
  Edit3, 
  MoreVertical,
  X,
  Lock,
  LockOpen,
  CheckCircle2,
  ClipboardCheck,
  Zap,
  Sparkles
} from 'lucide-react';
import { TestView } from './TestView';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { motion, AnimatePresence } from 'motion/react';
import { reviewTest } from '../services/gemini';
import Markdown from 'react-markdown';

import { DocumentMetadataModal } from './DocumentMetadataModal';
import { CloudTestsCleanupModal } from './CloudTestsCleanupModal';
import { DEFAULT_SERIES_NAME, DEFAULT_TEACHER_NAME, DEFAULT_TEACHER_ROLE } from '../constants/academicData';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';
import { SyncStatusBadge } from './SyncStatusBadge';
import { SyncControlButton } from './SyncControlButton';
import { computeTestHash, computeContentHash, getSupabaseClient, saveSyncMapping, cleanupAllDuplicateTests, type SyncStatus } from '../services/supabaseSync';

export const TestsDashboard: React.FC = () => {
  const [tests, setTests] = useState<Test[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<Record<number, SyncStatus>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Category State
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Confirmation state
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; type: 'test' | 'category' } | null>(null);

  // Filters
  const [gradeFilter, setGradeFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [syncFilter, setSyncFilter] = useState<'all' | 'un_synced'>('all');

  // Edit Modal State
  const [editingTest, setEditingTest] = useState<Test | null>(null);

  // Review State
  const [reviewingTestId, setReviewingTestId] = useState<number | null>(null);
  const [activeReport, setActiveReport] = useState<{ title: string; report: string } | null>(null);

  // Cloud Deduplication & Cleanup State
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const handleCleanupDuplicates = async () => {
    if (!window.confirm('هل ترغب بفحص وتنظيف السجلات المكررة للاختبارات في جدول NewTests سحابياً؟\nسيتم الإبقاء على سجل وحيد معتمد لكل اختبار وحذف النسخ الزائدة بأمان.')) {
      return;
    }
    setIsCleaningDuplicates(true);
    try {
      const res = await cleanupAllDuplicateTests();
      if (res.success) {
        alert(res.message + (res.details.length > 0 ? '\n\nالتفاصيل:\n' + res.details.join('\n') : ''));
        await loadData();
      } else {
        alert('تعذر التنظيف: ' + res.message);
      }
    } catch (err: any) {
      alert('حدث خطأ أثناء تنظيف السجلات: ' + (err.message || err));
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const openEditModal = (test: Test, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTest(test);
  };

  const handleSaveTestMetadata = async (updated: {
    title: string;
    country: string;
    grade: string;
    subject: string;
    part?: string;
    unit?: string;
    topic?: string;
    seriesName?: string;
    teacherName?: string;
    teacherRole?: string;
  }) => {
    if (!editingTest?.id) return;
    await db.tests.update(editingTest.id, {
      title: updated.title,
      country: updated.country,
      grade: updated.grade,
      subject: updated.subject,
      part: updated.part || undefined,
      unit: updated.unit || undefined,
      topic: updated.topic || undefined,
      seriesName: updated.seriesName || undefined,
      teacherName: updated.teacherName || undefined,
      teacherRole: updated.teacherRole || undefined
    });
    setEditingTest(null);
    loadData();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [allTests, allCats, mappings] = await Promise.all([
        db.tests.reverse().sortBy('createdAt'),
        db.testCategories.toArray(),
        db.syncMappings.where('localTable').equals('tests').toArray()
      ]);
      setTests(allTests);
      setCategories(allCats);

      const mappingMap = new Map(mappings.map(m => [String(m.localId), m]));

      // فحص الاختبارات السحابية لاستكشاف البطاقات المتزامنة سابقاً تلقائياً
      const remoteTestsMap = new Map<string, { id: string; is_published: boolean }>();
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data: rTests } = await supabase
            .from('NewTests')
            .select('id, title, is_published');
          if (rTests) {
            for (const rt of rTests) {
              if (rt.title) {
                remoteTestsMap.set(rt.title.trim(), rt);
              }
            }
          }
        } catch {
          // ignore network error
        }
      }

      const statusMap: Record<number, SyncStatus> = {};
      for (const test of allTests) {
        if (!test.id) continue;
        let m = mappingMap.get(String(test.id));
        const testTitle = (test.testData?.title || test.title || '').trim();
        const remoteMatch = remoteTestsMap.get(testTitle);

        if (!m || !m.remoteId) {
          if (remoteMatch) {
            const currentHash = computeTestHash(test);
            await saveSyncMapping('tests', test.id, remoteMatch.id, currentHash, remoteMatch.is_published !== false);
            statusMap[test.id] = remoteMatch.is_published === false ? 'draft_cloud' : 'synced';
          } else if ((test as any).remoteId) {
            statusMap[test.id] = 'synced';
          } else {
            statusMap[test.id] = 'not_synced';
          }
        } else {
          const currentHash = computeTestHash(test);
          const legacyHash = computeContentHash(test);
          if (m.contentHash !== currentHash && m.contentHash !== legacyHash) {
            statusMap[test.id] = 'modified';
          } else if (m.isPublished === false) {
            statusMap[test.id] = 'draft_cloud';
          } else {
            statusMap[test.id] = 'synced';
          }
        }
      }
      setSyncStatuses(statusMap);
    } catch (err) {
      console.error('Error loading tests data:', err);
    } finally {
      setLoading(false);
    }
  };

  const createCategory = async () => {
    if (!newCatName.trim()) return;
    await db.testCategories.add({
      name: newCatName.trim(),
      createdAt: Date.now()
    });
    setNewCatName('');
    setShowNewCatInput(false);
    loadData();
  };

  const handleDragStart = (e: React.DragEvent, testId: number) => {
    e.dataTransfer.setData('testId', testId.toString());
  };

  const handleDropOnCategory = async (e: React.DragEvent, categoryId: number | null) => {
    e.preventDefault();
    const testIdStr = e.dataTransfer.getData('testId');
    if (testIdStr) {
      const testId = parseInt(testIdStr);
      await db.tests.update(testId, { categoryId: categoryId || undefined });
      loadData();
    }
  };

  const handleDeleteTest = async (id: number) => {
    await db.tests.delete(id);
    loadData();
  };

  const handleDeleteCategory = async (id: number) => {
    await db.tests.where('categoryId').equals(id).modify({ categoryId: undefined });
    await db.testCategories.delete(id);
    if (activeCategoryId === id) setActiveCategoryId(null);
    loadData();
  };

  const toggleReviewStatus = async (test: Test, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!test.id) return;
    await db.tests.update(test.id, { isReviewed: !test.isReviewed });
    loadData();
  };

  const handleReviewTest = async (test: Test, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!test.id) return;
    
    setReviewingTestId(test.id);
    try {
      const result = await reviewTest(test.title, test.testData);
      await db.tests.update(test.id, { 
        reviewReport: result.reportMarkdown,
        reviewIssues: result.issues
      });
      setActiveReport({ title: test.title, report: result.reportMarkdown });
      loadData();
    } catch (error) {
      console.error("Review failed", error);
      alert("فشلت عملية المراجعة. يرجى المحاولة لاحقاً.");
    } finally {
      setReviewingTestId(null);
    }
  };

  const handleExport = (test: Test, e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(test, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `test_${test.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const rawData = JSON.parse(text);
        
        let testData: any;

        // Check if it's the new format (with 'content' property)
        if (rawData.content && (rawData.content.problems || rawData.content.exercises || rawData.content.shortAnswer || rawData.content.multipleChoice)) {
            const sections: any[] = [];
            
            if (rawData.content.multipleChoice && rawData.content.multipleChoice.length > 0) {
                sections.push({
                    sectionType: 'mcq',
                    title: 'أولاً: اختر الإجابة الصحيحة في كل مما يأتي:',
                    questions: rawData.content.multipleChoice.map((q: any, idx: number) => {
                        const correctIndex = q.options.findIndex((opt: string) => 
                            opt.trim().replace(/\s+/g, '') === q.correctAnswer?.trim().replace(/\s+/g, '')
                        );
                        return {
                            text: q.question,
                            options: q.options,
                            correctOptionIndex: correctIndex >= 0 ? correctIndex : 0,
                            solution: q.explanation || '',
                            order: idx
                        };
                    })
                });
            }

            if (rawData.content.shortAnswer && rawData.content.shortAnswer.length > 0) {
                sections.push({
                    sectionType: 'shortAnswer',
                    title: 'ثانياً: أجب عن الأسئلة الآتية:',
                    questions: rawData.content.shortAnswer.map((q: any, idx: number) => ({
                        text: q.question,
                        subQuestions: q.subParts || [],
                        solution: q.modelAnswer || '',
                        order: idx
                    }))
                });
            }

            if (rawData.content.exercises && rawData.content.exercises.length > 0) {
                sections.push({
                    sectionType: 'exercises',
                    title: 'ثالثاً: حل التمارين الآتية:',
                    questions: rawData.content.exercises.map((q: any, idx: number) => ({
                        text: q.question,
                        subQuestions: q.subParts || [],
                        solution: q.modelAnswer || '',
                        order: idx
                    }))
                });
            }

            if (rawData.content.problems && rawData.content.problems.length > 0) {
                sections.push({
                    sectionType: 'problems',
                    title: 'رابعاً: حل المسألتين الآتيتين:',
                    questions: rawData.content.problems.map((q: any, idx: number) => ({
                        text: q.question,
                        subQuestions: q.subParts || [],
                        solution: q.modelAnswer || '',
                        order: idx
                    }))
                });
            }

            testData = {
                title: rawData.title || 'اختبار مستورد',
                grade: rawData.grade || '',
                subject: rawData.subject || '',
                difficulty: rawData.difficulty || 'متوسط',
                scope: rawData.type === 'part' ? 'وحدة تعليمية' : 'عام',
                createdAt: Date.now(),
                testData: { sections }
            };
        } else if (rawData.testData && rawData.testData.sections) {
            testData = rawData as any;
            delete testData.id;
            testData.createdAt = Date.now();
        } else {
             // Basic fallback
             testData = {
                title: rawData.title || 'اختبار مستورد',
                grade: rawData.grade || '',
                subject: rawData.subject || '',
                difficulty: rawData.difficulty || 'متوسط',
                scope: rawData.scope || 'وحدة تعليمية',
                createdAt: Date.now(),
                testData: rawData.testData || { sections: [] }
            };
        }
        
        await db.tests.add(testData);
        loadData();
    } catch (error) {
        console.error('Import failed', error);
    } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const unSyncedCount = tests.filter(
    test => !test.id || !syncStatuses[test.id] || syncStatuses[test.id] !== 'synced'
  ).length;

  const filteredTests = tests.filter(test => {
    const matchesCategory = activeCategoryId === null ? !test.categoryId : test.categoryId === activeCategoryId;
    const isUnsynced = !test.id || !syncStatuses[test.id] || syncStatuses[test.id] !== 'synced';
    const matchesSync = syncFilter === 'all' || isUnsynced;
    return (
      matchesCategory &&
      matchesSync &&
      (gradeFilter === '' || test.grade.includes(gradeFilter)) &&
      (subjectFilter === '' || test.subject.includes(subjectFilter)) &&
      (difficultyFilter === '' || test.difficulty === difficultyFilter)
    );
  });

  if (selectedTestId) {
    return <TestView testId={selectedTestId} onBack={() => setSelectedTestId(null)} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24" dir="rtl">
      <ConfirmDialog
        isOpen={confirmDelete?.type === 'test'}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteTest(confirmDelete.id)}
        title="تأكيد حذف الاختبار"
        message="هل أنت متأكد من رغبتك في حذف هذا الاختبار بشكل نهائي من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء."
      />

      <ConfirmDialog
        isOpen={confirmDelete?.type === 'category'}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteCategory(confirmDelete.id)}
        title="تأكيد حذف التصنيف"
        message="هل أنت متأكد من حذف هذا التصنيف؟ سيتم نقل جميع الاختبارات الموجودة فيه إلى 'عام'. لن يتم حذف الاختبارات نفسها."
      />

      {/* Edit Metadata Modal */}
      {editingTest && (
        <DocumentMetadataModal
          isOpen={!!editingTest}
          onClose={() => setEditingTest(null)}
          document={{
            id: editingTest.id,
            title: editingTest.title,
            country: editingTest.country || 'سوريا',
            grade: editingTest.grade,
            subject: editingTest.subject,
            part: editingTest.part,
            unit: editingTest.unit,
            topic: editingTest.topic,
            seriesName: editingTest.seriesName || DEFAULT_SERIES_NAME,
            teacherName: editingTest.teacherName || DEFAULT_TEACHER_NAME,
            teacherRole: editingTest.teacherRole || DEFAULT_TEACHER_ROLE
          }}
          onSave={handleSaveTestMetadata}
        />
      )}

      {/* Unified Top Header */}
      <UnifiedPageHeader
        icon={BrainCircuit}
        title="إدارة الاختبارات والتصنيفات الأكاديمية"
        subtitle="نظّم بنك اختباراتك في تصنيفات احترافية مع التحليل والتدقيق الذكي"
        badgeText={`${tests.length} اختبار`}
        badgeColor="indigo"
        actions={
          <>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImport}
            />
            <button
              onClick={() => setShowCleanupModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-black transition-all shadow-xs active:scale-95 cursor-pointer"
              title="فحص وإدارة السجلات السحابية في NewTests وحذف النسخ المكررة مع أقسامها وأسئلتها"
            >
              <Sparkles size={14} className="text-amber-700" />
              <span>إدارة وتنظيف السجلات السحابية</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 text-xs font-black hover:bg-slate-50 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Upload size={14} />
              <span>استيراد اختبار</span>
            </button>
            <button
              onClick={() => setShowNewCatInput(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <FolderPlus size={15} />
              <span>تصنيف جديد</span>
            </button>
          </>
        }
      />

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar: Categories */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden sticky top-24">
            <div className="p-4 bg-gray-50 border-b border-gray-100 font-black text-gray-700 flex items-center gap-2">
              <Folder size={18} className="text-indigo-500" />
              التصنيفات
            </div>
            
            <div className="p-2 space-y-1">
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnCategory(e, null)}
                onClick={() => setActiveCategoryId(null)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all font-bold ${
                  activeCategoryId === null ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${activeCategoryId === null ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Folder size={14} />
                  </div>
                  عام
                </div>
                <span className="text-[10px] bg-white border px-1.5 py-0.5 rounded-lg opacity-60">
                  {tests.filter(t => !t.categoryId).length}
                </span>
              </div>

              {categories.map((cat) => (
                <div 
                  key={cat.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropOnCategory(e, cat.id!)}
                  onClick={() => setActiveCategoryId(cat.id!)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all font-bold ${
                    activeCategoryId === cat.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`p-1.5 rounded-lg ${activeCategoryId === cat.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      <Folder size={14} />
                    </div>
                    <span className="truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-white border px-1.5 py-0.5 rounded-lg opacity-60">
                      {tests.filter(t => t.categoryId === cat.id).length}
                    </span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete({ id: cat.id!, type: 'category' });
                      }}
                      className="p-1 hover:bg-red-50 text-red-500 rounded hidden group-hover:block"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {showNewCatInput && (
                <div className="p-2 animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-1 mb-2">
                      <input
                        autoFocus
                        type="text"
                        placeholder="اسم التصنيف..."
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createCategory()}
                        className="w-full px-3 py-2 border-2 border-indigo-200 rounded-xl outline-none text-sm font-bold"
                      />
                      <button onClick={() => setShowNewCatInput(false)} className="p-1 text-gray-400 hover:text-red-500">
                        <X size={20} />
                      </button>
                  </div>
                  <button onClick={createCategory} className="w-full py-2 bg-indigo-600 text-white rounded-xl font-black text-xs">إضافة التصنيف</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-grow">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 mb-6">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setSyncFilter('all')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    syncFilter === 'all'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  عرض: الكل ({tests.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSyncFilter('un_synced')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    syncFilter === 'un_synced'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="عرض الاختبارات غير المزامنة أو المعدلة محلياً فقط"
                >
                  <span>غير مُزامَن فقط</span>
                  {unSyncedCount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      syncFilter === 'un_synced' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {unSyncedCount}
                    </span>
                  )}
                </button>
              </div>

              <input
                type="text"
                placeholder="تصفية حسب الصف..."
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
              />
              <input
                type="text"
                placeholder="تصفية حسب المادة..."
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
              />
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer"
              >
                <option value="">جميع الصعوبات</option>
                 <option value="سهل">سهل</option>
                 <option value="متوسط">متوسط</option>
                 <option value="صعب">صعب</option>
                 <option value="مهارات تفكير عليا">مهارات تفكير عليا</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-indigo-600">
              <Loader2 className="animate-spin" size={60} />
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-300 shadow-sm px-6">
              <BrainCircuit size={48} className="text-gray-300 mx-auto mb-4" />
              <p className="text-xl text-gray-500 font-black">لا توجد نتائج مطابقة</p>
              <p className="text-gray-400 mt-2 font-bold">يمكنك سحب الاختبارات إلى التصنيفات الجانبية لتنظيمها.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
              {filteredTests.map((test) => (
                <motion.div 
                  layout
                  key={test.id} 
                  draggable
                  onDragStartCapture={(e) => handleDragStart(e, test.id!)}
                  className={`rounded-2xl shadow-sm border transition-all p-6 cursor-pointer flex flex-col group relative overflow-hidden ${
                    test.isReviewed 
                      ? 'bg-emerald-50/30 border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-100 shadow-emerald-50' 
                      : 'bg-white border-gray-200 hover:shadow-xl hover:border-indigo-200'
                  }`}
                  onClick={() => setSelectedTestId(test.id!)}
                >
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="flex flex-col gap-1 flex-grow">
                        <div className="flex items-center gap-2 flex-wrap">
                           {test.isReviewed && (
                             <div className="flex items-center gap-1 text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-black">
                               <CheckCircle2 size={10} />
                               جاهز
                             </div>
                           )}
                           <SyncStatusBadge
                             table="tests"
                             id={test.id!}
                             data={test}
                             compact={true}
                             onSyncComplete={loadData}
                           />
                           <h3 className="text-xl font-black text-gray-900 line-clamp-2 leading-tight">{test.title}</h3>
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0 mr-4 items-center">
                        <div onClick={(e) => e.stopPropagation()}>
                          <SyncControlButton
                            table="tests"
                            id={test.id!}
                            data={test}
                            variant="compact"
                            onSyncComplete={loadData}
                          />
                        </div>
                        <button 
                          onClick={(e) => toggleReviewStatus(test, e)}
                          className={`p-2.5 rounded-xl transition-all shadow-sm ${
                            test.isReviewed 
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                              : 'bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'
                          }`}
                          title={test.isReviewed ? "إلغاء المراجعة" : "تحديد كمراجع وجاهز"}
                        >
                          {test.isReviewed ? <Lock size={18} /> : <LockOpen size={18} />}
                        </button>
                        <button 
                          onClick={(e) => handleReviewTest(test, e)}
                          disabled={reviewingTestId === test.id}
                          className={`p-2.5 rounded-xl transition-all shadow-sm ${
                            reviewingTestId === test.id 
                              ? 'bg-amber-100 text-amber-700' 
                              : test.reviewReport 
                                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                                : 'bg-gray-50 text-gray-400 hover:bg-amber-50 hover:text-amber-600'
                          }`}
                          title={test.reviewReport ? "عرض/تحديث تقرير المراجعة" : "مراجعة الاختبار بواسطة الذكاء الاصطناعي"}
                        >
                          {reviewingTestId === test.id ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
                        </button>
                        <button 
                          onClick={(e) => openEditModal(test, e)}
                          className="p-2.5 bg-gray-50 text-gray-600 rounded-xl hover:bg-amber-50 hover:text-amber-600 transition-all shadow-sm"
                          title="تعديل البيانات"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button 
                          onClick={(e) => handleExport(test, e)}
                          className="p-2.5 bg-gray-50 text-gray-600 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm"
                        >
                          <Download size={18} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete({ id: test.id!, type: 'test' });
                          }}
                          className="p-2.5 bg-gray-50 text-gray-600 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all shadow-sm"
                        >
                          <Trash2 size={18} />
                        </button>
                    </div>
                  </div>
                  
                  <div className="mt-auto space-y-4 relative z-10">
                    <div className="flex gap-2 items-center flex-wrap">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-black ring-1 ring-slate-200">
                            {test.country || 'سوريا'}
                        </span>
                        <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-black ring-1 ring-indigo-100">
                            {test.grade}
                        </span>
                        <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-lg text-xs font-black ring-1 ring-amber-100">
                            {test.subject}
                        </span>
                        {test.part && (
                          <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-black ring-1 ring-emerald-100">
                              الجزء: {test.part}
                          </span>
                        )}
                        {test.unit && (
                          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-[10px] font-black ring-1 ring-blue-100">
                              الوحدة: {test.unit}
                          </span>
                        )}
                        {test.topic && (
                          <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-lg text-[10px] font-black ring-1 ring-purple-100">
                              الموضوع: {test.topic}
                          </span>
                        )}
                        {test.seriesName && (
                          <span className="bg-teal-50 text-teal-700 px-2.5 py-0.5 rounded-lg text-[10px] font-bold ring-1 ring-teal-100">
                              📚 {test.seriesName}
                          </span>
                        )}
                        {test.teacherName && (
                          <span className="bg-amber-50/80 text-amber-800 px-2.5 py-0.5 rounded-lg text-[10px] font-bold ring-1 ring-amber-200">
                              👨‍🏫 {test.teacherName}
                          </span>
                        )}
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                       <span className={`text-[10px] font-black px-3 py-1 rounded-full ${
                           test.difficulty === 'سهل' ? 'bg-emerald-50 text-emerald-700' : 
                           test.difficulty === 'متوسط' ? 'bg-amber-50 text-amber-700' : 
                           test.difficulty === 'صعب' ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'
                       }`}>
                         {test.difficulty}
                       </span>
                       <span className="text-[10px] text-gray-400 font-bold">
                         {new Date(test.createdAt).toLocaleDateString("ar-SY", {
                             year: 'numeric', month: 'short', day: 'numeric'
                         })}
                       </span>
                    </div>
                  </div>
                  
                  {/* Decorative element */}
                  <div className="absolute top-0 right-0 w-2 h-full bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity" />

                  {test.reviewReport && !reviewingTestId && (
                    <div 
                       onClick={(e) => {
                         e.stopPropagation();
                         setActiveReport({ title: test.title, report: test.reviewReport! });
                       }}
                       className="absolute bottom-2 left-2 bg-indigo-600 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-help shadow-lg"
                       title="انقر لعرض تقرير المراجعة الأخير"
                    >
                      <Zap size={14} />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {activeReport && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
              dir="rtl"
            >
              <div className="p-8 border-b bg-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-2xl">
                    <ClipboardCheck size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black">تقرير المراجعة الذكي</h3>
                    <p className="text-indigo-100 font-bold opacity-80">{activeReport.title}</p>
                  </div>
                </div>
                <button onClick={() => setActiveReport(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X size={28} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                <div className="markdown-body prose prose-indigo max-w-none prose-p:leading-relaxed prose-li:my-1 text-gray-800">
                  <Markdown>{activeReport.report}</Markdown>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t flex justify-end">
                <button
                  onClick={() => setActiveReport(null)}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 transition-all shadow-lg"
                >
                  إغلاق التقرير
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة إدارة وتنظيف الاختبارات السحابية ومكافحة التكرار */}
      <CloudTestsCleanupModal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        onRefreshParent={loadData}
      />
    </div>
  );
};
