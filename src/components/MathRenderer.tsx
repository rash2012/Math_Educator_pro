import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

interface MathRendererProps {
  content: string;
  className?: string;
}

/**
 * 🧹 Clean and collapse consecutive double (or multiple) backslashes in LaTeX equations and text
 * e.g. \\vec -> \vec, \\frac -> \frac, \\lim -> \lim, \\overrightarrow -> \overrightarrow, \\to -> \to, \\( -> \(, \\[ -> \[, \\; -> \;, \\| -> \|
 * CRITICAL: NEVER collapse \\ row breaks in tables/arrays (array, matrix, pmatrix, bmatrix, cases, aligned) or before \hline
 */
export function sanitizeLatexDoubleBackslashes(content: string): string {
  if (!content || typeof content !== 'string') return content || '';
  
  let s = content;

  // 1. Normalize table/array row breaks before \hline (e.g. \\\hline or \\ \hline) to standard LaTeX row break "\\ \\hline"
  s = s.replace(/\\{2,}\s*\\hline/g, '\\\\ \\hline');

  // 2. Collapse double or multiple backslashes ONLY when immediately followed by known LaTeX math commands
  // e.g. \\vec -> \vec, \\frac -> \frac, \\sqrt -> \sqrt, \\lim -> \lim, \\to -> \to, \\pi -> \pi, \\begin -> \begin, \\end -> \end{
  // NEVER collapse \\ followed by numbers, minus signs, or spaces, which are matrix/table row separators
  s = s.replace(
    /\\{2,}(?=(begin|end|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|aligned|array|vec|overrightarrow|overline|underline|frac|sqrt|lim|to|alpha|beta|gamma|theta|lambda|mu|sigma|omega|pi|infty|Delta|cdot|times|pm|le|ge|neq|in|subset|int|ln|log|exp|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|det|dim|ker|deg|max|min|sup|inf|sum|prod|cup|cap|lor|land|forall|exists|equiv|approx|sim|cong|partial|nabla|circ|bullet|angle|triangle|quad|qquad|left|right)\b)/g,
    '\\'
  );

  // 3. Collapse double backslashes before math brackets and delimiters: \\( -> \(, \\[ -> \[, \\{ -> \{, \\} -> \}, \\; -> \;, \\: -> \:, \\! -> \!
  // BUT do not collapse if preceded by an environment or row element
  s = s.replace(/\\{2,}([;:!])/g, '\\$1');

  return s;
}

/**
 * 🎯 Auto-wrap standalone unwrapped LaTeX commands and environments into single dollar delimiters ($...$)
 * Ensures KaTeX properly renders mathematical symbols even if the user or generator omitted dollar signs
 * CRITICAL: NEVER wrap commands or environments that are ALREADY inside existing $ ... $ blocks!
 */
export function autoWrapUnwrappedLatex(text: string): string {
  if (!text) return '';

  // Match existing math blocks: $$...$$ or $...$
  const mathBlockRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
  const parts = text.split(mathBlockRegex);

  return parts.map((part) => {
    // If already inside $...$ or $$...$$, preserve completely as is!
    if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
      return part;
    }

    let nonMath = part;

    // 1. Wrap standalone unwrapped environments like \begin{pmatrix}...\end{pmatrix} in $ ... $
    nonMath = nonMath.replace(
      /(\\begin\{(?:array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|aligned|align|gather|split)\}[\s\S]*?\\end\{(?:array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|aligned|align|gather|split)\})/g,
      (_, env) => ` $${env}$ `
    );

    // 2. Wrap standalone unwrapped LaTeX commands
    nonMath = nonMath.replace(
      /\\(vec|overrightarrow|overline|underline|frac|sqrt|lim|to|alpha|beta|gamma|theta|lambda|mu|sigma|omega|pi|infty|Delta|cdot|times|pm|le|ge|neq|in|subset|int|ln|log|exp|sin|cos|tan)\b(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*(?:_\{[^{}]*\}|_[a-zA-Z0-9]+|\^\{[^{}]*\}|\^[a-zA-Z0-9]+)*/g,
      (match) => `$${match}$`
    );

    return nonMath;
  }).join('');
}

export function repairArabicMathText(content: string): string {
  if (!content) return content;

  // 1. Pre-clean consecutive double backslashes safely without affecting table/array row breaks
  let sanitized = sanitizeLatexDoubleBackslashes(content);

  // 2. Pre-normalize all mathematical block/inline delimiters to simple single dollars
  // to avoid unmatched dangling dollars (which scramble/swallow Arabic text)
  let result = sanitized
    .replace(/\$\$/g, '$')
    .replace(/\\\[/g, '$')
    .replace(/\\\]/g, '$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');

  // 3. Auto-wrap any unwrapped LaTeX commands
  result = autoWrapUnwrappedLatex(result);

  const containsArabic = /[\u0600-\u06FF\u0750-\u077F]/.test(result);
  
  if (containsArabic) {
    // Case 1: Entire string is wrapped in a single $ ... $
    const singleDollarMatch = result.match(/^\$([^$]+)\$$/);
    
    if (singleDollarMatch) {
      const inner = singleDollarMatch[1];
      const shouldSkip = inner.includes('\\begin') || 
                         inner.includes('\\text') || 
                         inner.includes('\\array') || 
                         inner.includes('\\matrix') || 
                         inner.includes('\\cases') || 
                         inner.includes('\\aligned') || 
                         inner.includes('\\hline');
      if (!shouldSkip) {
        result = autoWrapMathInArabic(inner);
      }
    } else {
      // Case 2: String is not fully wrapped, but has sub-blocks that might be incorrectly wrapped.
      result = result.replace(/\$([^$]+)\$/g, (match, inner) => {
        const shouldSkip = inner.includes('\\begin') || 
                           inner.includes('\\text') || 
                           inner.includes('\\array') || 
                           inner.includes('\\matrix') || 
                           inner.includes('\\cases') || 
                           inner.includes('\\aligned') || 
                           inner.includes('\\hline');
        if (shouldSkip) {
          return match;
        }
        if (/[\u0600-\u06FF\u0750-\u077F]/.test(inner)) {
          return autoWrapMathInArabic(inner);
        }
        return match;
      });
    }
  }

  return result;
}

function autoWrapMathInArabic(text: string): string {
  if (!text) return '';
  
  let normalized = text.trim();
  const parts: { text: string; isMath: boolean }[] = [];
  
  let currentToken = '';
  const firstChar = normalized[0] || '';
  let isCurrentArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(firstChar) || firstChar === '،' || firstChar === '؛' || firstChar === '؟';
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const isArabicChar = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(char) || char === '،' || char === '؛' || char === '؟';
    
    if (char === ' ') {
      currentToken += char;
      continue;
    }
    
    if (isArabicChar !== isCurrentArabic) {
      if (currentToken) {
        parts.push({ text: currentToken, isMath: !isCurrentArabic });
      }
      currentToken = char;
      isCurrentArabic = isArabicChar;
    } else {
      currentToken += char;
    }
  }
  
  if (currentToken) {
    parts.push({ text: currentToken, isMath: !isCurrentArabic });
  }
  
  return parts.map((part) => {
    let t = part.text.trim();
    if (!t) return part.text;
    
    if (part.isMath) {
      const hasMathIndicator = /[a-zA-Z\\\^_\-+=\*\/<>≤≥{}]/.test(t) || /[0-9]/.test(t);
      if (hasMathIndicator) {
        t = t.replace(/^\$+|\$+$/g, '').trim();
        return ` $${t}$ `;
      }
    }
    
    return part.text;
  }).join('').replace(/\s+/g, ' ').trim();
}

function makeSvgResponsive(svg: string): string {
  let processed = svg.trim();
  if (!processed.startsWith('<svg')) {
    const match = processed.match(/<svg[\s\S]*<\/svg>/);
    if (match) {
      processed = match[0];
    } else {
      return svg;
    }
  }
  if (!processed.includes('viewBox=') && !processed.includes('viewBox =')) {
    const widthMatch = processed.match(/width="?(\d+(?:\.\d+)?)"?/);
    const heightMatch = processed.match(/height="?(\d+(?:\.\d+)?)"?/);
    if (widthMatch && heightMatch) {
      processed = processed.replace(/<svg\b/, `<svg viewBox="0 0 ${widthMatch[1]} ${heightMatch[1]}"`);
    }
  }
  processed = processed.replace(/width="[^"]+"/, 'width="100%"').replace(/height="[^"]+"/, 'height="100%"');
  return processed;
}

function processEmbeddedSvg(svg: string): { html: string; width: string | null; height: string | null } {
  let processed = svg.trim();
  if (!processed.startsWith('<svg')) {
    const match = processed.match(/<svg[\s\S]*<\/svg>/);
    if (match) {
      processed = match[0];
    } else {
      return { html: svg, width: null, height: null };
    }
  }

  const widthMatch = processed.match(/\bwidth=["']?([^"'\s>]+)["']?/i);
  const heightMatch = processed.match(/\bheight=["']?([^"'\s>]+)["']?/i);
  const styleMatch = processed.match(/\bstyle=["']?([^"'>]+)["']?/i);
  const viewBoxMatch = processed.match(/\bviewBox=["']?([^"'>]+)["']?/i);

  let width: string | null = widthMatch ? widthMatch[1] : null;
  let height: string | null = heightMatch ? heightMatch[1] : null;

  if (styleMatch) {
    const styleStr = styleMatch[1];
    const wStyle = styleStr.match(/width\s*:\s*([^;]+)/i);
    const hStyle = styleStr.match(/height\s*:\s*([^;]+)/i);
    if (wStyle) width = wStyle[1].trim();
    if (hStyle) height = hStyle[1].trim();
  }

  // If user provided viewBox without width/height, derive default dimensions from viewBox
  if (!width && !height && viewBoxMatch) {
    const vbParts = viewBoxMatch[1].trim().split(/[\s,]+/);
    if (vbParts.length === 4) {
      const vbW = parseFloat(vbParts[2]);
      const vbH = parseFloat(vbParts[3]);
      if (!isNaN(vbW) && !isNaN(vbH) && vbW > 0 && vbH > 0) {
        width = `${vbW}px`;
        height = `${vbH}px`;
      }
    }
  }

  if (!processed.includes('viewBox=') && !processed.includes('viewBox =')) {
    if (width && height) {
      const numericWidth = width.replace(/[^\d.]/g, '');
      const numericHeight = height.replace(/[^\d.]/g, '');
      if (numericWidth && numericHeight) {
        processed = processed.replace(/<svg\b/, `<svg viewBox="0 0 ${numericWidth} ${numericHeight}"`);
      }
    }
  }

  // When dimensions are defined, ensure the svg tag inside scales to the container
  if (width || height) {
    processed = processed
      .replace(/\bwidth=["'][^"']+["']/, 'width="100%"')
      .replace(/\bheight=["'][^"']+["']/, 'height="100%"');
  } else {
    // If no dimensions are specified, make it responsive
    processed = processed
      .replace(/\bwidth=["'][^"']+["']/, 'width="100%"')
      .replace(/\bheight=["'][^"']+["']/, 'height="100%"');
  }

  return { html: processed, width, height };
}

export const MathRenderer: React.FC<MathRendererProps> = memo(({ content, className }) => {
  if (!content) return null;

  // تقسيم المحتوى لاستخراج وسوم الـ SVG والاحتفاظ بها تماماً كما هي دون العبث بها
  const svgRegex = /(<\s*svg[\s\S]*?<\/svg\s*>)/gi;
  const parts = content.split(svgRegex);

  return (
    <div className={`math-markdown-content flow-root ${className || ''} print:overflow-visible`} dir="rtl">
      {parts.map((part, index) => {
        // التحقق مما إذا كان الجزء الحالي عبارة عن رسم توضيحي SVG
        if (part.search(/^\s*<\s*svg/i) !== -1) {
          const { html: processedSvg, width: svgWidth, height: svgHeight } = processEmbeddedSvg(part);
          
          if (svgWidth || svgHeight) {
            // User-controlled dimensions from the SVG drawing code
            const formatDimension = (dim: string | null, defaultValue: string) => {
              if (!dim) return defaultValue;
              if (/^\d+(?:\.\d+)?$/.test(dim)) return `${dim}px`;
              return dim;
            };

            const wStyle = formatDimension(svgWidth, 'auto');
            const hStyle = formatDimension(svgHeight, 'auto');

            return (
              <div
                key={index}
                className="float-left mr-5 sm:mr-6 mb-3 sm:mb-4 mt-1 p-0 bg-transparent flex flex-col items-center justify-center select-none print:float-left overflow-visible print:break-inside-avoid max-w-[48%] xs:max-w-[45%] min-w-[160px] [&>svg]:w-full [&>svg]:h-auto [&>svg]:block"
                style={{ width: wStyle, height: 'auto', maxWidth: '48%' }}
                dangerouslySetInnerHTML={{ __html: processedSvg }}
              />
            );
          } else {
            // No dimensions specified, use responsive layout with fallback
            const responsiveSvg = makeSvgResponsive(part);
            return (
              <div
                key={index}
                className="float-left w-[200px] xs:w-[220px] sm:w-[250px] md:w-[280px] mr-5 sm:mr-6 mb-3 sm:mb-4 mt-1 bg-transparent flex flex-col items-center justify-center select-none print:float-left print:w-[220px] overflow-visible max-w-[48%] [&>svg]:mx-auto [&>svg]:max-h-[260px] [&>svg]:w-full [&>svg]:h-auto [&>svg]:block print:break-inside-avoid"
                dangerouslySetInnerHTML={{ __html: responsiveSvg }}
              />
            );
          }
        }

        // إذا كان نصاً عادياً أو كود ماركداون/لاتيكس
        if (!part.trim()) return null;

        // أولاً نقوم بإصلاح النصوص العربية المخلوطة باللاتيكس والمحاطة بـ $ شكل خاطئ
        const repairedContent = repairArabicMathText(part);

        // معالجة مسبقة للسطور والرموز الرياضية والماركداون بالجزء النصي فقط
        let preprocessedContent = sanitizeLatexDoubleBackslashes(repairedContent)
          .replace(/\\n(?![a-zA-Z])/g, '\n') // Remove literal \n markers
          .replace(/\n(?!\n)/g, '  \n') // Add two spaces before single newlines to trigger <br> instead of <p>
          .replace(/\\\(/g, '$')
          .replace(/\\\)/g, '$')
          .replace(/\\\[/g, '$')
          .replace(/\\\]/g, '$')
          .replace(/\$\$/g, '$'); // Convert all double dollars to single dollar as requested

        // تطهير أي شرطات مائلة مزدوجة أو متتالية متبقية قبل أوامر اللاتكس
        let cleanedContent = sanitizeLatexDoubleBackslashes(preprocessedContent)
          // تطبيع الأشعة بدقة: شعاع حرفين \overrightarrow وشعاع حرف واحد \vec
          .replace(/\\vec\{([A-Za-z]{2,})\}/g, '\\overrightarrow{$1}')
          .replace(/\\overrightarrow\{([a-zA-Z])\}/g, '\\vec{$1}')
          // إزالة الأقواس الوهمية غير المكتملة مثل \right. و \left.
          .replace(/\\right\./g, '')
          .replace(/\\left\./g, '');

        preprocessedContent = cleanedContent;

        // تنسيق الطلبات المرقمة كأوسمة دائرية أنيقة مضمنة في السطر (inline) لتلتف حول رسومات الـ SVG بانسيابية
        preprocessedContent = preprocessedContent.replace(
          /^(\s*)(?:([1-9][0-9]?|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫])[\.\-\)\:]|[\(\[]([1-9][0-9]?|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫])[\)\]])\s*/gm,
          (match, space, n1, n2) => {
            const num = n1 || n2;
            return `${space}<span class="inline-flex items-center justify-center w-[22px] h-[22px] min-w-[22px] rounded-full border border-black text-xs font-bold text-black bg-white ml-2 align-middle select-none print:border-black print:text-black">${num}</span> `;
          }
        );
        // تنسيق الطلبات الفرعية a) أو b) كأوسمة فرعية أنيقة مضمنة في السطر
        preprocessedContent = preprocessedContent.replace(
          /^(\s*)(?:([a-zA-Z]|[أ-ي])[\.\-\)\:]|[\(\[]([a-zA-Z]|[أ-ي])[\)\]])\s*/gm,
          (match, space, l1, l2) => {
            const letter = (l1 || l2).toLowerCase();
            return `${space}<span class="inline-flex items-center justify-center w-[20px] h-[20px] min-w-[20px] rounded-full border border-black text-[11px] font-bold text-black bg-white ml-2 align-middle select-none lowercase font-mono print:border-black print:text-black">${letter}</span> `;
          }
        );

        // استبدال ***نص*** بـ وسم span مخصص بلون أحمر وإطار أحمر رفيع لتمييز الفقرة بالكامل
        preprocessedContent = preprocessedContent.replace(/\*{3}([\s\S]+?)\*{3}/g, '<span class="markdown-triple-star">$1</span>');

        // حظر استخدام وسم **عبارة** كعنوان فقرة:
        // تحويل أي سطر مستقل كُتب بصيغة **عنوان** أو **عنوان:** إلى عنوان فرعي أزرق *#...#*
        preprocessedContent = preprocessedContent.replace(
          /^(\s*)\*\*([^*\n]+?)\*\*(\s*[:：]?\s*)$/gm,
          (match, p1, title, p3) => {
            const colon = p3.trim() ? ' :' : '';
            return `${p1}*#${title.trim()}${colon}#*`;
          }
        );

        // استبدال (*#عبارة#*) أو *#عبارة#* بـ وسم span مخصص بلون أزرق وخط غامق
        preprocessedContent = preprocessedContent
          .replace(/\(\*\#([\s\S]+?)\#\*\)/g, '<span class="markdown-blue-bold">$1</span>')
          .replace(/\*\#([\s\S]+?)\#\*/g, '<span class="markdown-blue-bold">$1</span>');

        // استبدال وسوم العناوين الرئيسية (أحمر) والعناوين الفرعية (أزرق) والوسوم المباشرة
        preprocessedContent = preprocessedContent
          // وسوم العناوين الرئيسية باللون الأحمر دائماً (العربية والإنجليزية)
          .replace(/<main-title>([\s\S]+?)<\/main-title>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<main_title>([\s\S]+?)<\/main_title>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<red-title>([\s\S]+?)<\/red-title>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<mainHeading>([\s\S]+?)<\/mainHeading>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<عنوان-رئيسي>([\s\S]+?)<\/عنوان-رئيسي>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<عنوان_رئيسي>([\s\S]+?)<\/عنوان_رئيسي>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<عنوان-رئيس>([\s\S]+?)<\/عنوان-رئيس>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<أحمر>([\s\S]+?)<\/أحمر>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          .replace(/<احمر>([\s\S]+?)<\/احمر>/gi, '<h2 class="main-title-red text-red-600 font-black text-xl mt-5 mb-3 pb-1 border-b border-red-100">$1</h2>')
          
          // وسوم العناوين الفرعية باللون الأزرق دائماً (العربية والإنجليزية)
          .replace(/<sub-title>([\s\S]+?)<\/sub-title>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<sub_title>([\s\S]+?)<\/sub_title>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<subtitle>([\s\S]+?)<\/subtitle>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<blue-title>([\s\S]+?)<\/blue-title>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<subHeading>([\s\S]+?)<\/subHeading>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<عنوان-فرعي>([\s\S]+?)<\/عنوان-فرعي>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<عنوان_فرعي>([\s\S]+?)<\/عنوان_فرعي>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<فرعي>([\s\S]+?)<\/فرعي>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<أزرق>([\s\S]+?)<\/أزرق>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')
          .replace(/<ازرق>([\s\S]+?)<\/ازرق>/gi, '<h3 class="sub-title-blue text-blue-600 font-bold text-lg mt-4 mb-2">$1</h3>')

          // وسوم التظليل الفوسفوري البنفسجي للكلمات والعبارات المفتاحية
          .replace(/<keyword>([\s\S]+?)<\/keyword>/gi, '<strong class="math-highlight-keyword">$1</strong>')
          .replace(/<highlight>([\s\S]+?)<\/highlight>/gi, '<strong class="math-highlight-keyword">$1</strong>')
          .replace(/<تظليل>([\s\S]+?)<\/تظليل>/gi, '<strong class="math-highlight-keyword">$1</strong>')
          .replace(/<مفتاح>([\s\S]+?)<\/مفتاح>/gi, '<strong class="math-highlight-keyword">$1</strong>')
          .replace(/<كلمة-مفتاحية>([\s\S]+?)<\/كلمة-مفتاحية>/gi, '<strong class="math-highlight-keyword">$1</strong>')

          // وسوم القوانين والمربعات الملونة
          .replace(/<law>([\s\S]+?)<\/law>/gi, '<span class="markdown-triple-star">$1</span>')
          .replace(/<rule>([\s\S]+?)<\/rule>/gi, '<span class="markdown-triple-star">$1</span>')
          .replace(/<red-box>([\s\S]+?)<\/red-box>/gi, '<span class="markdown-triple-star">$1</span>')
          .replace(/<red>([\s\S]+?)<\/red>/gi, '<span class="text-red-600 font-bold">$1</span>')
          .replace(/<blue>([\s\S]+?)<\/blue>/gi, '<span class="markdown-blue-bold text-blue-600 font-bold">$1</span>');

        // استبدال الرموز المخصصة بخمس مسافات متتالية (مسافات غير قابلة للتقسيم)
        preprocessedContent = preprocessedContent
          .replace(/\[sp\]/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')
          .replace(/\[space\]/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')
          .replace(/\[فراغ\]/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')
          .replace(/,,/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')
          .replace(/،،/g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');

        return (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false, trust: true }]]}
            components={{
              h1: ({ node, ...props }) => (
                <h1 className="text-2xl font-black text-red-600 mt-6 mb-4 pb-1.5 border-b-2 border-red-200" style={{ color: '#dc2626' }} {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h2 className="text-xl font-black text-red-600 mt-5 mb-3 pb-1 border-b border-red-100" style={{ color: '#dc2626' }} {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 className="text-lg font-black text-blue-600 mt-4 mb-2" style={{ color: '#2563eb' }} {...props} />
              ),
              h4: ({ node, ...props }) => (
                <h4 className="text-base font-bold text-blue-600 mt-3 mb-2" style={{ color: '#2563eb' }} {...props} />
              ),
              h5: ({ node, ...props }) => (
                <h5 className="text-sm font-bold text-blue-600 mt-2 mb-1" style={{ color: '#2563eb' }} {...props} />
              ),
              h6: ({ node, ...props }) => (
                <h6 className="text-xs font-bold text-blue-600 mt-2 mb-1" style={{ color: '#2563eb' }} {...props} />
              ),
              strong: ({ node, ...props }) => (
                <strong
                  className="math-highlight-keyword font-bold text-violet-700 bg-violet-100/70 px-1.5 py-0.5 rounded-md mx-0.5 inline border-0 shadow-none"
                  style={{ backgroundColor: '#ede9fe', color: '#6d28d9', border: 'none', outline: 'none', boxShadow: 'none' }}
                  {...props}
                />
              ),
              em: ({ node, ...props }) => (
                <em className="text-red-600 font-bold not-italic" style={{ color: '#dc2626' }} {...props} />
              ),
            }}
          >
            {preprocessedContent}
          </ReactMarkdown>
        );
      })}
    </div>
  );
});

MathRenderer.displayName = 'MathRenderer';
