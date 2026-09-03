import { MODELS_FALLBACK, generateWithFallback, cleanJson } from './gemini';
import { globalOrchestrator } from './multiAgent';
import type { ClassifiedFamilyData, ClassifiedExercise, ClassifiedStation } from '../db/exerciseFamiliesRPC';

export interface RawUnitExerciseInput {
  id: string;
  title: string;
  questionText: string;
  solutionText?: string;
  strategyText?: string;
  svgCode?: string;
}

export interface ClassificationProgressCallback {
  (phase: 'classifying' | 'generating_stations' | 'finalizing', message: string, progress: number): void;
}

function shuffleChoices<T extends { isCorrect: boolean }>(array: T[]): {
  choices: T[];
  correctChoiceIndex: number;
  shuffled: T[];
  correctIndex: number;
} {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const correctIndex = shuffled.findIndex(item => item.isCorrect);
  const finalIdx = correctIndex >= 0 ? correctIndex : 0;
  return {
    choices: shuffled,
    correctChoiceIndex: finalIdx,
    shuffled,
    correctIndex: finalIdx
  };
}

/**
 * 🔀 AI Engine for Exercise Family Classification & 4-Station Guided Solution Generation
 */
export async function classifyAndGenerateExerciseFamiliesAI(
  docId: number,
  unitTitle: string,
  exercises: RawUnitExerciseInput[],
  onProgress?: ClassificationProgressCallback
): Promise<ClassifiedFamilyData[]> {
  if (!exercises || exercises.length === 0) {
    throw new Error('لا توجد تمارين متاحة للتحليل والتصنيف في هذه الوحدة.');
  }

  // Phase 1: Classification & Lead Exercise Identification
  if (onProgress) {
    onProgress('classifying', `جاري تحليل وتصنيف ${exercises.length} تمريناً في عائلات مفاهيمية متجانسة...`, 20);
  }

  const exercisesFormatted = exercises.map((ex, idx) => {
    return `### تمرين [${idx + 1}] (المعرف: ${ex.id}):
العنوان: ${ex.title}
نص التمرين:
${ex.questionText}
${ex.strategyText ? `استراتيجية وفكرة الحل: ${ex.strategyText}\n` : ''}
${ex.solutionText ? `الحل المتاح: ${ex.solutionText}\n` : ''}`;
  }).join('\n\n---\n\n');

  const classificationPrompt = `أنت خبير تربوي وموجّه أول لمادة الرياضيات في الجمهورية العربية السورية (الثالث الثانوي العلمي - بكالوريا).
مهمتك: تصنيف تمارين الوحدة التالية (${unitTitle}) إلى "عائلات مفاهيمية متجانسة" (Exercise Families) وتحديد "التمرين القائد" (Lead Exercise ⭐) لكل عائلة.

قواعد المنهاج السوري وقواعد LaTeX الصارمة:
1. لا تُنشئ أي مفهوم أو مصطلح رياضي غير موجود حرفياً في نصوص التمارين المُدخَلة.
2. حظر كلمة "دالة" (استبدلها بـ "تابع").
3. حظر رمز "\\sum" للمجاميع للمتتاليات (استخدم نقاط التتابع \\dots أو \\cdots).
4. حظر الجداء الخارجي للأشعة (المعتمد هو الجداء السلمي فقط).
5. قواعد LaTeX الصارمة:
   - عرّف LaTeX ككود برمجي لا يُمس، واحرص على كتابة الأوامر كاملة دون حذف الشرطة المائلة '\\' (مثل \\frac, \\sqrt, \\lim, إلخ).
   - حظر استخدام \\right و \\left: يُمنع استخدام \\right أو \\left، وتُكتب الأقواس والحواصر بصيغتها المباشرة ( ... ) و [ ... ] و | ... | و \\{ ... \\}.
   - للشعاع بحرف واحد: استخدم فقط \\vec{u} (مثل \\vec{u}, \\vec{v}).
   - للشعاع بين نقطتين: استخدم فقط \\overrightarrow{AB} (مثل \\overrightarrow{AB}, \\overrightarrow{CD}).
   - صياغة LaTeX بمحددات الدولار المفردة '$...$' فقط.
   - افحص كل معادلة وصيغة قبل إخراجها.

بيانات تمارين الوحدة (${exercises.length} تمرين):
${exercisesFormatted}

المطلوب بدقة متناهية:
1. تجميع التمارين في عائلات حسب المفهوم الأساسي المشترك (primary_concept واحد إلزامي لكل تمرين يحدد عائلته).
2. تحديد مفاهيم ثانوية فرعية (secondary_concepts مصفوفة نصوص) إن وجدت في المعطيات (دون تغيير عائلة التمرين الأساسية).
3. اختيار "التمرين القائد ⭐" (lead_exercise_id) لكل عائلة وفق المعيارين التاليين بالترتيب:
   - الأولوية أ: التمرين الذي يمتلك حلاً كاملاً واستراتيجية واضحة ومفاهيم شاملة.
   - الأولوية ب: التمرين الأقدم تسلسلاً في الوحدة.
4. إرجاع النتيجة بصيغة JSON حصراً بالشكل التالي:
{
  "families": [
    {
      "family_name": "اسم العائلة المعبر عن الفكرة المشتركة",
      "target_concepts": ["مفهوم 1", "مفهوم 2"],
      "lead_exercise_id": "معرف التمرين القائد من التمارين المدخلة",
      "exercise_assignments": [
        {
          "exercise_id": "معرف التمرين",
          "primary_concept": "المفهوم الأساسي",
          "secondary_concepts": ["مفهوم فرعي 1"]
        }
      ]
    }
  ]
}
`;

  const classResp = await generateWithFallback(MODELS_FALLBACK, {
    contents: classificationPrompt,
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  });

  const parsedClass = cleanJson(classResp.text || '{}');
  const rawFamilies = Array.isArray(parsedClass.families) ? parsedClass.families : [];

  if (rawFamilies.length === 0) {
    throw new Error('لم ينجح تصنيف العائلات. يرجى التأكد من التمارين وإعادة المحاولة.');
  }

  // Phase 2: Generation of 4 Stations with Interactive Choices for every non-lead exercise
  if (onProgress) {
    onProgress('generating_stations', 'جاري توليد محطات الحل الموجّه الأربع والخيارات التفاعلية للتمارين...', 50);
  }

  const resultFamilies: ClassifiedFamilyData[] = [];
  const exerciseMap = new Map<string, RawUnitExerciseInput>(exercises.map(e => [e.id, e]));
  const totalFamilies = rawFamilies.length;

  for (let fIdx = 0; fIdx < rawFamilies.length; fIdx++) {
    const rawFam = rawFamilies[fIdx];
    const famName = rawFam.family_name || `عائلة التمارين ${fIdx + 1}`;
    const targetConcepts = Array.isArray(rawFam.target_concepts) ? rawFam.target_concepts : [];

    const assignedExs: ClassifiedExercise[] = [];
    const rawAssignments = Array.isArray(rawFam.exercise_assignments) ? rawFam.exercise_assignments : [];

    for (const assign of rawAssignments) {
      const orig = exerciseMap.get(assign.exercise_id);
      if (orig) {
        const isLead = orig.id === rawFam.lead_exercise_id;
        assignedExs.push({
          id: orig.id,
          title: orig.title,
          questionText: orig.questionText,
          solutionText: orig.solutionText,
          strategyText: orig.strategyText,
          svgCode: orig.svgCode,
          isLeadExercise: isLead,
          primaryConcept: assign.primary_concept || famName,
          secondaryConcepts: Array.isArray(assign.secondary_concepts) ? assign.secondary_concepts : [],
          stations: []
        });
      }
    }

    // Guarantee lead exercise
    let leadId = rawFam.lead_exercise_id;
    if (!assignedExs.some(e => e.id === leadId) && assignedExs.length > 0) {
      leadId = assignedExs[0].id;
      assignedExs[0].isLeadExercise = true;
    }

    // Generate stations for all non-lead exercises in this family
    const nonLeadExercises = assignedExs.filter(e => !e.isLeadExercise);

    if (nonLeadExercises.length > 0) {
      if (onProgress) {
        const pct = Math.round(50 + ((fIdx + 1) / totalFamilies) * 40);
        onProgress('generating_stations', `توليد محطات الحل والخيارات لعائلة: "${famName}" (${fIdx + 1}/${totalFamilies})...`, pct);
      }

      const stationsPrompt = `أنت خبير تربوي في الرياضيات (المنهاج السوري للبكالوريا).
مهمتك: توليد منظومة المحطات الأربع للحل الموجّه (4-Station Guided Solution) مع خيارات تفاعلية ومشتتات دقيقة لكل محطة لتمارين عائلة "${famName}".

العائلة المفاهيمية: ${famName}
المفاهيم المستهدفة: ${targetConcepts.join(' - ')}

التمارين غير القائدة المطلوب توليد محطاتها الأربع (${nonLeadExercises.length} تمرين):
${nonLeadExercises.map((ne, i) => `### [تمرين ${i + 1}] ID: ${ne.id} - ${ne.title}
نص المسألة:
${ne.questionText}
${ne.solutionText ? `الحل المعتمد: ${ne.solutionText}` : ''}
`).join('\n---\n')}

المطلوب لكل تمرين توليد 4 محطات متسلسلة، ويجب أن تحتوي **كل محطة من المحطات الأربع** على:
1. سؤال موجه (question_text).
2. قائمة إجابات مقترحة (choices: نمط مختلط وذكي: إما خيارين صح/خطأ أو 3-4 خيارات حسب طبيعة السؤال وسياق المحطة)، مع خيار واحد صحيح (isCorrect: true) والبقية مشتتات مع تشخيص دقيق للخطأ (misconceptionDiagnosis).
3. تلميحات مفاهيمية متدرجة (hint_level1, hint_level2, skip_explanation, concept_map).

المحطات الأربع:
- المحطة 1: الاستكشاف وتشخيص النمط والمعطيات.
- المحطة 2: اختيار الأداة والقانون المنطلق.
- المحطة 3: الخطوة التنفيذية والتحويل الجبري المفصلي الأول.
- المحطة 4: الناتج النهائي والخلاصة الرياضية.

قواعد وضوابط إلزامية:
- الإيجاز والاختصار الشديد: يجب أن تكون الإجابات والخيارات والأسئلة التوضيحية والتلميحات موجزة ومختصرة ومباشرة دون حشو لفظي لتوفير تركيز بصري وسرعة استيعاب.
- صياغة LaTeX بمحددات '$...$' مفردة حصراً (يُمنع منعاً باتاً استخدام '$$').
- قواعد LaTeX الصارمة: عرّف LaTeX ككود لا يُمس واكتب الأوامر كاملة دون حذف الشرطات المائلة '\\' (مثل \\frac, \\sqrt, \\lim, إلخ).
- حظر استخدام \\right و \\left: يُمنع استخدام \\right أو \\left، وتُكتب الأقواس والحواصر بصيغتها المباشرة ( ... ) و [ ... ] و | ... | و \\{ ... \\}.
- للشعاع بحرف واحد: \\vec{u} حصراً، وللشعاع بحرفين بين نقطتين: \\overrightarrow{AB} حصراً.
- فحص وتدقيق كل معادلة والتأكد من صحتها الحسابية قبل الإخراج.
- مصطلحات سورية دقيقة ("تابع" بدلاً من "دالة"، حظر الجداء الخارجي وحظر \\sum للمجاميع).
- إرجاع JSON صالح كالتالي:
{
  "exercises_stations": [
    {
      "exercise_id": "معرف التمرين المطابق لـ ID",
      "stations": [
        {
          "station_order": 1,
          "title": "المحطة الأولى: الاستكشاف وتشخيص النمط",
          "question_text": "السؤال الموجه للمحطة 1",
          "choices": [
            { "text": "نص الخيار الصحيح", "isCorrect": true, "misconceptionDiagnosis": "إجابة دقيقة وصحيحة ✅" },
            { "text": "نص خيار خاطئ", "isCorrect": false, "misconceptionDiagnosis": "تشخيص سبب الخطأ أو الفخ" },
            { "text": "نص خيار خاطئ ثانٍ", "isCorrect": false, "misconceptionDiagnosis": "تشخيص الخطأ" }
          ],
          "hint_level1": "تلميح عام",
          "hint_level2": "تلميح مركز",
          "skip_explanation": "شرح التخطي",
          "concept_map": "المسار المفاهيمي"
        },
        {
          "station_order": 2,
          "title": "المحطة الثانية: اختيار الأداة والقانون المنطلق",
          "question_text": "السؤال الموجه للمحطة 2",
          "choices": [
            { "text": "...", "isCorrect": true, "misconceptionDiagnosis": "صحيح ✅" },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
          ],
          "hint_level1": "...",
          "hint_level2": "...",
          "skip_explanation": "...",
          "concept_map": "..."
        },
        {
          "station_order": 3,
          "title": "المحطة الثالثة: الخطوة التنفيذية المفصلية",
          "question_text": "السؤال الموجه للمحطة 3",
          "choices": [
            { "text": "...", "isCorrect": true, "misconceptionDiagnosis": "صحيح ✅" },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
          ],
          "hint_level1": "...",
          "hint_level2": "...",
          "skip_explanation": "...",
          "concept_map": "..."
        },
        {
          "station_order": 4,
          "title": "المحطة الرابعة: الناتج النهائي والخلاصة الرياضية",
          "question_text": "ما هو الناتج النهائي الدقيق؟",
          "choices": [
            { "text": "...", "isCorrect": true, "misconceptionDiagnosis": "إجابة دقيقة وصحيحة ✅" },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
          ],
          "hint_level1": "...",
          "hint_level2": "...",
          "skip_explanation": "...",
          "concept_map": "..."
        }
      ]
    }
  ]
}
`;

      try {
        const stationsResp = await generateWithFallback(MODELS_FALLBACK, {
          contents: stationsPrompt,
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        });

        const parsedStations = cleanJson(stationsResp.text || '{}');
        const stList = Array.isArray(parsedStations.exercises_stations) ? parsedStations.exercises_stations : [];

        for (const stItem of stList) {
          const targetEx = assignedExs.find(e => e.id === stItem.exercise_id);
          if (targetEx && Array.isArray(stItem.stations)) {
            targetEx.stations = stItem.stations.map((st: any) => {
              const rawChoices = Array.isArray(st.choices)
                ? st.choices.map((c: any, cIdx: number) => ({
                    id: c.id || `c_${st.station_order}_${cIdx}`,
                    text: globalOrchestrator.validateMathSolution(c.text || '').text,
                    isCorrect: Boolean(c.isCorrect),
                    misconceptionDiagnosis: c.misconceptionDiagnosis
                      ? globalOrchestrator.validateMathSolution(c.misconceptionDiagnosis).text
                      : undefined
                  }))
                : [];

              if (rawChoices.length > 0 && !rawChoices.some(c => c.isCorrect)) {
                rawChoices[0].isCorrect = true;
              }

              const { shuffled, correctIndex } = rawChoices.length > 0
                ? shuffleChoices(rawChoices)
                : { shuffled: [], correctIndex: 0 };

              return {
                stationOrder: st.station_order as 1 | 2 | 3 | 4,
                title: st.title || `المحطة ${st.station_order}`,
                questionText: globalOrchestrator.validateMathSolution(st.question_text || '').text,
                choices: shuffled,
                correctChoiceIndex: correctIndex,
                hintText: st.hint_level1 || st.hintText || '',
                hintLevel1: st.hint_level1,
                hintLevel2: st.hint_level2,
                skipExplanation: st.skip_explanation,
                conceptMap: st.concept_map
              };
            });
          }
        }
      } catch (err) {
        console.warn(`[AI] Fallback for stations generation of family ${famName}:`, err);
      }
    }

    resultFamilies.push({
      docId,
      familyName: famName,
      targetConcepts,
      leadExerciseId: leadId,
      exercises: assignedExs,
      hasManualEdits: false,
      saved: false
    });
  }

  // Handle any remaining unassigned exercises by attaching them to the first family or creating a general family
  const allAssignedIds = new Set(resultFamilies.flatMap(f => f.exercises.map(e => e.id)));
  const unassigned = exercises.filter(e => !allAssignedIds.has(e.id));

  if (unassigned.length > 0) {
    if (resultFamilies.length > 0) {
      unassigned.forEach(ue => {
        resultFamilies[0].exercises.push({
          id: ue.id,
          title: ue.title,
          questionText: ue.questionText,
          solutionText: ue.solutionText,
          strategyText: ue.strategyText,
          svgCode: ue.svgCode,
          isLeadExercise: false,
          primaryConcept: resultFamilies[0].familyName,
          secondaryConcepts: [],
          stations: []
        });
      });
    }
  }

  if (onProgress) {
    onProgress('finalizing', 'تم تصنيف العائلات وتوليد محطات الحل والخيارات بنجاح!', 100);
  }

  return resultFamilies;
}

/**
 * 🔄 Re-generates a single family and its 4-stations with choices.
 */
export async function regenerateSingleFamilyAI(
  docId: number,
  unitTitle: string,
  family: ClassifiedFamilyData,
  onProgress?: (message: string, progress: number) => void
): Promise<ClassifiedFamilyData> {
  if (onProgress) onProgress(`جاري إعادة تحليل وتوليد محطات عائلة: "${family.familyName}"...`, 30);

  const exercises = family.exercises;
  if (exercises.length === 0) return family;

  const exercisesFormatted = exercises.map((ex, idx) => {
    return `### تمرين [${idx + 1}] (المعرف: ${ex.id}):
العنوان: ${ex.title}
نص التمرين:
${ex.questionText}
${ex.strategyText ? `فكرة الحل: ${ex.strategyText}\n` : ''}
${ex.solutionText ? `الحل: ${ex.solutionText}\n` : ''}`;
  }).join('\n\n---\n\n');

  const prompt = `أنت خبير تربوي في الرياضيات (المنهاج السوري للبكالوريا).
مهمتك: إعادة تدقيق وتوليد محطات الحل الموجّه والخيارات المقترحة لعائلة تمارين محددة: "${family.familyName}".

المفاهيم السابقة المستهدفة: ${family.targetConcepts.join(' - ')}

بيانات التمارين في هذه العائلة:
${exercisesFormatted}

المطلوب:
1. اختيار التمرين القائد (lead_exercise_id) الأكثر شمولاً لمفاهيم العائلة.
2. لكل تمرين غير قائد، توليد المحطات الأربع للحل الموجّه مع خيارات تفاعلية (choices) ومشتتات لكل محطة.
3. قواعد LaTeX الصارمة:
   - استخدام LaTeX بين علامات '$...$' مفردة حصراً (يُمنع '$$').
   - عرّف LaTeX ككود لا يُمس واكتب الأوامر كاملة دون حذف الشرطة المائلة '\\' (مثل \\frac, \\sqrt, \\lim).
   - حظر استخدام \\right و \\left: يُمنع استخدام \\right أو \\left، وتُكتب الأقواس والحواصر بصيغتها المباشرة ( ... ) و [ ... ] و | ... | و \\{ ... \\}.
   - للشعاع بحرف واحد: \\vec{u} حصراً، وللشعاع بين نقطتين: \\overrightarrow{AB} حصراً.
   - فحص كل معادلة وصيغة رياضية قبل إخراجها.
4. استخدام "تابع" بدلاً من "دالة"، وحظر \\sum للمجاميع والجداء الخارجي.

تنسيق الإخراج المطلوبة (JSON حصراً):
{
  "family_name": "${family.familyName}",
  "target_concepts": ${JSON.stringify(family.targetConcepts)},
  "lead_exercise_id": "معرف التمرين القائد",
  "exercises_stations": [
    {
      "exercise_id": "معرف التمرين",
      "primary_concept": "المفهوم الأساسي",
      "secondary_concepts": ["مفهوم ثانوي"],
      "stations": [
        {
          "station_order": 1,
          "title": "المحطة الأولى: الاستكشاف وتشخيص النمط",
          "question_text": "...",
          "choices": [
            { "text": "...", "isCorrect": true, "misconceptionDiagnosis": "إجابة دقيقة وصحيحة ✅" },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
          ],
          "hint_level1": "...",
          "hint_level2": "...",
          "skip_explanation": "...",
          "concept_map": "..."
        },
        {
          "station_order": 2,
          "title": "المحطة الثانية: اختيار الأداة والقانون المنطلق",
          "question_text": "...",
          "choices": [
            { "text": "...", "isCorrect": true, "misconceptionDiagnosis": "صحيح ✅" },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
          ],
          "hint_level1": "...",
          "hint_level2": "...",
          "skip_explanation": "...",
          "concept_map": "..."
        },
        {
          "station_order": 3,
          "title": "المحطة الثالثة: الخطوة التنفيذية المفصلية",
          "question_text": "...",
          "choices": [
            { "text": "...", "isCorrect": true, "misconceptionDiagnosis": "صحيح ✅" },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
          ],
          "hint_level1": "...",
          "hint_level2": "...",
          "skip_explanation": "...",
          "concept_map": "..."
        },
        {
          "station_order": 4,
          "title": "المحطة الرابعة: الناتج النهائي والخلاصة الرياضية",
          "question_text": "...",
          "choices": [
            { "text": "...", "isCorrect": true, "misconceptionDiagnosis": "إجابة دقيقة وصحيحة ✅" },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
            { "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
          ],
          "hint_level1": "...",
          "hint_level2": "...",
          "skip_explanation": "...",
          "concept_map": "..."
        }
      ]
    }
  ]
}
`;

  if (onProgress) onProgress('توليد المحطات والخيارات عبر الذكاء الاصطناعي...', 60);

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  });

  const parsed = cleanJson(response.text || '{}');
  const leadId = parsed.lead_exercise_id || family.leadExerciseId || exercises[0].id;
  const targetConcepts = Array.isArray(parsed.target_concepts) && parsed.target_concepts.length > 0
    ? parsed.target_concepts
    : family.targetConcepts;

  const stList = Array.isArray(parsed.exercises_stations) ? parsed.exercises_stations : [];
  const updatedExercises: ClassifiedExercise[] = exercises.map(ex => {
    const isLead = ex.id === leadId;
    const stItem = stList.find((s: any) => s.exercise_id === ex.id);

    let stations: ClassifiedStation[] = [];
    if (!isLead && stItem && Array.isArray(stItem.stations)) {
      stations = stItem.stations.map((st: any) => {
        const rawChoices = Array.isArray(st.choices)
          ? st.choices.map((c: any, cIdx: number) => ({
              id: c.id || `c_${st.station_order}_${cIdx}`,
              text: globalOrchestrator.validateMathSolution(c.text || '').text,
              isCorrect: Boolean(c.isCorrect),
              misconceptionDiagnosis: c.misconceptionDiagnosis
                ? globalOrchestrator.validateMathSolution(c.misconceptionDiagnosis).text
                : undefined
            }))
          : [];

        if (rawChoices.length > 0 && !rawChoices.some(c => c.isCorrect)) {
          rawChoices[0].isCorrect = true;
        }

        const { shuffled, correctIndex } = rawChoices.length > 0
          ? shuffleChoices(rawChoices)
          : { shuffled: [], correctIndex: 0 };

        return {
          stationOrder: st.station_order as 1 | 2 | 3 | 4,
          title: st.title || `المحطة ${st.station_order}`,
          questionText: globalOrchestrator.validateMathSolution(st.question_text || '').text,
          choices: shuffled,
          correctChoiceIndex: correctIndex,
          hintText: st.hint_level1 || st.hintText || '',
          hintLevel1: st.hint_level1,
          hintLevel2: st.hint_level2,
          skipExplanation: st.skip_explanation,
          conceptMap: st.concept_map
        };
      });
    }

    return {
      ...ex,
      isLeadExercise: isLead,
      primaryConcept: stItem?.primary_concept || ex.primaryConcept || family.familyName,
      secondaryConcepts: Array.isArray(stItem?.secondary_concepts) ? stItem.secondary_concepts : ex.secondaryConcepts,
      stations: isLead ? [] : (stations.length > 0 ? stations : ex.stations)
    };
  });

  if (onProgress) onProgress('اكتملت إعادة التوليد بنجاح!', 100);

  return {
    ...family,
    familyName: parsed.family_name || family.familyName,
    targetConcepts,
    leadExerciseId: leadId,
    exercises: updatedExercises,
    hasManualEdits: false,
    saved: false
  };
}

/**
 * ⚡ Generates suggested choices (MCQ, True/False, or Context-driven Mixed mode) for a single station of an exercise.
 */
export async function generateStationChoicesAI(
  unitTitle: string,
  exerciseTitle: string,
  exerciseQuestion: string,
  stationOrder: 1 | 2 | 3 | 4,
  stationQuestion: string,
  mode: 'mcq' | 'true_false' | 'mixed' = 'mixed'
): Promise<{
  choices: Array<{ id?: string; text: string; isCorrect: boolean; misconceptionDiagnosis?: string }>;
  correctChoiceIndex: number;
  correctIndex: number;
}> {
  let modeInstruction = '';
  if (mode === 'true_false') {
    modeInstruction = 'صح أو خطأ (عبارة تقييمية مع خيارين فقط: صح / خطأ مع تشخيص للمشتت).';
  } else if (mode === 'mcq') {
    modeInstruction = 'اختيار من متعدد (3 أو 4 خيارات موجزة مع خيار واحد صحيح وثلاثة مشتتات).';
  } else {
    // Mixed mode: Contextually decide based on station nature
    modeInstruction = 'مختلط وذكي حسب سياق المحطة الرياضي (اختر الأنسب تلقائياً: إما عبارة صح/خطأ خيارين إذا كان السؤال تقييم صحة عبارة أو شرط، أو 4 خيارات اختيار من متعدد إذا كان حساب ناتج أو اختيار قانون/علاقة).';
  }
  
  const prompt = `أنت خبير رياضيات تربوي للمنهاج السوري للبكالوريا.
المطلوب توليد خيارات مقترحة وموجزة جداً للسؤال الموجه في المحطة ${stationOrder} لتمرين في وحدة "${unitTitle}".

بيانات المسألة:
- عنوان المسألة: ${exerciseTitle}
- نص المسألة:
${exerciseQuestion}

السؤال الموجه في المحطة ${stationOrder}:
"${stationQuestion}"

نوع الخيارات المطلوبة: ${modeInstruction}

القواعد والضوابط الإلزامية:
1. الإيجاز والاختصار الشديد: يجب أن تكون الإجابات والخيارات والأسئلة التوضيحية موجزة، مباشرة، ومركزة ومختصرة نوعاً ما بدون حشو لفظي أو تطويل غير مبرر لتسهيل الاستيعاب السريع والتركيز البصري.
2. صياغة دقيقة باللغة العربية والرموز الرياضية '$...$' مفردة حصراً (يُمنع منعاً باتاً استخدام '$$').
3. قواعد LaTeX الصارمة:
   - عرّف LaTeX ككود برمجي لا يُمس واكتب الأوامر كاملة دون إسقاط أي شرطة مائلة '\\' (مثل \\frac, \\sqrt, \\lim, \\vec, \\overrightarrow).
   - حظر استخدام \\right و \\left: يُمنع استخدام \\right أو \\left، وتُكتب الأقواس والحواصر بصيغتها المباشرة ( ... ) و [ ... ] و | ... | و \\{ ... \\}.
   - للشعاع بحرف واحد: \\vec{u} حصراً، وللشعاع بين نقطتين: \\overrightarrow{AB} حصراً.
4. افحص كل معادلة رياضية وتأكد من صحتها الحسابية 100% قبل الإخراج.
5. خيار واحد فقط هو الصحيح (isCorrect: true).
6. لكل خيار خاطئ، اكتب تشخيصاً موجزاً وواضحاً لسبب الخطأ أو الفخ الرياضي (misconceptionDiagnosis).
7. استخدم "تابع" بدلاً من "دالة"، ولا تستخدم \\sum أو الجداء الخارجي.

أخرج JSON صالحاً:
{
  "choices": [
    {
      "text": "نص الخيار الموجز والمباشر",
      "isCorrect": true,
      "misconceptionDiagnosis": "إجابة صحيحة ومتقنة ✅"
    },
    {
      "text": "نص خيار خاطئ موجز",
      "isCorrect": false,
      "misconceptionDiagnosis": "تشخيص سبب الخطأ باختصار"
    }
  ]
}
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  });

  const parsed = cleanJson(response.text || '{}');
  const rawList = Array.isArray(parsed.choices) ? parsed.choices : [];

  let formattedChoices = rawList.map((c: any, idx: number) => ({
    id: `c_${stationOrder}_${idx}_${Date.now()}`,
    text: globalOrchestrator.validateMathSolution(c.text || '').text,
    isCorrect: Boolean(c.isCorrect),
    misconceptionDiagnosis: c.misconceptionDiagnosis
      ? globalOrchestrator.validateMathSolution(c.misconceptionDiagnosis).text
      : undefined
  }));

  if (formattedChoices.length === 0) {
    if (mode === 'true_false') {
      formattedChoices = [
        { id: `c_${stationOrder}_1`, text: 'العبارة صحيحة ومحققة تماماً', isCorrect: true, misconceptionDiagnosis: 'صحيح ومستوفٍ للشروط ✅' },
        { id: `c_${stationOrder}_2`, text: 'العبارة خاطئة وغير مستوفية للشرط', isCorrect: false, misconceptionDiagnosis: 'تأكد من شرط الاستمرار ومجموعة التعريف' }
      ];
    } else {
      formattedChoices = [
        { id: `c_${stationOrder}_1`, text: 'الخيار الأول الصحيح', isCorrect: true, misconceptionDiagnosis: 'إجابة صحيحة ومتقنة ✅' },
        { id: `c_${stationOrder}_2`, text: 'الخيار الثاني', isCorrect: false, misconceptionDiagnosis: 'خطأ في التعويض أو الحساب' },
        { id: `c_${stationOrder}_3`, text: 'الخيار الثالث', isCorrect: false, misconceptionDiagnosis: 'تطبيق خاطئ للقاعدة' }
      ];
    }
  }

  if (!formattedChoices.some(c => c.isCorrect)) {
    formattedChoices[0].isCorrect = true;
  }

  return shuffleChoices(formattedChoices);
}

/**
 * ⚡ Generates / fills proposed choices for ALL stations across all non-lead exercises in a family.
 */
export async function generateAllStationsChoicesForFamilyAI(
  family: ClassifiedFamilyData,
  unitTitle: string,
  mode: 'mcq' | 'true_false' | 'mixed' = 'mixed',
  onProgress?: (message: string, progress: number) => void
): Promise<ClassifiedFamilyData> {
  const nonLeadExercises = family.exercises.filter(e => !e.isLeadExercise);
  if (nonLeadExercises.length === 0) return family;

  const modeLabel = mode === 'true_false' ? 'صح/خطأ' : mode === 'mcq' ? 'اختيار من متعدد' : 'مختلط (صح/خطأ أو 4 خيارات)';
  if (onProgress) onProgress(`جاري توليد الخيارات المقترحة والموجزة لمحطات عائلة "${family.familyName}" (${modeLabel})...`, 10);

  const updatedExercises = [...family.exercises];

  for (let eIdx = 0; eIdx < nonLeadExercises.length; eIdx++) {
    const ex = nonLeadExercises[eIdx];
    const targetIdx = updatedExercises.findIndex(e => e.id === ex.id);
    if (targetIdx === -1) continue;

    if (onProgress) {
      const pct = Math.round(10 + ((eIdx + 1) / nonLeadExercises.length) * 80);
      onProgress(`توليد خيارات تمرين "${ex.title}" (${eIdx + 1}/${nonLeadExercises.length})...`, pct);
    }

    const updatedStations = [...(ex.stations || [])];

    // Make sure we have 4 stations
    for (let stOrder = 1; stOrder <= 4; stOrder++) {
      let stIndex = updatedStations.findIndex(s => s.stationOrder === stOrder);
      let station = stIndex !== -1 ? updatedStations[stIndex] : null;

      if (!station) {
        const defaultTitles = [
          'المحطة الأولى: الاستكشاف وتشخيص النمط',
          'المحطة الثانية: اختيار الأداة والقانون المنطلق',
          'المحطة الثالثة: الخطوة التنفيذية المفصلية',
          'المحطة الرابعة: الناتج النهائي والخلاصة الرياضية'
        ];
        station = {
          stationOrder: stOrder as 1 | 2 | 3 | 4,
          title: defaultTitles[stOrder - 1],
          questionText: `ما هي الخطوة التوجيهية المناسبة للمحطة ${stOrder}؟`,
          choices: []
        };
        updatedStations.push(station);
        stIndex = updatedStations.length - 1;
      }

      // Generate choices for this station (mixed or specific)
      const { choices, correctIndex } = await generateStationChoicesAI(
        unitTitle,
        ex.title,
        ex.questionText,
        stOrder as 1 | 2 | 3 | 4,
        station.questionText || `سؤال المحطة ${stOrder}`,
        mode
      );

      updatedStations[stIndex] = {
        ...station,
        choices,
        correctChoiceIndex: correctIndex
      };
    }

    updatedExercises[targetIdx] = {
      ...ex,
      stations: updatedStations
    };
  }

  if (onProgress) onProgress('تم توليد وتحديث الخيارات لكافة المحطات بنجاح!', 100);

  return {
    ...family,
    exercises: updatedExercises,
    hasManualEdits: true,
    saved: false
  };
}
