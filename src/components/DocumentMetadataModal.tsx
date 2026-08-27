import React, { useState } from 'react';
import { db, type Document } from '../db';
import { AcademicMetadataFields } from './AcademicMetadataFields';
import { DEFAULT_SERIES_NAME, DEFAULT_TEACHER_NAME } from '../constants/academicData';
import { Edit3, Check, X, Save } from 'lucide-react';

interface DocumentMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    id?: number;
    title: string;
    country?: string;
    grade: string;
    subject: string;
    part?: string;
    unit?: string;
    topic?: string;
    seriesName?: string;
    teacherName?: string;
    teacherRole?: string;
  };
  onSave?: (updated: {
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
  }) => Promise<void> | void;
  onSaveSuccess?: () => void;
}

export const DocumentMetadataModal: React.FC<DocumentMetadataModalProps> = ({
  isOpen,
  onClose,
  document,
  onSave,
  onSaveSuccess
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState(document.title || '');
  const [metadata, setMetadata] = useState({
    country: document.country || 'سوريا',
    grade: document.grade || 'الثالث الثانوي العلمي',
    subject: document.subject || 'الرياضيات',
    part: document.part || '',
    unit: document.unit || '',
    topic: document.topic || ''
  });
  const [seriesName, setSeriesName] = useState(document.seriesName || DEFAULT_SERIES_NAME);
  const [teacherName, setTeacherName] = useState(document.teacherName || DEFAULT_TEACHER_NAME);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        title: title.trim() || document.title,
        country: metadata.country || 'سوريا',
        grade: metadata.grade || 'الثالث الثانوي العلمي',
        subject: metadata.subject || 'الرياضيات',
        part: metadata.part || '',
        unit: metadata.unit || '',
        topic: metadata.topic || '',
        seriesName: seriesName.trim() || undefined,
        teacherName: teacherName.trim() || undefined
      };

      if (onSave) {
        await onSave(payload);
      } else if (document.id) {
        await db.documents.update(document.id, {
          ...payload,
          updatedAt: Date.now()
        });
      }
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to update document metadata', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-150 p-6 max-w-xl w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Edit3 size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">تعديل بيانات وترويسة المستند</h3>
              <p className="text-[11px] text-gray-500 font-bold">تحديث الدولة، الصف، المادة، الجزء، والوحدة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-3.5 max-h-[75vh] overflow-y-auto px-1">
          {/* Document Title */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">عنوان المستند <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="مثال: نوطة التكامل والتابع الأصلي"
            />
          </div>

          {/* Academic Metadata Fields (Country -> Grade -> Subject -> Part -> Unit) */}
          <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl">
            <AcademicMetadataFields
              metadata={metadata}
              onChange={(updated) => setMetadata(prev => ({
                country: updated.country || prev.country,
                grade: updated.grade || prev.grade,
                subject: updated.subject || prev.subject,
                part: updated.part !== undefined ? updated.part : prev.part,
                unit: updated.unit !== undefined ? updated.unit : prev.unit,
                topic: updated.topic !== undefined ? updated.topic : prev.topic
              }))}
              showTopic={true}
              topicLabel="الموضوع / الوصف الفرعي (اختياري)"
            />
          </div>

          {/* Optional Teacher / Series Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">اسم السلسلة / الكراس (اختياري)</label>
              <input
                type="text"
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                placeholder="مثال: سلسلة الرواد في الرياضيات"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">اسم المدرس / المؤلف (اختياري)</label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="مثال: الأستاذ حسن راشد العلي"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={isSaving || !title.trim()}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-md"
          >
            <Save size={15} />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
