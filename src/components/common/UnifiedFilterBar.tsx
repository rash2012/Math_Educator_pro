import React from 'react';
import { Filter, X, Search, Globe, GraduationCap, BookOpen, Layers, BookMarked } from 'lucide-react';
import { COUNTRIES, GRADES, SUBJECTS, ALL_DEFAULT_MATH_UNITS } from '../../constants/academicData';

interface UnifiedFilterBarProps {
  title?: string;
  countryFilter: string;
  setCountryFilter: (val: string) => void;
  gradeFilter: string;
  setGradeFilter: (val: string) => void;
  subjectFilter: string;
  setSubjectFilter: (val: string) => void;
  unitFilter?: string;
  setUnitFilter?: (val: string) => void;
  searchQuery?: string;
  setSearchQuery?: (val: string) => void;
  typeFilter?: string;
  setTypeFilter?: (val: any) => void;
  typeOptions?: Array<{ value: string; label: string }>;
  extraControls?: React.ReactNode;
}

export const UnifiedFilterBar: React.FC<UnifiedFilterBarProps> = ({
  title = 'تصفية وتصنيف المحتوى الأكاديمي',
  countryFilter,
  setCountryFilter,
  gradeFilter,
  setGradeFilter,
  subjectFilter,
  setSubjectFilter,
  unitFilter,
  setUnitFilter,
  searchQuery,
  setSearchQuery,
  typeFilter,
  setTypeFilter,
  typeOptions,
  extraControls,
}) => {
  const hasActiveFilters = Boolean(
    countryFilter ||
    gradeFilter ||
    subjectFilter ||
    unitFilter ||
    (typeFilter && typeFilter !== 'all') ||
    (searchQuery && searchQuery.trim().length > 0)
  );

  const resetAllFilters = () => {
    setCountryFilter('');
    setGradeFilter('');
    setSubjectFilter('');
    if (setUnitFilter) setUnitFilter('');
    if (setSearchQuery) setSearchQuery('');
    if (setTypeFilter) setTypeFilter('all');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-4 mb-6 no-print">
      {/* Header of the filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-black text-slate-800">
          <div className="p-1.5 bg-violet-100 text-violet-700 rounded-lg">
            <Filter size={14} />
          </div>
          <span>{title}</span>
        </div>
        {hasActiveFilters && (
          <button
            onClick={resetAllFilters}
            className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <X size={13} />
            <span>إعادة ضبط الفلاتر</span>
          </button>
        )}
      </div>

      {/* Select inputs grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Country Filter */}
        <div className="relative">
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="w-full text-xs font-bold border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all appearance-none cursor-pointer text-slate-700"
          >
            <option value="">🌍 كافة الدول</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Grade Filter */}
        <div className="relative">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="w-full text-xs font-bold border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all appearance-none cursor-pointer text-slate-700"
          >
            <option value="">🎓 كافة الصفوف والمراحل</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Subject Filter */}
        <div className="relative">
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full text-xs font-bold border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all appearance-none cursor-pointer text-slate-700"
          >
            <option value="">📚 كافة المواد الدراسية</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Unit Filter (Optional) */}
        {setUnitFilter && (
          <div className="relative">
            <select
              value={unitFilter || ''}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all appearance-none cursor-pointer text-slate-700"
            >
              <option value="">📖 كافة الوحدات التعليمية</option>
              {ALL_DEFAULT_MATH_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Type Filter (Optional) */}
        {setTypeFilter && typeOptions && (
          <div className="relative">
            <select
              value={typeFilter || 'all'}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all appearance-none cursor-pointer text-slate-700"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Optional Search Query and Extra Controls Row */}
      {(setSearchQuery || extraControls) && (
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1 border-t border-slate-100">
          {setSearchQuery && (
            <div className="relative flex-1 w-full">
              <Search
                size={15}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="ابحث بالاسم، الموضوع، أو عنوان الوحدة..."
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-xl pr-9 pl-4 py-2 bg-slate-50/50 hover:bg-white focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all text-slate-800"
              />
            </div>
          )}
          {extraControls && <div className="shrink-0">{extraControls}</div>}
        </div>
      )}
    </div>
  );
};
