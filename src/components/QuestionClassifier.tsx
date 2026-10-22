import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { db } from '../db';
import { ClassificationTarget, ClassificationResult, fetchUnitConcepts, fetchUnitSectionTypes, classifyQuestionsBatch } from '../services/aiClassifier';
import { getOrCreateBankForUnit } from '../services/bankSyncSimple';
import { Loader2, Save, Filter, RefreshCw, CheckSquare, Square, CheckCircle2, AlertCircle, Sparkles, X, ChevronDown, ChevronUp, BarChart3, HelpCircle, PlusCircle, Copy, FolderPlus, Check } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { safeParseJson } from '../utils/safeJson';
import { resolveUnitUuid, isUuid, cleanArabicUnitName } from '../utils/unitResolver';

interface Props {
  unitId: string;
  onClose: () => void;
  onSavedSuccess?: () => void;
}

export const QuestionClassifier: React.FC<Props> = ({ unitId, onClose, onSavedSuccess }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [classifying, setClassifying] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [transferring, setTransferring] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [targets, setTargets] = useState<ClassificationTarget[]>([]);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [sectionTypes, setSectionTypes] = useState<string[]>([]);
  const [results, setResults] = useState<ClassificationResult[]>([]);

  // Filters & Toggles
  const [selectedSectionType, setSelectedSectionType] = useState<string>('all');
  const [reclassifyAll, setReclassifyAll] = useState<boolean>(false);
  const [showConceptsList, setShowConceptsList] = useState<boolean>(false);

  // Detailed Report Modal after save
  const [detailedReport, setDetailedReport] = useState<{
    totalSaved: number;
    levelCounts: { [key: number]: number };
    unspecifiedCount: number;
    updatedRecords: { id: string; table: string; fields: string[] }[];
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [unitId, reclassifyAll]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const fetchedConcepts = await fetchUnitConcepts(unitId);
      setConcepts(fetchedConcepts);

      const fetchedTypes = await fetchUnitSectionTypes(unitId);
      setSectionTypes(fetchedTypes);

      const quizItems: ClassificationTarget[] = [];
      const seenIds = new Set<string>();

      // 1. Load from Local IndexedDB (db.unitQuizzes)
      try {
        const localQuizzes = await db.unitQuizzes.toArray();
        const matchedLocalQuizzes = localQuizzes.filter((q: any) => 
          String(q.unit || '').trim() === String(unitId || '').trim() ||
          String(q.docId || '') === String(unitId || '') ||
          String(q.title || '').includes(String(unitId || ''))
        );
        const quizzesToProcess = matchedLocalQuizzes.length > 0 ? matchedLocalQuizzes : localQuizzes;

        quizzesToProcess.forEach((quiz: any) => {
          if (Array.isArray(quiz.questions)) {
            quiz.questions.forEach((q: any, qIdx: number) => {
              const qId = String(q.id || `local_q_${quiz.id}_${qIdx}`);
              if (!seenIds.has(qId)) {
                seenIds.add(qId);
                const qText = q.text || q.questionText || '';
                let opts: string[] = [];
                if (Array.isArray(q.options)) {
                  opts = q.options.map((o: any) => typeof o === 'string' ? o : (o.text || ''));
                }
                const diff = q.difficulty || q.difficulty_level || undefined;
                if (reclassifyAll || !diff || diff === 0) {
                  quizItems.push({
                    id: qId,
                    source: 'NewUnitQuizQuestions',
                    sectionType: 'comprehensive_quiz',
                    questionText: qText,
                    options: opts,
                    correctOption: q.correctOption !== undefined ? String(q.correctOption) : (q.correct_option_id !== undefined ? String(q.correct_option_id) : undefined),
                    topic: q.topic || undefined,
                    difficulty: diff
                  });
                }
              }
            });
          }
        });
      } catch (e) {
        console.warn('Error loading local quizzes:', e);
      }

      // 2. Load from Supabase NewUnitQuizQuestions
      try {
        const realUnitId = isUuid(unitId) ? unitId : await resolveUnitUuid(unitId);
        let quizIds: string[] = [];

        if (realUnitId) {
          const { data: quizzes } = await supabase
            .from('NewUnitQuizzes')
            .select('id')
            .eq('unit_id', realUnitId);
          quizIds = (quizzes || []).map((q: any) => q.id);
        } else {
          const cleanName = cleanArabicUnitName(unitId);
          const { data: quizzes } = await supabase
            .from('NewUnitQuizzes')
            .select('id, title')
            .ilike('title', `%${cleanName || unitId}%`);
          quizIds = (quizzes || []).map((q: any) => q.id);
        }
        if (quizIds.length > 0) {
          let query1 = supabase
            .from('NewUnitQuizQuestions')
            .select('id, question_text, options, correct_option_id, topic, difficulty_level')
            .in('quiz_id', quizIds);

          if (!reclassifyAll) {
            query1 = query1.or('difficulty_level.is.null,difficulty_level.eq.0');
          }
          const { data: quizData } = await query1;
          if (quizData) {
            quizData.forEach((q: any) => {
              const qId = String(q.id);
              if (!seenIds.has(qId)) {
                seenIds.add(qId);
                let opts: string[] = [];
                if (Array.isArray(q.options)) {
                  opts = q.options.map((o: any) => typeof o === 'string' ? o : (o.text || ''));
                }
                quizItems.push({
                  id: qId,
                  source: 'NewUnitQuizQuestions',
                  sectionType: 'comprehensive_quiz',
                  questionText: q.question_text || '',
                  options: opts,
                  correctOption: q.correct_option_id,
                  topic: q.topic || undefined,
                  difficulty: q.difficulty_level || undefined
                });
              }
            });
          }
        }
      } catch (e) {
        console.warn('Error loading Supabase quiz questions:', e);
      }

      setTargets(quizItems);
    } catch (e: any) {
      setErrorMsg(e.message || 'حدث خطأ أثناء تحميل الأسئلة');
    } finally {
      setLoading(false);
    }
  };

  const handleStartClassification = async () => {
    if (targets.length === 0) {
      setErrorMsg('لا توجد أسئلة مطابقة للشروط للتصنيف.');
      return;
    }

    setClassifying(true);
    setErrorMsg(null);
    try {
      const filteredTargets = selectedSectionType === 'all' 
        ? targets 
        : targets.filter(t => t.sectionType === selectedSectionType);

      const classificationResults = await classifyQuestionsBatch(
        filteredTargets, 
        concepts, 
        (msg) => setProgressText(msg)
      );
      setResults(classificationResults);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء الاتصال بالذكاء الاصطناعي');
    } finally {
      setClassifying(false);
      setProgressText('');
    }
  };

  // Generate and Add New AI Questions with Strict Anti-Duplication, Traps, Concepts & Approval Rules
  const handleGenerateNewAIQuestions = async () => {
    setClassifying(true);
    setErrorMsg(null);
    try {
      // 1. Gather all existing question texts from Active Unit Quiz & Question Bank to prevent duplication
      const existingQuestionTexts: string[] = [];
      targets.forEach(t => {
        if (t.questionText) existingQuestionTexts.push(t.questionText.trim());
      });

      const realUnitId = isUuid(unitId) ? unitId : await resolveUnitUuid(unitId);

      try {
        let bankIds: string[] = [];
        if (realUnitId) {
          const { data: bankRecs } = await supabase
            .from('NewQuestionBanks')
            .select('id')
            .eq('unit_id', realUnitId);
          bankIds = (bankRecs || []).map((b: any) => b.id);
        } else {
          const cleanName = cleanArabicUnitName(unitId);
          const { data: bankRecs } = await supabase
            .from('NewQuestionBanks')
            .select('id')
            .ilike('title', `%${cleanName || unitId}%`);
          bankIds = (bankRecs || []).map((b: any) => b.id);
        }
        
        if (bankIds.length > 0) {
          const { data: bankItems } = await supabase
            .from('NewQuestionBankItems')
            .select('question')
            .in('bank_id', bankIds);
          
          (bankItems || []).forEach((bi: any) => {
            if (bi.question) existingQuestionTexts.push(bi.question.trim());
          });
        }
      } catch (e) {
        // Ignore if offline or missing
      }

      // Also gather from local question banks to prevent duplication
      try {
        const localBanks = await db.questionBanks.toArray();
        localBanks.forEach(lb => {
          if (String(lb.unit || '').includes(unitId) || String(lb.title || '').includes(unitId)) {
            (lb.items || []).forEach((item: any) => {
              if (item.question) existingQuestionTexts.push(item.question.trim());
            });
          }
        });
      } catch (e) {}

      // 2. Gather Unit Summaries / Common Misconceptions & Exam Traps
      let misconceptionsText = 'تجنب الوقوع في الأخطاء الشائعة المعتادة واختبر دقة المفاهيم الحساسة.';
      try {
        const cleanName = cleanArabicUnitName(unitId);
        const { data } = await (supabase.from('NewExamSummaries') as any)
          .select('title, summary_text')
          .ilike('title', `%${cleanName || unitId}%`);
        const summaries = data || [];

        if (summaries && summaries.length > 0) {
          misconceptionsText = JSON.stringify(summaries);
        }
      } catch (e) {}

      // Gather local summaries and lessons to enrich traps and concepts
      try {
        const localSummaries = await db.examSummaries.toArray();
        const matched = localSummaries.filter(s => String(s.unit || '').includes(unitId) || String(s.title || '').includes(unitId));
        if (matched.length > 0) {
          misconceptionsText += '\n' + JSON.stringify(matched);
        }

        const localLessons = await db.lessonSections.toArray();
        const matchedLessons = localLessons.filter((l: any) => String(l.unit || l.title || l.conceptLabel || '').includes(unitId));
        if (matchedLessons.length > 0) {
          misconceptionsText += '\nشرح مفاهيم الوحدة:\n' + matchedLessons.map(l => l.content || l.title || '').join('\n');
        }
      } catch (e) {}

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('مفتاح Gemini API غير مهيأ');
      
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `أنت خبير إعداد مناهج رياضية متقدم في المنهاج السوري للرياضيات (الثالث الثانوي العلمي).
قم بتوليد 4 إلى 5 أسئلة موضوعية جديدة كلياً وعالية الجودة (اختيار من متعدد مع 4 خيارات وإجابة صحيحة من 0 إلى 3 وحل تفصيلي) لاختبار الوحدة الشامل.

يُرجى الالتزام الصارم بالشروط التالية:
1. عدم تكرار أي سؤال أو صياغة مشابهة للأسئلة الموجودة مسبقاً في الوحدة أو بنك الأسئلة والمدرجة أدناه.
2. تغطية شاملة لكافة مفاهيم الوحدة المعتمدة أدناه.
3. استهداف دقيق للفخاخ الامتحانية والأخطاء الشائعة في الوحدة والمستخلصة من مراجعة الوحدة الشاملة.
4. تنويع مستويات الصعوبة بدقة من المستوى 1 إلى المستوى 4.
5. استخدام كود LaTeX برمجي دقيق داخل علامة الدولار المفردة $...$ فقط للمصطلحات الرياضية دون إسقاط أي شرطة مائلة.
6. الالتزام بمصطلح "تابع" وتجنب مصطلح دالة، وحظر الجداء الشعاعي الخارجي ورمز السيجما sum.

قائمة المفاهيم المعتمدة للوحدة:
${concepts.length > 0 ? concepts.join(', ') : 'مفاهيم الوحدة العامة'}

الأسئلة الحالية الممنوع تكرارها:
${existingQuestionTexts.slice(-25).join('\n---\n') || 'لا توجد أسئلة سابقة'}

بيانات الأخطاء الشائعة والفخاخ الامتحانية:
${misconceptionsText.substring(0, 2000)}

أجب بصيغة JSON array صارمة حصراً بالشكل التالي:
[
  {
    "questionText": "نص السؤال الرياضي...",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correctOption": "0",
    "concept": "أحد المفاهيم من القائمة أو غير محدد",
    "level": 2,
    "reason": "سبب التصنيف الرياضي التربوي",
    "detailedSolution": "الحل التفصيلي الخطوات والمشتتات..."
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const text = response.text || '';
      const newItems = safeParseJson<any[]>(text);
      if (!Array.isArray(newItems) || newItems.length === 0) {
        throw new Error('فشل استخراج الأسئلة المولدة بصيغة صحيحة من الذكاء الاصطناعي');
      }

      // Populate into review results list (User approval required before saving!)
      const generatedResults: ClassificationResult[] = newItems.map((item: any, idx: number) => ({
        target: {
          id: `ai_gen_${Date.now()}_${idx}`,
          source: 'NewUnitQuizQuestions',
          sectionType: 'comprehensive_quiz',
          questionText: item.questionText,
          options: item.options,
          correctOption: item.correctOption,
          topic: item.concept,
          difficulty: item.level || 2
        },
        proposedLevel: item.level || 2,
        proposedConcept: concepts.includes(item.concept) ? item.concept : (concepts[0] || 'غير محدد'),
        reason: item.reason || 'مفتاح تربوي وفخ امتحاني',
        selected: true
      }));

      setResults(generatedResults);
      showToast('✨ تم توليد الأسئلة الجديدة بنجاح! راجعها ووافق عليها قبل الحفظ أو الترحيل.');
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء توليد الأسئلة الجديدة');
    } finally {
      setClassifying(false);
    }
  };

  const toggleSelectAll = (select: boolean) => {
    setResults(prev => prev.map(r => ({ ...r, selected: select })));
  };

  // Copy Question with options and solution
  const handleCopyQuestion = (res: ClassificationResult) => {
    const textToCopy = `السؤال: ${res.target.questionText}\nالخيار 1: ${res.target.options?.[0] || ''}\nالخيار 2: ${res.target.options?.[1] || ''}\nالخيار 3: ${res.target.options?.[2] || ''}\nالخيار 4: ${res.target.options?.[3] || ''}\nالإجابة الصحيحة: الفهرس رقم ${res.target.correctOption}\nالمستوى: ${res.proposedLevel}\nالمفهوم: ${res.proposedConcept}\nالسبب: ${res.reason}`;
    navigator.clipboard.writeText(textToCopy);
    showToast('📋 تم نسخ السؤال والمشتتات بنجاح إلى الحافظة!');
  };

  // Transfer Selected Questions to Question Bank
  const handleTransferToQuestionBank = async () => {
    const itemsToTransfer = results.filter(r => r.selected);
    if (itemsToTransfer.length === 0) {
      alert('الرجاء تحديد أسئلة لترحيلها إلى بنك الأسئلة.');
      return;
    }

    setTransferring(true);
    setErrorMsg(null);
    try {
      const bankId = await getOrCreateBankForUnit(unitId, 'بنك الأسئلة الموضوعية للوحدة');

      for (const item of itemsToTransfer) {
        const payload: any = {
          bank_id: bankId,
          source_key: `unit_classifier_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          item_type: 'mcq',
          topic: item.proposedConcept !== 'غير محدد' ? item.proposedConcept : 'عام',
          difficulty: item.proposedLevel,
          question: item.target.questionText,
          sub_parts: item.target.options || [],
          correct_index: item.target.correctOption !== undefined ? Number(item.target.correctOption) : 0,
          solution: item.reason || 'الحل النموذجي المعتمد',
          order_index: 1
        };

        await supabase.from('NewQuestionBankItems').upsert(payload, { onConflict: 'bank_id, source_key' });
      }

      showToast(`🚀 تم ترحيل ${itemsToTransfer.length} سؤالاً بنجاح إلى بنك الأسئلة الخاصة بالوحدة!`);
    } catch (e: any) {
      setErrorMsg(e.message || 'حدث خطأ أثناء ترحيل الأسئلة لبنك الأسئلة');
    } finally {
      setTransferring(false);
    }
  };

  const handleSaveApproved = async (onlySelected: boolean) => {
    const itemsToSave = onlySelected ? results.filter(r => r.selected) : results;
    if (itemsToSave.length === 0) {
      alert('لم تقم بتحديد أي أسئلة للاعتماد.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      let totalSaved = 0;
      const levelCounts: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0 };
      let unspecifiedCount = 0;
      const updatedRecords: { id: string; table: string; fields: string[] }[] = [];

      for (const res of itemsToSave) {
        const fieldsUpdated = ['difficulty_level', 'topic'];

        // If it's a newly generated AI question or local quiz item, save to local db.unitQuizzes & Supabase
        if (String(res.target.id).startsWith('ai_gen_')) {
          try {
            let localQuiz = await db.unitQuizzes.filter(q => String(q.unit || '') === String(unitId || '')).first();
            if (!localQuiz) localQuiz = await db.unitQuizzes.orderBy('id').last();

            const formattedOpts = (res.target.options || []).map((o, oIdx) => ({
              id: String(oIdx),
              text: typeof o === 'string' ? o : (o as any)?.text || ''
            }));

            const newQObj: any = {
              id: res.target.id,
              questionNumber: (localQuiz?.questions?.length || 0) + 1,
              questionText: res.target.questionText,
              options: formattedOpts,
              correctOptionId: String(res.target.correctOption || '0'),
              topic: res.proposedConcept,
              difficultyLevel: res.proposedLevel,
              difficulty: res.proposedLevel <= 2 ? 'easy' : res.proposedLevel === 3 ? 'medium' : 'hard'
            };

            if (localQuiz && localQuiz.questions) {
              await db.unitQuizzes.update(localQuiz.id!, {
                questions: [...localQuiz.questions, newQObj]
              });
            } else {
              await db.unitQuizzes.add({
                docId: unitId,
                unit: unitId,
                title: 'اختبار الوحدة الشامل',
                questions: [newQObj],
                createdAt: new Date().toISOString()
              } as any);
            }

            // Also save to Supabase NewUnitQuizQuestions
            const realUnitId = isUuid(unitId) ? unitId : await resolveUnitUuid(unitId);
            let quizId: string | null = null;
            if (realUnitId) {
              const { data: quizzes } = await supabase.from('NewUnitQuizzes').select('id').eq('unit_id', realUnitId).limit(1);
              quizId = quizzes?.[0]?.id || null;
              if (!quizId) {
                const { data: newQz } = await (supabase.from('NewUnitQuizzes') as any).insert({
                  unit_id: realUnitId,
                  title: 'اختبار الوحدة الشامل',
                  total_questions: 1
                }).select('id').single();
                if (newQz) quizId = newQz.id;
              }
            }

            if (quizId) {
              await (supabase.from('NewUnitQuizQuestions') as any).insert({
                quiz_id: quizId,
                question_number: 1,
                question_text: res.target.questionText,
                options: res.target.options,
                correct_option_id: res.target.correctOption,
                topic: res.proposedConcept !== 'غير محدد' ? res.proposedConcept : null,
                difficulty: res.proposedLevel <= 2 ? 'easy' : res.proposedLevel === 3 ? 'medium' : 'hard',
                difficulty_level: res.proposedLevel
              });
            }
          } catch (e) {
            console.warn('Error saving generated question:', e);
          }
        }

        // Update Local IndexedDB
        try {
          const localQuizzes = await db.unitQuizzes.toArray();
          for (const lq of localQuizzes) {
            if (Array.isArray(lq.questions)) {
              let changed = false;
              const updatedQs = lq.questions.map((q: any, qIdx: number) => {
                const qId = String(q.id || `local_q_${lq.id}_${qIdx}`);
                if (qId === res.target.id) {
                  changed = true;
                  return {
                    ...q,
                    difficulty: res.proposedLevel,
                    difficulty_level: res.proposedLevel,
                    topic: res.proposedConcept !== 'غير محدد' ? res.proposedConcept : null
                  };
                }
                return q;
              });
              if (changed && lq.id) {
                await db.unitQuizzes.update(lq.id, { questions: updatedQs });
              }
            }
          }
        } catch (e) {}

        // Update Supabase if source is NewUnitQuizQuestions
        if (res.target.source === 'NewUnitQuizQuestions') {
          await (supabase.from('NewUnitQuizQuestions') as any)
            .update({
              difficulty_level: res.proposedLevel,
              topic: res.proposedConcept !== 'غير محدد' ? res.proposedConcept : null
            })
            .eq('id', res.target.id);
        }

        totalSaved++;
        levelCounts[res.proposedLevel] = (levelCounts[res.proposedLevel] || 0) + 1;
        if (res.proposedConcept === 'غير محدد') unspecifiedCount++;
        updatedRecords.push({
          id: res.target.id,
          table: res.target.source === 'NewUnitQuizQuestions' ? 'NewUnitQuizQuestions' : 'db.unitQuizzes',
          fields: fieldsUpdated
        });
      }

      setDetailedReport({
        totalSaved,
        levelCounts,
        unspecifiedCount,
        updatedRecords
      });
      if (onSavedSuccess) onSavedSuccess();
    } catch (e: any) {
      setErrorMsg(e.message || 'حدث خطأ أثناء حفظ التصنيفات');
    } finally {
      setSaving(false);
    }
  };

  const getLevelBadgeClass = (level: number) => {
    switch (level) {
      case 1: return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 2: return 'bg-blue-100 text-blue-800 border-blue-300';
      case 3: return 'bg-amber-100 text-amber-800 border-amber-300';
      case 4: return 'bg-rose-100 text-rose-800 border-rose-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Toast Notification */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-70 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-xl text-xs font-black animate-in fade-in slide-in-from-top duration-200 flex items-center gap-2">
            <Check size={16} className="text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-900 to-indigo-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-violet-200">
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black">تصنيف أسئلة الوحدة الشاملة والمراجعة الذكية</h2>
              <p className="text-xs text-violet-200 font-bold">توليد مدقق ضد التكرار، تغطية مفاهيم شاملة، استهداف الفخاخ الامتحانية، وترحيل لبنك الأسئلة</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-violet-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar / Controls */}
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 border border-gray-300 rounded-xl shadow-xs">
              <input
                type="checkbox"
                checked={reclassifyAll}
                onChange={(e) => setReclassifyAll(e.target.checked)}
                className="w-4 h-4 text-violet-600 rounded border-gray-300 focus:ring-violet-500"
              />
              <span className="text-xs font-black text-slate-800">إعادة التصنيف للكل (Reclassify All)</span>
            </label>

            <button
              onClick={() => setShowConceptsList(!showConceptsList)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 text-violet-800 rounded-xl text-xs font-black hover:bg-violet-100 transition-all"
            >
              <span>قائمة المفاهيم المعتمدة ({concepts.length})</span>
              {showConceptsList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleGenerateNewAIQuestions}
              disabled={classifying || loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <PlusCircle size={16} />
              <span>إضافة أسئلة جديدة بالذكاء الاصطناعي (مع مراعاة الفخاخ وعدم التكرار)</span>
            </button>

            <button
              onClick={handleStartClassification}
              disabled={loading || classifying || targets.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {classifying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span>{classifying ? 'جاري التحليل...' : 'تصنيف الأسئلة الموجودة'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Concepts Whitelist */}
        {showConceptsList && (
          <div className="p-4 bg-violet-50/70 border-b border-violet-100 animate-in slide-in-from-top duration-200">
            <h4 className="text-xs font-black text-violet-900 mb-2">المفاهيم المعتمدة للوحدة (المرجع الحصري للذكاء الاصطناعي):</h4>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
              {concepts.map((c, idx) => (
                <span key={idx} className="px-2.5 py-1 bg-white border border-violet-200 text-violet-800 rounded-lg text-[11px] font-bold shadow-xs">
                  {c}
                </span>
              ))}
              {concepts.length === 0 && (
                <span className="text-xs text-gray-500 italic">لا توجد مفاهيم مسجلة لهذه الوحدة.</span>
              )}
            </div>
          </div>
        )}

        {/* Progress / Status Bar */}
        {classifying && (
          <div className="p-4 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-indigo-600" />
              <div>
                <p className="text-xs font-black text-indigo-950">جاري المعالجة والتحليل بالذكاء الاصطناعي...</p>
                <p className="text-[11px] text-indigo-700 font-bold">{progressText}</p>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-rose-800 text-xs font-bold">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Main Content: Review Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 size={36} className="animate-spin text-violet-600" />
              <p className="text-xs font-bold text-gray-600">جاري استعلام الأسئلة ومقارنتها...</p>
            </div>
          ) : results.length === 0 && targets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center">
                <HelpCircle size={28} />
              </div>
              <h3 className="text-sm font-black text-gray-700">لا توجد أسئلة حالياً</h3>
              <p className="text-xs text-gray-500 max-w-md">انقر على زر "إضافة أسئلة جديدة بالذكاء الاصطناعي" لتوليد أسئلة احترافية تستهدف الفخاخ والمفاهيم.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-800">النتائج للمراجعة ({results.length > 0 ? results.length : targets.length} سؤال):</span>
                  {results.length > 0 && (
                    <>
                      <button onClick={() => toggleSelectAll(true)} className="text-xs font-bold text-violet-600 hover:underline">تحديد الكل</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => toggleSelectAll(false)} className="text-xs font-bold text-gray-500 hover:underline">إلغاء التحديد</button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {results.length > 0 && (
                    <>
                      <button
                        onClick={handleTransferToQuestionBank}
                        disabled={transferring}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {transferring ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                        <span>ترحيل المحدد إلى بنك الأسئلة</span>
                      </button>

                      <button
                        onClick={() => handleSaveApproved(true)}
                        disabled={saving}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        <span>اعتماد وحفظ المحدد ({results.filter(r => r.selected).length})</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 text-[11px] font-black border-b">
                      {results.length > 0 && <th className="p-3 w-10 text-center">اختيار</th>}
                      <th className="p-3 w-32">المصدر / الإجراء</th>
                      <th className="p-3">نص السؤال والخيارات</th>
                      <th className="p-3 w-32">المستوى (1-4)</th>
                      <th className="p-3 w-48">المفهوم المقترح</th>
                      <th className="p-3">السبب الرياضي والفخ الامتحاني</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-xs">
                    {(results.length > 0 ? results : targets.map(t => ({
                      target: t,
                      proposedLevel: t.difficulty || 2,
                      proposedConcept: t.topic || 'غير محدد',
                      reason: 'في انتظار التصنيف...',
                      selected: true
                    }))).map((res, index) => (
                      <tr key={index} className={`hover:bg-gray-50/80 transition-colors ${res.selected ? 'bg-violet-50/30' : ''}`}>
                        {results.length > 0 && (
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={!!res.selected}
                              onChange={(e) => {
                                const updated = [...results];
                                updated[index].selected = e.target.checked;
                                setResults(updated);
                              }}
                              className="w-4 h-4 text-violet-600 rounded border-gray-300 focus:ring-violet-500"
                            />
                          </td>
                        )}
                        <td className="p-3 font-bold text-gray-600 space-y-2">
                          <span className="px-2 py-1 bg-violet-50 text-violet-800 rounded-lg text-[10px] font-mono border border-violet-200 inline-block">
                            {String(res.target.id).startsWith('ai_gen_') ? 'مُولد بالذكاء الاصطناعي' : 'سؤال الوحدة'}
                          </span>
                          <button
                            onClick={() => handleCopyQuestion(res)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] font-black transition-all cursor-pointer"
                            title="نسخ السؤال والمشتتات مع الحل"
                          >
                            <Copy size={12} />
                            <span>نسخ</span>
                          </button>
                        </td>
                        <td className="p-3 space-y-1.5">
                          <div className="font-bold text-gray-900 leading-relaxed">
                            <MathRenderer content={res.target.questionText} />
                          </div>
                          {res.target.options && res.target.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1 text-[11px] text-gray-700">
                              {res.target.options.map((opt, oIdx) => (
                                <div key={oIdx} className={`px-2 py-1 border rounded-lg ${String(res.target.correctOption) === String(oIdx) ? 'bg-emerald-50 border-emerald-300 font-bold' : 'bg-gray-50 border-gray-200'}`}>
                                  <MathRenderer content={opt} />
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <select
                            value={res.proposedLevel}
                            onChange={(e) => {
                              if (results.length > 0) {
                                const updated = [...results];
                                updated[index].proposedLevel = Number(e.target.value);
                                setResults(updated);
                              }
                            }}
                            className={`w-full px-2.5 py-1.5 border rounded-xl text-xs font-bold outline-none ${getLevelBadgeClass(res.proposedLevel)}`}
                          >
                            <option value={1}>1 - سهل</option>
                            <option value={2}>2 - متوسط</option>
                            <option value={3}>3 - صعب</option>
                            <option value={4}>4 - مهارات عليا</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <select
                            value={res.proposedConcept}
                            onChange={(e) => {
                              if (results.length > 0) {
                                const updated = [...results];
                                updated[index].proposedConcept = e.target.value;
                                setResults(updated);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="غير محدد">غير محدد</option>
                            {concepts.map((c, cIdx) => (
                              <option key={cIdx} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-gray-600 text-[11px] leading-relaxed">
                          {res.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500 font-bold">إجمالي الأسئلة: {results.length > 0 ? results.length : targets.length}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-black transition-all"
          >
            إغلاق
          </button>
        </div>

      </div>

      {/* Detailed Post-Save Report Modal */}
      {detailedReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-60 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-xl w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 border-b pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <BarChart3 size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">تقرير تفصيلي لحفظ وتخزين الأسئلة المعتمدة</h3>
                <p className="text-[11px] text-gray-500 font-bold">تفاصيل الجداول والحقول التي تم تحديثها بناءً على موافقتك</p>
              </div>
            </div>

            <div className="space-y-3 py-2 text-xs">
              <div className="flex justify-between items-center p-3 bg-indigo-50 border border-indigo-200 rounded-xl font-bold">
                <span className="text-indigo-950">إجمالي الأسئلة المعتمدة والمحفوظة:</span>
                <span className="font-mono font-black text-indigo-700 text-sm">{detailedReport.totalSaved} سؤال</span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-bold">
                <div className="p-2.5 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-200">
                  <span>المستوى 1 (سهل): </span>
                  <span className="font-black">{detailedReport.levelCounts[1] || 0}</span>
                </div>
                <div className="p-2.5 bg-blue-50 text-blue-900 rounded-xl border border-blue-200">
                  <span>المستوى 2 (متوسط): </span>
                  <span className="font-black">{detailedReport.levelCounts[2] || 0}</span>
                </div>
                <div className="p-2.5 bg-amber-50 text-amber-900 rounded-xl border border-amber-200">
                  <span>المستوى 3 (صعب): </span>
                  <span className="font-black">{detailedReport.levelCounts[3] || 0}</span>
                </div>
                <div className="p-2.5 bg-rose-50 text-rose-900 rounded-xl border border-rose-200">
                  <span>المستوى 4 (مهارات): </span>
                  <span className="font-black">{detailedReport.levelCounts[4] || 0}</span>
                </div>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                <h4 className="font-black text-gray-900 text-xs">مواقع الحفظ في قاعدة البيانات والذاكرة المحلية:</h4>
                <div className="text-[11px] text-gray-700 space-y-1 font-mono leading-relaxed">
                  <p>• التخزين المحلي: جدول <span className="text-violet-700 font-bold">db.unitQuizzes</span></p>
                  <p>• التخزين السحابي: جدول <span className="text-violet-700 font-bold">NewUnitQuizQuestions</span></p>
                </div>
              </div>

              {detailedReport.updatedRecords.length > 0 && (
                <div className="space-y-1">
                  <p className="font-black text-gray-800">عينات السجلات المحدثة (IDs):</p>
                  <div className="max-h-28 overflow-y-auto space-y-1 p-2 bg-gray-100 rounded-xl font-mono text-[10px]">
                    {detailedReport.updatedRecords.map((rec, idx) => (
                      <div key={idx} className="flex justify-between text-gray-700">
                        <span>ID: {rec.id.substring(0, 8)}...</span>
                        <span className="text-indigo-600 font-bold">[{rec.table}] &rarr; {rec.fields.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setDetailedReport(null);
                onClose();
              }}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
            >
              تم، العودة للاختبار
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
