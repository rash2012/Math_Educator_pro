import React from 'react';
import { Printer, X, Info, Palette } from 'lucide-react';
import { type PrintSettingsState, type PrintFont, type CoverStyle } from './exercisePrintTypes';

interface ExercisePrintSettingsProps {
  settings: PrintSettingsState;
  onChange: (updated: Partial<PrintSettingsState>) => void;
  isOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
}

export const ExercisePrintSettingsPanel: React.FC<ExercisePrintSettingsProps> = ({
  settings,
  onChange,
  isOpen,
  onClose,
  onPrint
}) => {
  if (!isOpen) return null;

  return (
    <div className="space-y-4 no-print" dir="rtl">
      {/* Guidance Banner */}
      <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 flex items-start gap-3 text-sky-800 text-xs font-semibold shadow-xs">
        <Info size={18} className="text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold">💡 إرشاد ذكي لتحميل التمارين والحلول كملف PDF احترافي:</span>
          <p>
            اضغط على زر (طباعة / PDF 🖨️) بالأعلى، ثم اختر الوجهة (حفظ بتنسيق PDF أو Save as PDF)، وتأكد من تفعيل خيار <b>(رسومات الخلفية أو Background graphics)</b> في الإعدادات الإضافية للمتصفح لكي تظهر الألوان والخلفيات الأنيقة، وإطار الغلاف، والرسوم الهندسية!
          </p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-md space-y-4 text-right transition-all animate-in fade-in">
        <div className="flex items-center justify-between border-b pb-3 text-indigo-950 font-bold text-sm">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-violet-600" />
            <span>تخصيص إعدادات وإخراج الطباعة (PDF) لكراسة التمارين والمسائل</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Body Font Family */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">نوع خط نص التمارين والحل:</span>
            <select
              value={settings.printFont}
              onChange={(e) => onChange({ printFont: e.target.value as PrintFont })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
            >
              <option value="default">الخط الافتراضي الحالي</option>
              <option value="cairo">خط Cairo العريض والمميز</option>
              <option value="amiri">خط Amiri الأميري للطباعة الكلاسيكية</option>
              <option value="tajawal">خط Tajawal الحديث الواضح</option>
              <option value="almarai">خط Almarai الأنيق والمريح</option>
              <option value="al-mithaq">خط الميثاق العربي Al-Mithaq</option>
              <option value="scheherazade">خط نسخ شهرزاد الأصيل (Scheherazade)</option>
              <option value="aref">خط الرقعة العربي الكلاسيكي (Aref Ruqaa)</option>
              <option value="notonaskh">خط نوتو لنسخ الكتب المدرسية (Noto Naskh)</option>
              <option value="reemkufi">خط الكوفي العربي الفني (Reem Kufi)</option>
            </select>
          </div>

          {/* Body Font Size */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">حجم خط نص التمارين والحل:</span>
            <select
              value={settings.printFontSize}
              onChange={(e) => onChange({ printFontSize: parseInt(e.target.value) })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
            >
              <option value={8}>8pt (صغير ومضغوط)</option>
              <option value={9}>9pt</option>
              <option value={10}>10pt (الافتراضي المتوازن)</option>
              <option value={11}>11pt</option>
              <option value={12}>12pt</option>
              <option value={13}>13pt</option>
              <option value={14}>14pt</option>
              <option value={15}>15pt</option>
              <option value={16}>16pt</option>
              <option value={18}>18pt (كبير وواضح)</option>
            </select>
          </div>

          {/* Heading Font Family */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">نوع خط عناوين التمارين:</span>
            <select
              value={settings.printHeadingFont}
              onChange={(e) => onChange({ printHeadingFont: e.target.value as PrintFont })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
            >
              <option value="default">الافتراضي (مثل النص)</option>
              <option value="cairo">خط Cairo العريض والمميز</option>
              <option value="amiri">خط Amiri الأميري للطباعة الكلاسيكية</option>
              <option value="tajawal">خط Tajawal الحديث الواضح</option>
              <option value="almarai">خط Almarai الأنيق والمريح</option>
              <option value="al-mithaq">خط الميثاق العربي Al-Mithaq</option>
              <option value="scheherazade">خط نسخ شهرزاد الأصيل (Scheherazade)</option>
              <option value="aref">خط الرقعة العربي الكلاسيكي (Aref Ruqaa)</option>
              <option value="notonaskh">خط نوتو لنسخ الكتب المدرسية (Noto Naskh)</option>
              <option value="reemkufi">خط الكوفي العربي الفني (Reem Kufi)</option>
            </select>
          </div>

          {/* Heading Font Size */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">حجم خط عناوين التمارين:</span>
            <select
              value={settings.printHeadingFontSize}
              onChange={(e) => onChange({ printHeadingFontSize: parseInt(e.target.value) })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
            >
              <option value={12}>12pt (الافتراضي)</option>
              <option value={13}>13pt</option>
              <option value={14}>14pt</option>
              <option value={15}>15pt</option>
              <option value={16}>16pt</option>
              <option value={18}>18pt</option>
              <option value={20}>20pt</option>
              <option value={22}>22pt</option>
              <option value={24}>24pt</option>
            </select>
          </div>

          {/* Header Font Size */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">حجم خط شريط الرأس:</span>
            <select
              value={settings.printHeaderFontSize}
              onChange={(e) => onChange({ printHeaderFontSize: parseInt(e.target.value) })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
            >
              <option value={5}>5pt (دقيق ومضغوط)</option>
              <option value={6}>6pt</option>
              <option value={7}>7pt</option>
              <option value={8}>8pt</option>
              <option value={9}>9pt (الافتراضي المتوازن)</option>
            </select>
          </div>

          {/* Header Background Color */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold flex items-center gap-1">
              <Palette size={13} className="text-violet-600" />
              <span>لون خلفية شريط الرأس:</span>
            </span>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={settings.printHeaderBgColor || '#7c3aed'}
                onChange={(e) => onChange({ printHeaderBgColor: e.target.value })}
                className="w-8 h-8 rounded-lg border border-gray-300 p-0.5 cursor-pointer bg-white"
              />
              <select
                value={settings.printHeaderBgColor || '#7c3aed'}
                onChange={(e) => onChange({ printHeaderBgColor: e.target.value })}
                className="flex-1 p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
              >
                <option value="#7c3aed">بنفسجي كلاسيكي (الافتراضي)</option>
                <option value="#4f46e5">نيلي داكن Indigo</option>
                <option value="#0284c7">سماوي Sky Blue</option>
                <option value="#059669">زمردي Emerald</option>
                <option value="#d97706">كهرماني Amber</option>
                <option value="#e11d48">وردي Rose</option>
                <option value="#0f172a">كحلي داكن فاخر Slate</option>
              </select>
            </div>
          </div>

          {/* Footer Font Size */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">حجم خط شريط التذييل:</span>
            <select
              value={settings.printFooterFontSize}
              onChange={(e) => onChange({ printFooterFontSize: parseInt(e.target.value) })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
            >
              <option value={5}>5pt (دقيق ومضغوط)</option>
              <option value={6}>6pt</option>
              <option value={7}>7pt</option>
              <option value={8}>8pt</option>
              <option value={9}>9pt (الافتراضي المتوازن)</option>
            </select>
          </div>

          {/* Watermark controls */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">العلامة المائية للطباعة:</span>
            <div className="flex gap-2 items-center">
              <input
                type="checkbox"
                id="ex-show-watermark-toggle"
                checked={settings.showWatermark}
                onChange={(e) => onChange({ showWatermark: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
              />
              <input
                type="text"
                placeholder="نص العلامة المائية..."
                value={settings.watermarkText}
                onChange={(e) => onChange({ watermarkText: e.target.value })}
                disabled={!settings.showWatermark}
                className="flex-1 p-1.5 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Watermark Opacity */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">شفافية العلامة المائية:</span>
            <select
              value={settings.watermarkOpacity}
              onChange={(e) => onChange({ watermarkOpacity: parseFloat(e.target.value) })}
              disabled={!settings.showWatermark}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60 disabled:opacity-50"
            >
              <option value={0.02}>2% (خفيفة جداً)</option>
              <option value={0.04}>4% (خفيفة)</option>
              <option value={0.08}>8% (افتراضية ممتازة)</option>
              <option value={0.12}>12%</option>
              <option value={0.18}>18% (واضحة)</option>
              <option value={0.25}>25% (غامقة)</option>
            </select>
          </div>

          {/* Cover Theme */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">طراز صفحة الغلاف:</span>
            <select
              value={settings.coverBgStyle}
              onChange={(e) => onChange({ coverBgStyle: e.target.value as CoverStyle })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
            >
              <option value="classic-white">كلاسيكي - أبيض ناصع ⚪</option>
              <option value="gradient-violet-sky">متدرج - بنفسجي وسماوي 🌌</option>
              <option value="gradient-emerald-mint">متدرج - زمردي ونعناعي 🌿</option>
              <option value="gradient-gold-amber">متدرج - ذهبي ومرجاني 🔸</option>
              <option value="gradient-rose-pink">متدرج - وردي مخملي 🌸</option>
              <option value="gradient-dark-slate">متدرج - كحلي داكن فاخر 🌃</option>
            </select>
          </div>

          {/* Include Cover Page Toggle */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">تضمين صفحة الغلاف:</span>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="ex-include-cover-page"
                checked={settings.includeCoverPage}
                onChange={(e) => onChange({ includeCoverPage: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
              />
              <label htmlFor="ex-include-cover-page" className="text-gray-700 font-bold cursor-pointer">
                طباعة صفحة غلاف ملونة للكراسة
              </label>
            </div>
          </div>

          {/* Question Background Color */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold flex items-center gap-1">
              <Palette size={13} className="text-sky-600" />
              <span>لون خلفية مربع نص السؤال:</span>
            </span>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={settings.questionBgColor || '#f0f9ff'}
                onChange={(e) => onChange({ questionBgColor: e.target.value })}
                className="w-8 h-8 rounded-lg border border-gray-300 p-0.5 cursor-pointer bg-white"
              />
              <select
                value={settings.questionBgColor || '#f0f9ff'}
                onChange={(e) => onChange({ questionBgColor: e.target.value })}
                className="flex-1 p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
              >
                <option value="#f0f9ff">سماوي ناعم (الافتراضي)</option>
                <option value="#ffffff">أبيض ناصع</option>
                <option value="#f8fafc">رمادي بارد فاتح</option>
                <option value="#f5f3ff">بنفسجي هادئ</option>
                <option value="#fffbeb">أصفر دافئ خفيف</option>
              </select>
            </div>
          </div>

          {/* Solution Background Color */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold flex items-center gap-1">
              <Palette size={13} className="text-emerald-600" />
              <span>لون خلفية مربع الحل النموذجي:</span>
            </span>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={settings.solutionBgColor || '#f0fdf4'}
                onChange={(e) => onChange({ solutionBgColor: e.target.value })}
                className="w-8 h-8 rounded-lg border border-gray-300 p-0.5 cursor-pointer bg-white"
              />
              <select
                value={settings.solutionBgColor || '#f0fdf4'}
                onChange={(e) => onChange({ solutionBgColor: e.target.value })}
                className="flex-1 p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
              >
                <option value="#f0fdf4">أخضر زمردي ناعم (الافتراضي)</option>
                <option value="#ffffff">أبيض ناصع</option>
                <option value="#f8fafc">رمادي بارد فاتح</option>
                <option value="#f5f3ff">بنفسجي هادئ</option>
                <option value="#fefce8">أصفر ذهبي فاتح</option>
              </select>
            </div>
          </div>

          {/* Header Toggle */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">رأس الصفحات المتكرر:</span>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="ex-print-header-toggle"
                checked={settings.printAllPagesHeader}
                onChange={(e) => onChange({ printAllPagesHeader: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
              />
              <label htmlFor="ex-print-header-toggle" className="text-gray-700 font-bold cursor-pointer">
                تفعيل شريط الرأس في أعلى كل صفحة
              </label>
            </div>
          </div>

          {/* Footer Toggle */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-gray-600 font-bold">تذييل الصفحات وترقيمها:</span>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="ex-print-footer-toggle"
                checked={settings.printAllPagesFooter}
                onChange={(e) => onChange({ printAllPagesFooter: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
              />
              <label htmlFor="ex-print-footer-toggle" className="text-gray-700 font-bold cursor-pointer">
                تفعيل التذييل مع رقم الصفحة
              </label>
            </div>
          </div>

          {/* Header Right Text */}
          <div className="flex flex-col gap-1.5 text-xs md:col-span-2">
            <span className="text-gray-600 font-bold">نص رأس الصفحة (يمين):</span>
            <input
              type="text"
              value={settings.printHeaderRightText}
              onChange={(e) => onChange({ printHeaderRightText: e.target.value })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
              placeholder="مثال: {title}"
            />
          </div>

          {/* Header Left Text */}
          <div className="flex flex-col gap-1.5 text-xs md:col-span-2">
            <span className="text-gray-600 font-bold">نص رأس الصفحة (يسار):</span>
            <input
              type="text"
              value={settings.printHeaderLeftText}
              onChange={(e) => onChange({ printHeaderLeftText: e.target.value })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
              placeholder="مثال: سلسلة التعلم الذكي📚✨"
            />
          </div>

          {/* Footer Text */}
          <div className="flex flex-col gap-1.5 text-xs md:col-span-4">
            <span className="text-gray-600 font-bold">نص التذييل:</span>
            <input
              type="text"
              value={settings.printFooterText}
              onChange={(e) => onChange({ printFooterText: e.target.value })}
              className="p-2 border border-gray-200 rounded-xl hover:border-violet-400 outline-none text-xs font-bold bg-gray-50/60"
              placeholder="مثال: سلسلة التعلم الذكي📚✨ - إعداد المدرس: {teacherName} - جميع الحقوق محفوظة"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <button
            onClick={onPrint}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-gradient-to-l from-violet-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md hover:opacity-95 transition-all cursor-pointer"
          >
            <Printer size={16} />
            <span>بدء الطباعة / تصدير PDF الآن 🖨️</span>
          </button>
        </div>
      </div>
    </div>
  );
};
