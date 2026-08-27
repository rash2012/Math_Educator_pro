import { db } from '../db';

export async function savePdfDocument(text: string, metadata: {
  title: string;
  grade: string;
  subject: string;
  part?: string;
  unit?: string;
  topic?: string;
  type: 'exercise' | 'lesson' | 'pdf';
}, originalFile: Uint8Array): Promise<number> {
  const docId = await db.documents.add({
    ...metadata,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  await db.pdfContents.add({
    docId,
    textContent: text,
    originalFile
  });

  return docId as number;
}
