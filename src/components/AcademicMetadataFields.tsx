import React, { useState, useEffect } from 'react';
import { 
  COUNTRIES, 
  DEFAULT_COUNTRY, 
  GRADES, 
  DEFAULT_GRADE, 
  SUBJECTS, 
  DEFAULT_SUBJECT, 
  PARTS, 
  getStandardUnits,
  type AcademicMetadata 
} from '../constants/academicData';
import { Globe, GraduationCap, BookOpen, Layers, BookMarked, Edit3 } from 'lucide-react';

interface AcademicMetadataFieldsProps {
  metadata: {
    country?: string;
    grade?: string;
    subject?: string;
    part?: string;
    unit?: string;
    topic?: string;
  };
  onChange: (updated: {
    country: string;
    grade: string;
    subject: string;
    part: string;
    unit: string;
    topic?: string;
  }) => void;
  showTopic?: boolean;
  topicLabel?: string;
  topicPlaceholder?: string;
  layout?: 'grid' | 'vertical' | 'compact';
  readOnly?: boolean;
  className?: string;
}

export const AcademicMetadataFields: React.FC<AcademicMetadataFieldsProps> = ({
  metadata,
  onChange,
  showTopic = false,
  topicLabel = 'الموضوع / الوصف (اختياري)',
  topicPlaceholder = 'مثال: تمرينات ومسائل الوحدة، نهايات واستمرار...',
  layout = 'grid',
  readOnly = false,
  className = ''
}) => {
  const currentCountry = metadata.country || DEFAULT_COUNTRY;
  const currentGrade = metadata.grade || DEFAULT_GRADE;
  const currentSubject = metadata.subject || DEFAULT_SUBJECT;
  const currentPart = metadata.part || '';
  const currentUnit = metadata.unit || '';
  const currentTopic = metadata.topic || '';

  // Check if current values are standard or custom ("آخر")
  const isCustomCountry = currentCountry !== '' && !COUNTRIES.includes(currentCountry);
  const isCustomGrade = currentGrade !== '' && !GRADES.includes(currentGrade);
  const isCustomSubject = currentSubject !== '' && !SUBJECTS.includes(currentSubject);
  const isCustomPart = currentPart !== '' && currentPart !== 'بدون تحديد' && !PARTS.includes(currentPart);

  // Available units based on part
  const standardUnits = getStandardUnits(currentPart, currentSubject, currentGrade);
  const isCustomUnit = currentUnit !== '' && !standardUnits.includes(currentUnit);

  // Local states for custom inputs
  const [customCountryMode, setCustomCountryMode] = useState(isCustomCountry);
  const [customGradeMode, setCustomGradeMode] = useState(isCustomGrade);
  const [customSubjectMode, setCustomSubjectMode] = useState(isCustomSubject);
  const [customPartMode, setCustomPartMode] = useState(isCustomPart);
  const [customUnitMode, setCustomUnitMode] = useState(isCustomUnit);

  // Handlers
  const handleCountryChange = (val: string) => {
    if (val === 'آخر') {
      setCustomCountryMode(true);
      onChange({ ...metadata, country: '', grade: currentGrade, subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic });
    } else {
      setCustomCountryMode(false);
      onChange({ ...metadata, country: val, grade: currentGrade, subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic });
    }
  };

  const handleGradeChange = (val: string) => {
    if (val === 'آخر') {
      setCustomGradeMode(true);
      onChange({ ...metadata, country: currentCountry, grade: '', subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic });
    } else {
      setCustomGradeMode(false);
      onChange({ ...metadata, country: currentCountry, grade: val, subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic });
    }
  };

  const handleSubjectChange = (val: string) => {
    if (val === 'آخر') {
      setCustomSubjectMode(true);
      onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: '', part: currentPart, unit: currentUnit, topic: currentTopic });
    } else {
      setCustomSubjectMode(false);
      onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: val, part: currentPart, unit: currentUnit, topic: currentTopic });
    }
  };

  const handlePartChange = (val: string) => {
    if (val === 'آخر') {
      setCustomPartMode(true);
      onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: '', unit: currentUnit, topic: currentTopic });
    } else if (val === 'بدون تحديد' || val === '') {
      setCustomPartMode(false);
      onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: '', unit: currentUnit, topic: currentTopic });
    } else {
      setCustomPartMode(false);
      // If switching part and current unit was from the other part, we can suggest matching first unit
      const newUnits = getStandardUnits(val, currentSubject, currentGrade);
      const isCurrentUnitValid = newUnits.includes(currentUnit);
      const newUnit = isCurrentUnitValid ? currentUnit : (newUnits[0] || currentUnit);

      onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: val, unit: newUnit, topic: currentTopic });
    }
  };

  const handleUnitChange = (val: string) => {
    if (val === 'آخر') {
      setCustomUnitMode(true);
      onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: currentPart, unit: '', topic: currentTopic });
    } else {
      setCustomUnitMode(false);
      onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: currentPart, unit: val, topic: currentTopic });
    }
  };

  return (
    <div className={`space-y-3 ${className}`} dir="rtl">
      {/* Top row: Country, Grade, Subject */}
      <div className={layout === 'vertical' ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
        
        {/* 1. الدولة (Country) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <Globe size={14} className="text-blue-600" />
            <span>الدولة</span>
            <span className="text-red-500">*</span>
          </label>
          {!customCountryMode && !isCustomCountry ? (
            <div className="relative">
              <select
                disabled={readOnly}
                value={COUNTRIES.includes(currentCountry) ? currentCountry : 'آخر'}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                disabled={readOnly}
                value={currentCountry}
                onChange={(e) => onChange({ ...metadata, country: e.target.value, grade: currentGrade, subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic })}
                placeholder="اكتب اسم الدولة..."
                className="w-full px-3 py-2 border-2 border-blue-400 bg-blue-50/40 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomCountryMode(false);
                  onChange({ ...metadata, country: DEFAULT_COUNTRY, grade: currentGrade, subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic });
                }}
                className="px-2 py-2 text-[10px] font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors whitespace-nowrap"
                title="الرجوع للقائمة الافتراضية"
              >
                قائمة
              </button>
            </div>
          )}
        </div>

        {/* 2. الصف / المرحلة الدراسية (Grade) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <GraduationCap size={14} className="text-indigo-600" />
            <span>الصف / المرحلة الدراسية</span>
            <span className="text-red-500">*</span>
          </label>
          {!customGradeMode && !isCustomGrade ? (
            <div className="relative">
              <select
                disabled={readOnly}
                value={GRADES.includes(currentGrade) ? currentGrade : 'آخر'}
                onChange={(e) => handleGradeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                disabled={readOnly}
                value={currentGrade}
                onChange={(e) => onChange({ ...metadata, country: currentCountry, grade: e.target.value, subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic })}
                placeholder="اكتب الصف أو التخصص..."
                className="w-full px-3 py-2 border-2 border-indigo-400 bg-indigo-50/40 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomGradeMode(false);
                  onChange({ ...metadata, country: currentCountry, grade: DEFAULT_GRADE, subject: currentSubject, part: currentPart, unit: currentUnit, topic: currentTopic });
                }}
                className="px-2 py-2 text-[10px] font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors whitespace-nowrap"
                title="الرجوع للقائمة الافتراضية"
              >
                قائمة
              </button>
            </div>
          )}
        </div>

        {/* 3. المادة (Subject) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <BookOpen size={14} className="text-emerald-600" />
            <span>المادة</span>
            <span className="text-red-500">*</span>
          </label>
          {!customSubjectMode && !isCustomSubject ? (
            <div className="relative">
              <select
                disabled={readOnly}
                value={SUBJECTS.includes(currentSubject) ? currentSubject : 'آخر'}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-sm"
              >
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                disabled={readOnly}
                value={currentSubject}
                onChange={(e) => onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: e.target.value, part: currentPart, unit: currentUnit, topic: currentTopic })}
                placeholder="اكتب اسم المادة..."
                className="w-full px-3 py-2 border-2 border-emerald-400 bg-emerald-50/40 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomSubjectMode(false);
                  onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: DEFAULT_SUBJECT, part: currentPart, unit: currentUnit, topic: currentTopic });
                }}
                className="px-2 py-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors whitespace-nowrap"
                title="الرجوع للقائمة الافتراضية"
              >
                قائمة
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Part & Unit */}
      <div className={layout === 'vertical' ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
        
        {/* 4. الجزء (Part - Optional) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <Layers size={14} className="text-amber-600" />
            <span>الجزء (اختياري)</span>
          </label>
          {!customPartMode && !isCustomPart ? (
            <div className="relative">
              <select
                disabled={readOnly}
                value={
                  currentPart === '' || currentPart === 'بدون تحديد' 
                    ? 'بدون تحديد' 
                    : PARTS.includes(currentPart) 
                      ? currentPart 
                      : 'آخر'
                }
                onChange={(e) => handlePartChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all shadow-sm"
              >
                {PARTS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                disabled={readOnly}
                value={currentPart}
                onChange={(e) => onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: e.target.value, unit: currentUnit, topic: currentTopic })}
                placeholder="اكتب اسم الجزء (مثال: الجزء الثالث)..."
                className="w-full px-3 py-2 border-2 border-amber-400 bg-amber-50/40 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomPartMode(false);
                  onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: 'الجزء الأول', unit: currentUnit, topic: currentTopic });
                }}
                className="px-2 py-2 text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap"
                title="الرجوع للقائمة"
              >
                قائمة
              </button>
            </div>
          )}
        </div>

        {/* 5. الوحدة (Unit) */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <BookMarked size={14} className="text-purple-600" />
              <span>الوحدة</span>
            </span>
            <button
              type="button"
              onClick={() => setCustomUnitMode(!customUnitMode)}
              className="text-[10px] text-purple-700 hover:underline flex items-center gap-0.5"
            >
              <Edit3 size={11} />
              <span>{customUnitMode ? 'اختيار من القائمة' : 'كتابة وحدة مخصصة'}</span>
            </button>
          </label>
          
          {!customUnitMode && !isCustomUnit ? (
            <div className="relative">
              <select
                disabled={readOnly}
                value={standardUnits.includes(currentUnit) ? currentUnit : (currentUnit ? 'آخر' : '')}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all shadow-sm"
              >
                <option value="">-- اختر الوحدة --</option>
                {standardUnits.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                <option value="آخر">✍️ كتابة وحدة أخرى مخصصة...</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                disabled={readOnly}
                value={currentUnit}
                onChange={(e) => onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: currentPart, unit: e.target.value, topic: currentTopic })}
                placeholder="اكتب اسم الوحدة..."
                className="w-full px-3 py-2 border-2 border-purple-400 bg-purple-50/40 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomUnitMode(false);
                  onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: currentPart, unit: standardUnits[0] || '', topic: currentTopic });
                }}
                className="px-2 py-2 text-[10px] font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors whitespace-nowrap"
                title="الرجوع للقائمة"
              >
                قائمة
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 6. Topic / Description (Optional) */}
      {showTopic && (
        <div className="space-y-1 pt-1">
          <label className="text-xs font-bold text-gray-700">{topicLabel}</label>
          <input
            type="text"
            disabled={readOnly}
            value={currentTopic}
            onChange={(e) => onChange({ ...metadata, country: currentCountry, grade: currentGrade, subject: currentSubject, part: currentPart, unit: currentUnit, topic: e.target.value })}
            placeholder={topicPlaceholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
          />
        </div>
      )}
    </div>
  );
};
