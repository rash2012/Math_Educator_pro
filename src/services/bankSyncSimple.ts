import { supabase } from './supabaseClient';
import { resolveUnitUuid, isUuid } from '../utils/unitResolver';

export const STAR_TO_LEVEL: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

export interface RawJsonItem {
  id: string;
  topic?: string;
  difficulty?: number;
  question: string;
  subParts?: string[];
  solution?: string;
  aiGuidance?: string;
  order?: number;
  type?: 'mcq' | 'essay';
  svgCode?: string;
}

export interface RawBankJson {
  title: string;
  grade?: string;
  subject?: string;
  part?: string;
  unit?: string;
  country?: string;
  items: RawJsonItem[];
}

export interface McqReviewItem {
  source_key: string;
  originalIndex: number;
  order_index: number;
  question: string;
  rawOptions: string[];
  cleanedOptions: string[];
  solution: string;
  ai_guidance: string;
  svg_code?: string;
  originalTopic: string;
  topic: string;
  starsRaw: number;
  difficulty: number; // 1..4
  correct_index: number | null; // 0..3 or null
  isAutoSuggested: boolean;
  isReviewed: boolean;
  isExcluded: boolean;
  duplicateGroupId?: string;
  duplicateGroupCount?: number;
}

export interface AvailableUnitInfo {
  id: string;
  name: string;
  subject_id?: string | null;
  book_part?: number | string | null;
}

// 1. Clean Option Text: remove prefixes like أ) ب) (أ) أ-
export function cleanOptionText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^[\s(]*[أبجدهئطك]\s*[\-)\.]\s*/, '')
    .trim();
}

// 2. Deterministic answer extraction from solution text
export function extractDeterministicAnswer(solution: string, cleanedOptions: string[]): { index: number | null; isAuto: boolean } {
  if (!solution || !cleanedOptions || cleanedOptions.length !== 4) {
    return { index: null, isAuto: false };
  }

  const sol = solution.trim();

  // Pattern A: Direct Arabic Letter mention in conclusion phrases
  const letterPatterns = [
    /(?:الخيار|الإجابة)\s*(?:الصحيحة?)?\s*(?:هو|هي)?\s*[:\-]?\s*\(?([أبجد])\)?/i,
    /الخيار\s*\(([أبجد])\)/i,
    /الحل\s*[:\-]?\s*الخيار\s*\(?([أبجد])\)?/i,
    /إذن[،,\s]+(?:فإن\s+)?الخيار\s*(?:الصحيح\s*)?(?:هو\s*)?\(?([أبجد])\)?/i,
  ];

  for (const pat of letterPatterns) {
    const match = sol.match(pat);
    if (match && match[1]) {
      const letter = match[1];
      if (letter === 'أ') return { index: 0, isAuto: true };
      if (letter === 'ب') return { index: 1, isAuto: true };
      if (letter === 'ج') return { index: 2, isAuto: true };
      if (letter === 'د') return { index: 3, isAuto: true };
    }
  }

  // Pattern B: Matching option text in the last 350 characters of solution
  const lastChunk = sol.slice(-350);
  for (let i = 0; i < cleanedOptions.length; i++) {
    const opt = cleanedOptions[i].trim();
    if (opt.length >= 3) {
      if (
        lastChunk.includes(`هو: ${opt}`) ||
        lastChunk.includes(`هي: ${opt}`) ||
        lastChunk.includes(`هو ${opt}`) ||
        lastChunk.includes(`هي ${opt}`) ||
        lastChunk.includes(`الخيار: ${opt}`) ||
        lastChunk.includes(`النتيجة: ${opt}`)
      ) {
        return { index: i, isAuto: true };
      }
    }
  }

  return { index: null, isAuto: false };
}

// 3. Text Normalization for Duplicate Detection
export function normalizeForDuplicateDetection(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\$\*\\]/g, '') // remove $, *, \
    .replace(/[ـ\s\.,;:!?\(\)\[\]\{\}\-=+><_]/g, '') // remove spaces & punctuation
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .toLowerCase();
}

// Calculate Dice / Bigram similarity between 0 and 1
export function calculateTextSimilarity(s1: string, s2: string): number {
  const norm1 = normalizeForDuplicateDetection(s1);
  const norm2 = normalizeForDuplicateDetection(s2);

  if (norm1 === norm2) return 1.0;
  if (norm1.length < 4 || norm2.length < 4) return 0.0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < norm1.length - 1; i++) {
    const bg = norm1.substring(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  const bigrams2 = new Map<string, number>();
  for (let i = 0; i < norm2.length - 1; i++) {
    const bg = norm2.substring(i, i + 2);
    bigrams2.set(bg, (bigrams2.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (const [bg, count1] of bigrams1) {
    if (bigrams2.has(bg)) {
      intersection += Math.min(count1, bigrams2.get(bg)!);
    }
  }

  const total = norm1.length - 1 + (norm2.length - 1);
  return total > 0 ? (2.0 * intersection) / total : 0;
}

// Assign duplicate groups based on similarity > 0.85
export function computeDuplicateGroups(items: McqReviewItem[]): void {
  const groupMap = new Map<number, number>(); // item index -> group number
  let nextGroupId = 1;

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = calculateTextSimilarity(items[i].question, items[j].question);
      if (sim >= 0.85) {
        let g = groupMap.get(i) || groupMap.get(j);
        if (!g) {
          g = nextGroupId++;
        }
        groupMap.set(i, g);
        groupMap.set(j, g);
      }
    }
  }

  // Count items per group
  const groupCounts = new Map<number, number>();
  for (const g of groupMap.values()) {
    groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
  }

  // Apply to items
  for (let i = 0; i < items.length; i++) {
    const g = groupMap.get(i);
    if (g && groupCounts.get(g)! > 1) {
      items[i].duplicateGroupId = `مكرّر محتمل (${g})`;
      items[i].duplicateGroupCount = groupCounts.get(g);
    }
  }
}

// Clean title helper: extracts the core distinctive unit topic (e.g. "المستقيمات والمستويات في الفراغ")
export function cleanArabicUnitTitle(text: string): string {
  if (!text) return '';
  return text
    .replace(/بنك\s*الأسئلة\s*(كاملاً|كاملا)?/gi, '')
    .replace(/الوحدة\s*(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|[0-9]+)\s*[:\-]?/gi, '')
    .replace(/^الوحدة\s*[:\-]?/gi, '')
    .replace(/[-:ـ_]+/g, ' ')
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Fetch all units from NewUnits
export async function fetchAllAvailableUnits(): Promise<AvailableUnitInfo[]> {
  const dbClient = supabase as any;
  try {
    const { data, error } = await dbClient
      .from('NewUnits')
      .select('id, name, subject_id, book_part')
      .order('name');
    if (error || !data) return [];
    return data;
  } catch (e) {
    console.warn('Error fetching all units:', e);
    return [];
  }
}

// Match the candidate unit/title against available units with high precision
export function findBestMatchingUnit(
  units: AvailableUnitInfo[], 
  candidateUnit?: string, 
  candidateTitle?: string
): AvailableUnitInfo | null {
  if (!units || units.length === 0) return null;

  const rawUnit = (candidateUnit || '').trim();
  const rawTitle = (candidateTitle || '').trim();

  const cleanUnit = cleanArabicUnitTitle(rawUnit);
  const cleanTitle = cleanArabicUnitTitle(rawTitle);

  // 1. Direct exact name match with raw unit
  if (rawUnit) {
    const direct = units.find(u => u.name.trim() === rawUnit);
    if (direct) return direct;
  }

  // 2. Exact match after cleaning
  if (cleanUnit && cleanUnit.length >= 3) {
    const exactClean = units.find(u => cleanArabicUnitTitle(u.name) === cleanUnit);
    if (exactClean) return exactClean;
  }

  if (cleanTitle && cleanTitle.length >= 3) {
    const exactCleanTitle = units.find(u => cleanArabicUnitTitle(u.name) === cleanTitle);
    if (exactCleanTitle) return exactCleanTitle;
  }

  // 3. Substring match on clean title/unit (must be at least 6 characters to prevent spurious matches like "الوحدة")
  const targetToTry = cleanUnit.length >= 6 ? cleanUnit : cleanTitle.length >= 6 ? cleanTitle : '';
  if (targetToTry) {
    const subMatch = units.find(u => {
      const uClean = cleanArabicUnitTitle(u.name);
      return (uClean.length >= 6 && (uClean.includes(targetToTry) || targetToTry.includes(uClean)));
    });
    if (subMatch) return subMatch;
  }

  // No confident match found
  return null;
}

// 5. Fetch distinct concepts for unit from NewLessonSectionExercises, NewUnitQuizQuestions, NewLessonSections
export async function fetchUnitDistinctConcepts(unitId: string): Promise<string[]> {
  const dbClient = supabase as any;
  const conceptsSet = new Set<string>();

  try {
    const realUnitId = isUuid(unitId) ? unitId : await resolveUnitUuid(unitId);

    if (realUnitId) {
      // 1. NewLessonSections.concept_label via NewDocuments.unit_id
      const { data: docs } = await dbClient
        .from('NewDocuments')
        .select('id')
        .eq('unit_id', realUnitId);

      const docIds = (docs || []).map((d: any) => d.id);

      if (docIds.length > 0) {
        const { data: sections } = await dbClient
          .from('NewLessonSections')
          .select('id, concept_label')
          .in('document_id', docIds);

        (sections || []).forEach((s: any) => {
          if (s.concept_label && typeof s.concept_label === 'string' && s.concept_label.trim()) {
            conceptsSet.add(s.concept_label.trim());
          }
        });

        const sectionIds = (sections || []).map((s: any) => s.id);
        if (sectionIds.length > 0) {
          // 2. NewLessonSectionExercises.primary_concept
          const { data: exercises } = await dbClient
            .from('NewLessonSectionExercises')
            .select('primary_concept')
            .in('section_id', sectionIds);

          (exercises || []).forEach((e: any) => {
            if (e.primary_concept && typeof e.primary_concept === 'string' && e.primary_concept.trim()) {
              conceptsSet.add(e.primary_concept.trim());
            }
          });
        }
      }

      // 3. NewUnitQuizQuestions.topic via NewUnitQuizzes.unit_id
      const { data: quizzes } = await dbClient
        .from('NewUnitQuizzes')
        .select('id')
        .eq('unit_id', realUnitId);

      const quizIds = (quizzes || []).map((q: any) => q.id);
      if (quizIds.length > 0) {
        const { data: questions } = await dbClient
          .from('NewUnitQuizQuestions')
          .select('topic')
          .in('quiz_id', quizIds);

        (questions || []).forEach((q: any) => {
          if (q.topic && typeof q.topic === 'string' && q.topic.trim()) {
            conceptsSet.add(q.topic.trim());
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Concepts Fetch Error]:', err);
  }

  return Array.from(conceptsSet).sort();
}

// 6. Ensure or create Question Bank for Unit (single bank per unit)
export async function getOrCreateBankForUnit(unitId: string, title: string): Promise<string> {
  const dbClient = supabase as any;
  const realUnitId = isUuid(unitId) ? unitId : await resolveUnitUuid(unitId, title);

  // Search existing bank by unit_id if UUID is resolved
  if (realUnitId) {
    const { data: existing } = await dbClient
      .from('NewQuestionBanks')
      .select('id, title')
      .eq('unit_id', realUnitId)
      .maybeSingle();

    if (existing?.id) {
      return existing.id;
    }
  }

  // Fallback: search existing bank by title
  const { data: existingByTitle } = await dbClient
    .from('NewQuestionBanks')
    .select('id, title')
    .ilike('title', `%${title || unitId}%`)
    .limit(1);

  if (existingByTitle && existingByTitle.length > 0) {
    if (realUnitId) {
      try {
        await dbClient
          .from('NewQuestionBanks')
          .update({ unit_id: realUnitId })
          .eq('id', existingByTitle[0].id);
      } catch (e) {}
    }
    return existingByTitle[0].id;
  }

  // Create single bank for this unit
  const { data: created, error } = await dbClient
    .from('NewQuestionBanks')
    .insert({
      unit_id: realUnitId, // Valid UUID or null
      title: title || (unitId ? `بنك أسئلة ${unitId}` : 'بنك الأسئلة'),
      is_published: false
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء بنك الأسئلة للوحدة: ${error?.message || 'خطأ غير معروف'}`);
  }

  return created.id;
}

// 7. Write strictly reviewed items to Supabase
export interface SyncExecutionResult {
  syncedCount: number;
  newCount: number;
  updatedCount: number;
  excludedCount: number;
  unreviewedCount: number;
  existingDbCountNotInFile: number;
  examples: Array<{
    source_key: string;
    question: string;
    options: string[];
    correct_index: number | null;
    solution: string;
  }>;
}

export async function writeReviewedBankItemsToDb(
  bankId: string,
  itemsToSync: McqReviewItem[],
  allFileMcqItems: McqReviewItem[]
): Promise<SyncExecutionResult> {
  const dbClient = supabase as any;

  // Check existing items in database for this bank
  const { data: existingInDb, error: fetchErr } = await dbClient
    .from('NewQuestionBankItems')
    .select('id, source_key')
    .eq('bank_id', bankId);

  if (fetchErr) {
    throw new Error(`خطأ في قراءة الأسئلة الحالية للبنك: ${fetchErr.message}`);
  }

  const existingMap = new Map<string, string>();
  (existingInDb || []).forEach((row: any) => {
    if (row.source_key) {
      existingMap.set(row.source_key, row.id);
    }
  });

  const fileSourceKeys = new Set(allFileMcqItems.map(i => i.source_key));
  let existingDbCountNotInFile = 0;
  for (const sk of existingMap.keys()) {
    if (!fileSourceKeys.has(sk)) {
      existingDbCountNotInFile++;
    }
  }

  let newCount = 0;
  let updatedCount = 0;

  // Temporarily shift existing order_index values to prevent uniqueness collisions during upsert
  if (existingInDb && existingInDb.length > 0) {
    for (let idx = 0; idx < existingInDb.length; idx++) {
      try {
        await dbClient
          .from('NewQuestionBankItems')
          .update({ order_index: 50000 + idx })
          .eq('id', existingInDb[idx].id);
      } catch (e) {
        // Ignore temporary shift error
      }
    }
  }

  for (let i = 0; i < itemsToSync.length; i++) {
    const item = itemsToSync[i];
    const isUpdate = existingMap.has(item.source_key);

    const payload: any = {
      bank_id: bankId,
      source_key: item.source_key,
      item_type: 'mcq',
      topic: item.topic?.trim() || 'عام',
      difficulty: Math.max(1, Math.min(5, Number(item.difficulty) || 3)),
      question: item.question?.trim() || 'سؤال رياضي',
      sub_parts: item.cleanedOptions || [],
      correct_index: item.correct_index !== null ? Number(item.correct_index) : 0,
      solution: item.solution?.trim() || 'الحل النموذجي المعتمد',
      ai_guidance: item.ai_guidance || null,
      svg_code: item.svg_code || null,
      order_index: i + 1
    };

    const { error } = await dbClient
      .from('NewQuestionBankItems')
      .upsert(payload, { onConflict: 'bank_id, source_key' });

    if (error) {
      throw new Error(`فشل مزامنة السؤال "${item.source_key}": ${error.message}`);
    }

    if (isUpdate) {
      updatedCount++;
    } else {
      newCount++;
    }
  }

  // Re-index remaining existing items that were not in itemsToSync
  const { data: remainingDbRows } = await dbClient
    .from('NewQuestionBankItems')
    .select('id, source_key')
    .eq('bank_id', bankId);

  if (remainingDbRows && remainingDbRows.length > 0) {
    let nextOrder = itemsToSync.length + 1;
    for (const row of remainingDbRows) {
      const isInSync = itemsToSync.some(i => i.source_key === row.source_key);
      if (!isInSync) {
        try {
          await dbClient
            .from('NewQuestionBankItems')
            .update({ order_index: nextOrder++ })
            .eq('id', row.id);
        } catch (e) {}
      }
    }
  }

  // Mark Question Bank as published on successful sync
  await dbClient
    .from('NewQuestionBanks')
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .eq('id', bankId);

  // Prepare examples of stored questions
  const examples = itemsToSync.slice(0, 2).map(item => ({
    source_key: item.source_key,
    question: item.question,
    options: item.cleanedOptions,
    correct_index: item.correct_index,
    solution: item.solution
  }));

  return {
    syncedCount: itemsToSync.length,
    newCount,
    updatedCount,
    excludedCount: allFileMcqItems.filter(i => i.isExcluded).length,
    unreviewedCount: allFileMcqItems.filter(i => !i.isReviewed && !i.isExcluded).length,
    existingDbCountNotInFile,
    examples
  };
}

// 8. LocalStorage Persistence helpers
export function getStorageKeyForUnit(unitName: string): string {
  return `math_educator_review_state_${unitName.replace(/[\s\-_]+/g, '_')}`;
}

export function saveReviewProgressToStorage(unitName: string, state: Record<string, Partial<McqReviewItem>>): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getStorageKeyForUnit(unitName);
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

export function loadReviewProgressFromStorage(unitName: string): Record<string, Partial<McqReviewItem>> {
  if (typeof window === 'undefined') return {};
  try {
    const key = getStorageKeyForUnit(unitName);
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.warn('LocalStorage load failed:', e);
    return {};
  }
}
