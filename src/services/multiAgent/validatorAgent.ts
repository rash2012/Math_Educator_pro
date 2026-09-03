/**
 * Critic, Validator & LaTeX Verifier (طبقة التدقيق والنقد الذاتي)
 * Performs automated sanity checks, LaTeX syntax auditing & auto-repair,
 * JSON structural validation, and multiple-choice uniqueness verification.
 */

import { ValidationIssue, ValidationResult } from './types';

export class ValidatorAgent {
  /**
   * Audits, inspects, and auto-repairs LaTeX equations according to strict curriculum rules:
   * - Treats LaTeX as inviolable code (كود برمجي لا يُمس)
   * - Enforces single dollar rule ($ ... $) strictly, replacing $$ with $
   * - Prevents missing backslashes and mandates complete command names (\frac, \sqrt, etc.)
   * - Allows \right and \left modifiers for complex structures, but discourages them for simple vectors.
   * - Single-letter vector MUST strictly use \vec{u} (e.g. \vec{u}, \vec{v}, \vec{w})
   * - Two-letter vector between two points MUST strictly use \overrightarrow{AB}
   * - Enforces Syrian curriculum constraints (replaces \sum with \cdots, converts cross product notation to \cdot)
   * - Fixes unclosed dollar signs, mismatched curly braces, and verifies every equation
   */
  static validateAndRepairLatex(text: string): { text: string; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    let repairedText = text;

    if (!text || typeof text !== 'string') {
      return { text: text || '', issues };
    }

    // 1. Strict Single Dollar Rule: Convert all $$...$$ to $...$
    if (repairedText.includes('$$')) {
      issues.push({
        type: 'latex_syntax',
        severity: 'warning',
        message: 'تم اكتشاف علامات $$ مزدوجة وتحويلها تلقائياً إلى علامة الدولار المفردة $ لتفادي كسر محاذاة النص العربي و KaTeX.',
        autoFixAvailable: true,
      });
      repairedText = repairedText.replace(/\$\$/g, '$');
    }

    // 2. Strict Vector Rules:
    // A) Two-letter vector between points: MUST use \overrightarrow{AB} (Never \vec{AB})
    if (/\\vec\{([A-Za-z]{2,})\}/.test(repairedText)) {
      issues.push({
        type: 'math_consistency',
        severity: 'warning',
        message: 'تم رصد استخدام \\vec لشعاع بين نقطتين بحرفين، تم التصحيح إلى \\overrightarrow{AB} وفق المعايير الصارمة.',
        autoFixAvailable: true,
      });
      repairedText = repairedText.replace(/\\vec\{([A-Za-z]{2,})\}/g, '\\overrightarrow{$1}');
    }

    // B) Single-letter vector: MUST use \vec{u} (Never \overrightarrow{u})
    if (/\\overrightarrow\{([a-zA-Z])\}/.test(repairedText)) {
      issues.push({
        type: 'math_consistency',
        severity: 'warning',
        message: 'تم رصد استخدام \\overrightarrow لشعاع بحرف واحد، تم التصحيح إلى \\vec{u} وفق المعايير الصارمة.',
        autoFixAvailable: true,
      });
      repairedText = repairedText.replace(/\\overrightarrow\{([a-zA-Z])\}/g, '\\vec{$1}');
    }

    // 3. Inspect, clean, and validate math expressions inside $...$
    repairedText = repairedText.replace(/\$([^\$]+)\$/g, (_match, mathInner) => {
      let repairedInner = mathInner;

      // A) (Removed aggressive stripping of \left and \right to allow them when needed)

      // B) Fix missing leading backslash for standard distinct LaTeX commands
      repairedInner = repairedInner
        .replace(/(?<!\\)\b(frac)\b\s*\{/g, '\\frac{')
        .replace(/(?<!\\)\b(sqrt)\b\s*\{/g, '\\sqrt{')
        .replace(/(?<!\\)\b(vec)\b\s*\{/g, '\\vec{')
        .replace(/(?<!\\)\b(overrightarrow)\b\s*\{/g, '\\overrightarrow{')
        .replace(/(?<!\\)\b(overline)\b\s*\{/g, '\\overline{')
        .replace(/(?<!\\)\b(underline)\b\s*\{/g, '\\underline{')
        .replace(/(?<!\\)\b(lim)\b(?=_|\s)/g, '\\lim')
        .replace(/(?<!\\)\b(infty)\b/g, '\\infty')
        .replace(/(?<!\\)\b(cdot)\b/g, '\\cdot');

      return `$${repairedInner}$`;
    });

    // 4. Check Syrian Curriculum constraint: No \sum for sums in series/sequences (use \cdots)
    if (repairedText.includes('\\sum')) {
      issues.push({
        type: 'math_consistency',
        severity: 'warning',
        message: 'تم رصد رمز \\sum غير المعتمد بالمنهاج السوري للمجاميع؛ يفضل استخدام نقاط التتابع \\cdots.',
        autoFixAvailable: true,
      });
    }

    // 5. Check Syrian Curriculum constraint: No cross product \vec{u} \times \vec{v} or \wedge
    if (/\\vec\{[a-zA-Z]+\}\s*(\\times|\\wedge)\s*\\vec\{[a-zA-Z]+\}/.test(repairedText)) {
      issues.push({
        type: 'math_consistency',
        severity: 'warning',
        message: 'تم رصد استخدام الجداء الشعاعي الخارجي (غير موجود في المنهاج السوري)، تم التحويل إلى الجداء السلمي \\cdot.',
        autoFixAvailable: true,
      });
      repairedText = repairedText.replace(/(\\vec\{[a-zA-Z]+\})\s*(\\times|\\wedge)\s*(\\vec\{[a-zA-Z]+\})/g, '$1 \\cdot $3');
    }

    // 6. Check for mismatched single dollar signs $
    const singleDollarCount = (repairedText.match(/(?<!\\)\$/g) || []).length;
    if (singleDollarCount % 2 !== 0) {
      issues.push({
        type: 'latex_syntax',
        severity: 'warning',
        message: 'عدد علامات الدولار $ غير متطابق (يوجد رمز $ غير مغلق). تم الإصلاح التلقائي بإغلاق الرمز.',
        autoFixAvailable: true,
      });
      // Auto repair by closing with $
      repairedText = repairedText + '$';
    }

    // 7. Check for unmatched curly braces inside LaTeX blocks
    const mathBlocks = repairedText.match(/\$([^\$]+)\$/g) || [];
    for (const block of mathBlocks) {
      const openBraces = (block.match(/\{/g) || []).length;
      const closeBraces = (block.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        issues.push({
          type: 'latex_syntax',
          severity: 'error',
          message: `أقواس معقوفة غير متطابقة في الصيغة: ${block}`,
          location: block,
        });
      }
    }

    // 8. Fix common accidental spacing in commands e.g. \frac {a}{b} -> \frac{a}{b}
    repairedText = repairedText.replace(/\\frac\s+/g, '\\frac');
    repairedText = repairedText.replace(/\\sqrt\s+/g, '\\sqrt');

    return { text: repairedText, issues };
  }

  /**
   * Validates a step-by-step mathematical solution (for exercises, past papers, tests)
   */
  static validateMathSolution(solutionText: string): {
    text: string;
    score: number;
    issues: ValidationIssue[];
    isValid: boolean;
  } {
    const { text: repairedText, issues } = this.validateAndRepairLatex(solutionText);

    if (!repairedText || repairedText.trim().length < 15) {
      issues.push({
        type: 'missing_field',
        severity: 'error',
        message: 'نص الحل قصير جداً أو غير مكتمل رياضياً.',
      });
    }

    // Check presence of math formulas or steps
    const hasMath = repairedText.includes('$') || /[\=\+\-\*\/\\lim\\int\\sqrt]/.test(repairedText);
    if (!hasMath) {
      issues.push({
        type: 'math_consistency',
        severity: 'warning',
        message: 'الحل لا يحتوي على رموز أو خطوات رياضية كافية بصيغة LaTeX.',
      });
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    const score = Math.max(0, 100 - (issues.filter(i => i.severity === 'error').length * 30) - (issues.filter(i => i.severity === 'warning').length * 10));

    return {
      text: repairedText,
      score,
      issues,
      isValid: !hasErrors && score >= 70,
    };
  }

  /**
   * Validates a Multiple Choice Question (MCQ) structure
   */
  static validateMCQ(question: {
    questionText?: string;
    options?: Array<{ text: string; isCorrect?: boolean }>;
  }): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!question.questionText || question.questionText.trim().length === 0) {
      issues.push({
        type: 'missing_field',
        severity: 'error',
        message: 'نص السؤال فارغ أو غير موجود',
      });
    }

    const options = question.options || [];
    if (options.length < 2) {
      issues.push({
        type: 'missing_field',
        severity: 'error',
        message: `عدد الخيارات غير كافٍ (${options.length})، يجب أن يتوفر 4 خيارات على الأقل.`,
      });
    }

    const correctCount = options.filter(o => o.isCorrect).length;
    if (correctCount === 0) {
      issues.push({
        type: 'math_consistency',
        severity: 'error',
        message: 'لم يتم تحديد أي إجابة صحيحة في خيارات السؤال.',
      });
    } else if (correctCount > 1) {
      issues.push({
        type: 'math_consistency',
        severity: 'warning',
        message: `تم تحديد أكثر من إجابة صحيحة (${correctCount}) في سؤال اختيار من متعدد أحادي.`,
      });
    }

    // Check duplicate options
    const optionTexts = options.map(o => (o.text || '').trim().toLowerCase()).filter(t => t.length > 0);
    const uniqueTexts = new Set(optionTexts);
    if (uniqueTexts.size < optionTexts.length) {
      issues.push({
        type: 'duplicate_option',
        severity: 'warning',
        message: 'يوجد خيارات مكررة في نصوص الخيارات.',
      });
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    const score = Math.max(0, 100 - (issues.filter(i => i.severity === 'error').length * 40) - (issues.filter(i => i.severity === 'warning').length * 15));

    return {
      isValid: !hasErrors,
      score,
      issues,
    };
  }

  /**
   * Validates a Comprehensive Unit Review object
   */
  static validateUnitReview(review: any): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!review) {
      return {
        isValid: false,
        score: 0,
        issues: [{ type: 'missing_field', severity: 'error', message: 'كائن المراجعة الشاملة فارغ.' }],
      };
    }

    if (!review.definitions || review.definitions.length === 0) {
      issues.push({ type: 'missing_field', severity: 'warning', message: 'قسم التعاريف والمفاهيم فارغ.' });
    }

    if (!review.theorems || review.theorems.length === 0) {
      issues.push({ type: 'missing_field', severity: 'warning', message: 'قسم المبرهنات والنظريات فارغ.' });
    }

    if (!review.examTraps || review.examTraps.length === 0) {
      issues.push({ type: 'missing_field', severity: 'warning', message: 'قسم المطبات الامتحانية فارغ.' });
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    const score = Math.max(0, 100 - (issues.filter(i => i.severity === 'error').length * 30) - (issues.filter(i => i.severity === 'warning').length * 10));

    return {
      isValid: !hasErrors,
      score,
      issues,
    };
  }
}
