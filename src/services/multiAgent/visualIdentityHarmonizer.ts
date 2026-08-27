/**
 * Visual Identity Harmonizer (طبقة توحيد الهوية البصرية وتنسيق الأقسام)
 * Provides standardized styling tokens, card layouts, badges, and UI helpers
 * ensuring visual consistency across all modules of Math Educator Pro.
 */

import { VisualThemeTokens } from './types';

export const UNIFIED_THEME: VisualThemeTokens = {
  primary: {
    base: 'bg-violet-600 hover:bg-violet-700 text-white',
    hover: 'hover:bg-violet-700',
    light: 'bg-violet-50 text-violet-700 border-violet-200',
    border: 'border-violet-300',
    text: 'text-violet-700',
  },
  success: {
    base: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    light: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    border: 'border-emerald-300',
    text: 'text-emerald-700',
  },
  warning: {
    base: 'bg-amber-500 hover:bg-amber-600 text-white',
    light: 'bg-amber-50 text-amber-900 border-amber-200',
    border: 'border-amber-300',
    text: 'text-amber-700',
  },
  surface: {
    card: 'bg-white rounded-2xl border border-slate-200/90 shadow-2xs',
    cardBorder: 'border-slate-200',
    cardShadow: 'shadow-2xs hover:shadow-xs transition-shadow',
    inputBg: 'bg-white',
    inputBorder: 'border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10',
  },
  typography: {
    fontFamily: 'font-sans',
    headingClass: 'text-xl md:text-2xl font-black text-slate-900 tracking-tight',
    subheadingClass: 'text-sm md:text-base font-bold text-slate-700',
    bodyClass: 'text-sm text-slate-600 leading-relaxed',
    mathClass: 'font-mono text-slate-900 text-sm font-semibold',
  },
};

/**
 * Standard badge styling generator for consistency
 */
export function getSectionBadgeClass(type: 'theorem' | 'definition' | 'result' | 'trap' | 'formula' | 'quiz'): string {
  switch (type) {
    case 'theorem':
      return 'bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5';
    case 'definition':
      return 'bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5';
    case 'result':
      return 'bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5';
    case 'trap':
      return 'bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5';
    case 'formula':
      return 'bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5';
    case 'quiz':
      return 'bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5';
    default:
      return 'bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5';
  }
}

/**
 * Common container header builder for section harmony
 */
export function getUnifiedSectionHeaderClasses(): {
  container: string;
  iconWrapper: string;
  title: string;
  subtitle: string;
} {
  return {
    container: 'flex items-center justify-between gap-4 p-5 md:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-t-2xl border-b border-indigo-900/50',
    iconWrapper: 'p-2.5 bg-white/10 rounded-xl border border-white/15 text-indigo-300 backdrop-blur-xs',
    title: 'text-lg md:text-xl font-black tracking-tight text-white',
    subtitle: 'text-xs text-indigo-200/80 font-normal mt-0.5',
  };
}

/**
 * Standard button classes for action consistency
 */
export const ACTION_BUTTON_CLASSES = {
  primary: 'px-4 py-2.5 bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer',
  secondary: 'px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer',
  success: 'px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer',
  danger: 'px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer',
  subtle: 'px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer',
};
