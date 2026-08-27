/**
 * Multi-Agent System Types for Math Educator Pro
 * Defines contracts for Orchestrator, Visual Harmonizer, Curriculum Agent, and Validator Agent.
 */

export type AgentLayerType = 'orchestrator' | 'visual_harmonizer' | 'curriculum' | 'generator' | 'validator';

export interface AgentActionLog {
  id: string;
  layer: AgentLayerType;
  timestamp: number;
  action: string;
  details?: string;
  status: 'pending' | 'success' | 'warning' | 'error';
}

export interface ValidationIssue {
  type: 'latex_syntax' | 'math_consistency' | 'missing_field' | 'duplicate_option' | 'visual_inconsistency';
  severity: 'warning' | 'error';
  message: string;
  location?: string;
  autoFixAvailable?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0 - 100
  issues: ValidationIssue[];
  autoFixedContent?: any;
}

export interface VisualThemeTokens {
  primary: {
    base: string;
    hover: string;
    light: string;
    border: string;
    text: string;
  };
  success: {
    base: string;
    light: string;
    border: string;
    text: string;
  };
  warning: {
    base: string;
    light: string;
    border: string;
    text: string;
  };
  surface: {
    card: string;
    cardBorder: string;
    cardShadow: string;
    inputBg: string;
    inputBorder: string;
  };
  typography: {
    fontFamily: string;
    headingClass: string;
    subheadingClass: string;
    bodyClass: string;
    mathClass: string;
  };
}

export interface UnitCurriculumSpec {
  unitId: string;
  unitName: string;
  academicBranch: 'scientific' | 'literary' | 'general';
  coreTheorems: string[];
  keyDefinitions: string[];
  commonMisconceptions: string[];
  examTraps: string[];
  standardFormulae: string[];
}
