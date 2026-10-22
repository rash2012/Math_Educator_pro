export { getSupabaseClient } from './supabaseClient';
import { getSupabaseClient } from './supabaseClient';
import {
  db,
  type SyncMapping,
  type Document,
  type LessonSection,
  type PracticeExercise,
  type ExerciseFamily,
  type ExerciseStation,
  type Exercise,
  type PdfContent,
  type Test,
  type QuestionBank,
  type ExamSummary,
  type PastPaper,
  type UnitQuiz,
  type UnitMindMap,
  type UnitComprehensiveReview,
  type TestCategory,
} from '../db';
import type { ClassifiedFamilyData, ClassifiedExercise } from '../db/exerciseFamiliesRPC';

export type SyncStatus = 'not_synced' | 'modified' | 'synced' | 'draft_cloud';

export interface SyncResult {
  success: boolean;
  message: string;
  syncedCount?: number;
  errorStep?: string;
  details?: any;
}

export interface SyncProgressCallback {
  (stepName: string, percent: number, isError?: boolean): void;
}

/**
 * Formats Supabase error messages, detecting RLS restrictions and providing actionable advice.
 */
export function formatSupabaseErrorMessage(stepLabel: string, err: any): string {
  const rawMsg = err?.message || String(err);
  if (
    rawMsg.includes('row-level security') ||
    rawMsg.includes('violates row-level security policy') ||
    err?.code === '42501'
  ) {
    return `${stepLabel}: تم رفض العملية لعدم وجود جلسة تسجيل دخول بحساب مسؤول (Admin Auth Session). يرجى تسجيل الدخول بحساب مسؤول (مثل abosamsyria@gmail.com).`;
  }
  return `${stepLabel}: ${rawMsg}`;
}

// -------------------------------------------------------------
// 1. Content Hashing & Mapping Helpers
// -------------------------------------------------------------

/**
 * Calculates a deterministic hash of object content (ignoring ephemeral fields)
 */
export function computeContentHash(data: any): string {
  if (data === null || data === undefined) return '';

  const cleanClone = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanClone);
    
    const sortedKeys = Object.keys(obj)
      .filter(k => k !== 'lastSyncedAt' && k !== 'lastActive')
      .sort();
    
    const res: Record<string, any> = {};
    for (const key of sortedKeys) {
      res[key] = cleanClone(obj[key]);
    }
    return res;
  };

  const json = JSON.stringify(cleanClone(data));
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 33) ^ json.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Retrieves the sync mapping for a local table row with multi-level fallback
 */
export async function getSyncMapping(localTable: string, localId: string | number): Promise<SyncMapping | undefined> {
  const strId = String(localId);
  const numId = Number(localId);

  let mapping: SyncMapping | undefined;

  // 1. Try compound index with string
  try {
    mapping = await db.syncMappings
      .where('[localTable+localId]')
      .equals([localTable, strId])
      .first();

    // 2. Try compound index with number
    if (!mapping && !isNaN(numId)) {
      mapping = await db.syncMappings
        .where('[localTable+localId]')
        .equals([localTable, numId as any])
        .first();
    }
  } catch (err) {
    // Ignore index error and fallback
  }

  // 3. Fallback: filter in memory by localTable and string representation
  if (!mapping) {
    try {
      mapping = await db.syncMappings
        .where('localTable')
        .equals(localTable)
        .and(m => String(m.localId) === strId)
        .first();
    } catch (e) {
      // Ignore
    }
  }

  return mapping;
}

/**
 * Saves or updates a sync mapping
 */
export async function saveSyncMapping(
  localTable: string,
  localId: string | number,
  remoteId: string,
  contentHash: string,
  isPublished: boolean = true
): Promise<void> {
  const strId = String(localId);
  const existing = await getSyncMapping(localTable, strId);
  
  if (existing && existing.id) {
    await db.syncMappings.update(existing.id, {
      localTable,
      localId: strId,
      remoteId,
      contentHash,
      isPublished,
      lastSyncedAt: Date.now(),
    });
  } else {
    await db.syncMappings.add({
      localTable,
      localId: strId,
      remoteId,
      contentHash,
      isPublished,
      lastSyncedAt: Date.now(),
    });
  }
}

// -------------------------------------------------------------
// 1.1 Anti-Duplication & Natural Key Comparison Helpers
// -------------------------------------------------------------

export type ConfirmDialogHandler = (message: string) => Promise<boolean> | boolean;

let syncConfirmHandler: ConfirmDialogHandler | null = null;

export function setSyncConfirmHandler(handler: ConfirmDialogHandler | null) {
  syncConfirmHandler = handler;
}

export async function confirmDialog(message: string): Promise<boolean> {
  if (syncConfirmHandler) {
    try {
      return await syncConfirmHandler(message);
    } catch {
      return true;
    }
  }
  // In iframe environments without modal handler, safely return true to link existing records
  return true;
}

/**
 * 1) دالة تطبيع العنوان: توحيد المسافات وترميز الحروف لتفادي التكرار
 */
export function normalizeTitle(t: string): string {
  if (!t) return '';
  return t.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 2) دالة البحث عن وثيقة موجودة بنفس المفتاح الطبيعي (unit_id + doc_type + العنوان)
 * المقارنة تتم في JavaScript (لا بـ ilike) لتفادي مشاكل الرموز الخاصة (% و _) في العناوين العربية
 */
export async function findExistingDocuments(unitRemoteId: string, docType: string, title: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('عميل Supabase غير متوفر');
  let query = supabase
    .from('NewDocuments')
    .select('id, title, created_at')
    .eq('doc_type', docType);

  if (unitRemoteId) {
    query = query.eq('unit_id', unitRemoteId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`تعذّر فحص التكرار: ${error.message}`);
  const target = normalizeTitle(title);
  return (data ?? []).filter((d: any) => normalizeTitle(d.title || '') === target);
}

export async function getMappingIfExists(localTable: string, localId: string | number): Promise<SyncMapping | undefined> {
  let m = await getSyncMapping(localTable, localId);
  if (!m) {
    const tableEquivalents: Record<string, string[]> = {
      NewDocuments: ['documents'],
      documents: ['NewDocuments'],
      NewTests: ['tests'],
      tests: ['NewTests'],
      NewQuestionBanks: ['questionBanks'],
      questionBanks: ['NewQuestionBanks'],
      NewExamSummaries: ['examSummaries'],
      examSummaries: ['NewExamSummaries'],
      NewPastPapers: ['pastPapers'],
      pastPapers: ['NewPastPapers'],
      NewLessonSections: ['lessonSections'],
      lessonSections: ['NewLessonSections'],
      NewLessonSectionExercises: ['practiceExercises'],
      practiceExercises: ['NewLessonSectionExercises'],
      NewExerciseFamilies: ['exerciseFamilies'],
      exerciseFamilies: ['NewExerciseFamilies'],
      NewExerciseStations: ['exerciseStations'],
      exerciseStations: ['NewExerciseStations'],
      NewUnitQuizzes: ['unitQuizzes'],
      unitQuizzes: ['NewUnitQuizzes'],
      NewUnitMindMaps: ['unitMindMaps'],
      unitMindMaps: ['NewUnitMindMaps'],
      NewUnitComprehensiveReviews: ['unitComprehensiveReviews'],
      unitComprehensiveReviews: ['NewUnitComprehensiveReviews'],
    };
    const equivalents = tableEquivalents[localTable] || [];
    for (const alt of equivalents) {
      m = await getSyncMapping(alt, localId);
      if (m) break;
    }
  }
  return m;
}

export async function upsertSyncMapping(
  localTable: string,
  localId: string | number,
  remoteId: string,
  contentHash: string = '',
  isPublished: boolean = true
): Promise<void> {
  await saveSyncMapping(localTable, localId, remoteId, contentHash, isPublished);
  const altMap: Record<string, string> = {
    documents: 'NewDocuments',
    NewDocuments: 'documents',
    tests: 'NewTests',
    NewTests: 'tests',
    questionBanks: 'NewQuestionBanks',
    NewQuestionBanks: 'questionBanks',
    examSummaries: 'NewExamSummaries',
    NewExamSummaries: 'examSummaries',
    pastPapers: 'NewPastPapers',
    NewPastPapers: 'pastPapers',
    lessonSections: 'NewLessonSections',
    NewLessonSections: 'lessonSections',
    practiceExercises: 'NewLessonSectionExercises',
    NewLessonSectionExercises: 'practiceExercises',
    exerciseFamilies: 'NewExerciseFamilies',
    NewExerciseFamilies: 'exerciseFamilies',
    exerciseStations: 'NewExerciseStations',
    NewExerciseStations: 'exerciseStations',
  };
  const alt = altMap[localTable];
  if (alt) {
    await saveSyncMapping(alt, localId, remoteId, contentHash, isPublished);
  }
}

/**
 * Inserts a single row into a Supabase table and returns its ID
 */
export async function insertRow(tableName: string, payload: any): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('عميل Supabase غير متوفر');
  const { data, error } = await (supabase.from(tableName as any) as any)
    .insert([payload])
    .select('id')
    .single();
  if (error) throw new Error(`فشل إدراج صف في ${tableName}: ${error.message}`);
  return (data as any)?.id;
}

/**
 * Updates a single row in a Supabase table by ID
 */
export async function updateRow(tableName: string, remoteId: string, payload: any): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('عميل Supabase غير متوفر');
  const { data, error } = await (supabase.from(tableName as any) as any)
    .update(payload)
    .eq('id', remoteId)
    .select('id')
    .single();
  if (error) throw new Error(`فشل تحديث صف في ${tableName}: ${error.message}`);
  return (data as any)?.id;
}

/**
 * Helper to clean leading numbers or markers from text
 */
export const cleanLeadingMarkers = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/^[\s\d\-\.\)\(]*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])?[\s\d\-\.\)\(]*/, '$1')
    .replace(/^[0-9]+[\.\-\)\:]\s*/, '')
    .trim();
};

export const getQuestionFullText = (q: any): string => {
  if (!q) return '';
  const mainText = (q.text || '').trim();
  const subQs: any[] = Array.isArray(q.subQuestions) 
    ? q.subQuestions 
    : (Array.isArray(q.subParts) ? q.subParts : []);
  
  if (subQs.length === 0) {
    return mainText;
  }
  
  // Check if mainText already includes all subquestion texts
  const subTexts = subQs.map(sq => (typeof sq === 'string' ? sq : (sq.text || sq.prompt || '')).trim()).filter(Boolean);
  const alreadyCombined = subTexts.length > 0 && subTexts.every(st => {
    const cleanSt = cleanLeadingMarkers(st);
    return mainText.includes(st) || (cleanSt.length > 5 && mainText.includes(cleanSt));
  });
  if (alreadyCombined) {
    return mainText;
  }
  
  // Format subquestions
  const formattedSubs = subQs.map((sq, idx) => {
    if (typeof sq === 'object') {
      const subMain = (sq.text || sq.prompt || '').trim();
      const parts = sq.subParts || sq.parts || sq.items || [];
      if (Array.isArray(parts) && parts.length > 0) {
        const partsStr = parts.map((p: any, pIdx: number) => {
          const l = p.letter || String.fromCharCode(97 + pIdx);
          const t = typeof p === 'object' ? (p.text || '') : String(p);
          return `   ${l}) ${cleanLeadingMarkers(t)}`;
        }).join('\n');
        return `${idx + 1}) ${cleanLeadingMarkers(subMain)}\n${partsStr}`;
      }
      return `${idx + 1}) ${cleanLeadingMarkers(subMain)}`;
    }
    const rawSq = String(sq).trim();
    if (/^[\d①-⑫]+[\.\-\)\:]/.test(rawSq)) {
      return rawSq;
    }
    return `${idx + 1}) ${cleanLeadingMarkers(rawSq)}`;
  });

  if (!mainText) {
    return formattedSubs.join('\n');
  }
  return `${mainText}\n${formattedSubs.join('\n')}`;
};

/**
 * دالة تجزئة متقدمة للاختبارات الشاملة (NewTests & NewTestSections & NewTestQuestions)
 * تلتقط أي تعديل في:
 * title, difficulty, topic_label (or scope), and full testData (including sections, questions, solutions).
 * Any modification to even a single solution or question text will produce a different hash.
 */
export function computeTestHash(test: any): string {
  if (!test) return '';
  const payloadToHash = {
    title: test.title || test.testData?.title || '',
    difficulty: test.difficulty || '',
    topic_label: test.scope || test.topic_label || '',
    testData: test.testData || null,
  };
  return computeContentHash(payloadToHash);
}

export type TestScopeEnum = 'unit' | 'multi_unit' | 'part' | 'subject_comprehensive';

/**
 * هل اسم الوحدة يعبر عن شمولية أو اختبار جامع (وليس وحدة دراسية تخصصية مفردة)؟
 */
export function isComprehensiveUnitKeyword(unitName?: string | null): boolean {
  if (!unitName) return false;
  const normalized = unitName
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[-:ـ_\s]+/g, ' ');

  const keywords = [
    'شامل الوحدات',
    'شامل الواحدات',
    'شامل كل الوحدات',
    'جميع الوحدات',
    'كامل الوحدات',
    'كافه الوحدات',
    'كل الوحدات',
    'شامل المنهاج',
    'كامل المنهاج',
    'شامل الفصل',
    'شامل الجزء',
    'شامل',
    'عام',
    'عامه',
    'امتحان نصفي',
    'امتحان تجريبي',
    'اختبار شامل',
    'نماذج شامله',
    'المنهاج كاملا',
    'المنهاج كامل',
    'دوره امتحانيه',
    'امتحان نهائي'
  ];

  return keywords.some(kw => normalized.includes(kw));
}

/**
 * فحص ما إذا كان التوصيف يعبر عن اختبار لجزء كامل (مثلاً: الجزء الأول أو الجزء الثاني)
 */
export function isPartScopeTest(test: { unit?: string; part?: string; scope?: string }): boolean {
  const part = (test.part || '').trim().toLowerCase();
  const isPartVal = part.includes('جزء') || part.includes('كتاب') || part === '1' || part === '2' || part === 'الجزء الاول' || part === 'الجزء الثاني';
  
  // إذا كان الجزء محدداً (مثل الجزء الأول أو الثاني) والوحدة إما غير محددة أو تشير إلى شمول الوحدات
  if (isPartVal && (!test.unit || isComprehensiveUnitKeyword(test.unit))) {
    return true;
  }
  return false;
}

/**
 * فحص ما إذا كان التوصيف يعبر عن اختبار شامل لكافة المنهاج / لجميع الوحدات
 */
export function isSubjectComprehensiveTest(test: { unit?: string; part?: string; scope?: string; title?: string }): boolean {
  const part = (test.part || '').trim();
  const unit = (test.unit || '').trim();
  const scope = (test.scope || '').trim();

  if (part === 'شامل' || part === 'عام' || part === 'شامل الوحدات' || part === 'شامل الواحدات') return true;
  if (isComprehensiveUnitKeyword(unit) && !isPartScopeTest(test)) return true;
  if (scope.includes('شامل لجميع الوحدات') || scope === 'شامل' || scope === 'عام') return true;
  if (!part && !unit) return true;
  return false;
}

/**
 * اشتقاق فئة الاتساع الحقيقية للاختبار بدقة متناهية
 */
export function deriveTestScope(
  test: { unit?: string; part?: string; scope?: string; title?: string },
  multiUnitList?: string[]
): TestScopeEnum {
  if (multiUnitList && multiUnitList.length > 1) {
    return 'multi_unit';
  }

  // 1. اختبار جزء كامل (مثل: الجزء الأول - شامل الوحدات)
  if (isPartScopeTest(test)) {
    return 'part';
  }

  // 2. إذا كانت الوحدة محددة وليست كلمة شمولية، فهذا اختبار وحدة حصراً (حتى لو كان scope القديم "عام")
  if (test.unit && test.unit.trim() !== '' && !isComprehensiveUnitKeyword(test.unit)) {
    if (test.scope !== 'subject_comprehensive' && test.scope !== 'multi_unit' && test.scope !== 'شامل') {
      return 'unit';
    }
  }

  // 3. اختبار شامل لجميع الوحدات (مثل: الجزء شامل - الوحدة شامل الواحدات)
  if (isSubjectComprehensiveTest(test)) {
    return 'subject_comprehensive';
  }

  // 4. اختبار وحدة دراسية تخصصية مفردة (فقط إن لم تكن كلمة شمولية)
  if (test.unit && test.unit.trim() !== '' && !isComprehensiveUnitKeyword(test.unit)) {
    return 'unit';
  }

  // 5. إذا كان الجزء محدداً بدون وحدة
  if (test.part && test.part.trim() !== '') {
    return 'part';
  }

  return 'subject_comprehensive';
}

/**
 * Resolves remote UUID for a unit by name from NewUnits.
 * Throws an immediate error if unit does not exist in cloud.
 */
export async function resolveUnitRemoteIdByName(unitName: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('عميل Supabase غير متوفر');
  if (!unitName || !unitName.trim()) {
    throw new Error('اسم الوحدة مطلوب للبحث');
  }

  const trimmed = unitName.trim();
  const normalize = (s: string) => s.replace(/[-:ـ\s]+/g, ' ').trim().toLowerCase();
  const normTarget = normalize(trimmed);

  const { data: directMatches, error } = await supabase
    .from('NewUnits')
    .select('id, name')
    .eq('name', trimmed);

  if (error) {
    throw new Error(`خطأ أثناء البحث عن الوحدة "${trimmed}": ${error.message}`);
  }

  if (directMatches && directMatches.length > 0) {
    return directMatches[0].id;
  }

  const { data: allUnits, error: allErr } = await supabase
    .from('NewUnits')
    .select('id, name');

  if (!allErr && allUnits) {
    const found = allUnits.find(u => normalize(u.name) === normTarget || u.name.trim() === trimmed);
    if (found) {
      return found.id;
    }
  }

  throw new Error(`الوحدة "${trimmed}" غير موجودة سحابياً بعد — زامِن الوحدة أولاً`);
}

/**
 * Resolves remote UUID for a subject by name from NewSubjects.
 * Matches resolveUnitRemoteIdByName pattern, with fallback to resolveTaxonomyHierarchy.
 */
export async function resolveSubjectRemoteIdByName(
  subjectName: string = 'الرياضيات',
  gradeName?: string,
  countryName?: string
): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('عميل Supabase غير متوفر');

  const trimmed = (subjectName || 'الرياضيات').trim();
  const normalize = (s: string) => s.replace(/[-:ـ\s]+/g, ' ').trim().toLowerCase();
  const normTarget = normalize(trimmed);

  const { data: directMatches, error } = await supabase
    .from('NewSubjects')
    .select('id, name')
    .eq('name', trimmed);

  if (!error && directMatches && directMatches.length > 0) {
    return directMatches[0].id;
  }

  const { data: allSubjects, error: allErr } = await supabase
    .from('NewSubjects')
    .select('id, name');

  if (!allErr && allSubjects && allSubjects.length > 0) {
    const found = allSubjects.find(s => normalize(s.name) === normTarget || s.name.trim() === trimmed);
    if (found) {
      return found.id;
    }
  }

  // Fallback to resolveTaxonomyHierarchy to safely find or create the subject
  const { subjectId } = await resolveTaxonomyHierarchy({
    country: countryName || 'سوريا',
    grade: gradeName || 'الثالث الثانوي العلمي',
    subject: trimmed,
  });

  if (subjectId) {
    return subjectId;
  }

  throw new Error(`المادة "${trimmed}" غير موجودة سحابياً بعد — زامِن المادة أولاً`);
}

/**
 * Derives section type for past paper questions based on orderTitle
 */
export function deriveSectionType(orderTitle: string = ''): 'question' | 'exercise' | 'problem' {
  if (orderTitle.includes('مسألة')) return 'problem';
  if (orderTitle.includes('تمرين')) return 'exercise';
  return 'question'; // الافتراضي لأي شيء يبدأ بـ"السؤال"
}

/**
 * Determines whether a local item is not synced, modified, draft, or matching
 */
export async function getSyncStatus(
  localTable: string,
  localId: string | number,
  currentData: any
): Promise<SyncStatus> {
  const mapping = await getSyncMapping(localTable, localId);
  if (!mapping || !mapping.remoteId) {
    if (currentData?.remoteId) {
      return 'synced';
    }

    // بالنسبة للاختبارات: فحص ما إذا كان الاختبار مرفوعاً وموجوداً سحابياً لاستعادة الحالة تلقائياً
    if (localTable === 'tests' && currentData?.title) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const testTitle = (currentData.testData?.title || currentData.title || '').trim();
          const { data: rData } = await supabase
            .from('NewTests')
            .select('id, is_published')
            .eq('title', testTitle)
            .limit(1);
          if (rData && rData.length > 0) {
            const remoteTest = rData[0];
            const testHash = computeTestHash(currentData);
            await saveSyncMapping('tests', localId, remoteTest.id, testHash, remoteTest.is_published !== false);
            return remoteTest.is_published === false ? 'draft_cloud' : 'synced';
          }
        } catch {
          // ignore network check error
        }
      }
    }

    // بالنسبة للدورات السابقة: فحص ما إذا كانت الدورة مرفوعة وموجودة سحابياً
    if (localTable === 'pastPapers' && currentData?.title) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const paperTitle = (currentData.title || '').trim();
          const { data: rData } = await supabase
            .from('NewPastPapers')
            .select('id, is_published')
            .eq('title', paperTitle)
            .limit(1);
          if (rData && rData.length > 0) {
            const remotePaper = rData[0];
            const paperHash = computeContentHash(currentData);
            await saveSyncMapping('pastPapers', localId, remotePaper.id, paperHash, remotePaper.is_published !== false);
            return remotePaper.is_published === false ? 'draft_cloud' : 'synced';
          }
        } catch {
          // ignore network check error
        }
      }
    }

    return 'not_synced';
  }

  let currentHash: string;
  if (localTable === 'tests') {
    currentHash = computeTestHash(currentData);
    if (mapping.contentHash !== currentHash) {
      const legacyHash = computeContentHash(currentData);
      if (mapping.contentHash === legacyHash) {
        return mapping.isPublished === false ? 'draft_cloud' : 'synced';
      }
      return 'modified';
    }
  } else {
    currentHash = computeContentHash(currentData);
    if (mapping.contentHash !== currentHash) {
      return 'modified';
    }
  }

  if (mapping.isPublished === false) {
    return 'draft_cloud';
  }

  return 'synced';
}

export interface UnitSyncAggregateInfo {
  totalItems: number;
  syncedCount: number;
  modifiedCount: number;
  notSyncedCount: number;
  draftCloudCount: number;
  pendingCount: number;
  isFullySynced: boolean;
  hasItems: boolean;
}

/**
 * Calculates aggregate sync status for a unit and all its sub-components
 */
export async function getUnitSyncAggregateStatus(docId: number): Promise<UnitSyncAggregateInfo> {
  const doc = await db.documents.get(docId);
  if (!doc) {
    return {
      totalItems: 0,
      syncedCount: 0,
      modifiedCount: 0,
      notSyncedCount: 0,
      draftCloudCount: 0,
      pendingCount: 0,
      isFullySynced: false,
      hasItems: false,
    };
  }

  let totalItems = 0;
  let syncedCount = 0;
  let modifiedCount = 0;
  let notSyncedCount = 0;
  let draftCloudCount = 0;

  const countStatus = (st: SyncStatus) => {
    totalItems++;
    if (st === 'synced') syncedCount++;
    else if (st === 'modified') modifiedCount++;
    else if (st === 'draft_cloud') draftCloudCount++;
    else notSyncedCount++;
  };

  // 1. Document itself
  const docStatus = await getSyncStatus('documents', doc.id!, doc);
  countStatus(docStatus);

  // 2. Sections
  const sections = await db.lessonSections.where('docId').equals(docId).toArray();
  for (const sec of sections) {
    if (sec.id) {
      const st = await getSyncStatus('lessonSections', sec.id, sec);
      countStatus(st);
    }
  }

  // 3. Quizzes
  const quizzes = await db.unitQuizzes.where('docId').equals(docId).toArray();
  for (const qz of quizzes) {
    if (qz.id) {
      const st = await getSyncStatus('unitQuizzes', qz.id, qz);
      countStatus(st);
    }
  }

  // 4. Mind Maps
  const mindMaps = await db.unitMindMaps.where('docId').equals(docId).toArray();
  for (const mm of mindMaps) {
    if (mm.id) {
      const st = await getSyncStatus('unitMindMaps', mm.id, mm);
      countStatus(st);
    }
  }

  // 5. Comprehensive Reviews
  const reviews = await db.unitComprehensiveReviews.where('docId').equals(docId).toArray();
  for (const rev of reviews) {
    if (rev.id) {
      const st = await getSyncStatus('unitComprehensiveReviews', rev.id, rev);
      countStatus(st);
    }
  }

  // 6. Exercise Families
  const families = await db.exerciseFamilies.where('docId').equals(docId).toArray();
  for (const fam of families) {
    if (fam.id) {
      const st = await getSyncStatus('exerciseFamilies', fam.id, fam);
      countStatus(st);
    }
  }

  // ملاحظة: قسم بنك الأسئلة (questionBanks) مستثنى بالكامل من المزامنة حالياً لإعادة هيكلته

  const pendingCount = modifiedCount + notSyncedCount + draftCloudCount;
  const isFullySynced = totalItems > 0 && pendingCount === 0;
  const hasItems = totalItems > 0;

  return {
    totalItems,
    syncedCount,
    modifiedCount,
    notSyncedCount,
    draftCloudCount,
    pendingCount,
    isFullySynced,
    hasItems,
  };
}

// -------------------------------------------------------------
// 2. Taxonomy Hierarchy Resolution (NewCountries -> NewGradeLevels -> NewSubjects -> NewUnits)
// -------------------------------------------------------------

/**
 * Resolves or creates taxonomy IDs in Supabase: Country -> GradeLevel -> Subject -> Unit -> Lesson
 */
export async function resolveTaxonomyHierarchy(params: {
  country?: string;
  grade?: string;
  subject?: string;
  unit?: string;
  part?: string;
  lessonName?: string;
}): Promise<{
  countryId: string | null;
  gradeLevelId: string | null;
  subjectId: string | null;
  unitId: string | null;
  lessonId: string | null;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { countryId: null, gradeLevelId: null, subjectId: null, unitId: null, lessonId: null };
  }

  const countryName = params.country?.trim() || 'سوريا';
  const gradeName = params.grade?.trim() || 'الثالث الثانوي العلمي';
  const subjectName = params.subject?.trim() || 'الرياضيات';
  const unitName = params.unit?.trim() || 'الوحدة الأولى';
  const partName = params.part?.trim() || null;

  try {
    // 1. Resolve Country
    let countryId: string | null = null;
    const { data: countryData } = await supabase
      .from('NewCountries')
      .select('id')
      .eq('name', countryName)
      .maybeSingle();

    if (countryData?.id) {
      countryId = countryData.id;
    } else {
      const code = countryName === 'سوريا' ? 'SY' : countryName.slice(0, 3).toUpperCase();
      const { data: newCountry, error } = await supabase
        .from('NewCountries')
        .insert({ name: countryName, code })
        .select('id')
        .single();
      if (!error && newCountry) {
        countryId = newCountry.id;
      }
    }

    // 2. Resolve Grade Level
    let gradeLevelId: string | null = null;
    if (countryId) {
      const { data: allGrades } = await supabase
        .from('NewGradeLevels')
        .select('id, name, order_index')
        .eq('country_id', countryId);

      const matchedGrade = allGrades?.find(g => 
        g.name.trim().toLowerCase() === gradeName.trim().toLowerCase()
      );

      if (matchedGrade?.id) {
        gradeLevelId = matchedGrade.id;
      } else {
        const nextGradeOrder = (allGrades && allGrades.length > 0)
          ? Math.max(...allGrades.map(g => Number(g.order_index) || 0)) + 1
          : 1;

        const { data: newGrade, error } = await supabase
          .from('NewGradeLevels')
          .insert({ country_id: countryId, name: gradeName.trim(), order_index: nextGradeOrder })
          .select('id')
          .single();
        if (error) {
          console.error("Failed to insert NewGradeLevel:", error);
          throw new Error(`فشل إنشاء الصف ${gradeName}: ${error.message}`);
        }
        if (newGrade) {
          gradeLevelId = newGrade.id;
        }
      }
    }

    // 3. Resolve Subject
    let subjectId: string | null = null;
    if (gradeLevelId) {
      const { data: subjectData } = await supabase
        .from('NewSubjects')
        .select('id')
        .eq('grade_level_id', gradeLevelId)
        .eq('name', subjectName.trim())
        .maybeSingle();

      if (subjectData?.id) {
        subjectId = subjectData.id;
      } else {
        const { data: newSubj, error } = await supabase
          .from('NewSubjects')
          .insert({ grade_level_id: gradeLevelId, name: subjectName.trim() })
          .select('id')
          .single();
        if (error) {
          console.error("Failed to insert NewSubject:", error);
          throw new Error(`فشل إنشاء المادة ${subjectName}: ${error.message}`);
        }
        if (newSubj) {
          subjectId = newSubj.id;
        }
      }
    }

    // 4. Resolve Unit
    let unitId: string | null = null;
    if (subjectId && unitName) {
      // Fetch all units for this subject to allow normalized matching and safe order_index calculation
      const { data: subjectUnits } = await supabase
        .from('NewUnits')
        .select('id, name, order_index, subject_id')
        .eq('subject_id', subjectId);

      const normalizeName = (s: string) => s.replace(/[-:ـ\s]+/g, ' ').trim().toLowerCase();
      const targetNorm = normalizeName(unitName);

      let matchedUnit = subjectUnits?.find(u => 
        u.name.trim() === unitName.trim() || normalizeName(u.name) === targetNorm
      );

      if (!matchedUnit?.id) {
        // Check if unit exists globally with same name (orphaned or under different subject)
        const { data: orphanedUnits } = await supabase
          .from('NewUnits')
          .select('id, name, order_index, subject_id')
          .eq('name', unitName.trim())
          .limit(1);

        const orphanedUnit = orphanedUnits?.[0];
        if (orphanedUnit?.id) {
          const nextUnitOrder = (subjectUnits && subjectUnits.length > 0)
            ? Math.max(...subjectUnits.map(u => Number(u.order_index) || 0)) + 1
            : 1;

          const { error: updateError } = await supabase
            .from('NewUnits')
            .update({ subject_id: subjectId, order_index: nextUnitOrder })
            .eq('id', orphanedUnit.id);
            
          if (updateError) {
             console.error("Failed to update orphaned NewUnit:", updateError);
             throw new Error(`فشل تحديث ارتباط الوحدة ${unitName}: ${updateError.message}`);
          }
          matchedUnit = { id: orphanedUnit.id, name: unitName, order_index: nextUnitOrder, subject_id: subjectId };
        }
      }

      if (matchedUnit?.id) {
        unitId = matchedUnit.id;
      } else {
        const nextUnitOrder = (subjectUnits && subjectUnits.length > 0)
          ? Math.max(...subjectUnits.map(u => Number(u.order_index) || 0)) + 1
          : 1;

        const { data: newUnit, error } = await supabase
          .from('NewUnits')
          .insert({ subject_id: subjectId, name: unitName.trim(), book_part: partName, order_index: nextUnitOrder })
          .select('id')
          .single();
        if (error) {
          console.error("Failed to insert NewUnit:", error);
          throw new Error(`فشل إنشاء الوحدة ${unitName}: ${error.message}`);
        }
        if (newUnit) {
          unitId = newUnit.id;
        }
      }
    }

    // 5. Resolve Lesson (if requested)
    let lessonId: string | null = null;
    if (unitId && params.lessonName) {
      const { data: allLessons } = await supabase
        .from('NewLessons')
        .select('id, name, order_index')
        .eq('unit_id', unitId);

      const matchedLesson = allLessons?.find(l => 
        l.name.trim().toLowerCase() === params.lessonName!.trim().toLowerCase()
      );

      if (matchedLesson?.id) {
        lessonId = matchedLesson.id;
      } else {
        const nextLessonOrder = (allLessons && allLessons.length > 0)
          ? Math.max(...allLessons.map(l => Number(l.order_index) || 0)) + 1
          : 1;

        const { data: newLesson, error } = await supabase
          .from('NewLessons')
          .insert({ unit_id: unitId, name: params.lessonName.trim(), order_index: nextLessonOrder })
          .select('id')
          .single();
        if (error) {
          console.error("Failed to insert NewLesson:", error);
          throw new Error(`فشل إنشاء الدرس ${params.lessonName}: ${error.message}`);
        }
        if (newLesson) {
          lessonId = newLesson.id;
        }
      }
    }

    return { countryId, gradeLevelId, subjectId, unitId, lessonId };
  } catch (err: any) {
    console.error('Error resolving taxonomy hierarchy:', err);
    throw new Error(`فشل تحديد تصنيف الوثيقة (الدولة/الصف/المادة/الوحدة): ${err.message || 'خطأ غير معروف'}`);
  }
}

// -------------------------------------------------------------
// 2.5 Lesson Resolution / Auto-Creation Helper
// -------------------------------------------------------------

export async function resolveOrCreateLessonRemoteId(
  unitRemoteId: string,
  lessonName: string
): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('عميل Supabase غير مهيأ');

  const trimmedName = lessonName.trim();

  // 1. ابحث أولاً عن درس بنفس الاسم ضمن نفس الوحدة
  const { data: existing } = await supabase
    .from('NewLessons')
    .select('id')
    .eq('unit_id', unitRemoteId)
    .eq('name', trimmedName)
    .maybeSingle();

  if (existing) return existing.id;

  // 2. لم يوجد — أنشئه تلقائياً بترتيب تالٍ لآخر درس في نفس الوحدة
  const { data: maxOrder } = await supabase
    .from('NewLessons')
    .select('order_index')
    .eq('unit_id', unitRemoteId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxOrder?.order_index ?? 0) + 1;

  const { data: created, error } = await supabase
    .from('NewLessons')
    .insert({ unit_id: unitRemoteId, name: trimmedName, order_index: nextOrder })
    .select('id')
    .single();

  if (error) throw new Error(`تعذّر إنشاء الدرس "${trimmedName}": ${error.message}`);
  return created.id;
}

// -------------------------------------------------------------
// 3. Storage Reference Upload Helper
// -------------------------------------------------------------

async function uploadPdfFileToStorage(
  docId: number | string,
  binaryFile: Uint8Array
): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('عميل Supabase غير مهيأ');

  const fileName = `${docId}/${Date.now()}_reference.pdf`;
  const { data, error } = await supabase.storage
    .from('pdf-references')
    .upload(fileName, binaryFile, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    console.warn(`Storage upload warning: ${error.message}`);
    return fileName;
  }

  return data.path || fileName;
}

// -------------------------------------------------------------
// 4. Strict Ordered Document Sync Pipeline
// -------------------------------------------------------------

/**
 * Synchronizes a Document and all its hierarchical dependencies to Supabase
 * @param docId Dexie Document ID
 * @param isDraft If true, sets is_published = false (default: false -> published = true)
 */
export async function syncDocumentHierarchy(
  docId: number,
  isDraft: boolean = false,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      message: 'لم يتم إعداد بيانات اتصال Supabase (VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY)',
      errorStep: 'supabase_init'
    };
  }

  const isPublished = !isDraft;

  try {
    const doc = await db.documents.get(docId);
    if (!doc) {
      throw new Error(`الوثيقة برقم ${docId} غير موجودة في قاعدة البيانات المحلية`);
    }

    // ---------------------------------------------------------
    // الخطوة 0: حل الهيكل الهرمي (Taxonomy Resolution)
    // ---------------------------------------------------------
    onProgress?.('التحقق من الهيكل الهرمي للوحدة والمنهاج...', 5);
    const { unitId } = await resolveTaxonomyHierarchy({
      country: doc.country,
      grade: doc.grade,
      subject: doc.subject,
      unit: doc.unit,
      part: doc.part,
    });

    // عدادات المزامنة والربط لمنع التكرار وعرض التقرير الختامي
    let linkedCount = 0;
    let addedCount = 0;
    let deletedCount = 0;

    // ---------------------------------------------------------
    // الخطوة 1: فحص التكرار ومزامنة NewDocuments (مقارنة المفتاح الطبيعي)
    // ---------------------------------------------------------
    onProgress?.('فحص التكرار ومزامنة بيانات الوثيقة والوحدة (NewDocuments)...', 12);
    const docHash = computeContentHash(doc);
    const docType = doc.type || 'lesson';

    let mapping = await getMappingIfExists('NewDocuments', String(doc.id));

    if (!mapping) {
      const matches = await findExistingDocuments(unitId, docType, doc.title);

      if (matches.length > 1) {
        throw new Error(
          `يوجد ${matches.length} وثائق مكررة بعنوان "${doc.title}" في السحابة. ` +
          `نظّفها أولاً (استعلام التنظيف) ثم أعد المزامنة.`
        );
      }

      if (matches.length === 1) {
        // لا تتصرف بصمت: اطلب تأكيداً صريحاً من المستخدم
        const confirmed = await confirmDialog(
          `توجد في السحابة وثيقة بنفس العنوان "${doc.title}" ` +
          `(أُنشئت ${new Date(matches[0].created_at).toLocaleString('ar')}).\n` +
          `هل تريد ربط هذه النسخة المحلية بها وتحديثها بدل إنشاء نسخة جديدة؟`
        );
        if (!confirmed) throw new Error('أُلغيت المزامنة لتفادي التكرار');
        await upsertSyncMapping('NewDocuments', String(doc.id), matches[0].id);
        mapping = await getMappingIfExists('NewDocuments', String(doc.id));
        linkedCount++;
      }
    }

    const docPayload: any = {
      title: doc.title,
      doc_type: docType,
      unit_id: unitId,
      families_analysis: doc.familiesAnalysis || null,
      series_name: doc.seriesName || null,
      teacher_name: doc.teacherName || null,
      teacher_role: doc.teacherRole || null,
      is_published: isPublished,
      updated_at: new Date(doc.updatedAt || Date.now()).toISOString(),
    };

    let remoteDocId = mapping?.remoteId;

    if (remoteDocId) {
      docPayload.id = remoteDocId;
      const { data, error } = await supabase
        .from('NewDocuments')
        .upsert(docPayload)
        .select('id')
        .single();

      if (error) throw new Error(formatSupabaseErrorMessage('خطوة 1 [NewDocuments Update]', error));
      remoteDocId = data.id;
    } else {
      const { data, error } = await supabase
        .from('NewDocuments')
        .insert(docPayload)
        .select('id')
        .single();

      if (error) throw new Error(formatSupabaseErrorMessage('خطوة 1 [NewDocuments Insert]', error));
      remoteDocId = data.id;
      addedCount++;
    }

    await upsertSyncMapping('NewDocuments', String(docId), remoteDocId!, docHash, isPublished);

    // ---------------------------------------------------------
    // الخطوة 2: مزامنة NewPdfContents (مع رفع Storage)
    // ---------------------------------------------------------
    onProgress?.('مزامنة المراجع والملفات (NewPdfContents)...', 25);
    const pdfContents = await db.pdfContents.where('docId').equals(docId).toArray();

    for (const pdf of pdfContents) {
      if (!pdf.id) continue;
      const pdfHash = computeContentHash(pdf);
      const pdfMapping = await getSyncMapping('pdfContents', pdf.id);

      let storagePath: string | null = null;
      if (pdf.originalFile && pdf.originalFile.length > 0) {
        try {
          storagePath = await uploadPdfFileToStorage(docId, pdf.originalFile);
        } catch (storageErr) {
          console.warn('PDF storage upload failed, continuing metadata sync:', storageErr);
        }
      }

      const pdfPayload: any = {
        document_id: remoteDocId,
        text_content: pdf.textContent || '',
        structured_content: pdf.structuredContent || null,
        storage_path: storagePath,
      };

      let remotePdfId = pdfMapping?.remoteId;
      if (remotePdfId) {
        pdfPayload.id = remotePdfId;
        const { data, error } = await supabase
          .from('NewPdfContents')
          .upsert(pdfPayload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 2 [NewPdfContents]', error));
        remotePdfId = data.id;
      } else {
        const { data, error } = await supabase
          .from('NewPdfContents')
          .insert(pdfPayload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 2 [NewPdfContents]', error));
        remotePdfId = data.id;
      }

      await saveSyncMapping('pdfContents', pdf.id, remotePdfId!, pdfHash, isPublished);
    }

    // ---------------------------------------------------------
    // الخطوة 3: مزامنة NewLessonSections (مع تبنّي الأقسام السحابية ومنع التكرار)
    // ---------------------------------------------------------
    onProgress?.('مزامنة الدروس والفقرات النظرية (NewLessonSections)...', 40);
    const rawSections = await db.lessonSections.where('docId').equals(docId).toArray();
    const sortedSections = [...rawSections].sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 0;
      const orderB = typeof b.order === 'number' ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    const maxLocalOrder = sortedSections.length;

    // ترقيم الفقرات محلياً بشكل متسلسل يبدأ من 1 لتفادي تكرار order = 0
    for (let idx = 0; idx < sortedSections.length; idx++) {
      const sec = sortedSections[idx];
      const normalizedOrder = idx + 1;
      if (sec.order !== normalizedOrder && sec.id) {
        await db.lessonSections.update(sec.id, { order: normalizedOrder });
        sec.order = normalizedOrder;
      }
    }

    // جلب الفقرات الموجودة مسبقاً في السحابة لهذا المستند للربط والتبنّي
    const { data: remoteExistingSections } = await supabase
      .from('NewLessonSections')
      .select('id, title, order_index')
      .eq('document_id', remoteDocId);

    const sectionRemoteMap = new Map<number, string>();
    const matchedRemoteSecIds = new Set<string>();

    for (let idx = 0; idx < sortedSections.length; idx++) {
      const sec = sortedSections[idx];
      if (!sec.id) continue;
      const targetOrder = idx + 1;
      const secHash = computeContentHash(sec);
      const secMapping = await getMappingIfExists('lessonSections', sec.id);

      let remoteSecId: string | undefined = undefined;

      // 1. فحص إذا كان للفقرة ربط محلي سابق
      if (secMapping?.remoteId && (remoteExistingSections || []).some(r => r.id === secMapping!.remoteId)) {
        remoteSecId = secMapping.remoteId;
      } else {
        // 2. تبني الأقسام السحابية: مطابقة بمفتاح (document_id, order_index)
        const matchByOrder = (remoteExistingSections || []).find(
          r => r.order_index === targetOrder && !matchedRemoteSecIds.has(r.id)
        );
        if (matchByOrder) {
          remoteSecId = matchByOrder.id;
          await upsertSyncMapping('lessonSections', sec.id, remoteSecId, secHash, isPublished);
          linkedCount++;
        } else {
          // مطابقة بالعنوان بعد التطبيع كخيار احتياطي
          const normSecTitle = normalizeTitle(sec.title);
          const matchByTitle = (remoteExistingSections || []).find(
            r => normalizeTitle(r.title || '') === normSecTitle && !matchedRemoteSecIds.has(r.id)
          );
          if (matchByTitle) {
            remoteSecId = matchByTitle.id;
            await upsertSyncMapping('lessonSections', sec.id, remoteSecId, secHash, isPublished);
            linkedCount++;
          }
        }
      }

      if (!remoteSecId) {
        addedCount++;
      }

      // استخراج التحليلات والإضافات التربوية من analysis.additions إن وجدت لتعبئة الأعمدة المستقلة بدقة
      const additions = (typeof sec.analysis === 'object' && Array.isArray(sec.analysis?.additions))
        ? sec.analysis.additions
        : [];

      const getAdditionContent = (index: number, exactLabels: string[], fallbackKeywords: string[]): string | null => {
        const itemByExact = additions.find((a: any) => 
          a && typeof a.label === 'string' && exactLabels.some(l => a.label.trim() === l.trim() || a.label.includes(l))
        );
        const itemByKeyword = !itemByExact ? additions.find((a: any) =>
          a && typeof a.label === 'string' && fallbackKeywords.some(k => a.label.includes(k))
        ) : null;
        const itemByIndex = additions[index];
        const res = itemByExact || itemByKeyword || itemByIndex;
        return (res && typeof res.content === 'string' && res.content.trim()) ? res.content.trim() : null;
      };

      const resolvedGuidance = sec.guidance || getAdditionContent(0, ['إرشادات ذكية للطالب', 'إرشادات ذكية', 'إرشادات'], ['إرشاد']);
      const resolvedNotes = sec.notes || getAdditionContent(1, ['ملاحظات ونتائج هامة', 'ملاحظات ونتائج ذهبية', 'ملاحظات هامة'], ['ملاحظ']);
      const resolvedTraps = sec.traps || getAdditionContent(2, ['مطبات امتحانية وتحذيرات', 'مطبات امتحانية', 'مطب امتحاني - كُن حذراً'], ['مطب', 'مطبات', 'تحذير']);
      const examGuidanceFromAdditions = (() => {
        const item = additions.find((a: any) => {
          if (!a || typeof a.label !== 'string') return false;
          const lbl = a.label;
          return (lbl.includes('الدليل الامتحاني') || lbl.includes('الدليل المنهجي') || lbl.includes('طريقة ورود الفكرة')) 
            && !lbl.includes('مطب');
        });
        if (item && typeof item.content === 'string' && item.content.trim()) return item.content.trim();
        const itemAt3 = additions[3];
        return (itemAt3 && typeof itemAt3.content === 'string' && itemAt3.content.trim()) ? itemAt3.content.trim() : null;
      })();
      const resolvedExamGuidance = sec.examGuidance || examGuidanceFromAdditions;

      const resolvedExampleText = sec.exampleText || getAdditionContent(4, ['تطبيق عملي مكرّس (من الكتاب)', 'تطبيق عملي مكرّس للفهم', 'تطبيق عملي', 'تمرين تطبيقي'], ['تطبيق']);
      const resolvedSolutionText = sec.solutionText || getAdditionContent(5, ['الحل النموذجي', 'الحل النموذجي المنهجي', 'خطوات الحل المنهجي النموذجي'], ['الحل النموذجي', 'حل نموذجي']);
      const resolvedExtraExampleText = sec.extraExampleText || getAdditionContent(6, ['تمرين إضافي داعم', 'تمرين إضافي مكرّس ذو صياغة ذكية', 'تمرين إضافي'], ['إضافي']);
      const resolvedExtraSolutionText = sec.extraSolutionText || getAdditionContent(7, ['حل التمرين الإضافي', 'الحل النموذجي للتمرين الإضافي'], ['حل التمرين الإضافي', 'حل إضافي']);

      const secPayload: any = {
        document_id: remoteDocId,
        unit_id: unitId || null,
        youtube_url: sec.youtubeUrl || null,
        lesson_id: null,
        title: sec.title,
        content: sec.content,
        svg_code: sec.svgCode || null,
        analysis_rephrased_content: typeof sec.analysis === 'string' ? sec.analysis : (sec.analysis?.rephrasedContent || null),
        analysis_additions: typeof sec.analysis === 'object' ? sec.analysis : null,
        order_index: targetOrder,
        concept_label: sec.conceptLabel || null,
        illustrations_label: sec.illustrationsLabel || null,
        practice_section_label: sec.practiceSectionLabel || null,
        practical_section_label: sec.practicalSectionLabel || null,
        is_practice_only: !!sec.isPracticeOnly,
        guidance: resolvedGuidance || null,
        notes: resolvedNotes || null,
        traps: resolvedTraps || null,
        exam_guidance: resolvedExamGuidance || null,
        example_text: resolvedExampleText || null,
        solution_text: resolvedSolutionText || null,
        extra_example_text: resolvedExtraExampleText || null,
        extra_solution_text: resolvedExtraSolutionText || null,
      };

      if (remoteSecId) {
        secPayload.id = remoteSecId;
      }

      let saveResult = await supabase
        .from('NewLessonSections')
        .upsert(secPayload, { onConflict: 'document_id,order_index' })
        .select('id')
        .single();

      // التوافق المرن: إذا كان جدول NewLessonSections لا يحوي بعد عمود unit_id أو youtube_url في قاعدة البيانات
      if (saveResult.error && saveResult.error.message && (saveResult.error.message.includes('unit_id') || saveResult.error.message.includes('youtube_url') || saveResult.error.code === 'PGRST204')) {
        const fallbackPayload = { ...secPayload };
        if (saveResult.error.message.includes('unit_id')) delete fallbackPayload.unit_id;
        if (saveResult.error.message.includes('youtube_url')) delete fallbackPayload.youtube_url;
        saveResult = await supabase
          .from('NewLessonSections')
          .upsert(fallbackPayload, { onConflict: 'document_id,order_index' })
          .select('id')
          .single();
      }

      if (saveResult.error) throw new Error(formatSupabaseErrorMessage('خطوة 3 [NewLessonSections]', saveResult.error));
      remoteSecId = saveResult.data.id;

      matchedRemoteSecIds.add(remoteSecId!);
      sectionRemoteMap.set(sec.id, remoteSecId!);
      await upsertSyncMapping('lessonSections', sec.id, remoteSecId!, secHash, isPublished);
    }

    // بعد الانتهاء احذف من السحابة الأقسام التي order_index لها أكبر من آخر قسم محلي
    const orphanSections = (remoteExistingSections || []).filter(
      r => r.order_index > maxLocalOrder || !matchedRemoteSecIds.has(r.id)
    );
    if (orphanSections.length > 0) {
      const orphanIds = orphanSections.map(r => r.id);
      try {
        const { data: oExs } = await supabase.from('NewLessonSectionExercises').select('id').in('section_id', orphanIds);
        if (oExs && oExs.length > 0) {
          const oExIds = oExs.map(e => e.id);
          await supabase.from('NewExerciseStations').delete().in('exercise_id', oExIds);
          await supabase.from('NewLessonSectionExercises').delete().in('id', oExIds);
        }
        await supabase.from('NewLessonSections').delete().in('id', orphanIds);
        deletedCount += orphanSections.length;
      } catch (delErr) {
        console.warn('Could not clean up orphan sections:', delErr);
      }
    }

    // ---------------------------------------------------------
    // الخطوة 4: مزامنة NewLessonSectionExercises (مطابقة kind, order_index وتبنّي التمارين)
    // ---------------------------------------------------------
    onProgress?.('مزامنة التمارين والمسائل التطبيقية (NewLessonSectionExercises)...', 55);
    const exerciseRemoteMap = new Map<string, string>();
    const pendingExercisesForFamilyUpdate: Array<{ localExId: string; remoteExId: string; localFamilyId?: string | number }> = [];

    for (const sec of sortedSections) {
      if (!sec.id) continue;
      const remoteSecId = sectionRemoteMap.get(sec.id);
      if (!remoteSecId) continue;

      const allExercisesToSync = [
        ...(sec.practiceExercises || []).map(ex => ({ ...ex, kind: 'practice' as const })),
        ...(sec.practicalExercises || []).map(ex => ({ ...ex, kind: 'practical' as const }))
      ];

      // اجلب تمارين القسم السحابية (id, kind, order_index)
      const { data: remoteExistingExercises } = await supabase
        .from('NewLessonSectionExercises')
        .select('id, kind, order_index, title')
        .eq('section_id', remoteSecId);

      const currentSecSyncedExIds = new Set<string>();

      for (let exIdx = 0; exIdx < allExercisesToSync.length; exIdx++) {
        const ex = allExercisesToSync[exIdx];
        if (!ex.id) continue;
        const targetOrder = exIdx + 1;

        if (!['practice', 'practical'].includes(ex.kind)) {
          console.error(`قيمة kind غير صالحة: ${ex.kind} للتمرين ${ex.id}`);
          throw new Error(`تعذّرت مزامنة التمرين "${ex.title}" بسبب قيمة kind غير صالحة`);
        }

        const exHash = computeContentHash(ex);
        const exMapping = await getMappingIfExists('practiceExercises', ex.id);

        let remoteExId: string | undefined = undefined;

        // 1. الربط المحلي إن وُجد بالسحابة
        if (exMapping?.remoteId && (remoteExistingExercises || []).some(r => r.id === exMapping!.remoteId)) {
          remoteExId = exMapping.remoteId;
        } else {
          // 2. طابقها مع المحلية بـ (kind, order_index) وسجّل الربط
          const match = (remoteExistingExercises || []).find(
            r => r.kind === ex.kind && r.order_index === targetOrder && !currentSecSyncedExIds.has(r.id)
          );
          if (match) {
            remoteExId = match.id;
            await upsertSyncMapping('practiceExercises', ex.id, remoteExId, exHash, isPublished);
            linkedCount++;
          }
        }

        const exPayload: any = {
          section_id: remoteSecId,
          title: ex.title || 'تمرين تطبيقي',
          question_text: ex.questionText || '',
          solution_text: ex.solutionText || '',
          strategy_text: ex.strategyText || null,
          svg_code: ex.svgCode || null,
          kind: ex.kind,
          is_lead_exercise: !!ex.is_lead_exercise,
          primary_concept: ex.primary_concept || null,
          secondary_concepts: ex.secondary_concepts || [],
          order_index: targetOrder,
        };

        if (remoteExId) {
          exPayload.id = remoteExId;
          const { data, error } = await supabase
            .from('NewLessonSectionExercises')
            .upsert(exPayload)
            .select('id')
            .single();
          if (error) throw new Error(formatSupabaseErrorMessage('خطوة 4 [NewLessonSectionExercises Update]', error));
          remoteExId = data.id;
        } else {
          // أدرج غير المطابَق فقط
          const { data, error } = await supabase
            .from('NewLessonSectionExercises')
            .insert(exPayload)
            .select('id')
            .single();
          if (error) throw new Error(formatSupabaseErrorMessage('خطوة 4 [NewLessonSectionExercises Insert]', error));
          remoteExId = data.id;
          addedCount++;
        }

        currentSecSyncedExIds.add(remoteExId!);
        exerciseRemoteMap.set(String(ex.id), remoteExId!);
        await upsertSyncMapping('practiceExercises', ex.id, remoteExId!, exHash, isPublished);

        if (ex.family_id) {
          pendingExercisesForFamilyUpdate.push({
            localExId: String(ex.id),
            remoteExId: remoteExId!,
            localFamilyId: ex.family_id,
          });
        }
      }

      // واحذف الفائض السحابي الذي لا مقابل محلياً له
      const orphanExercises = (remoteExistingExercises || []).filter(r => !currentSecSyncedExIds.has(r.id));
      if (orphanExercises.length > 0) {
        const orphanExIds = orphanExercises.map(r => r.id);
        try {
          await supabase.from('NewExerciseStations').delete().in('exercise_id', orphanExIds);
          await supabase.from('NewLessonSectionExercises').delete().in('id', orphanExIds);
          deletedCount += orphanExercises.length;
        } catch (delExErr) {
          console.warn('Could not clean up orphan exercises:', delExErr);
        }
      }
    }

    // ---------------------------------------------------------
    // الخطوة 5: مزامنة NewExerciseFamilies (مطابقة بـ document_id, family_name)
    // ---------------------------------------------------------
    onProgress?.('مزامنة عائلات التمارين (NewExerciseFamilies)...', 68);
    const families = await db.exerciseFamilies.where('docId').equals(docId).toArray();
    const familyRemoteMap = new Map<string | number, string>();

    const { data: remoteExistingFamilies } = await supabase
      .from('NewExerciseFamilies')
      .select('id, family_name')
      .eq('document_id', remoteDocId);

    const matchedRemoteFamIds = new Set<string>();

    for (const fam of families) {
      if (!fam.id) continue;
      const famHash = computeContentHash(fam);
      const famMapping = await getMappingIfExists('exerciseFamilies', fam.id);

      let remoteFamId: string | undefined = undefined;

      if (famMapping?.remoteId && (remoteExistingFamilies || []).some(r => r.id === famMapping!.remoteId)) {
        remoteFamId = famMapping.remoteId;
      } else {
        // طابقها بـ (document_id, family_name)
        const targetFamName = normalizeTitle(fam.familyName || '');
        const matchFam = (remoteExistingFamilies || []).find(
          r => normalizeTitle(r.family_name || '') === targetFamName && !matchedRemoteFamIds.has(r.id)
        );
        if (matchFam) {
          remoteFamId = matchFam.id;
          await upsertSyncMapping('exerciseFamilies', fam.id, remoteFamId, famHash, isPublished);
          linkedCount++;
        }
      }

      let remoteLeadExId: string | null = null;
      if (fam.leadExerciseId) {
        remoteLeadExId = exerciseRemoteMap.get(String(fam.leadExerciseId)) || null;
      }

      const famPayload: any = {
        document_id: remoteDocId,
        unit_id: unitId,
        family_name: fam.familyName,
        target_concepts: fam.targetConcepts || [],
        lead_exercise_id: remoteLeadExId,
        has_manual_edits: !!fam.hasManualEdits,
        is_published: isPublished,
      };

      if (remoteFamId) {
        famPayload.id = remoteFamId;
        const { data, error } = await supabase
          .from('NewExerciseFamilies')
          .upsert(famPayload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 5 [NewExerciseFamilies]', error));
        remoteFamId = data.id;
      } else {
        const { data, error } = await supabase
          .from('NewExerciseFamilies')
          .insert(famPayload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 5 [NewExerciseFamilies]', error));
        remoteFamId = data.id;
        addedCount++;
      }

      matchedRemoteFamIds.add(remoteFamId!);
      familyRemoteMap.set(fam.id, remoteFamId!);
      await upsertSyncMapping('exerciseFamilies', fam.id, remoteFamId!, famHash, isPublished);
    }

    // ---------------------------------------------------------
    // الخطوة 6: UPDATE على صفوف NewLessonSectionExercises لإضافة family_id
    // ---------------------------------------------------------
    onProgress?.('ربط التمارين بالعائلات المعتمدة (UPDATE family_id)...', 76);
    for (const item of pendingExercisesForFamilyUpdate) {
      if (!item.localFamilyId) continue;
      const remoteFamId = familyRemoteMap.get(item.localFamilyId);
      if (remoteFamId) {
        const { error } = await supabase
          .from('NewLessonSectionExercises')
          .update({ family_id: remoteFamId })
          .eq('id', item.remoteExId);

        if (error) {
          console.warn(`Warning updating exercise family_id: ${error.message}`);
        }
      }
    }

    // ---------------------------------------------------------
    // الخطوة 7: مزامنة NewExerciseStations (upsert بمفتاح exercise_id, station_order)
    // ---------------------------------------------------------
    onProgress?.('مزامنة محطات التمارين (NewExerciseStations)...', 84);
    const stations = await db.exerciseStations.toArray();
    const docStations = stations.filter(st => exerciseRemoteMap.has(String(st.exerciseId)));
    const coveredLocalExIds = new Set(docStations.map(st => String(st.exerciseId)));

    // دعم إضافي تلقائي: استخراج المحطات من guidedQuestions التابعة لتمارين الفقرات إن لم تكن مسجلة في db.exerciseStations
    for (const sec of sortedSections) {
      const allSecExercises = [...(sec.practiceExercises || []), ...(sec.practicalExercises || [])];
      for (const ex of allSecExercises) {
        if (!ex.id) continue;
        const localExId = String(ex.id);
        const remoteExId = exerciseRemoteMap.get(localExId);
        if (!remoteExId || coveredLocalExIds.has(localExId)) continue;

        if (Array.isArray(ex.guidedQuestions) && ex.guidedQuestions.length > 0) {
          for (let gIdx = 0; gIdx < ex.guidedQuestions.length; gIdx++) {
            const gq = ex.guidedQuestions[gIdx];
            const order = gq.questionOrder || (gIdx + 1);
            const choices = (gq.options || []).map((o, oIdx) => ({
              id: o.id || `opt_${order}_${oIdx}`,
              text: o.text || '',
              isCorrect: !!o.isCorrect,
              misconceptionDiagnosis: o.misconceptionDiagnosis || null
            }));
            const correctIndex = choices.findIndex(c => c.isCorrect);

            docStations.push({
              id: undefined,
              exerciseId: ex.id as any,
              stationOrder: order,
              title: gq.title || `المحطة ${order}`,
              questionText: gq.prompt || '',
              choices,
              correctChoiceIndex: correctIndex >= 0 ? correctIndex : 0,
              hintText: gq.hint || null,
              hintLevel1: gq.hintLevel1 || null,
              hintLevel2: gq.hintLevel2 || null,
              skipExplanation: gq.skipExplanation || null,
              conceptMap: gq.conceptMap || null
            } as any);
          }
          coveredLocalExIds.add(localExId);
        }
      }
    }

    const remoteExIdsWithStations = Array.from(new Set(docStations.map(st => exerciseRemoteMap.get(String(st.exerciseId))).filter(Boolean) as string[]));
    const { data: remoteExistingStations } = remoteExIdsWithStations.length > 0
      ? await supabase
          .from('NewExerciseStations')
          .select('id, exercise_id, station_order')
          .in('exercise_id', remoteExIdsWithStations)
      : { data: [] };

    const syncedRemoteStationIds = new Set<string>();

    for (const st of docStations) {
      const remoteExId = exerciseRemoteMap.get(String(st.exerciseId));
      if (!remoteExId) continue;

      const stHash = computeContentHash(st);
      const stMapping = st.id ? await getMappingIfExists('exerciseStations', st.id) : null;

      const existingRemoteSt = (remoteExistingStations || []).find(
        r => r.exercise_id === remoteExId && r.station_order === st.stationOrder
      );

      const stPayload: any = {
        exercise_id: remoteExId,
        station_order: st.stationOrder,
        title: st.title || null,
        question_text: st.questionText || '',
        choices: st.choices || [],
        correct_choice_index: st.correctChoiceIndex ?? 0,
        hint_text: st.hintText || null,
        hint_level1: st.hintLevel1 || null,
        hint_level2: st.hintLevel2 || null,
        skip_explanation: st.skipExplanation || null,
        concept_map: st.conceptMap || null,
      };

      let remoteStId = stMapping?.remoteId || existingRemoteSt?.id;
      if (remoteStId) {
        stPayload.id = remoteStId;
        if (existingRemoteSt && !stMapping?.remoteId) {
          linkedCount++;
        }
      } else {
        addedCount++;
      }

      const { data, error } = await supabase
        .from('NewExerciseStations')
        .upsert(stPayload, { onConflict: 'exercise_id,station_order' })
        .select('id')
        .single();
      if (error) throw new Error(formatSupabaseErrorMessage('خطوة 7 [NewExerciseStations]', error));
      remoteStId = data.id;

      syncedRemoteStationIds.add(remoteStId!);
      if (st.id) {
        await upsertSyncMapping('exerciseStations', st.id, remoteStId!, stHash, isPublished);
      }
    }

    const orphanStations = (remoteExistingStations || []).filter(r => !syncedRemoteStationIds.has(r.id));
    if (orphanStations.length > 0) {
      const oIds = orphanStations.map(r => r.id);
      try {
        await supabase.from('NewExerciseStations').delete().in('id', oIds);
        deletedCount += orphanStations.length;
      } catch (stDelErr) {
        console.warn('Could not clean up orphan stations:', stDelErr);
      }
    }

    // ---------------------------------------------------------
    // الخطوة 8: مزامنة باقي المكونات المستقلة المرتبطة بالوثيقة بالتوازي
    // ---------------------------------------------------------
    onProgress?.('مزامنة الاختبارات، الخرائط الذهنية والمراجعة الشاملة...', 92);

    await Promise.all([
      // 8.1 Unit Quizzes
      (async () => {
        const quizzes = await db.unitQuizzes.where('docId').equals(docId).toArray();
        for (const q of quizzes) {
          if (!q.id) continue;
          const qHash = computeContentHash(q);
          const qMapping = await getMappingIfExists('unitQuizzes', q.id);
          const payload: any = {
            document_id: remoteDocId,
            unit_id: unitId,
            title: q.title,
            total_questions: q.totalQuestions || q.questions?.length || 0,
            passing_score: q.passingScore || null,
            validation_score: q.validationScore || null,
            is_published: isPublished,
            is_reviewed: true,
          };
          let rId = qMapping?.remoteId;
          if (rId) {
            payload.id = rId;
            const { data, error } = await supabase.from('NewUnitQuizzes').upsert(payload).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitQuizzes]', error));
            rId = data.id;
          } else {
            const { data, error } = await supabase.from('NewUnitQuizzes').insert(payload).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitQuizzes]', error));
            rId = data.id;
          }

          // Sync Quiz Questions
          if (q.questions && q.questions.length > 0) {
            await supabase.from('NewUnitQuizQuestions').delete().eq('quiz_id', rId);
            for (let i = 0; i < q.questions.length; i++) {
              const item = q.questions[i] as any;
              const qItemPayload: any = {
                quiz_id: rId,
                question_number: item.questionNumber || i + 1,
                question_text: item.questionText || item.question || '',
                options: item.options || [],
                correct_option_id: String(item.correctOptionId ?? item.correctAnswer ?? 0),
                explanation: item.explanation || item.detailedSolution || null,
                hint: item.hint || null,
                topic: item.topic || null,
                difficulty: item.difficulty || 'medium',
                validation_score: item.validationScore || null,
              };
              await supabase.from('NewUnitQuizQuestions').insert(qItemPayload);
            }
          }

          await upsertSyncMapping('unitQuizzes', q.id, rId!, qHash, isPublished);
        }
      })(),

      // 8.2 Unit Mind Maps (UNIQUE unit_id: upsert مع onConflict: 'unit_id')
      (async () => {
        const maps = await db.unitMindMaps.where('docId').equals(docId).toArray();
        for (const m of maps) {
          if (!m.id) continue;
          const mHash = computeContentHash(m);
          const mMapping = await getMappingIfExists('unitMindMaps', m.id);
          const payload: any = {
            document_id: remoteDocId,
            unit_id: unitId,
            title: m.title,
            svg_code: m.svgCode || '',
            markdown_schema: m.markdownSchema || null,
            tree_data: m.treeData || null,
            is_published: isPublished,
          };
          let rId = mMapping?.remoteId;
          if (rId) {
            payload.id = rId;
            const { data, error } = await supabase.from('NewUnitMindMaps').upsert(payload).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitMindMaps]', error));
            rId = data.id;
          } else {
            const { data, error } = await supabase.from('NewUnitMindMaps').upsert(payload, { onConflict: 'unit_id' }).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitMindMaps]', error));
            rId = data.id;
          }
          await upsertSyncMapping('unitMindMaps', m.id, rId!, mHash, isPublished);
        }
      })(),

      // 8.3 Unit Comprehensive Reviews (UNIQUE unit_id: upsert مع onConflict: 'unit_id')
      (async () => {
        const revs = await db.unitComprehensiveReviews.where('docId').equals(docId).toArray();
        for (const r of revs) {
          if (!r.id) continue;
          const rHash = computeContentHash(r);
          const rMapping = await getMappingIfExists('unitComprehensiveReviews', r.id);
          const payload: any = {
            document_id: remoteDocId,
            unit_id: unitId,
            title: r.title,
            summary_text: r.summaryText || '',
            definitions: r.definitions || [],
            theorems: r.theorems || [],
            results: r.results || [],
            traps_and_tips: r.trapsAndTips || [],
            formulas_summary: r.formulasSummary || null,
            is_published: isPublished,
          };
          let rId = rMapping?.remoteId;
          if (rId) {
            payload.id = rId;
            const { data, error } = await supabase.from('NewUnitComprehensiveReviews').upsert(payload).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitComprehensiveReviews]', error));
            rId = data.id;
          } else {
            const { data, error } = await supabase.from('NewUnitComprehensiveReviews').upsert(payload, { onConflict: 'unit_id' }).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitComprehensiveReviews]', error));
            rId = data.id;
          }
          await upsertSyncMapping('unitComprehensiveReviews', r.id, rId!, rHash, isPublished);
        }
      })(),

      // 8.4 Unit Exercise Families (including lead/non-lead exercises and stations)
      (async () => {
        try {
          const { loadUnitExerciseFamilies } = await import('../db/exerciseFamiliesRPC');
          const fams = await loadUnitExerciseFamilies(docId);
          for (const fam of fams) {
            try {
              await syncExerciseFamily(fam, remoteDocId, unitId, isPublished);
            } catch (famErr) {
              console.error('Error syncing family during document sync:', famErr);
            }
          }
        } catch (loadErr) {
          console.error('Error loading families during document sync:', loadErr);
        }
      })(),
    ]);

    const summaryText = `رُبطت ${linkedCount} عنصراً، أُضيف ${addedCount}، حُذف ${deletedCount}.`;
    onProgress?.(`اكتملت المزامنة بنجاح! 🚀 (${summaryText})`, 100);
    return {
      success: true,
      message: `تم اعتماد ونشر الوحدة "${doc.title}" وكافة محطاتها بنجاح إلى Supabase! (${summaryText})`,
      syncedCount: linkedCount + addedCount,
      details: { linkedCount, addedCount, deletedCount },
    };
  } catch (err: any) {
    console.error('Error syncing document hierarchy:', err);
    onProgress?.(`خطأ أثناء المزامنة: ${err.message}`, 100, true);
    return {
      success: false,
      message: err.message || 'حدث خطأ غير متوقع أثناء المزامنة',
      errorStep: 'pipeline_execution',
      details: err,
    };
  }
}

// -------------------------------------------------------------
// 5. Standalone Content Item Syncers (Tests, Exam Summaries, Past Papers, General Question Banks)
// -------------------------------------------------------------

/**
 * 5. مزامنة الاختبارات الشاملة: syncComprehensiveTest
 * مزامنة متكاملة ودقيقة للاختبارات بجميع أقسامها وأسئلتها وحلولها النموذجية (سلم التصحيح) مع NewTests و NewTestSections و NewTestQuestions
 */
export async function syncComprehensiveTest(
  testId: number,
  isDraft: boolean = false,
  multiUnitList?: string[]
): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const test = await db.tests.get(testId);
    if (!test) throw new Error(`الاختبار ${testId} غير موجود محلياً`);

    // -------------------------------------------------------------
    // التحقق الصارم قبل الإرسال (Pre-flight Guard) - يُنفَّذ دفعة واحدة قبل أي اتصال شبكي
    // -------------------------------------------------------------
    const errors: string[] = [];
    const validDifficulties = ['سهل', 'متوسط', 'صعب', 'مهارات عليا', 'مهارات تفكير عليا'];
    if (!test.difficulty || !validDifficulties.includes(test.difficulty.trim())) {
      errors.push(`قيمة صعوبة غير معروفة: "${test.difficulty}"`);
    }

    const derivedScope = deriveTestScope(test, multiUnitList);
    if (derivedScope === 'unit' && (!test.unit || test.unit.trim() === '')) {
      errors.push('فئة الاتساع "وحدة واحدة" لكن لا يوجد اسم وحدة');
    }

    if (!test.testData || !test.testData.sections || !Array.isArray(test.testData.sections) || test.testData.sections.length === 0) {
      errors.push('لا توجد أقسام أو أسئلة في بيانات الاختبار');
    } else {
      test.testData.sections.forEach((sec: any, secIdx: number) => {
        const secTitle = sec.title || `القسم ${secIdx + 1}`;
        if (!sec.questions || !Array.isArray(sec.questions) || sec.questions.length === 0) {
          errors.push(`القسم "${secTitle}" لا يحتوي على أي أسئلة`);
          return;
        }
        sec.questions.forEach((q: any, i: number) => {
          if (!q.solution || typeof q.solution !== 'string' || !q.solution.trim()) {
            errors.push(`سؤال ${i + 1} في "${secTitle}" بلا حل/سلم تصحيح`);
          }
          if (sec.sectionType === 'mcq' && (!q.options || !Array.isArray(q.options) || q.options.length !== 4)) {
            errors.push(`سؤال اختيار من متعدد رقم ${i + 1} في "${secTitle}" لا يملك 4 خيارات بالضبط`);
          }
        });
      });
    }

    if (errors.length > 0) {
      throw new Error('فشل التحقق قبل المزامنة:\n' + errors.join('\n'));
    }

    // -------------------------------------------------------------
    // الخطوة 1: مزامنة تصنيف الاختبار (Category) إن لم يكن مُزامَناً
    // -------------------------------------------------------------
    let categoryRemoteId: string | null = null;
    if (test.categoryId) {
      const categoryMapping = (await getMappingIfExists('NewTestCategories', String(test.categoryId))) ||
                              (await getMappingIfExists('testCategories', String(test.categoryId)));
      if (categoryMapping?.remoteId) {
        categoryRemoteId = categoryMapping.remoteId;
      } else {
        const localCat = await db.testCategories.get(test.categoryId);
        const catName = localCat?.name?.trim() || 'عام';

        const { data: existingCat } = await supabase
          .from('NewTestCategories')
          .select('id')
          .eq('name', catName)
          .maybeSingle();

        if (existingCat?.id) {
          categoryRemoteId = existingCat.id;
        } else {
          categoryRemoteId = await insertRow('NewTestCategories', { name: catName });
        }
        await upsertSyncMapping('NewTestCategories', String(test.categoryId), categoryRemoteId, computeContentHash({ name: catName }));
        await upsertSyncMapping('testCategories', String(test.categoryId), categoryRemoteId, computeContentHash({ name: catName }));
      }
    }

    // -------------------------------------------------------------
    // الخطوة 2: تحديد unit_id / unit_ids حسب الفئة المُستنتَجة
    // -------------------------------------------------------------
    let unitRemoteId: string | null = null;
    let unitRemoteIds: string[] | null = null;

    if (derivedScope === 'unit') {
      unitRemoteId = await resolveUnitRemoteIdByName(test.unit!);
    } else if (derivedScope === 'multi_unit') {
      if (multiUnitList && multiUnitList.length > 0) {
        unitRemoteIds = await Promise.all(multiUnitList.map(u => resolveUnitRemoteIdByName(u)));
      }
    }

    // -------------------------------------------------------------
    // الخطوة 3: إدراج/تحديث NewTests
    // -------------------------------------------------------------
    let sourceDocumentIds: string[] = [];
    if (test.pdfIds && test.pdfIds.length > 0) {
      for (const pdfId of test.pdfIds) {
        const mapping = await getSyncMapping('pdfContents', pdfId);
        if (mapping?.remoteId) {
          sourceDocumentIds.push(mapping.remoteId);
        }
      }
    }

    const isPublished = !isDraft;
    const testHash = computeTestHash(test);
    const mapping = await getMappingIfExists('NewTests', String(testId));

    let topicLabel = test.topic || (test.scope !== 'عام' && test.scope !== 'شامل' ? test.scope : null);
    if (!topicLabel || topicLabel === 'عام' || topicLabel === 'شامل') {
      if (derivedScope === 'unit') {
        topicLabel = test.unit ? `اختبار وحدة: ${test.unit}` : 'اختبار وحدة';
      } else if (derivedScope === 'part') {
        topicLabel = test.unit ? `${test.part || 'جزء كامل'}: ${test.unit}` : `اختبار جزء كامل: ${test.part || ''}`;
      } else if (derivedScope === 'subject_comprehensive') {
        topicLabel = test.unit && !isComprehensiveUnitKeyword(test.unit) ? test.unit : 'اختبار شامل لجميع الوحدات';
      }
    }

    const currentTitle = (test.title || test.testData?.title || '').trim();
    if (test.testData && test.testData.title !== currentTitle) {
      test.testData.title = currentTitle;
      try {
        await db.tests.update(testId, { testData: test.testData, title: currentTitle });
      } catch (e) {
        console.warn('Could not sync testData.title in local db:', e);
      }
    }

    const testPayload: any = {
      title: currentTitle,
      unit_id: unitRemoteId,
      unit_ids: unitRemoteIds,
      difficulty: test.difficulty,
      scope: derivedScope,
      topic_label: topicLabel,
      estimated_time_minutes: test.testData?.estimatedTimeMinutes ?? null,
      category_id: categoryRemoteId,
      source_document_ids: sourceDocumentIds.length > 0 ? sourceDocumentIds : null,
      is_reviewed: !!test.isReviewed,
      review_report: test.reviewReport || null,
      review_issues: test.reviewIssues || null,
      is_published: isPublished,
    };

    let remoteTestId = mapping?.remoteId || (test as any).remoteId;

    if (!remoteTestId) {
      // فحص التكرار في NewTests: unit_id + العنوان (أو scope + العنوان للشامل)
      let checkQuery = supabase
        .from('NewTests')
        .select('id, title, created_at, unit_id, scope');

      if (unitRemoteId) {
        checkQuery = checkQuery.eq('unit_id', unitRemoteId);
      } else if (derivedScope) {
        checkQuery = checkQuery.eq('scope', derivedScope);
      }

      const { data: remoteTests, error: checkErr } = await checkQuery;
      if (checkErr) throw new Error(`تعذّر فحص التكرار للاختبار: ${checkErr.message}`);

      const targetTitle = normalizeTitle(testPayload.title);
      const matches = (remoteTests || []).filter(t => normalizeTitle(t.title || '') === targetTitle);

      if (matches.length > 1) {
        throw new Error(
          `يوجد ${matches.length} اختبارات مكررة بعنوان "${testPayload.title}" في السحابة. ` +
          `نظّفها أولاً ثم أعد المزامنة.`
        );
      }

      if (matches.length === 1) {
        // لا تتصرف بصمت: اطلب تأكيداً صريحاً من المستخدم
        const confirmed = await confirmDialog(
          `يوجد في السحابة اختبار بنفس العنوان "${testPayload.title}" ` +
          `(أُنشئ ${new Date(matches[0].created_at).toLocaleString('ar')}).\n` +
          `هل تريد ربط هذه النسخة المحلية به وتحديثه بدل إنشاء نسخة جديدة؟`
        );
        if (!confirmed) throw new Error('أُلغيت المزامنة لتفادي التكرار');
        await upsertSyncMapping('NewTests', String(testId), matches[0].id);
        remoteTestId = matches[0].id;
      }
    }

    if (remoteTestId) {
      // تحديث السجل القائم حصراً
      const { data, error } = await supabase
        .from('NewTests')
        .update(testPayload)
        .eq('id', remoteTestId)
        .select('id')
        .single();
      if (error) throw new Error(formatSupabaseErrorMessage('خطوة 3 [تحديث NewTests]', error));
      remoteTestId = data.id;
    } else {
      // إدراج سجل جديد فقط عند عدم وجود أي تطابق مسبق
      const { data, error } = await supabase
        .from('NewTests')
        .insert(testPayload)
        .select('id')
        .single();
      if (error) throw new Error(formatSupabaseErrorMessage('خطوة 3 [إدراج NewTests]', error));
      remoteTestId = data.id;
    }

    await upsertSyncMapping('NewTests', String(testId), remoteTestId!, testHash, isPublished);

    // -------------------------------------------------------------
    // الخطوة 4: مزامنة الأقسام والأسئلة (الأسئلة + سلم التصحيح)
    // -------------------------------------------------------------
    const { data: existingSections, error: secFetchErr } = await supabase
      .from('NewTestSections')
      .select('id, section_type, order_index')
      .eq('test_id', remoteTestId);

    if (secFetchErr) {
      throw new Error(formatSupabaseErrorMessage('خطوة 4 [جلب NewTestSections]', secFetchErr));
    }

    const currentSectionRemoteIds = new Set<string>();
    let hasLocalQuestionsUpdated = false;

    for (let sIdx = 0; sIdx < test.testData.sections.length; sIdx++) {
      const section = test.testData.sections[sIdx];
      let secType = section.sectionType || 'questions';
      if (secType === 'shortAnswer' || secType === 'short_answer') {
        secType = 'questions';
      }
      const secTitle = section.title || `القسم ${sIdx + 1}`;
      const secOrder = sIdx + 1;

      const matchedExisting = existingSections?.find(
        s => !currentSectionRemoteIds.has(s.id) && (s.section_type === secType || s.order_index === secOrder)
      );

      let sectionRemoteId: string;
      const sectionPayload: any = {
        test_id: remoteTestId,
        title: secTitle,
        section_type: secType,
        order_index: secOrder,
      };

      if (matchedExisting?.id) {
        const { data: updatedSec, error: uErr } = await supabase
          .from('NewTestSections')
          .update(sectionPayload)
          .eq('id', matchedExisting.id)
          .select('id')
          .single();
        if (uErr) throw new Error(formatSupabaseErrorMessage('خطوة 4 [تحديث NewTestSections]', uErr));
        sectionRemoteId = updatedSec.id;
      } else {
        const { data: insertedSec, error: iErr } = await supabase
          .from('NewTestSections')
          .insert(sectionPayload)
          .select('id')
          .single();
        if (iErr) throw new Error(formatSupabaseErrorMessage('خطوة 4 [إدراج NewTestSections]', iErr));
        sectionRemoteId = insertedSec.id;
      }

      currentSectionRemoteIds.add(sectionRemoteId);

      // تنظيف الأسئلة القديمة في هذا القسم لتفادي أي تصادم أو تكرار أسئلة قديمة
      const { error: delQErr } = await supabase
        .from('NewTestQuestions')
        .delete()
        .eq('section_id', sectionRemoteId);
      if (delQErr) {
        throw new Error(formatSupabaseErrorMessage('خطوة 4 [تنظيف NewTestQuestions]', delQErr));
      }

      // إدراج الأسئلة مع سلم التصحيح
      if (section.questions && section.questions.length > 0) {
        const questionsToInsert: any[] = [];
        for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
          const q = section.questions[qIdx];
          if (!q.solution || !q.solution.trim()) {
            throw new Error(`السؤال رقم ${qIdx + 1} في قسم "${secTitle}" بلا سلم تصحيح — لا يمكن نشره`);
          }

          // توحيد نص السؤال والطلبات كاملة في حقل text لضمان عدم ضياع الطلبات سحابياً
          const fullQuestionText = getQuestionFullText(q) || q.text || '';
          if (q.text !== fullQuestionText) {
            q.text = fullQuestionText;
            hasLocalQuestionsUpdated = true;
          }

          questionsToInsert.push({
            section_id: sectionRemoteId,
            order_index: qIdx + 1,
            text: fullQuestionText,
            options: q.options || null,
            correct_option_index: q.correctOptionIndex ?? null,
            sub_questions: q.subQuestions || null,
            solution: q.solution,
            svg_code: q.svgCode || null,
            solution_svg_code: q.solutionSvgCode || null,
          });
        }

        const { error: insQErr } = await supabase
          .from('NewTestQuestions')
          .insert(questionsToInsert);

        if (insQErr) {
          throw new Error(formatSupabaseErrorMessage('خطوة 4 [إدراج NewTestQuestions]', insQErr));
        }
      }
    }

    if (hasLocalQuestionsUpdated) {
      try {
        await db.tests.update(testId, { testData: test.testData });
      } catch (updErr) {
        console.warn('Could not update testData with unified questions locally:', updErr);
      }
    }

    // تنظيف أي أقسام سحابية محذوفة
    const orphanSections = (existingSections || []).filter(s => !currentSectionRemoteIds.has(s.id));
    if (orphanSections.length > 0) {
      const orphanIds = orphanSections.map(s => s.id);
      try {
        await supabase.from('NewTestQuestions').delete().in('section_id', orphanIds);
        await supabase.from('NewTestSections').delete().in('id', orphanIds);
      } catch (cleanErr) {
        console.warn('Could not clean up orphan test sections:', cleanErr);
      }
    }

    await saveSyncMapping('tests', testId, remoteTestId!, testHash, isPublished);
    await saveSyncMapping('tests', String(testId), remoteTestId!, testHash, isPublished);
    try {
      await db.tests.update(testId, { remoteId: remoteTestId } as any);
    } catch {
      // ignore
    }
    return { success: true, message: `تم اعتماد ونشر الاختبار "${currentTitle}" بنجاح!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة الاختبار' };
  }
}

/**
 * حذف اختبار سحابي واحد بالكامل مع ملحقاته (NewTestQuestions و NewTestSections ثم NewTests)
 * مع ضمان التسلسل الصحيح لعدم الاصطدام بأي قيود مفاتيح أجنبية (Foreign Keys)
 */
export async function deleteRemoteTestCompletely(remoteTestId: string): Promise<{
  success: boolean;
  message: string;
  deletedQuestionsCount: number;
  deletedSectionsCount: number;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ', deletedQuestionsCount: 0, deletedSectionsCount: 0 };

  try {
    // 1. جلب أقسام الاختبار
    const { data: secs, error: sErr } = await supabase
      .from('NewTestSections')
      .select('id')
      .eq('test_id', remoteTestId);

    if (sErr) throw new Error(formatSupabaseErrorMessage('جلب أقسام الاختبار', sErr));

    let qCount = 0;
    const sCount = secs ? secs.length : 0;

    if (secs && secs.length > 0) {
      const secIds = secs.map(s => s.id);

      // 2. فحص وحذف الأسئلة المرتبطة بكل قسم
      const { data: qData } = await supabase
        .from('NewTestQuestions')
        .select('id')
        .in('section_id', secIds);
      qCount = qData ? qData.length : 0;

      const { error: delQErr } = await supabase
        .from('NewTestQuestions')
        .delete()
        .in('section_id', secIds);
      if (delQErr) throw new Error(formatSupabaseErrorMessage('حذف أسئلة الاختبار من NewTestQuestions', delQErr));

      // 3. حذف الأقسام
      const { error: delSecErr } = await supabase
        .from('NewTestSections')
        .delete()
        .in('id', secIds);
      if (delSecErr) throw new Error(formatSupabaseErrorMessage('حذف أقسام الاختبار من NewTestSections', delSecErr));
    }

    // تنظيف إضافي لأي أقسام متبقية ترتبط بهذا الاختبار مباشرة
    await supabase.from('NewTestSections').delete().eq('test_id', remoteTestId);

    // 4. حذف سجل الاختبار نفسه من NewTests
    const { error: delTestErr } = await supabase
      .from('NewTests')
      .delete()
      .eq('id', remoteTestId);
    if (delTestErr) throw new Error(formatSupabaseErrorMessage('حذف الاختبار من NewTests', delTestErr));

    return {
      success: true,
      message: `تم بنجاح حذف الاختبار وملحقاته (${sCount} أقسام، ${qCount} أسئلة)`,
      deletedQuestionsCount: qCount,
      deletedSectionsCount: sCount
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'فشل حذف الاختبار',
      deletedQuestionsCount: 0,
      deletedSectionsCount: 0
    };
  }
}

export interface RemoteTestDiagnosticItem {
  id: string;
  title: string;
  unit_id: string | null;
  scope: string;
  difficulty: string;
  is_published: boolean | null;
  created_at: string | null;
  sectionsCount: number;
  questionsCount: number;
  isDuplicate?: boolean;
  groupKey?: string;
}

/**
 * فحص تفصيلي لكافة الاختبارات السحابية في NewTests مع رصد الأقسام والأسئلة والتكرارات
 */
export async function fetchRemoteTestsDiagnostics(): Promise<{
  success: boolean;
  tests: RemoteTestDiagnosticItem[];
  duplicatesCount: number;
  message?: string;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, tests: [], duplicatesCount: 0, message: 'عميل Supabase غير متوفر' };

  try {
    const { data: allTests, error } = await supabase
      .from('NewTests')
      .select('id, title, unit_id, scope, difficulty, is_published, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!allTests || allTests.length === 0) {
      return { success: true, tests: [], duplicatesCount: 0 };
    }

    const testIds = allTests.map(t => t.id);
    const { data: sections } = await supabase
      .from('NewTestSections')
      .select('id, test_id')
      .in('test_id', testIds);

    const secCountByTest = new Map<string, number>();
    const secToTest = new Map<string, string>();
    const allSecIds: string[] = [];

    if (sections) {
      for (const s of sections) {
        if (s.test_id) {
          secCountByTest.set(s.test_id, (secCountByTest.get(s.test_id) || 0) + 1);
          secToTest.set(s.id, s.test_id);
          allSecIds.push(s.id);
        }
      }
    }

    const qCountByTest = new Map<string, number>();
    if (allSecIds.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < allSecIds.length; i += 100) {
        chunks.push(allSecIds.slice(i, i + 100));
      }
      for (const chunk of chunks) {
        const { data: qData } = await supabase
          .from('NewTestQuestions')
          .select('id, section_id')
          .in('section_id', chunk);
        if (qData) {
          for (const q of qData) {
            if (q.section_id) {
              const tId = secToTest.get(q.section_id);
              if (tId) {
                qCountByTest.set(tId, (qCountByTest.get(tId) || 0) + 1);
              }
            }
          }
        }
      }
    }

    // تجميع لرصد التكرارات (بالعنوان المعياري الذكي)
    const normalize = (s: string) =>
      s.trim()
       .toLowerCase()
       .replace(/[أإآ]/g, 'ا')
       .replace(/ة/g, 'ه')
       .replace(/[-:ـ_\s]+/g, ' ')
       .trim();

    const groups = new Map<string, typeof allTests>();
    for (const t of allTests) {
      const norm = normalize(t.title || '');
      const key = norm || t.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    let duplicatesTotal = 0;
    const items: RemoteTestDiagnosticItem[] = allTests.map(t => {
      const norm = normalize(t.title || '');
      const group = groups.get(norm || t.id) || [];
      const isDup = group.length > 1;
      return {
        id: t.id,
        title: t.title || 'بدون عنوان',
        unit_id: t.unit_id,
        scope: t.scope,
        difficulty: t.difficulty,
        is_published: t.is_published,
        created_at: t.created_at,
        sectionsCount: secCountByTest.get(t.id) || 0,
        questionsCount: qCountByTest.get(t.id) || 0,
        isDuplicate: isDup,
        groupKey: norm || t.id
      };
    });

    for (const [, grp] of groups) {
      if (grp.length > 1) {
        duplicatesTotal += (grp.length - 1);
      }
    }

    return {
      success: true,
      tests: items,
      duplicatesCount: duplicatesTotal
    };
  } catch (err: any) {
    return {
      success: false,
      tests: [],
      duplicatesCount: 0,
      message: err.message || 'حدث خطأ أثناء فحص الاختبارات السحابية'
    };
  }
}

/**
 * تنظيف شامل لكافة السجلات المكررة في جدول NewTests
 * تبحث عن الاختبارات ذات العناوين المتطابقة نصياً أو معيارياً، تبقي على السجل الأحدث،
 * وتحذف النسخ الزائدة مع ملحقاتها من NewTestSections و NewTestQuestions بأمان متتابع.
 */
export async function cleanupAllDuplicateTests(): Promise<{
  success: boolean;
  purgedCount: number;
  details: string[];
  message: string;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, purgedCount: 0, details: [], message: 'عميل Supabase غير مهيأ' };
  }

  try {
    const { data: allTests, error } = await supabase
      .from('NewTests')
      .select('id, title, unit_id, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!allTests || allTests.length === 0) {
      return { success: true, purgedCount: 0, details: [], message: 'لا توجد اختبارات مسجلة في NewTests.' };
    }

    // تجميع حسب العنوان المعياري الذكي (مع إزالة التشكيل وتوحيد الألف والتاء المربوطة)
    const normalize = (s: string) =>
      s.trim()
       .toLowerCase()
       .replace(/[أإآ]/g, 'ا')
       .replace(/ة/g, 'ه')
       .replace(/[-:ـ_\s]+/g, ' ')
       .trim();

    const groups = new Map<string, typeof allTests>();
    for (const t of allTests) {
      const key = normalize(t.title || '');
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(t);
    }

    const details: string[] = [];
    let totalPurged = 0;

    for (const [titleKey, testsInGroup] of groups.entries()) {
      if (testsInGroup.length > 1) {
        // نُبقي السجل الأحدث (testsInGroup[0])
        const keepTest = testsInGroup[0];
        const duplicates = testsInGroup.slice(1);

        for (const dup of duplicates) {
          const res = await deleteRemoteTestCompletely(dup.id);
          if (res.success) {
            totalPurged++;
          } else {
            console.error(`فشل حذف السجل المكرر ${dup.id}:`, res.message);
            details.push(`⚠️ تعذر حذف السجل ${dup.id.slice(0, 8)}: ${res.message}`);
          }
        }

        // تحديث أي تعيين محلي (Sync Mapping) كان يشير إلى أحد السجلات المحذوفة ليرتبط بالسجل المعتمد المتبقي
        try {
          const localTests = await db.tests.toArray();
          for (const lt of localTests) {
            if (!lt.id) continue;
            const normLocal = normalize(lt.testData?.title || lt.title || '');
            if (normLocal === titleKey) {
              const currentHash = computeTestHash(lt);
              await saveSyncMapping('tests', lt.id, keepTest.id, currentHash, true);
            }
          }
        } catch (mapErr) {
          console.warn('تحديث التعيين المحلي بعد التنظيف:', mapErr);
        }

        details.push(`"${keepTest.title}": تم حذف ${duplicates.length} نسخة مكررة والإبقاء على النسخة الأحدث (${keepTest.id.slice(0, 8)}...)`);
      }
    }

    if (totalPurged === 0) {
      return {
        success: true,
        purgedCount: 0,
        details: [],
        message: 'قاعدة البيانات نظيفة تماماً، ولا توجد أي اختبارات مكررة في NewTests!'
      };
    }

    return {
      success: true,
      purgedCount: totalPurged,
      details,
      message: `تم بنجاح تنظيف ${totalPurged} سجل مكرر من جدول NewTests وملحقاتها من NewTestSections و NewTestQuestions!`
    };
  } catch (err: any) {
    return {
      success: false,
      purgedCount: 0,
      details: [],
      message: err.message || 'فشل تنظيف السجلات المكررة'
    };
  }
}

export const syncSingleTest = syncComprehensiveTest;

export async function syncSingleQuestionBank(qbId: number, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const qb = await db.questionBanks.get(qbId);
    if (!qb) throw new Error(`بنك الأسئلة ${qbId} غير موجود محلياً`);

    const isPublished = !isDraft;
    const qbHash = computeContentHash(qb);
    let mapping = await getMappingIfExists('NewQuestionBanks', String(qbId));

    const { unitId } = await resolveTaxonomyHierarchy({
      country: qb.country,
      grade: qb.grade,
      subject: qb.subject,
      unit: qb.unit,
      part: qb.part,
    });

    if (!mapping && unitId) {
      // المفتاح الطبيعي: unit_id (بنك واحد لكل وحدة)
      const { data: existingBanks, error: chkErr } = await supabase
        .from('NewQuestionBanks')
        .select('id, title, created_at, unit_id')
        .eq('unit_id', unitId);

      if (chkErr) throw new Error(`تعذّر فحص التكرار لبنك الأسئلة: ${chkErr.message}`);

      if (existingBanks && existingBanks.length > 1) {
        throw new Error(
          `يوجد ${existingBanks.length} بنوك أسئلة لهذه الوحدة في السحابة. نظّفها أولاً ثم أعد المزامنة.`
        );
      }

      if (existingBanks && existingBanks.length === 1) {
        const confirmed = await confirmDialog(
          `يوجد في السحابة بنك أسئلة لهذه الوحدة بعنوان "${existingBanks[0].title}" ` +
          `(أُنشئ ${new Date(existingBanks[0].created_at).toLocaleString('ar')}).\n` +
          `هل تريد ربط هذه النسخة المحلية به وتحديثه بدل إنشاء نسخة جديدة؟`
        );
        if (!confirmed) throw new Error('أُلغيت المزامنة لتفادي التكرار');
        await upsertSyncMapping('NewQuestionBanks', String(qbId), existingBanks[0].id);
        mapping = await getMappingIfExists('NewQuestionBanks', String(qbId));
      }
    }

    const payload: any = {
      unit_id: unitId,
      title: qb.title,
      summary_text: qb.topic || '',
      is_published: false,
    };

    let remoteId = mapping?.remoteId;
    if (remoteId) {
      payload.id = remoteId;
      const { data, error } = await supabase.from('NewQuestionBanks').upsert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    } else {
      const { data, error } = await supabase.from('NewQuestionBanks').insert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    // Sync question items into NewQuestionBankItems if present
    let itemsCount = 0;
    if (qb.items && qb.items.length > 0) {
      const mcqItems = qb.items.filter((item: any) => item.type !== 'essay');
      if (mcqItems.length > 0) {
        const itemPayloads = mcqItems.map((item: any, idx: number) => {
          const sourceKey = item.id || `mcq_${idx + 1}`;
          const cleanedOpts = (item.subParts || []).map((s: string) => 
            s.replace(/^[\s(]*[أبجدهئطك]\s*[\-)\.]\s*/, '').trim()
          );
          const solutionText = (item.solution && item.solution.trim()) ? item.solution.trim() : '—';
          const topicText = (item.topic && item.topic.trim()) ? item.topic.trim() : (qb.topic || 'عام');
          const diff = Math.max(1, Math.min(4, Number(item.difficulty) || 2));

          return {
            bank_id: remoteId,
            source_key: sourceKey,
            item_type: 'mcq',
            topic: topicText,
            difficulty: diff,
            question: item.question || '',
            sub_parts: cleanedOpts,
            correct_index: 0,
            solution: solutionText,
            ai_guidance: item.aiGuidance || null,
            svg_code: item.svgCode || null,
            order_index: item.order || (idx + 1)
          };
        });

        const { data: upsertData, error: itemsErr, status: upsertStatus } = await (supabase as any)
          .from('NewQuestionBankItems')
          .upsert(itemPayloads, { onConflict: 'bank_id,source_key' })
          .select();

        if (itemsErr) {
          throw new Error(`فشلت مزامنة أسئلة البنك في NewQuestionBankItems (رمز HTTP ${upsertStatus}): ${itemsErr.message}`);
        }

        const returnedCount = Array.isArray(upsertData) ? upsertData.length : 0;
        if (returnedCount !== itemPayloads.length) {
          throw new Error(`عدد الأسئلة المُعادة من السحابة (${returnedCount}) لا يطابق عدد الأسئلة المُرسلة (${itemPayloads.length})`);
        }
        itemsCount = returnedCount;
      }
    }

    // Rule 6: Set is_published = true only after successfully writing questions
    if (isPublished) {
      await supabase
        .from('NewQuestionBanks')
        .update({ is_published: true, updated_at: new Date().toISOString() })
        .eq('id', remoteId);
    }

    await upsertSyncMapping('NewQuestionBanks', String(qbId), remoteId!, qbHash, isPublished);
    return { 
      success: true, 
      message: `تمت مزامنة بنك الأسئلة "${qb.title}" بنجاح (${itemsCount} سؤالاً مسجلاً في NewQuestionBankItems)!` 
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة بنك الأسئلة' };
  }
}

export async function syncSingleExamSummary(summaryId: number, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const sum = await db.examSummaries.get(summaryId);
    if (!sum) throw new Error(`الملخص ${summaryId} غير موجود محلياً`);

    const isPublished = !isDraft;
    const sumHash = computeContentHash(sum);
    let mapping = await getMappingIfExists('NewExamSummaries', String(summaryId));

    const { subjectId } = await resolveTaxonomyHierarchy({
      country: sum.country,
      grade: sum.grade,
      subject: sum.subject,
      unit: sum.unit,
      part: sum.part,
    });

    if (!mapping && subjectId) {
      // المفتاح الطبيعي: subject_id + العنوان بعد التطبيع
      const { data: remoteSummaries, error: chkErr } = await supabase
        .from('NewExamSummaries')
        .select('id, title, created_at')
        .eq('subject_id', subjectId);

      if (chkErr) throw new Error(`تعذّر فحص التكرار للملخص الامتحاني: ${chkErr.message}`);

      const targetTitle = normalizeTitle(sum.title);
      const matches = (remoteSummaries || []).filter(s => normalizeTitle(s.title || '') === targetTitle);

      if (matches.length > 1) {
        throw new Error(
          `يوجد ${matches.length} ملخصات مكررة بعنوان "${sum.title}" في السحابة. نظّفها أولاً ثم أعد المزامنة.`
        );
      }

      if (matches.length === 1) {
        // لا تتصرف بصمت: اطلب تأكيداً صريحاً من المستخدم
        const confirmed = await confirmDialog(
          `يوجد في السحابة ملخص امتحاني بنفس العنوان "${sum.title}" ` +
          `(أُنشئ ${new Date(matches[0].created_at).toLocaleString('ar')}).\n` +
          `هل تريد ربط هذه النسخة المحلية به وتحديثه بدل إنشاء نسخة جديدة؟`
        );
        if (!confirmed) throw new Error('أُلغيت المزامنة لتفادي التكرار');
        await upsertSyncMapping('NewExamSummaries', String(summaryId), matches[0].id);
        mapping = await getMappingIfExists('NewExamSummaries', String(summaryId));
      }
    }

    const payload: any = {
      subject_id: subjectId,
      title: sum.title,
      summary_text: sum.summaryText || '',
      is_published: isPublished,
    };

    let remoteId = mapping?.remoteId;
    if (remoteId) {
      payload.id = remoteId;
      const { data, error } = await supabase.from('NewExamSummaries').upsert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    } else {
      const { data, error } = await supabase.from('NewExamSummaries').insert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    await upsertSyncMapping('NewExamSummaries', String(summaryId), remoteId!, sumHash, isPublished);
    return { success: true, message: `تم اعتماد ونشر الملخص الامتحاني "${sum.title}" بنجاح!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة الملخص' };
  }
}

export async function syncSinglePastPaper(paperId: number | string, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const numId = Number(paperId);
    const paper = await db.pastPapers.get(numId);
    if (!paper) throw new Error(`دورة الامتحان ${paperId} غير موجودة محلياً`);

    // التحقق الصارم قبل الإرسال
    if (paper.questions && paper.questions.length > 0) {
      for (const q of paper.questions) {
        if (!q.solution?.trim()) throw new Error(`"${q.orderTitle || 'السؤال'}" بلا حل — لا يمكن نشره`);
        if (!['essay', 'mcq'].includes(q.type)) throw new Error(`نوع سؤال غير معروف: ${q.type}`);
      }
    }

    const isPublished = !isDraft;
    const paperHash = computeContentHash(paper);
    let mapping = await getMappingIfExists('NewPastPapers', String(numId));

    // 1. استنتاج subject_id بالاسم
    const subjectId = await resolveSubjectRemoteIdByName(
      paper.subject || 'الرياضيات',
      paper.grade,
      paper.country
    );

    const examYearStr = String(paper.year || new Date().getFullYear());

    if (!mapping && subjectId) {
      // المفتاح الطبيعي: subject_id + exam_year + العنوان بعد التطبيع
      const { data: remotePapers, error: chkErr } = await supabase
        .from('NewPastPapers')
        .select('id, title, exam_year, created_at')
        .eq('subject_id', subjectId)
        .eq('exam_year', examYearStr);

      if (chkErr) throw new Error(`تعذّر فحص التكرار لدورة الامتحان: ${chkErr.message}`);

      const targetTitle = normalizeTitle(paper.title);
      const matches = (remotePapers || []).filter(p => normalizeTitle(p.title || '') === targetTitle);

      if (matches.length > 1) {
        throw new Error(
          `يوجد ${matches.length} دورات امتحانية مكررة لعام ${examYearStr} بعنوان "${paper.title}" في السحابة. نظّفها أولاً ثم أعد المزامنة.`
        );
      }

      if (matches.length === 1) {
        // لا تتصرف بصمت: اطلب تأكيداً صريحاً من المستخدم
        const confirmed = await confirmDialog(
          `توجد في السحابة دورة امتحانية لعام ${examYearStr} بنفس العنوان "${paper.title}" ` +
          `(أُنشئت ${new Date(matches[0].created_at).toLocaleString('ar')}).\n` +
          `هل تريد ربط هذه النسخة المحلية بها وتحديثها بدل إنشاء نسخة جديدة؟`
        );
        if (!confirmed) throw new Error('أُلغيت المزامنة لتفادي التكرار');
        await upsertSyncMapping('NewPastPapers', String(numId), matches[0].id);
        mapping = await getMappingIfExists('NewPastPapers', String(numId));
      }
    }

    // 2. أدرج/حدّث NewPastPapers: title, subject_id, exam_year (من year), is_published
    const payload: any = {
      subject_id: subjectId,
      title: paper.title,
      exam_year: examYearStr,
      is_published: isPublished,
    };

    let remoteId = mapping?.remoteId;
    if (remoteId) {
      payload.id = remoteId;
      const { data, error } = await supabase.from('NewPastPapers').upsert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    } else {
      const { data, error } = await supabase.from('NewPastPapers').insert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    // 3. لكل عنصر في questions[]، بترتيب الظهور في المصفوفة (index + 1 = order_index)
    if (paper.questions && paper.questions.length > 0) {
      for (let index = 0; index < paper.questions.length; index++) {
        const q = paper.questions[index];
        const qPayload: any = {
          paper_id: remoteId,
          order_index: index + 1,
          order_title: q.orderTitle,
          section_type: deriveSectionType(q.orderTitle),
          topic: q.topic || null,
          item_type: q.type,
          question: q.question,
          sub_parts: (q.subParts && q.subParts.length > 0) ? q.subParts : null,
          solution: q.solution,
          svg_code: null,
          solution_svg_code: null,
        };

        const { error: upsertErr } = await supabase
          .from('NewPastPaperQuestions')
          .upsert(qPayload, { onConflict: 'paper_id, order_index' });

        if (upsertErr) {
          const { error: insertErr } = await supabase
            .from('NewPastPaperQuestions')
            .insert(qPayload);
          if (insertErr) throw insertErr;
        }
      }

      // حذف أي أسئلة فائضة في السحابة
      try {
        const maxOrder = paper.questions.length;
        await supabase
          .from('NewPastPaperQuestions')
          .delete()
          .eq('paper_id', remoteId)
          .gt('order_index', maxOrder);
      } catch (delErr) {
        console.warn('Could not delete excess past paper questions:', delErr);
      }
    }

    await upsertSyncMapping('NewPastPapers', String(numId), remoteId!, paperHash, isPublished);
    return { 
      success: true, 
      message: `تم اعتماد ونشر دورة الامتحان "${paper.title}" بنجاح في Supabase (${paper.questions?.length || 0} أسئلة)!`,
      details: { remoteId }
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة الدورة الامتحانية' };
  }
}

export async function syncSingleUnitQuiz(quizId: number, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const q = await db.unitQuizzes.get(quizId);
    if (!q) throw new Error(`اختبار الوحدة ${quizId} غير موجود محلياً`);

    const isPublished = !isDraft;
    const qHash = computeContentHash(q);
    const mapping = await getMappingIfExists('NewUnitQuizzes', String(quizId));

    let remoteDocId: string | null = null;
    if (q.docId) {
      const docMapping = await getMappingIfExists('NewDocuments', String(q.docId));
      remoteDocId = docMapping?.remoteId || null;
    }

    const { unitId } = await resolveTaxonomyHierarchy({
      country: 'سوريا',
      grade: q.grade,
      subject: q.subject,
      unit: q.unit,
    });

    const payload: any = {
      document_id: remoteDocId,
      unit_id: unitId,
      title: q.title,
      total_questions: q.totalQuestions || q.questions?.length || 0,
      passing_score: q.passingScore || null,
      validation_score: q.validationScore || null,
      is_published: isPublished,
      is_reviewed: true,
    };

    let remoteId = mapping?.remoteId;
    if (remoteId) {
      payload.id = remoteId;
      const { data, error } = await supabase.from('NewUnitQuizzes').upsert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    } else {
      const { data, error } = await supabase.from('NewUnitQuizzes').insert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    // Sync Quiz Questions
    if (q.questions && q.questions.length > 0) {
      await supabase.from('NewUnitQuizQuestions').delete().eq('quiz_id', remoteId);
      for (let i = 0; i < q.questions.length; i++) {
        const item = q.questions[i] as any;
        const qItemPayload: any = {
          quiz_id: remoteId,
          question_number: item.questionNumber || i + 1,
          question_text: item.questionText || item.question || '',
          options: item.options || [],
          correct_option_id: String(item.correctOptionId ?? item.correctAnswer ?? 0),
          explanation: item.explanation || item.detailedSolution || null,
          hint: item.hint || null,
          topic: item.topic || null,
          difficulty: item.difficulty || 'medium',
          validation_score: item.validationScore || null,
        };
        await supabase.from('NewUnitQuizQuestions').insert(qItemPayload);
      }
    }

    await upsertSyncMapping('NewUnitQuizzes', String(quizId), remoteId!, qHash, isPublished);
    return { success: true, message: `تم اعتماد ونشر اختبار الوحدة "${q.title}" بنجاح!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة اختبار الوحدة' };
  }
}

export async function syncSingleUnitMindMap(mindMapId: number, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const m = await db.unitMindMaps.get(mindMapId);
    if (!m) throw new Error(`الخريطة الذهنية ${mindMapId} غير موجودة محلياً`);

    const isPublished = !isDraft;
    const mHash = computeContentHash(m);
    const mapping = await getMappingIfExists('NewUnitMindMaps', String(mindMapId));

    let remoteDocId: string | null = null;
    let unitId: string | null = null;

    if (m.docId) {
      const docMapping = await getMappingIfExists('NewDocuments', String(m.docId));
      remoteDocId = docMapping?.remoteId || null;
      const doc = await db.documents.get(m.docId);
      if (doc) {
        const tax = await resolveTaxonomyHierarchy({
          country: doc.country,
          grade: doc.grade,
          subject: doc.subject,
          unit: doc.unit,
          part: doc.part,
        });
        unitId = tax.unitId;
      }
    }

    const payload: any = {
      document_id: remoteDocId,
      unit_id: unitId,
      title: m.title,
      svg_code: m.svgCode || '',
      markdown_schema: m.markdownSchema || null,
      tree_data: m.treeData || null,
      is_published: isPublished,
    };

    let remoteId = mapping?.remoteId;
    if (remoteId) {
      payload.id = remoteId;
      const { data, error } = await supabase.from('NewUnitMindMaps').upsert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    } else {
      // UNIQUE موجود على unit_id: استخدم upsert مع onConflict: 'unit_id'
      const { data, error } = await supabase.from('NewUnitMindMaps').upsert(payload, { onConflict: 'unit_id' }).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    await upsertSyncMapping('NewUnitMindMaps', String(mindMapId), remoteId!, mHash, isPublished);
    return { success: true, message: `تم اعتماد ونشر الخريطة الذهنية "${m.title}" بنجاح!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة الخريطة الذهنية' };
  }
}

export async function syncSingleUnitComprehensiveReview(reviewId: number, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const r = await db.unitComprehensiveReviews.get(reviewId);
    if (!r) throw new Error(`المراجعة الشاملة ${reviewId} غير موجودة محلياً`);

    const isPublished = !isDraft;
    const rHash = computeContentHash(r);
    const mapping = await getMappingIfExists('NewUnitComprehensiveReviews', String(reviewId));

    let remoteDocId: string | null = null;
    let unitId: string | null = null;

    if (r.docId) {
      const docMapping = await getMappingIfExists('NewDocuments', String(r.docId));
      remoteDocId = docMapping?.remoteId || null;
      const doc = await db.documents.get(r.docId);
      if (doc) {
        const tax = await resolveTaxonomyHierarchy({
          country: doc.country,
          grade: doc.grade,
          subject: doc.subject,
          unit: doc.unit,
          part: doc.part,
        });
        unitId = tax.unitId;
      }
    } else {
      const tax = await resolveTaxonomyHierarchy({
        country: 'سوريا',
        grade: r.grade,
        subject: r.subject,
        unit: r.unit,
      });
      unitId = tax.unitId;
    }

    const payload: any = {
      document_id: remoteDocId,
      unit_id: unitId,
      title: r.title,
      summary_text: r.summaryText || '',
      definitions: r.definitions || [],
      theorems: r.theorems || [],
      results: r.results || [],
      traps_and_tips: r.trapsAndTips || [],
      formulas_summary: r.formulasSummary || null,
      is_published: isPublished,
    };

    let remoteId = mapping?.remoteId;
    if (remoteId) {
      payload.id = remoteId;
      const { data, error } = await supabase.from('NewUnitComprehensiveReviews').upsert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    } else {
      // UNIQUE موجود على unit_id: استخدم upsert مع onConflict: 'unit_id'
      const { data, error } = await supabase.from('NewUnitComprehensiveReviews').upsert(payload, { onConflict: 'unit_id' }).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    await upsertSyncMapping('NewUnitComprehensiveReviews', String(reviewId), remoteId!, rHash, isPublished);
    return { success: true, message: `تم اعتماد ونشر المراجعة الشاملة "${r.title}" بنجاح!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة المراجعة الشاملة' };
  }
}

// -------------------------------------------------------------
// 6. Trigger Batch Sync for All Stored Content
// -------------------------------------------------------------

export async function syncAllLocalContent(
  onProgress?: (step: string, percent: number, isError?: boolean) => void
): Promise<{ success: boolean; message: string; summary: Record<string, number> }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      message: 'بيانات اتصال Supabase غير مهيأة',
      summary: {},
    };
  }

  const summary = {
    documents: 0,
    tests: 0,
    questionBanks: 0,
    examSummaries: 0,
    pastPapers: 0,
  };

  try {
    const docs = await db.documents.toArray();
    const tests = await db.tests.toArray();
    const sums = await db.examSummaries.toArray();
    const papers = await db.pastPapers.toArray();

    const totalItems = docs.length + tests.length + sums.length + papers.length;
    let processed = 0;

    // 1. Documents
    for (const doc of docs) {
      if (!doc.id) continue;
      onProgress?.(`مزامنة الوحدة: "${doc.title}"...`, Math.round((processed / totalItems) * 100));
      const res = await syncDocumentHierarchy(doc.id, false);
      if (!res.success) throw new Error(res.message);
      summary.documents++;
      processed++;
    }

    // 2. Tests
    for (const t of tests) {
      if (!t.id) continue;
      onProgress?.(`مزامنة الاختبار: "${t.title}"...`, Math.round((processed / totalItems) * 100));
      const res = await syncSingleTest(t.id, false);
      if (!res.success) throw new Error(res.message);
      summary.tests++;
      processed++;
    }

    // 3. Exam Summaries
    for (const sum of sums) {
      if (!sum.id) continue;
      onProgress?.(`مزامنة الملخص: "${sum.title}"...`, Math.round((processed / totalItems) * 100));
      const res = await syncSingleExamSummary(sum.id, false);
      if (!res.success) throw new Error(res.message);
      summary.examSummaries++;
      processed++;
    }

    // 4. Past Papers
    for (const p of papers) {
      if (!p.id) continue;
      onProgress?.(`مزامنة الدورة: "${p.title}"...`, Math.round((processed / totalItems) * 100));
      const res = await syncSinglePastPaper(p.id, false);
      if (!res.success) throw new Error(res.message);
      summary.pastPapers++;
      processed++;
    }

    onProgress?.('تمت مزامنة واعتماد كافة المحتويات بنجاح! ✨', 100);
    return {
      success: true,
      message: 'تمت مزامنة واعتماد جميع المناهج والاختبارات بنجاح إلى Supabase!',
      summary,
    };
  } catch (err: any) {
    onProgress?.(`فشلت المزامنة الشاملة: ${err.message}`, 100, true);
    return {
      success: false,
      message: err.message || 'حدث خطأ أثناء المزامنة الشاملة',
      summary,
    };
  }
}

/**
 * 🔒 Atomic Sync Function: Syncs an entire Exercise Family including its lead/non-lead exercises and stations.
 * This resolves the circular dependency between NewExerciseFamilies and NewLessonSectionExercises.
 */
export async function syncExerciseFamily(
  family: ClassifiedFamilyData,
  documentRemoteId: string,
  unitRemoteId: string,
  publish: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'خدمة المزامنة السحابية غير متوفرة حالياً. تأكد من تفعيل Supabase.' };
  }

  try {
    // === GUARD: Strict Validation & Pre-resolution Before Any Network Requests ===
    for (const exercise of family.exercises) {
      if (!exercise.sectionId) {
        const sections = await db.lessonSections.where('docId').equals(family.docId).toArray();
        for (const s of sections) {
          if (s.practiceExercises?.some(pe => pe.id === exercise.id)) {
            exercise.sectionId = s.id;
            break;
          }
        }
      }
      if (!exercise.kind) {
        exercise.kind = 'practice';
      }
    }

    const validationErrors: string[] = [];
    for (const exercise of family.exercises) {
      if (!exercise.kind || !['practice', 'practical'].includes(exercise.kind)) {
        validationErrors.push(`تمرين "${exercise.title}": نوع التمرين (kind) غير صالح أو غير محدد (${exercise.kind || 'فارغ'}).`);
      }
      if (!exercise.sectionId) {
        validationErrors.push(`تمرين "${exercise.title}": غير مرتبط بالقسم الأب (sectionId مفقود).`);
      }
      if (!exercise.isLeadExercise && (!exercise.stations || exercise.stations.length !== 4)) {
        const stCount = exercise.stations ? exercise.stations.length : 0;
        validationErrors.push(`تمرين "${exercise.title}": تمرين غير قائد ولكنه يملك ${stCount} محطة (المطلوب 4 محطات مكتملة).`);
      }
      if (!exercise.solutionText || exercise.solutionText.trim() === '') {
        validationErrors.push(`تمرين "${exercise.title}": بلا نص حل — لا يمكن نشره للطلاب.`);
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(`تعذر المزامنة لوجود أخطاء في البيانات:\n• ` + validationErrors.join('\n• '));
    }

    const exerciseRemoteIds = new Map<string, string>();
    let leadExerciseRemoteId: string | null = null;

    // === STEP 1: Check sync mapping for each exercise & insert/update without family linkage ===
    // Do NOT include family_id, is_lead_exercise, primary_concept, secondary_concepts in this step.
    for (const exercise of family.exercises) {
      const existingMapping = await getMappingIfExists('practiceExercises', exercise.id);
      
      let remoteSectionId: string | null = null;
      if (exercise.sectionId) {
        const sectionMapping = await getMappingIfExists('lessonSections', exercise.sectionId);
        remoteSectionId = sectionMapping?.remoteId || String(exercise.sectionId);
      }

      const exercisePayload = {
        section_id: remoteSectionId,
        kind: exercise.kind,
        title: exercise.title,
        question_text: exercise.questionText,
        solution_text: exercise.solutionText || 'الحل قيد الإعداد...', 
        strategy_text: exercise.strategyText || null,
        svg_code: exercise.svgCode || null,
        order_index: exercise.orderIndex || 0,
      };

      const exerciseRemoteId = existingMapping?.remoteId
        ? await updateRow('NewLessonSectionExercises', existingMapping.remoteId, exercisePayload)
        : await insertRow('NewLessonSectionExercises', exercisePayload);

      await upsertSyncMapping('practiceExercises', exercise.id, exerciseRemoteId, computeContentHash(exercisePayload), publish);
      exerciseRemoteIds.set(exercise.id, exerciseRemoteId);

      if (exercise.isLeadExercise || exercise.id === family.leadExerciseId) {
        leadExerciseRemoteId = exerciseRemoteId;
      }
    }

    if (!leadExerciseRemoteId) {
      throw new Error(`لم يتم العثور على تمرين قائد (Lead Exercise) للعائلة.`);
    }

    // === STEP 2: Upsert Exercise Family (NewExerciseFamilies) ===
    const familyPayload = {
      document_id: documentRemoteId,
      unit_id: unitRemoteId,
      family_name: family.familyName,
      target_concepts: family.targetConcepts,
      lead_exercise_id: leadExerciseRemoteId,
      has_manual_edits: !!family.hasManualEdits,
      is_published: publish
    };

    const familyLocalId = String(family.id);
    const existingFamilyMapping = await getMappingIfExists('exerciseFamilies', familyLocalId);

    const familyRemoteId = existingFamilyMapping?.remoteId
      ? await updateRow('NewExerciseFamilies', existingFamilyMapping.remoteId, familyPayload)
      : await insertRow('NewExerciseFamilies', familyPayload);

    await upsertSyncMapping('exerciseFamilies', familyLocalId, familyRemoteId, computeContentHash(familyPayload), publish);

    // === STEP 3: Update each exercise with family_id and classification metadata (UPDATE only) ===
    for (const exercise of family.exercises) {
      const exerciseRemoteId = exerciseRemoteIds.get(exercise.id);
      if (!exerciseRemoteId) continue;

      const familyUpdatePayload = {
        family_id: familyRemoteId,
        is_lead_exercise: exercise.isLeadExercise || exercise.id === family.leadExerciseId,
        primary_concept: exercise.primaryConcept || null,
        secondary_concepts: exercise.secondaryConcepts || null
      };

      await updateRow('NewLessonSectionExercises', exerciseRemoteId, familyUpdatePayload);
    }

    // === STEP 4: Upsert guided solution stations (ONLY for non-lead exercises) ===
    const failedStations: string[] = [];

    for (const exercise of family.exercises.filter(e => !e.isLeadExercise && e.id !== family.leadExerciseId)) {
      const exerciseRemoteId = exerciseRemoteIds.get(exercise.id);
      if (!exerciseRemoteId) continue;

      for (const station of exercise.stations || []) {
        const stationPayload = {
          exercise_id: exerciseRemoteId,
          station_order: station.stationOrder,
          title: station.title,
          question_text: station.questionText,
          choices: station.choices,
          correct_choice_index: station.correctChoiceIndex,
          hint_text: station.hintText || null,
          hint_level1: station.hintLevel1 || null,
          hint_level2: station.hintLevel2 || null,
          skip_explanation: station.skipExplanation || null,
          concept_map: station.conceptMap || null
        };

        const { error } = await supabase
          .from('NewExerciseStations')
          .upsert(stationPayload, { onConflict: 'exercise_id,station_order' });

        if (error) {
          failedStations.push(exercise.title);
          console.error(`Station sync failed for exercise ${exercise.title}, station ${station.stationOrder}:`, error);
        }
      }
    }

    if (failedStations.length > 0) {
      const uniqueFails = Array.from(new Set(failedStations)).join('، ');
      return {
        success: true,
        error: `تمت مزامنة العائلة، لكن فشلت محطات تمرين واحد أو أكثر: [${uniqueFails}]`
      };
    }

    return { success: true };

  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 🔒 Syncs a single exercise family from UI (via SyncControlButton)
 */
export async function syncSingleExerciseFamily(familyId: number | string, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const numId = Number(familyId);
    
    // 1. Fetch raw family to get docId
    const rawFamily = await db.exerciseFamilies.get(numId);
    if (!rawFamily) throw new Error(`عائلة التمارين ${familyId} غير موجودة محلياً`);

    const docId = rawFamily.docId;
    const doc = await db.documents.get(docId);
    if (!doc) throw new Error(`الوثيقة المرتبطة بالعائلة ${docId} غير موجودة`);

    // 2. Fetch full family data (with exercises and stations)
    const { loadUnitExerciseFamilies } = await import('../db/exerciseFamiliesRPC');
    const allFamilies = await loadUnitExerciseFamilies(docId);
    const fullFamily = allFamilies.find(f => f.id === numId || f.id === familyId);
    
    if (!fullFamily) {
      throw new Error('لم يتم العثور على بيانات العائلة المفصلة');
    }

    // 3. Resolve parent mappings
    const docMapping = await getSyncMapping('documents', docId);
    if (!docMapping?.remoteId) {
      throw new Error('يجب مزامنة وثيقة الكراسة (Lesson/Booklet) أولاً قبل مزامنة العائلات.');
    }

    const { unitId } = await resolveTaxonomyHierarchy({
      country: doc.country,
      grade: doc.grade,
      subject: doc.subject,
      unit: doc.unit,
      part: doc.part,
    });

    if (!unitId) {
      throw new Error('فشل تحديد الوحدة الدراسية سحابياً');
    }

    const isPublished = !isDraft;

    // 4. Delegate to atomic sync function
    const result = await syncExerciseFamily(fullFamily, docMapping.remoteId, unitId, isPublished);

    if (!result.success) {
      return { success: false, message: result.error || 'خطأ غير معروف في مزامنة العائلة' };
    }

    return { 
      success: true, 
      message: result.error ? result.error : 'تمت مزامنة عائلة التمارين وحلولها ومحطاتها بنجاح!' 
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
