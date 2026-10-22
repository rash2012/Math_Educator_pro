/**
 * Independent Arbiter & Scientific Critic Agent (الوكيل المحكّم والمدقق العلمي والرياضي المستقل)
 * 
 * Layer 4: Critic, Validator & LaTeX Verifier
 * 
 * This agent acts as a completely independent, professional referee/auditor
 * that runs on an INDEPENDENT MODEL from the initial generation model (e.g. Gemini Pro / Reasoning model).
 * It audits, corrects, and verifies any AI-generated mathematical content:
 * - Lessons & theoretical explanations
 * - Exercise solutions (detailed and step-by-step)
 * - Practice exercises ("تدرّب")
 * - Unit exercises & problems ("تمرينات ومسائل الوحدة")
 * - Quizzes, mind maps, tests, and booklets
 * 
 * It rigorously checks and fixes:
 * 1. Scientific & mathematical logic (100% calculation correctness, proof validity, theorem conditions)
 * 2. Syrian curriculum compliance (term "تابع", scalar product \cdot, intervals ]a, b[, no \sum, \vec vs \overrightarrow)
 * 3. Strict LaTeX standards (single dollar $...$ only, inviolable backslashes, balanced brackets)
 * 4. Tag & typography rules (**عبارة** only for inline highlight, headings in red/blue)
 */

import { GoogleGenAI } from "@google/genai";
import { ValidatorAgent } from "./validatorAgent";
import { ValidationIssue } from "./types";
import { safeParseJson } from "../../utils/safeJson";

// Independent Arbiter Models Pool (Prioritizes Deep Reasoning and STEM Verification)
export const INDEPENDENT_ARBITER_MODELS = [
  "gemini-3.1-pro-preview", // Premier complex STEM reasoning model
  "gemini-2.5-pro",         // Advanced reasoning fallback
  "gemini-3.8-flash"        // High-speed fallback
];

const arbiterAi = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build-arbiter',
    }
  }
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Select an independent model that is distinct from the generator model
 */
function selectIndependentModel(generatorModelUsed?: string): string[] {
  if (!generatorModelUsed) {
    return INDEPENDENT_ARBITER_MODELS;
  }
  const filtered = INDEPENDENT_ARBITER_MODELS.filter(m => m !== generatorModelUsed);
  return filtered.length > 0 ? filtered : INDEPENDENT_ARBITER_MODELS;
}

/**
 * Execute request on the independent arbiter model with retry fallback
 */
async function callArbiterModel(
  prompt: string,
  generatorModelUsed?: string,
  responseMimeType: "text/plain" | "application/json" = "text/plain"
): Promise<string> {
  const models = selectIndependentModel(generatorModelUsed);
  let lastError: any = null;

  for (const model of models) {
    try {
      console.log(`[Arbiter Agent] ⚖️ Independent arbiter invoking model: ${model}...`);
      const response = await arbiterAi.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.1, // Near zero temperature for strict mathematical precision and arbitration
          responseMimeType,
        }
      });

      const text = response.text || '';
      if (text.trim()) {
        console.log(`[Arbiter Agent] ✅ Independent audit completed with model: ${model}`);
        return text;
      }
    } catch (err: any) {
      console.warn(`[Arbiter Agent] ⚠️ Model ${model} failed in arbiter step: ${err?.message || err}`);
      lastError = err;
      await delay(800);
    }
  }

  throw lastError || new Error("Failed to get response from independent arbiter models.");
}

/**
 * Clean and parse JSON returned by arbiter
 */
function parseArbiterJson(rawText: string): any {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    const cleaned = rawText
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

export class IndependentArbiterAgent {
  /**
   * Core Prompt Persona for the Independent Mathematical Arbiter
   */
  private static getArbiterSystemGuidelines(): string {
    return `
أنت "الوكيل المحكّم والمدقق العلمي والرياضي المستقل" (Independent Academic Arbiter & LaTeX Verifier) لمادة الرياضيات للثالث الثانوي العلمي (بكالوريا سوريا).
أنت جهة تحكيم وتدقيق مستقلة تماماً ومحترفة ومنفصلة عن نموذج التوليد الأول.

مهامك الإلزامية الصارمة:
1. التدقيق العلمي والمنطقي بنسبة 100% (Scientific & Logical Correctness):
   - التحقق من صحة كافة الخطوات الحسابية والجبرية والنتائج الرقمية والتحليلية.
   - التحقق من صحة حساب النهايات والمشتقات والتكاملات ومعادلات المستقيمات والمستويات، والجداء السلمي، والأشعة، والإحداثيات.
   - التحقق من صحة الفروض وشروط المبرهنات ومجموعات التعريف والمجالات.
   - تصحيح أي خطأ علمي أو حسابي أو منطقي في الحال وتعديل النتيجة لتكون صحيحة 100%.

2. الضوابط الصارمة الخاصة بالمنهاج السوري (Syrian Curriculum Alignment):
   - استخدام مصطلح "تابع" (وتوابعه) حصراً ومنع كلمة "دالة" نهائياً.
   - الجداء السلمي \\vec{u} \\cdot \\vec{v} حصراً؛ يمنع استخدام الجداء الخارجي \\times غير الموجود بالمنهاج السوري.
   - كتابة المجالات المفتوحة بالصيغة السورية ]a, b[ والمغلقة [a, b].
   - كتابة حدود المجاميع بنقاط التتابع \\cdots (مثال: S_n = u_0 + u_1 + \\cdots + u_n) ويمنع استخدام رمز \\sum.
   - قواعد صياغة الأشعة الصارمة: للشعاع بحرف واحد استخدم \\vec{u} حصراً، وللشعاع بين نقطتين بحرفين استخدم \\overrightarrow{AB} حصراً.

3. ضوابط كود LaTeX ككود برمجي لا يُمس (Strict LaTeX Code Rules):
   - يمنع منعاً باتاً حذف أو إسقاط أي شرطة مائلة \\ من أي أمر LaTeX (مثل: \\frac, \\sqrt, \\lim, \\vec, \\overrightarrow, \\ln, \\exp, \\infty, \\cdot, إلخ).
   - قاعدة الدولار المفرد $ ... $ حصراً؛ يمنع منعاً باتاً استخدام $$ ... $$.
   - ترشيد \\left و \\right فقط عند الحاجة لتكبير الأقواس (كالكسور الكبيرة أو المصفوفات) مع التأكد من إغلاقها تماماً.
   - التأكد من تطابق كافة الأقواس المعقوفة { ... } وإغلاق علامات الدولار $.

4. ضوابط العناوين والوسوم والتظليل (حظر تام لكتابة عبارات التوجيه الفوقية):
   - العناوين الرئيسية باللون الأحمر: ضع نص العنوان الفعلي فقط بين نجمتين مفردتين مثل *حل الطلب الأول:* أو *دراسة تغيرات التابع:* (يُمنع منعاً باتاً كتابة عبارة "العنوان الرئيسي باللون الأحمر" أو "العنوان الرئيسي:" كنص حرفي).
   - العناوين الفرعية باللون الأزرق: ضع نص العنوان الفرعي الفعلي فقط بين نجمة وهاش مثل *#حساب المشتق:#* (يُمنع كتابة عبارة "العنوان الفرعي باللون الأزرق" أو "العنوان الفرعي:" كنص حرفي).
   - القوانين والدساتير ضمن إطار أحمر: ***القانون أو الدستور***
   - وسم التظليل **عبارة**: يُستخدم حصراً داخل الشرح لتظليل المفاهيم والمصطلحات الهامة بلون بنفسجي فاتح وبدون إطار نهائياً، ويُمنع منعاً باتاً استخدامه كعنوان فقرة أو مسألة.
   - الترقيم الدائري للخطوات: ① ② ③.
`;
  }

  /**
   * 1. Audit and Correct Mathematical Solution (حل تمرين أو مسألة)
   */
  static async auditAndCorrectSolution(
    solutionText: string,
    options?: {
      originalQuestion?: string;
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<{ text: string; wasModified: boolean; issues: ValidationIssue[] }> {
    if (!solutionText || solutionText.trim().length === 0) {
      return { text: solutionText || '', wasModified: false, issues: [] };
    }

    // Step A: Fast deterministic check
    const preRepair = ValidatorAgent.validateAndRepairLatex(solutionText);
    let workingText = preRepair.text;

    // Step B: Independent LLM Arbiter Verification
    try {
      const arbiterPrompt = `
${this.getArbiterSystemGuidelines()}

[مهمة التحكيم والتدقيق]:
لديك نص حل رياضي تم توليده بالذكاء الاصطناعي${options?.context ? ` لموضوع: "${options.context}"` : ''}.
${options?.originalQuestion ? `نص المسألة/السؤال الأصلي:\n"""${options.originalQuestion}"""\n` : ''}

نص الحل المراد تدقيقه وتصحيحه:
"""
${workingText}
"""

المطلوب منك كمحكّم مستقل:
1. افحص الحل بدقة خطوة بخطوة حسابياً ومنطقياً وعلمياً.
2. إذا وجدت أي خطأ حسابي أو منطقي أو علمي، أو خطأ في صيغ ورموز LaTeX، قم بتصحيحه فوراً.
3. تأكد من سلامة قاعدة الدولار المفرد $...$، وتفريق الأشعة (\\vec{u} لحرف واحد، \\overrightarrow{AB} لحرفين)، ومصطلح "تابع"، واستخدام الترقيم الدائري ① ② ③.
4. أعد كتابة الحل الكامل المنقح والمدقق باللغة العربية الفصيحة وبنفس أسلوب التنسيق المطلوب.
5. أعد النتيجة بصيغة JSON حصراً:
{
  "correctedSolution": "نص الحل المنقح والمدقق بالكامل...",
  "hasErrorsFixed": true,
  "summaryOfFixes": "ملخص موجز لأي تعديل أو تصحيح تم إجراؤه إن وجد"
}
`;

      const responseText = await callArbiterModel(arbiterPrompt, options?.generatorModelUsed, "application/json");
      const parsed = parseArbiterJson(responseText);

      if (parsed && typeof parsed.correctedSolution === 'string' && parsed.correctedSolution.trim().length > 10) {
        workingText = parsed.correctedSolution;
        console.log(`[Arbiter Agent] 🎯 Solution audited and refined by independent model. Summary: ${parsed.summaryOfFixes || 'Checked ok'}`);
      }
    } catch (err) {
      console.warn('[Arbiter Agent] Note: Independent model arbiter fallback to deterministic rules:', err);
    }

    // Step C: Post-repair deterministic safety net
    const postRepair = ValidatorAgent.validateAndRepairLatex(workingText);

    return {
      text: postRepair.text,
      wasModified: postRepair.text !== solutionText,
      issues: [...preRepair.issues, ...postRepair.issues]
    };
  }

  /**
   * 2. Audit and Correct Lesson Content (نص درس نظري أو شرح مفاهيمي)
   */
  static async auditAndCorrectLessonData(
    lessonData: any,
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any> {
    if (!lessonData || typeof lessonData !== 'object') {
      return lessonData;
    }

    try {
      const arbiterPrompt = `
${this.getArbiterSystemGuidelines()}

[مهمة التحكيم والتدقيق لدرس نظري]:
لديك كائن درس تم توليده بالذكاء الاصطناعي${options?.context ? ` لموضوع: "${options.context}"` : ''}.
بيانات الدرس (JSON):
${JSON.stringify(lessonData, null, 2)}

المطلوب منك كمحكّم مستقل:
1. مراجعة وتدقيق المفاهيم، المبرهنات، الشروط، التعاريف، المطبات الامتحانية، والأمثلة التوضيحية وحلولها علمياً ومنطقياً 100%.
2. تصحيح أي خطأ رياضي أو منهجي وفق المنهاج السوري (استخدام تابع بدلاً من دالة، الجداء السلمي، المجالات السورية، الأشعة \\vec{u} و \\overrightarrow{AB}).
3. التدقيق الصارم لكود LaTeX بقاعدة الدولار المفرد $...$، وتثبيت الشرطات المائلة \\.
4. التأكد من أن وسم **عبارة** لا يظهر إطلاقاً كعنوان فقرة، بل فقط لتظليل الكلمات الهامة داخل الشرح.
5. أعد كائن الـ JSON بنفس الحقول الأصلية تماماً بعد تنقيحها وتصحيحها علمياً ولغوياً وبصيغة LaTeX دقيقة.
أعد JSON فقط بدون نصوص تمهيدية.
`;

      const responseText = await callArbiterModel(arbiterPrompt, options?.generatorModelUsed, "application/json");
      const parsed = parseArbiterJson(responseText);

      if (parsed && typeof parsed === 'object') {
        lessonData = parsed;
        console.log(`[Arbiter Agent] 🎯 Lesson data audited and certified by independent arbiter.`);
      }
    } catch (err) {
      console.warn('[Arbiter Agent] Lesson arbiter LLM fallback to deterministic rules:', err);
    }

    // Deterministic pass on all text fields
    const sanitizeField = (val: any) => typeof val === 'string' ? ValidatorAgent.validateAndRepairLatex(val).text : val;

    return {
      ...lessonData,
      title: sanitizeField(lessonData.title),
      content: sanitizeField(lessonData.content),
      guidance: sanitizeField(lessonData.guidance),
      notes: sanitizeField(lessonData.notes),
      traps: sanitizeField(lessonData.traps),
      examGuidance: sanitizeField(lessonData.examGuidance),
      exampleText: sanitizeField(lessonData.exampleText),
      solutionText: sanitizeField(lessonData.solutionText),
      extraExampleText: sanitizeField(lessonData.extraExampleText),
      extraSolutionText: sanitizeField(lessonData.extraSolutionText),
    };
  }

  /**
   * 3. Audit and Correct Practice Exercises (تدرب وتطبيقات الكتاب)
   */
  static async auditAndCorrectPracticeExercises(
    exercises: any[],
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any[]> {
    if (!Array.isArray(exercises) || exercises.length === 0) {
      return exercises || [];
    }

    try {
      const arbiterPrompt = `
${this.getArbiterSystemGuidelines()}

[مهمة تدقيق وتحكيم تمارين "تدرّب"]:
لديك مصفوفة تمارين "تدرّب" وحلولها تم توليدها بالذكاء الاصطناعي${options?.context ? ` لموضوع: "${options.context}"` : ''}.
التمارين (JSON):
${JSON.stringify(exercises, null, 2)}

المطلوب منك كمحكّم مستقل:
1. فحص نص كل تمرين وفكرة واستراتيجية الحل (strategyText) والحل النموذجي الكامل (solutionText) بدقة رياضية 100%.
2. في استراتيجية وفكرة الحل (strategyText): التأكد من كتابة الفكرة العامة للتمرين وطريقة الحل بشكل موجز ومكثف (سطران إلى 4 أسطر فقط)، وليس شرحاً كاملاً أو تفصيلياً لكافة الطلبات (مكانه في solutionText).
3. تصحيح أي أخطاء حسابية أو جبرية أو منطقية في خطوات الحل والنتائج.
4. مراجعة وتصحيح كود LaTeX: قاعدة الدولار المفرد $...$، وتفريق الأشعة (\vec{u} لحرف واحد و \overrightarrow{AB} لحرفين)، ومصطلح "تابع".
5. التحقق من الترقيم الدائري للخطوات ① ② ③.
6. أعد نفس المصفوفة بنفس الحقول (title, questionText, strategyText, solutionText, svgCode) بعد التصحيح والتدقيق الكامل.
أعد JSON فقط.
`;

      const responseText = await callArbiterModel(arbiterPrompt, options?.generatorModelUsed, "application/json");
      const parsed = parseArbiterJson(responseText);

      if (Array.isArray(parsed) && parsed.length > 0) {
        exercises = parsed;
        console.log(`[Arbiter Agent] 🎯 Practice exercises audited and certified by independent arbiter (${exercises.length} items).`);
      }
    } catch (err) {
      console.warn('[Arbiter Agent] Practice exercises arbiter LLM fallback to deterministic rules:', err);
    }

    // Deterministic sanitize
    return exercises.map(ex => ({
      ...ex,
      title: typeof ex.title === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.title).text : ex.title,
      questionText: typeof ex.questionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.questionText).text : ex.questionText,
      strategyText: typeof ex.strategyText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.strategyText).text : ex.strategyText,
      solutionText: typeof ex.solutionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.solutionText).text : ex.solutionText,
    }));
  }

  /**
   * 4. Audit and Correct Unit Exercises & Problems (تمرينات ومسائل الوحدة)
   */
  static async auditAndCorrectUnitExercises(
    exercises: any[],
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any[]> {
    if (!Array.isArray(exercises) || exercises.length === 0) {
      return exercises || [];
    }

    try {
      const arbiterPrompt = `
${this.getArbiterSystemGuidelines()}

[مهمة تدقيق وتحكيم تمرينات ومسائل الوحدة]:
لديك مصفوفة تمارين ومسائل الوحدة تم استخلاصها وحلها بالذكاء الاصطناعي${options?.context ? ` للوحدة: "${options.context}"` : ''}.
بيانات التمارين (JSON):
${JSON.stringify(exercises.slice(0, 8), null, 2)}

المطلوب منك كمحكّم مستقل:
1. التدقيق العلمي والحسابي الشامل لنصوص التمارين والحلول النموذجية.
2. تصحيح أي خطأ رياضي أو منطقي في النتائج والخطوات.
3. تدقيق كود LaTeX بالكامل بقاعدة الدولار المفرد $...$، وتفريق الأشعة (\\vec{u} و \\overrightarrow{AB})، والمجالات السورية ]a, b[.
4. أعد المصفوفة المنقحة بنفس الهيكلية تماماً.
أعد JSON فقط.
`;

      const responseText = await callArbiterModel(arbiterPrompt, options?.generatorModelUsed, "application/json");
      const parsed = parseArbiterJson(responseText);

      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge verified items
        exercises = parsed.concat(exercises.slice(parsed.length));
        console.log(`[Arbiter Agent] 🎯 Unit exercises audited by independent arbiter.`);
      }
    } catch (err) {
      console.warn('[Arbiter Agent] Unit exercises arbiter LLM fallback to deterministic rules:', err);
    }

    return exercises.map(ex => ({
      ...ex,
      title: typeof ex.title === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.title).text : ex.title,
      questionText: typeof ex.questionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.questionText).text : ex.questionText,
      solutionText: typeof ex.solutionText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.solutionText).text : ex.solutionText,
      mainText: typeof ex.mainText === 'string' ? ValidatorAgent.validateAndRepairLatex(ex.mainText).text : ex.mainText,
    }));
  }

  /**
   * 5. Audit and Correct Comprehensive Unit Review (مراجعة شاملة للوحدة)
   */
  static async auditAndCorrectUnitReview(
    reviewData: any,
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any> {
    if (!reviewData || typeof reviewData !== 'object') {
      return reviewData;
    }

    try {
      const arbiterPrompt = `
${this.getArbiterSystemGuidelines()}

[مهمة تدقيق وتحكيم المراجعة الشاملة للوحدة]:
المراجعة الشاملة المعتمدة للوحدة (JSON):
${JSON.stringify(reviewData, null, 2)}

المطلوب منك كمحكّم مستقل:
1. فحص وتدقيق التعاريف (definitions)، المبرهنات والشروط (theorems)، والمطبات الامتحانية وتصويباتها (examTraps) بدقة 100%.
2. تصحيح أي عبارة غير دقيقة أو خطأ في صيغ LaTeX الرياضية بقاعدة الدولار المفرد $...$.
3. التحقق من توافق المبرهنات ومصطلحاتها مع المنهاج السوري للثالث الثانوي العلمي.
4. أعد كائن الـ JSON بنفس الحقول بعد التدقيق والتصحيح.
أعد JSON فقط.
`;

      const responseText = await callArbiterModel(arbiterPrompt, options?.generatorModelUsed, "application/json");
      const parsed = parseArbiterJson(responseText);

      if (parsed && typeof parsed === 'object') {
        reviewData = parsed;
        console.log(`[Arbiter Agent] 🎯 Unit review audited by independent arbiter.`);
      }
    } catch (err) {
      console.warn('[Arbiter Agent] Unit review arbiter LLM fallback to deterministic rules:', err);
    }

    return reviewData;
  }

  /**
   * 6. Audit and Correct Questions / MCQs / Quizzes (اختبارات، بنوك أسئلة، أسئلة موجهة)
   */
  static async auditAndCorrectQuestionSet(
    questions: any[],
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any[]> {
    if (!Array.isArray(questions) || questions.length === 0) {
      return questions || [];
    }

    try {
      const arbiterPrompt = `
${this.getArbiterSystemGuidelines()}

[مهمة تدقيق وتحكيم بنك أو اختبار الأسئلة]:
الأسئلة والخيارات (JSON):
${JSON.stringify(questions, null, 2)}

المطلوب منك كمحكّم مستقل:
1. التأكد من الصحة الرياضية بنسبة 100% للسؤال ولكل خيار وللإجابة الصحيحة المحددة.
2. التأكد من خلو الخيارات من التكرار وأن الإجابة الصحيحة وحيدة وصائبة رياضياً تماماً.
3. فحص وتصحيح تشخيص الأخطاء المفاهيمية (misconceptionDiagnosis) لكل خيار خاطئ.
4. تدقيق كود LaTeX في نصوص الأسئلة والخيارات بقاعدة الدولار المفرد $...$.
5. أعد المصفوفة بنفس الحقول بعد التدقيق.
أعد JSON فقط.
`;

      const responseText = await callArbiterModel(arbiterPrompt, options?.generatorModelUsed, "application/json");
      const parsed = parseArbiterJson(responseText);

      if (Array.isArray(parsed) && parsed.length > 0) {
        questions = parsed;
        console.log(`[Arbiter Agent] 🎯 Question set audited by independent arbiter (${questions.length} items).`);
      }
    } catch (err) {
      console.warn('[Arbiter Agent] Question set arbiter LLM fallback to deterministic rules:', err);
    }

    return questions.map(q => ({
      ...q,
      questionText: typeof q.questionText === 'string' ? ValidatorAgent.validateAndRepairLatex(q.questionText).text : q.questionText,
      options: Array.isArray(q.options) ? q.options.map((opt: any) => ({
        ...opt,
        text: typeof opt.text === 'string' ? ValidatorAgent.validateAndRepairLatex(opt.text).text : opt.text,
        misconceptionDiagnosis: typeof opt.misconceptionDiagnosis === 'string'
          ? ValidatorAgent.validateAndRepairLatex(opt.misconceptionDiagnosis).text
          : opt.misconceptionDiagnosis
      })) : q.options,
    }));
  }

  /**
   * 7. Audit and Correct Question Bank Items (أسئلة بنك الأسئلة - اختيار من متعدد والمسائل المقالية)
   * يقوم بتدقيق الصياغة وكود LaTeX وحلول المسائل علمياً ومنطقياً 100% قبل العرض أو الإضافة.
   */
  static async auditAndCorrectQuestionBankItems<T extends any>(
    items: T[],
    options?: {
      unitTitle?: string;
      generatorModelUsed?: string;
    }
  ): Promise<T[]> {
    if (!Array.isArray(items) || items.length === 0) {
      return items || [];
    }

    // Phase 1: Fast deterministic pre-cleaning
    const workingItems = items.map(item => ValidatorAgent.validateAndRepairQuestionBankItem(item));

    // Phase 2: Independent Model Deep Mathematical & LaTeX Audit in chunks
    const CHUNK_SIZE = 5;
    const auditedList: T[] = [];

    for (let i = 0; i < workingItems.length; i += CHUNK_SIZE) {
      const chunk = workingItems.slice(i, i + CHUNK_SIZE);
      try {
        const arbiterPrompt = `
${this.getArbiterSystemGuidelines()}

[مهمة تدقيق وتحكيم أسئلة بنك الأسئلة - تدقيق الصياغة و LaTeX والحلول]:
الوحدة الدراسية: "${options?.unitTitle || 'الرياضيات - الثالث الثانوي العلمي'}"

قائمة الأسئلة والخيارات والحلول النموذجية المراد تحكيمها (JSON):
${JSON.stringify(chunk, null, 2)}

المطلوب منك بصفتك الوكيل المحكّم والمدقق العلمي والرياضي المستقل (Layer 4 Critic & LaTeX Verifier):
1. التدقيق الرياضي والمنطقي 100% للصياغة والحل:
   - افحص نص كل سؤال بدقة وتأكد من سلامة المعطيات الرياضية والصياغة العلمية.
   - افحص الحل النموذجي (solution) خطوة بخطوة حسابياً وجبرياً وهندسياً. إذا كان هناك أي خطأ في الحساب أو الإشارة أو التبسيط أو النتيجة، صححه فوراً.
   - في أسئلة الاختيار من متعدد: تأكد بنسبة 100% أن الخيار المحدد كإجابة صحيحة (correctIndex أو correct_index) يطابق النتيجة الرياضية الصحيحة تماماً. إذا كان الخيار الصحيح في موقع مختلف، صحح قيمة correctIndex أو عدل نصوص الخيارات (subParts).
   - في الأسئلة المقالية والتمارين: نسق الحل بترقيم دائري للخطوات ① ② ③ ④ مع إبراز النتيجة.

2. التدقيق الصارم لكود LaTeX ككود برمجي مقدّس لا يُمس:
   - قاعدة الدولار المفرد $...$ حصراً لكافة الرموز والمعادلات الرياضية (يُمنع منعاً باتاً استخدام $$...$$).
   - يُمنع منعاً باتاً حذف أو إسقاط أي شرطة مائلة من أوامر LaTeX (مثل: \\frac, \\sqrt, \\lim, \\to, \\ln, \\exp, \\infty, \\cdot, \\vec, \\overrightarrow, \\alpha, \\beta, \\pi, \\Delta).
   - للأشعة بحرف واحد: \\vec{u} حصراً (أو \\vec{v}, \\vec{n})، وللشعاع بحرفين: \\overrightarrow{AB} حصراً.
   - أخرج الكلمات والجمل العربية خارج علامات $...$ وتأكد من إغلاق كل علامات الدولار $ والأقواس {}.

3. المنهاج السوري:
   - استخدام مصطلح "تابع" (وتوابعه) حصراً ومنع كلمة "دالة" نهائياً.
   - الجداء السلمي \\vec{u} \\cdot \\vec{v} حصراً؛ حظر الجداء الشعاعي الخارجي وحظر رمز \\sum للمجاميع واستبداله بنقاط التتابع \\cdots.
   - المجالات السورية المفتوحة ]a, b[ والمغلقة [a, b].

أعد مصفوفة JSON بنفس الحقول الأصلية تماماً لكل سؤال (id, question, subParts, solution, correctIndex, correct_index, difficulty, topic, aiGuidance, type) بعد التدقيق والتصحيح.
أعد JSON فقط دون أي نصوص أخرى.
`;

        const responseText = await callArbiterModel(
          arbiterPrompt,
          options?.generatorModelUsed,
          "application/json"
        );

        let parsed: any[] | null = null;
        try {
          parsed = safeParseJson<any[]>(responseText);
        } catch {
          parsed = parseArbiterJson(responseText);
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          chunk.forEach((orig, idx) => {
            const p = parsed![idx] || parsed!.find((item: any) => item.id === (orig as any).id);
            if (p) {
              auditedList.push(ValidatorAgent.validateAndRepairQuestionBankItem<any>({
                ...(orig as Record<string, any>),
                question: p.question || (orig as any).question,
                subParts: Array.isArray(p.subParts) ? p.subParts : (orig as any).subParts,
                solution: p.solution || (orig as any).solution,
                correctIndex: p.correctIndex !== undefined ? p.correctIndex : (orig as any).correctIndex,
                correct_index: p.correct_index !== undefined ? p.correct_index : (orig as any).correct_index,
                topic: p.topic || (orig as any).topic,
                difficulty: p.difficulty || (orig as any).difficulty,
                aiGuidance: p.aiGuidance || (orig as any).aiGuidance,
              }));
            } else {
              auditedList.push(ValidatorAgent.validateAndRepairQuestionBankItem(orig));
            }
          });
          console.log(`[Arbiter Agent] 🎯 Question bank items chunk audited by independent arbiter (${chunk.length} items).`);
        } else {
          chunk.forEach(item => auditedList.push(ValidatorAgent.validateAndRepairQuestionBankItem(item)));
        }
      } catch (err) {
        console.warn('[Arbiter Agent] Question bank chunk fallback to deterministic rules:', err);
        chunk.forEach(item => auditedList.push(ValidatorAgent.validateAndRepairQuestionBankItem(item)));
      }
    }

    return auditedList.length > 0 ? auditedList : workingItems;
  }
}

