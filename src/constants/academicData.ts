// ============================================================================
// Academic Metadata Constants & Standard Syrian / Arab Curriculum Data
// ============================================================================

export interface AcademicMetadata {
  country?: string;
  grade?: string;
  subject?: string;
  part?: string;
  unit?: string;
  topic?: string;
}

export const COUNTRIES = [
  'سوريا',
  'مصر',
  'السعودية',
  'الإمارات',
  'الأردن',
  'العراق',
  'الكويت',
  'عمان',
  'قطر',
  'البحرين',
  'لبنان',
  'اليمن',
  'فلسطين',
  'المغرب',
  'الجزائر',
  'تونس',
  'ليبيا',
  'السودان',
  'آخر'
];

export const DEFAULT_COUNTRY = 'سوريا';

export const GRADES = [
  'الأول الأساسي',
  'الثاني الأساسي',
  'الثالث الأساسي',
  'الرابع الأساسي',
  'الخامس الأساسي',
  'السادس الأساسي',
  'السابع الأساسي',
  'الثامن الأساسي',
  'التاسع الأساسي',
  'الأول الثانوي العلمي',
  'الأول الثانوي الأدبي',
  'الثاني الثانوي العلمي',
  'الثاني الثانوي الأدبي',
  'الثالث الثانوي العلمي',
  'الثالث الثانوي الأدبي',
  'آخر'
];

export const DEFAULT_GRADE = 'الثالث الثانوي العلمي';

export const SUBJECTS = [
  'الرياضيات',
  'الفيزياء',
  'الكيمياء',
  'علم الأحياء (العلوم العامة)',
  'اللغة العربية',
  'اللغة الإنكليزية',
  'اللغة الفرنسية',
  'الفلسفة والعلوم الإنسانية',
  'التاريخ',
  'الجغرافيا',
  'التربية الدينية الإسلامية',
  'التربية الدينية المسيحية',
  'التربية الوطنية',
  'المعلوماتية',
  'تكنولوجيا المعلومات والاتصالات',
  'آخر'
];

export const DEFAULT_SUBJECT = 'الرياضيات';

export const PARTS = [
  'بدون تحديد',
  'الجزء الأول',
  'الجزء الثاني',
  'آخر'
];

export const DEFAULT_PART = 'الجزء الأول';

// Units for Part 1 (Syrian Curriculum - 3rd Secondary Scientific - Mathematics)
export const MATH_GRADE12_PART1_UNITS = [
  'الوحدة الأولى - المتتاليات',
  'الوحدة الثانية - النهايات والاستمرار',
  'الوحدة الثالثة - الاشتقاق',
  'الوحدة الرابعة - نهاية المتتالية',
  'الوحدة الخامسة - التابع اللوغاريتمي',
  'الوحدة السادسة - التابع الأسي',
  'الوحدة السابعة - التكامل والتابع الأصلي'
];

// Units for Part 2 (Syrian Curriculum - 3rd Secondary Scientific - Mathematics)
export const MATH_GRADE12_PART2_UNITS = [
  'الوحدة الأولى - الأشعة في الفراغ',
  'الوحدة الثانية - الجداء السلمي في الفراغ',
  'الوحدة الثالثة - المستقيمات والمستويات في الفراغ',
  'الوحدة الرابعة - الأعداد العقدية',
  'الوحدة الخامسة - تطبيقات الأعداد العقدية',
  'الوحدة السادسة - التحليل التوافقي',
  'الوحدة السابعة - الاحتمالات'
];

// All standard units combined
export const ALL_DEFAULT_MATH_UNITS = [
  ...MATH_GRADE12_PART1_UNITS,
  ...MATH_GRADE12_PART2_UNITS
];

/**
 * Dynamically retrieve standard units based on selected part and subject/grade.
 */
export function getStandardUnits(part?: string, subject?: string, grade?: string): string[] {
  const normPart = (part || '').trim();
  
  if (normPart === 'الجزء الأول' || normPart === 'الأول' || normPart === '1') {
    return MATH_GRADE12_PART1_UNITS;
  }
  
  if (normPart === 'الجزء الثاني' || normPart === 'الثاني' || normPart === '2') {
    return MATH_GRADE12_PART2_UNITS;
  }
  
  // If not explicitly Part 1 or Part 2, return combined or general list
  return ALL_DEFAULT_MATH_UNITS;
}

export const DEFAULT_SERIES_NAME = 'سلسلة التعلم الذكي';
export const DEFAULT_TEACHER_NAME = 'حسن راشد العلي';
export const DEFAULT_TEACHER_ROLE = 'مدرّس مادة الرياضيات والعلوم التفاعلية';

/**
 * Standard default metadata object helper
 */
export function getDefaultAcademicMetadata(overrides?: Partial<AcademicMetadata>): AcademicMetadata {
  return {
    country: DEFAULT_COUNTRY,
    grade: DEFAULT_GRADE,
    subject: DEFAULT_SUBJECT,
    part: 'الجزء الأول',
    unit: 'الوحدة الأولى - المتتاليات',
    topic: '',
    ...overrides
  };
}

export const DEFAULT_METADATA = getDefaultAcademicMetadata();
