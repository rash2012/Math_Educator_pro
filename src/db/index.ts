import { Dexie, type Table } from 'dexie';

export interface SubQuestion {
  id: string | number;
  text: string;
  solution?: string;
  questionSvgCode?: string;
  solutionSvgCode?: string;
  order: number;
}

export interface Exercise {
  id?: number;
  docId: number;
  label?: string;
  mainText: string;
  svgCode?: string;
  strategyText?: string;
  subQuestions: SubQuestion[];
  order: number;
  family_id?: number | string;
  is_lead_exercise?: boolean;
  primary_concept?: string;
  secondary_concepts?: string[];
}

export interface GuidedOption {
  id: string;
  text: string;
  isCorrect: boolean;
  misconceptionDiagnosis?: string; // تشخيص محدد لسبب الخطأ عند اختيار هذا الخيار
}

export interface GuidedQuestion {
  id: string;
  questionOrder: number;
  title: string; // e.g. "المحطة الأولى: التعرف البنيوي وتشخيص النمط"
  prompt: string; // The guided diagnostic question
  options: GuidedOption[]; // 4 multiple choice options
  hint?: string; // Pedagogical hint if mistake (legacy/general)
  hintLevel1?: string; // المستوى 1: نقلة مفاهيمية عامة توجه للقانون دون كشف الحل
  hintLevel2?: string; // المستوى 2: تلميح قريب من الحل (Bottom-out hint)
  skipExplanation?: string; // سطران يشرحان كيفية التفكير في هذه المحطة عند التخطي
  conceptMap?: string; // Solution path / concept map explanation
  isFinalResult?: boolean; // True for the final result question (المحطة 4)
}

export interface StationAttemptData {
  hint_level_reached: 0 | 1 | 2;
  hint_source: 'voluntary' | 'reactive' | null;
  was_skipped: boolean;
}

export interface AttemptSummary {
  stations_data: StationAttemptData[]; // 3 عناصر للمحطات 1-3
  station4_correct_first_try: boolean | null;
  station4_selected_option_index: number | null;
  total_points_awarded: number;
  completedAt?: number;
}

export interface PracticeExercise {
  id: string;
  title: string;
  questionText: string;
  solutionText: string;
  strategyText: string;
  svgCode?: string;
  patternType?: string; // e.g. "إثبات بالتراجع / متتالية حسابية / نهاية غير معينة"
  guidedQuestions?: GuidedQuestion[];
  lastAttempt?: AttemptSummary;
  family_id?: number | string;
  is_lead_exercise?: boolean;
  primary_concept?: string;
  secondary_concepts?: string[];
}

export interface ExerciseFamily {
  id?: number | string;
  unitId?: number | string;
  docId: number;
  familyName: string;
  targetConcepts: string[];
  leadExerciseId?: string | number;
  hasManualEdits?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ExerciseStation {
  id?: number | string;
  exerciseId: string | number;
  stationOrder: 1 | 2 | 3 | 4;
  title?: string;
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
  createdAt?: number;
  updatedAt?: number;
}

export interface LessonSection {
  id?: number;
  docId: number;
  title: string; // (تعريف - مبرهنة - نظرية - نتيجة - مثال محلول - مثال- ملاحظة)
  content: string;
  svgCode?: string;
  practiceExercises?: PracticeExercise[];
  practicalExercises?: PracticeExercise[];
  analysis?: {
    additions?: { label: string; content: string; svgCode?: string }[];
    rephrasedContent?: string;
  };
  order: number;
  conceptLabel?: string;
  illustrationsLabel?: string;
  practiceSectionLabel?: string;
  practicalSectionLabel?: string;
  isPracticeOnly?: boolean;
  guidance?: string;
  notes?: string;
  traps?: string;
  examGuidance?: string;
  exampleText?: string;
  solutionText?: string;
  extraExampleText?: string;
  extraSolutionText?: string;
}

export interface PdfContent {
  id?: number;
  docId: number;
  textContent: string;
  structuredContent?: string; // Stored JSON representing structured headings and paragraphs
  originalFile?: Uint8Array; // Optional if we want to store the file
}

export interface Document {
  id?: number;
  title: string;
  country?: string;
  grade: string;
  subject: string;
  part?: string;
  unit?: string;
  topic?: string;
  type: 'exercise' | 'lesson' | 'pdf' | 'lesson_summary';
  familiesAnalysis?: string;
  seriesName?: string;
  teacherName?: string;
  teacherRole?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TestCategory {
  id?: number;
  name: string;
  createdAt: number;
}

export interface Test {
  id?: number;
  title: string;
  country?: string;
  grade: string;
  subject: string;
  part?: string;
  unit?: string;
  topic?: string;
  seriesName?: string;
  teacherName?: string;
  teacherRole?: string;
  difficulty: string;
  scope: string; // e.g., 'unit', 'part', 'comprehensive'
  testData: any; // The JSON structure of the test
  pdfIds?: number[]; // To track source references
  categoryId?: number;
  isReviewed?: boolean;
  reviewReport?: string;
  reviewIssues?: any[];
  createdAt: number;
}

export interface QuestionBankItem {
  id: string;
  topic: string;
  difficulty: number; // 1 to 5 stars
  question: string;
  subParts: string[];
  solution: string;
  aiGuidance?: string;
  svgCode?: string;
  solutionSvgCode?: string;
  order: number;
  type?: 'mcq' | 'essay';
}

export interface QuestionBank {
  id?: number;
  docId?: number;
  title: string;
  country?: string;
  grade: string;
  subject: string;
  part: string;
  unit: string;
  topic?: string;
  seriesName?: string;
  teacherName?: string;
  teacherRole?: string;
  items: QuestionBankItem[];
  createdAt: number;
  updatedAt: number;
  summaryText?: string;
  condensedSummaryText?: string;
}

export interface ExamSummary {
  id?: number;
  title: string;
  country?: string;
  grade: string;
  subject: string;
  part?: string;
  unit?: string;
  summaryText: string;
  pdfIds: number[];
  createdAt: number;
  updatedAt: number;
  injectedTests?: number[]; // Track tests that have been injected
}

export interface PastPaperQuestion {
  id: string;
  topic: string;
  type: 'mcq' | 'essay';
  question: string;
  subParts?: string[];
  solution: string;
  svgCode?: string;
  solutionSvgCode?: string;
}

export interface PastPaper {
  id?: number;
  title: string;
  country?: string;
  grade: string;
  subject: string;
  part?: string;
  unit?: string;
  year: string;
  questions: PastPaperQuestion[];
  createdAt: number;
}

export interface UnitQuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface UnitQuizQuestion {
  id: string;
  questionNumber: number;
  questionText: string;
  options: UnitQuizOption[];
  correctOptionId: string;
  explanation?: string;
  hint?: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  validationScore?: number;
}


export interface UnitMindMap {
  id?: number;
  docId: number;
  title: string;
  svgCode: string;
  markdownSchema?: string;
  treeData?: any;
  createdAt: number;
  updatedAt: number;
}

export interface UnitQuiz {
  id?: number;
  docId: number;
  title: string;
  unit: string;
  grade: string;
  subject: string;
  totalQuestions: number;
  passingScore?: number;
  questions: UnitQuizQuestion[];
  validationScore?: number;
  createdAt: number;
  updatedAt: number;
}

export interface UnitComprehensiveReview {
  id?: number;
  docId: number;
  title: string;
  unit: string;
  grade?: string;
  subject?: string;
  summaryText: string;
  definitions?: Array<{ id: string; term: string; explanation: string; formula?: string }>;
  theorems?: Array<{ id: string; name: string; statement: string; conditions?: string; notes?: string }>;
  results?: Array<{ id: string; title: string; statement: string; formula?: string }>;
  trapsAndTips?: Array<{ id: string; title: string; trap: string; correctMethod: string }>;
  formulasSummary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StudentProgress {
  id?: number;
  studentName: string;
  country: string;
  grade: string;
  subject: string;
  unitTitle: string;
  completedSectionIds: number[]; // الدروس والفقرات المكتملة
  trainerPoints: number;          // مجموع نقاط ميدان التدريب
  quizScores: Array<{
    quizId: number;
    score: number;
    date: number;
  }>;
  lastActive: number;
}

export class MathEducatorDB extends Dexie {
  documents!: Table<Document>;
  exercises!: Table<Exercise>;
  lessonSections!: Table<LessonSection>;
  pdfContents!: Table<PdfContent>;
  tests!: Table<Test>;
  questionBanks!: Table<QuestionBank>;
  testCategories!: Table<TestCategory>;
  examSummaries!: Table<ExamSummary>;
  pastPapers!: Table<PastPaper>;
  unitQuizzes!: Table<UnitQuiz>;
  unitMindMaps!: Table<UnitMindMap>;
  unitComprehensiveReviews!: Table<UnitComprehensiveReview>;
  studentProgress!: Table<StudentProgress>;
  exerciseFamilies!: Table<ExerciseFamily>;
  exerciseStations!: Table<ExerciseStation>;

  constructor() {
    super('MathEducatorDB');
    this.version(8).stores({
      documents: '++id, title, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, grade, subject, [grade+subject]',
      testCategories: '++id, name'
    });
    this.version(9).stores({
      documents: '++id, title, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, grade, subject, createdAt'
    });
    this.version(10).stores({
      documents: '++id, title, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, grade, subject, createdAt',
      pastPapers: '++id, title, grade, subject, createdAt'
    });
    this.version(11).stores({
      documents: '++id, title, country, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, country, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, country, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, country, grade, subject, createdAt',
      pastPapers: '++id, title, country, grade, subject, createdAt'
    });
    this.version(12).stores({
      documents: '++id, title, country, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, country, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, country, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, country, grade, subject, createdAt',
      pastPapers: '++id, title, country, grade, subject, createdAt',
      unitQuizzes: '++id, docId, unit, grade, subject, createdAt'
    });

    this.version(13).stores({
      documents: '++id, title, country, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, country, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, country, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, country, grade, subject, createdAt',
      pastPapers: '++id, title, country, grade, subject, createdAt',
      unitQuizzes: '++id, docId, unit, grade, subject, createdAt',
      unitMindMaps: '++id, docId, createdAt'
    });

    this.version(14).stores({
      documents: '++id, title, country, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, country, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, country, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, country, grade, subject, createdAt',
      pastPapers: '++id, title, country, grade, subject, createdAt',
      unitQuizzes: '++id, docId, unit, grade, subject, createdAt',
      unitMindMaps: '++id, docId, createdAt',
      unitComprehensiveReviews: '++id, docId, createdAt'
    });

    this.version(15).stores({
      documents: '++id, title, country, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, country, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, country, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, country, grade, subject, createdAt',
      pastPapers: '++id, title, country, grade, subject, createdAt',
      unitQuizzes: '++id, docId, unit, grade, subject, createdAt',
      unitMindMaps: '++id, docId, createdAt',
      unitComprehensiveReviews: '++id, docId, createdAt',
      studentProgress: '++id, studentName, [grade+subject], unitTitle, lastActive'
    });

    this.version(16).stores({
      documents: '++id, title, country, grade, subject, part, unit, topic, type, createdAt, updatedAt',
      exercises: '++id, docId, order, family_id',
      lessonSections: '++id, docId, order',
      pdfContents: '++id, docId',
      tests: '++id, title, country, grade, subject, difficulty, createdAt, categoryId, [grade+subject]',
      questionBanks: '++id, title, country, grade, subject, [grade+subject]',
      testCategories: '++id, name',
      examSummaries: '++id, title, country, grade, subject, createdAt',
      pastPapers: '++id, title, country, grade, subject, createdAt',
      unitQuizzes: '++id, docId, unit, grade, subject, createdAt',
      unitMindMaps: '++id, docId, createdAt',
      unitComprehensiveReviews: '++id, docId, createdAt',
      studentProgress: '++id, studentName, [grade+subject], unitTitle, lastActive',
      exerciseFamilies: '++id, docId, unitId, familyName, createdAt',
      exerciseStations: '++id, exerciseId, stationOrder'
    });
  }
}

export const db = new MathEducatorDB();

// Helper methods for Student Progress
export async function getStudentProgress(studentName: string, grade: string, subject: string, unitTitle: string): Promise<StudentProgress> {
  const existing = await db.studentProgress
    .where({ studentName, unitTitle })
    .and(p => p.grade === grade && p.subject === subject)
    .first();

  if (existing) {
    return existing;
  }

  const newProgress: StudentProgress = {
    studentName,
    country: 'سوريا',
    grade,
    subject,
    unitTitle,
    completedSectionIds: [],
    trainerPoints: 0,
    quizScores: [],
    lastActive: Date.now()
  };

  const id = await db.studentProgress.add(newProgress);
  return { ...newProgress, id: id as number };
}

export async function addStudentTrainerPoints(
  studentName: string,
  grade: string,
  subject: string,
  unitTitle: string,
  points: number,
  sectionId?: number
): Promise<void> {
  const progress = await getStudentProgress(studentName, grade, subject, unitTitle);
  const updatedCompleted = sectionId && !progress.completedSectionIds.includes(sectionId)
    ? [...progress.completedSectionIds, sectionId]
    : progress.completedSectionIds;

  await db.studentProgress.update(progress.id!, {
    trainerPoints: (progress.trainerPoints || 0) + points,
    completedSectionIds: updatedCompleted,
    lastActive: Date.now()
  });
}

export async function recordStudentQuizScore(
  studentName: string,
  grade: string,
  subject: string,
  unitTitle: string,
  quizId: number,
  score: number
): Promise<void> {
  const progress = await getStudentProgress(studentName, grade, subject, unitTitle);
  const quizScores = progress.quizScores || [];
  quizScores.push({ quizId, score, date: Date.now() });

  await db.studentProgress.update(progress.id!, {
    quizScores,
    lastActive: Date.now()
  });
}
