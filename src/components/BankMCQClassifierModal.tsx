import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { db, QuestionBankItem } from '../db';
import { 
  Star, Sparkles, PlusCircle, Check, Copy, X, Save, Filter, 
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, 
  Loader2, BookOpen, Brain, Zap, HelpCircle, ArrowRight
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { safeParseJson } from '../utils/safeJson';
import { resolveUnitUuid, isUuid, cleanArabicUnitName } from '../utils/unitResolver';
import { fetchUnitDistinctConcepts } from '../services/bankSyncSimple';
import { correctionAgent } from '../services/correctionAgent';

interface Props {
  unitName: string;
  bankTitle: string;
  items: QuestionBankItem[];
  isMCQItem: (item: Partial<QuestionBankItem> | QuestionBankItem) => boolean;
  onClose: () => void;
  onSaveItems: (updatedItems: QuestionBankItem[]) => Promise<void> | void;
}

export const BankMCQClassifierModal: React.FC<Props> = ({
  unitName,
  bankTitle,
  items,
  isMCQItem,
  onClose,
  onSaveItems
}) => {
  const [activeTab, setActiveTab] = useState<'existing' | 'generate'>('existing');
  const [bankMCQList, setBankMCQList] = useState<QuestionBankItem[]>([]);
  const [filterStar, setFilterStar] = useState<string>('all'); // all, unrated, 1, 2, 3, 4, 5
  const [unitConcepts, setUnitConcepts] = useState<string[]>([]);
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  
  // AI Classification of existing items
  const [classifyingExisting, setClassifyingExisting] = useState(false);
  const [reclassifyAll, setReclassifyAll] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState('');

  // AI Generation of new questions
  const [generatingNew, setGeneratingNew] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<Array<QuestionBankItem & { selected: boolean; correct_index: number }>>([]);
  const [genCount, setGenCount] = useState<number>(6);

  // Status & Feedback
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAuditingWithAgent, setIsAuditingWithAgent] = useState(false);
  const [auditingItemId, setAuditingItemId] = useState<string | null>(null);

  // Initialize MCQ items from bank items
  useEffect(() => {
    const mcqs = (items || []).filter(isMCQItem).map(item => ({
      ...item,
      difficulty: Number(item.difficulty) || 0,
      topic: item.topic || unitName || '',
      subParts: item.subParts || ['أ) ...', 'ب) ...', 'ج) ...', 'د) ...']
    }));
    setBankMCQList(mcqs);
  }, [items]);

  // Load Unit Concepts
  useEffect(() => {
    loadConcepts();
  }, [unitName]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadConcepts = async () => {
    setLoadingConcepts(true);
    try {
      const concepts = await fetchUnitDistinctConcepts(unitName);
      setUnitConcepts(concepts);
    } catch (e) {
      console.warn('Error fetching unit concepts:', e);
    } finally {
      setLoadingConcepts(false);
    }
  };

  const getDifficultyLabel = (diff: number) => {
    switch (diff) {
      case 1:
      case 2:
        return { text: 'سهل', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 3:
        return { text: 'متوسط', color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 4:
        return { text: 'صعب', color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 5:
        return { text: 'مهارات تفكير عليا', color: 'text-purple-700 bg-purple-50 border-purple-200' };
      default:
        return { text: 'غير مصنف', color: 'text-gray-500 bg-gray-50 border-gray-200' };
    }
  };

  // 1. AI Classification of Existing Bank MCQs
  const handleClassifyExistingMCQs = async () => {
    setClassifyingExisting(true);
    setErrorMsg(null);
    setClassifyProgress('جاري تحضير الأسئلة والمفاهيم للتحليل...');

    try {
      const targetsToClassify = reclassifyAll 
        ? bankMCQList 
        : bankMCQList.filter(item => !item.difficulty || item.difficulty === 0);

      if (targetsToClassify.length === 0) {
        showToast('كافة الأسئلة مصنفة بالفعل بالنجوم. فعّل "إعادة تصنيف الكل" إذا رغبت بإعادة التقييم.');
        setClassifyingExisting(false);
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('مفتاح Gemini API غير مهيأ');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const batchSize = 6;
      const updatedList = [...bankMCQList];

      for (let i = 0; i < targetsToClassify.length; i += batchSize) {
        const batch = targetsToClassify.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(targetsToClassify.length / batchSize);
        setClassifyProgress(`جاري تصنيف الدفعة ${batchNum} من ${totalBatches} (${i + 1} إلى ${Math.min(i + batchSize, targetsToClassify.length)})...`);

        const prompt = `أنت خبير تربوي في المنهاج السوري للرياضيات (الثالث الثانوي العلمي).
قم بتصنيف الأسئلة الموضوعية التالية من بنك أسئلة الوحدة: "${unitName}".
حدد لكل سؤال:
1. مستوى الصعوبة بنجوم من 1 إلى 5:
   - 1 أو 2 نجوم: سهل (تطبيق مباشر، خطوة واحدة، تذكر قانون أو تعريف).
   - 3 نجوم: متوسط (خطوتان إلى 3 خطوات، مهارة جبرية قياسية، تطبيق مبرهنة).
   - 4 نجوم: صعب (خطوات متعددة، فكرة عميقة، ربط فكرتين، مطب امتحاني شائع).
   - 5 نجوم: مهارات تفكير عليا (استدلال تركيبي، تحليل دقيق، مسألة غير مألوفة).
2. المفهوم الرياضي (اختر من القائمة المعتمدة إن أمكن أو اكتب المفهوم المناسب):
قائمة المفاهيم: ${unitConcepts.slice(0, 30).join(', ') || 'مفاهيم الوحدة'}

الأسئلة:
${batch.map((q, idx) => `###Q ${q.id}
السؤال: ${q.question}
الخيارات: ${(q.subParts || []).join(' | ')}
الحل: ${q.solution || ''}`).join('\n\n')}

أجب بصيغة JSON array فقط بالشكل التالي:
[
  {
    "id": "<id>",
    "difficulty": <رقم صحيح من 1 إلى 5>,
    "topic": "<المفهوم الرياضي>",
    "reason": "<سبب التصنيف باختصار>"
  }
]`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        const text = response.text || '';
        const results = safeParseJson<any[]>(text);

        if (Array.isArray(results)) {
          results.forEach(res => {
            const index = updatedList.findIndex(item => item.id === res.id);
            if (index !== -1) {
              const stars = Math.max(1, Math.min(5, Number(res.difficulty) || 3));
              updatedList[index] = {
                ...updatedList[index],
                difficulty: stars,
                topic: res.topic || updatedList[index].topic || unitName,
                aiGuidance: res.reason || updatedList[index].aiGuidance
              };
            }
          });
        }

        if (i + batchSize < targetsToClassify.length) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      setBankMCQList(updatedList);
      showToast(`✅ تم تصنيف ${targetsToClassify.length} سؤالاً بنجاح وفق معايير النجوم (1-5)!`);
    } catch (err: any) {
      console.error('Error in handleClassifyExistingMCQs:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تصنيف الأسئلة بالذكاء الاصطناعي');
    } finally {
      setClassifyingExisting(false);
      setClassifyProgress('');
    }
  };

  // 2. AI Scan of Active Unit & Generating New Traps-focused MCQs
  const handleScanUnitAndGenerate = async () => {
    setGeneratingNew(true);
    setErrorMsg(null);
    try {
      // 1. Gather all existing question texts from Question Bank to prevent duplication
      const existingBankTexts = bankMCQList.map(item => item.question?.trim() || '').filter(Boolean);

      // 2. Gather existing question texts from Comprehensive Unit Quiz (db.unitQuizzes & NewUnitQuizzes)
      const existingQuizTexts: string[] = [];
      try {
        const localQuizzes = await db.unitQuizzes.toArray();
        localQuizzes.forEach(lq => {
          if (String(lq.unit || '').includes(unitName) || String(lq.title || '').includes(unitName)) {
            (lq.questions || []).forEach((q: any) => {
              if (q.text) existingQuizTexts.push(q.text.trim());
              if (q.questionText) existingQuizTexts.push(q.questionText.trim());
            });
          }
        });
      } catch (e) {}

      // Supabase Unit Quiz deduplication
      try {
        const realUnitId = isUuid(unitName) ? unitName : await resolveUnitUuid(unitName);
        let qzIds: string[] = [];
        if (realUnitId) {
          const { data: qz } = await supabase.from('NewUnitQuizzes').select('id').eq('unit_id', realUnitId);
          qzIds = (qz || []).map((x: any) => x.id);
        } else {
          const clean = cleanArabicUnitName(unitName);
          const { data: qz } = await supabase.from('NewUnitQuizzes').select('id').ilike('title', `%${clean || unitName}%`);
          qzIds = (qz || []).map((x: any) => x.id);
        }

        if (qzIds.length > 0) {
          const { data: qzItems } = await supabase.from('NewUnitQuizQuestions').select('question_text').in('quiz_id', qzIds);
          (qzItems || []).forEach((qi: any) => {
            if (qi.question_text) existingQuizTexts.push(qi.question_text.trim());
          });
        }
      } catch (e) {}

      // 3. Scan Unit Explanations ("شرح الدروس") & Exam Summaries ("الملخص النظري المنسق للوحدة")
      let unitContentForAI = '';

      // Local summaries & traps
      try {
        const localSummaries = await db.examSummaries.toArray();
        const matchedSummaries = localSummaries.filter(s => String(s.unit || '').includes(unitName) || String(s.title || '').includes(unitName));
        if (matchedSummaries.length > 0) {
          unitContentForAI += '\n[ملخص الوحدة والمطبات والفخاخ الامتحانية]:\n' + JSON.stringify(matchedSummaries).substring(0, 3000);
        }
      } catch (e) {}

      // Local lesson sections
      try {
        const localLessons = await db.lessonSections.toArray();
        const matchedLessons = localLessons.filter((l: any) => String(l.unit || l.title || l.conceptLabel || '').includes(unitName));
        if (matchedLessons.length > 0) {
          unitContentForAI += '\n[شرح الدروس والمفاهيم]:\n' + matchedLessons.map(l => `${l.title || ''}: ${l.content || ''}`).join('\n').substring(0, 3000);
        }
      } catch (e) {}

      // Remote exam summaries if available
      try {
        const clean = cleanArabicUnitName(unitName);
        const { data } = await (supabase.from('NewExamSummaries') as any)
          .select('title, summary_text')
          .ilike('title', `%${clean || unitName}%`);
        const remoteSummaries = data || [];

        if (remoteSummaries.length > 0) {
          unitContentForAI += '\n[بيانات الفخاخ الامتحانية من السحابة]:\n' + JSON.stringify(remoteSummaries).substring(0, 2000);
        }
      } catch (e) {}

      const allForbiddenTexts = [...existingBankTexts, ...existingQuizTexts];

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('مفتاح Gemini API غير مهيأ');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `أنت خبير إعداد بنوك الأسئلة للمنهاج السوري للرياضيات (الثالث الثانوي العلمي).
قم بتحليل ومسح شامل للوحدة الدراسية: "${unitName}".
المرجع الأساسي المعتمد هو شرح الدروس والملخص النظري المنسق للوحدة والفخاخ الامتحانية والمطبات أدناه:

${unitContentForAI.substring(0, 4500) || 'شرح مفاهيم الوحدة الدراسية'}

قواعد صارمة وإجبارية:
1. منع التكرار التام: يُحظر نهائياً إعادة صياغة أو تكرار أي سؤال موجود في أسئلة بنك الأسئلة أو في اختبار الوحدة الشامل والمدرجة أدناه.
2. استهداف الفخاخ والمطبات: صياغة أسئلة تركز على المفاهيم الحساسة، الأخطاء الشائعة، الفخاخ الامتحانية التي يقع فيها الطلاب، والمشتتات الذكية.
3. معايير الصعوبة بالنجوم (1 إلى 5):
   - 1 أو 2 نجوم: سهل
   - 3 نجوم: متوسط
   - 4 نجوم: صعب
   - 5 نجوم: مهارات تفكير عليا
   يجب تنويع الأسئلة لتشمل كافة المستويات من السهل إلى المهارات العليا.
4. سلامة LaTeX الرياضي: كتابة المعادلات داخل علامة الدولار المفردة $...$ حصراً، مع الحفاظ الكامل على كافة الأوامر البرمجية والشرطات المائلة (مثل \\frac, \\sqrt, \\lim, \\to, \\ln, \\exp, \\vec, \\overrightarrow, \\alpha, \\beta).
5. الالتزام بالمنهاج السوري: استخدام مصطلح "تابع" حصراً، منع الجداء الشعاعي الخارجي، منع رمز السيجما sum للمجاميع.
6. توليد عدد ${genCount} أسئلة موضوعية (اختيار من متعدد MCQ) مع 4 خيارات (أ، ب، ج، د)، رقم الخيار الصحيح (index من 0 إلى 3)، حل نموذجي تفصيلي، وتصنيف المفهوم ومستوى النجوم.

الأسئلة الحالية الممنوع تكرارها مطلقاً:
${allForbiddenTexts.slice(-30).join('\n---\n') || 'لا توجد أسئلة سابقة'}

أجب بصيغة JSON array فقط بالشكل التالي:
[
  {
    "question": "نص السؤال الرياضي...",
    "subParts": ["أ) ...", "ب) ...", "ج) ...", "د) ..."],
    "correct_index": 0,
    "difficulty": 3,
    "topic": "المفهوم الرياضي",
    "solution": "الحل النموذجي المعتمد وتفسير المشتتات والخطوات..."
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const text = response.text || '';
      const newItems = safeParseJson<any[]>(text);

      if (!Array.isArray(newItems) || newItems.length === 0) {
        throw new Error('فشل توليد وتنسيق الأسئلة الذكية من الذكاء الاصطناعي');
      }

      const formatted = newItems.map((item: any, idx: number) => ({
        id: crypto.randomUUID(),
        order: bankMCQList.length + idx + 1,
        type: 'mcq' as const,
        question: item.question || '',
        subParts: Array.isArray(item.subParts) && item.subParts.length === 4 
          ? item.subParts 
          : ['أ) ...', 'ب) ...', 'ج) ...', 'د) ...'],
        correct_index: Number(item.correct_index) || 0,
        difficulty: Math.max(1, Math.min(5, Number(item.difficulty) || 3)),
        topic: item.topic || unitName,
        solution: item.solution || 'الحل النموذجي المعتمد',
        selected: true
      }));

      // تشغيل الوكيل المحكّم والمدقق العلمي والرياضي (Layer 4 Agent) لتدقيق LaTeX والحلول قبل العرض
      showToast('🤖 جاري تدقيق الصياغة ورموز LaTeX رياضياً ومنطقياً بواسطة Agent...');
      let finalItems = formatted;
      try {
        const audited = await correctionAgent.auditAndCorrectQuestionBankItems(formatted, {
          unitTitle: unitName
        });
        if (Array.isArray(audited) && audited.length > 0) {
          finalItems = audited.map((it: any) => ({ ...it, selected: true }));
        }
      } catch (agentErr) {
        console.warn('Critic agent fallback to initial formatted items:', agentErr);
      }

      setGeneratedItems(finalItems);
      setActiveTab('generate');
      showToast(`✨ تم تدقيق واعتماد عدد ${finalItems.length} أسئلة جديدة بنجاح بواسطة Agent!`);
    } catch (err: any) {
      console.error('Error in handleScanUnitAndGenerate:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء مسح الوحدة وتوليد الأسئلة');
    } finally {
      setGeneratingNew(false);
    }
  };

  // تدقيق سؤال مفرد في بنك الأسئلة الحالي بواسطة الوكيل
  const handleAuditBankItem = async (itemId: string) => {
    const target = bankMCQList.find(i => i.id === itemId);
    if (!target) return;
    setAuditingItemId(itemId);
    setIsAuditingWithAgent(true);
    showToast('🤖 جاري تدقيق السؤال والحل وصيغ LaTeX بواسطة Agent...');
    try {
      const audited = await correctionAgent.auditAndCorrectQuestionBankItems([target], {
        unitTitle: unitName
      });
      if (Array.isArray(audited) && audited.length > 0) {
        setBankMCQList(prev => prev.map(i => i.id === itemId ? { ...i, ...audited[0] } : i));
        showToast('✨ تم تدقيق وتصحيح السؤال والحل بنجاح بواسطة Agent!');
      }
    } catch (e: any) {
      console.warn('Bank item audit error:', e);
      showToast('تعذر التدقيق بـ Agent، يرجى المحاولة لاحقاً');
    } finally {
      setIsAuditingWithAgent(false);
      setAuditingItemId(null);
    }
  };

  // تدقيق كافة الأسئلة في بنك الأسئلة الحالي بواسطة الوكيل
  const handleAuditAllBankItems = async () => {
    if (bankMCQList.length === 0) return;
    setIsAuditingWithAgent(true);
    showToast('🤖 جاري تدقيق وفحص كافة أسئلة البنك والحلول رياضياً ولاتكس بواسطة Agent...');
    try {
      const audited = await correctionAgent.auditAndCorrectQuestionBankItems(bankMCQList, {
        unitTitle: unitName
      });
      if (Array.isArray(audited) && audited.length > 0) {
        setBankMCQList(audited);
        showToast(`✨ تم تدقيق كافة أسئلة البنك (${audited.length} سؤال) بنجاح بواسطة Agent!`);
      }
    } catch (e: any) {
      console.warn('Audit all bank items error:', e);
      showToast('حدث خطأ أثناء تدقيق أسئلة البنك');
    } finally {
      setIsAuditingWithAgent(false);
    }
  };

  // تدقيق سؤال مفرد في القائمة المولدة
  const handleAuditGeneratedItem = async (itemId: string) => {
    const target = generatedItems.find(i => i.id === itemId);
    if (!target) return;
    setAuditingItemId(itemId);
    setIsAuditingWithAgent(true);
    showToast('🤖 جاري تدقيق السؤال والحل وصيغ LaTeX بواسطة Agent...');
    try {
      const audited = await correctionAgent.auditAndCorrectQuestionBankItems([target], {
        unitTitle: unitName
      });
      if (Array.isArray(audited) && audited.length > 0) {
        setGeneratedItems(prev => prev.map(i => i.id === itemId ? { ...i, ...audited[0], selected: i.selected } : i));
        showToast('✨ تم تدقيق وتصحيح السؤال والحل بنجاح!');
      }
    } catch (e: any) {
      console.warn('Audit generated item error:', e);
    } finally {
      setIsAuditingWithAgent(false);
      setAuditingItemId(null);
    }
  };

  // Copy generated or approved questions to clipboard
  const handleCopyQuestions = (itemsToCopy: any[], label: string) => {
    try {
      const text = itemsToCopy.map((item, idx) => {
        const starStr = '★'.repeat(item.difficulty || 3) + '☆'.repeat(5 - (item.difficulty || 3));
        const diffLabel = getDifficultyLabel(item.difficulty || 3).text;
        return `[السؤال ${idx + 1}] (${diffLabel} - ${starStr})
المفهوم: ${item.topic || unitName}
${item.question}
الخيارات:
${(item.subParts || []).map((opt: string, optIdx: number) => `  ${optIdx === (item.correct_index ?? 0) ? '✔' : ' '} ${opt}`).join('\n')}
الحل النموذجي:
${item.solution || ''}
----------------------------------------`;
      }).join('\n\n');

      navigator.clipboard.writeText(text);
      showToast(`📋 تم نسخ ${itemsToCopy.length} سؤالاً بنجاح إلى الحافظة!`);
    } catch (e) {
      showToast('تعذر النسخ التلقائي إلى الحافظة.');
    }
  };

  // Approve and Add Generated Questions to the Bank
  const handleApproveAndAddGenerated = () => {
    const selected = generatedItems.filter(item => item.selected);
    if (selected.length === 0) {
      alert('الرجاء تحديد سؤال واحد على الأقل للموافقة والاعتماد.');
      return;
    }

    const newBankItems: QuestionBankItem[] = selected.map((item, idx) => ({
      id: item.id,
      order: bankMCQList.length + idx + 1,
      type: 'mcq',
      question: item.question,
      subParts: item.subParts,
      solution: item.solution,
      topic: item.topic || unitName,
      difficulty: item.difficulty,
      aiGuidance: `تم توليده بمسح الوحدة والفخاخ الامتحانية (تقييم: ${item.difficulty} نجوم)`
    }));

    setBankMCQList(prev => [...prev, ...newBankItems]);
    setGeneratedItems([]);
    setActiveTab('existing');
    showToast(`✅ تم اعتماد وإضافة ${newBankItems.length} سؤالاً جديداً إلى بنك الأسئلة! لا تنسَ حفظ التغييرات.`);
  };

  // Save changes to parent & database
  const handleFinalSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      // Keep existing non-MCQ items from parent items, and replace MCQs with bankMCQList
      const nonMCQs = (items || []).filter(item => !isMCQItem(item));
      const combined = [...bankMCQList, ...nonMCQs];

      await onSaveItems(combined);
      showToast('💾 تم حفظ تصنيفات النجوم والأسئلة بنجاح في بنك الأسئلة وقاعدة البيانات!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e: any) {
      setErrorMsg(e.message || 'حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  };

  // Filter existing MCQs by Star count
  const filteredMCQList = bankMCQList.filter(item => {
    if (filterStar === 'all') return true;
    if (filterStar === 'unrated') return !item.difficulty || item.difficulty === 0;
    return item.difficulty === Number(filterStar);
  });

  // Calculate statistics
  const stats = {
    total: bankMCQList.length,
    easy: bankMCQList.filter(i => i.difficulty === 1 || i.difficulty === 2).length,
    medium: bankMCQList.filter(i => i.difficulty === 3).length,
    hard: bankMCQList.filter(i => i.difficulty === 4).length,
    higher: bankMCQList.filter(i => i.difficulty === 5).length,
    unrated: bankMCQList.filter(i => !i.difficulty || i.difficulty === 0).length
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6" dir="rtl">
      <div className="bg-white rounded-3xl border border-gray-200 w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Toast Alert */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-70 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-xl text-xs font-black animate-in fade-in slide-in-from-top duration-200 flex items-center gap-2">
            <Check size={16} className="text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-black">تصنيف أسئلة بنك الوحدة بالذكاء الاصطناعي (معايير النجوم 1-5)</h2>
                <span className="bg-violet-700/60 text-violet-200 text-xs px-2.5 py-0.5 rounded-full font-bold border border-violet-500/30">
                  {unitName || bankTitle || 'الوحدة النشطة'}
                </span>
              </div>
              <p className="text-xs text-violet-200 font-bold mt-0.5">
                تصنيف موضوعي دقيق لأسئلة البنك فقط، فحص الفخاخ والمطبات، وحظر التكرار مع اختبار الوحدة الشامل
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-violet-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs and Navigation */}
        <div className="px-6 py-2.5 bg-slate-100 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('existing')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'existing'
                  ? 'bg-white text-indigo-900 shadow-sm border border-gray-200 ring-2 ring-indigo-50'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <BookOpen size={15} />
              <span>أسئلة البنك الموضوعية الحالية ({bankMCQList.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('generate')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'generate'
                  ? 'bg-white text-violet-900 shadow-sm border border-gray-200 ring-2 ring-violet-50'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Brain size={15} className="text-violet-600" />
              <span>توليد أسئلة جديدة بمسح الوحدة ({generatedItems.length})</span>
              {generatedItems.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </button>
          </div>

          {/* Quick Stats Pills */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200">
              سهل (1-2★): {stats.easy}
            </span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-lg border border-blue-200">
              متوسط (3★): {stats.medium}
            </span>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-lg border border-amber-200">
              صعب (4★): {stats.hard}
            </span>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-lg border border-purple-200">
              عليا (5★): {stats.higher}
            </span>
            {stats.unrated > 0 && (
              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-lg border border-rose-200">
                غير مصنف: {stats.unrated}
              </span>
            )}
          </div>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800 font-bold">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
              <X size={14} />
            </button>
          </div>
        )}

        {/* TAB 1: Existing MCQs Classification */}
        {activeTab === 'existing' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-500">تصفية حسب النجوم:</span>
                <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-xs">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'unrated', label: 'بدون نجوم' },
                    { id: '1', label: '1★' },
                    { id: '2', label: '2★' },
                    { id: '3', label: '3★' },
                    { id: '4', label: '4★' },
                    { id: '5', label: '5★' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterStar(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        filterStar === tab.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 border border-gray-200 rounded-xl shadow-xs text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={reclassifyAll}
                    onChange={(e) => setReclassifyAll(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded"
                  />
                  <span>إعادة تصنيف الكل (Reclassify All)</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyQuestions(bankMCQList, 'أسئلة البنك')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-black transition-all shadow-xs"
                  title="نسخ جميع الأسئلة الموضوعية الحالية مع خياراتها وحلولها"
                >
                  <Copy size={14} />
                  <span>نسخ الأسئلة</span>
                </button>

                <button
                  onClick={handleAuditAllBankItems}
                  disabled={isAuditingWithAgent || bankMCQList.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 rounded-xl text-xs font-black transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  title="تدقيق كافة أسئلة البنك والحلول ورموز LaTeX رياضياً ومنطقياً عبر الوكيل"
                >
                  {isAuditingWithAgent && !auditingItemId ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>تدقيق كافة الأسئلة بـ Agent</span>
                </button>

                <button
                  onClick={handleClassifyExistingMCQs}
                  disabled={classifyingExisting || bankMCQList.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  {classifyingExisting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  <span>{classifyingExisting ? classifyProgress || 'جاري التصنيف...' : 'بدء تصنيف الأسئلة بالذكاء الاصطناعي'}</span>
                </button>
              </div>
            </div>

            {/* List of Existing MCQs */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-gray-50/50">
              {filteredMCQList.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                  <HelpCircle size={40} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm font-bold text-gray-600">لا توجد أسئلة موضوعية تطابق التصفية المحددة في هذا البنك.</p>
                  <p className="text-xs text-gray-400 font-bold mt-1">يمكنك استخدام زر "توليد أسئلة جديدة بمسح الوحدة" لإضافة أسئلة موضوعية ذكية.</p>
                </div>
              ) : (
                filteredMCQList.map((item, idx) => {
                  const diffBadge = getDifficultyLabel(item.difficulty || 0);
                  return (
                    <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3 transition-all hover:shadow-md">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          
                          {/* Topic Input */}
                          <input
                            type="text"
                            value={item.topic || ''}
                            onChange={(e) => {
                              const updated = [...bankMCQList];
                              const targetIndex = updated.findIndex(i => i.id === item.id);
                              if (targetIndex !== -1) {
                                updated[targetIndex].topic = e.target.value;
                                setBankMCQList(updated);
                              }
                            }}
                            placeholder="المفهوم الرياضي..."
                            className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 min-w-[180px] focus:ring-1 focus:ring-indigo-500"
                          />

                          <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${diffBadge.color}`}>
                            {diffBadge.text}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleAuditBankItem(item.id)}
                            disabled={isAuditingWithAgent}
                            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            title="تدقيق هذا السؤال وحله بالكامل رياضياً ولاتكس بواسطة Agent"
                          >
                            {auditingItemId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            <span>تدقيق بـ Agent</span>
                          </button>
                        </div>

                        {/* Interactive 5-Star Rating Widget */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-gray-200 px-3 py-1.5 rounded-xl">
                          <span className="text-xs font-bold text-gray-600">تصنيف النجوم:</span>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => {
                                  const updated = [...bankMCQList];
                                  const targetIndex = updated.findIndex(i => i.id === item.id);
                                  if (targetIndex !== -1) {
                                    updated[targetIndex].difficulty = star;
                                    setBankMCQList(updated);
                                  }
                                }}
                                className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                                title={`${star} نجوم`}
                              >
                                <Star
                                  size={18}
                                  className={
                                    star <= (item.difficulty || 0)
                                      ? 'text-amber-500 fill-amber-500'
                                      : 'text-gray-300'
                                  }
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Question Text */}
                      <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 text-xs font-bold text-gray-900 leading-relaxed">
                        <MathRenderer content={item.question} />
                      </div>

                      {/* 4 MCQ Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(item.subParts || []).map((opt, optIdx) => (
                          <div key={optIdx} className="p-2.5 bg-white border border-gray-200 rounded-xl flex items-center gap-2 text-gray-800">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                              {['أ', 'ب', 'ج', 'د'][optIdx] || optIdx + 1}
                            </span>
                            <div className="flex-1 overflow-hidden">
                              <MathRenderer content={opt} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Solution */}
                      {item.solution && (
                        <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs text-emerald-950 font-bold">
                          <span className="text-emerald-700 font-black block mb-1">الحل النموذجي:</span>
                          <MathRenderer content={item.solution} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AI Unit Scan & New Questions Generator */}
        {activeTab === 'generate' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Generator Action Header */}
            <div className="p-4 bg-violet-50/60 border-b border-violet-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-700">عدد الأسئلة المراد توليدها:</span>
                <select
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                  className="bg-white border border-violet-200 rounded-xl px-3 py-1.5 text-xs font-bold text-violet-900 shadow-xs"
                >
                  <option value={4}>4 أسئلة</option>
                  <option value={6}>6 أسئلة (موصى به)</option>
                  <option value={8}>8 أسئلة</option>
                  <option value={10}>10 أسئلة</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleScanUnitAndGenerate}
                  disabled={generatingNew}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  {generatingNew ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-amber-300" />}
                  <span>{generatingNew ? 'جاري مسح الوحدة والفخاخ وتوليد الأسئلة...' : 'مسح الوحدة وتوليد باقة جديدة (مع الفخاخ وبدون تكرار)'}</span>
                </button>
              </div>
            </div>

            {/* Generated Items Review List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-gray-50/50">
              {generatedItems.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-violet-200 p-12 text-center">
                  <Brain size={44} className="mx-auto text-violet-400 mb-3" />
                  <h4 className="text-base font-black text-violet-950 mb-1">توليد متقدم مبني على مسح الوحدة النشطة</h4>
                  <p className="text-xs text-gray-500 font-bold max-w-xl mx-auto leading-relaxed">
                    يقوم المحرك الذكي بمسح شروحات الدروس ومطبات وفخاخ الملخص النظري، مع التحقق الإجباري الصارم من منع تكرار أي سؤال موجود في هذا البنك أو في اختبار الوحدة الشامل.
                  </p>
                  <button
                    onClick={handleScanUnitAndGenerate}
                    disabled={generatingNew}
                    className="mt-5 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black shadow-md inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles size={15} />
                    <span>ابدأ مسح الوحدة والتوليد الآن</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-xs font-bold text-gray-700">
                      الأسئلة المولدة للمراجعة: {generatedItems.filter(q => q.selected).length} محددة للاعتماد من أصل {generatedItems.length}
                    </span>
                    <button
                      onClick={() => handleCopyQuestions(generatedItems, 'الأسئلة المولدة')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-black shadow-xs cursor-pointer"
                    >
                      <Copy size={13} />
                      <span>نسخ الباقة المولدة كاملة</span>
                    </button>
                  </div>

                  {generatedItems.map((item, idx) => (
                    <div 
                      key={item.id} 
                      className={`bg-white rounded-2xl border p-5 shadow-xs space-y-3 transition-all ${
                        item.selected ? 'border-violet-300 ring-2 ring-violet-50' : 'border-gray-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) => {
                                const updated = [...generatedItems];
                                updated[idx].selected = e.target.checked;
                                setGeneratedItems(updated);
                              }}
                              className="w-4 h-4 text-violet-600 rounded"
                            />
                            <span className="text-xs font-black text-indigo-900">سؤال #{idx + 1}</span>
                          </label>

                          <input
                            type="text"
                            value={item.topic || ''}
                            onChange={(e) => {
                              const updated = [...generatedItems];
                              updated[idx].topic = e.target.value;
                              setGeneratedItems(updated);
                            }}
                            placeholder="المفهوم..."
                            className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 min-w-[150px]"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAuditGeneratedItem(item.id)}
                            disabled={isAuditingWithAgent}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                            title="تدقيق هذا السؤال وحله بالكامل رياضياً ولاتكس بواسطة Agent"
                          >
                            {auditingItemId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            <span>تدقيق بـ Agent</span>
                          </button>

                          {/* Editable 1-5 Stars */}
                          <div className="flex items-center gap-2 bg-slate-50 border border-gray-200 px-3 py-1 rounded-xl">
                            <span className="text-xs font-bold text-gray-600">النجوم:</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => {
                                    const updated = [...generatedItems];
                                    updated[idx].difficulty = star;
                                    setGeneratedItems(updated);
                                  }}
                                  className="p-0.5"
                                >
                                  <Star
                                    size={17}
                                    className={
                                      star <= item.difficulty
                                        ? 'text-amber-500 fill-amber-500'
                                        : 'text-gray-300'
                                    }
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Question Textarea */}
                      <div>
                        <span className="text-[11px] font-bold text-gray-500 block mb-1">نص السؤال (يدعم LaTeX داخل $...$):</span>
                        <textarea
                          value={item.question}
                          onChange={(e) => {
                            const updated = [...generatedItems];
                            updated[idx].question = e.target.value;
                            setGeneratedItems(updated);
                          }}
                          rows={2}
                          className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>

                      {/* Options Grid */}
                      <div>
                        <span className="text-[11px] font-bold text-gray-500 block mb-1">الخيارات الأربعة (حدد زر الخيار الصحيح):</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(item.subParts || []).map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct_radio_${item.id}`}
                                checked={item.correct_index === optIdx}
                                onChange={() => {
                                  const updated = [...generatedItems];
                                  updated[idx].correct_index = optIdx;
                                  setGeneratedItems(updated);
                                }}
                                className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                title="تحديد كإجابة صحيحة"
                              />
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const updated = [...generatedItems];
                                  updated[idx].subParts[optIdx] = e.target.value;
                                  setGeneratedItems(updated);
                                }}
                                className={`w-full text-xs bg-gray-50 border rounded-xl px-2.5 py-1.5 ${
                                  item.correct_index === optIdx 
                                    ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-950' 
                                    : 'border-gray-200'
                                }`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Solution */}
                      <div>
                        <span className="text-[11px] font-bold text-gray-500 block mb-1">الحل النموذجي المعتمد وتفسير المشتت:</span>
                        <textarea
                          value={item.solution}
                          onChange={(e) => {
                            const updated = [...generatedItems];
                            updated[idx].solution = e.target.value;
                            setGeneratedItems(updated);
                          }}
                          rows={2}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Approve and Add Button */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-black text-emerald-900">اعتماد الأسئلة المحددة</h5>
                      <p className="text-[11px] text-emerald-700 font-bold">لا تتم الإضافة للبنك إلا بعد موافقتك الصريحة.</p>
                    </div>
                    <button
                      onClick={handleApproveAndAddGenerated}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Check size={16} />
                      <span>اعتماد وإضافة الأسئلة المختارة للبنك</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer / Final Save */}
        <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all cursor-pointer"
          >
            إغلاق
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleFinalSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>حفظ التصنيفات والتعديلات في البنك</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
