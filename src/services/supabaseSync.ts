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

export const getMappingIfExists = getSyncMapping;
export const upsertSyncMapping = saveSyncMapping;

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
 * Calculates Content Hash for a comprehensive test:
 * title, difficulty, topic_label (or scope), and full testData (including sections, questions, solutions).
 * Any modification to even a single solution or question text will produce a different hash.
 */
export function computeTestHash(test: any): string {
  if (!test) return '';
  const payloadToHash = {
    title: test.testData?.title || test.title || '',
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

  // 2. اختبار شامل لجميع الوحدات (مثل: الجزء شامل - الوحدة شامل الواحدات)
  if (isSubjectComprehensiveTest(test)) {
    return 'subject_comprehensive';
  }

  // 3. اختبار وحدة دراسية تخصصية مفردة (فقط إن لم تكن كلمة شمولية)
  if (test.unit && test.unit.trim() !== '' && !isComprehensiveUnitKeyword(test.unit)) {
    return 'unit';
  }

  // 4. إذا كان الجزء محدداً بدون وحدة
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

    // ---------------------------------------------------------
    // الخطوة 1: مزامنة NewDocuments
    // ---------------------------------------------------------
    onProgress?.('مزامنة بيانات الوثيقة والوحدة (NewDocuments)...', 12);
    const docHash = computeContentHash(doc);
    const docMapping = await getSyncMapping('documents', docId);

    const docType = doc.type || 'lesson';
    // قيد مهم: لا تُطبّق هذا المنطق على وثائق doc_type = 'exercise'
    const lessonRemoteId = (docType !== 'exercise' && unitId && doc.topic && doc.topic.trim())
      ? await resolveOrCreateLessonRemoteId(unitId, doc.topic.trim())
      : null;

    const docPayload: any = {
      title: doc.title,
      doc_type: docType,
      unit_id: unitId,
      lesson_id: lessonRemoteId,
      families_analysis: doc.familiesAnalysis || null,
      series_name: doc.seriesName || null,
      teacher_name: doc.teacherName || null,
      teacher_role: doc.teacherRole || null,
      is_published: isPublished,
      updated_at: new Date(doc.updatedAt || Date.now()).toISOString(),
    };

    let remoteDocId = docMapping?.remoteId;

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
    }

    await saveSyncMapping('documents', docId, remoteDocId!, docHash, isPublished);

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
    // الخطوة 3: مزامنة NewLessonSections
    // ---------------------------------------------------------
    onProgress?.('مزامنة الدروس والفقرات النظرية (NewLessonSections)...', 40);
    const rawSections = await db.lessonSections.where('docId').equals(docId).toArray();
    const sortedSections = [...rawSections].sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 0;
      const orderB = typeof b.order === 'number' ? b.order : 0;
      if (orderA !== orderB) return orderA - orderB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    // ترقيم الفقرات محلياً بشكل متسلسل يبدأ من 1 لتفادي تكرار order = 0
    for (let idx = 0; idx < sortedSections.length; idx++) {
      const sec = sortedSections[idx];
      const normalizedOrder = idx + 1;
      if (sec.order !== normalizedOrder && sec.id) {
        await db.lessonSections.update(sec.id, { order: normalizedOrder });
        sec.order = normalizedOrder;
      }
    }

    // جلب الفقرات الموجودة مسبقاً في السحابة لهذا المستند للربط وتفادي تصادم order_index
    const { data: remoteExistingSections } = await supabase
      .from('NewLessonSections')
      .select('id, title, order_index')
      .eq('document_id', remoteDocId);

    const remoteIdSet = new Set((remoteExistingSections || []).map(r => r.id));
    const usedRemoteSecIds = new Set<string>();

    for (const sec of sortedSections) {
      if (!sec.id) continue;
      const secMapping = await getSyncMapping('lessonSections', sec.id);
      if (secMapping?.remoteId && remoteIdSet.has(secMapping.remoteId)) {
        usedRemoteSecIds.add(secMapping.remoteId);
      }
    }

    const availableRemoteSections = (remoteExistingSections || []).filter(r => !usedRemoteSecIds.has(r.id));

    // إزاحة order_index للفقرات السحابية السابقة مؤقتاً لتجنب أي تصادم في القيد الفريد أثناء التحديث
    if (remoteExistingSections && remoteExistingSections.length > 0) {
      for (let rIdx = 0; rIdx < remoteExistingSections.length; rIdx++) {
        await supabase
          .from('NewLessonSections')
          .update({ order_index: 50000 + rIdx + 1 })
          .eq('id', remoteExistingSections[rIdx].id);
      }
    }

    const sectionRemoteMap = new Map<number, string>();

    for (let idx = 0; idx < sortedSections.length; idx++) {
      const sec = sortedSections[idx];
      if (!sec.id) continue;
      const secHash = computeContentHash(sec);
      const secMapping = await getSyncMapping('lessonSections', sec.id);

      let remoteSecId: string | undefined = undefined;
      if (secMapping?.remoteId && remoteIdSet.has(secMapping.remoteId)) {
        remoteSecId = secMapping.remoteId;
      } else {
        const titleMatchIdx = availableRemoteSections.findIndex(r => r.title?.trim() === sec.title?.trim());
        if (titleMatchIdx >= 0) {
          remoteSecId = availableRemoteSections[titleMatchIdx].id;
          availableRemoteSections.splice(titleMatchIdx, 1);
        } else if (availableRemoteSections.length > 0) {
          remoteSecId = availableRemoteSections.shift()?.id;
        }
      }

      const secPayload: any = {
        document_id: remoteDocId,
        title: sec.title,
        content: sec.content,
        svg_code: sec.svgCode || null,
        analysis_rephrased_content: typeof sec.analysis === 'string' ? sec.analysis : (sec.analysis?.rephrasedContent || null),
        analysis_additions: typeof sec.analysis === 'object' ? sec.analysis : null,
        order_index: idx + 1,
        concept_label: sec.conceptLabel || null,
        illustrations_label: sec.illustrationsLabel || null,
        practice_section_label: sec.practiceSectionLabel || null,
        practical_section_label: sec.practicalSectionLabel || null,
        is_practice_only: !!sec.isPracticeOnly,
        guidance: sec.guidance || null,
        notes: sec.notes || null,
        traps: sec.traps || null,
        exam_guidance: sec.examGuidance || null,
        example_text: sec.exampleText || null,
        solution_text: sec.solutionText || null,
        extra_example_text: sec.extraExampleText || null,
        extra_solution_text: sec.extraSolutionText || null,
      };

      if (remoteSecId) {
        secPayload.id = remoteSecId;
        const { data, error } = await supabase
          .from('NewLessonSections')
          .upsert(secPayload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 3 [NewLessonSections]', error));
        remoteSecId = data.id;
      } else {
        const { data, error } = await supabase
          .from('NewLessonSections')
          .insert(secPayload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 3 [NewLessonSections]', error));
        remoteSecId = data.id;
      }

      sectionRemoteMap.set(sec.id, remoteSecId!);
      await saveSyncMapping('lessonSections', sec.id, remoteSecId!, secHash, isPublished);
    }

    // تنظيف الفقرات السحابية المحذوفة محلياً
    const syncedRemoteSecIds = new Set(Array.from(sectionRemoteMap.values()));
    const orphanSections = (remoteExistingSections || []).filter(r => !syncedRemoteSecIds.has(r.id));
    if (orphanSections.length > 0) {
      const orphanIds = orphanSections.map(r => r.id);
      try {
        await supabase.from('NewLessonSectionExercises').delete().in('section_id', orphanIds);
        await supabase.from('NewLessonSections').delete().in('id', orphanIds);
      } catch (delErr) {
        console.warn('Could not clean up orphan sections:', delErr);
      }
    }

    // ---------------------------------------------------------
    // الخطوة 4: مزامنة NewLessonSectionExercises (بدون family_id أولاً)
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

      // جلب التمارين السحابية المسبقة لهذه الفقرة لمنع تصادم الترتيب
      const { data: remoteExistingExercises } = await supabase
        .from('NewLessonSectionExercises')
        .select('id, title, order_index')
        .eq('section_id', remoteSecId);

      const remoteExIdSet = new Set((remoteExistingExercises || []).map(r => r.id));
      const usedRemoteExIds = new Set<string>();

      for (const ex of allExercisesToSync) {
        if (!ex.id) continue;
        const exMapping = await getSyncMapping('practiceExercises', ex.id);
        if (exMapping?.remoteId && remoteExIdSet.has(exMapping.remoteId)) {
          usedRemoteExIds.add(exMapping.remoteId);
        }
      }

      const availableRemoteExercises = (remoteExistingExercises || []).filter(r => !usedRemoteExIds.has(r.id));

      if (remoteExistingExercises && remoteExistingExercises.length > 0) {
        for (let rIdx = 0; rIdx < remoteExistingExercises.length; rIdx++) {
          await supabase
            .from('NewLessonSectionExercises')
            .update({ order_index: 50000 + rIdx + 1 })
            .eq('id', remoteExistingExercises[rIdx].id);
        }
      }

      const currentSecSyncedExIds = new Set<string>();

      for (let exIdx = 0; exIdx < allExercisesToSync.length; exIdx++) {
        const ex = allExercisesToSync[exIdx];
        if (!ex.id) continue;

        // حارس أمان إضافي للتحقق من قيمة kind
        if (!['practice', 'practical'].includes(ex.kind)) {
          console.error(`قيمة kind غير صالحة: ${ex.kind} للتمرين ${ex.id}`);
          throw new Error(`تعذّرت مزامنة التمرين "${ex.title}" بسبب قيمة kind غير صالحة`);
        }

        const exHash = computeContentHash(ex);
        const exMapping = await getSyncMapping('practiceExercises', ex.id);

        let remoteExId: string | undefined = undefined;
        if (exMapping?.remoteId && remoteExIdSet.has(exMapping.remoteId)) {
          remoteExId = exMapping.remoteId;
        } else {
          const matchIdx = availableRemoteExercises.findIndex(r => r.title?.trim() === ex.title?.trim());
          if (matchIdx >= 0) {
            remoteExId = availableRemoteExercises[matchIdx].id;
            availableRemoteExercises.splice(matchIdx, 1);
          } else if (availableRemoteExercises.length > 0) {
            remoteExId = availableRemoteExercises.shift()?.id;
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
          order_index: exIdx + 1,
        };

        if (remoteExId) {
          exPayload.id = remoteExId;
          const { data, error } = await supabase
            .from('NewLessonSectionExercises')
            .upsert(exPayload)
            .select('id')
            .single();
          if (error) throw new Error(formatSupabaseErrorMessage('خطوة 4 [NewLessonSectionExercises]', error));
          remoteExId = data.id;
        } else {
          const { data, error } = await supabase
            .from('NewLessonSectionExercises')
            .insert(exPayload)
            .select('id')
            .single();
          if (error) throw new Error(formatSupabaseErrorMessage('خطوة 4 [NewLessonSectionExercises]', error));
          remoteExId = data.id;
        }

        currentSecSyncedExIds.add(remoteExId!);
        exerciseRemoteMap.set(ex.id, remoteExId!);
        await saveSyncMapping('practiceExercises', ex.id, remoteExId!, exHash, isPublished);

        if (ex.family_id) {
          pendingExercisesForFamilyUpdate.push({
            localExId: ex.id,
            remoteExId: remoteExId!,
            localFamilyId: ex.family_id,
          });
        }
      }

      // تنظيف أي تمارين سحابية قديمة تم حذفها من هذه الفقرة
      const orphanExercises = (remoteExistingExercises || []).filter(r => !currentSecSyncedExIds.has(r.id));
      if (orphanExercises.length > 0) {
        const orphanExIds = orphanExercises.map(r => r.id);
        try {
          await supabase.from('NewExerciseStations').delete().in('exercise_id', orphanExIds);
          await supabase.from('NewLessonSectionExercises').delete().in('id', orphanExIds);
        } catch (delExErr) {
          console.warn('Could not clean up orphan exercises:', delExErr);
        }
      }
    }

    // ---------------------------------------------------------
    // الخطوة 5: مزامنة NewExerciseFamilies
    // ---------------------------------------------------------
    onProgress?.('مزامنة عائلات التمارين (NewExerciseFamilies)...', 68);
    const families = await db.exerciseFamilies.where('docId').equals(docId).toArray();
    const familyRemoteMap = new Map<string | number, string>();

    for (const fam of families) {
      if (!fam.id) continue;
      const famHash = computeContentHash(fam);
      const famMapping = await getSyncMapping('exerciseFamilies', fam.id);

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

      let remoteFamId = famMapping?.remoteId;
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
      }

      familyRemoteMap.set(fam.id, remoteFamId!);
      await saveSyncMapping('exerciseFamilies', fam.id, remoteFamId!, famHash, isPublished);
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
    // الخطوة 7: مزامنة NewExerciseStations
    // ---------------------------------------------------------
    onProgress?.('مزامنة محطات التمارين (NewExerciseStations)...', 84);
    const stations = await db.exerciseStations.toArray();
    const docStations = stations.filter(st => exerciseRemoteMap.has(String(st.exerciseId)));

    for (const st of docStations) {
      if (!st.id) continue;
      const remoteExId = exerciseRemoteMap.get(String(st.exerciseId));
      if (!remoteExId) continue;

      const stHash = computeContentHash(st);
      const stMapping = await getSyncMapping('exerciseStations', st.id);

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

      let remoteStId = stMapping?.remoteId;
      if (remoteStId) {
        stPayload.id = remoteStId;
        const { data, error } = await supabase
          .from('NewExerciseStations')
          .upsert(stPayload)
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 7 [NewExerciseStations]', error));
        remoteStId = data.id;
      } else {
        const { data, error } = await supabase
          .from('NewExerciseStations')
          .upsert(stPayload, { onConflict: 'exercise_id,station_order' })
          .select('id')
          .single();
        if (error) throw new Error(formatSupabaseErrorMessage('خطوة 7 [NewExerciseStations]', error));
        remoteStId = data.id;
      }

      await saveSyncMapping('exerciseStations', st.id, remoteStId!, stHash, isPublished);
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
          const qMapping = await getSyncMapping('unitQuizzes', q.id);
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

          await saveSyncMapping('unitQuizzes', q.id, rId!, qHash, isPublished);
        }
      })(),

      // 8.2 Unit Mind Maps
      (async () => {
        const maps = await db.unitMindMaps.where('docId').equals(docId).toArray();
        for (const m of maps) {
          if (!m.id) continue;
          const mHash = computeContentHash(m);
          const mMapping = await getSyncMapping('unitMindMaps', m.id);
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
            const { data, error } = await supabase.from('NewUnitMindMaps').insert(payload).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitMindMaps]', error));
            rId = data.id;
          }
          await saveSyncMapping('unitMindMaps', m.id, rId!, mHash, isPublished);
        }
      })(),

      // 8.3 Unit Comprehensive Reviews
      (async () => {
        const revs = await db.unitComprehensiveReviews.where('docId').equals(docId).toArray();
        for (const r of revs) {
          if (!r.id) continue;
          const rHash = computeContentHash(r);
          const rMapping = await getSyncMapping('unitComprehensiveReviews', r.id);
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
            const { data, error } = await supabase.from('NewUnitComprehensiveReviews').insert(payload).select('id').single();
            if (error) throw new Error(formatSupabaseErrorMessage('[NewUnitComprehensiveReviews]', error));
            rId = data.id;
          }
          await saveSyncMapping('unitComprehensiveReviews', r.id, rId!, rHash, isPublished);
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

    onProgress?.('اكتملت المزامنة والاعتماد بنجاح! 🚀', 100);
    return {
      success: true,
      message: `تم اعتماد ونشر الوحدة "${doc.title}" وكافة محطاتها بنجاح إلى Supabase!`,
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
    const mapping = await getSyncMapping('tests', testId);

    let topicLabel = test.topic || test.scope || null;
    if (!topicLabel) {
      if (derivedScope === 'part') {
        topicLabel = test.unit ? `${test.part || 'جزء كامل'}: ${test.unit}` : `اختبار جزء كامل: ${test.part || ''}`;
      } else if (derivedScope === 'subject_comprehensive') {
        topicLabel = test.unit || 'اختبار شامل لجميع الوحدات';
      }
    }

    const testPayload: any = {
      title: test.testData?.title || test.title,
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
    let purgedDuplicatesCount = 0;

    // فحص شامل لرصد وتطهير أي سجلات مكررة في NewTests تحمل نفس العنوان
    try {
      let checkQuery = supabase
        .from('NewTests')
        .select('id, created_at')
        .eq('title', testPayload.title);

      if (unitRemoteId) {
        checkQuery = checkQuery.eq('unit_id', unitRemoteId);
      }

      const { data: existingRemote, error: checkErr } = await checkQuery.order('created_at', { ascending: false });
      if (!checkErr && existingRemote && existingRemote.length > 0) {
        // إذا كان remoteTestId غير محدد أو لم يعد موجوداً، نعتمد أحدث سجل
        if (!remoteTestId || !existingRemote.some(r => r.id === remoteTestId)) {
          remoteTestId = existingRemote[0].id;
        }

        // تحديد أي سجلات مكررة أخرى وحذفها فوراً عبر الحذف التتابعي الآمن
        const duplicateIds = existingRemote.filter(r => r.id !== remoteTestId).map(r => r.id);
        if (duplicateIds.length > 0) {
          purgedDuplicatesCount = duplicateIds.length;
          console.warn(`تم رصد ${duplicateIds.length} سجلات مكررة سابقة لاختبار "${testPayload.title}". جاري تنظيفها تلقائياً:`, duplicateIds);
          for (const dupId of duplicateIds) {
            await deleteRemoteTestCompletely(dupId);
          }
        }
      }
    } catch (cleanErr) {
      console.warn('تحذير أثناء فحص وتنظيف السجلات المكررة:', cleanErr);
    }

    if (remoteTestId) {
      // تحديث السجل القائم حصراً لمنع إنشاء سجل جديد إطلاقاً
      const { data, error } = await supabase
        .from('NewTests')
        .update(testPayload)
        .eq('id', remoteTestId)
        .select('id')
        .single();
      if (error) throw new Error(formatSupabaseErrorMessage('خطوة 3 [تحديث NewTests]', error));
      remoteTestId = data.id;
    } else {
      // إدراج سجل جديد فقط عند التأكد التام من عدم وجوده مسبقاً
      const { data, error } = await supabase
        .from('NewTests')
        .insert(testPayload)
        .select('id')
        .single();
      if (error) throw new Error(formatSupabaseErrorMessage('خطوة 3 [إدراج NewTests]', error));
      remoteTestId = data.id;
    }

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

    for (let sIdx = 0; sIdx < test.testData.sections.length; sIdx++) {
      const section = test.testData.sections[sIdx];
      const secType = section.sectionType || 'questions';
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

          questionsToInsert.push({
            section_id: sectionRemoteId,
            order_index: qIdx + 1,
            text: q.text || '',
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
    const purgeNote = purgedDuplicatesCount > 0 ? ` (وتم تلقائياً تنظيف ${purgedDuplicatesCount} سجلات مكررة سابقة)` : '';
    return { success: true, message: `تم اعتماد ونشر الاختبار "${test.title}" بنجاح!${purgeNote}` };
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
  return {
    success: false,
    message: 'قسم بنك الأسئلة مستثنى حالياً من المزامنة لإعادة هيكلة القسم بالكامل.',
  };
}

export async function syncSingleExamSummary(summaryId: number, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const sum = await db.examSummaries.get(summaryId);
    if (!sum) throw new Error(`الملخص ${summaryId} غير موجود محلياً`);

    const isPublished = !isDraft;
    const sumHash = computeContentHash(sum);
    const mapping = await getSyncMapping('examSummaries', summaryId);

    const { subjectId } = await resolveTaxonomyHierarchy({
      country: sum.country,
      grade: sum.grade,
      subject: sum.subject,
      unit: sum.unit,
      part: sum.part,
    });

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

    await saveSyncMapping('examSummaries', summaryId, remoteId!, sumHash, isPublished);
    return { success: true, message: `تم اعتماد ونشر الملخص الامتحاني "${sum.title}" بنجاح!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'فشل مزامنة الملخص' };
  }
}

export async function syncSinglePastPaper(paperId: number, isDraft: boolean = false): Promise<SyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, message: 'عميل Supabase غير مهيأ' };

  try {
    const paper = await db.pastPapers.get(paperId);
    if (!paper) throw new Error(`دورة الامتحان ${paperId} غير موجودة محلياً`);

    const isPublished = !isDraft;
    const paperHash = computeContentHash(paper);
    const mapping = await getSyncMapping('pastPapers', paperId);

    const { subjectId } = await resolveTaxonomyHierarchy({
      country: paper.country,
      grade: paper.grade,
      subject: paper.subject,
      unit: paper.unit,
      part: paper.part,
    });

    const payload: any = {
      subject_id: subjectId,
      title: paper.title,
      exam_year: String(paper.year || new Date().getFullYear()),
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

    // Sync questions
    if (paper.questions && paper.questions.length > 0) {
      await supabase.from('NewPastPaperQuestions').delete().eq('paper_id', remoteId);
      for (let i = 0; i < paper.questions.length; i++) {
        const q = paper.questions[i];
        const qPayload: any = {
          paper_id: remoteId,
          order_index: i + 1,
          topic: q.topic || null,
          item_type: q.type || 'problem',
          question: q.question || '',
          solution: q.solution || '',
          sub_parts: q.subParts || null,
          svg_code: q.svgCode || null,
          solution_svg_code: q.solutionSvgCode || null,
        };
        await supabase.from('NewPastPaperQuestions').insert(qPayload);
      }
    }

    await saveSyncMapping('pastPapers', paperId, remoteId!, paperHash, isPublished);
    return { success: true, message: `تم اعتماد ونشر دورة الامتحان "${paper.title}" بنجاح!` };
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
    const mapping = await getSyncMapping('unitQuizzes', quizId);

    let remoteDocId: string | null = null;
    if (q.docId) {
      const docMapping = await getSyncMapping('documents', q.docId);
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

    await saveSyncMapping('unitQuizzes', quizId, remoteId!, qHash, isPublished);
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
    const mapping = await getSyncMapping('unitMindMaps', mindMapId);

    let remoteDocId: string | null = null;
    let unitId: string | null = null;

    if (m.docId) {
      const docMapping = await getSyncMapping('documents', m.docId);
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
      const { data, error } = await supabase.from('NewUnitMindMaps').insert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    await saveSyncMapping('unitMindMaps', mindMapId, remoteId!, mHash, isPublished);
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
    const mapping = await getSyncMapping('unitComprehensiveReviews', reviewId);

    let remoteDocId: string | null = null;
    let unitId: string | null = null;

    if (r.docId) {
      const docMapping = await getSyncMapping('documents', r.docId);
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
      const { data, error } = await supabase.from('NewUnitComprehensiveReviews').insert(payload).select('id').single();
      if (error) throw error;
      remoteId = data.id;
    }

    await saveSyncMapping('unitComprehensiveReviews', reviewId, remoteId!, rHash, isPublished);
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
