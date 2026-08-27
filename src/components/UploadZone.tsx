import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  Upload, 
  FileText, 
  Loader2, 
  X, 
  BookOpen, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  AlertCircle,
  HelpCircle,
  FolderOpen,
  ArrowRight
} from 'lucide-react';
import { convertPdfToImages, extractPdfText } from '../services/pdf';
import { extractAndSaveQuestions, extractTextFromImages, extractUnitExercisesFromReference } from '../services/gemini';
import { savePdfDocument } from '../services/pdfSaver';
import { AcademicMetadataFields } from './AcademicMetadataFields';

interface UploadZoneProps {
  onSuccess: (docId: number) => void;
  onCancel: () => void;
  initialType?: 'exercise' | 'lesson' | 'pdf';
  initialReferenceId?: number;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ 
  onSuccess, 
  onCancel, 
  initialType = 'exercise',
  initialReferenceId 
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Exercise source selection: 'pdf_upload' (upload PDF file) vs 'reference_extract' (extract from existing reference in library)
  const [exerciseSource, setExerciseSource] = useState<'pdf_upload' | 'reference_extract'>(
    initialReferenceId ? 'reference_extract' : 'pdf_upload'
  );
  
  const [selectedReferenceId, setSelectedReferenceId] = useState<number | null>(
    initialReferenceId || null
  );

  const [metadata, setMetadata] = useState({
    title: '',
    country: 'سوريا',
    grade: 'الثالث الثانوي العلمي',
    subject: 'الرياضيات',
    part: 'الجزء الأول',
    unit: 'الوحدة الأولى - المتتاليات',
    topic: '',
    type: initialType as 'exercise' | 'lesson' | 'pdf'
  });

  // Query all reference documents (PDFs) from library
  const references = useLiveQuery(() => 
    db.documents.filter(d => d.type === 'pdf').toArray().then(arr => arr.sort((a,b) => b.updatedAt - a.updatedAt))
  );

  // Auto select initial reference if provided
  React.useEffect(() => {
    if (initialReferenceId && references && references.length > 0) {
      const ref = references.find(r => r.id === initialReferenceId);
      if (ref) {
        handleSelectReference(ref.id!);
      }
    }
  }, [initialReferenceId, references]);

  const handleSelectReference = (refId: number) => {
    setSelectedReferenceId(refId);
    setError(null);
    const ref = references?.find(r => r.id === refId);
    if (ref) {
      setMetadata(prev => ({
        ...prev,
        title: `تمرينات ومسائل - ${ref.unit ? `${ref.unit}` : ref.title}`,
        country: ref.country || prev.country || 'سوريا',
        grade: ref.grade || prev.grade,
        subject: ref.subject || prev.subject,
        part: ref.part || prev.part,
        unit: ref.unit || prev.unit,
        topic: ref.topic || 'تمرينات ومسائل الوحدة'
      }));
    }
  };

  const handleExtractFromSelectedReference = async () => {
    if (!selectedReferenceId) {
      setError('يرجى اختيار مرجع من القائمة أولاً.');
      return;
    }

    if (!metadata.title.trim()) {
      setError('يرجى كتابة عنوان للمستند الجديد.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setStatusMessage('جاري تحليل نص المرجع واستخلاص قسم (تمرينات ومسائل الوحدة)...');

    try {
      const docId = await extractUnitExercisesFromReference(selectedReferenceId, metadata);
      onSuccess(docId);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'حدث خطأ أثناء استخلاص تمرينات ومسائل الوحدة من المرجع.');
    } finally {
      setIsUploading(false);
      setStatusMessage('');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!metadata.title.trim() || !metadata.grade.trim() || !metadata.subject.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة (العنوان، الصف، المادة) قبل رفع الملف.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setStatusMessage(
      metadata.type === 'exercise' 
        ? 'جاري معالجة ملف PDF واستخراج التمرينات والمسائل...' 
        : metadata.type === 'lesson' 
          ? 'جاري استخراج فقرات ومحتوى الدرس...' 
          : 'جاري حفظ وفهرسة المرجع التعليمي...'
    );

    try {
      if (metadata.type === 'pdf') {
        // Fast text extraction
        const { text: fastText, originalFile } = await extractPdfText(file);
        
        let finalText = fastText;
        
        // Fallback to Gemini Vision OCR if fast text is minimal
        if (!fastText || fastText.trim().length < 200) {
          setStatusMessage('جاري استخلاص النص الدقيق والمعادلات عبر الذكاء الاصطناعي...');
          const images = await convertPdfToImages(file);
          finalText = await extractTextFromImages(images);
        }

        const docId = await savePdfDocument(finalText, metadata, originalFile);
        onSuccess(docId);
      } else {
        const images = await convertPdfToImages(file);
        const docId = await extractAndSaveQuestions(images, metadata as any);
        onSuccess(docId);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'فشل في معالجة الملف. تأكد من أن ملف الـ PDF سليم وحاول مرة أخرى.');
    } finally {
      setIsUploading(false);
      setStatusMessage('');
    }
  };

  const selectedRefDoc = references?.find(r => r.id === selectedReferenceId);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <PlusCircleIcon />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">إنشاء / رفع مستند جديد</h2>
              <p className="text-xs text-gray-500">اختر نوع المستند ومصدر المحتوى لإضافته إلى المكتبة</p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            disabled={isUploading}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Document Type Selector */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block">1. نوع المستند المطلوب</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMetadata(prev => ({ ...prev, type: 'exercise' }));
                  setError(null);
                }}
                className={`py-2.5 px-3 rounded-xl border-2 transition-all font-bold text-sm flex items-center justify-center gap-2 ${
                  metadata.type === 'exercise' 
                    ? 'border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm' 
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText size={16} />
                <span>تمارين ومسائل</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetadata(prev => ({ ...prev, type: 'lesson' }));
                  setError(null);
                }}
                className={`py-2.5 px-3 rounded-xl border-2 transition-all font-bold text-sm flex items-center justify-center gap-2 ${
                  metadata.type === 'lesson' 
                    ? 'border-purple-600 bg-purple-50/80 text-purple-700 shadow-sm' 
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Layers size={16} />
                <span>درس تفاعلي</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetadata(prev => ({ ...prev, type: 'pdf' }));
                  setError(null);
                }}
                className={`py-2.5 px-3 rounded-xl border-2 transition-all font-bold text-sm flex items-center justify-center gap-2 ${
                  metadata.type === 'pdf' 
                    ? 'border-amber-600 bg-amber-50/80 text-amber-700 shadow-sm' 
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <BookOpen size={16} />
                <span>مرجع (PDF)</span>
              </button>
            </div>
          </div>

          {/* If EXERCISE is chosen -> Sub-choice: Upload PDF VS Select Reference from Library */}
          {metadata.type === 'exercise' && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <label className="text-xs font-bold text-slate-700 block">2. مصدر استخراج التمارين والمسائل:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExerciseSource('pdf_upload');
                    setError(null);
                  }}
                  className={`py-2.5 px-3 rounded-lg border-2 text-xs font-bold transition-all flex items-center justify-center gap-2 text-right ${
                    exerciseSource === 'pdf_upload'
                      ? 'border-blue-600 bg-white text-blue-700 shadow-sm'
                      : 'border-transparent bg-slate-200/70 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Upload size={16} className="shrink-0" />
                  <span>① رفع ملف PDF واستخراج التمارين</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExerciseSource('reference_extract');
                    setError(null);
                  }}
                  className={`py-2.5 px-3 rounded-lg border-2 text-xs font-bold transition-all flex items-center justify-center gap-2 text-right ${
                    exerciseSource === 'reference_extract'
                      ? 'border-emerald-600 bg-white text-emerald-700 shadow-sm'
                      : 'border-transparent bg-slate-200/70 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <BookOpen size={16} className="shrink-0" />
                  <span>② اختيار مرجع واستخلاص تمرينات الوحدة</span>
                </button>
              </div>

              {/* Notice for Option 2 */}
              {exerciseSource === 'reference_extract' && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs leading-relaxed flex items-start gap-2">
                  <Sparkles size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>استخلاص تمرينات ومسائل الوحدة:</strong> سيقوم النظام باستخلاص قسم «تمرينات ومسائل الوحدة» الواقع في نهاية المرجع المدرسي المختار كما هي تماماً في المرجع، مع الحفاظ على الترقيم وصيغ LaTeX والجداول.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reference Selection Dropdown (Only when type is exercise and source is reference_extract) */}
          {metadata.type === 'exercise' && exerciseSource === 'reference_extract' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-700 block">3. اختر المرجع من المكتبة:</label>
              {!references || references.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertCircle size={16} />
                    <span>لا توجد مراجع (PDF) محفوظة في المكتبة حالياً</span>
                  </div>
                  <p>
                    لإتمام هذا الخيار، يمكنك أولاً رفع كتاب أو مرجع مدرسي باختيار نوع <strong>(مرجع PDF)</strong> بالأعلى، أو يمكنك استخدام الخيار الأول <strong>(رفع ملف PDF)</strong> لاستخراج التمارين مباشرة من جهازك.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedReferenceId || ''}
                    onChange={(e) => handleSelectReference(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border-2 border-emerald-400 bg-emerald-50/40 rounded-xl text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- اضغط لاختيار مرجع من المكتبة --</option>
                    {references.map((ref) => (
                      <option key={ref.id} value={ref.id}>
                        {ref.title} {ref.unit ? `(الوحدة: ${ref.unit})` : ''} {ref.part ? `(الجزء: ${ref.part})` : ''} - {ref.grade}
                      </option>
                    ))}
                  </select>

                  {selectedRefDoc && (
                    <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-900 text-sm">{selectedRefDoc.title}</span>
                        <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-800 rounded text-[11px] font-bold">
                          مرجع معتمد
                        </span>
                      </div>
                      <p className="text-xs text-emerald-700">
                        {selectedRefDoc.grade} • {selectedRefDoc.subject} 
                        {selectedRefDoc.part && ` • الجزء ${selectedRefDoc.part}`} 
                        {selectedRefDoc.unit && ` • الوحدة ${selectedRefDoc.unit}`}
                        {selectedRefDoc.topic && ` • الموضوع: ${selectedRefDoc.topic}`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Metadata Fields Form */}
          <div className="space-y-3 pt-1 border-t border-gray-100">
            <div className="text-xs font-bold text-gray-700">
              {metadata.type === 'exercise' && exerciseSource === 'reference_extract' ? '4. مراجعة وتعديل بيانات كراسة التمارين الجديدة:' : 'بيانات وترويسة المستند:'}
            </div>

            {/* Document Title */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">عنوان المستند <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={metadata.title}
                onChange={e => setMetadata(prev => ({ ...prev, title: e.target.value }))}
                placeholder={metadata.type === 'exercise' ? 'مثال: تمرينات ومسائل - الوحدة الأولى (المتتاليات)' : metadata.type === 'lesson' ? 'مثال: ملخص درس المماس' : 'مثال: كتاب الرياضيات - الجزء الأول'}
                className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
              />
            </div>

            {/* Academic metadata fields (Country, Grade, Subject, Part, Unit) */}
            <div className="p-3 bg-gray-50/80 border border-gray-200 rounded-xl">
              <AcademicMetadataFields
                metadata={metadata}
                onChange={(updated) => setMetadata(prev => ({ ...prev, ...updated }))}
                showTopic={metadata.type === 'pdf' || (metadata.type === 'exercise' && exerciseSource === 'reference_extract')}
                topicLabel="الموضوع / الوصف (اختياري)"
                topicPlaceholder="مثال: تمرينات ومسائل الوحدة، المتتاليات، النهايات والاستمرار..."
              />
            </div>
          </div>

          {/* Action Area: Either PDF File Drag & Drop OR Button for Reference Extraction */}
          {metadata.type === 'exercise' && exerciseSource === 'reference_extract' ? (
            <div className="pt-2">
              <button
                type="button"
                disabled={isUploading || !selectedReferenceId}
                onClick={handleExtractFromSelectedReference}
                className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-md transition-all ${
                  isUploading || !selectedReferenceId
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white hover:shadow-lg active:scale-[0.99]'
                }`}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-white" />
                    <span>{statusMessage || 'جاري استخلاص تمرينات ومسائل الوحدة...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>استخلاص قسم تمرينات ومسائل الوحدة وإنشاء المستند</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="relative group pt-1">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                disabled={isUploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                isUploading ? 'bg-gray-50 border-gray-300' : 'border-blue-300 bg-blue-50/40 group-hover:border-blue-500 group-hover:bg-blue-50'
              }`}>
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 size={40} className="text-blue-600 animate-spin mb-3" />
                    <p className="text-base font-bold text-gray-800">{statusMessage || 'جاري معالجة المستند...'}</p>
                    <p className="text-xs text-gray-500 mt-1">يتم استخراج النصوص وصيغ LaTeX والرسوم بدقة عالية</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                      <Upload size={28} />
                    </div>
                    <p className="text-base font-bold text-gray-800 mb-1">اسحب وأفلت ملف PDF هنا</p>
                    <p className="text-xs text-gray-500">أو انقر لاختيار ملف من جهازك لبدء الاستخراج</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1">{error}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PlusCircleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
  </svg>
);
