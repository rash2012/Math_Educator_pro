import React from 'react';

export type PrintFont = 'default' | 'cairo' | 'amiri' | 'tajawal' | 'almarai' | 'al-mithaq' | 'scheherazade' | 'aref' | 'notonaskh' | 'reemkufi';
export type CoverStyle = 'classic-white' | 'gradient-violet-sky' | 'gradient-emerald-mint' | 'gradient-gold-amber' | 'gradient-rose-pink' | 'gradient-dark-slate';

export interface PrintSettingsState {
  printFont: PrintFont;
  printFontSize: number;
  printHeadingFont: PrintFont;
  printHeadingFontSize: number;
  showWatermark: boolean;
  watermarkText: string;
  watermarkOpacity: number;
  coverBgStyle: CoverStyle;
  includeCoverPage: boolean;
  printAllPagesFooter: boolean;
  printFooterText: string;
  printFooterFontSize: number;
  printFooterIsBold: boolean;
  printAllPagesHeader: boolean;
  printHeaderRightText: string;
  printHeaderLeftText: string;
  printHeaderFontSize: number;
  printHeaderBgColor: string;
  printHeaderHeight: number;
  questionBgColor: string;
  solutionBgColor: string;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettingsState = {
  printFont: 'default',
  printFontSize: 10,
  printHeadingFont: 'default',
  printHeadingFontSize: 12,
  showWatermark: false,
  watermarkText: 'حسن راشد العلي',
  watermarkOpacity: 0.08,
  coverBgStyle: 'classic-white',
  includeCoverPage: true,
  printAllPagesFooter: true,
  printFooterText: 'سلسلة التعلم الذكي📚✨ - إعداد المدرس: {teacherName} - جميع الحقوق محفوظة',
  printFooterFontSize: 9,
  printFooterIsBold: true,
  printAllPagesHeader: true,
  printHeaderRightText: '{title}',
  printHeaderLeftText: 'سلسلة التعلم الذكي📚✨',
  printHeaderFontSize: 9,
  printHeaderBgColor: '#7c3aed',
  printHeaderHeight: 28,
  questionBgColor: '#f0f9ff',
  solutionBgColor: '#f0fdf4',
};

export function getContrastColor(hexColor: string): string {
  if (!hexColor || hexColor.length < 6) return '#ffffff';
  const c = hexColor.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#1e1b4b' : '#ffffff';
}

export function getFontFamilyCss(font: PrintFont): string {
  switch (font) {
    case 'cairo': return "'Cairo', sans-serif";
    case 'amiri': return "'Amiri', serif";
    case 'tajawal': return "'Tajawal', sans-serif";
    case 'almarai': return "'Almarai', sans-serif";
    case 'al-mithaq': return "'Al-Mithaq', 'Cairo', sans-serif";
    case 'scheherazade': return "'Scheherazade New', serif";
    case 'aref': return "'Aref Ruqaa', serif";
    case 'notonaskh': return "'Noto Naskh Arabic', serif";
    case 'reemkufi': return "'Reem Kufi', sans-serif";
    case 'default':
    default:
      return "'Cairo', sans-serif";
  }
}

export function getCoverPrintCss(coverBgStyle: CoverStyle): string {
  switch (coverBgStyle) {
    case 'gradient-violet-sky':
      return `
        background: linear-gradient(135deg, #f5f3ff 0%, #f0f9ff 100%) !important;
        border: 6px double #c084fc !important;
        color: #0f172a !important;
      `;
    case 'gradient-emerald-mint':
      return `
        background: linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%) !important;
        border: 6px double #34d399 !important;
        color: #022c22 !important;
      `;
    case 'gradient-gold-amber':
      return `
        background: linear-gradient(135deg, #fef3c7 0%, #fffde7 100%) !important;
        border: 6px double #fbbf24 !important;
        color: #451a03 !important;
      `;
    case 'gradient-rose-pink':
      return `
        background: linear-gradient(135deg, #fff1f2 0%, #fdf2f8 100%) !important;
        border: 6px double #f43f5e !important;
        color: #4c0519 !important;
      `;
    case 'gradient-dark-slate':
      return `
        background: linear-gradient(135deg, #0f172a 0%, #020617 100%) !important;
        border: 6px double #38bdf8 !important;
        color: #ffffff !important;
      `;
    case 'classic-white':
    default:
      return `
        background: #ffffff !important;
        border: 6px double #7c3aed !important;
        color: #0f172a !important;
      `;
  }
}

export function getCoverThemeStyles(coverBgStyle: CoverStyle) {
  switch (coverBgStyle) {
    case 'gradient-violet-sky':
      return {
        wrapper: 'bg-gradient-to-br from-violet-50 to-sky-50 border-violet-300 text-slate-900',
        title: 'text-violet-950',
        teacherLabel: 'text-violet-700/80',
        teacherRole: 'text-violet-600',
        seriesBadge: 'bg-violet-100 text-violet-800',
        footerText: 'text-violet-700 border-violet-100',
        badgeUnified: 'bg-white/80 border-violet-200 text-violet-950 shadow-2xs backdrop-blur-xs',
        badgeViolet: 'bg-white/80 border-violet-200 text-violet-950',
        badgeIndigo: 'bg-white/80 border-violet-200 text-violet-950',
        badgeSky: 'bg-white/80 border-violet-200 text-violet-950',
        badgeEmerald: 'bg-white/80 border-violet-200 text-violet-950',
      };
    case 'gradient-emerald-mint':
      return {
        wrapper: 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300 text-emerald-950',
        title: 'text-emerald-950',
        teacherLabel: 'text-emerald-700/80',
        teacherRole: 'text-emerald-600',
        seriesBadge: 'bg-emerald-100 text-emerald-800',
        footerText: 'text-emerald-700 border-emerald-100',
        badgeUnified: 'bg-white/80 border-emerald-200 text-emerald-950 shadow-2xs backdrop-blur-xs',
        badgeViolet: 'bg-white/80 border-emerald-200 text-emerald-950',
        badgeIndigo: 'bg-white/80 border-emerald-200 text-emerald-950',
        badgeSky: 'bg-white/80 border-emerald-200 text-emerald-950',
        badgeEmerald: 'bg-white/80 border-emerald-200 text-emerald-950',
      };
    case 'gradient-gold-amber':
      return {
        wrapper: 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-300 text-amber-950',
        title: 'text-amber-950',
        teacherLabel: 'text-amber-700/80',
        teacherRole: 'text-amber-600',
        seriesBadge: 'bg-amber-100 text-amber-800',
        footerText: 'text-amber-700 border-amber-100',
        badgeUnified: 'bg-white/85 border-amber-200 text-amber-950 shadow-2xs backdrop-blur-xs',
        badgeViolet: 'bg-white/85 border-amber-200 text-amber-950',
        badgeIndigo: 'bg-white/85 border-amber-200 text-amber-950',
        badgeSky: 'bg-white/85 border-amber-200 text-amber-950',
        badgeEmerald: 'bg-white/85 border-amber-200 text-amber-950',
      };
    case 'gradient-rose-pink':
      return {
        wrapper: 'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-300 text-rose-950',
        title: 'text-rose-950',
        teacherLabel: 'text-rose-700/80',
        teacherRole: 'text-rose-600',
        seriesBadge: 'bg-rose-100 text-rose-800',
        footerText: 'text-rose-700 border-rose-100',
        badgeUnified: 'bg-white/80 border-rose-200 text-rose-950 shadow-2xs backdrop-blur-xs',
        badgeViolet: 'bg-white/80 border-rose-200 text-rose-950',
        badgeIndigo: 'bg-white/80 border-rose-200 text-rose-950',
        badgeSky: 'bg-white/80 border-rose-200 text-rose-950',
        badgeEmerald: 'bg-white/80 border-rose-200 text-rose-950',
      };
    case 'gradient-dark-slate':
      return {
        wrapper: 'bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-sky-500 text-white',
        title: 'text-white drop-shadow-[0_2px_10px_rgba(56,189,248,0.15)]',
        teacherLabel: 'text-slate-300',
        teacherRole: 'text-sky-400',
        seriesBadge: 'bg-slate-800 text-sky-400',
        footerText: 'text-slate-400 border-slate-850',
        badgeUnified: 'bg-slate-800/90 border-slate-700 text-slate-100 shadow-2xs backdrop-blur-xs',
        badgeViolet: 'bg-slate-800/90 border-slate-700 text-slate-100',
        badgeIndigo: 'bg-slate-800/90 border-slate-700 text-slate-100',
        badgeSky: 'bg-slate-800/90 border-slate-700 text-slate-100',
        badgeEmerald: 'bg-slate-800/90 border-slate-700 text-slate-100',
      };
    case 'classic-white':
    default:
      return {
        wrapper: 'bg-white border-violet-200 text-slate-900',
        title: 'text-gray-950',
        teacherLabel: 'text-gray-500',
        teacherRole: 'text-violet-600',
        seriesBadge: 'bg-violet-100 text-violet-700',
        footerText: 'text-gray-500 border-violet-100',
        badgeUnified: 'bg-slate-50/90 border-slate-200/90 text-slate-800 shadow-2xs',
        badgeViolet: 'bg-slate-50/90 border-slate-200/90 text-slate-800',
        badgeIndigo: 'bg-slate-50/90 border-slate-200/90 text-slate-800',
        badgeSky: 'bg-slate-50/90 border-slate-200/90 text-slate-800',
        badgeEmerald: 'bg-slate-50/90 border-slate-200/90 text-slate-800',
      };
  }
}
