import { GoogleGenAI } from '@google/genai';
// @ts-ignore
import mammoth from 'mammoth';
import { extractPdfText } from './pdf';
import { QuestionBankItem } from '../db';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const MODELS = [
  'gemini-3.8-flash',
  'gemini-4-argon',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview'
];

export interface ExtractedMCQCandidate {
  id: string;
  topic: string;
  difficulty: number; // 1 to 5 stars
  question: string;
  subParts: string[]; // 4 clean choices
  correctIndex: number; // 0 to 3
  solution: string;
  aiGuidance: string;
  type: 'mcq';
  selected?: boolean;
  isAgentAudited?: boolean;
}

/**
 * Clean math text and enforce single dollar $...$ notation
 */
export function sanitizeMathLaTeX(raw: string): string {
  if (!raw) return '';
  let text = raw;

  // Convert double dollar $$...$$ to single dollar $...$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => `$${inner.trim()}$`);

  // Remove \text{...} wrappers if the inner text is Arabic
  text = text.replace(/\\text\s*\{([^}]*[\u0600-\u06FF][^}]*)\}/gi, '$1');

  // If text contains $...$ where the inside has Arabic words, strip dollar signs
  text = text.replace(/\$([^$]*[\u0600-\u06FF][^$]*)\$/g, '$1');

  return text.trim();
}

/**
 * Remove option prefixes like (أ), أ), أ-, [أ], A), (A), 1), etc.
 */
export function cleanOptionPrefix(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip circled numbers ① to ⑳
  cleaned = cleaned.replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/, '');

  // Strip list prefixes like "أ-", "ب-", "[أ]", "(ب)", "أ)", "أ.", "أ:", "(A)", "A)", "A."
  cleaned = cleaned.replace(/^\s*[\[\(\-]?([أبجدهوزحطيكلنعسفضصقرتثخذضظغA-Da-d1-4١-٤])([\]\)\-\s\:\.\,]+)/, '');

  // Clean remaining parenthesis or dash
  cleaned = cleaned.replace(/^\s*[\(\[]?[أبجدA-Da-d][\)\]\-\.\:]\s*/i, '');

  return sanitizeMathLaTeX(cleaned.trim());
}

/**
 * Extract text from PDF, Word (.docx / .doc), or Text files
 */
export async function extractTextFromDocument(file: File): Promise<{
  text: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'doc' | 'text';
}> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();

  // 1. PDF files
  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    const { text } = await extractPdfText(file);
    return { text, fileName, fileType: 'pdf' };
  }

  // 2. Word .docx files
  if (
    lowerName.endsWith('.docx') || 
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const arrayBuffer = await file.arrayBuffer();
    try {
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value || '';
      if (text.trim().length > 0) {
        return { text, fileName, fileType: 'docx' };
      }
    } catch (err) {
      console.warn('Mammoth docx extraction warning, fallbacking:', err);
    }
  }

  // 3. Word .doc (older binary format) or fallback
  if (
    lowerName.endsWith('.doc') || 
    file.type === 'application/msword' || 
    lowerName.endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer();
    // Try mammoth first
    try {
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result.value && result.value.trim().length > 0) {
        return { text: result.value, fileName, fileType: 'doc' };
      }
    } catch {
      // Continue to binary text scanner fallback
    }

    // Binary text extractor fallback: scans for printable Arabic/Unicode/ASCII characters
    const uint8 = new Uint8Array(arrayBuffer);
    let decoder = new TextDecoder('utf-8', { fatal: false });
    let text = decoder.decode(uint8);

    // If mostly garbled, try windows-1256 if available in environment
    if (!/[\u0600-\u06FF]/.test(text)) {
      try {
        const arabicDecoder = new TextDecoder('windows-1256', { fatal: false });
        const decText = arabicDecoder.decode(uint8);
        if (/[\u0600-\u06FF]/.test(decText)) {
          text = decText;
        }
      } catch {
        // Ignore
      }
    }

    // Clean control characters while preserving newlines and arabic text
    const cleanedText = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/[ ]{3,}/g, ' ')
      .replace(/\n\s*\n/g, '\n');

    return { text: cleanedText, fileName, fileType: 'doc' };
  }

  // 4. Plain text / Markdown / JSON / other
  const text = await file.text();
  return { text, fileName, fileType: 'text' };
}

/**
 * Call Gemini with model fallback
 */
async function callGeminiWithFallback(contents: any, config?: any): Promise<string> {
  let lastError: any = null;

  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: config || {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`Model ${model} failed, trying next fallback:`, err);
      lastError = err;
      // Sleep slightly on 429
      if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  throw lastError || new Error('فشل استدعاء الذكاء الاصطناعي لتحليل المستند');
}

/**
 * Clean and parse JSON array from model output
 */
function cleanAndParseJsonArray(raw: string): any[] {
  if (!raw) return [];

  // Remove markdown code blocks if any
  let text = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Find outermost JSON array [...]
  const startIdx = text.indexOf('[');
  const endIdx = text.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    text = text.substring(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Attempt relaxed fixes
    try {
      // Fix trailing commas
      let fixed = text.replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(fixed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.error('Failed to parse model JSON:', text.substring(0, 500));
      return [];
    }
  }
}

/**
 * Extract and enrich MCQs from document text using Gemini
 * - Extracts questions and options
 * - Proposes mathematical concept (topic)
 * - Proposes difficulty (1-5 stars)
 * - Proposes complete detailed model solution (solution)
 * - Proposes exam guidance (aiGuidance)
 */
export async function parseAndEnrichMCQsFromDocumentText(
  documentText: string,
  context: {
    unitTitle?: string;
    grade?: string;
    subject?: string;
    part?: string;
    existingCount?: number;
  } = {}
): Promise<ExtractedMCQCandidate[]> {
  const truncatedText = documentText.length > 70000 
    ? documentText.substring(0, 70000) 
    : documentText;

  const prompt = `
أنت خبير تربوي وموجّه أول لمادة الرياضيات في الجمهورية العربية السورية (الثالث الثانوي العلمي - بكالوريا).
مهمتك: قراءة النص المستخرج من ورقة عمل أو ملف اختبار أو مستند دراسي بدقة متناهية، واستخراج جميع أسئلة الاختيار من متعدد (MCQ) والأسئلة الموضوعية الموجودة فيه، وإعادة هيكلتها وفق أرقى المعايير البيداغوجية والرياضية.

المعايير الصارمة الواجب الالتزام بها:
1. استخراج كل سؤال اختيار من متعدد وتفكيكه:
   - "question": نص السؤال مصاغاً بلغة عربية سليمة ورموز رياضية دقيقة بالكامل.
   - "subParts": مصفوفة من 4 خيارات حصرية ودقيقة. إذا كان السؤال يحتوي أصلاً على خيارات، استخرجها ونظّفها من البادئات (أ، ب، ج، د أو 1، 2، 3، 4 أو A, B, C, D). إذا كان السؤال ينقصه خيارات، صِغ 4 خيارات متكاملة ومشتتات ذكية.
   - "correctIndex": رقم الخيار الصحيح بدقة متناهية (0 أو 1 أو 2 أو 3).
2. إثراء السؤال ببيانات المنهاج:
   - "topic": اقتراح المفهوم أو الفكرة الرياضية الدقيقة للوحدة (مثال: "دراسة تغيرات تابع لوغاريتمي"، "معادلة المستوي المحوري"، "حساب نهاية تابع مثلثي").
   - "difficulty": اقتراح درجة الصعوبة من 1 إلى 5 نجوم (1=مباشر بسيط، 2=تطبيق قاعدي، 3=متوسط امتحاني، 4=مركب، 5=تميز وإبداع).
   - "solution": الحل المقترح النموذجي التفصيلي والمبرر رياضياً خطوة بخطوة مع توضيح سبب اختيار الإجابة الصحيحة وتفنيد المشتتات، وفق سلم التصحيح المعتمد.
   - "aiGuidance": تنبيه أو إرشاد مفاهيمي ذكي من الفخاخ والمطبات الامتحانية الشائعة في هذا السؤال.
3. القواعد الرياضية واللغوية السورية الصارمة (إلزامية 100%):
   - استخدام علامة الدولار المفردة $...$ حصراً لكافة الرموز والمعادلات الرياضية (يُمنع منعاً باتاً استخدام $$...$$).
   - عدم حذف أي شرطة مائلة من أوامر LaTeX (مثل: \\frac, \\sqrt, \\ln, \\exp, \\lim, \\infty, \\vec, \\overrightarrow).
   - للأشعة بحرف واحد: \\vec{u} أو \\vec{v} أو \\vec{n}. وللشعاع بحرفين: \\overrightarrow{AB}.
   - حظر الجداء الشعاعي الخارجي (u × v) لأنه غير موجود في المنهاج السوري؛ المعتمد حصراً هو الجداء السلمي \\vec{u} \\cdot \\vec{v}.
   - كتابة المجالات بالصيغة السورية المعتمدة: المفتوح $]a, b[$ والمغلق $[a, b]$.
   - استخدام مصطلح "تابع" وتوابعه حصراً ومنع كلمة "دالة".
   - حظر رمز المجاميع \\sum، وكتابة المجاميع دوماً بنقاط التتابع: $S_n = u_0 + \\cdots + u_n$.

سياق الوحدة الدراسية الحالية:
- الوحدة النشطة: ${context.unitTitle || 'رياضيات الثالث الثانوي العلمي'}
- المادة: ${context.subject || 'الرياضيات'}
- الصف: ${context.grade || 'الثالث الثانوي العلمي'}
${context.part ? `- الجزء: ${context.part}` : ''}

النص المستخرج من المستند المراد تحليله واستخراج الأسئلة الموضوعية منه:
"""
${truncatedText}
"""

أرجع الناتج كمصفوفة JSON مباشرة فقط بالبنية التالية دون أي شروحات خارج الـ JSON:
[
  {
    "topic": "المفهوم المقترح",
    "difficulty": 3,
    "question": "نص السؤال الرياضي المنسق مع رموز $...$",
    "subParts": [
      "$الخيار الأول بدون بادئة أ$",
      "$الخيار الثاني بدون بادئة ب$",
      "$الخيار الثالث بدون بادئة ج$",
      "$الخيار الرابع بدون بادئة د$"
    ],
    "correctIndex": 0,
    "solution": "🔑 الحل المقترح النموذجي: ...",
    "aiGuidance": "⚠️ تنبيه من فخ امتحاني: ..."
  }
]
`;

  const rawJson = await callGeminiWithFallback([
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ]);

  const parsedArray = cleanAndParseJsonArray(rawJson);
  if (!parsedArray || parsedArray.length === 0) {
    throw new Error('لم يتم العثور على أسئلة موضوعية صالحة في المستند');
  }

  // Sanitize and structure the items
  const candidates: ExtractedMCQCandidate[] = parsedArray.map((item: any, idx: number) => {
    // Clean raw subParts
    let cleanParts: string[] = [];
    if (Array.isArray(item.subParts)) {
      cleanParts = item.subParts.map((opt: any) => cleanOptionPrefix(String(opt || '')));
    }

    // Ensure exactly 4 options
    while (cleanParts.length < 4) {
      cleanParts.push(`خيار إضافي ${cleanParts.length + 1}`);
    }
    if (cleanParts.length > 4) {
      cleanParts = cleanParts.slice(0, 4);
    }

    let correctIdx = typeof item.correctIndex === 'number' ? item.correctIndex : 0;
    if (correctIdx < 0 || correctIdx > 3 || isNaN(correctIdx)) {
      correctIdx = 0;
    }

    const diff = typeof item.difficulty === 'number' && item.difficulty >= 1 && item.difficulty <= 5
      ? Math.round(item.difficulty)
      : 3;

    return {
      id: crypto.randomUUID(),
      topic: item.topic ? String(item.topic).trim() : (context.unitTitle || 'مفهوم رياضي مقترح'),
      difficulty: diff,
      question: sanitizeMathLaTeX(item.question || `سؤال موضوعي مستخرج رقم ${idx + 1}`),
      subParts: cleanParts,
      correctIndex: correctIdx,
      solution: sanitizeMathLaTeX(item.solution || 'الحل المقترح قيد المراجعة'),
      aiGuidance: sanitizeMathLaTeX(item.aiGuidance || 'تأكد من تطبيق القواعد الرياضية بدقة'),
      type: 'mcq',
      selected: true
    };
  });

  return candidates;
}

/**
 * Convert candidates to QuestionBankItem array for active bank
 */
export function convertCandidatesToBankItems(
  candidates: ExtractedMCQCandidate[],
  startOrder: number = 0
): QuestionBankItem[] {
  return candidates.map((c, idx) => ({
    id: c.id,
    topic: c.topic,
    difficulty: c.difficulty,
    question: c.question,
    subParts: c.subParts,
    solution: c.solution,
    aiGuidance: c.aiGuidance,
    order: startOrder + idx,
    type: 'mcq'
  }));
}
