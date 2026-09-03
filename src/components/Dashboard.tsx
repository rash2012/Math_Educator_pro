import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Document } from '../db';
import { Plus, Trash2, FileText, Merge, Eye, Save, Upload, Download, Sparkles, Edit3, Filter, Globe, GraduationCap, BookOpen, Layers, BookMarked, X, Library } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CustomDialog } from './ui/CustomDialog';
import { DocumentMetadataModal } from './DocumentMetadataModal';
import { COUNTRIES, GRADES, SUBJECTS, PARTS, ALL_DEFAULT_MATH_UNITS } from '../constants/academicData';
import { UnifiedPageHeader } from './common/UnifiedPageHeader';
import { UnifiedFilterBar } from './common/UnifiedFilterBar';
import { SyncStatusBadge } from './SyncStatusBadge';
import { UnitSyncIndicator } from './UnitSyncIndicator';

interface DashboardProps {
  onUploadClick: () => void;
  onViewDoc: (id: number) => void;
  onMergeClick: (docIds: number[]) => void;
  onExtractExercisesFromRef?: (refId: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onUploadClick, onViewDoc, onMergeClick, onExtractExercisesFromRef }) => {
  const documents = useLiveQuery(() => db.documents.orderBy('updatedAt').reverse().toArray());
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  
  // Filtering states
  const [countryFilter, setCountryFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'lesson' | 'pdf'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Editing Metadata Modal State
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);

  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'alert';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const showAlert = (title: string, message: string) => {
    setDialogConfig({ isOpen: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialogConfig({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  const toggleDocSelection = (id: number) => {
    setSelectedDocs(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    return documents.filter(doc => {
      // Hide exercises as they have their own dashboard
      if (doc.type === 'exercise') return false;
      
      if (typeFilter !== 'all' && doc.type !== typeFilter) return false;
      if (countryFilter && (doc.country || 'سوريا') !== countryFilter) return false;
      if (gradeFilter && doc.grade !== gradeFilter) return false;
      if (subjectFilter && doc.subject !== subjectFilter) return false;
      if (unitFilter && doc.unit !== unitFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = doc.title?.toLowerCase().includes(q);
        const matchTopic = doc.topic?.toLowerCase().includes(q);
        const matchUnit = doc.unit?.toLowerCase().includes(q);
        if (!matchTitle && !matchTopic && !matchUnit) return false;
      }
      return true;
    });
  }, [documents, typeFilter, countryFilter, gradeFilter, subjectFilter, unitFilter, searchQuery]);

  const handleExportAll = async () => {
    const docs = await db.documents.toArray();
    if (docs.length === 0) {
      showAlert('تنبيه', 'لا توجد مستندات لتصديرها.');
      return;
    }
    
    const exercises = await db.exercises.toArray();
    const lessonSections = await db.lessonSections.toArray();
    const pdfContents = await db.pdfContents.toArray();
    
    const exportData = {
      documents: docs,
      exercises: exercises,
      lessonSections: lessonSections,
      pdfContents: pdfContents,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `math-educator-full-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSingle = async (doc: Document) => {
    if (!doc.id) return;
    
    const exercises = await db.exercises.where('docId').equals(doc.id).toArray();
    const lessonSections = await db.lessonSections.where('docId').equals(doc.id).toArray();
    const pdfContents = await db.pdfContents.where('docId').equals(doc.id).toArray();
    
    const exportData = {
      documents: [doc],
      exercises: exercises,
      lessonSections: lessonSections,
      pdfContents: pdfContents,
      exportDate: new Date().toISOString(),
      projectName: doc.title
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-${doc.title}-${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (selectedDocs.length === 0) return;
    
    const docs = await db.documents.where('id').anyOf(selectedDocs).toArray();
    const exercises = await db.exercises.where('docId').anyOf(selectedDocs).toArray();
    const lessonSections = await db.lessonSections.where('docId').anyOf(selectedDocs).toArray();
    const pdfContents = await db.pdfContents.where('docId').anyOf(selectedDocs).toArray();
    
    const exportData = {
      documents: docs,
      exercises: exercises,
      lessonSections: lessonSections,
      pdfContents: pdfContents
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `math-educator-export-${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };


  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        const docIdMap: Record<number, number> = {};

        if (data.documents && Array.isArray(data.documents)) {
          for (const doc of data.documents) {
            const oldId = doc.id;
            const { id, ...docData } = doc;
            // Default to exercise if type is missing
            if (!docData.type) {
              docData.type = 'exercise';
            }
            const newId = await db.documents.add(docData);
            if (oldId) docIdMap[oldId] = newId;
          }
        }

        if (data.exercises && Array.isArray(data.exercises)) {
          for (const ex of data.exercises) {
            const { id, ...exData } = ex;
            if (exData.docId && docIdMap[exData.docId]) {
              exData.docId = docIdMap[exData.docId];
            }
            await db.exercises.add(exData);
          }
        }

        if (data.lessonSections && Array.isArray(data.lessonSections)) {
          for (const sec of data.lessonSections) {
            const { id, ...secData } = sec;
            if (secData.docId && docIdMap[secData.docId]) {
              secData.docId = docIdMap[secData.docId];
            }
            await db.lessonSections.add(secData);
          }
        }

        if (data.pdfContents && Array.isArray(data.pdfContents)) {
          for (const pdf of data.pdfContents) {
            const { id, originalFile, ...pdfData } = pdf;
            if (pdfData.docId && docIdMap[pdfData.docId]) {
              pdfData.docId = docIdMap[pdfData.docId];
            }
            // originalFile might become a normal object through JSON conversion, 
            // recreate Uint8Array if possible, or just save without originalFile 
            // since it's mostly the textContent that matters
            let fileObj = undefined;
            if (originalFile && typeof originalFile === 'object') {
                const values = Object.values(originalFile) as number[];
                if (values.length > 0) {
                    fileObj = new Uint8Array(values);
                }
            }
            await db.pdfContents.add({ ...pdfData, originalFile: fileObj });
          }
        }

        showAlert('نجاح', 'تم استيراد البيانات بنجاح!');
        setSelectedDocs([]);
      } catch (err) {
        console.error(err);
        showAlert('خطأ', 'فشل في استيراد البيانات. تأكد من صحة الملف.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleImportReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Validation check for structured reference format
        if (!data.meta || !data.blocks || typeof data.meta !== 'object' || !Array.isArray(data.blocks)) {
          showAlert('خطأ في البنية', 'ملف الـ JSON المحدد لا يحتوي على هيكلية المرجع القياسية المنسقة (تأكد من اشتماله على كتل meta و blocks).');
          return;
        }

        const { meta, blocks, rawText } = data;
        
        // Safely extract document details
        const title = meta.title || file.name.replace('.json', '');
        const grade = meta.grade || 'غير محدد';
        const subject = meta.subject || 'غير محدد';
        const part = meta.part || '';
        const unit = meta.unit || '';
        const topic = meta.topic || '';
        const createdAt = typeof meta.createdAt === 'number' ? meta.createdAt : Date.now();

        // 1. Add Document record to database setup as reference (pdf type)
        const docId = await db.documents.add({
          title,
          grade,
          subject,
          part,
          unit,
          topic,
          type: 'pdf',
          createdAt,
          updatedAt: Date.now()
        });

        // 2. Map structures
        const textContent = rawText || blocks.map((b: any) => b.text || '').join('\n\n');
        const structuredContent = JSON.stringify(blocks);

        // 3. Add to pdfContents
        await db.pdfContents.add({
          docId,
          textContent,
          structuredContent
        });

        showAlert('نجاح الاستيراد', `تم استيراد المرجع المنسق "${title}" بجميع كتل عناوينه وفقراته المنسقة بنجاح!`);
      } catch (err) {
        console.error(err);
        showAlert('خطأ', 'حدث خطأ أثناء قراءة ملف الـ JSON أو معالجة هيكليته المرجعية.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDelete = async (id: number) => {
    showConfirm('حذف المستند', 'هل أنت متأكد من حذف هذا المستند؟ سيتم حذف جميع التمارين والبيانات المرتبطة به.', async () => {
      await db.documents.delete(id);
      await db.exercises.where('docId').equals(id).delete();
      await db.lessonSections.where('docId').equals(id).delete();
      await db.pdfContents.where('docId').equals(id).delete();
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24" dir="rtl">
      {/* Unified Top Header */}
      <UnifiedPageHeader
        icon={BookOpen}
        title="مكتبة المناهج والمستندات التعليمية"
        subtitle="إدارة ومزامنة المراجع التعليمية، كراسات التمارين، وشرح الدروس الرياضية"
        badgeText={`${documents?.length || 0} مستند`}
        badgeColor="violet"
        actions={
          <>
            {selectedDocs.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download size={14} />
                <span>نسخة للمختار ({selectedDocs.length})</span>
              </button>
            )}
            {selectedDocs.length > 1 && (
              <button
                onClick={() => onMergeClick(selectedDocs)}
                className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Merge size={14} />
                <span>دمج المختار ({selectedDocs.length})</span>
              </button>
            )}
            <button
              onClick={handleExportAll}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="تصدير نسخة احتياطية لجميع المستندات"
            >
              <Download size={14} />
              <span>نسخة احتياطية</span>
            </button>
            <label className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs" title="استيراد نسخة احتياطية للمستندات والتمارين">
              <Upload size={14} />
              <span>استيراد بيانات</span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <label className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs" title="استيراد مرجع تعليمي مهيكل بالكامل كملف JSON">
              <Upload size={14} />
              <span>استيراد مرجع JSON</span>
              <input type="file" accept=".json" onChange={handleImportReference} className="hidden" />
            </label>
            <button
              onClick={onUploadClick}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <Plus size={15} />
              <span>مستند جديد</span>
            </button>
          </>
        }
      />

      {/* Unified Filter Bar */}
      <UnifiedFilterBar
        title="تصفية وتصنيف مكتبة المستندات"
        countryFilter={countryFilter}
        setCountryFilter={setCountryFilter}
        gradeFilter={gradeFilter}
        setGradeFilter={setGradeFilter}
        subjectFilter={subjectFilter}
        setSubjectFilter={setSubjectFilter}
        unitFilter={unitFilter}
        setUnitFilter={setUnitFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        typeOptions={[
          { value: 'all', label: '📑 كافة الأنواع (الكل)' },
          { value: 'lesson', label: '📖 ملخصات وشروح الدروس' },
          { value: 'pdf', label: '📕 مراجع تعليمية (PDF)' }
        ]}
      />

      {!documents || documents.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200">
          <FileText size={56} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 text-base font-bold">لا توجد مستندات بعد في المكتبة.</p>
          <p className="text-gray-400 text-xs mt-1">ابدأ بإنشاء مستند جديد أو رفع مرجع بصيغة PDF!</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-200">
          <p className="text-gray-600 text-sm font-bold">لا توجد مستندات مطابقة لمعايير التصفية الحالية.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((doc) => (
            <div 
              key={doc.id}
              className={`bg-white rounded-2xl p-5 border transition-all duration-200 relative flex flex-col justify-between group hover:shadow-md ${
                selectedDocs.includes(doc.id!) 
                  ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-400/30 shadow-sm' 
                  : 'border-gray-200 hover:border-indigo-300'
              }`}
            >
              <div>
                {/* Header with Type & Selection */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(doc.id!)}
                      onChange={() => toggleDocSelection(doc.id!)}
                      className="w-4 h-4 cursor-pointer text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    />
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg border ${
                      doc.type === 'lesson' 
                        ? 'bg-purple-50 text-purple-700 border-purple-100' 
                        : doc.type === 'pdf' 
                          ? 'bg-amber-50 text-amber-800 border-amber-100' 
                          : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                    }`}>
                      {doc.type === 'lesson' ? 'ملخص درس' : doc.type === 'pdf' ? 'مرجع (PDF)' : 'كراسة تمارين'}
                    </span>
                    <UnitSyncIndicator docId={doc.id!} compact={true} />
                  </div>

                  <button
                    onClick={() => setEditingDoc(doc)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
                    title="تعديل بيانات وترويسة المستند"
                  >
                    <Edit3 size={14} />
                    <span>تعديل البيانات</span>
                  </button>
                </div>

                {/* Title */}
                <h3 
                  className="text-base font-black text-slate-900 mb-2.5 leading-snug line-clamp-2 hover:text-indigo-600 cursor-pointer transition-colors" 
                  onClick={() => onViewDoc(doc.id!)}
                >
                  {doc.title}
                </h3>

                {/* Structured Metadata Badges (الدولة - الصف - المادة) */}
                <div className="space-y-2.5 mb-4">
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                      <Globe size={11} className="text-slate-500" />
                      <span>{doc.country || 'سوريا'}</span>
                    </span>
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1">
                      <GraduationCap size={11} className="text-indigo-500" />
                      <span>{doc.grade}</span>
                    </span>
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                      <BookOpen size={11} className="text-emerald-500" />
                      <span>{doc.subject}</span>
                    </span>
                  </div>

                  {(doc.part || doc.unit) && (
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-gray-600">
                      {doc.part && (
                        <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200/60 flex items-center gap-1">
                          <Layers size={10} className="text-amber-600" />
                          <span>{doc.part}</span>
                        </span>
                      )}
                      {doc.unit && (
                        <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200/60 flex items-center gap-1">
                          <BookMarked size={10} className="text-purple-600" />
                          <span>{doc.unit}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {doc.topic && (
                    <p className="text-[11px] text-gray-600 font-bold bg-gray-50/80 border border-gray-100 px-2.5 py-1 rounded-lg line-clamp-1">
                      {doc.topic}
                    </p>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3.5 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[10px] text-gray-400 font-medium">
                  {format(doc.createdAt, 'PPP', { locale: ar })}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onViewDoc(doc.id!)}
                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="فتح المستند"
                  >
                    <Eye size={17} />
                  </button>
                  {doc.type === 'pdf' && onExtractExercisesFromRef && (
                    <button
                      onClick={() => onExtractExercisesFromRef(doc.id!)}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
                      title="استخلاص قسم تمرينات ومسائل الوحدة من هذا المرجع"
                    >
                      <Sparkles size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleExportSingle(doc)}
                    className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="نسخة احتياطية للمستند"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id!)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="حذف المستند"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Metadata Edit Modal */}
      {editingDoc && (
        <DocumentMetadataModal
          isOpen={true}
          onClose={() => setEditingDoc(null)}
          document={editingDoc}
          onSaveSuccess={() => setEditingDoc(null)}
        />
      )}

      <CustomDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onConfirm={dialogConfig.onConfirm}
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
