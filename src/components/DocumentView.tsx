import React, { useState, useEffect } from 'react';
import { db, type Document } from '../db';
import { Loader2 } from 'lucide-react';
import { ExercisesAndProblemsDashboard } from './ExercisesAndProblemsDashboard';
import { LessonView } from './LessonView';
import { PdfView } from './PdfView';

interface DocumentViewProps {
  docId: number;
  onBack: () => void;
}

export const DocumentView: React.FC<DocumentViewProps> = ({ docId, onBack }) => {
  const [document, setDocument] = useState<Document | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDoc = async () => {
      const doc = await db.documents.get(docId);
      setDocument(doc);
      setLoading(false);
    };
    loadDoc();
  }, [docId]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="animate-spin text-blue-600" size={48} />
    </div>
  );

  if (!document) return <div>المستند غير موجود</div>;

  if (document.type === 'lesson') {
    return <LessonView docId={docId} onBack={onBack} />;
  }

  if (document.type === 'pdf') {
    return <PdfView docId={docId} onBack={onBack} />;
  }

  return <ExercisesAndProblemsDashboard initialDocId={docId} onBack={onBack} />;
};
