import { db, type ExerciseFamily, type ExerciseStation, type LessonSection, type PracticeExercise } from './index';

export interface ClassifiedStation {
  id?: string | number;
  stationOrder: 1 | 2 | 3 | 4;
  title: string;
  questionText: string;
  choices?: Array<{
    id?: string;
    text: string;
    isCorrect: boolean;
    misconceptionDiagnosis?: string;
  }>;
  correctChoiceIndex?: number;
  hintText?: string;
  hintLevel1?: string;
  hintLevel2?: string;
  skipExplanation?: string;
  conceptMap?: string;
}

export interface ClassifiedExercise {
  id: string;
  title: string;
  questionText: string;
  solutionText?: string;
  strategyText?: string;
  svgCode?: string;
  isLeadExercise: boolean;
  primaryConcept: string;
  secondaryConcepts: string[];
  stations?: ClassifiedStation[];
}

export interface ClassifiedFamilyData {
  id?: number | string;
  docId: number;
  unitId?: number | string;
  familyName: string;
  targetConcepts: string[];
  leadExerciseId: string;
  exercises: ClassifiedExercise[];
  hasManualEdits?: boolean;
  saved?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 🔒 Atomic RPC Function: Saves a single family and all its exercises and stations
 * within a single Dexie transaction.
 */
export async function saveExerciseFamilyAtomic(
  docId: number,
  family: ClassifiedFamilyData,
  unitId?: number | string
): Promise<number | string> {
  return await db.transaction(
    'rw',
    [db.exerciseFamilies, db.exerciseStations, db.lessonSections, db.exercises, db.documents],
    async () => {
      const now = Date.now();

      // 1. Create or Update Family Record in exerciseFamilies table
      let savedFamilyId: number | string;
      if (family.id && typeof family.id === 'number') {
        const existing = await db.exerciseFamilies.get(family.id);
        if (existing) {
          await db.exerciseFamilies.update(family.id, {
            familyName: family.familyName,
            targetConcepts: family.targetConcepts,
            leadExerciseId: family.leadExerciseId,
            hasManualEdits: !!family.hasManualEdits,
            updatedAt: now
          });
          savedFamilyId = family.id;
        } else {
          savedFamilyId = await db.exerciseFamilies.add({
            docId,
            unitId,
            familyName: family.familyName,
            targetConcepts: family.targetConcepts,
            leadExerciseId: family.leadExerciseId,
            hasManualEdits: !!family.hasManualEdits,
            createdAt: family.createdAt || now,
            updatedAt: now
          });
        }
      } else {
        savedFamilyId = await db.exerciseFamilies.add({
          docId,
          unitId,
          familyName: family.familyName,
          targetConcepts: family.targetConcepts,
          leadExerciseId: family.leadExerciseId,
          hasManualEdits: !!family.hasManualEdits,
          createdAt: now,
          updatedAt: now
        });
      }

      // 2. Fetch sections and update practiceExercises
      const sections = await db.lessonSections.where('docId').equals(docId).toArray();
      for (const section of sections) {
        if (!section.practiceExercises || section.practiceExercises.length === 0) continue;
        let modified = false;

        const updatedExercises = section.practiceExercises.map((pe) => {
          const matched = family.exercises.find((ex) => ex.id === pe.id);
          if (matched) {
            modified = true;
            const isLead = matched.id === family.leadExerciseId || matched.isLeadExercise;
            
            // Map stations to guidedQuestions for student portal compatibility
            const guidedQuestions = !isLead && matched.stations && matched.stations.length > 0
              ? matched.stations.map((st) => ({
                  id: `st_${st.stationOrder}`,
                  questionOrder: st.stationOrder,
                  title: st.title,
                  prompt: st.questionText,
                  options: st.choices?.map((c, cIdx) => ({
                    id: c.id || `opt_${st.stationOrder}_${cIdx}`,
                    text: c.text,
                    isCorrect: c.isCorrect,
                    misconceptionDiagnosis: c.misconceptionDiagnosis
                  })) || [],
                  hint: st.hintText,
                  hintLevel1: st.hintLevel1,
                  hintLevel2: st.hintLevel2,
                  skipExplanation: st.skipExplanation,
                  conceptMap: st.conceptMap,
                  isFinalResult: st.stationOrder === 4
                }))
              : pe.guidedQuestions;

            return {
              ...pe,
              family_id: savedFamilyId,
              is_lead_exercise: isLead,
              primary_concept: matched.primaryConcept,
              secondary_concepts: matched.secondaryConcepts,
              patternType: family.familyName,
              guidedQuestions
            };
          }
          return pe;
        });

        if (modified && section.id) {
          await db.lessonSections.update(section.id, {
            practiceExercises: updatedExercises
          });
        }
      }

      // 3. Persist stations in exerciseStations table
      for (const ex of family.exercises) {
        const isLead = ex.id === family.leadExerciseId || ex.isLeadExercise;
        
        // Remove prior stations for this exercise
        await db.exerciseStations.where('exerciseId').equals(ex.id).delete();

        // If non-lead and has stations, add them
        if (!isLead && ex.stations && ex.stations.length > 0) {
          const stationsToAdd: ExerciseStation[] = ex.stations.map((st) => ({
            exerciseId: ex.id,
            stationOrder: st.stationOrder,
            title: st.title,
            questionText: st.questionText,
            choices: st.choices || [],
            correctChoiceIndex: st.correctChoiceIndex ?? st.choices?.findIndex(c => c.isCorrect),
            hintText: st.hintText,
            hintLevel1: st.hintLevel1,
            hintLevel2: st.hintLevel2,
            skipExplanation: st.skipExplanation,
            conceptMap: st.conceptMap,
            createdAt: now,
            updatedAt: now
          }));
          await db.exerciseStations.bulkAdd(stationsToAdd);
        }
      }

      // 4. Update Document timestamp
      await db.documents.update(docId, { updatedAt: now });

      return savedFamilyId;
    }
  );
}

/**
 * 🔒 Load all exercise families and their exercises + stations for a given unit/document.
 */
export async function loadUnitExerciseFamilies(docId: number): Promise<ClassifiedFamilyData[]> {
  const families = await db.exerciseFamilies.where('docId').equals(docId).toArray();
  if (!families || families.length === 0) {
    return [];
  }

  const sections = await db.lessonSections.where('docId').equals(docId).toArray();
  const allPracticeExercises: PracticeExercise[] = [];
  sections.forEach(s => {
    if (s.practiceExercises) {
      allPracticeExercises.push(...s.practiceExercises);
    }
  });

  const result: ClassifiedFamilyData[] = [];

  for (const fam of families) {
    const famId = fam.id!;
    // Find all exercises belonging to this family
    const familyPracticeExercises = allPracticeExercises.filter(
      pe => pe.family_id === famId || (typeof famId === 'number' && pe.family_id === famId.toString())
    );

    const classifiedExercises: ClassifiedExercise[] = [];

    for (const pe of familyPracticeExercises) {
      const isLead = pe.id === fam.leadExerciseId || !!pe.is_lead_exercise;
      
      // Load stations from exerciseStations table
      const rawStations = await db.exerciseStations.where('exerciseId').equals(pe.id).toArray();
      rawStations.sort((a, b) => a.stationOrder - b.stationOrder);

      const stations: ClassifiedStation[] = rawStations.map(st => ({
        id: st.id,
        stationOrder: st.stationOrder,
        title: st.title || `المحطة ${st.stationOrder}`,
        questionText: st.questionText,
        choices: st.choices || [],
        correctChoiceIndex: st.correctChoiceIndex,
        hintText: st.hintText,
        hintLevel1: st.hintLevel1,
        hintLevel2: st.hintLevel2,
        skipExplanation: st.skipExplanation,
        conceptMap: st.conceptMap
      }));

      // Fallback: If stations table was empty, check pe.guidedQuestions
      if (stations.length === 0 && !isLead && pe.guidedQuestions && pe.guidedQuestions.length > 0) {
        pe.guidedQuestions.forEach(gq => {
          stations.push({
            stationOrder: (gq.questionOrder as 1 | 2 | 3 | 4) || 1,
            title: gq.title,
            questionText: gq.prompt,
            choices: gq.options || [],
            correctChoiceIndex: gq.options?.findIndex(o => o.isCorrect) ?? 0,
            hintText: gq.hint,
            hintLevel1: gq.hintLevel1,
            hintLevel2: gq.hintLevel2,
            skipExplanation: gq.skipExplanation,
            conceptMap: gq.conceptMap
          });
        });
      }

      classifiedExercises.push({
        id: pe.id,
        title: pe.title,
        questionText: pe.questionText,
        solutionText: pe.solutionText,
        strategyText: pe.strategyText,
        svgCode: pe.svgCode,
        isLeadExercise: isLead,
        primaryConcept: pe.primary_concept || fam.familyName,
        secondaryConcepts: pe.secondary_concepts || [],
        stations: isLead ? [] : stations
      });
    }

    result.push({
      id: fam.id,
      docId: fam.docId,
      unitId: fam.unitId,
      familyName: fam.familyName,
      targetConcepts: fam.targetConcepts || [],
      leadExerciseId: (fam.leadExerciseId as string) || (classifiedExercises[0]?.id ?? ''),
      exercises: classifiedExercises,
      hasManualEdits: fam.hasManualEdits,
      saved: true,
      createdAt: fam.createdAt,
      updatedAt: fam.updatedAt
    });
  }

  return result;
}

/**
 * 🔒 Delete a family and remove family tags from associated exercises
 */
export async function deleteExerciseFamilyAtomic(familyId: number | string, docId: number): Promise<void> {
  await db.transaction('rw', [db.exerciseFamilies, db.exerciseStations, db.lessonSections], async () => {
    if (typeof familyId === 'number') {
      await db.exerciseFamilies.delete(familyId);
    } else {
      const num = parseInt(familyId, 10);
      if (!isNaN(num)) await db.exerciseFamilies.delete(num);
    }

    const sections = await db.lessonSections.where('docId').equals(docId).toArray();
    for (const section of sections) {
      if (!section.practiceExercises) continue;
      let modified = false;
      const updated = section.practiceExercises.map(pe => {
        if (pe.family_id === familyId || pe.family_id === Number(familyId)) {
          modified = true;
          return {
            ...pe,
            family_id: undefined,
            is_lead_exercise: undefined,
            primary_concept: undefined,
            secondary_concepts: undefined
          };
        }
        return pe;
      });

      if (modified && section.id) {
        await db.lessonSections.update(section.id, { practiceExercises: updated });
      }
    }
  });
}
