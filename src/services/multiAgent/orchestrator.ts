/**
 * Multi-Agent Orchestrator (المايسترو المنسق لنظام الوكلاء)
 * Coordinates across Visual Identity Harmonizer, Curriculum Standards,
 * Generation Engines, and Validator/Critic Agents.
 */

import { AgentActionLog, ValidationResult } from './types';
import { ValidatorAgent } from './validatorAgent';
import { IndependentArbiterAgent } from './arbiterAgent';
import { getCurriculumContextForPrompt } from './curriculumAgent';
import { UNIFIED_THEME } from './visualIdentityHarmonizer';

export class MultiAgentOrchestrator {
  private logs: AgentActionLog[] = [];

  constructor() {
    this.logAction('orchestrator', 'تم تهيئة المايسترو ومنظومة الوكلاء متعددة الطبقات بنجاح', 'ready', 'success');
  }

  /**
   * Log an internal action across layers
   */
  public logAction(
    layer: AgentActionLog['layer'],
    action: string,
    details?: string,
    status: AgentActionLog['status'] = 'success'
  ): void {
    this.logs.push({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      layer,
      timestamp: Date.now(),
      action,
      details,
      status,
    });
  }

  /**
   * Get all accumulated agent operation logs
   */
  public getLogs(): AgentActionLog[] {
    return [...this.logs];
  }

  /**
   * Enrich a prompt with curriculum and visual identity guidelines
   */
  public buildEnrichedPrompt(userPrompt: string, unitTitle: string): string {
    this.logAction('curriculum', `تضمين معايير المنهاج السوري والمصطلحات الأكاديمية للوحدة: ${unitTitle}`);
    this.logAction('visual_harmonizer', 'تطبيق معايير الهوية البصرية وتنسيق LaTeX القياسي بقاعدة الدولار المفرد $...$');

    const curriculumContext = getCurriculumContextForPrompt(unitTitle);

    return `
${curriculumContext}

[توجيهات الهوية البصرية وتنسيق الإخراج]:
- قاعدة الدولار المفرد: استخدم الرموز والمعادلات الرياضية بصيغة LaTeX محاطة بعلامة دولار مفردة $...$ حصراً. يُمنع استخدام $$...$$.
- نسّق المخرجات في هيكل نقي ومتناسق يسهل استعراضه وقراءته وطباعته بدقة.
- تأكد من تضمين كافة الحقول والمفاتيح المطلوبة بدقة تامة وبصيغة JSON صالحة.

[الطلب الأصلي]:
${userPrompt}
`;
  }

  /**
   * Validate and audit a mathematical solution string (e.g. for exercises, exams, past papers)
   */
  public validateMathSolution(solutionText: string, context?: string): {
    text: string;
    score: number;
    issues: any[];
    isValid: boolean;
  } {
    this.logAction('validator', `بدء تدقيق الحل الرياضي علمياً وفق معايير المنهاج السوري${context ? ` (${context})` : ''}`);

    const result = ValidatorAgent.validateMathSolution(solutionText);

    if (result.isValid) {
      this.logAction('validator', `اكتمل التدقيق العلمي للحل بنجاح - درجة الجودة: ${result.score}%`, undefined, 'success');
    } else {
      this.logAction('validator', `تم رصد ملاحظات أثناء تدقيق الحل: ${result.issues.map(i => i.message).join(' | ')}`, undefined, 'warning');
    }

    return result;
  }

  /**
   * Run post-generation validation and auto-repair
   */
  public validateAndHarmonizeReview(reviewData: any): {
    data: any;
    validation: ValidationResult;
  } {
    this.logAction('validator', 'بدء فحص وتدقيق مخرجات المراجعة الشاملة للوحدة');

    // 1. Structural validation
    const validation = ValidatorAgent.validateUnitReview(reviewData);

    // 2. Auto-repair LaTeX in text fields if necessary
    if (reviewData && typeof reviewData === 'object') {
      if (Array.isArray(reviewData.definitions)) {
        reviewData.definitions = reviewData.definitions.map((def: any) => ({
          ...def,
          statement: ValidatorAgent.validateAndRepairLatex(def.statement || '').text,
          mathFormula: ValidatorAgent.validateAndRepairLatex(def.mathFormula || '').text,
        }));
      }

      if (Array.isArray(reviewData.theorems)) {
        reviewData.theorems = reviewData.theorems.map((th: any) => ({
          ...th,
          statement: ValidatorAgent.validateAndRepairLatex(th.statement || '').text,
          conditions: ValidatorAgent.validateAndRepairLatex(th.conditions || '').text,
          notes: ValidatorAgent.validateAndRepairLatex(th.notes || '').text,
        }));
      }

      if (Array.isArray(reviewData.examTraps)) {
        reviewData.examTraps = reviewData.examTraps.map((trap: any) => ({
          ...trap,
          trap: ValidatorAgent.validateAndRepairLatex(trap.trap || '').text,
          correction: ValidatorAgent.validateAndRepairLatex(trap.correction || '').text,
          explanation: ValidatorAgent.validateAndRepairLatex(trap.explanation || '').text,
        }));
      }
    }

    if (validation.isValid) {
      this.logAction('validator', `اكتمل التدقيق بنجاح مع درجة جودة: ${validation.score}/100`, undefined, 'success');
    } else {
      this.logAction('validator', `تم رصد ملاحظات أثناء التدقيق: ${validation.issues.map(i => i.message).join(' | ')}`, undefined, 'warning');
    }

    return {
      data: reviewData,
      validation,
    };
  }

  /**
   * Validate MCQ question set
   */
  public validateQuestionSet(questions: any[]): {
    questions: any[];
    validationResults: ValidationResult[];
    averageScore: number;
  } {
    this.logAction('validator', `تدقيق مجموعة أسئلة مكونة من ${questions?.length || 0} سؤال`);

    const validationResults: ValidationResult[] = [];

    const processedQuestions = (questions || []).map((q, idx) => {
      // Validate LaTeX in question text
      const repairedQText = ValidatorAgent.validateAndRepairLatex(q.questionText || q.text || '').text;

      // Validate LaTeX in options
      const repairedOptions = (q.options || []).map((opt: any) => ({
        ...opt,
        text: ValidatorAgent.validateAndRepairLatex(opt.text || '').text,
        misconceptionDiagnosis: ValidatorAgent.validateAndRepairLatex(opt.misconceptionDiagnosis || '').text,
      }));

      const singleResult = ValidatorAgent.validateMCQ({
        questionText: repairedQText,
        options: repairedOptions,
      });

      validationResults.push(singleResult);

      return {
        ...q,
        questionText: repairedQText,
        options: repairedOptions,
        validationScore: singleResult.score,
        isValidated: singleResult.isValid,
      };
    });

    const averageScore = validationResults.length > 0
      ? Math.round(validationResults.reduce((acc, r) => acc + r.score, 0) / validationResults.length)
      : 100;

    return {
      questions: processedQuestions,
      validationResults,
      averageScore,
    };
  }

  /**
   * Async Deep Arbitration for Mathematical Solutions via Independent Model
   */
  public async auditAndCorrectSolutionAsync(
    solutionText: string,
    options?: {
      originalQuestion?: string;
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<{ text: string; wasModified: boolean; issues: any[] }> {
    this.logAction('validator', `بدء التدقيق والتحكيم الرياضي العميق للحل عبر النموذج المستقل${options?.context ? ` (${options.context})` : ''}`);
    const result = await IndependentArbiterAgent.auditAndCorrectSolution(solutionText, options);
    this.logAction(
      'validator',
      result.wasModified ? 'تم تحكيم وتصحيح الحل الرياضي بنجاح بواسطة الوكيل المستقل' : 'تم التحقق من صحة الحل الرياضي واعتماده بنجاح',
      undefined,
      'success'
    );
    return result;
  }

  /**
   * Async Deep Arbitration for Lesson Content via Independent Model
   */
  public async auditAndCorrectLessonAsync(
    lessonData: any,
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any> {
    this.logAction('validator', `بدء التحكيم المستقل للدرس النظري${options?.context ? ` (${options.context})` : ''}`);
    const audited = await IndependentArbiterAgent.auditAndCorrectLessonData(lessonData, options);
    this.logAction('validator', 'اكتمل تحكيم وتدقيق الدرس النظري بنجاح', undefined, 'success');
    return audited;
  }

  /**
   * Async Deep Arbitration for Practice Exercises ("تدرّب")
   */
  public async auditAndCorrectPracticeExercisesAsync(
    exercises: any[],
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any[]> {
    this.logAction('validator', `بدء تحكيم تمارين تدرّب (${exercises?.length || 0} تمرين) عبر النموذج المستقل`);
    const audited = await IndependentArbiterAgent.auditAndCorrectPracticeExercises(exercises, options);
    this.logAction('validator', 'تم الانتهاء من تحكيم وتدقيق تمارين تدرّب واعتمادها', undefined, 'success');
    return audited;
  }

  /**
   * Async Deep Arbitration for Unit Exercises ("تمرينات ومسائل الوحدة")
   */
  public async auditAndCorrectUnitExercisesAsync(
    exercises: any[],
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any[]> {
    this.logAction('validator', `بدء تحكيم تمرينات ومسائل الوحدة (${exercises?.length || 0} مسألة)`);
    const audited = await IndependentArbiterAgent.auditAndCorrectUnitExercises(exercises, options);
    this.logAction('validator', 'تم الانتهاء من تحكيم مسائل وتمرينات الوحدة واعتمادها', undefined, 'success');
    return audited;
  }

  /**
   * Async Deep Arbitration for Comprehensive Unit Review
   */
  public async auditAndCorrectUnitReviewAsync(
    reviewData: any,
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any> {
    this.logAction('validator', 'بدء تحكيم المراجعة الشاملة للوحدة عبر النموذج المستقل');
    const audited = await IndependentArbiterAgent.auditAndCorrectUnitReview(reviewData, options);
    this.logAction('validator', 'تم الانتهاء من تحكيم مراجعة الوحدة واعتمادها', undefined, 'success');
    return audited;
  }

  /**
   * Async Deep Arbitration for Questions / Quizzes
   */
  public async auditAndCorrectQuestionSetAsync(
    questions: any[],
    options?: {
      context?: string;
      generatorModelUsed?: string;
    }
  ): Promise<any[]> {
    this.logAction('validator', `بدء تحكيم مجموعة الأسئلة والاختبار (${questions?.length || 0} سؤال)`);
    const audited = await IndependentArbiterAgent.auditAndCorrectQuestionSet(questions, options);
    this.logAction('validator', 'تم الانتهاء من تحكيم وتدقيق الأسئلة واعتمادها', undefined, 'success');
    return audited;
  }
}

export const globalOrchestrator = new MultiAgentOrchestrator();
