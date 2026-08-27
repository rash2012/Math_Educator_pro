import React, { useState } from 'react';
import { db } from '../db';
import { mergeDocuments } from '../services/gemini';
import { X, Merge, Loader2 } from 'lucide-react';
import { CustomDialog } from './ui/CustomDialog';

interface MergeDialogProps {
  docIds: number[];
  onSuccess: (newDocId: number) => void;
  onCancel: () => void;
}

export const MergeDialog: React.FC<MergeDialogProps> = ({ docIds, onSuccess, onCancel }) => {
  const [isMerging, setIsMerging] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const showAlert = (title: string, message: string) => {
    setDialogConfig({ isOpen: true, title, message });
  };

  const [metadata, setMetadata] = useState({
    title: '',
    grade: '',
    subject: '',
    type: 'exercise' as 'exercise' | 'lesson'
  });

  const handleMerge = async () => {
    if (!metadata.title || !metadata.grade || !metadata.subject) {
      showAlert('تنبيه', 'يرجى ملء جميع الحقول المطلوبة.');
      return;
    }

    // Check if all docs have the same type
    const docs = await db.documents.bulkGet(docIds);
    const types = new Set(docs.map(d => d?.type));
    if (types.size > 1) {
      showAlert('خطأ في الدمج', 'لا يمكن دمج مستندات من أنواع مختلفة (درس مع تمارين).');
      return;
    }
    
    const finalMetadata = { ...metadata, type: docs[0]?.type || 'exercise' };

    setIsMerging(true);
    try {
      const newDocId = await mergeDocuments(docIds, finalMetadata as any);
      onSuccess(newDocId);
    } catch (err) {
      console.error(err);
      showAlert('خطأ', 'فشل في دمج المستندات. حاول مرة أخرى.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
        <button 
          onClick={onCancel}
          className="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X size={24} />
        </button>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Merge size={24} className="text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">دمج المستندات</h2>
          </div>

          <p className="text-gray-600 mb-6">
            سيتم دمج {docIds.length} مستندات في مستند واحد جديد. يرجى إدخال بيانات المستند الجديد:
          </p>

          <div className="space-y-4 mb-8">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">الصف</label>
              <input
                type="text"
                value={metadata.grade}
                onChange={e => setMetadata(prev => ({ ...prev, grade: e.target.value }))}
                placeholder="مثال: الصف التاسع"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">المادة</label>
              <input
                type="text"
                value={metadata.subject}
                onChange={e => setMetadata(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="مثال: الرياضيات"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">عنوان المستند المدمج</label>
              <input
                type="text"
                value={metadata.title}
                onChange={e => setMetadata(prev => ({ ...prev, title: e.target.value }))}
                placeholder="مثال: تجميعة تمارين التوابع"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleMerge}
              disabled={isMerging}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 transition-colors font-bold disabled:opacity-50"
            >
              {isMerging ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  جاري الدمج...
                </>
              ) : (
                <>
                  <Merge size={20} />
                  إتمام عملية الدمج
                </>
              )}
            </button>
            <button
              onClick={onCancel}
              disabled={isMerging}
              className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-bold"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>

      <CustomDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type="alert"
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
