import { supabase } from './supabaseClient';
import { GoogleGenAI } from '@google/genai';

export interface ClassificationTarget {
  id: string;
  source: 'NewUnitQuizQuestions' | 'NewTestQuestions';
  sectionType?: string;
  questionText: string;
  options?: string[];
  correctOption?: string;
  topic?: string;
  difficulty?: number;
}

export interface ClassificationResult {
  target: ClassificationTarget;
  proposedLevel: number;
  proposedConcept: string;
  reason: string;
  selected?: boolean;
}

export async function fetchUnitConcepts(unitId: string): Promise<string[]> {
  const concepts = new Set<string>();

  const tables = [
    { table: 'NewLessonSectionExercises', column: 'primary_concept' },
    { table: 'NewLessonSections', column: 'concept_label' },
    { table: 'NewQuestionBankItems', column: 'topic' }
  ];

  for (const t of tables) {
    try {
      const { data } = await (supabase
        .from(t.table as any) as any)
        .select(t.column)
        .not(t.column, 'is', null);
      
      data?.forEach((r: any) => {
        const val = r[t.column];
        if (typeof val === 'string' && val.trim()) concepts.add(val.trim());
      });
    } catch (e) {
      // Ignore missing table/columns gracefully
    }
  }

  try {
    const { data: quizData } = await supabase.from('NewUnitQuizQuestions').select('topic');
    quizData?.forEach((r: any) => {
      if (r.topic && typeof r.topic === 'string' && r.topic.trim()) concepts.add(r.topic.trim());
    });
  } catch (e) {}

  return Array.from(concepts).sort((a, b) => a.localeCompare(b, 'ar'));
}

export async function fetchUnitSectionTypes(unitId: string): Promise<string[]> {
  const types = new Set<string>(['mcq', 'multiple_choice', 'objective']);
  try {
    const { data } = await supabase
      .from('NewTestSections')
      .select('section_type');
    data?.forEach((r: any) => {
      if (r.section_type && typeof r.section_type === 'string') {
        types.add(r.section_type.trim().toLowerCase());
      }
    });
  } catch (e) {}
  return Array.from(types);
}

export async function classifyQuestionsBatch(
  targets: ClassificationTarget[],
  concepts: string[],
  onProgress?: (progressText: string) => void
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];
  const batchSize = 8;
  const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ');
  }

  const ai = new GoogleGenAI({ apiKey });

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(targets.length / batchSize);

    if (onProgress) {
      onProgress(`جاري معالجة الدفعة ${batchNum} من ${totalBatches} (${i + 1} إلى ${Math.min(i + batchSize, targets.length)} من أصل ${targets.length})...`);
    }

    const prompt = `أنت خبير تربوي في المنهاج السوري للرياضيات. صنف الأسئلة التالية بدقة تلامس مستويات الصعوبة (1 إلى 4) واختر المفهوم الرياضي حصراً من قائمة المفاهيم المعتمدة أدناه.

قائمة المفاهيم المعتمدة:
${concepts.length > 0 ? concepts.join('\n') : '(لا توجد مفاهيم محددة، اختر "غير محدد")'}

معايير مستويات الصعوبة:
1 (سهل): تعريف أو تطبيق مباشر بخطوة واحدة.
2 (متوسط): مفهوم واحد بخطوتين أو ثلاث.
3 (صعب): ربط مفهومين، أو خطوات متعددة، أو فخ شائع.
4 (مهارات عليا): استدلال أو برهان أو تحليل غير روتيني.

الأسئلة:
${batch.map(t => `###Q ${t.id}
السؤال: ${t.questionText}
الخيارات: ${t.options?.join(' | ') || 'لا يوجد'}
الإجابة الصحيحة: ${t.correctOption || 'لا يوجد'}`).join('\n\n')}

أجب لكل سؤال بدقة بالصيغة النصية التالية حصراً (بدون استخدام JSON):
###Q <id>
LEVEL: <1 إلى 4>
CONCEPT: <نص حرفي مطابق تماماً لأحد المفاهيم في القائمة أو "غير محدد">
REASON: <جملة واحدة توضيحية باللغة العربية>
`;

    let batchSuccess = false;
    let lastError: any = null;

    for (const modelName of models) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        const text = response.text || '';
        const blocks = text.split('###Q ').slice(1);

        for (const block of blocks) {
          const lines = block.split('\n');
          const id = lines[0]?.trim();
          const levelMatch = block.match(/LEVEL:\s*([1-4])/);
          const conceptMatch = block.match(/CONCEPT:\s*(.+)/);
          const reasonMatch = block.match(/REASON:\s*(.+)/);

          const target = batch.find(t => t.id === id);
          if (target && levelMatch) {
            const rawConcept = conceptMatch ? conceptMatch[1].trim() : 'غير محدد';
            // Exact case-insensitive match against whitelist
            const matchedConcept = concepts.find(c => c.toLowerCase() === rawConcept.toLowerCase()) || 'غير محدد';

            results.push({
              target,
              proposedLevel: Number(levelMatch[1]),
              proposedConcept: matchedConcept,
              reason: reasonMatch ? reasonMatch[1].trim() : 'تصنيف تلقائي',
              selected: true
            });
          }
        }

        batchSuccess = true;
        break; // Success with current model
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || err);
        if (errStr.includes('429') || errStr.toLowerCase().includes('quota') || errStr.toLowerCase().includes('exhausted')) {
          console.warn(`Model ${modelName} quota exhausted, trying fallback model...`);
          continue; // Try next model in fallback array
        } else {
          // If other error, throw or retry
          throw err;
        }
      }
    }

    if (!batchSuccess) {
      throw new Error(lastError?.message || 'تم استنفاد الحصة اليومية لنموذج الذكاء الاصطناعي (Quota Exceeded)');
    }

    // Delay 2000ms between batches
    if (i + batchSize < targets.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return results;
}

export async function classifySingleQuestion(
  questionText: string,
  options?: string[],
  correctOption?: string,
  concepts: string[] = []
): Promise<{ level: number; concept: string; reason: string }> {
  const prompt = `صنف السؤال الرياضي التالي بدقة لمستوى الصعوبة (1-4) ومفهوم رياضي من القائمة:
قائمة المفاهيم: ${concepts.join(', ')}

السؤال: ${questionText}
الخيارات: ${options?.join(' | ') || 'لا يوجد'}
الإجابة: ${correctOption || 'لا يوجد'}

أجب بالصيغة:
LEVEL: <1-4>
CONCEPT: <مفهوم أو غير محدد>
REASON: <سبب>
`;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  const text = res.text || '';
  const level = Number(text.match(/LEVEL:\s*([1-4])/)?.[1] || 2);
  const rawConcept = text.match(/CONCEPT:\s*(.+)/)?.[1]?.trim() || 'غير محدد';
  const concept = concepts.find(c => c.toLowerCase() === rawConcept.toLowerCase()) || 'غير محدد';
  const reason = text.match(/REASON:\s*(.+)/)?.[1]?.trim() || '';
  return { level, concept, reason };
}
