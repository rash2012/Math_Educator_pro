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

export function repairArabicMathText(content: string): string {
  if (!content) return content;

  // Pre-normalize all mathematical block/inline delimiters to simple single dollars
  // to avoid unmatched dangling dollars (which scramble/swallow Arabic text)
  let result = content
    .replace(/\$\$/g, '$')
    .replace(/\\\[/g, '$')
    .replace(/\\\]/g, '$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');

  const containsArabic = /[\u0600-\u06FF\u0750-\u077F]/.test(result);
  
  if (containsArabic) {
    // Case 1: Entire string is wrapped in a single $ ... $
    const singleDollarMatch = result.match(/^\$([^$]+)\$$/);
    
    if (singleDollarMatch) {
      const inner = singleDollarMatch[1];
      const shouldSkip = inner.includes('\\begin') || 
                         inner.includes('\\text') || 
                         inner.includes('\\array') || 
                         inner.includes('\\hline') ||
                         inner.includes('\\\\');
      if (!shouldSkip) {
        result = autoWrapMathInArabic(inner);
      }
    } else {
      // Case 2: String is not fully wrapped, but has sub-blocks that might be incorrectly wrapped.
      result = result.replace(/\$([^$]+)\$/g, (match, inner) => {
        const shouldSkip = inner.includes('\\begin') || 
                           inner.includes('\\text') || 
                           inner.includes('\\array') || 
                           inner.includes('\\hline') ||
                           inner.includes('\\\\');
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
    <div className={`math-markdown-content ${className || ''} print:overflow-visible`} dir="rtl">
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
                className="float-left mr-4 sm:mr-6 mb-4 sm:mb-6 p-0 bg-transparent flex flex-col items-center justify-center select-none print:float-left overflow-visible print:break-inside-avoid max-w-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                style={{ width: wStyle, height: hStyle }}
                dangerouslySetInnerHTML={{ __html: processedSvg }}
              />
            );
          } else {
            // No dimensions specified, use responsive layout with fallback
            const responsiveSvg = makeSvgResponsive(part);
            return (
              <div
                key={index}
                className="float-left w-[180px] xs:w-[220px] sm:w-[260px] md:w-[300px] mr-4 sm:mr-6 mb-3 sm:mb-4 bg-transparent flex flex-col items-center justify-center select-none print:float-left print:w-[220px] overflow-hidden [&>svg]:mx-auto [&>svg]:max-h-[220px] [&>svg]:w-full [&>svg]:h-auto print:break-inside-avoid"
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
        let preprocessedContent = repairedContent
          .replace(/\\n(?![a-zA-Z])/g, '\n') // Remove literal \n markers
          .replace(/\n(?!\n)/g, '  \n') // Add two spaces before single newlines to trigger <br> instead of <p>
          .replace(/\\\(/g, '$')
          .replace(/\\\)/g, '$')
          .replace(/\\\[/g, '$')
          .replace(/\\\]/g, '$')
          .replace(/\$\$/g, '$') // Convert all double dollars to single dollar as requested
          // إزالة أي علامات \right\ أو \right مشوهة زائدة تركت خطأ عند نهاية المعادلات
          .replace(/\\right[\\]+\s*(?=[$|\]|)|,]|\s|$)/g, '')
          .replace(/\\right\s*\\(?=[^\w]|$)/g, '')
          .replace(/\\right\)\s*\\right\.?/g, '\\right)')
          .replace(/\\right\]\s*\\right\.?/g, '\\right]')
          .replace(/\\right\\\}\s*\\right\.?/g, '\\right\\}')
          .replace(/\\right\|\s*\\right\.?/g, '\\right|')
          // تطبيع الأشعة بدقة: شعاع حرفين \overrightarrow وشعاع حرف واحد \vec
          .replace(/\\vec\{([A-Za-z]{2,})\}/g, '\\overrightarrow{$1}')
          .replace(/\\overrightarrow\{([a-zA-Z])\}/g, '\\vec{$1}')
          // ضمان وجود مسافة بعد الترقيم ليتعرف عليه الماركدوان كقائمة مع الحفاظ على النوع (نقطة أو قوس)
          .replace(/^(\d+)([.)])(\s*)/gm, (match, num, delimiter, space) => {
            return space ? match : `${num}${delimiter} `;
          });

        // استبدال ***نص*** بـ وسم span مخصص بلون أحمر وإطار أحمر رفيع لتمييز الفقرة بالكامل
        preprocessedContent = preprocessedContent.replace(/\*{3}([\s\S]+?)\*{3}/g, '<span class="markdown-triple-star">$1</span>');

        // استبدال (*#عبارة#*) أو *#عبارة#* بـ وسم span مخصص بلون أزرق وخط غامق
        preprocessedContent = preprocessedContent
          .replace(/\(\*\#([\s\S]+?)\#\*\)/g, '<span class="markdown-blue-bold">$1</span>')
          .replace(/\*\#([\s\S]+?)\#\*/g, '<span class="markdown-blue-bold">$1</span>');

        // استبدال الوسوم المباشرة <law>, <rule>, <red-box>, <red>, <blue> لتوفير أقصى مرونة
        preprocessedContent = preprocessedContent
          .replace(/<law>([\s\S]+?)<\/law>/gi, '<span class="markdown-triple-star">$1</span>')
          .replace(/<rule>([\s\S]+?)<\/rule>/gi, '<span class="markdown-triple-star">$1</span>')
          .replace(/<red-box>([\s\S]+?)<\/red-box>/gi, '<span class="markdown-triple-star">$1</span>')
          .replace(/<red>([\s\S]+?)<\/red>/gi, '<span class="text-red-600 font-bold">$1</span>')
          .replace(/<blue>([\s\S]+?)<\/blue>/gi, '<span class="markdown-blue-bold">$1</span>');

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
            rehypePlugins={[rehypeRaw, rehypeKatex]}
          >
            {preprocessedContent}
          </ReactMarkdown>
        );
      })}
    </div>
  );
});

MathRenderer.displayName = 'MathRenderer';
