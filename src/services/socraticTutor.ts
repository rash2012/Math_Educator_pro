import { cleanJson, generateWithFallback, MODELS_FALLBACK } from './gemini';
import { globalOrchestrator } from './multiAgent';

export interface SocraticOption {
  id: string;
  text: string;
  isCorrect: boolean;
  feedback: string;
}

export type SocraticMode = 'lesson_first_concept' | 'illustrative_example' | 'next_concepts' | 'free_question';

export interface SocraticTurnResponse {
  message: string;
  options: SocraticOption[];
  stepHint?: string;
  isConceptMastered?: boolean;
  stepIndex: number;
  totalSteps: number;
  pedagogicalStage: 'diagnosis' | 'guided_question' | 'step_scaffolding' | 'reinforcement' | 'mastery';
  canShowActionButtons?: boolean;
}

export interface SocraticContext {
  sectionTitle: string;
  sectionContent: string;
  unitTitle: string;
  grade?: string;
  subject?: string;
  guidance?: string;
  traps?: string;
  notes?: string;
}

export interface SocraticMessageItem {
  id: string;
  sender: 'student' | 'tutor';
  text: string;
  options?: SocraticOption[];
  selectedOptionId?: string;
  isCorrectSelection?: boolean;
  feedback?: string;
  hint?: string;
  stepIndex?: number;
  mode?: SocraticMode;
  timestamp: number;
}

export const SOCRATIC_QUICK_PROMPTS = [
  {
    id: 'first_concept',
    label: '🎯 استكشاف المفهوم والمبرهنة الأساسية في الدرس',
    prompt: 'اشرح لي المفهوم أو المبرهنة الأولى في هذا الدرس خطوة بخطوة عبر أسئلة موجهة.'
  },
  {
    id: 'explain_condition',
    label: '💡 شروط انطلاق المبرهنة وتطبيقها',
    prompt: 'ما هي الشروط الرياضية الدقيقة لتطبيق هذه القاعدة في المنهاج السوري؟ وجهني بسؤال تفاعلي.'
  },
  {
    id: 'exam_trap',
    label: '⚠️ الفخ والمطب الامتحاني الأكثر شيوعاً',
    prompt: 'ما هي أكثر الأخطاء والمطبات الامتحانية شيوعاً في هذه الفقرة، واختبرني بسؤال تفاعلي.'
  }
];

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function askSocraticTutorAI(
  userInput: string,
  context: SocraticContext,
  history: SocraticMessageItem[] = [],
  selectedOption?: SocraticOption,
  stepIndex: number = 1,
  mode: SocraticMode = 'lesson_first_concept'
): Promise<SocraticTurnResponse> {
  const historyText = history.slice(-6).map(h => {
    return `${h.sender === 'student' ? 'الطالب' : 'المعلم السقراطي'}: ${h.text}${h.selectedOptionId ? ` (اختار الطالب الخيار: ${h.options?.find(o => o.id === h.selectedOptionId)?.text})` : ''}`;
  }).join('\n');

  const isFinalStep = stepIndex >= 4;

  let modeDirective = '';
  if (mode === 'lesson_first_concept') {
    modeDirective = `نمط التفاعل: [استكشاف الدرس النشط - المفهوم الأول/الفكرة الكبرى].
- ركز حصراً على أول فقرة أو تعريف أو مبرهنة أساسية في الدرس النشط ("${context.sectionTitle}").
- التدرج محدد بـ 4 أسئلة موجهة كحد أقصى (الخطوة الحالية: ${stepIndex} من 4).
${isFinalStep ? '- هذه هي الخطوة الرابعة والأخيرة لتثبيت المفهوم، لخص الفكرة وأعلن إتقان المفهوم بنجاح.' : ''}`;
  } else if (mode === 'illustrative_example') {
    modeDirective = `نمط التفاعل: [توليد ودراسة مثال توضيحي].
- قدم مثالاً توضيحياً تطبيقياً مباشراً للمفهوم السابق المشروح في ("${context.sectionTitle}").
- قد الطالب عبر 4 خطوات/أسئلة موجهة لحل هذا المثال (الخطوة الحالية: ${stepIndex} من 4).
${isFinalStep ? '- هذه هي الخطوة الرابعة والأخيرة للمثال، لخص النتيجة وخلاصة الحل.' : ''}`;
  } else if (mode === 'next_concepts') {
    modeDirective = `نمط التفاعل: [متابعة شرح الفقرات والمفاهيم التالية في الدرس].
- انتقل للمفهوم أو المبرهنة التالية في الدرس ("${context.sectionTitle}").
- اتبع نفس المنهجية (4 أسئلة موجهة، الخطوة الحالية: ${stepIndex} من 4).
${isFinalStep ? '- الخطوة الرابعة والأخيرة لهذه الفقرة.' : ''}`;
  } else {
    // free_question
    modeDirective = `نمط التفاعل: [سؤال حر مباشر من الطالب].
- وجه أسئلة موجهة حول استفسار الطالب "${userInput}" خطوة بخطوة للوصول إلى النتيجة (الخطوة الحالية: ${stepIndex} من 4).
- ذكّر الطالب إذا كان هناك أكثر من طريقة رياضية لحل السؤال، سواء من الدرس الحالي أو من وحدات ودروس أخرى في المنهاج.
${isFinalStep ? '- الخطوة الرابعة والأخيرة للوصول إلى النتيجة النهائية.' : ''}`;
  }

  const basePrompt = `أنت "المعلم السقراطي الذكي" (Scaffolded Socratic AI Tutor) لمادة الرياضيات وفق المنهاج السوري للثالث الثانوي العلمي.
مهمتك التعليمية: قيادة الطالب تدريجياً ليفهم ويستنتج بنفسه عبر الحوار السقراطي الذكي المؤتمت بالخيارات، دون إعطائه الحل المباشر كاملاً دفعة واحدة.

${modeDirective}

[سياق الدرس والفقرة الحالية]:
- الوحدة: ${context.unitTitle}
- عنوان الفقرة: ${context.sectionTitle}
- الصف: ${context.grade || 'الثالث الثانوي العلمي'} | المادة: ${context.subject || 'الرياضيات'}
- محتوى الفقرة النظري:
${context.sectionContent || 'لا يوجد محتوى إضافي'}
${context.guidance ? `- توجيهات وإرشادات: ${context.guidance}` : ''}
${context.traps ? `- مطبات وأفخاخ امتحانية: ${context.traps}` : ''}
${context.notes ? `- ملاحظات هامة: ${context.notes}` : ''}

[سجل الحوار الأخير]:
${historyText || 'بداية الحوار السقراطي.'}

${selectedOption ? `[إجراء الطالب الأخير]: اختار الطالب الخيار (${selectedOption.text}) والذي كانت نتيجته: ${selectedOption.isCorrect ? 'صحيح ✓' : 'خاطئ ✗'}.` : `[سؤال/طلب الطالب]: "${userInput}"`}

[المعايير البيداغوجية والرياضية الإلزامية]:
1. أسلوب التدريس السقراطي المؤتمت:
   - الخطوة الحالية: ${stepIndex} من أصل 4 خطوات قصوى.
   - إذا سأل الطالب سؤالاً: اشرح الفكرة المحورية باختصار تشويقي (فقرة واحدة مركزة)، ثم اطرح سؤالاً تفكيرياً يقوده للخطوة التالية.
   - إذا اختار الطالب إجابة صحيحة: عزز إجابته وأثنِ عليه بعبارة إيجابية قصيرة وذكية، ثم اطرح الخطوة المتقدمة التالية ${isFinalStep ? '(أو خلاصة الإتقان إذا كانت الخطوة 4)' : ''}.
   - إذا اختار الطالب إجابة خاطئة: شخص سبب الخطأ بلطف ودقة (Misconception Diagnosis)، وقدم تلميحاً مركزاً، ثم اطرح عليه سؤالاً أبسط أو خيارات واضحة لتصحيح المفهوم.
2. الخيارات التفاعلية (Options Array):
   - يجب دوماً إرفاق قائمة بالخيارات (3 إلى 4 خيارات، أو خيارين صح/خطأ).
   - خيار واحد فقط يجب أن يكون الصحيح (isCorrect: true)، والخيارات الأخرى خاطئة مع توضيح سبب الخطأ في feedback.
   - هام: قم بصياغة خيارات متنوعة ومشتتات دقيقة.
3. التوافق الصارم مع المنهاج السوري:
   - استخدم كلمة "تابع" حصراً ويُمنع منعاً باتاً استخدام كلمة "دالة".
   - كتابة كافة المعادلات والرموز الرياضية بصيغة LaTeX داخل علامات الدولار المفردة '$...$' حصراً. يُمنع منعاً باتاً استخدام '$$'.
   - حظر المبرهنات الجامعية خارج المنهاج (مثل قاعدة لوبيتال).
   - الرموز المعتمدة: الجداء السلمي '\\cdot' فقط (لا يوجد جداء خارجي).

[المطلوب]: أرجع كائن JSON بالهيكل التالي حصراً:
{
  "message": "رسالة المعلم السقراطي متضمنة الشرح/التعزيز/التصحيح، والسؤال التفكيري القادم بصيغة $...$",
  "options": [
    {
      "id": "opt_1",
      "text": "نص الخيار بصيغة LaTeX $...$",
      "isCorrect": true,
      "feedback": "تفسير دقيق للتعزيز أو التصحيح"
    },
    {
      "id": "opt_2",
      "text": "نص الخيار الثاني",
      "isCorrect": false,
      "feedback": "تشخيص الفخ أو الخطأ"
    },
    {
      "id": "opt_3",
      "text": "نص الخيار الثالث",
      "isCorrect": false,
      "feedback": "تشخيص الفخ"
    },
    {
      "id": "opt_4",
      "text": "نص الخيار الرابع",
      "isCorrect": false,
      "feedback": "تشخيص الفخ"
    }
  ],
  "stepHint": "تلميح بيداغوجي إضافي إذا عجز الطالب عن الإجابة",
  "pedagogicalStage": "${isFinalStep ? 'mastery' : 'guided_question'}",
  "isConceptMastered": ${isFinalStep ? 'true' : 'false'}
}`;

  const enrichedPrompt = globalOrchestrator.buildEnrichedPrompt(basePrompt, context.unitTitle);

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: enrichedPrompt,
    config: {
      temperature: 0.25,
      responseMimeType: "application/json"
    }
  });

  const parsed = cleanJson(response.text || "{}");

  // Validate LaTeX and single dollar rule
  const validatedMessage = globalOrchestrator.validateMathSolution(
    parsed.message || "أهلاً بك يا بطل الرياضيات! لنبدأ التفكير معاً في هذا المفهوم.",
    context.sectionTitle
  );
  
  let rawOptions: SocraticOption[] = Array.isArray(parsed.options) && parsed.options.length > 0
    ? parsed.options.map((opt: any, idx: number) => {
        const valText = globalOrchestrator.validateMathSolution(opt.text || `خيار ${idx + 1}`);
        const valFeedback = globalOrchestrator.validateMathSolution(opt.feedback || '');
        return {
          id: opt.id || `opt_${idx + 1}`,
          text: valText.text,
          isCorrect: Boolean(opt.isCorrect),
          feedback: valFeedback.text
        };
      })
    : [
        { id: 'opt_1', text: 'نعم، الشروط محققة تماماً', isCorrect: true, feedback: 'إجابة صحيحة ومتقنة!' },
        { id: 'opt_2', text: 'لا، هناك شرط غير مستوفٍ', isCorrect: false, feedback: 'تأكد من مجموعة التعريف واستمرار التابع أولاً.' }
      ];

  // Guarantee at least one correct option
  if (!rawOptions.some((o: SocraticOption) => o.isCorrect)) {
    rawOptions[0].isCorrect = true;
  }

  // 🎲 CRITICAL: Randomize option order so correct answer is NOT always first!
  const randomizedOptions = shuffleArray(rawOptions);

  const isMastered = Boolean(parsed.isConceptMastered) || isFinalStep;

  return {
    message: validatedMessage.text,
    options: randomizedOptions,
    stepHint: parsed.stepHint ? globalOrchestrator.validateMathSolution(parsed.stepHint).text : undefined,
    pedagogicalStage: isMastered ? 'mastery' : (parsed.pedagogicalStage || 'guided_question'),
    isConceptMastered: isMastered,
    stepIndex,
    totalSteps: 4,
    canShowActionButtons: isMastered
  };
}
