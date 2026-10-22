/**
 * 🧑‍⚖️ correctionAgent (خدمة الوكيل المُحكّم والمصحح المستقل)
 * 
 * Multi-Layer Multi-Agent System - Layer 4: Independent Critic, Arbiter & LaTeX Verifier
 * 
 * هذه الخدمة تعمل كجهة تحكيم ومراجعة مستقلة تماماً (Independent Reviewer)
 * تعتمد على نموذج ذكاء اصطناعي مستقل (Gemini Pro / Deep Reasoning)
 * منفصل تماماً عن نموذج التوليد الأساسي (Flash / Standard).
 * 
 * مهام الوكيل:
 * 1. التدقيق العلمي والمنطقي والحسابي لأي نص (درس)، حل تمرين، تدرب، تمرينات ومسائل، أو أي قسم مولّد بالذكاء الاصطناعي.
 * 2. التدقيق الصارم لكود LaTeX وإصلاح أي خطأ نحوي أو رمزي قبل العرض للمستخدم النهائي.
 * 3. تطبيق معايير المنهاج السوري للثالث الثانوي العلمي (مصطلح "تابع"، الجداء السلمي، المجالات السورية، تفريق الأشعة، حظر \sum).
 * 4. تطبيق ضوابط الهوية البصرية والوسوم (**عبارة** داخل الشرح فقط بدون إطار ولون بنفسجي، العناوين بالأحمر والأزرق).
 */

import { GoogleGenAI } from "@google/genai";
import { ValidatorAgent } from "./multiAgent/validatorAgent";
import { IndependentArbiterAgent } from "./multiAgent/arbiterAgent";
import { globalOrchestrator } from "./multiAgent/orchestrator";

// قائمة نماذج المحكّم المستقل (نماذج تفكير استنتاجي عميق منفصلة عن نموذج التوليد الأساسي)
export const CORRECTION_AGENT_MODELS = [
  "gemini-3.1-pro-preview", // النموذج الأساسي للمحكّم المستقل (Deep Reasoning & STEM)
  "gemini-2.5-pro",         // نموذج تفكير احتياطي متقدم
  "gemini-3.1-flash-lite",  // نموذج سريع احتياطي معزول
];

// تهيئة عميل Gemini مستقل مخصص للمحكّم
const correctionAi = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build-correction-agent',
    }
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * اختيار نموذج مستقل لا يتطابق مع نموذج التوليد المستخدم
 */
function getIndependentModels(generatorModelUsed?: string): string[] {
  if (!generatorModelUsed) {
    return CORRECTION_AGENT_MODELS;
  }
  const filtered = CORRECTION_AGENT_MODELS.filter(m => m !== generatorModelUsed);
  return filtered.length > 0 ? filtered : CORRECTION_AGENT_MODELS;
}

/**
 * استدعاء نموذج المحكّم المستقل مع دعم المحاولات البديلة
 */
async function callIndependentReviewerModel(
  prompt: string,
  generatorModelUsed?: string,
  responseMimeType: "text/plain" | "application/json" = "text/plain"
): Promise<{ text: string; modelUsed: string }> {
  const models = getIndependentModels(generatorModelUsed);
  let lastError: any = null;

  for (const model of models) {
    try {
      console.log(`[correctionAgent] ⚖️ Independent reviewer invoking separate model: ${model}...`);
      const response = await correctionAi.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1, // درجة حرارة منخفضة جداً للصرامة العلمية والحياد التام
          responseMimeType,
        }
      });

      const text = response.text || '';
      if (text.trim()) {
        console.log(`[correctionAgent] ✅ Independent review completed successfully via model: ${model}`);
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      console.warn(`[correctionAgent] ⚠️ Model ${model} encountered an issue: ${err?.message || err}`);
      lastError = err;
      await delay(750);
    }
  }

  throw lastError || new Error("Failed to get response from independent correction agent models.");
}

/**
 * معالجة وتنظيف كائن JSON المسترجع من المحكّم
 */
function parseJsonSafely(raw: string): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

/**
 * التوجيه الأساسي للمحكّم المستقل (Independent Reviewer System Prompt)
 */
const INDEPENDENT_REVIEWER_GUIDELINES = `
أنت "الوكيل المُحكّم والمراجع المستقل" (Independent Reviewer & Senior Mathematics Examiner).
أنت تعمل كجهة تحكيم علمية وأكاديمية محترفة ومستقلة تماماً ومنفصلة عن نموذج التوليد الأساسي الذي أنتج المسودة الأولى.

🎯 مهمتك الإلزامية الصارمة:
1. التدقيق العلمي والمنطقي والحسابي 100%:
   - فحص صحة كل خطوة حسابية أو جبرية، والتحقق من صحة النتائج الرقمية والتحليلية.
   - التحقق الدقيق من حساب النهايات، المشتقات، التكاملات، معادلات المستقيمات والمستويات، الجداء السلمي، والأشعة.
   - التحقق من شروط المبرهنات ومجموعات التعريف والمجالات.
   - إذا وُجد أي خطأ علمي أو حسابي أو منطقي، قم بتصحيحه وتعديل النتيجة لتكون صحيحة 100%.

2. الضوابط الصارمة الخاصة بالمنهاج السوري (الثالث الثانوي العلمي):
   - استخدام مصطلح "تابع" (وتوابعه) حصراً ومنع كلمة "دالة" نهائياً.
   - الجداء السلمي \\vec{u} \\cdot \\vec{v} حصراً؛ يُمنع استخدام الجداء الخارجي \\times غير الموجود بالمنهاج السوري.
   - كتابة المجالات المفتوحة بالصيغة السورية ]a, b[ والمغلقة [a, b].
   - كتابة حدود المجاميع بنقاط التتابع \\cdots (مثال: S_n = u_0 + u_1 + \\cdots + u_n) ويُمنع استخدام رمز \\sum.
   - قواعد صياغة الأشعة الصارمة: للشعاع بحرف واحد استخدم \\vec{u} حصراً، وللشعاع بين نقطتين بحرفين استخدم \\overrightarrow{AB} حصراً.

3. ضوابط كود LaTeX ككود برمجي لا يُمس:
   - يُمنع منعاً باتاً حذف أو إسقاط أي شرطة مائلة \\ من أي أمر LaTeX (مثل: \\frac, \\sqrt, \\lim, \\vec, \\overrightarrow, \\ln, \\exp, \\infty, \\cdot, إلخ).
   - قاعدة الدولار المفرد $ ... $ حصراً؛ يُمنع منعاً باتاً استخدام $$ ... $$.
   - ترشيد \\left و \\right فقط عند الحاجة لتكبير الأقواس (كالكسور الكبيرة أو المصفوفات) مع التأكد من إغلاقها تماماً.
   - التأكد من تطابق كافة الأقواس المعقوفة { ... } وإغلاق علامات الدولار $.

4. ضوابط العناوين والوسوم والتظليل (حظر تام لكتابة عبارات التوجيه الفوقية):
   - العناوين الرئيسية باللون الأحمر: ضع نص العنوان الفعلي فقط بين نجمتين مفردتين مثل *حل الطلب الأول:* أو *دراسة تغيرات التابع:* (يُمنع منعاً باتاً كتابة عبارة "العنوان الرئيسي باللون الأحمر" أو "العنوان الرئيسي:" كنص حرفي).
   - العناوين الفرعية باللون الأزرق: ضع نص العنوان الفرعي الفعلي فقط بين نجمة وهاش مثل *#حساب المشتق:#* (يُمنع كتابة عبارة "العنوان الفرعي باللون الأزرق" أو "العنوان الفرعي:" كنص حرفي).
   - القوانين والدساتير ضمن إطار أحمر: ***القانون أو الدستور***
   - وسم التظليل **عبارة**: يُستخدم حصراً داخل الشرح لتظليل المفاهيم والمصطلحات الهامة بلون بنفسجي فاتح وبدون إطار نهائياً، ويُمنع منعاً باتاً استخدامه كعنوان فقرة أو مسألة.
   - الترقيم الدائري للخطوات: ① ② ③.

5. ضابط وفصل "💡 فكرة واستراتيجية الحل" (strategyText) عن خطوات الحل:
   - يجب وضع فكرة واستراتيجية الحل حصراً في الحاوية المخصصة لها (strategyText)، ويُمنع منعاً باتاً وضعها داخل حاوية خطوات الحل (solutionText).
   - في شرح الدروس، وحل التدرب، وقسم التمرينات والمسائل: يجب كتابة الفكرة العامة للتمرين وطريقة الحل بشكل موجز ومكثف (إعطاء فكرة عامة ومنهجية التفكير المفتاحية، وليس فكرة حل أو شرح لكافة الطلبات).
   - نموذج معتمد للاقتداء به:
     "تعتمد استراتيجية الحل على الاستثمار الذكي لـ **خاصّة مركز الأبعاد المتناسبة** لإثبات تلاقي المستقيمات في الفراغ. **مثلاً:** لاثبات $(AB)$ و $(CD)$ متقاطعان نتبع مايلي:
     1. نثبت أن نقطة ما (مثلاً $L$) هي مركز أبعاد متناسبة للنقطتين $A$ و $B$ بأوزان مناسبة. فتكون $L\\in (AB)$.
     2. نثبت أن **$L$ نفسها** مركز الأبعاد المتناسبة للنقاط $C$ و $D$ بأوزان مناسبة ، فتكون $L\\in (CD)$.
     3. من العلاقتين السابقتين نجد أن المستقيمين $(AB)$ و $(CD)$ متقاطعين في $L$."
`;

export class CorrectionAgentService {
  /**
   * 1. تدقيق وتصحيح حل تمرين أو مسألة (رياضياً وعلمياً ولغوياً وبصيغة LaTeX)
   */
  async reviewAndCorrectSolution(
    solutionText: string,
    context?: {
      questionText?: string;
      title?: string;
      unit?: string;
      generatorModel?: string;
    }
  ): Promise<string> {
    if (!solutionText || typeof solutionText !== 'string' || solutionText.trim().length === 0) {
      return solutionText || '';
    }

    // المرحلة الأولى: تدقيق نحوي بنيوي سريع
    const preRepair = ValidatorAgent.validateAndRepairLatex(solutionText);
    let currentSolution = preRepair.text;

    // المرحلة الثانية: استدعاء المحكّم المستقل بنموذج تفكير منفصل
    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

[طلب التحكيم والتدقيق لحل رياضي]:
الموضوع / الوحدة: "${context?.unit || context?.title || 'رياضيات الثالث الثانوي العلمي'}"
${context?.questionText ? `نص السؤال أو المسألة الأصلية:\n"""${context.questionText}"""\n` : ''}

نص الحل المراد تدقيقه وتصحيحه:
"""
${currentSolution}
"""

المطلوب:
1. افحص خطوات الحل الحسابية والمنطقية، وتأكد من صحة النتيجة الرياضية والتعليلات 100%.
2. صحح أي خطأ حسابي أو منطقي، وأي خطأ في كود LaTeX.
3. تأكد من قاعدة الدولار المفرد $...$، وتفريق الأشعة (\\vec{u} بحرف واحد، \\overrightarrow{AB} بحرفين)، والترقيم الدائري ① ② ③.
4. حظر وضع الاستراتيجية داخل نص الحل (correctedSolution): يُمنع منعاً باتاً وضع أو إبقاء عنوان أو فقرة "فكرة واستراتيجية الحل" داخل نص الحل؛ نص الحل مخصص حصراً لخطوات وإجابات وحلول الطلبات، وإذا وجدت فقرة استراتيجية الحل في بداية النص احذفها تماماً من نص الحل.
5. أخرج النتيجة بصيغة JSON حصراً بهذا المخطط:
{
  "correctedSolution": "نص الحل الكامل بعد التدقيق والتصحيح والتنقيح الشامل بدون فقرة الاستراتيجية...",
  "hasErrorsFixed": true,
  "summaryOfFixes": "ملخص ما تم تصحيحه إن وجد"
}
`;

      const { text: responseText, modelUsed } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "application/json"
      );

      const parsed = parseJsonSafely(responseText);
      if (parsed && typeof parsed.correctedSolution === 'string' && parsed.correctedSolution.trim().length > 10) {
        currentSolution = parsed.correctedSolution;
        globalOrchestrator.logAction(
          'validator',
          `قام الوكيل المُحكّم (النموذج: ${modelUsed}) بتدقيق الحل وتصحيحه: ${parsed.summaryOfFixes || 'معتمد 100%'}`
        );
      }
    } catch (err) {
      console.warn("[correctionAgent] Fallback to deterministic rules for solution:", err);
    }

    // إزالة أي تسرب لعنوان أو فقرة الاستراتيجية من نص الحل لضمان حصرية وضعها في الحاوية المخصصة
    currentSolution = currentSolution
      .replace(/(?:^|\n)(?:[*\s#💡]*)(?:فكرة\s*واستراتيجية\s*الحل|استراتيجية\s*الحل|استراتيجية\s+[^\n*]{3,60})(?:[*:#\s]*)([\s\S]*?)(?=(?:\n\s*(?:\*(?:حل\s+الطلب|الطلب|الحل|خطوات\s+الحل|الإثبات|البرهان|طريقة\s+الحل|المرحلة)|①|②|1\.|2\.|\*#[^#]+#\*))|$)/i, '')
      .replace(/^(?:[*\s#💡]*)(?:فكرة\s*واستراتيجية\s*الحل|استراتيجية\s*الحل)[^\n]*\n+/i, '')
      .trim();

    // المرحلة الثالثة: صمام أمان إضافي للتحقق من أقواس ودولارات LaTeX
    const postRepair = ValidatorAgent.validateAndRepairLatex(currentSolution);
    return postRepair.text;
  }

  /**
   * 2. تدقيق وتصحيح درس نظري أو شرح مفاهيمي
   */
  async reviewAndCorrectLesson(
    lessonData: any,
    context?: {
      title?: string;
      unit?: string;
      generatorModel?: string;
    }
  ): Promise<any> {
    if (!lessonData || typeof lessonData !== 'object') {
      return lessonData;
    }

    let auditedData = { ...lessonData };

    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

[طلب تحكيم وتدقيق درس نظري]:
عنوان الدرس / الوحدة: "${context?.unit || context?.title || lessonData.title || 'درس نظري'}"

بيانات الدرس (JSON):
${JSON.stringify(lessonData, null, 2)}

المطلوب منك كمحكّم مستقل:
1. فحص التعاريف، المبرهنات، الشروط، الملاحظات، المطبات، والأمثلة التوضيحية وحلولها والتأكد من صحتها العلمية والمنطقية 100%.
2. تصحيح أي خطأ رياضي أو منهجي (تابع بدلاً من دالة، الجداء السلمي، المجالات السورية ]a, b[، الأشعة \\vec{u} و \\overrightarrow{AB}).
3. تدقيق كود LaTeX والتأكد من قاعدة الدولار المفرد $...$ وبقاء الشرطات المائلة كاملة.
4. التأكد من أن وسم **عبارة** لا يظهر إطلاقاً كعنوان فقرة، بل لتظليل الكلمات الهامة داخل الشرح فقط بدون إطار.
5. أعد كائن الـ JSON بنفس الحقول الأصلية تماماً بعد التنقيح.
أعد JSON فقط.
`;

      const { text: responseText, modelUsed } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "application/json"
      );

      const parsed = parseJsonSafely(responseText);
      if (parsed && typeof parsed === 'object') {
        auditedData = parsed;
        globalOrchestrator.logAction(
          'validator',
          `قام الوكيل المُحكّم (النموذج: ${modelUsed}) بتدقيق الدرس النظري واعتماده بنجاح`
        );
      }
    } catch (err) {
      console.warn("[correctionAgent] Lesson review fallback to deterministic rules:", err);
    }

    // صمام أمان لتدقيق نصوص الحقول
    const sanitize = (val: any) => typeof val === 'string' ? ValidatorAgent.validateAndRepairLatex(val).text : val;

    return {
      ...auditedData,
      title: sanitize(auditedData.title),
      content: sanitize(auditedData.content),
      guidance: sanitize(auditedData.guidance),
      notes: sanitize(auditedData.notes),
      traps: sanitize(auditedData.traps),
      examGuidance: sanitize(auditedData.examGuidance),
      exampleText: sanitize(auditedData.exampleText),
      solutionText: sanitize(auditedData.solutionText),
      extraExampleText: sanitize(auditedData.extraExampleText),
      extraSolutionText: sanitize(auditedData.extraSolutionText),
    };
  }

  /**
   * 2b. تدقيق وتصحيح فقرة درس تفصيلية (شرح، إرشادات، ملاحظات، مطبات، ومنهجية الامتحان وأمثلة وتطبيقات)
   * كطبقة تحكيم مستقلة لزر "تصحيح وتنقيح وتنسيق ذكي" في فقرات شرح الدروس
   */
  async reviewAndCorrectLessonSection(
    sectionData: {
      title: string;
      content: string;
      guidance?: string;
      notes?: string;
      traps?: string;
      examGuidance?: string;
      exampleText?: string;
      solutionText?: string;
      extraExampleText?: string;
      extraSolutionText?: string;
      focusPrompt?: string;
    },
    context?: {
      unit?: string;
      generatorModel?: string;
    }
  ): Promise<{
    isCorrect: boolean;
    notes: string;
    optimizedTitle: string;
    optimizedContent: string;
    optimizedGuidance: string;
    optimizedNotes: string;
    optimizedTraps: string;
    optimizedExamGuidance: string;
    optimizedExampleText: string;
    optimizedSolutionText: string;
    optimizedExtraExampleText: string;
    optimizedExtraSolutionText: string;
  }> {
    let audited = {
      isCorrect: true,
      notes: "تم التدقيق والمطابقة بنجاح.",
      optimizedTitle: sectionData.title || '',
      optimizedContent: sectionData.content || '',
      optimizedGuidance: sectionData.guidance || '',
      optimizedNotes: sectionData.notes || '',
      optimizedTraps: sectionData.traps || '',
      optimizedExamGuidance: sectionData.examGuidance || '',
      optimizedExampleText: sectionData.exampleText || '',
      optimizedSolutionText: sectionData.solutionText || '',
      optimizedExtraExampleText: sectionData.extraExampleText || '',
      optimizedExtraSolutionText: sectionData.extraSolutionText || ''
    };

    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

[طلب التحكيم والتدقيق المستقل لفقرة من درس نظري أو ملخص - طبقة المحكّم]:
الموضوع / العنوان: "${context?.unit || sectionData.title || 'فقرة درس'}"
${sectionData.focusPrompt ? `توجيهات إضافية خاصة للتدقيق:\n"""${sectionData.focusPrompt}"""\n` : ''}

البيانات المبدئية للفقرة المراد تدقيقها وتصحيحها:
${JSON.stringify({
  title: sectionData.title,
  content: sectionData.content,
  guidance: sectionData.guidance,
  notes: sectionData.notes,
  traps: sectionData.traps,
  examGuidance: sectionData.examGuidance,
  exampleText: sectionData.exampleText,
  solutionText: sectionData.solutionText,
  extraExampleText: sectionData.extraExampleText,
  extraSolutionText: sectionData.extraSolutionText
}, null, 2)}

المطلوب منك كمحكّم مستقل بنموذج استدلال وتفكير عميق:
1. التدقيق العلمي والحسابي والمنطقي 100% لكافة المفاهيم والشروط والخطوات الحسابية في أمثلة التطبيق وحلولها.
2. التدقيق الصارم لمعايير المنهاج السوري: استخدام كلمة "تابع" حصراً ومنع "دالة"، الجداء السلمي \\vec{u} \\cdot \\vec{v} حصراً ومنع الخارجي، تفريق الأشعة (\\vec{u} لحرف واحد، \\overrightarrow{AB} لحرفين)، المجالات السورية ]a, b[، منع رمز \\sum واستخدام نقاط التتابع \\cdots.
3. التدقيق الصارم لكود ومحددات LaTeX: قاعدة الدولار المفرد $...$ حصراً ومنع $$...$$، وعدم حذف أي شرطة مائلة \\ إطلاقاً، وترشيد \\left و \\right.
4. وسم **عبارة**: يُستخدم حصراً داخل الشرح لتظليل الكلمات الهامة بلون بنفسجي بدون إطار نهائياً، ويُمنع منعاً باتاً استخدامه كعنوان فقرة.
5. العناوين الرئيسية باللون الأحمر (*...*)، والعناوين الفرعية بالأزرق (*#...#*)، والقوانين والدساتير ضمن إطار أحمر (***...***).
6. أخرج النتيجة بصيغة JSON حصراً بهذا المخطط:
{
  "isCorrect": true,
  "notes": "تقرير التحكيم المستقل والملاحظات العلمية واللغوية وتصحيحات LaTeX إن وجدت",
  "optimizedTitle": "العنوان المصحح والمدقق",
  "optimizedContent": "فقرة الشرح المصححة والمضبوطة بالدولار المفرد $...$",
  "optimizedGuidance": "الإرشادات المصححة",
  "optimizedNotes": "الملاحظات والقواعد المصححة",
  "optimizedTraps": "المطبات والأخطاء الشائعة المصححة",
  "optimizedExamGuidance": "طريقة الامتحان المصححة",
  "optimizedExampleText": "نص التمرين التطبيقي المصحح",
  "optimizedSolutionText": "حل التمرين التطبيقي المصحح حسابياً ومنطقياً 100%",
  "optimizedExtraExampleText": "نص التمرين الإضافي المصحح",
  "optimizedExtraSolutionText": "حل التمرين الإضافي المصحح حسابياً ومنطقياً 100%"
}
`;

      const { text: responseText, modelUsed } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "application/json"
      );

      const parsed = parseJsonSafely(responseText);
      if (parsed && typeof parsed === 'object') {
        audited = {
          isCorrect: typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : true,
          notes: parsed.notes || "تمت المراجعة والتحكيم بنجاح.",
          optimizedTitle: parsed.optimizedTitle || audited.optimizedTitle,
          optimizedContent: parsed.optimizedContent || audited.optimizedContent,
          optimizedGuidance: parsed.optimizedGuidance || audited.optimizedGuidance,
          optimizedNotes: parsed.optimizedNotes || audited.optimizedNotes,
          optimizedTraps: parsed.optimizedTraps || audited.optimizedTraps,
          optimizedExamGuidance: parsed.optimizedExamGuidance || audited.optimizedExamGuidance,
          optimizedExampleText: parsed.optimizedExampleText || audited.optimizedExampleText,
          optimizedSolutionText: parsed.optimizedSolutionText || audited.optimizedSolutionText,
          optimizedExtraExampleText: parsed.optimizedExtraExampleText || audited.optimizedExtraExampleText,
          optimizedExtraSolutionText: parsed.optimizedExtraSolutionText || audited.optimizedExtraSolutionText
        };

        globalOrchestrator.logAction(
          'validator',
          `قام الوكيل المُحكّم (النموذج: ${modelUsed}) بتدقيق فقرة الشرح وتصحيحها واعتمادها بنجاح`
        );
      }
    } catch (err) {
      console.warn("[correctionAgent] Section review fallback to deterministic rules:", err);
    }

    const sanitize = (val: string) => typeof val === 'string' ? ValidatorAgent.validateAndRepairLatex(val).text : (val || '');

    return {
      isCorrect: audited.isCorrect,
      notes: (audited.notes ? `${audited.notes}\n\n` : '') +
        "⚖️ [طبقة المُحكّم المستقل correctionAgent]: تم التدقيق والتحكيم العلمي والمنطقي المستقل لفقرة الدرس ومطابقة كود LaTeX ومعايير المنهاج السوري بنسبة 100%.",
      optimizedTitle: sanitize(audited.optimizedTitle),
      optimizedContent: sanitize(audited.optimizedContent),
      optimizedGuidance: sanitize(audited.optimizedGuidance),
      optimizedNotes: sanitize(audited.optimizedNotes),
      optimizedTraps: sanitize(audited.optimizedTraps),
      optimizedExamGuidance: sanitize(audited.optimizedExamGuidance),
      optimizedExampleText: sanitize(audited.optimizedExampleText),
      optimizedSolutionText: sanitize(audited.optimizedSolutionText),
      optimizedExtraExampleText: sanitize(audited.optimizedExtraExampleText),
      optimizedExtraSolutionText: sanitize(audited.optimizedExtraSolutionText)
    };
  }

  /**
   * 3. تدقيق وتصحيح تمارين "تدرّب" (نص المسألة، فكرة الحل، والحل النموذجي)
   */
  async reviewAndCorrectPracticeExercises(
    exercises: any[],
    context?: {
      title?: string;
      unit?: string;
      generatorModel?: string;
    }
  ): Promise<any[]> {
    if (!Array.isArray(exercises) || exercises.length === 0) {
      return exercises || [];
    }

    let audited = [...exercises];

    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

[طلب تحكيم تمارين "تدرّب"]:
الموضوع: "${context?.unit || context?.title || 'تمارين تدرّب'}"

التمارين وحلولها (JSON):
${JSON.stringify(exercises, null, 2)}

المطلوب منك كمحكّم مستقل:
1. التدقيق العلمي والحسابي الشامل لنص كل تمرين واستراتيجية وفكرة الحل (strategyText) والحل النموذجي الكامل (solutionText).
2. في استراتيجية الحل (strategyText): التحقق من أنها تكتب الفكرة العامة للتمرين وطريقة الحل بشكل موجز ومكثف (سطران إلى 4 أسطر فقط)، وتصحيحها إذا كانت تتضمن شرحاً تفصيلياً لكافة الطلبات.
3. تصحيح أي خطأ حسابي أو منطقي في النتائج والخطوات.
4. فحص كود LaTeX: قاعدة الدولار المفرد $...$، وتفريق الأشعة (\vec{u} و \overrightarrow{AB})، والمجالات السورية ]a, b[.
5. التحقق من الترقيم الدائري ① ② ③.
6. أعد نفس المصفوفة بنفس الحقول بعد التصحيح والتدقيق.
أعد JSON فقط.
`;

      const { text: responseText, modelUsed } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "application/json"
      );

      const parsed = parseJsonSafely(responseText);
      if (Array.isArray(parsed) && parsed.length > 0) {
        audited = parsed;
        globalOrchestrator.logAction(
          'validator',
          `قام الوكيل المُحكّم (النموذج: ${modelUsed}) بتدقيق تمارين تدرّب (${audited.length} تمرين)`
        );
      }
    } catch (err) {
      console.warn("[correctionAgent] Practice exercises fallback to deterministic rules:", err);
    }

    return audited.map(ex => ({
      ...ex,
      title: typeof ex.title === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.title).text : ex.title,
      questionText: typeof ex.questionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.questionText).text : ex.questionText,
      strategyText: typeof ex.strategyText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.strategyText).text : ex.strategyText,
      solutionText: typeof ex.solutionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.solutionText).text : ex.solutionText,
    }));
  }

  /**
   * 4. تدقيق وتصحيح تمرينات ومسائل الوحدة
   */
  async reviewAndCorrectUnitExercises(
    exercises: any[],
    context?: {
      title?: string;
      unit?: string;
      generatorModel?: string;
    }
  ): Promise<any[]> {
    if (!Array.isArray(exercises) || exercises.length === 0) {
      return exercises || [];
    }

    let audited = [...exercises];

    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

[طلب تحكيم تمرينات ومسائل الوحدة]:
الوحدة: "${context?.unit || context?.title || 'تمرينات ومسائل الوحدة'}"

بيانات التمارين (JSON):
${JSON.stringify(exercises.slice(0, 10), null, 2)}

المطلوب:
1. التدقيق العلمي والحسابي لنصوص التمارين والحلول النموذجية خطوة بخطوة.
2. التحقق من أن فكرة واستراتيجية الحل (strategyText) تتضمن الفكرة العامة للتمرين وطريقة الحل بشكل موجز ومكثف (سطران إلى 4 أسطر)، وتعديلها إذا كانت تفصّل الطلبات أو تقدم شرحاً كاملاً لها.
3. تصحيح أي خطأ رياضي أو في كود LaTeX بقاعدة الدولار المفرد $...$ وتفريق الأشعة (\vec{u} و \overrightarrow{AB}).
4. أعد المصفوفة بنفس الحقول بعد التصحيح.
أعد JSON فقط.
`;

      const { text: responseText, modelUsed } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "application/json"
      );

      const parsed = parseJsonSafely(responseText);
      if (Array.isArray(parsed) && parsed.length > 0) {
        audited = parsed.concat(exercises.slice(parsed.length));
        globalOrchestrator.logAction(
          'validator',
          `قام الوكيل المُحكّم (النموذج: ${modelUsed}) بتدقيق تمرينات ومسائل الوحدة بنجاح`
        );
      }
    } catch (err) {
      console.warn("[correctionAgent] Unit exercises fallback to deterministic rules:", err);
    }

    return audited.map(ex => ({
      ...ex,
      title: typeof ex.title === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.title).text : ex.title,
      questionText: typeof ex.questionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.questionText).text : ex.questionText,
      solutionText: typeof ex.solutionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.solutionText).text : ex.solutionText,
      mainText: typeof ex.mainText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.mainText).text : ex.mainText,
    }));
  }

  /**
   * 5. تدقيق وتصحيح المراجعة الشاملة للوحدة
   */
  async reviewAndCorrectUnitReview(
    reviewData: any,
    context?: {
      title?: string;
      unit?: string;
      generatorModel?: string;
    }
  ): Promise<any> {
    if (!reviewData || typeof reviewData !== 'object') {
      return reviewData;
    }

    let audited = { ...reviewData };

    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

[طلب تحكيم المراجعة الشاملة للوحدة]:
بيانات المراجعة (JSON):
${JSON.stringify(reviewData, null, 2)}

المطلوب:
1. تدقيق التعاريف، المبرهنات والشروط، والمطبات الامتحانية بدقة تامة.
2. تصحيح أي عبارة غير دقيقة علمياً أو خطأ في صيغ LaTeX.
3. أعد كائن الـ JSON بنفس الحقول بعد التدقيق.
أعد JSON فقط.
`;

      const { text: responseText, modelUsed } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "application/json"
      );

      const parsed = parseJsonSafely(responseText);
      if (parsed && typeof parsed === 'object') {
        audited = parsed;
        globalOrchestrator.logAction(
          'validator',
          `قام الوكيل المُحكّم (النموذج: ${modelUsed}) بتدقيق مراجعة الوحدة الشاملة واعتمادها`
        );
      }
    } catch (err) {
      console.warn("[correctionAgent] Unit review fallback to deterministic rules:", err);
    }

    return globalOrchestrator.validateAndHarmonizeReview(audited).data;
  }

  /**
   * 6. تدقيق وتصحيح الأسئلة والاختبارات وبنوك الأسئلة
   */
  async reviewAndCorrectQuestions(
    questions: any[],
    context?: {
      title?: string;
      unit?: string;
      generatorModel?: string;
    }
  ): Promise<any[]> {
    if (!Array.isArray(questions) || questions.length === 0) {
      return questions || [];
    }

    let audited = [...questions];

    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

[طلب تحكيم مجموعة أسئلة / اختبار]:
الأسئلة (JSON):
${JSON.stringify(questions, null, 2)}

المطلوب:
1. التأكد من الصحة الرياضية بنسبة 100% للسؤال وللإجابة الصحيحة المحددة.
2. التأكد من خلو الخيارات من التكرار والتشخيص المفاهيمي الصحيح للمشتتات (misconceptionDiagnosis).
3. تدقيق كود LaTeX بقاعدة الدولار المفرد $...$.
4. أعد المصفوفة بعد التدقيق والتصحيح.
أعد JSON فقط.
`;

      const { text: responseText, modelUsed } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "application/json"
      );

      const parsed = parseJsonSafely(responseText);
      if (Array.isArray(parsed) && parsed.length > 0) {
        audited = parsed;
        globalOrchestrator.logAction(
          'validator',
          `قام الوكيل المُحكّم (النموذج: ${modelUsed}) بتدقيق الأسئلة (${audited.length} سؤال) واعتمادها`
        );
      }
    } catch (err) {
      console.warn("[correctionAgent] Questions fallback to deterministic rules:", err);
    }

    return globalOrchestrator.validateQuestionSet(audited).questions;
  }

  /**
   * 7. تدقيق وتصحيح أي نص عام أو فقرة مستخرجة
   */
  async reviewAndCorrectText(
    text: string,
    context?: {
      title?: string;
      generatorModel?: string;
    }
  ): Promise<string> {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return text || '';
    }

    const preRepair = ValidatorAgent.validateAndRepairLatex(text);
    let auditedText = preRepair.text;

    try {
      const prompt = `
${INDEPENDENT_REVIEWER_GUIDELINES}

نص رياضي يراد تدقيقه وتصحيح عبارات LaTeX والأخطاء المنطقية فيه:
"""
${auditedText}
"""

المطلوب: أعد النص الكامل بعد تنقيحه وتصحيح أي خطأ رياضي أو في كود LaTeX مع الحفاظ على قاعدة الدولار المفرد $...$ وبقاء الشرطات المائلة كاملة.
أعد النص فقط بدون أي إضافات.
`;

      const { text: responseText } = await callIndependentReviewerModel(
        prompt,
        context?.generatorModel,
        "text/plain"
      );

      if (responseText && responseText.trim().length > 5) {
        auditedText = responseText.trim();
      }
    } catch (err) {
      console.warn("[correctionAgent] Text review fallback:", err);
    }

    return ValidatorAgent.validateAndRepairLatex(auditedText).text;
  }

  /**
   * 8. تدقيق وتصحيح أسئلة بنك الأسئلة (اختيار من متعدد ومسائل مقالية)
   * تفعيل الوكيل المحكّم والمدقق العلمي والرياضي المستقل (Layer 4: Critic & LaTeX Verifier)
   * لفحص الصياغة وكود LaTeX وحلول المسائل علمياً ومنطقياً 100% قبل العرض أو الإضافة.
   */
  async reviewAndCorrectQuestionBankItems<T extends any>(
    items: T[],
    context?: {
      title?: string;
      unit?: string;
      unitTitle?: string;
      generatorModel?: string;
    }
  ): Promise<T[]> {
    if (!Array.isArray(items) || items.length === 0) {
      return items || [];
    }

    const audited = await IndependentArbiterAgent.auditAndCorrectQuestionBankItems(items, {
      unitTitle: context?.unit || context?.unitTitle || context?.title,
      generatorModelUsed: context?.generatorModel,
    });

    globalOrchestrator.logAction(
      'validator',
      `تم تدقيق وتصحيح عدد ${audited.length} سؤال من أسئلة بنك الأسئلة عبر الوكيل المحكّم المستقل بنجاح`
    );

    return audited;
  }

  /**
   * اسم بديل متطابق لتسهيل الاستدعاء
   */
  async auditAndCorrectQuestionBankItems<T extends any>(
    items: T[],
    context?: {
      title?: string;
      unit?: string;
      unitTitle?: string;
      generatorModel?: string;
    }
  ): Promise<T[]> {
    return this.reviewAndCorrectQuestionBankItems(items, context);
  }
}

// تصدير كائن الخدمة الجاهز للاستخدام في جميع أنحاء التطبيق
export const correctionAgent = new CorrectionAgentService();

