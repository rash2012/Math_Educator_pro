
import { supabase } from '../services/supabaseClient';

export const STAR_TO_LEVEL: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

export interface BankItem {
  id: string;
  topic: string;
  difficulty: number;
  question: string;
  subParts: string[];
  solution: string;
  aiGuidance?: string;
  order: number;
  type: 'mcq' | 'essay';
  svgCode?: string;
}

export interface BankData {
  title: string;
  grade?: string;
  subject?: string;
  part?: string;
  unit?: string;
  country?: string;
  items: BankItem[];
}

export interface PreviewStats {
  totalItems: number;
  nativeMcqCount: number;
  essayCount: number;
  totalCandidates: number;
  starsDistribution: Record<number, number>;
  levelDistribution: Record<number, number>;
  matchedUnitId: string | null;
  matchedUnitName: string | null;
  matchedSubjectName: string | null;
  matchedGradeName: string | null;
  error?: string;
}

export const analyzeBankFile = async (data: BankData): Promise<PreviewStats> => {
  let nativeMcqCount = 0;
  let essayCount = 0;
  let totalCandidates = 0;
  const starsDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const levelDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  const items = data.items || [];

  items.forEach(item => {
    let stars = Number(item.difficulty) || 3;
    if (stars < 1 || stars > 5) {
      console.warn(`[Stars Clamp] Item ${item.id} difficulty ${stars} clamped to 1..5`);
      stars = Math.max(1, Math.min(5, stars));
    }

    starsDistribution[stars] = (starsDistribution[stars] || 0) + 1;
    const level = STAR_TO_LEVEL[stars] || 1;
    levelDistribution[level] = (levelDistribution[level] || 0) + 1;

    if (item.type === 'mcq') {
      nativeMcqCount++;
      totalCandidates++;
    } else if (item.type === 'essay') {
      essayCount++;
      const subPartsCount = item.subParts && Array.isArray(item.subParts) ? item.subParts.length : 0;
      totalCandidates += subPartsCount;
    }
  });

  // Strict Unit Matching in NewUnits by: (اسم الوحدة + المادة + الصف)
  let matchedUnitId: string | null = null;
  let matchedUnitName: string | null = null;
  let matchedSubjectName: string | null = null;
  let matchedGradeName: string | null = null;
  let error: string | undefined = undefined;

  try {
    const rawUnit = (data.unit || '').trim();
    const rawSubject = (data.subject || 'الرياضيات').trim();
    const rawGrade = (data.grade || 'الثالث الثانوي العلمي').trim();

    const normalize = (s: string) => s.replace(/[-:ـ\s]+/g, ' ').trim().toLowerCase();

    // Extract core distinctive title (e.g. from "الوحدة الثالثة - المستقيمات والمستويات في الفراغ" -> "المستقيمات والمستويات في الفراغ")
    const parts = rawUnit.split(/[-:]/);
    const specificTitle = parts.length > 1 ? parts.slice(1).join(' ').trim() : rawUnit;
    const normSpecific = normalize(specificTitle);
    const normRawUnit = normalize(rawUnit);

    // 1. Fetch Subject & Grade context
    const { data: allSubjects, error: subjErr } = await supabase
      .from('NewSubjects')
      .select('id, name, grade_level_id');

    if (subjErr) throw subjErr;

    const { data: allGrades, error: gradeErr } = await supabase
      .from('NewGradeLevels')
      .select('id, name');

    if (gradeErr) throw gradeErr;

    // Filter subjects for the matching grade
    const matchedGrade = allGrades?.find(g => normalize(g.name).includes(normalize(rawGrade)) || normalize(rawGrade).includes(normalize(g.name)));
    const candidateSubjects = allSubjects?.filter(s => {
      const nameMatch = normalize(s.name).includes(normalize(rawSubject)) || normalize(rawSubject).includes(normalize(s.name));
      if (matchedGrade) {
        return nameMatch && s.grade_level_id === matchedGrade.id;
      }
      return nameMatch;
    });

    const subjectIds = candidateSubjects && candidateSubjects.length > 0 
      ? candidateSubjects.map(s => s.id) 
      : (allSubjects || []).map(s => s.id);

    // 2. Fetch units for these subjects
    let unitQuery = supabase.from('NewUnits').select('id, name, subject_id, book_part');
    if (subjectIds.length > 0) {
      unitQuery = unitQuery.in('subject_id', subjectIds);
    }
    const { data: candidateUnits, error: unitErr } = await unitQuery;

    if (unitErr) throw unitErr;

    if (candidateUnits && candidateUnits.length > 0) {
      // Find exact unit that contains the distinctive title (e.g. "المستقيمات والمستويات في الفراغ")
      // NEVER match a unit whose title doesn't match the specific title keywords!
      let found = candidateUnits.find(u => {
        const uNorm = normalize(u.name);
        return uNorm === normRawUnit || uNorm === normSpecific;
      });

      if (!found && specificTitle) {
        found = candidateUnits.find(u => {
          const uNorm = normalize(u.name);
          // Make sure it contains "المستقيمات والمستويات" or distinctive tokens
          return uNorm.includes(normSpecific) || normSpecific.includes(uNorm);
        });
      }

      // If still not found and rawUnit has multiple key words (e.g. "المستقيمات", "الفراغ")
      if (!found && specificTitle.includes(' ')) {
        const keyTokens = specificTitle.split(/\s+/).filter(w => w.length > 2 && !['في', 'من', 'على', 'إلى', 'مع'].includes(w));
        found = candidateUnits.find(u => {
          const uNorm = normalize(u.name);
          const matchedCount = keyTokens.filter(t => uNorm.includes(normalize(t))).length;
          return matchedCount >= 2;
        });
      }

      if (found) {
        matchedUnitId = found.id;
        matchedUnitName = found.name;
        const subj = allSubjects?.find(s => s.id === found.subject_id);
        matchedSubjectName = subj?.name || rawSubject;
        matchedGradeName = matchedGrade?.name || rawGrade;
      } else {
        error = `لم يتم العثور على وحدة مطابقة لـ "${rawUnit}" ضمن مادة "${rawSubject}" وصف "${rawGrade}". تم إيقاف العملية لمنع إنشاء أي وحدة جديدة.`;
      }
    } else {
      error = `لم يتم العثور على أي وحدات مسجلة لمادة "${rawSubject}". يرجى التأكد من مزامنة المنهج أولاً.`;
    }
  } catch (e: any) {
    console.error('Error matching unit:', e);
    error = `خطأ أثناء البحث عن الوحدة في قاعدة البيانات: ${e.message || e}`;
  }

  return {
    totalItems: items.length,
    nativeMcqCount,
    essayCount,
    totalCandidates,
    starsDistribution,
    levelDistribution,
    matchedUnitId,
    matchedUnitName,
    matchedSubjectName,
    matchedGradeName,
    error,
  };
};
