
import { supabase } from './supabaseClient';
import { generateWithFallback } from './gemini';

const STAR_TO_LEVEL: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

// Simple SHA-256 helper in browser
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Clean options: remove prefixes like "أ)", "ب)", "(أ)", "أ-", etc.
function cleanOptionText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^[\s(]*[أبجدهئطك]\s*[\-)\.]\s*/, '')
    .trim();
}

// Normalize Topic if it starts with "سؤال محقون من اختبار"
function normalizeTopic(topic: string, question: string, defaultTopic: string): string {
  if (!topic || topic.startsWith('سؤال محقون من اختبار')) {
    if (question.includes('مركز الأبعاد المتناسبة') || question.includes('مراكز الأبعاد')) {
      return 'مراكز الأبعاد المتناسبة في الفراغ';
    }
    if (question.includes('التمثيل الوسيطي') || question.includes('وسيطياً')) {
      return 'التمثيل الوسيطي للمستقيمات والقطع المستقيمة';
    }
    if (question.includes('المسقط القائم') || question.includes('بعد النقطة')) {
      return 'المساقط القائمة والأبعاد في الفراغ';
    }
    if (question.includes('الوضع النسبي') || question.includes('متقاطعان') || question.includes('متخالفان')) {
      return 'الأوضاع النسبية للمستقيمات والمستويات';
    }
    if (question.includes('معادلة المستوي') || question.includes('المستوي')) {
      return 'معادلة المستوي والشعاع الناظم';
    }
    return defaultTopic || 'المستقيمات والمستويات في الفراغ';
  }
  return topic.trim();
}

export interface SyncReport {
  published: {
    native: number;
    derived: number;
    byLevel: Record<number, number>;
  };
  excluded: Array<{ id: string; question: string; reason: string }>;
  skipped: number;
  kQuestionExcluded: boolean;
  examples: {
    native: any;
    derived: any;
  };
}

export async function executeQuestionBankSync(
  bankData: any,
  onProgress: (current: number, total: number, stage: string) => void
): Promise<SyncReport> {
  const dbClient = supabase as any;
  onProgress(0, bankData.items.length, 'البحث عن الوحدة المطابقة في قاعدة البيانات...');

  // 1. Precise unit matching in NewUnits by name, subject, and grade
  const rawUnit = (bankData.unit || '').trim();
  const rawSubject = (bankData.subject || 'الرياضيات').trim();
  const rawGrade = (bankData.grade || 'الثالث الثانوي العلمي').trim();

  const normalize = (s: string) => s.replace(/[-:ـ\s]+/g, ' ').trim().toLowerCase();
  const normTarget = normalize(rawUnit);
  const parts = rawUnit.split(/[-:]/);
  const specificTitle = parts.length > 1 ? parts.slice(1).join(' ').trim() : rawUnit;
  const normSpecific = normalize(specificTitle);

  const { data: allUnits, error: unitError } = await dbClient
    .from('NewUnits')
    .select('id, name, subject_id, book_part');

  if (unitError || !allUnits || allUnits.length === 0) {
    throw new Error(`خطأ في جلب الوحدات من قاعدة البيانات: ${unitError?.message || 'لا توجد وحدات'}`);
  }

  // Find exact unit that contains the distinctive title (e.g. "المستقيمات والمستويات في الفراغ")
  let foundUnit = allUnits.find((u: any) => normalize(u.name) === normTarget || u.name.trim() === rawUnit);
  if (!foundUnit && specificTitle) {
    foundUnit = allUnits.find((u: any) => {
      const uNorm = normalize(u.name);
      return uNorm.includes(normSpecific) || normSpecific.includes(uNorm);
    });
  }
  if (!foundUnit && specificTitle.includes(' ')) {
    const keyTokens = specificTitle.split(/\s+/).filter(w => w.length > 2 && !['في', 'من', 'على', 'إلى', 'مع'].includes(w));
    foundUnit = allUnits.find((u: any) => {
      const uNorm = normalize(u.name);
      const matchedCount = keyTokens.filter(t => uNorm.includes(normalize(t))).length;
      return matchedCount >= 2;
    });
  }

  if (!foundUnit) {
    throw new Error(`لم يتم العثور على وحدة مطابقة لـ "${bankData.unit}" ضمن مادة "${rawSubject}" وصف "${rawGrade}". تم إيقاف العملية لمنع إنشاء أي وحدة جديدة.`);
  }

  const unitId = foundUnit.id;

  // 2. Upsert Question Bank
  onProgress(0, bankData.items.length, 'إنشاء / تحديث سجل بنك الأسئلة في NewQuestionBanks...');
  
  let { data: existingBank } = await dbClient
    .from('NewQuestionBanks')
    .select('id')
    .eq('unit_id', unitId)
    .eq('title', bankData.title)
    .single();

  let bankId = existingBank?.id;

  if (!bankId) {
    const { data: newBank, error: insertErr } = await dbClient
      .from('NewQuestionBanks')
      .insert({
        unit_id: unitId,
        title: bankData.title,
        is_published: false
      })
      .select('id')
      .single();
    if (insertErr) throw new Error(`فشل إنشاء بنك الأسئلة: ${insertErr.message}`);
    bankId = newBank.id;
  }

  const report: SyncReport = {
    published: { native: 0, derived: 0, byLevel: { 1: 0, 2: 0, 3: 0, 4: 0 } },
    excluded: [],
    skipped: 0,
    kQuestionExcluded: false,
    examples: { native: null, derived: null }
  };

  const items = bankData.items || [];
  let processedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    processedCount++;
    const itemId = item.id || `item_${i + 1}`;
    onProgress(processedCount, items.length, `معالجة وفحص السؤال ${processedCount} من ${items.length}`);

    // Check for k-parameter question trap (e.g. P1, P2, P3 with k=7 or determinant != 0)
    if (item.question?.includes('3x + 2y + 4z = k') || item.solution?.includes('k = 7')) {
      report.excluded.push({
        id: itemId,
        question: item.question,
        reason: 'سؤال المستويات الثلاثة والوسيط k: الإجابة المذكورة k=7 خاطئة علمياً لأن محدد معاملات الجملة = -2 ≠ 0 فالجملة تملك حلاً وحيداً ولا يمكن أن تتقاطع في مستقيم مشترك.'
      });
      report.kQuestionExcluded = true;
      continue;
    }

    const starsRaw = Math.max(1, Math.min(5, Number(item.difficulty) || 3));
    const level = STAR_TO_LEVEL[starsRaw] || 2;
    const itemTopic = normalizeTopic(item.topic || '', item.question || '', foundUnit.name);

    // =========================================================================
    // A) NATIVE MCQ (origin='native_mcq')
    // =========================================================================
    if (item.type === 'mcq') {
      const rawOptions = item.subParts || [];
      const cleanedOptions = rawOptions.map((opt: string) => cleanOptionText(opt));

      if (cleanedOptions.length !== 4) {
        report.excluded.push({
          id: itemId,
          question: item.question,
          reason: `عدد الخيارات ${cleanedOptions.length} لا يساوي 4.`
        });
        continue;
      }

      // Check for duplicate options
      const uniqueOptions = new Set(cleanedOptions.map(o => o.trim()));
      if (uniqueOptions.size !== 4) {
        report.excluded.push({
          id: itemId,
          question: item.question,
          reason: 'الخيارات تحتوي على قيم مكررة.'
        });
        continue;
      }

      // Method 1: Deterministic extraction from solution text
      let deterministicIndex = -1;
      const sol = item.solution || '';

      // Pattern 1: matching text directly in solution conclusion
      for (let idx = 0; idx < cleanedOptions.length; idx++) {
        const opt = cleanedOptions[idx];
        if (opt.length > 2 && (sol.includes(`هو: ${opt}`) || sol.includes(`هي: ${opt}`) || sol.includes(`هو ${opt}`) || sol.includes(`هي ${opt}`))) {
          deterministicIndex = idx;
          break;
        }
      }

      // Pattern 2: Explicit Arabic letter mention in conclusion (e.g. "الخيار الصحيح هو (أ)" أو "الخيار (ب)")
      if (deterministicIndex === -1) {
        const lastPortion = sol.slice(-300);
        const matchLetter = lastPortion.match(/(?:الخيار|الإجابة)\s*(?:الصحيحة?)?\s*(?:هو|هي)?\s*\(?([أبجد])\)?/);
        if (matchLetter) {
          const letter = matchLetter[1];
          if (letter === 'أ') deterministicIndex = 0;
          else if (letter === 'ب') deterministicIndex = 1;
          else if (letter === 'ج') deterministicIndex = 2;
          else if (letter === 'د') deterministicIndex = 3;
        }
      }

      // Pattern 3: Direct substring occurrence if unique
      if (deterministicIndex === -1) {
        for (let idx = 0; idx < cleanedOptions.length; idx++) {
          const opt = cleanedOptions[idx];
          if (opt.length >= 4 && sol.includes(opt)) {
            deterministicIndex = idx;
            break;
          }
        }
      }

      if (deterministicIndex < 0 || deterministicIndex > 3) {
        report.excluded.push({
          id: itemId,
          question: item.question,
          reason: 'فشل استخراج الإجابة الصحيحة بشكل حتمي من الحل النموذجي.'
        });
        continue;
      }

      // Method 2: AI Independent Solver (gemini-3.8-flash) without solution
      let aiIndependentIndex = -1;
      let aiSolutionIndex = -1;

      try {
        const independentPrompt = `أنت مدقق رياضي خبير بالمنهاج السوري للثالث الثانوي العلمي.
حل السؤال التالي حلاً مستقلاً دون أي تحيز، واختر الفهرس الصحيح (0 إلى 3) من بين الخيارات المتاحة:

السؤال:
${item.question}

الخيارات:
0: ${cleanedOptions[0]}
1: ${cleanedOptions[1]}
2: ${cleanedOptions[2]}
3: ${cleanedOptions[3]}

أجب حصراً بصيغة JSON التالية دون أي شرح إضافي:
{"selected_index": 0}`;

        const aiIndepRes = await generateWithFallback(["gemini-3.8-flash"], {
          contents: [{ role: 'user', parts: [{ text: independentPrompt }] }]
        });

        const indepText = (aiIndepRes.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
        const indepParsed = JSON.parse(indepText);
        aiIndependentIndex = Number(indepParsed.selected_index);

        // Method 3: AI solution endorsement checker (gemini-3.8-flash) with solution
        const solutionPrompt = `بناءً على نص الحل النموذجي المرفق فقط، ما هو الخيار المعتمد كإجابة صحيحة من بين الخيارات الأربعة؟

الحل:
${sol}

الخيارات:
0: ${cleanedOptions[0]}
1: ${cleanedOptions[1]}
2: ${cleanedOptions[2]}
3: ${cleanedOptions[3]}

أجب حصراً بصيغة JSON التالية دون أي شرح:
{"solution_index": 0}`;

        const aiSolRes = await generateWithFallback(["gemini-3.8-flash"], {
          contents: [{ role: 'user', parts: [{ text: solutionPrompt }] }]
        });

        const solText = (aiSolRes.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
        const solParsed = JSON.parse(solText);
        aiSolutionIndex = Number(solParsed.solution_index);

      } catch (aiErr: any) {
        console.warn(`[AI Verification Error] Item ${itemId}:`, aiErr);
        report.excluded.push({
          id: itemId,
          question: item.question,
          reason: `تعذر استكمال التحقق بالذكاء الاصطناعي: ${aiErr.message || aiErr}`
        });
        continue;
      }

      // Decision: All 3 methods must agree 100%
      if (deterministicIndex !== aiIndependentIndex || aiIndependentIndex !== aiSolutionIndex) {
        report.excluded.push({
          id: itemId,
          question: item.question,
          reason: `عدم تطابق طرق التحقق الثلاث: الاستخراج الحتمي=${deterministicIndex}، والحل المستقل=${aiIndependentIndex}، والحل المذكور=${aiSolutionIndex}.`
        });
        continue;
      }

      // Passed all checks!
      // Content hash: SHA-256(unit_id + question + options sorted + part_index)
      const sortedOpts = [...cleanedOptions].sort().join('|');
      const hashInput = `${unitId}:${item.question.trim()}:${sortedOpts}:${item.order || i}`;
      const contentHash = await sha256(hashInput);

      // Check if already in DB
      const { data: existing } = await dbClient
        .from('NewQuestionBankItems')
        .select('id')
        .eq('content_hash', contentHash)
        .single();

      if (existing) {
        report.skipped++;
        continue;
      }

      // Write immediately upon success
      const { error: insertErr } = await dbClient
        .from('NewQuestionBankItems')
        .upsert({
          bank_id: bankId,
          topic: itemTopic,
          difficulty: level,
          question: item.question,
          sub_parts: cleanedOptions,
          solution: item.solution,
          ai_guidance: item.aiGuidance || '',
          order_index: item.order || i,
          item_type: 'mcq',
          svg_code: item.svgCode || null,
          content_hash: contentHash,
          correct_choice_index: deterministicIndex,
          is_published: true,
          verification_status: 'verified',
          origin: 'native_mcq'
        } as any, { onConflict: 'content_hash' });

      if (insertErr) {
        report.excluded.push({
          id: itemId,
          question: item.question,
          reason: `خطأ أثناء الكتابة في قاعدة البيانات: ${insertErr.message}`
        });
      } else {
        report.published.native++;
        report.published.byLevel[level] = (report.published.byLevel[level] || 0) + 1;
        if (!report.examples.native) {
          report.examples.native = {
            question: item.question,
            options: cleanedOptions,
            correct_index: deterministicIndex,
            explanation: item.solution
          };
        }
      }

    // =========================================================================
    // B) ESSAY DERIVED MCQ (origin='essay_derived')
    // =========================================================================
    } else if (item.type === 'essay') {
      const subParts = item.subParts || [];
      
      for (let spIdx = 0; spIdx < subParts.length; spIdx++) {
        const subText = subParts[spIdx];
        const subId = `${itemId}_sp${spIdx + 1}`;
        onProgress(processedCount, items.length, `توليد والتحقق من الفقرة الفرعية ${spIdx + 1}/${subParts.length} للمسألة ${itemId}`);

        // Step 1: Generate self-contained MCQ using gemini-3.5-flash-lite
        const generationPrompt = `باعتبارك مدرّساً خبيراً بالمنهاج السوري للرياضيات (الثالث الثانوي العلمي)، حوّل هذه الفقرة الفرعية من المسألة الأم إلى سؤال اختيار من متعدد (MCQ) مستقل تماماً ومكتفٍ بذاته يتضمن معطيات المسألة الأصلية.

معطيات المسألة الأم:
"${item.question}"

الفقرة الفرعية المستهدفة:
"${subText}"

الحل النموذجي للفقرة:
"${item.solution}"

المطلوب:
1. صياغة نص سؤال مكتمل المعطيات.
2. وضع 4 خيارات أحدها صحيح تماماً مستخرج من الحل، و3 مشتتات تمثل أخطاء شائعة يقع فيها الطلاب. احذف أي بادئات مثل أ) ب).
3. تحديد فهرس الخيار الصحيح (0 إلى 3).
4. كتابة تفسير مختصر مبني على خطوات الحل.

أجب حصراً بصيغة JSON التالية دون أي نص إضافي:
{
  "question": "نص السؤال المكتفي بذاته مع المعطيات",
  "options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
  "correct_index": 0,
  "explanation": "التفسير الرياضي المختصر"
}`;

        try {
          const genRes = await generateWithFallback(["gemini-3.5-flash-lite"], {
            contents: [{ role: 'user', parts: [{ text: generationPrompt }] }]
          });

          const genRaw = (genRes.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
          const generated = JSON.parse(genRaw);

          if (!generated.options || !Array.isArray(generated.options) || generated.options.length !== 4) {
            report.excluded.push({
              id: subId,
              question: subText,
              reason: 'فشل التوليد الذكي: عدد الخيارات المولدة لا يساوي 4.'
            });
            continue;
          }

          // Clean generated options
          const cleanedDerivedOptions = generated.options.map((opt: string) => cleanOptionText(opt));
          const uniqueDerivedOptions = new Set(cleanedDerivedOptions.map((o: string) => o.trim()));

          if (uniqueDerivedOptions.size !== 4) {
            report.excluded.push({
              id: subId,
              question: subText,
              reason: 'فشل التوليد الذكي: الخيارات المولدة تحتوي على تكرار.'
            });
            continue;
          }

          const targetCorrectIndex = Number(generated.correct_index);
          if (isNaN(targetCorrectIndex) || targetCorrectIndex < 0 || targetCorrectIndex > 3) {
            report.excluded.push({
              id: subId,
              question: subText,
              reason: 'فهرس الخيار الصحيح المولد خارج المدى [0, 3].'
            });
            continue;
          }

          // Step 2: Independent verification by gemini-3.8-flash (without solution/answer)
          const verifyPrompt = `أنت مدقق رياضي امتحاني مستقل. حل هذا السؤال الرياضي بدقة تامة واختر الفهرس الصحيح (0 إلى 3):

السؤال:
${generated.question}

الخيارات:
0: ${cleanedDerivedOptions[0]}
1: ${cleanedDerivedOptions[1]}
2: ${cleanedDerivedOptions[2]}
3: ${cleanedDerivedOptions[3]}

أجب حصراً بصيغة JSON التالية دون أي مقدمات:
{"selected_index": 0}`;

          const verifyRes = await generateWithFallback(["gemini-3.8-flash"], {
            contents: [{ role: 'user', parts: [{ text: verifyPrompt }] }]
          });

          const verifyRaw = (verifyRes.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
          const verified = JSON.parse(verifyRaw);
          const aiVerifiedIndex = Number(verified.selected_index);

          if (aiVerifiedIndex !== targetCorrectIndex) {
            report.excluded.push({
              id: subId,
              question: generated.question,
              reason: `فشل التحقق المستقل للفقرة المشتقة: الحل المستقل للنموذج أعطى الخيار ${aiVerifiedIndex} بينما الخيار المولد هو ${targetCorrectIndex}.`
            });
            continue;
          }

          // Step 3: Compute Content Hash & Upsert
          const sortedDerivedOpts = [...cleanedDerivedOptions].sort().join('|');
          const hashInput = `${unitId}:${generated.question.trim()}:${sortedDerivedOpts}:${i}_${spIdx}`;
          const contentHash = await sha256(hashInput);

          const { data: existing } = await dbClient
            .from('NewQuestionBankItems')
            .select('id')
            .eq('content_hash', contentHash)
            .single();

          if (existing) {
            report.skipped++;
            continue;
          }

          // Write immediately upon success
          const { error: insertErr } = await dbClient
            .from('NewQuestionBankItems')
            .upsert({
              bank_id: bankId,
              topic: itemTopic,
              difficulty: level,
              question: generated.question,
              sub_parts: cleanedDerivedOptions,
              solution: generated.explanation,
              ai_guidance: item.aiGuidance || '',
              order_index: (i * 10) + spIdx,
              item_type: 'mcq',
              svg_code: item.svgCode || null,
              content_hash: contentHash,
              correct_choice_index: targetCorrectIndex,
              is_published: true,
              verification_status: 'verified',
              origin: 'essay_derived'
            } as any, { onConflict: 'content_hash' });

          if (insertErr) {
            report.excluded.push({
              id: subId,
              question: generated.question,
              reason: `خطأ قاعدة بيانات أثناء كتابة الفقرة المشتقة: ${insertErr.message}`
            });
          } else {
            report.published.derived++;
            report.published.byLevel[level] = (report.published.byLevel[level] || 0) + 1;
            if (!report.examples.derived) {
              report.examples.derived = {
                question: generated.question,
                options: cleanedDerivedOptions,
                correct_index: targetCorrectIndex,
                explanation: generated.explanation
              };
            }
          }

        } catch (subErr: any) {
          console.error(`Error processing essay subpart ${subId}:`, subErr);
          report.excluded.push({
            id: subId,
            question: subText,
            reason: `فشل استدعاء الذكاء الاصطناعي للفقرة: ${subErr.message || subErr}`
          });
        }
      }
    }
  }

  return report;
}
