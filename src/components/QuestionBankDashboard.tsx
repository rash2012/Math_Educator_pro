import React, { useState, useEffect, useRef } from 'react';
import { db, type QuestionBank } from '../db';
import { Library, Loader2, Trash2, Eye, Filter, Plus, BookOpen, Layers, Edit3, X, Download, Upload, Globe, Bookmark, GraduationCap, BookMarked } from 'lucide-react';
import { QuestionBankView } from './QuestionBankView';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { DEFAULT_COUNTRY, DEFAULT_GRADE, DEFAULT_SUBJECT, DEFAULT_SERIES_NAME, DEFAULT_TEACHER_NAME, DEFAULT_TEACHER_ROLE } from '../constants/academicData';
import { motion, AnimatePresence } from 'motion/react';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';
import { UnifiedFilterBar } from './common/UnifiedFilterBar';

export const QuestionBankDashboard: React.FC = () => {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [countryFilter, setCountryFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  // Confirmation state
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<{ sourceId: number; targetId: number } | null>(null);
  const [merging, setMerging] = useState(false);

  // Edit Modal State
  const [editingBank, setEditingBank] = useState<QuestionBank | null>(null);

  useEffect(() => {
    loadBanks();
  }, []);

  const loadBanks = async () => {
    setLoading(true);
    const allBanks = await db.questionBanks.reverse().sortBy('createdAt');
    setBanks(allBanks);
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    await db.questionBanks.delete(id);
    loadBanks();
  };

  const handleDragStart = (e: React.DragEvent, bankId: number) => {
    e.dataTransfer.setData('sourceBankId', bankId.toString());
  };

  const handleDropToMerge = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    const sourceId = parseInt(e.dataTransfer.getData('sourceBankId'));
    if (!isNaN(sourceId) && sourceId !== targetId) {
      setConfirmMerge({ sourceId, targetId });
    }
  };

  const executeMerge = async () => {
    if (!confirmMerge) return;
    setMerging(true);
    const { sourceId, targetId } = confirmMerge;
    
    try {
      const sourceBank = await db.questionBanks.get(sourceId);
      const targetBank = await db.questionBanks.get(targetId);
      
      if (sourceBank && targetBank) {
        const mergedItems = [...targetBank.items];
        const maxOrder = targetBank.items.length > 0 
          ? Math.max(...targetBank.items.map(i => i.order)) 
          : 0;
          
        const newItems = sourceBank.items.map((item, index) => ({
          ...item,
          order: maxOrder + index + 1
        }));
        
        await db.questionBanks.update(targetId, {
          items: [...mergedItems, ...newItems],
          updatedAt: Date.now()
        });
        
        await db.questionBanks.delete(sourceId);
        loadBanks();
      }
    } catch (error) {
      console.error('Merge failed', error);
    } finally {
      setMerging(false);
      setConfirmMerge(null);
    }
  };

  const openEditModal = (bank: QuestionBank, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBank(bank);
  };

  const handleSaveBankMetadata = async (updated: {
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
    if (!editingBank?.id) return;
    await db.questionBanks.update(editingBank.id, {
      title: updated.title,
      country: updated.country,
      grade: updated.grade,
      subject: updated.subject,
      part: updated.part || undefined,
      unit: updated.unit || undefined,
      topic: updated.topic || undefined,
      seriesName: updated.seriesName || undefined,
      teacherName: updated.teacherName || undefined,
      teacherRole: updated.teacherRole || undefined,
      updatedAt: Date.now()
    });
    setEditingBank(null);
    loadBanks();
  };

  const handleExport = (bank: QuestionBank, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bank, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${bank.title || 'question_bank'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      alert('حدث خطأ أثناء تصدير الملف.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.title || !Array.isArray(parsed.items)) {
        alert('هيكل ملف الـ JSON غير متوافق مع بنك الأسئلة.');
        return;
      }
      
      // Ensure all loaded/imported items have their 'type' populated explicitly for backward compatibility
      const upgradedItems = (parsed.items || []).map((item: any) => {
        if (item.type) return item;
        const subParts = item.subParts || [];
        const looksLikeMcq = subParts.length === 4 && subParts.some((opt: string) => 
          /[\s(]*[أبجد][\s)]/.test(opt) || 
          /^(أ|ب|ج|د)\s*[-)]/.test(opt.trim()) ||
          opt.trim().startsWith('أ)') || 
          opt.trim().startsWith('ب)') || 
          opt.trim().startsWith('ج)') || 
          opt.trim().startsWith('د)')
        );
        return {
          ...item,
          type: looksLikeMcq ? 'mcq' : 'essay'
        };
      });

      const dataToSave = {
        title: parsed.title,
        country: parsed.country || DEFAULT_COUNTRY,
        grade: parsed.grade || '',
        subject: parsed.subject || '',
        part: parsed.part || '',
        unit: parsed.unit || '',
        topic: parsed.topic || '',
        seriesName: parsed.seriesName || DEFAULT_SERIES_NAME,
        teacherName: parsed.teacherName || DEFAULT_TEACHER_NAME,
        teacherRole: parsed.teacherRole || DEFAULT_TEACHER_ROLE,
        ...parsed,
        items: upgradedItems,
        createdAt: parsed.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      // Delete ID so database assigns a new unique auto-incremented key
      delete dataToSave.id;
      
      await db.questionBanks.add(dataToSave as any);
      loadBanks();
      alert('تم استيراد بنك الأسئلة بنجاح مع كافة البيانات المتاحة والملخصة والمسائل!');
    } catch (err) {
      console.error(err);
      alert('فشل فك تشفير JSON. يرجى التأكد من اختيار ملف بنك أسئلة صالح.');
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  const filteredBanks = banks.filter(bank => {
    return (
      (countryFilter === '' || (bank.country || '').includes(countryFilter)) &&
      (gradeFilter === '' || (bank.grade || '').includes(gradeFilter)) &&
      (subjectFilter === '' || (bank.subject || '').includes(subjectFilter))
    );
  });

  if (selectedBankId) {
    return <QuestionBankView bankId={selectedBankId} onBack={() => { setSelectedBankId(null); loadBanks(); }} />;
  }

  if (isCreating) {
    return <QuestionBankView isNew onBack={() => { setIsCreating(false); loadBanks(); }} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24" dir="rtl">
      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="حذف بنك الأسئلة"
        message="هل أنت متأكد من حذف هذا البنك بالكامل؟ سيتم حذف جميع الأسئلة المرتبطة به نهائياً."
      />

      <ConfirmDialog
        isOpen={!!confirmMerge}
        onClose={() => setConfirmMerge(null)}
        onConfirm={executeMerge}
        type="warning"
        title="تأكيد دمج الوحدات"
        message="هل أنت متأكد من دمج هذا البنك في البنك المختار؟ سيتم نقل جميع الأسئلة وحذف البنك المصدر."
        confirmText="دمج الآن"
      />

      {/* Standardized Unified Academic Metadata Modal */}
      {editingBank && (
        <DocumentMetadataModal
          isOpen={!!editingBank}
          onClose={() => setEditingBank(null)}
          document={{
            id: editingBank.id,
            title: editingBank.title || '',
            country: editingBank.country || DEFAULT_COUNTRY,
            grade: editingBank.grade || DEFAULT_GRADE,
            subject: editingBank.subject || DEFAULT_SUBJECT,
            part: editingBank.part || '',
            unit: editingBank.unit || '',
            topic: editingBank.topic || '',
            seriesName: editingBank.seriesName || DEFAULT_SERIES_NAME,
            teacherName: editingBank.teacherName || DEFAULT_TEACHER_NAME,
            teacherRole: editingBank.teacherRole || DEFAULT_TEACHER_ROLE
          }}
          onSave={handleSaveBankMetadata}
        />
      )}

      {/* Unified Top Header */}
      <UnifiedPageHeader
        icon={Library}
        title="بنوك الأسئلة والتمارين الذكية"
        subtitle="إدارة وتبويب بنوك الأسئلة مع إمكانية دمج الوحدات بالسحب والإفلات"
        badgeText={`${banks.length} بنك`}
        badgeColor="amber"
        actions={
          <>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              ref={importInputRef}
              onChange={handleImport}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 text-xs font-black hover:bg-slate-50 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Upload size={14} />
              <span>استيراد بنك</span>
            </button>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Plus size={15} />
              <span>إنشاء بنك جديد</span>
            </button>
          </>
        }
      />

      {/* Unified Filter Bar */}
      <UnifiedFilterBar
        title="تصفية وتصنيف بنوك الأسئلة"
        countryFilter={countryFilter}
        setCountryFilter={setCountryFilter}
        gradeFilter={gradeFilter}
        setGradeFilter={setGradeFilter}
        subjectFilter={subjectFilter}
        setSubjectFilter={setSubjectFilter}
      />

      {loading ? (
        <div className="flex items-center justify-center py-24 text-amber-600">
          <Loader2 className="animate-spin" size={60} />
        </div>
      ) : filteredBanks.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-300 shadow-sm px-6">
          <Library size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-xl text-gray-500 font-black">لا توجد بنوك أسئلة</p>
          <p className="text-gray-400 mt-2 font-bold">ابدأ بإنشاء أول بنك أسئلة من خلال الزر "إنشاء بنك جديد".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBanks.map((bank) => (
            <motion.div 
              layout
              key={bank.id} 
              draggable
              onDragStartCapture={(e) => handleDragStart(e, bank.id!)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropToMerge(e, bank.id!)}
              className="bg-white rounded-2xl p-5 border border-gray-200 hover:border-amber-300 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group relative overflow-hidden active:scale-95"
              onClick={() => setSelectedBankId(bank.id!)}
            >
              <div>
                {/* Header with Type & Actions */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-lg border bg-amber-50 text-amber-700 border-amber-100 flex items-center gap-1">
                    <Bookmark size={10} />
                    بنك أسئلة
                  </span>

                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => openEditModal(bank, e)}
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      title="تعديل البيانات"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleExport(bank, e)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="تصدير البنك (JSON)"
                    >
                      <Download size={14} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(bank.id!);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="حذف البنك"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-base font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-amber-600 transition-colors mb-2.5">
                  {bank.title}
                </h3>

                {/* Academic Badges */}
                <div className="space-y-2.5 mb-4">
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                      <Globe size={11} className="text-slate-500" />
                      <span>{bank.country || 'سوريا'}</span>
                    </span>
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1">
                      <GraduationCap size={11} className="text-indigo-500" />
                      <span>{bank.grade}</span>
                    </span>
                    <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-100 flex items-center gap-1">
                      <BookOpen size={11} className="text-amber-500" />
                      <span>{bank.subject}</span>
                    </span>
                  </div>

                  {(bank.part || bank.unit || bank.topic) && (
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-gray-600">
                      {bank.part && (
                        <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200/60 flex items-center gap-1">
                          <Layers size={10} className="text-amber-600" />
                          <span>الجزء: {bank.part}</span>
                        </span>
                      )}
                      {bank.unit && (
                        <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200/60 flex items-center gap-1">
                          <BookMarked size={10} className="text-purple-600" />
                          <span>{bank.unit}</span>
                        </span>
                      )}
                      {bank.topic && (
                        <span className="bg-slate-50 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 truncate max-w-[140px]">
                          {bank.topic}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3.5 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-400 font-medium">
                  {new Date(bank.createdAt).toLocaleDateString("ar-SY", {
                    year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </span>
                <span className="text-xs font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl">
                  {bank.items?.length || 0} أسئلة
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
