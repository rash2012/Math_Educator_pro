import { GoogleGenAI, Type } from "@google/genai";
import { db, type Document, type Exercise, type LessonSection } from "../db";
import { AI_BOOKLET_NOTEBOOK_PROMPT } from "./aiBookletPrompts";
import { convertPdfDataToImages } from "./pdf";
import { globalOrchestrator } from "./multiAgent";
import { generateSvgFromConceptMap, generateSvgFromTree } from "../utils/mindmapSvgGenerator";
import { normalizeConceptMapData, CATEGORY_CONFIG } from "../utils/mindmapParser";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const MODELS_FALLBACK = [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro"
];

// ============================================================================
// 🛠️ Utilities
// ============================================================================
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function repairJsonString(raw: string): string {
  if (!raw) return '';

  // 1. Normalize line endings
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Fix malformed quotes in SVG/XML attributes inside JSON strings
  // e.g. marker-end=\"url(#arrow)\\" /> or stroke=\"#ccc\"
  text = text.replace(/=[\\]*["']([^"'\\<>]*?)[\\]*["'](?=[\s/>])/g, (_match, val) => {
    return `='${val}'`;
  });

  // Also fix escaped quotes with trailing backslashes like `\"url(#arrow)\\"`
  text = text.replace(/\\+"([^"]*?)\\+"/g, `'$1'`);

  // 3. Character-by-character scanner for JSON string vs structure
  let out = '';
  let inString = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
        out += ch;
      } else {
        out += ch;
      }
    } else {
      // Inside a string
      if (ch === '\\') {
        const next = i + 1 < len ? text[i + 1] : '';
        const next2 = i + 2 < len ? text[i + 2] : '';
        const next3 = i + 3 < len ? text[i + 3] : '';
        const next4 = i + 4 < len ? text[i + 4] : '';
        const next5 = i + 5 < len ? text[i + 5] : '';

        if (next === '"') {
          // Escaped quote
          out += '\\"';
          i++;
        } else if (next === '\\') {
          // Escaped backslash
          out += '\\\\';
          i++;
        } else if (next === '/' || next === 'b' || next === 'f' || next === 'n' || next === 'r' || next === 't') {
          // Check if this is a LaTeX command starting with b/f/n/r/t
          const wordMatch = text.substring(i + 1).match(/^[a-zA-Z]+/);
          const word = wordMatch ? wordMatch[0] : '';
          
          const latexKeywords = new Set([
            'frac', 'forall', 'flat', 'frown',
            'text', 'tan', 'times', 'to', 'theta', 'tau', 'tilde', 'top', 'triangle', 'tanh',
            'begin', 'mathbb', 'mathbf', 'beta', 'bullet', 'bot', 'bmod', 'big', 'Big', 'Bigg', 'binom',
            'neq', 'nabla', 'notin', 'not', 'nu', 'natural', 'ne', 'ni', 'normalsize',
            'right', 'rho', 'rangle', 'Re', 'rfloor', 'rceil', 'sqrt', 'cos', 'sin', 'vec', 'alpha'
          ]);

          if (word && (latexKeywords.has(word) || word.length > 2)) {
            // It's a LaTeX command like \frac, \text, \begin, \mathbb, etc.
            out += '\\\\';
          } else if (next === 'n') {
            out += '\\n';
            i++;
          } else if (next === 'r') {
            out += '\\r';
            i++;
          } else if (next === 't') {
            out += '\\t';
            i++;
          } else {
            out += '\\\\';
          }
        } else if (next === 'u') {
          // Check if it's a valid 4-hex digit unicode escape \uXXXX
          const isHex = (c: string) => /[0-9a-fA-F]/.test(c);
          if (isHex(next2) && isHex(next3) && isHex(next4) && isHex(next5)) {
            out += '\\u' + next2 + next3 + next4 + next5;
            i += 5;
          } else {
            // e.g. \vec{u} or \unit or \underbrace
            out += '\\\\';
          }
        } else {
          // Any other character after backslash (e.g. \alpha, \sqrt, \cos, \pi, etc.)
          out += '\\\\';
        }
      } else if (ch === '"') {
        inString = false;
        out += ch;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\t') {
        out += '\\t';
      } else if (ch.charCodeAt(0) < 32) {
        out += ' ';
      } else {
        out += ch;
      }
    }
  }

  if (inString) {
    out += '"';
  }

  // Remove trailing commas before } or ]
  out = out.replace(/,\s*([}\]])/g, '$1');

  return out;
}

function parseLooseJson(text: string): any {
  const items: any[] = [];
  let depth = 0;
  let startIdx = -1;
  let inStr = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;

    if (ch === '{') {
      if (depth === 0) {
        startIdx = i;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        const block = text.substring(startIdx, i + 1);
        try {
          const repairedBlock = repairJsonString(block);
          const obj = JSON.parse(repairedBlock);
          items.push(obj);
        } catch (_) {
          // Try manual key extraction if single block failed
          try {
            const labelMatch = block.match(/"label"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
            const mainTextMatch = block.match(/"mainText"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
            if (labelMatch || mainTextMatch) {
              items.push({
                label: labelMatch ? labelMatch[1] : 'تمرين',
                mainText: mainTextMatch ? mainTextMatch[1] : '',
                svgCode: '',
                subQuestions: []
              });
            }
          } catch (__) {}
        }
        startIdx = -1;
      }
    }
  }

  if (items.length > 0) {
    return items;
  }
  return null;
}

export function cleanJson(text: string): any {
  if (!text || typeof text !== 'string') return [];

  // Protect LaTeX commands that start with valid JSON escape characters (r, n, t, b, f)
  // This prevents JSON.parse from silently evaluating "\right" as a carriage return + "ight".
  let safeText = text.replace(
    /(?<!\\)\\(right|left|rho|rangle|rfloor|rceil|nabla|natural|ne|neq|ni|normalsize|not|notin|nu|tan|tanh|tau|text|theta|tilde|times|to|top|triangle|begin|beta|big|Big|Bigg|binom|bmod|bot|bullet|flat|forall|frac|frown)\b/g,
    '\\\\$1'
  );

  try {
    // 1. Try direct parse
    return JSON.parse(safeText);
  } catch (e) {
    // 2. Try to extract JSON from markdown code blocks
    let cleaned = safeText;
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      cleaned = match[1].trim();
    } else {
      cleaned = cleaned
        .replace(/```(?:json)?/g, '')
        .replace(/```/g, '')
        .trim();
    }

    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      // 3. Try finding boundaries
      const jsonStart = cleaned.indexOf('[');
      const jsonStartObj = cleaned.indexOf('{');
      const start = (jsonStart !== -1 && (jsonStartObj === -1 || jsonStart < jsonStartObj)) ? jsonStart : jsonStartObj;
      
      let boundaryCleaned = cleaned;
      if (start !== -1) {
        const lastEnd = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
        if (lastEnd > start) {
          boundaryCleaned = cleaned.substring(start, lastEnd + 1);
        }
      }

      try {
        return JSON.parse(boundaryCleaned);
      } catch (e3) {
        // 4. Advanced JSON string repair for LaTeX and SVG
        try {
          const repaired = repairJsonString(boundaryCleaned);
          return JSON.parse(repaired);
        } catch (repairError) {
          // 5. Loose tolerant parser fallback
          const loose = parseLooseJson(boundaryCleaned);
          if (loose) {
            console.warn("[AI] Parsed JSON via loose tolerant fallback parser successfully.");
            return loose;
          }

          console.error("Failed to parse JSON even after cleaning:", boundaryCleaned);
          throw repairError;
        }
      }
    }
  }
}

// ============================================================================
// 🌟 Model Fallback Engine
// ============================================================================
export async function generateWithFallback(models: string[], payload: any, retryCount = 0): Promise<any> {
  let lastError: any;
  
  for (const modelName of models) {
    try {
      console.log(`[AI] Attempting request with model: ${modelName}... (Attempt ${retryCount + 1})`);
      const currentPayload = { ...payload, model: modelName };
      
      const response = await ai.models.generateContent(currentPayload);
      console.log(`[AI] Success with model: ${modelName} ✅`);
      return response;
      
    } catch (error: any) {
      lastError = error;
      const status = error?.status || (error as any)?.response?.status;
      
      // إذا كان الخطأ هو "تجاوز الحصة" (429) أو خطأ خادم (500/503)
      if ((status === 429 || status === 500 || status === 503) && retryCount < 3) {
        const waitTime = Math.pow(2, retryCount) * 5000; // انتظار تصاعدي: 5ث، 10ث، 20ث
        console.warn(`[AI] Rate limit or Server error. Waiting ${waitTime/1000}s before retry... ⏳`);
        await delay(waitTime);
        return generateWithFallback(models, payload, retryCount + 1);
      }

      console.warn(`[AI] Model ${modelName} failed ❌ Error: ${status || error?.message}`);
      await delay(1000); 
    }
  }
  
  console.error("[AI] All fallback models failed! 🚨");
  throw lastError;
}

// ============================================================================
// 📝 Prompts
// ============================================================================

const EXTRACTION_PROMPT = `
You are an expert educator and OCR specialist.
Your task is to extract all math/educational exercises from the provided images accurately.

STRICT CONSTRAINTS & RULES (CRITICAL):
1. Original Numbering: You MUST preserve the original numbering and titles of the questions exactly as they appear in the source (e.g., "السؤال 1", "التمرين الثالث").
2. Tables & Format: You MUST format any tables (including variation tables / جدول التغيرات) using LaTeX table environments strictly using \begin{array}. 
   - Ensure the entire table is wrapped in a single '$'. NEVER use '$$' for display math or tables.
   - IMPORTANT: Use EXACT row terminators (\\\\) at the end of every row before \hline or the next row.
   - For variation tables, use proper vertical lines (e.g., {|c|cccc|}) and consistent cell spacing. Use more columns (&) for spacing instead of multiple \quad commands for better compatibility.
   - DO NOT use Markdown table syntax and DO NOT use \begin{tabular}.
3. Terminology: Absolute ban on the word "دالة" (and its derivatives). You MUST strictly replace it with "تابع" (and its derivatives).
4. Strict Math Formatting & Vectors: EVERY SINGLE mathematical variable, equation, or number MUST be wrapped in a single '$' symbol (e.g. $x$ or $f(x)=y$). NEVER output double dollar '$$' markers, as they break the RTL Arabic text layout and cause serious layout defects.
   - **Vector Formatting Rules (CRITICAL)**: When formatting vectors in LaTeX, you MUST strictly differentiate between:
     * A vector with a beginning and an end (two letters): write it in the form '\\overrightarrow{AB}' (e.g., $\\overrightarrow{AB}$).
     * A vector represented by a single letter: write it in the form '\\vec{u}' (e.g., $\\vec{u}$).
5. Graphic SVGs: If an exercise contains a diagram, geometric shape, or graph, or if a "Variation Table" (جدول التغيرات) is present, you MUST generate exact, high-fidelity SVG code that visually replicates it. Use the "svgCode" field for the main exercise's diagram, and "questionSvgCode" for diagrams belonging to specific sub-questions. For Variation Tables, ensure the SVG is clean and includes all domain values, derivative signs, and variation arrows. Leave empty "" ONLY if no such image or table exists.
6. Language: Use professional, high-quality educational Arabic.
7. Do NOT solve anything in this phase. Just extract and format.
8. Array Formatting: When using \begin{array}, ensure each cell contains its content and uses & as separator. Rows MUST end with \\\\ followed by \hline if needed.

Return the result as a STRICT JSON array of objects, where each object represents an exercise and has:
- "mainText": The introductory text or title of the exercise.
- "svgCode": SVG code for the main exercise (or empty string "").
- "subQuestions": An array of objects, each with "id" (the label), "text" (the content), "order" (integer index), and "questionSvgCode" (SVG code or empty string "").

CRITICAL: Ensure all backslashes in LaTeX are properly escaped (e.g., use \\\\ instead of \\). Do NOT include any text outside the JSON array.
`;

const LESSON_EXTRACTION_PROMPT = `
You are an expert educator.
Your task is to extract the content of a lesson from the provided images, breaking it down into highly granular, logical sections (paragraphs).

STRICT CONSTRAINTS:
1. Granularity (CRITICAL): Break the lesson down into many small, distinct sections. NEVER combine different concepts, theorems, examples, or remarks into a single block. Each Definition, Theorem, Example, Remark, or logical paragraph MUST be its own separate object in the array.
2. Section Title: For each section, extract the original title. Categorize if no explicit title exists (تعريف - مبرهنة - نتيجة - ملاحظة - مثال - فقرة).
3. Terminology: Replace "دالة" with "تابع".
4. Tables: You MUST format any tables (including variation tables) using LaTeX table environments strictly using \begin{array}. 
   - Wrap the entire table in a single '$' symbol. NEVER use '$$'.
   - Ensure every row ends with \\\\.
   - Use proper alignment strings (e.g., {|c|ccc|}).
   - DO NOT use Markdown table syntax and DO NOT use \begin{tabular}.
5. Strict Math Formatting & Vectors: All math MUST be in LaTeX with single '$' delimiters only. Never use '$$' delimiters under any circumstances.
   - **Vector Formatting Rules (CRITICAL)**: When formatting vectors in LaTeX, you MUST strictly differentiate between:
     * A vector with a beginning and an end (two letters): write it in the form '\\overrightarrow{AB}' (e.g., $\\overrightarrow{AB}$).
     * A vector represented by a single letter: write it in the form '\\vec{u}' (e.g., $\\vec{u}$).
6. Language: Professional educational Arabic.
7. Graphic SVGs: If a section contains a diagram, shape, or graph, or a "Variation Table" (جدول التغيرات), you MUST generate exact, high-fidelity SVG code. 
   - IMPORTANT: Labels and text inside SVGs must be VERY LARGE (font-size 24px+ for a 400x400 area), solid BLACK (fill="#000000"), and BOLD for maximum clarity.
   - INLINE STYLES ONLY: Do NOT use <style> blocks. Use inline attributes (font-size, fill, stroke, font-weight) directly on elements to avoid CSS conflicts.
   - NO SHADOWS/HALOS: Absolutely no filters, drop shadows, or white outlines/strokes around text.
   - Ensure diagrams are balanced and labels don't overlap with lines.
   - Use distinct professional colors for geometry, strokes, and clean representations. If no image or table is present, leave svgCode empty "".

Return a STRICT JSON array of objects:
- "title": The title of the section (original or categorized).
- "content": The text content of the section.
- "svgCode": The generated SVG code or "".
- "order": Integer index.

CRITICAL: Ensure all backslashes in LaTeX are properly escaped. Do NOT include any text outside the JSON array.
`;

const TEST_GENERATION_PROMPT = `
You are an expert mathematical educational consultant and test setter for the Syrian/Arab math curriculum.
Your task is to generate a comprehensive, professional math test based on the provided PDF reference materials, adhering strictly to the user's settings.

CRITICAL INSTRUCTIONS:
1. Anti-Duplication: You will be provided with past questions. STRICTLY DO NOT REPEAT THEM. If a question exists in the past questions list, discarding it and re-generating is a MUST.
2. Strict Reference Adherence (MANDATORY): You MUST NOT use ANY mathematical notations, symbols, terms, or functions that are not explicitly present in the provided PDF reference. For example, do NOT use "arcsin", cross products, or terms like "لاحقة" unless they appear in the PDF. Stick 100% to the curriculum's terminology.
2.b EXTREME STRICTNESS: You MUST NOT introduce mathematical concepts outside the scope of the references. For example, DO NOT generate second-order differential equations (like y'' - 2y' + 5y = 2e^x) or matrices if the provided reference does not cover them. Do not hallucinate external curriculum content.
3. Generative Creation: Produce tests that emulate the style and context of the PDF references. At least 60% of the questions MUST be synthetically generated (new numbers, new parameters, new functions) testing the same concepts, NOT direct copy-paste from the references.
4. Advanced Settings, Difficulty, & Relative Weight: Follow the requested difficulty tightly. If "Advanced Settings" demand mapping specific units to specific questions or combining them, OBEDIENCE IS MANDATORY. However, if testing multiple units without specific assignments, you MUST respect the relative weight (الوزن النسبي) of each unit based on its size and number of concepts in the reference. Larger/denser units get proportionally more questions.
5. Strict Sequential Generation & Test Structure (MANDATORY EXACT NUMBERS):
   A) "mcq" -> Title: "أولاً: اختر الإجابة الصحيحة:" -> EXACTLY 10 questions. Each with EXACTLY 4 options (focusing on common errors/traps), 1 correct option. 
   - CRITICAL: The correct option index MUST be RANDOMLY distributed across all indices (0, 1, 2, 3). 
   - Ensure that NOT all questions have the same correct index (e.g., don't make them all 'A'). 
   - Statistically, ensure that each index (0=A, 1=B, 2=C, 3=D) appears approximately 2-3 times across the 10 questions. Index 3 (D) MUST be used.
   B) "questions" -> Title: "ثانياً: حل الأسئلة الآتية:" -> EXACTLY 3 questions. Each MUST have AT LEAST 2 sub-questions. Direct applications, slightly complex if advanced settings demand.
   C) "exercises" -> Title: "ثالثاً: حل التمارين الآتية:" -> EXACTLY 3 exercises. Each MUST have AT LEAST 3 sub-questions. Harder than the previous section.
   D) "problems" -> Title: "رابعاً: حل المسألتين الآتيتين:" -> EXACTLY 2 problems. Each MUST have AT LEAST 5 sub-questions. Highly compound problems, combining concepts across units.
6. Estimated Time: Provide an estimated time in minutes (e.g., 180) for an 18-year-old student to accurately solve the test.
7. Mathematical Formatting: EVERY mathematical variable, equation, or number MUST be wrapped in a single '$' symbol. NEVER use double dollar '$$' markers. ALWAYS use proper LaTeX conventions. 
   - CRITICAL RULE FOR ARABIC TEXT & LATEX DELIMITERS ($):
     * Do NOT wrap ordinary Arabic words, sentence fragments, or instructions inside math delimiters '$ ... $'.
     * ONLY wrap the actual mathematical symbols, variables, formulas, equations, or numbers themselves in '$'.
     * For example, write: "مستقيم يمر بالنقطة $A(2i)$ ويميل بزاوية $\frac{\pi}{4}$"
     * NEVER write: "$مستقيم يمر بالنقطة A(2i) ويميل بزاوية \frac{\pi}{4}$"
     * Ensure that Arabic linking text/conjunctions (like 'أو', 'فإن', 'إذاً', 'حيث', 'يمر بـ') are strictly outside the '$' signs.
   - **Vector Formatting Rules (CRITICAL)**: When formatting vectors in LaTeX, you MUST strictly differentiate between:
     * A vector with a beginning and an end (two letters): write it in the form '\\overrightarrow{AB}' (e.g., $\\overrightarrow{AB}$).
     * A vector represented by a single letter: write it in the form '\\vec{u}' (e.g., $\\vec{u}$).
   - Use \\\\ instead of \\ for escaping inside JSON.
   - For variation tables (جدول تغيرات), strictly use high-fidelity SVG code.
8. Solutions: You MUST provide a detailed, step-by-step solution for EACH question. NEVER output a question without its complete, well-explained solution. 
   - CIRCLED NUMBERS: In the "solution" field, you MUST number the steps or sub-question answers using circled numbers like ①, ②, ③, ④, ⑤. Do NOT write "الطلب الأول" or "1-" etc. Just use circled numbers for a professional look.
   - GRAPHIC SOLUTIONS: If a question asks to "Draw" (ارسم) a function graph or geometric shape, you MUST generate the high-fidelity SVG code for it and place it in "solutionSvgCode".
   - TABLE SOLUTIONS: For "Variation Tables" (جدول التغيرات), monotonicity, or relative position, strictly use LaTeX (array environment) within the "solution" text field. DO NOT use SVG for these unless explicitly requested by the user's advanced settings to be a diagram.
9. Graphic SVGs: Provide high-fidelity SVG code for questions requiring a graph or shape in "svgCode" (if part of the question prompt) OR in "solutionSvgCode" (if it is the DRAWN answer to the question).
10. Tone: Professional educational Arabic. Do NOT use copy-paste; innovate the questions based on deep understanding.
11. CRITICAL JSON RULE: NO LITERAL NEWLINES IN STRINGS. You MUST use \\\\n for line breaks inside strings. Literal newline characters inside quotes will break JSON parsing.

Output Format: A STRICT JSON object representing the test:
{
  "title": "عنوان الاختبار",
  "estimatedTimeMinutes": 180,
  "sections": [
    {
      "sectionType": "mcq",
      "title": "أولاً: اختر الإجابة الصحيحة لكل مما يأتي:",
      "questions": [
        { "text": "نص السؤال المتعدد الخيارات", "options": ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"], "correctOptionIndex": 0, "solution": "الشرح الموجز لسبب اختيار الإجابة", "svgCode": "" }
      ]
    },
    {
      "sectionType": "questions",
      "title": "ثانياً: حل الأسئلة الآتية:",
      "questions": [
        { "text": "نص السؤال العام", "subQuestions": ["① الطلب الأول", "② الطلب الثاني"], "solution": "① شرح الحل الأول... \\\\n ② شرح الحل الثاني...", "svgCode": "", "solutionSvgCode": "" }
      ]
    },
    {
      "sectionType": "exercises",
      "title": "ثالثاً: حل التمارين الآتية:",
      "questions": [
        { "text": "نص التمرين", "subQuestions": ["① الطلب الأول", "② الطلب الثاني", "③ الطلب الثالث"], "solution": "① الحل الأول... \\\\n ② الحل الثاني... \\\\n ③ الحل الثالث...", "svgCode": "", "solutionSvgCode": "" }
      ]
    },
    {
      "sectionType": "problems",
      "title": "رابعاً: حل المسألتين الآتيتين:",
      "questions": [
        { "text": "نص المسألة", "subQuestions": ["① الطلب الأول", "② الطلب الثاني", "③ الطلب الثالث", "④ الطلب الرابع", "⑤ الطلب الخامس"], "solution": "① الحل... \\\\n ② الحل... \\\\n ③ الحل... \\\\n ④ الحل... \\\\n ⑤ الحل...", "svgCode": "", "solutionSvgCode": "" }
      ]
    }
  ]
}

CRITICAL: Return ONLY valid JSON. Ensure all LaTeX backslashes are escaped (e.g., \\\\frac).
`;

export async function generateTest(
  pdfContent: string,
  config: { grade: string, subject: string, difficulty: string, scope: string, advancedSettings?: string, part?: string, unit?: string },
  pastQuestions: string[]
): Promise<any> {
  const prompt = `
${TEST_GENERATION_PROMPT}

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}
الجزء: ${config.part || 'غير محدد'}
الوحدة: ${config.unit || 'غير محدد'}
نطاق المحتوى المحلل (المراجع): ${config.scope}
مستوى الصعوبة: ${config.difficulty}
إعدادات متقدمة المخصصة: ${config.advancedSettings || 'لا توجد'}

PAST QUESTIONS TO AVOID (Anti-Duplication list):
${pastQuestions.length > 0 ? pastQuestions.join('\n---\n') : 'لا توجد اختبارات سابقة للتحقق منها'}

REFERENCE PDF CONTENT:
${pdfContent.substring(0, 80000)} // Limiting size to prevent exceeding token limits
`;

  console.log("Generating Test...");
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.3, // Lowered for better adherence
      responseMimeType: "application/json"
    }
  });

  const text = response.text;
  return cleanJson(text);
}

export async function generateAlternativeQuestion(
  pdfContent: string,
  sectionType: string,
  config: { grade: string, subject: string, difficulty: string, unit?: string },
  pastQuestions: string[]
): Promise<any> {
  const prompt = `
You are an expert mathematical educational consultant for the Syrian/Arab curriculum.
Your task is to generate a SINGLE alternative question for a math test section, based strictly on the provided PDF reference.

CRITICAL INSTRUCTIONS:
1. Strict Reference Adherence: Use ONLY terminology, notation, and styles present in the provided PDF. No external symbols (like arcsin) or terms (like 'لاحقة') unless present.
2. EXTREME STRICTNESS: You MUST NOT introduce mathematical concepts outside the scope of the references. For example, DO NOT generate second-order differential equations (like y'' - 2y' + 5y = 2e^x) or matrices if the provided reference does not cover them. Do not hallucinate external curriculum content.
3. Generative Rule: Ensure this question is newly generated with new parameters, not a copy-paste.
3. Anti-Duplication: Review the provided past questions and generated questions so far, and ensure this new question is fundamentally different.
4. Mathematical Formatting: Wrap all math ONLY in single '$' tokens (e.g. $f(x)=y$) using LaTeX. NEVER use '$$'.
5. Complete Replacement & Detailed Solution: Generate the FULL completely new question (with all its sub-questions or options) AND provide a detailed, step-by-step mathematical solution (حل تفصيلي) for it.
    - NUMBERING: In the "solution" text, always use circled numbers like ①, ②, ③, ④, ⑤ to label solutions to sub-questions.
    - MCQ Balance: If the alternative is an MCQ, ensure the correct option is placed randomly (choose between indices 0, 1, 2, 3).
6. Graphic SVGs: Provide SVG code in "svgCode" if it's the question prompt, or in "solutionSvgCode" if it's part of the answer (like a graph or variation table).
7. CRITICAL JSON RULE: NO LITERAL NEWLINES IN STRINGS. You MUST use \\\\n for line breaks inside strings. Literal newline characters inside quotes will break JSON parsing.

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}
مستوى الصعوبة: ${config.difficulty}
الوحدة المطلوبة: ${config.unit || 'استنتج من المراجع المرفقة'}
نوع القسم (يحدد صيغة السؤال المطلوب): ${sectionType}
- mcq: سؤال اختيار من متعدد واحد بـ 4 خيارات وإجابة صحيحة واحدة.
- questions: سؤال مقالي مع طلبين على الأقل.
- exercises: تمرين مع 3 طلبات على الأقل.
- problems: مسألة مع 5 طلبات على الأقل.

PAST QUESTIONS TO AVOID:
${pastQuestions.length > 0 ? pastQuestions.join('\\n---\\n') : 'لا توجد'}

REFERENCE PDF CONTENT:
${pdfContent.substring(0, 80000)}

OUTPUT FORMAT: Strict JSON based on the sectionType requested.
If \`mcq\`:
{ "text": "...", "options": ["...", "...", "...", "..."], "correctOptionIndex": 0, "solution": "...", "svgCode": "" }
Otherwise (\`questions\`, \`exercises\`, \`problems\`):
{ "text": "...", "subQuestions": ["...", "..."], "solution": "...", "svgCode": "" }

CRITICAL: Return ONLY valid JSON.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.8,
      responseMimeType: "application/json"
    }
  });

  return cleanJson(response.text);
}

const SECTION_ANALYSIS_PROMPT = `
You are an expert educational consultant specializing in the Syrian/Arab math curriculum.
Analyze the provided lesson section and generate context-specific, concise educational additions.

GUIDELINES BASED ON SECTION TYPE (CRITICAL):
1. For "تعريف" (Definition): Provide "الربط بالواقع" (Real-world link) and "تنبيه" (Common confusion).
2. For "مبرهنة/نظرية" (Theorem): Provide "المنطق خلفها" (Intuition) and "مفتاح البرهان" (Proof key).
3. For "نتيجة" (Result): Provide "قاعدة ذهبية" (Short rule) and "متى نستخدمها" (Usage).
4. For "مثال", "تمرين", "تدرب", "سؤال", or "تكريسا للفهم":
   - DO NOT provide "rephrasedContent".
   - DO NOT provide "تحقق من صحة الحل".
   - MUST provide "استراتيجية الحل" (Solving strategy).
   - MUST provide "الحل التفصيلي" (Detailed solution) - ensure it's not a verbatim copy of the original if the original is already a solved example.
   - MUST provide "طريقة ثانية للحل" (Alternative solution) if a valid one exists.
5. For "ملاحظة" (Note): Provide "فخ امتحاني" (Exam trap) and "أهمية الملاحظة" (Importance).
6. For others: Provide "خلاصة مركزة" (Concise summary).

STRICT CONSTRAINTS:
1. Be very CONCISE and direct. Use bullet points.
2. Terminology: Use "تابع" instead of "دالة".
3. Math: Use LaTeX with single '$' delimiters only (never use '$$').
4. Language: Professional educational Arabic.
5. NO SVGs: Do NOT generate any SVG code in this analysis.

Return a STRICT JSON object:
{
  "additions": [
    { "label": "العنوان الفرعي (مثلاً: استراتيجية الحل)", "content": "المحتوى المختصر هنا..." },
    ...
  ],
  "rephrasedContent": "A more professional/clearer version of the original text (optional, leave empty for examples/exercises)"
}
`;

const SOLVING_PROMPT = `
You are an expert mathematics educator.
Your task is to solve the provided math exercise step-by-step.

STRICT CONSTRAINTS & RULES (CRITICAL):
1. Interleaved Solutions: You MUST provide a detailed, step-by-step mathematical solution for EACH sub-question separately.
2. Step-by-Step Formatting: You MUST place each logical step of the solution on a new line. YOU MUST use a double newline (\\n\\n) between every single line of the solution to ensure a clear blank line appears between steps for maximum readability.
3. Terminology: Absolute ban on the word "دالة". Strictly use "تابع".
4. Strict Math Formatting & Vectors: EVERY SINGLE mathematical variable, equation, or number MUST be wrapped in a single '$' symbol. NEVER use '$$' delimiters.
   - CRITICAL RULE FOR ARABIC TEXT & LATEX DELIMITERS ($):
     * Do NOT wrap ordinary Arabic words, sentence fragments, or instructions inside math delimiters '$ ... $'.
     * ONLY wrap the actual mathematical symbols, variables, formulas, equations, or numbers themselves in '$'.
     * For example, write: "مستقيم يمر بالنقطة $A(2i)$ ويميل بزاوية $\frac{\pi}{4}$"
     * NEVER write: "$مستقيم يمر بالنقطة A(2i) ويميل بزاوية \frac{\pi}{4}$"
     * Ensure that Arabic linking text/conjunctions (like 'أو', 'فإن', 'إذاً', 'حيث', 'يمر بـ') are strictly outside the '$' signs.
   - **Vector Formatting Rules (CRITICAL)**: When formatting vectors in LaTeX, you MUST strictly differentiate between:
     * A vector with a beginning and an end (two letters): write it in the form '\\overrightarrow{AB}' (e.g., $\\overrightarrow{AB}$).
     * A vector represented by a single letter: write it in the form '\\vec{u}' (e.g., $\\vec{u}$).
   - **الترميز البصري الخاص لتنسيق العناوين والعبارات والقوانين (حاسم بصرامّة بصرية)**:
     * استخدم النجمة المفردة لكتابة عبارة باللون الأحمر: \`*عبارة حمراء*\`.
     * استخدم الرمز المزدوج للنجمة والهاش لكتابة عبارة باللون الأزرق: \`*#عبارة زرقاء#*\`.
     * استخدم النجمتين المزدوجتين لكتابة عبارة بخط غامق ومحاطة بظل بنفسجي خفيف للعبارات المهمة والمفاهيم الكبرى: \`**عبارة هامة بظل بنفسجي**\`.
     * استخدم الثلاث نجمات لكتابة الدساتير، القوانين والمبرهنات الرياضية الهامة لتظهر بخلفية حمراء ناعمة ومحاطة بإطار مستطيل حدوده حمراء قاتمة: \`***قانون أو دستور رياضي***\` (تنبيه حاسم جداً: في حال كانت العبارة هي رموز أو معادلات رياضية بصيغة LaTeX، يجب كتابة العبارة ضمن إشارتي دولار \$ داخل النجمات الثلاث، مثلاً: \`***$\overrightarrow{AB}=2\overrightarrow{CD}$***\`. يرجى الانتباه بأنه ليس بالضرورة كل علاقة يتم استنتاجها توضع هكذا، بل فقط القوانين والدساتير والمبرهنات الأساسية والخاصة بشرح الدرس).
     * وظّف هذه الأنماط البصرية الأربعة بكثافة وذكاء في العناوين، العناوين الفرعية، التنبيهات، القوانين والملاحظات لتبدو النوطة في غاية الأناقة والجاذبية البصرية والتنظيم العالي!
5. Dynamic SVG/LaTeX Generation: 
   - If the task is to DRAW a function graph (ارسم الخط البياني) or a geometric shape, YOU MUST generate a high-fidelity SVG for it and place it in "solutionSvgCode".
   - If the task is to create a Variation Table (جدول التغيرات), study monotonicity (الاطراد), or relative position (الوضع النسبي), you MUST use LaTeX (array environment) inside the "solution" text instead of SVG.
6. Language: Use professional, high-quality educational Arabic.
7. Strict Methodology Adherence (MANDATORY): You MUST use ONLY the tools, theorems, results, and methods provided in the curriculum's reference content. Absolute ban on using methods or shortcuts not taught in the provided curriculum (e.g., L'Hôpital's rule if it is not explicitly in the reference, or specialized coordinate systems). The solution must be mathematically consistent with the reference's teaching style and theorems. Do NOT use any "outside" knowledge that isn't justified by the reference.

Return the result as a STRICT JSON array of objects corresponding to the subQuestions, each with:
- "id": The id of the sub-question.
- "solution": The detailed step-by-step mathematical solution with LaTeX.
- "solutionSvgCode": Optional SVG code.

CRITICAL: Ensure all backslashes in LaTeX are properly escaped. Do NOT include any text outside the JSON array.
`;

const SVG_GENERATION_PROMPT = `
أنت خبير رسم وتوضيح رياضي وهندسي ومطور SVG للمناهج التعليمية.
مهمتك توليد كود SVG دقيق واحترافي للشكل الهندسي أو المنحنى البياني أو الجدول الرياضي، مع التقيد الصارم والكامل بالقواعد التالية:

قواعد وضوابط إلزامية وصارمة للرسم (CRITICAL MANDATORY RULES):
1. الإعدادات الأساسية للوسم:
   يجب أن يبدأ كود SVG تماماً بالوسم التالي:
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 550" width="200%" height="200%">
2. الخلفية شفافة تماماً (TRANSPARENT BACKGROUND):
   - يمنع منعاً باتاً وضع مستطيل خلفية أبيض أو ملون (لا تضع أي <rect width="100%" height="100%" ...> أو خلفية).
   - يجب أن تكون الخلفية شفافة بنسبة 100%.
3. بدون أي كتابات توضيحية أو مفاتيح للرسم (NO EXPLANATORY TEXT OR LEGENDS):
   - يمنع وضع مفاتيح رسم أو نصوص شرح جانبية أو فقرات توضيحية داخل الرسم.
   - يقتصر الرسم فقط على الأشكال الهندسية، المحاور، المنحنيات، والرموز النقطية (مثل A, B, C, x, y, O, u).
4. بدون أي عناوين للرسم (NO TITLES):
   - يمنع كتابة أي عنوان للرسم مثل "شكل 1" أو "رسم بياني" أو استخدام وسوم <title> داخل SVG.
5. حجم خط الرسم متوسط (MEDIUM STROKE WIDTH):
   - استخدم سماكة خط متوسطة وواضحة (stroke-width="2.5" إلى stroke-width="3") للخطوط والمحاور والأشكال الأساسية، و(stroke-width="1.5") للخطوط المساعدة أو المتقطعة.
6. خط الرموز والنقاط 30px (SYMBOL LABELS FONT-SIZE 30px):
   - جميع الرموز الرياضية والنقاط وتسميات المحاور والزوايا والأعداد يجب أن تكون بحجم خط 30px تحديداً: (font-size="30px" أو font-size="30") مع font-weight="bold" و fill="#000000" و font-family="sans-serif".
7. التنسيق: خصائص مباشرة inline (دون وسوم <style>).

أعد فقط كود SVG خام داخل وسوم <svg>...</svg> دون نصوص تقديمية أو كتل ماركداون.
`;

const QUESTION_BANK_GENERATION_PROMPT = `
You are an expert mathematical educational consultant for the Syrian/Arab math curriculum, preparing high-achieving students for final national exams.
Your task is to generate:
1. A highly professional "Quick Exam-Prep Summary" (ملخص مكثف للمراجعة قبل 4 أيام من الامتحان) covering the vital theorems, core rules, definitions, and formulas of this unit.
2. A premium "Training Question Bank" (بنك الأسئلة التدريبية) containing high-yield exercises, including AT LEAST 10 highly targeted Multiple Choice Questions (أسئلة اختيار من متعدد - 4 خيارات أحدها فقط صحيح) focusing on exam traps (الفخاخ الامتحانية) and common misconceptions/errors (الأخطاء الشائعة).

STRICT CONSTRAINTS TO PREVENT HALLUCINATION AND ENSURE PEDAGOGICAL EXCELLENCE:
1. QUICK EXAM-PREP SUMMARY: Focus on what a student needs 4 days before the exam. Write a clear, comprehensive, and beautiful summary using Markdown and LaTeX. Outline the core concepts, common pitfalls, and essential mathematical tools.
2. AT LEAST 10 MCQs ON EXAM TRAPS: You must generate at least 10 multiple-choice questions. Each MCQ must represent an authentic exam trap or test a common error.
   - For MCQs, the 4 options MUST be placed inside the "subParts" list, prefixed with (أ), (ب), (ج), (د).
   - The correct answer must be clearly detailed in the "solution", with an analysis of why this is correct and why the other options are clever distractors/traps.
   - The "aiGuidance" field must explicitly point out the specific trap or common error being tested in that item.
3. EXCLUSIVE SOURCE: All terminology and notation MUST follow the reference. Generate fresh exercises (with new numbers/scenarios) based on the textbook concepts. Do not copy questions word-for-word.
4. Professional Formatting: For non-MCQ structural questions, sub-questions (طلبات) must be numbered using circled numbers ①, ②, ③, ④.
5. LaTeX Math: All mathematical expressions, formulas, and options must be formatted in LaTeX between single dollar signs ($...$ only). NEVER use double dollar signs ($$), as it breaks the layout and causes overlap in RTL Arabic. Use \begin{array} for tables and matrices.
   - CRITICAL RULE FOR ARABIC TEXT & LATEX DELIMITERS ($):
     * Do NOT wrap ordinary Arabic words, sentence fragments, or instructions inside math delimiters '$ ... $'.
     * ONLY wrap the actual mathematical symbols, variables, formulas, equations, or numbers themselves in '$'.
     * For example, write: "مستقيم يمر بالنقطة $A(2i)$ ويميل بزاوية $\frac{\pi}{4}$"
     * NEVER write: "$مستقيم يمر بالنقطة A(2i) ويميل بزاوية \frac{\pi}{4}$"
     * Ensure that Arabic linking text/conjunctions (like 'أو', 'فإن', 'إذاً', 'حيث', 'يمر بـ') are strictly outside the '$' signs.
   - **Vector Formatting Rules (CRITICAL)**: When formatting vectors in LaTeX, you MUST strictly differentiate between:
     * A vector with a beginning and an end (two letters): write it in the form '\\overrightarrow{AB}' (e.g., $\\overrightarrow{AB}$).
     * A vector represented by a single letter: write it in the form '\\vec{u}' (e.g., $\\vec{u}$).

Output Format: You MUST return a STRICT JSON object with the following structure:
{
  "summaryText": "ملخص شامل ومنظم للأفكار والقوانين والملاحظات الهامة للمراجعة قبل 4 أيام من الامتحان باللغة العربية مع صياغة LaTeX عالية الجودة ومكتوب بأسلوب المدرس المحترف",
  "questions": [
    {
      "topic": "اسم المفهوم أو الفخ الامتحاني الدقيق (مثال: فخ نهايات المقادير غير المعينة)",
      "difficulty": 3, 
      "question": "نص السؤال الرئيسي أو السؤال متعدد الخيارات مع صياغة واضحة ورياضية دقيقة",
      "subParts": [
        "أ) مستقيم يمر بالنقطة $A(2i)$، ويمر بالنقطة $\\frac{\\pi}{4}$",
        "ب) مستقيم يوازي $y = 2x$، ويمر بـ $B(0, 1)$",
        "ج) نقطة تباعد عند $x = 0$",
        "د) مستقيم مقارب مائل معادلته $y = x$"
      ],
      "solution": "🔑 لتمثيل الحل: الخيار الصحيح هو (ب) بسبب ... [خطوات تفصيلية لشرح الحل بالتفصيل ونقاش بقية الخيارات وكيفية تفادي الخطأ]",
      "aiGuidance": "⚠️ تنبيه من فخ امتحاني: يقع الكثير من الطلاب في خطأ ... عندما يغفلون عن شرط ... تأكد من ...",
      "svgCode": "كود SVG للرسم التوضيحي للسؤال (اختياري، إن وجد)",
      "solutionSvgCode": "كود SVG لجدول التغيرات أو الرسم التوضيحي للحل (اختياري، إن وجد)"
    }
  ]
}
`;

export async function generateQuestionBank(
  pdfContent: string,
  config: { grade: string, subject: string, part: string, unit: string },
  existingConcepts: string[] = [],
  existingQuestions: string[] = []
): Promise<any> {
  const isExpansion = existingConcepts.length > 0 || existingQuestions.length > 0;
  
  const prompt = `
${QUESTION_BANK_GENERATION_PROMPT}

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}
الجزء: ${config.part}
الوحدة: ${config.unit}

${isExpansion ? `EXISTING COVERED CONCEPTS: [${existingConcepts.join(", ")}]
EXISTING QUESTIONS (DO NOT REPEAT THESE): 
${existingQuestions.slice(0, 20).map((q, i) => `${i+1}. ${q}`).join("\n")}

TASK: Scan the reference and find CONCEPTS OR VARIATIONS NOT REPRESENTED IN THE LISTS ABOVE. Your goal is to provide fresh exercises that complement the bank without overlap.` : 'TASK: Start from the beginning of the reference and generate a comprehensive bank covering ALL concepts found.'}

REFERENCE PDF CONTENT:
${pdfContent.substring(0, 150000)}
`;

  console.log("Generating Question Bank...");
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  return cleanJson(response.text || "[]");
}

export async function generateSummaryText(
  pdfContent: string,
  config: { grade: string, subject: string, part: string, unit: string }
): Promise<string> {
  const prompt = `
أنت خبير تربوي ومدرس رياضيات متميز للمناهج العربية (الجمهورية العربية السورية).
مهمتك هي استخلاص وتوليد ملخص مراجعة مكثف وشامل للغاية ومبهر بصرياً وعلمياً لوحدة تعليمية من المرجع المرفق.
الملخص مخصص للمراجعة السريعة قبل الامتحان بـ 4 أيام فقط، لذلك يجب أن يكون:
1. يركز على المفاهيم والتعاريف الأساسية، والقوانين الذهبية، والملاحظات التربوية الهامة.
2. يشمل توجيهات حول الأخطاء الامتحانية الشائعة وكيفية تلافيها.
3. مكتوب بأسلوب منسق جداً باستخدام Markdown مع صياغة معادلات ورموز رياضية احترافية بلغة LaTeX بين رمزي دولار مفردين حصراً $ ... $ (مثال: $f(x)=y$). يمنع تماماً استخدام الرمز المزدوج $$ لتفادي أي مشاكل في المحاذاة والعرض.

القواعد المنهجية الهامة جداً لبناء الملخص الشامل (القسم الأول):
- بعد تلخيص شديد ومكثف للأفكار والمفاهيم النظرية والنتائج والقوانين الأساسية:
  أ. يجب المرور بشكل منهجي تدريجي على الأمثلة المحلولة، وتدرب، وتمرينات، ومسائل الوحدة الواردة في المرجع المدرسي.
  ب. إذا كان هناك تمارين أو تدريبات أو مسائل معينة تحتوي على مهارة رياضية خاصة، أو خدعة ذكية، أو فكرة متميزة تخرج عن الأسلوب المباشر التقليدي وتحتاج إلى مهارة ما للحل، يجب صياغة هذه المهارة أو التنبيه والخدعة في الملخص باختصار شديد وموجز ومفيد للغاية لتوجيه الطالب لأسرار الحل وعقله التفكيري.
  ج. يجب الحرص التام والدقيق والمحكم على ألا تتكرر المهارات المتشابهة لتفادي الإطالة والحفاظ على تركيز وكفاءة وإيجاز الملخص المخصص لمراجعة ما قبل الامتحان.

قواعد صياغة "جدول مراجعة التمارين والأنشطة والمسائل الأساسية" (والذي يوضع دوماً في نهاية الملخص):
- العناوين المحددة للجدول بالماركداون:
| تسلسل | التمرين | الصفحة | الطلب | الفكرة الكبرى |

- شروط صياغة هذا الجدول:
  1. يُمنع تماماً تكرار إدراج التمارين والأنشطة والتدريبات والمسائل المتشابهة التي تصب في نفس الفكرة الكبرى الرياضية أو تستهدف نفس المفهوم والمهارة؛ وذلك توفيراً لوقت وضغط المذاكرة على الطالب.
  2. إذا كان هناك عدة تمرينات أو تدريبات أو مسائل تشترك في "الفكرة الكبرى"، اذكر تمرين أو تدريب واحد فقط كنموذج رائد وشامل يُمثل تلك الفكرة الكبرى الرياضية، ولا تذكر البقية المتشابهة في الجدول أبداً.
  3. اذكر التمارين أو الأنشطة أو التدريبات بوضوح (مثلاً: "تدرب 1"، "مثال محلول 2"، "النشاط الأول"، "المسألة 5").
  4. تدقيق أرقام الصفحات بدقة متناهية كما وردت في المرجع (مثلاً $10$ أو $24$ باستخدام الرموز الرياضية اللاتكس $...$).
  5. في خانة "الطلب": إذا كان للتمرين أو المسألة عدة طلبات فرعية (مثلاً الطلب الأول، أو الثاني، أو أ، أو ب)، حدد "الطلب المهم" المطلوب التركيز عليه (مثلاً تكتب: "الطلب ②" أو "الطلب الأول" أو "الطلب ب")، وإذا كان السؤال كاملاً مهماً ضع شرطة "-".

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}
الجزء: ${config.part}
الوحدة: ${config.unit}

المرجع المدرسي المعتمد للتحليل والاستخلاص:
${pdfContent.substring(0, 100000)}

اكتب الملخص باللغة العربية بأسلوب راقٍ وممتاز يبسط المادة المعقدة ويسهل حفظها واسترجاع قوانينها. أرجع مباشرة نص الملخص بالـ Markdown دون أي تعقيبات أو مقدمات.
`;
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.2 }
  });

  return response.text || "";
}

export async function generateExpandedSummaryText(
  pdfContent: string,
  config: { grade: string, subject: string, part: string, unit: string },
  existingSummary: string,
  userInstructions?: string
): Promise<string> {
  const prompt = `
أنت خبير تربوي ومدرس رياضيات متميز للمناهج العربية (الجمهورية العربية السورية).
مهمتك هي قراءة الملخص الدراسي الحالي، ومسح المرجع المرفق بالكامل لاستكشاف أفكار أو تفاصيل أو ملاحظات امتحانية هامة لم يتم تفصيلها بالشكل الكافي في الملخص الحالي، ثم دمجها وتوسيعها لإنتاج ملخص شامل ومطور.

الملخص الحالي الموجود:
"""
${existingSummary}
"""

${userInstructions ? `تعليمات وإرشادات وتوجيهات خاصة من المستخدم لتوسيع وتوجيه صياغة هذا الملخص:
"""
${userInstructions}
"""` : ''}

القواعد المنهجية المضافة للتوسيع والتلخيص (القسم الأول):
- بعد مراجعة المرجع وصياغة الأفكار والمفاهيم والنتائج والقوانين الأساسية بإيجاز شديد:
  أ. يجب المرور بشكل منهجي تدريجي على الأمثلة المحلولة، وتدرب، وتمرينات، ومسائل الوحدة الواردة في المرجع المدرسي.
  ب. إذا كانت هناك تمارين أو مسائل معينة بالوحدة تحتاج إلى مهارة رياضية خاصة أو خدعة متميزة للحل، يرجى ذكر وتوضيح هذه المهارة في الملخص باختصار شديد وبطريقة مركزة ومفيدة جداً للطلاب، مع تجنب تكرار المهارات المتشابهة للحفاظ على إيجاز وقوة الملخص.

قواعد صياغة "جدول مراجعة التمارين والأنشطة والمسائل الأساسية" (في نهاية الملخص):
يجب الحفاظ على أو إعادة توليد "جدول مراجعة التمارين والأنشطة والمسائل الأساسية من المرجع" في نهاية الملخص، ومراجعته ليكون مصقولاً ومنظماً جداً:
- العناوين المحددة للجدول بالماركداون:
| تسلسل | التمرين | الصفحة | الطلب | الفكرة الكبرى |

- شروط صياغة هذا الجدول:
  1. يُمنع تماماً تكرار إدراج التمارين والأنشطة والتدريبات والمسائل المتشابهة التي تصب في نفس الفكرة الكبرى الرياضية أو تستهدف نفس المفهوم والمهارة؛ وذلك توفيراً لوقت وضغط المذاكرة على الطالب.
  2. إذا كان هناك عدة تمرينات أو تدريبات أو مسائل تشترك في "الفكرة الكبرى"، اذكر تمرين أو تدريب واحد فقط كنموذج رائد وشامل يُمثل تلك الفكرة الكبرى الرياضية، ولا تذكر البقية المتشابهة في الجدول أبداً.
  3. اذكر التمارين والأنشطة والمسائل بوضوح مع تدقيق أرقام الصفحات بدقة متناهية لتكون مطابقة 100% للمرجع المدرسي.
  4. في خانة "الطلب": حدد رقم طلب فرعي هام أو جزء محدد للتمرين ذي الطلبات المتعددة للتركيز عليه، أو ضع خطاً "-" إذا كان التمرين بأكمله هاماً وموصى بدراسته بالكامل.

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}
الجزء: ${config.part}
الوحدة: ${config.unit}

المرجع المدرسي المعتمد للتحليل الكامل والتوسيع:
${pdfContent.substring(0, 100000)}

اكتب الملخص الموسع والجديد بالكامل باللغة العربية بأسلوب راقٍ ومنسق جداً بالـ Markdown مع صياغة معادلات LaTeX احترافية باستخدام رموز دولار مفردة $ ... $ حصراً (مثال: $f(x)=y$) ويمنع تماماً استخدام رموز الدولار المزدوجة $$ لتجنب التشويه البصري في محاذاة العرض. تأكد من الحفاظ على الأفكار القديمة وإضافة الأفكار والتنبيهات المنهجية والمهارات المطروحة بالمسائل بشكل مفيد ومبهر للطلاب.
أرجع مباشرة النص الجديد الكامل بالـ Markdown دون أي تعقيبات أو مقدمات.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.3 }
  });

  return response.text || "";
}

export async function generateCondensedSummaryText(
  existingSummary: string
): Promise<string> {
  const prompt = `
أنت خبير تربوي ومدرس رياضيات متميز للمناهج العربية (الجمهورية العربية السورية).
مهمتك هي تقليص وإيجاز ملخص الرياضيات المرفق (تكثيف وضغط "الملخص الشامل") بحيث يبقى كـ "تركيز امتحاني مكثف" مع الحفاظ التام والكامل على جميع القوانين والأفكار الأساسية، وتسهيل مراجعتها لأقصى درجة.

اتبع هذه القواعد المنهجية بدقة بالغة:
1. القوانين والمعادلات الرياضية والأفكار والمصطلحات الأساسية: يجب الحفاظ عليها بالكامل وبنفس الصياغة الرياضية الدقيقة دون أي حذف أو نقصان في القوانين. اكتب القوانين بوضوح باستخدام رموز دولار مفردة $ ... $ للاتكس (مثال $f(x)=y$) وممنوع تماماً استعمال الرموز المزدوجة $$.
2. الشرح التفصيلي والتفسيرات المطولة: احذفها تماماً واكتفِ بذكر الفكرة والنتيجة المباشرة باختصار شديد.
3. الأمثلة المحلولة والتطبيقات والتمارين: يمنع كتابة نصها أو خطوات حلها كاملة. يكتفى بالتنويه إليها والإشارة السريعة لطريقة حلها والهدف منها لتوضيح الفكرة باختصار شديد.
   - مثال للمطلوب: بدلاً من إدراج نص تمرين الاثبات بالتدريج وشرح خطوات البرهان بالتفصيل، اكتب:
     "لإثبات صحة علاقة بالإثبات بالتدريج: نقوم بـ (التحقق من العلاقة لـ $n_0$، فرض صحتها للمقدار $n$، ثم إثباتها للقيمة $n+1$). انظر التبرير والمثال المحلول رقم 4 في الوحدة (مثال إثبات متراجحة تعميمية)."
   - يجب تحويل أي مسألة محلولة أو مثال إلى "تنويه منهجى مختصر" يعطي فكرة العمل فورا مثل: "لـ [تأمين الفكرة] المذكورة في المثال المحلول 4 نقوم بـ [...]".
4. جدول مراجعة التمارين والأنشطة في نهاية الملخص (إن وجد): حافظ عليه تماماً كما هو ولا تقم بتقليصه أو حذفه لأنه مرجع تنظيمي هام للطلبة للرجوع للكتاب الأساسي.

نص وفصول الملخص الشامل الحالي الذي يجب تقليصه بذكاء:
"""
${existingSummary}
"""

أرجع نص الملخص المقلص مباشرة بصيغة Markdown نظيفة ومنسقة للغاية دون أي مقدمات أو تعقيبات أو تلخيص للفكرة خارج النطاق.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.15 }
  });

  return response.text || "";
}

export async function generateOnlyMCQs(
  pdfContent: string,
  config: { grade: string, subject: string, part: string, unit: string },
  existingQuestions: string[] = []
): Promise<any[]> {
  const isExpansion = existingQuestions.length > 0;
  const prompt = `
أنت خبير تربوي ومؤلف أسئلة رياضيات متميز للمناهج السورية والعربية.
مهمتك هي مسح المرجع المدرسي المرفق وتوليد أسئلة اختيار من متعدد (MCQ) متميزة وذكية تركز على الفخاخ الامتحانية والمفاهيم الخادعة والمفاهيم الأساسية للوحدة.

الشروط والمحددات:
1. يجب توليد من 5 إلى 8 أسئلة اختيار من متعدد جديدة تماماً.
2. لكل سؤال 4 خيارات، خيار واحد صحيح فقط. ضع الخيارات في حقل "subParts" مسبوقة بـ (أ) ، (ب) ، (ج) ، (د).
3. يجب صياغة الخيارات والرموز بلغة LaTeX ($...$).
4. في حقل "solution"، اكتب الحل التفصيلي والرياضي بالكامل ونقاش الخيارات الخاطئة ولماذا تم اختيار هذا الخيار الصحيح.
5. في حقل "aiGuidance"، اكتب تنبيهاً ذكياً عن الفخ الامتحاني بخصوص هذا السؤال.

${isExpansion ? `
لدينا الأسئلة الحالية التالية لتجنب تكرارها وتوليد أفكار جديدة مكملة لها:
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
` : ''}

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}
الجزء: ${config.part}
الوحدة: ${config.unit}

المرجع المدرسي المعتمد:
${pdfContent.substring(0, 100000)}

أرجع الناتج كـ JSON مصفوفة مباشرة (Array) من الأسئلة بالبنية التالية تماماً دون أي نص خارج الـ JSON:
[
  {
    "topic": "الفخ أو المفهوم الدقيق للسؤال",
    "difficulty": 3,
    "question": "نص السؤال الرياضي المنسق مع رموز LaTeX",
    "subParts": [
      "أ) $خيار 1$",
      "ب) $خيار 2$",
      "ج) $خيار 3$",
      "د) $خيار 4$"
    ],
    "solution": "🔑 لتمثيل الحل: الخيار الصحيح هو (...) بسبب ...",
    "aiGuidance": "⚠️ تنبيه من فخ امتحاني: ...",
    "svgCode": "كود SVG للرسم التوضيحي للسؤال (اختياري)",
    "solutionSvgCode": "كود SVG للحل (اختياري)"
  }
]
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      responseMimeType: "application/json"
    }
  });

  try {
    return cleanJson(response.text || "[]");
  } catch (e) {
    console.error("Failed parsing MCQs JSON", e);
    return [];
  }
}

export async function generateOnlyEssayQuestions(
  pdfContent: string,
  config: { grade: string, subject: string, part: string, unit: string },
  existingQuestions: string[] = []
): Promise<any[]> {
  const isExpansion = existingQuestions.length > 0;
  const prompt = `
أنت خبير تربوي ومؤلف أسئلة رياضيات متميز للمناهج السورية والعربية.
مهمتك هي مسح المرجع المرفق وتوليد تمارين أو مسائل مقالية طويلة تشتمل على طلبات تخصصية متدرجة (Structured Essay Problems) تهدف لبناء مفاهيم متكاملة أو معالجة فجوات في مسائل الوحدة أو لتعزيز وتغطية أفكار هامة جداً لم يسبق تغطيتها جيداً.

الشروط والمحددات:
1. صياغة من 3 إلى 5 مسائل أو تمارين مقالية طويلة وشاملة.
2. لكل مسألة، ضع الطلبات المتدرجة بداخل "subParts" ومرقمة باستخدام الأرقام الدائرية ①، ②، ③، ④، إلخ.
3. يجب استخدام صياغة رياضية ممتازة باستخدام LaTeX بقوس دولار مفرد فقط ($...$). يمنع منعاً باتاً استخدام الرمز المزدوج ($$).
4. اكتب الحل الرياضي الكامل والشامل بداخل "solution".
5. اكتب تنبيهاً ذكياً عن الأخطاء الشائعة في مثل هذا النوع من المسائل في حقل "aiGuidance".

${isExpansion ? `
لدينا الأسئلة والتمارين الحالية التالية لتجنب تكرارها تماماً والتركيز على مفاهيم ومسائل أخرى لم يغطها البنك الحالي بشكل كامل:
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
` : ''}

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}
الجزء: ${config.part}
الوحدة: ${config.unit}

المرجع المدرسي المعتمد:
${pdfContent.substring(0, 100000)}

أرجع الناتج كـ JSON مصفوفة مباشرة (Array) من الأسئلة بالبنية التالية تماماً دون أي نص خارج الـ JSON:
[
  {
    "topic": "المفهوم أو فكرة المسألة المقالية",
    "difficulty": 4,
    "question": "نص المسألة الرئيسي مع رموز LaTeX",
    "subParts": [
      "① احسب قيمة ...",
      "② أثبت أن ...",
      "③ ارسم جدول التغيرات لـ ..."
    ],
    "solution": "🔑 الحل النموذجي بالتفصيل والخطوات الرياضية الصياغية ...",
    "aiGuidance": "⚠️ تنبيه من فخ امتحاني أو خطأ شائع: ...",
    "svgCode": "كود SVG للرسم التوضيحي للسؤال (اختياري)",
    "solutionSvgCode": "كود SVG لجدول التغيرات أو رسم الحل (اختياري)"
  }
]
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      responseMimeType: "application/json"
    }
  });

  try {
    return cleanJson(response.text || "[]");
  } catch (e) {
    console.error("Failed parsing Essay JSON", e);
    return [];
  }
}

export async function extractTextFromImages(base64Images: string[]): Promise<string> {
  const prompt = `
You are an expert OCR specialist. Extract all text from the following images, including mathematical formulas in LaTeX format. 
Format the output as clear, readable text. Preserve the logical order of the content.
If there are tables or diagrams, describe them or represent them using LaTeX if possible.
`;
  
  const imageParts = base64Images.map(base64 => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: base64,
    },
  }));

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [
      { 
        role: "user",
        parts: [
          { text: prompt },
          ...imageParts
        ]
      }
    ],
    config: {
      temperature: 0.1,
    }
  });

  return response.text || "";
}

export async function extractAndSaveQuestions(
  base64Images: string[], 
  docMetadata: { title: string; grade: string; subject: string; type: 'exercise' | 'lesson' }
): Promise<number> {
  try {
    const isLesson = docMetadata.type === 'lesson';
    const prompt = isLesson ? LESSON_EXTRACTION_PROMPT : EXTRACTION_PROMPT;
    
    const imageParts = base64Images.map(base64 => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64,
      },
    }));

    const payload = {
      contents: [
        { 
          role: "user",
          parts: [
            { text: prompt },
            ...imageParts
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: isLesson ? {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              svgCode: { type: Type.STRING },
              order: { type: Type.NUMBER },
            },
            required: ["title", "content"],
          },
        } : {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              mainText: { type: Type.STRING },
              svgCode: { type: Type.STRING },
              subQuestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING },
                    order: { type: Type.NUMBER },
                    questionSvgCode: { type: Type.STRING },
                  },
                  required: ["id", "text"],
                },
              },
            },
            required: ["mainText", "subQuestions"],
          },
        },
      },
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);

    const parsed = cleanJson(response.text || "[]");
    
    const docId = await db.documents.add({
      ...docMetadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (isLesson) {
      const sections = parsed.map((item: any, index: number) => ({
        docId,
        title: item.title,
        content: item.content,
        svgCode: item.svgCode,
        order: item.order ?? index,
      }));
      await db.lessonSections.bulkAdd(sections);
    } else {
      const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

      const practiceExercises = parsed.map((item: any, index: number) => {
        const exNumber = index + 1;
        const title = `التمرين ${exNumber}`;

        let fullQuestionText = (item.mainText || '').trim();
        if (Array.isArray(item.subQuestions) && item.subQuestions.length > 0) {
          const subRequests = item.subQuestions.map((sq: any, sIdx: number) => {
            const circleChar = circledNumbers[sIdx] || `(${sIdx + 1})`;
            const rawText = (sq.text || '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳\d\-\.\(\)]+\s*/, '').trim();
            return `${circleChar} ${rawText}`;
          }).join('\n\n');

          if (fullQuestionText) {
            fullQuestionText = `${fullQuestionText}\n\n${subRequests}`;
          } else {
            fullQuestionText = subRequests;
          }
        }

        return {
          id: `ex_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
          title,
          questionText: fullQuestionText,
          strategyText: item.strategyText || '',
          solutionText: item.solutionText || '',
          svgCode: item.svgCode || ''
        };
      });

      await db.lessonSections.add({
        docId,
        title: docMetadata.title || 'تمرينات ومسائل',
        content: 'تمرينات ومسائل مستخلصة من الملف',
        practiceSectionLabel: 'تمرينات ومسائل',
        order: 0,
        isPracticeOnly: true,
        practiceExercises: practiceExercises
      });

      const exercises = parsed.map((item: any, index: number) => ({
        docId,
        label: `التمرين ${index + 1}`,
        mainText: practiceExercises[index]?.questionText || item.mainText || '',
        svgCode: item.svgCode || '',
        subQuestions: (item.subQuestions || []).map((sq: any, sqIndex: number) => ({
          ...sq,
          id: circledNumbers[sqIndex] || `${sqIndex + 1}`,
          order: sq.order ?? sqIndex
        })),
        order: index,
      }));
      await db.exercises.bulkAdd(exercises);
    }
    
    return docId;
  } catch (error) {
    console.error("Error extracting and saving content:", error);
    throw error;
  }
}

export const UNIT_EXERCISES_FROM_REFERENCE_PROMPT = `
أنت خبير تربوي ومستشار مناهج سورية ومصحح متخصص في مادة الرياضيات للمرحلة الثانوية.
المهمة المطلوبة منك بدقة مطلقة: استخلاص قسم "تمرينات ومسائل الوحدة" فقط وحصراً (أو "تمرينات ومسائل" / "تمرينات الوحدة" / "مسائل وتمرينات") من نص المرجع المرفق كما هي تماماً.

📚 البنية الهيكلية الثابتة لكل وحدة دراسية في المنهاج:
تتألف كل وحدة دراسية في المنهاج من ثلاثة أقسام رئيسية:
1. دروس نظرية: (مفاهيم، تعاريف، مبرهنات، نتائج، مطبات امتحانية، دليل امتحاني، أمثلة وتطبيقات محلولة).
2. فقرات "تدرّب": تلي كل درس نظري بشكل مباشر وتعتبر واجبات تدريبية للدرس النظري.
   ⚠️ [تحذير حاسم وقاطع]: يُمنع منعاً باتاً استخلاص فقرات "تدرّب" التابعة للدروس النظرية الفردية! يجب تجاهلها وتجاوزها بالكامل!
3. قسم "تمرينات ومسائل الوحدة": يقع دائماً في نهاية الوحدة الدراسية بالكامل (الصفحات الأخيرة من ملف الوحدة بعد انتهاء كافة الدروس النظرية وفقرات تدرّب).

🎯 الهدف الاستخلاصي الحصري (CRITICAL INSTRUCTION - SECTION LOCATION):
- ابحث حصراً عن القسم الشامل والأخير في نهاية الوحدة الذي يحمل عنوان "تمرينات ومسائل" أو "تمرينات ومسائل الوحدة" أو "تمرينات الوحدة".
- استخلص جميع المسائل والتمارين والأسئلة الواردة في هذا القسم الختامي فقط، مع الحفاظ على الأمانة العلمية والتطابق 100% مع نص الكتاب الأصلي.
- لا تستخرج أي تمرين من فقرات "تدرّب" الداخلية أو الأمثلة المحلولة داخل الدروس.

قواعد الاستخلاص والدقة المنهجية الصارمة (STRICT MANDATES):
1. التطابق والأمانة العلمية التامة (100% Fidelity): استخلص كل تمرين ومسألة وطلب فرعي تماماً كما ورد في المرجع الأصلي دون أي تعديل أو تحريف أو اختصار أو تغيير في الأرقام، ودون محاولة حلها في هذه المرحلة (المطلوب فقط الاستخلاص النصي والهيكلي الدقيق).
2. التسميات والترقيم الأصلي: حافظ على تسمية كل تمرين أو مسألة بالضبط كما وردت في المرجع في حقل "label" (مثال: "التمرين 1", "التمرين الخامس", "المسألة الأولى", "المسألة 4", "أولاً: اختر الإجابة الصحيحة", "ثانياً: حل الأسئلة الآتية").
3. تفكيك الطلبات الفرعية (Sub-questions):
   - قم بتفكيك طلبات كل مسألة أو تمرين إلى عناصر مستقلة بداخل مصفوفة "subQuestions".
   - حقل "id": يمثل ترقيم الطلب الأصلي (مثل: "①", "②", "③", "1", "2", "أ", "ب").
   - حقل "text": نص الطلب بالتفصيل مع صيغ LaTeX.
   - حقل "order": الترتيب التزايدي للطلب يبدأ من 0.
   - حقل "questionSvgCode": كود الرسم SVG إذا كان للطلب رسم خاص، وإلا اتركه فارغاً "".
   - إذا كان التمرين كتلة واحدة أو سؤالاً واحداً بدون طلبات فرعية، ضع نصه كطلب أول وحيد في المصفوفة.
4. صياغة الرياضيات بـ LaTeX برمز الدولار المفرد حصراً ($ ... $):
   - يجب إحاطة كل رمز رياضي، متغير، معادلة، متراجحة، رقم، مجال أو إحداثيات بإشارتي دولار مفردة حصراً (مثال: $f(x)=2x+1$ أو $x \\in \\mathbb{R}$ أو $A(1, 2, -3)$).
   - يمنع منعاً باتاً استعمال الدولار المزدوج $$ لتجنب تشويه المحاذاة والتنسيق العربي RTL.
   - الكلمات اللغوية العربية وأدوات الربط تبقى خارج إشارات الدولار.
5. تنسيق الأشعة في LaTeX (حاسم جداً):
   - شعاع بين نقطتين (حرفين): يُكتب بصيغة '\\overrightarrow{AB}' (مثال: $\\overrightarrow{AB}$).
   - شعاع ممثل بحرف واحد: يُكتب بصيغة '\\vec{u}' (مثال: $\\vec{u}$).
6. الجداول وجداول التغيرات:
   - تصاغ باستخدام بيئة مصفوفة LaTeX: \\begin{array}{|c|cccc|} ... \\end{array} محاطة برمز دولار مفرد $.
   - تنتهي كل أسطر المصفوفة بـ \\\\ قبل \\hline.
7. الرسوم والأشكال الهندسية بـ SVG:
   - إذا كان في التمرين أو المسألة رسم بياني، شكل هندسي، معلم متجانس، أو جدول تغيرات مرئي، قم بتوليد كود SVG نظيف ومقروء بحجم خط 24 وبخلفية بيضاء في حقل "svgCode" للتمرين أو "questionSvgCode" للطلب.
   - في كود الـ SVG استخدم علامات الاقتباس الفردية ' لسمات الـ XML (مثل: <svg viewBox='0 0 400 300' fill='none'>) لتجنب أخطاء JSON.
8. المصطلحات: استبدل كلمة "دالة" ومشتقاتها بكلمة "تابع" ومشتقاتها التزاماً بالمنهاج السوري.
9. قواعد الـ JSON: تأكد من أن جميع علامات الاقتباس والنصوص داخل مصفوفة الـ JSON صالحة، مع مضاعفة شرطات LaTeX المائلة مثل \\\\frac و \\\\sqrt و \\\\overrightarrow.

هيكل المخرجات (Output Format):
أرجع مصفوفة JSON نقية ومباشرة بدون أي تعقيبات خارج الـ JSON بالبنية التالية:
[
  {
    "label": "المسألة الأولى (أو التمرين 1)",
    "mainText": "نص التمهيد أو السؤال الرئيسي للمسألة أو التمرين...",
    "svgCode": "",
    "subQuestions": [
      {
        "id": "①",
        "text": "نص الطلب الأول مع صيغ $LaTeX$",
        "order": 0,
        "questionSvgCode": ""
      },
      {
        "id": "②",
        "text": "نص الطلب الثاني...",
        "order": 1,
        "questionSvgCode": ""
      }
    ]
  }
]
`;

export async function extractUnitExercisesFromReference(
  referenceDocId: number,
  docMetadata: { title: string; grade: string; subject: string; part?: string; unit?: string; topic?: string; seriesName?: string; teacherName?: string }
): Promise<number> {
  try {
    const pdfRecord = await db.pdfContents.where('docId').equals(referenceDocId).first();
    if (!pdfRecord) {
      throw new Error('لم يتم العثور على محتوى المرجع المحدد في قاعدة البيانات.');
    }

    let rawText = pdfRecord.textContent || '';
    if (!rawText.trim() && pdfRecord.structuredContent) {
      try {
        const parsedBlocks = JSON.parse(pdfRecord.structuredContent);
        const blocks = Array.isArray(parsedBlocks) ? parsedBlocks : (parsedBlocks.blocks || []);
        if (Array.isArray(blocks) && blocks.length > 0) {
          rawText = blocks.map((b: any) => b.text || '').join('\n\n');
        }
      } catch (e) {
        console.error("Error parsing structuredContent in extractUnitExercisesFromReference", e);
      }
    }

    if (!rawText.trim() && pdfRecord.originalFile) {
      const images = await convertPdfDataToImages(pdfRecord.originalFile);
      rawText = await extractTextFromImages(images);
    }

    if (!rawText.trim()) {
      throw new Error('المرجع المحدد لا يحتوي على نص أو محتوى قابل للاستخلاص.');
    }

    const defaultTitle = docMetadata.title?.trim() || (docMetadata.unit ? `تمرينات ومسائل - ${docMetadata.unit}` : 'تمرينات ومسائل الوحدة');

    const prompt = `
${UNIT_EXERCISES_FROM_REFERENCE_PROMPT}

بيانات المرجع المعتمد:
الصف: ${docMetadata.grade}
المادة: ${docMetadata.subject}
الجزء: ${docMetadata.part || 'غير محدد'}
الوحدة: ${docMetadata.unit || 'غير محدد'}
العنوان / الموضوع: ${docMetadata.topic || defaultTitle}

النص الكامل للمرجع المرفق (تذكر أن قسم تمرينات ومسائل الوحدة يقع في نهاية هذا النص بالأسفل):
"""
${rawText.substring(0, 150000)}
"""
`;

    const response = await generateWithFallback(MODELS_FALLBACK, {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    const parsed = cleanJson(response.text || "[]");
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('لم يتمكن الذكاء الاصطناعي من استخلاص تمرينات ومسائل الوحدة من المرجع. يرجى التأكد من احتواء المرجع على قسم تمرينات ومسائل الوحدة في نهايته.');
    }

    const newDocId = await db.documents.add({
      title: defaultTitle,
      grade: docMetadata.grade || 'الثالث الثانوي العلمي',
      subject: docMetadata.subject || 'رياضيات',
      part: docMetadata.part || '',
      unit: docMetadata.unit || '',
      topic: docMetadata.topic || 'تمرينات ومسائل الوحدة',
      type: 'exercise',
      seriesName: docMetadata.seriesName || 'سلسلة التعلم الذكي📚✨',
      teacherName: docMetadata.teacherName || 'حسن راشد العلي',
      teacherRole: 'مدرّس مادة الرياضيات والعلوم التفاعلية',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

    const practiceExercises = parsed.map((item: any, index: number) => {
      // 1. التمرين & رقم التمرين (e.g. التمرين 1)
      const exNumber = index + 1;
      const title = `التمرين ${exNumber}`;

      // 2. Format question text with all requests having circled numbers ①, ②, etc.
      let fullQuestionText = (item.mainText || '').trim();
      if (Array.isArray(item.subQuestions) && item.subQuestions.length > 0) {
        const subRequests = item.subQuestions.map((sq: any, sIdx: number) => {
          const circleChar = circledNumbers[sIdx] || `(${sIdx + 1})`;
          const rawText = (sq.text || '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳\d\-\.\(\)]+\s*/, '').trim();
          return `${circleChar} ${rawText}`;
        }).join('\n\n');

        if (fullQuestionText) {
          fullQuestionText = `${fullQuestionText}\n\n${subRequests}`;
        } else {
          fullQuestionText = subRequests;
        }
      }

      // 3. Solution text formatting
      let fullSolutionText = (item.solutionText || '').trim();
      if (!fullSolutionText && Array.isArray(item.subQuestions)) {
        const subSolutions = item.subQuestions
          .map((sq: any, sIdx: number) => {
            if (!sq.solution || !sq.solution.trim()) return '';
            const circleChar = circledNumbers[sIdx] || `(${sIdx + 1})`;
            const cleanSol = (sq.solution || '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳\d\-\.\(\)]+\s*/, '').trim();
            return `${circleChar} ${cleanSol}`;
          })
          .filter(Boolean)
          .join('\n\n');
        fullSolutionText = subSolutions;
      }

      return {
        id: `ex_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        title,
        questionText: fullQuestionText,
        strategyText: item.strategyText || '',
        solutionText: fullSolutionText,
        svgCode: item.svgCode || ''
      };
    });

    // Save as practice-only lesson section
    await db.lessonSections.add({
      docId: newDocId,
      title: docMetadata.title || `تمرينات ومسائل - ${docMetadata.unit || ''}`,
      content: 'تمرينات ومسائل الوحدة المستخلصة من المرجع الأصلي',
      practiceSectionLabel: 'تمرينات ومسائل الوحدة',
      order: 0,
      isPracticeOnly: true,
      practiceExercises: practiceExercises
    });

    const exercises = parsed.map((item: any, index: number) => ({
      docId: newDocId,
      label: `التمرين ${index + 1}`,
      mainText: practiceExercises[index]?.questionText || item.mainText || '',
      svgCode: item.svgCode || '',
      strategyText: item.strategyText || '',
      subQuestions: Array.isArray(item.subQuestions) && item.subQuestions.length > 0
        ? item.subQuestions.map((sq: any, sqIndex: number) => ({
            id: circledNumbers[sqIndex] || `${sqIndex + 1}`,
            text: sq.text || '',
            order: sq.order ?? sqIndex,
            questionSvgCode: sq.questionSvgCode || '',
            solutionSvgCode: sq.solutionSvgCode || '',
            solution: sq.solution || ''
          }))
        : [
            {
              id: '①',
              text: item.mainText || 'نص التمرين',
              order: 0,
              questionSvgCode: '',
              solutionSvgCode: '',
              solution: ''
            }
          ],
      order: index
    }));

    await db.exercises.bulkAdd(exercises);
    return newDocId;
  } catch (error) {
    console.error("Error extracting unit exercises from reference:", error);
    throw error;
  }
}

export async function analyzeLessonSection(sectionId: number): Promise<void> {
  const section = await db.lessonSections.get(sectionId);
  if (!section) return;

  try {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: SECTION_ANALYSIS_PROMPT },
            { text: `Section Content:\nTitle: ${section.title}\nContent: ${section.content}` }
          ]
        }
      ],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            additions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  content: { type: Type.STRING },
                },
                required: ["label", "content"],
              },
            },
            rephrasedContent: { type: Type.STRING },
          },
          required: ["additions"],
        },
      }
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);
    const analysis = cleanJson(response.text || "{}");

    await db.lessonSections.update(sectionId, { analysis });
  } catch (error) {
    console.error("Error analyzing section:", error);
    throw error;
  }
}

export async function generateSvgForSection(sectionId: number): Promise<void> {
  const section = await db.lessonSections.get(sectionId);
  if (!section) return;

  try {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: SVG_GENERATION_PROMPT },
            { text: `Content to illustrate:\nTitle: ${section.title}\nContent: ${section.content}` }
          ]
        }
      ],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            svgCode: { type: Type.STRING },
          },
          required: ["svgCode"],
        },
      }
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);
    const result = cleanJson(response.text || "{}");

    if (result.svgCode) {
      await db.lessonSections.update(sectionId, { svgCode: result.svgCode });
    }
  } catch (error) {
    console.error("Error generating SVG for section:", error);
    throw error;
  }
}

export async function generateSvgForMainExercise(exerciseId: number): Promise<void> {
  const exercise = await db.exercises.get(exerciseId);
  if (!exercise) return;

  try {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: SVG_GENERATION_PROMPT },
            { text: `Content to illustrate:\n${exercise.mainText}` }
          ]
        }
      ],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            svgCode: { type: Type.STRING },
          },
          required: ["svgCode"],
        },
      }
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);
    const result = cleanJson(response.text || "{}");

    if (result.svgCode) {
      await db.exercises.update(exerciseId, { svgCode: result.svgCode });
    }
  } catch (error) {
    console.error("Error generating SVG for main exercise:", error);
    throw error;
  }
}

export async function generateSvgForExercise(exerciseId: number, subQuestionId: string, type: 'question' | 'solution'): Promise<void> {
  const exercise = await db.exercises.get(exerciseId);
  if (!exercise) return;

  const subQuestion = exercise.subQuestions.find(sq => String(sq.id) === String(subQuestionId));
  if (!subQuestion) return;

  try {
    const contentToIllustrate = type === 'question' ? subQuestion.text : subQuestion.solution;
    
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: SVG_GENERATION_PROMPT },
            { text: `Content to illustrate:\n${contentToIllustrate}` }
          ]
        }
      ],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            svgCode: { type: Type.STRING },
          },
          required: ["svgCode"],
        },
      }
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);
    const result = cleanJson(response.text || "{}");

    if (result.svgCode) {
      const updatedSubQuestions = exercise.subQuestions.map(sq => {
        if (String(sq.id) === String(subQuestionId)) {
          return { 
            ...sq, 
            [type === 'question' ? 'questionSvgCode' : 'solutionSvgCode']: result.svgCode 
          };
        }
        return sq;
      });
      await db.exercises.update(exerciseId, { subQuestions: updatedSubQuestions });
    }
  } catch (error) {
    console.error("Error generating SVG for exercise:", error);
    throw error;
  }
}

const EXERCISE_FAMILIES_PROMPT = `
You are an expert mathematics educator specializing in curriculum design.
Analyze the provided list of math exercises and group them into "Families" based on their "Big Idea" or core mathematical concept.

STRICT CONSTRAINTS:
1. Identify the "Big Idea" for each exercise.
2. Group exercises with the same Big Idea into a "Family".
3. For each family, select one "Leader Exercise" (التمرين القائد) that best represents the concept.
4. Format the output in professional educational Arabic.
5. Start the response with this exact request for another AI application:
"طلب من الذكاء الاصطناعي: يرجى تقسيم عائلات التمارين كما هو مقترح أدناه لضمان تسلسل تعليمي منطقي."

Output Format Example:
عائلات حساب الثوابت: التمرين 1 و 4 و 10 ..إلخ ، التمرين القائد لهذه العائلة هو: التمرين الرابع.
عائلات دراسة التغيرات: التمرين 2 و 5 ..إلخ ، التمرين القائد لهذه العائلة هو: التمرين الثاني.
`;

export async function analyzeExerciseFamilies(docId: number): Promise<void> {
  const exercises = await db.exercises.where({ docId }).sortBy('order');
  if (exercises.length === 0) return;

  try {
    const exercisesText = exercises.map((ex, i) => `Exercise ${i + 1}:\n${ex.mainText}\n${ex.subQuestions.map(sq => sq.text).join('\n')}`).join('\n\n');
    
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: EXERCISE_FAMILIES_PROMPT },
            { text: `Exercises to analyze:\n${exercisesText}` }
          ]
        }
      ],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
          },
          required: ["analysis"],
        },
      }
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);
    const result = cleanJson(response.text || "{}");

    if (result.analysis) {
      await db.documents.update(docId, { familiesAnalysis: result.analysis });
    }
  } catch (error) {
    console.error("Error analyzing exercise families:", error);
    throw error;
  }
}

export async function generateSolutionForQuestion(contentToSolve: string, pdfContent?: string): Promise<{solution: string; hasError?: boolean; correctedQuestion?: any; solutionSvgCode?: string}> {
  const prompt = `
You are an expert mathematical educational consultant for the Syrian/Arab curriculum.
Solve the following mathematical question step-by-step in detail.
Identify any mathematical errors or unsolvable parts in the question. If there are errors (e.g. wrong numbers, missing givens), correct the question itself.

Question:
${contentToSolve}

${pdfContent ? `REFERENCE PDF CONTENT (STRICTLY FOLLOW THIS METHODOLOGY):\n${pdfContent.substring(0, 50000)}` : ''}

CRITICAL INSTRUCTIONS:
1. Provide a detailed, step-by-step mathematical solution (حل تفصيلي) for it.
2. Mandatory Strict Adherence: You MUST use ONLY the tools, theorems, results, and methods present in the provided REFERENCE PDF CONTENT. Do NOT use any external or advanced methods not taught in the source.
3. Mathematical Formatting: Wrap all math in single '$' delimiters using LaTeX (never use '$$').
   - CRITICAL RULE FOR ARABIC TEXT & LATEX DELIMITERS ($):
     * Do NOT wrap ordinary Arabic words, sentence fragments, or instructions inside math delimiters '$ ... $'.
     * ONLY wrap the actual mathematical symbols, variables, formulas, equations, or numbers themselves in '$'.
     * For example, write: "مستقيم يمر بالنقطة $A(2i)$ ويميل بزاوية $\frac{\pi}{4}$"
     * NEVER write: "$مستقيم يمر بالنقطة A(2i) ويميل بزاوية \frac{\pi}{4}$"
     * Ensure that Arabic linking text/conjunctions (like 'أو', 'فإن', 'إذاً', 'حيث', 'يمر بـ') are strictly outside the '$' signs.
4. Tone: Professional educational Arabic.
5. Sub-questions numbering & formatting: If there are sub-questions/sub-parts, you MUST strictly number their solution steps using circled numbers such as ①, ②, ③, ④, ⑤. Do NOT use regular numbers (like '1.', '2.', '1)', '2)'), English letters, or text phrases like "الطلب الأول:" or "الطلب الثاني:". Every sub-question answer step in the solution field must start with the circled number (e.g., "① ... \n\n ② ...") and have clear double-newlines between steps to avoid overlap. Ensure that if the incoming question lists sub-questions with normal numbering or text headers, you also return the correctedQuestion with circled numbers ①, ②, ③ in its text and subQuestions.
6. Slash restriction: Do NOT output the slash character '/' at the end of lines.
7. Visualization Logic: 
   - If the solution requires drawing a function graph (رسم الخط البياني للتابع) or a geometric shape, you MUST generate a high-fidelity SVG for it and include it in "solutionSvgCode".
   - For Variation Tables (جدول تغيرات), monotonicity, or relative position, use LaTeX formatting inside the "solution" string.
8. JSON Response: Return a STRICT JSON object with the following structure:
{
  "solution": "The detailed solution... (using circled numbers for sub-questions, no trailing slashes)",
  "solutionSvgCode": "SVG code for variation table if needed, otherwise empty string",
  "hasError": boolean,
  "correctedQuestion": {
    "text": "Corrected main text if needed",
    "subQuestions": ["Corrected subq 1", "Corrected subq 2"]
  }
}
Return ONLY valid JSON.
  `;

  const response = await generateWithFallback(MODELS_FALLBACK, {
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: "application/json" }
  });

  const parsed = cleanJson(response.text);
  if (parsed && parsed.solution) {
    const validated = globalOrchestrator.validateMathSolution(parsed.solution, "حل سؤال امتحاني");
    parsed.solution = validated.text;
  }
  return parsed;
}

export async function generateSvgForTestQuestion(contentToVisualize: string): Promise<string> {
  const prompt = `
أنت خبير رسم وتوضيح رياضي وهندسي ومطور SVG.
حلل المسألة الرياضية التالية وقم بتوليد رسم بياني أو شكل هندسي دقيق يمثلها تماماً:

المسألة:
${contentToVisualize}

قواعد وضوابط إلزامية وصارمة للرسم (CRITICAL MANDATORY RULES):
1. الإعدادات الأساسية للوسم:
   يجب أن يبدأ كود SVG تماماً بالوسم التالي:
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 550" width="200%" height="200%">
2. الخلفية شفافة تماماً (TRANSPARENT BACKGROUND):
   - يمنع منعاً باتاً وضع مستطيل خلفية أبيض أو ملون (لا تضع أي <rect width="100%" height="100%" ...> أو خلفية).
   - يجب أن تكون الخلفية شفافة 100%.
3. بدون أي كتابات توضيحية أو مفاتيح للرسم (NO EXPLANATORY TEXT OR LEGENDS):
   - يمنع وضع مفاتيح رسم أو نصوص شرح جانبية أو فقرات توضيحية داخل الرسم.
   - يقتصر الرسم فقط على الأشكال الهندسية، المحاور، المنحنيات، والرموز النقطية (مثل A, B, C, x, y, O, u).
4. بدون أي عناوين للرسم (NO TITLES):
   - يمنع كتابة أي عنوان للرسم مثل "شكل 1" أو "رسم بياني" أو استخدام وسوم <title> داخل SVG.
5. حجم خط الرسم متوسط (MEDIUM STROKE WIDTH):
   - استخدم سماكة خط متوسطة وواضحة (stroke-width="2.5" إلى stroke-width="3") للخطوط والمحاور والأشكال الأساسية، و(stroke-width="1.5") للخطوط المساعدة أو المتقطعة.
6. خط الرموز والنقاط 30px (SYMBOL LABELS FONT-SIZE 30px):
   - جميع الرموز الرياضية والنقاط وتسميات المحاور والزوايا والأعداد يجب أن تكون بحجم خط 30px تحديداً: (font-size="30px" أو font-size="30") مع font-weight="bold" و fill="#000000" و font-family="sans-serif".
7. التنسيق: خصائص مباشرة inline (دون وسوم <style>).

أعد فقط كود SVG خام داخل وسوم <svg>...</svg> دون نصوص تقديمية أو كتل ماركداون.
`;

  // we can use normal generating without fallback for SVGs, or fallback if available
  const response = await generateWithFallback(MODELS_FALLBACK, {
      contents: prompt,
      config: { temperature: 0.2, responseMimeType: "text/plain" }
  });

  const svgMatch = response.text.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgMatch) {
      return cleanAndEnforceMathSvg(svgMatch[0]);
  }
  return "";
}

export async function generateDetailedSolution(content: string, context?: string): Promise<string> {
  const prompt = `
You are an expert mathematics educator.
Your task is to provide a detailed, step-by-step mathematical solution for the provided problem.

STRICT CONSTRAINTS:
1. Contextual Integrity: The solution MUST strictly follow the methods, rules, and pedagogical style provided in the lesson context. DO NOT use external formulas or advanced methods unless explicitly mentioned in the context.
2. Methodology: Explain each step clearly based on the lesson's terminology.
3. Math: Use LaTeX with single '$' delimiters only (never use '$$').
4. Terminology: Use "تابع" instead of "دالة".
5. Language: Professional educational Arabic.
6. Formatting: 
   - Use professional numbering: 1. 2. 3. for main steps.
   - For variation tables (جدول تغيرات), definitely provide a high-fidelity SVG code embedded directly in the text.
   - Use double newlines for spacing.
   - Ensure the solution is rigorous and easy to follow.

${context ? `Lesson Context for reference:\n${context}\n\n` : ''}
Problem to solve:
${content}
`;

  try {
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "text/plain" }
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);
    return (response.text || "").trim();
  } catch (error) {
    console.error("Error generating detailed solution:", error);
    throw error;
  }
}

// ============================================================================
// 🎨 Custom Question Designer
// ============================================================================

const CUSTOM_QUESTION_DESIGN_PROMPT = `
You are an expert mathematical educational consultant for the Syrian/Arab curriculum.
Your task is to design a high-quality mathematical question based on the provided reference materials and specific user requirements.

STRICT CONSTRAINTS:
1. Strict Reference Adherence: Use ONLY terminology, notation, and styles present in the provided PDF references.
2. EXTREME STRICTNESS: You MUST NOT introduce mathematical concepts outside the scope of the references.
3. Generative Creativity: Produce a NEW question with original parameters and context (not a copy-paste from the reference).
4. Sub-questions: Generate EXACTLY the number of sub-questions requested.
5. Mathematical Formatting: Wrap all math in single '$' delimiters using LaTeX (never use '$$').
   - CRITICAL RULE FOR ARABIC TEXT & LATEX DELIMITERS ($):
     * Do NOT wrap ordinary Arabic words, sentence fragments, or instructions inside math delimiters '$ ... $'.
     * ONLY wrap the actual mathematical symbols, variables, formulas, equations, or numbers themselves in '$'.
     * For example, write: "مستقيم يمر بالنقطة $A(2i)$ ويميل بزاوية $\frac{\pi}{4}$"
     * NEVER write: "$مستقيم يمر بالنقطة A(2i) ويميل بزاوية \frac{\pi}{4}$"
     * Ensure that Arabic linking text/conjunctions (like 'أو', 'فإن', 'إذاً', 'حيث', 'يمر بـ') are strictly outside the '$' signs.
   - **Vector Formatting Rules (CRITICAL)**: When formatting vectors in LaTeX, you MUST strictly differentiate between:
     * A vector with a beginning and an end (two letters): write it in the form '\\overrightarrow{AB}' (e.g., $\\overrightarrow{AB}$).
     * A vector represented by a single letter: write it in the form '\\vec{u}' (e.g., $\\vec{u}$).
6. Language: Professional educational Arabic (strictly use "تابع" instead of "دالة").
7. JSON Structure: Return a JSON object with "text", "subQuestions" (array), and "svgRecommendation" (description of a drawing if needed).

Output format:
{
  "text": "The main question prompt...",
  "subQuestions": ["Part 1", "Part 2", ...],
  "svgRecommendation": "Description of what should be drawn (e.g., 'A pyramid with base ABCD and vertex S')"
}
`;

export async function generateCustomQuestion(
  pdfContent: string,
  requirements: { 
    subQuestionsCount: number; 
    topic?: string; 
    difficulty?: string;
    instructions?: string;
  }
): Promise<any> {
    const prompt = `
${CUSTOM_QUESTION_DESIGN_PROMPT}

USER REQUIREMENTS:
- Number of Sub-questions: ${requirements.subQuestionsCount}
- Target Topic: ${requirements.topic || 'Infer from references'}
- Difficulty Level: ${requirements.difficulty || 'Standard'}
- User Instructions/Focus: ${requirements.instructions || 'None'}

REFERENCE PDF CONTENT:
${pdfContent.substring(0, 100000)}

Return ONLY valid JSON.
    `;

    const response = await generateWithFallback(MODELS_FALLBACK, {
        contents: prompt,
        config: { temperature: 0.8, responseMimeType: "application/json" }
    });

    return cleanJson(response.text);
}

export async function solveCustomQuestion(
  questionText: string,
  subQuestions: string[],
  recommendations?: string,
  pdfContent?: string
): Promise<{ solution: string; solutionSvgCode?: string }> {
    const prompt = `
${SOLVING_PROMPT}

You are solving a CUSTOM DESIGNED question.
${recommendations ? `USER RECOMMENDATIONS/METHODOLOGY TO FOLLOW: ${recommendations}` : ''}

Question to solve:
${questionText}
Sub-questions:
${subQuestions.map((sq, i) => `${i + 1}. ${sq}`).join('\n')}

${pdfContent ? `ADDITIONAL CONTEXT FROM REFERENCES:\n${pdfContent.substring(0, 50000)}` : ''}

CRITICAL:
1. Strict Methodology Adherence (MANDATORY): You MUST use ONLY the tools, theorems, results, and methods present in the REFERENCE PDF CONTENT. Absolute ban on using methods or shortcuts not taught in the source.
2. Follow the user's recommendations strictly if provided.
3. Provide a detailed, step-by-step solution for EACH sub-question.
4. Number steps using circled numbers (①, ②, ...).
5. Generate high-fidelity SVG code for the solution if it involves a graph or geometric shape.

Return a STRICT JSON object:
{
  "solution": "The full detailed solution string...",
  "solutionSvgCode": "SVG code if needed, else empty string"
}
`;

    const response = await generateWithFallback(MODELS_FALLBACK, {
        contents: prompt,
        config: { temperature: 0.2, responseMimeType: "application/json" }
    });

    const result = cleanJson(response.text);
    return {
        solution: Array.isArray(result) ? result.map(r => r.solution).join('\n\n') : result.solution,
        solutionSvgCode: Array.isArray(result) ? result.find(r => r.solutionSvgCode)?.solutionSvgCode : result.solutionSvgCode
    };
}

export async function solveAndSaveExercise(exerciseId: number): Promise<void> {
  const exercise = await db.exercises.get(exerciseId);
  if (!exercise) return;

  const pdfContent = await db.pdfContents.where('docId').equals(exercise.docId).first();

  try {
    const payload = {
      contents: [
        { 
          role: "user",
          parts: [
            { text: SOLVING_PROMPT },
            { text: `REFERENCE PDF CONTENT (STRICTLY FOLLOW THIS METHODOLOGY):\n${pdfContent?.textContent || 'سياق السؤال متاح في نص السؤال المرفق.'}` },
            { text: `Exercise to solve:\nMain Text: ${exercise.mainText}\nSub-questions:\n${exercise.subQuestions.map(sq => `${sq.id}: ${sq.text}`).join('\n')}` }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              solution: { type: Type.STRING },
              solutionSvgCode: { type: Type.STRING },
            },
            required: ["id", "solution"],
          },
        },
      },
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);

    const solutions = cleanJson(response.text || "[]");
    
    const updatedSubQuestions = (exercise.subQuestions || []).map(sq => {
      const sol = solutions.find((s: any) => String(s.id) === String(sq.id));
      if (sol) {
        return {
          ...sq,
          solution: sol.solution,
          solutionSvgCode: sol.solutionSvgCode || sq.solutionSvgCode
        };
      }
      return sq;
    });

    await db.exercises.update(exerciseId, {
      subQuestions: updatedSubQuestions
    });
  } catch (error) {
    console.error("Error in solveAndSaveExercise:", error);
    throw error;
  }
}

export async function solveAndSaveExerciseCustom(
  exerciseId: number, 
  mode: 'detailed' | 'normal'
): Promise<void> {
  const exercise = await db.exercises.get(exerciseId);
  if (!exercise) return;

  const pdfContent = await db.pdfContents.where('docId').equals(exercise.docId).first();

  try {
    const isDetailed = mode === 'detailed';
    const modeInstruction = isDetailed 
      ? "تنبيه هام جداً: المطلوب هو (حل تفصيلي وشامل مع توضيح خطوات التفكير والشرح الرياضي خطوة بخطوة بالكامل)."
      : "تنبيه هام جداً: المطلوب هو (حل عادي مباشر ومبسط وموجز بدون تطويل أو تفاصيل غير لازمة، مع الحفاظ على القواعد العلمية السليمة وكتابة كافة الرموز الرياضية بوضوح).";

    const customPrompt = `
${SOLVING_PROMPT}

المستوى المطلوب للحل:
${modeInstruction}

بالإضافة إلى حل كل طلب من الطلبات الفرعية، يجب عليك صياغة حقل إضافي يسمى "strategyText" يمثل "فكرة واستراتيجية الحل السريعة" للمسألة أو التمرين بشكل عام.
تكون فكرة واستراتيجية الحل السريعة عبارة عن سطرين أو ثلاثة أسطر تشرح المفهوم الأساسي أو الفكرة الذكية لحل مثل هذه المسائل بطريقة سريعة ومختصرة للطلاب.

يرجى إرجاع النتيجة ككائن JSON ملتزم تماماً بالبنية التالية:
{
  "strategyText": "نص استراتيجية وفكرة الحل السريعة باللغة العربية الفصحى مع استخدام الرموز الرياضية المحاطة بـ $ عند اللزوم",
  "solutions": [
    {
      "id": "معرف الطلب الفرعي المطابق تماماً لما تم إرساله",
      "solution": "الحل المكتوب بالكامل باللغة العربية مع LaTeX حسب القواعد"
    }
  ]
}
`;

    const payload = {
      contents: [
        { 
          role: "user",
          parts: [
            { text: customPrompt },
            { text: `REFERENCE PDF CONTENT (STRICTLY FOLLOW THIS METHODOLOGY):\n${pdfContent?.textContent || 'سياق السؤال متاح في نص السؤال المرفق.'}` },
            { text: `Exercise to solve:\nMain Text: ${exercise.mainText}\nSub-questions:\n${exercise.subQuestions.map(sq => `${sq.id}: ${sq.text}`).join('\n')}` }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strategyText: { type: Type.STRING },
            solutions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  solution: { type: Type.STRING },
                  solutionSvgCode: { type: Type.STRING }
                },
                required: ["id", "solution"]
              }
            }
          },
          required: ["strategyText", "solutions"]
        }
      }
    };

    const response = await generateWithFallback(MODELS_FALLBACK, payload);
    const result = cleanJson(response.text || "{}");
    
    const strategyText = result.strategyText || '';
    const solutions = result.solutions || [];
    
    const updatedSubQuestions = (exercise.subQuestions || []).map((sq, idx) => {
      let sol = solutions.find((s: any) => String(s.id).trim() === String(sq.id).trim());
      if (!sol && solutions[idx]) {
        sol = solutions[idx];
      }
      if (sol) {
        return {
          ...sq,
          solution: sol.solution,
          solutionSvgCode: sol.solutionSvgCode || sq.solutionSvgCode
        };
      }
      return sq;
    });

    await db.exercises.update(exerciseId, {
      strategyText: strategyText,
      subQuestions: updatedSubQuestions
    });
  } catch (error) {
    console.error("Error in solveAndSaveExerciseCustom:", error);
    throw error;
  }
}

export async function solveAllExercises(
  docId: number,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const exercises = await db.exercises.where('docId').equals(docId).toArray();
  const total = exercises.length;
  if (total === 0) return;

  onProgress?.(0, total);

  for (let i = 0; i < total; i++) {
    try {
      await solveAndSaveExercise(exercises[i].id!);
    } catch (error) {
      console.error(`Error solving exercise ${exercises[i].id}:`, error);
    }
    onProgress?.(i + 1, total);
  }
}

export async function mergeDocuments(
  docIds: number[],
  metadata: {
    title: string;
    grade: string;
    subject: string;
    type: 'exercise' | 'lesson' | 'pdf';
  }
): Promise<number> {
  const newDocId = await db.documents.add({
    ...metadata,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  // 1. Merge PdfContent
  const pdfs = await db.pdfContents.where('docId').anyOf(docIds).toArray();
  if (pdfs.length > 0) {
    const mergedText = pdfs.map(p => p.textContent).join('\n\n--- MERGED CONTENT ---\n\n');
    let mergedBlocks: any[] = [];
    for (const p of pdfs) {
      if (p.structuredContent) {
        try {
          const parsed = JSON.parse(p.structuredContent);
          if (parsed && Array.isArray(parsed.blocks)) {
            mergedBlocks = [...mergedBlocks, ...parsed.blocks];
          }
        } catch (e) {}
      }
    }
    await db.pdfContents.add({
      docId: newDocId,
      textContent: mergedText,
      structuredContent: mergedBlocks.length > 0 ? JSON.stringify({ blocks: mergedBlocks }) : undefined
    });
  }

  // 2. Merge Lesson Sections
  let sectionOffset = 0;
  for (const oldDocId of docIds) {
    const oldSections = await db.lessonSections.where('docId').equals(oldDocId).sortBy('order');
    for (const sec of oldSections) {
      await db.lessonSections.add({
        ...sec,
        id: undefined,
        docId: newDocId,
        order: sec.order + sectionOffset
      });
    }
    if (oldSections.length > 0) {
      sectionOffset += oldSections[oldSections.length - 1].order + 1;
    }
  }

  // 3. Merge Exercises
  let exerciseOffset = 0;
  for (const oldDocId of docIds) {
    const oldExercises = await db.exercises.where('docId').equals(oldDocId).sortBy('order');
    for (const ex of oldExercises) {
      await db.exercises.add({
        ...ex,
        id: undefined,
        docId: newDocId,
        order: ex.order + exerciseOffset
      });
    }
    if (oldExercises.length > 0) {
      exerciseOffset += oldExercises[oldExercises.length - 1].order + 1;
    }
  }

  return newDocId;
}

function extractRelevantContext(pdfText: string, searchTerms: string[], windowSize = 8000): string {
  if (!pdfText) return "";
  if (pdfText.length <= windowSize) return pdfText;

  let matchedIndex = -1;
  const lowerText = pdfText.toLowerCase();

  for (const term of searchTerms) {
    if (!term || term.trim().length < 2) continue;
    const cleanTerm = term.trim().toLowerCase();
    const idx = lowerText.indexOf(cleanTerm);
    if (idx !== -1) {
      matchedIndex = idx;
      break;
    }
  }

  if (matchedIndex === -1 && searchTerms.length > 0) {
    const words = searchTerms.join(" ").split(/\s+/).filter(w => w.length > 3);
    for (const word of words) {
      const idx = lowerText.indexOf(word.toLowerCase());
      if (idx !== -1) {
        matchedIndex = idx;
        break;
      }
    }
  }

  if (matchedIndex === -1) {
    return pdfText.substring(0, windowSize);
  }

  const start = Math.max(0, matchedIndex - 1000);
  const end = Math.min(pdfText.length, start + windowSize);
  return pdfText.substring(start, end);
}




export async function reviewSingleQuestion(
  questionData: any,
  pdfContent?: string
): Promise<{ analysis: string; suggestedFix: any }> {
  const prompt = `
أنت خبير تربوي في مراجعة المسائل الرياضية للمنهج السوري/العربي.
مهمتك هي مراجعة السؤال والحل التاليين بدقة من الناحية العلمية والحسابية فقط.

محتوى السؤال والحل:
${JSON.stringify(questionData, null, 2)}

${pdfContent ? `المرجع العلمي المعتمد (يجب الالتزام بمنهجيته حصراً):\n${pdfContent.substring(0, 30000)}` : ''}

التعليمات:
1. ركز حصراً على الأخطاء العلمية والحسابية والتناقضات.
2. تجاهل تماماً الأخطاء النحوية أو اللغوية.
3. تحقق من صحة النتائج النهائية في الحل.
4. تأكد من أن السؤال منظم ومنطقي.
5. اقترح تحسينات لجعل السؤال أكثر دقة ووضوحاً.

أخرج النتيجة بصيغة JSON حصراً كالتالي:
{
  "analysis": "تحليل مفصل ومنظم بالعربي (Markdown) للأخطاء والتحسينات المقترحة",
  "suggestedFix": {
    "text": "نص السؤال المعدل (إن وجد تعديل)",
    "subQuestions": ["الطلب 1 المعدل", "الطلب 2 المعدل"],
    "options": ["خيار 1 معدل", "خيار 2 معدل"],
    "solution": "الحل المعدل بالكامل ليشمل التصحيحات العلمية والحسابية"
  }
}

ملاحظة: في sugerestedFix، ضع فقط الحقول التي تحتاج لتعديل. إذا كان الطلب أو الخيار أو النص صحيحاً، اتركه كما هو.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { 
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });

  return cleanJson(response.text);
}

export async function reviewQuestionBankItem(
  item: any,
  pdfContent?: string
): Promise<{
  status: 'correct' | 'needs_fixes';
  analysis: string;
  suggestedFix?: {
    question?: string;
    subParts?: string[];
    solution?: string;
    aiGuidance?: string;
    topic?: string;
    difficulty?: number;
  };
}> {
  const prompt = `
أنت مدقق علمي، إملائي، لغوي، وتربوي رائد ومتخصص في تدقيق ومراجعة مناهج الرياضيات العربية الرسمية (المنهج السوري للثالث الثانوي العلمي والثاني الثانوي).
مهمتك الأساسية والقصوى هي إجراء مراجعة فورية وعميقة شاملة لكل من:
1. نص السؤال الرئيسي (question)
2. طلبات السؤال أو الخيارات المتاحة (subParts)
3. الحل التفصيلي النموذجي للسؤال (solution) والذي يشكل جوهر عملية المراجعة العلمية والحسابية والتنسيقية الفائقة!

البيانات المراد فحصها وتدقيقها بالكامل:
السؤال: ${JSON.stringify(item, null, 2)}

${pdfContent ? `المرجع المدرسي المعتمد للمطابقة اللغوية والمنهجية والتحقق العلمي:\n${pdfContent.substring(0, 50000)}` : ''}

قواعد التدقيق والتدخل الإجباري المطلوبة منك بدقة متناهية:

أولاً: التدقيق والمطابقة العلمية والرياضية العميقة:
1. التحقق من صحة الأرقام والمعطيات الرياضية والتأكد من عدم وجود أي خطأ أو تناقض علمي في نص السؤال أو الخيارات.
2. مراجعة كافة خطوات الحل التفصيلي (solution) خطوة بخطوة حسابياً وجبرياً وهندسياً. قم بحساب وتصحيح أي نواتج نهائية خاطئة أو تبسيط خاطئ أو إشارة مشوهة بشكل كامل.

ثانياً: التنسيق اللغوي والنحوي والاصطلاحي:
1. صحع الصياغة الإملائية والنحوية لأي كلمات في نص السؤال وفي خياراته وفي خطوات حله التفصيلي.
2. التزم تماماً بمصطلحات المناهج السورية الرسمية: استخدم دائماً مصطلح "تابع" ويمنع تماماً (منعاً باتاً) استخدام مصطلح "دالة".
3. استخدم صياغات عربية متماسكة وسليمة نحوياً ولغوياً، وتجنب أي ركاكة تعبيرية.
4. التنسيق والترقيم الدائري الإلزامي للطلبات والحلول:
   - يمنع تماماً استخدام الترقيم العادي (مثل 1.، 2.، 1)، 2)، أ)، ب)، أو عبارات مثل "الطلب الأول:" أو "الطلب الثاني:") في السؤال الرئيسي، أو في حقل الطلبات (subParts) للأسئلة المقالية، أو في الحل التفصيلي (solution).
   - يجب إجبارياً استخدام الأرقام الدائرية المغلقة: ①، ②، ③، ④، ⑤، ⑥... إلخ لترقيم الطلبات في السؤال وفي الحل التفصيلي بشكل متناظر تماماً لتسهيل القراءة.
   - في الحل التفصيلي (solution)، يجب أن تبدأ إجابة كل طلب برقمه الدائري المقابل (مثلاً: "① نعلم أن..." ثم سطر جديد وهكذا لـ ②...) مع الحفاظ على فصل الأسطر والفقرات بـ \n\n لضمان العرض المريح للعين وتجنب أي تداخل.
   - تأكد أن حالة الحقل "status" ستكون "needs_fixes" لإصلاح وتوحيد الترقيم فوراً في حال عدم وجود ترقيم دائري في السؤال الحالي أو خطواته أو خياراته.

ثالثاً: الضبط الصارم ومثالية صيغ LaTeX (قواعد التنسيق الذهبية):
1. يمنع تماماً (منعاً باتاً) إحاطة الكلمات والجمل العربية العادية أو أحرف العطف والربط داخل محددات الرياضيات '$ ... $'. ويمنع تماماً استخدام محددات الدولار المزدوجة '$$'.
2. يجب إحاطة الرموز الرياضية فقط، المتغيرات، الأرقام صراحة، الدوال، الصيغ، المعادلات، المتجهات، المصفوفات، أو نقاط الإحداثيات بـ '$' مفردة فقط (مثل $z_A = 2 + i$). يمنع تماماً استخدام محددات الرمز المزدوج '$$' للمعادلات التوضيحية لتجنب تداخل الأسطر والتشوه والمشاكل البصرية في لغة الاتجاه RTL الشاملة للعربية.
3. أمثلة لتعلم الفروق:
   - الصياغة الصحيحة: مستقيم يمر بالنقطة $A(2i)$ ويميل بزاوية $\\frac{\\pi}{4}$
   - الصياغة الخاطئة والمرفوضة تماماً: $مستقيم يمر بالنقطة A(2i) ويميل بزاوية \\frac{\\pi}{4}$
4. تأكد أن حروف الربط والعطف مثل (أو، فإن، إذاً، حيث، و، بـ، عند) تقع خارج حقول الـ '$' تماماً وتحتوي على مسافة فاصلة مناسبة.
5. تأكد من إغلاق كافة حقول وأقواس LaTeX مثل \\frac{}{} و \\sqrt{} و \\vec{} وغيرها بشكل صحيح وخلوها من الأخطاء النحوية للاتيكس.
6. طبق هذه القواعد الذهبية على الحل التفصيلي (solution) وكافة الطلبات (subParts) بدقة بالغة وبدون تهشير أو ترميز خاطئ.

الحالات ومخرجات التدقيق:
1. إذا تطلب السؤال أو خياراته أو حله التفصيلي أي إصلاح لغوي أو رياضي أو في جودة صياغة LaTeX، فاجعل الحالة "needs_fixes" واملأ حقل "suggestedFix" بكافة الحقول المصححة كاملة وبدون أي اختصارات أو تجاهل.
2. إذا كان السؤال والطلبات والحل سليمين 100%، فاجعل الحالة "correct" واكتب في التحليل (analysis) تقريراً إيجابياً ومقنعاً لنقاط القوة والجماليات.

المخرجات المطلوبة:
أخرج النتيجة بصيغة JSON متوافقة مع هذا الهيكل تماماً وبدون أي نصوص دردشة قبلها أو بعدها:
{
  "status": "needs_fixes",
  "analysis": "تقرير فني ودراسي مفصل يحدد ما تم تصحيحه من أخطاء في نص السؤال أو الطلبات أو الحل التفصيلي من النواحي العلمية، النحوية، واللاتكس",
  "suggestedFix": {
    "topic": "الموضوع أو فكرة السؤال بعد تدقيقها ومطابقتها",
    "difficulty": 3,
    "question": "نص السؤال الرئيسي منقحاً ومصححاً بالكامل ومصاغاً باللاتيكس السليم",
    "subParts": ["الطلب/الخيار الأول مصححاً باللاتيكس واللغة السليمة", "الطلب/الخيار الثاني مصححاً..."],
    "solution": "خطوات الحل النموذجي المفصل بالكامل بعد المراجعة والتدقيق العلمي واللغوي وضبط LaTeX، مع استخدام الأسطر الجديدة المناسبة \\\\n\\\\n لتباعد الفقرات وتثبيت الأرقام المحاطة بدوائر كخطوات أساسية",
    "aiGuidance": "تأكيد أو تنبيه تربوي فائق بخصوص فخاخ التلميذ أو القوانين المستعملة"
  }
}
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { 
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });

  return cleanJson(response.text);
}

export async function reviewTest(
  title: string,
  testData: any,
  userRecommendations?: string
): Promise<{ reportMarkdown: string; issues: any[] }> {
  const prompt = `
أنت مدقق علمي، إملائي، لغوي، وتربوي رائد ومتخصص في تدقيق المناهج الدراسية العربية الرسمية وتنسيق الرياضيات في LaTeX.
مهمتك الأساسية هي إجراء مراجعة فورية وعميقة لمحتوى الاختبار والطلبات والحل النموذجي من الناحية الرياضية والعلمية واللغوية ومظهر رموز LaTeX.

عنوان الاختبار: ${title}
محتوى كود الاختبار المراد فحصه بالكامل:
${JSON.stringify(testData, null, 2)}

${userRecommendations ? `توصيات المستخدم المحددة للتدقيق (يجب التحقق من تلبيتها بدقة وترتيب المراجعة مع مراعاتها):\n"${userRecommendations}"\n` : ''}

الرجاء القيام بـ:
1. تقديم تقرير مراجعة شامل وعميق بتنسيق Markdown باللغة العربية يوضح مواطن القوة وأي خلل أو تحسينات مقترحة.
2. استخراج قائمة بالأخطاء المحددة التي يمكن إصلاحها برمجياً.

التقرير يجب أن يتضمن:
- التحقق من الدقة العلمية والحلول وحل المسائل.
- كتابة وتنسيق رموز LaTeX وصحتها وعاملي تداخلها مع النص العربي.
- مدى مطابقة الأسئلة مع توصيات المستخدم المحددة إن وجدت.

قائمة الأخطاء (issues) يجب أن تكون مصفوفة من الكائنات، كل كائن يحتوي على:
- id: معرف فريد للخطأ.
- category: فئة الخطأ (علمي، مطبعي، تنسيق، توصيات المستخدم، إلخ).
- description: وصف دقيق للخطأ ومكانه.
- fixSuggestion: اقتراح الإصلاح المناسب لتعديل حقول الاختبار.

أخرج النتيجة بصيغة JSON حصراً كالتالي:
{
  "reportMarkdown": "تقرير المراجعة بالتفصيل هنا...",
  "issues": [
    { "id": "1", "category": "علمي", "description": "توضيح الخطأ هنا...", "fixSuggestion": "التصحيح المقترح هنا..." }
  ]
}
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { 
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });

  const result = cleanJson(response.text);
  return {
    reportMarkdown: result.reportMarkdown || "فشلت عملية المراجعة.",
    issues: result.issues || []
  };
}

export async function applyFixesToTest(testData: any, selectedIssues: any[]): Promise<any> {
  const prompt = `
أنت خبير في معالجة البيانات التربوية.
مهمتك هي تطبيق قائمة محددة من "الإصلاحات" على بيانات الاختبار (testData) المقدمة.

بيانات الاختبار الأصلية:
${JSON.stringify(testData, null, 2)}

الإصلاحات المطلوب تطبيقها:
${JSON.stringify(selectedIssues, null, 2)}

التعليمات:
1. قم بتعديل testData لتنفيذ هذه الإصلاحات بدقة.
2. لا تقم بأي تعديلات أخرى غير تلك المطلوبة في قائمة الإصلاحات.
3. حافظ على نفس هيكل الـ JSON تماماً.
4. أخرج الـ JSON الجديد المحدث فقط.

أخرج النتيجة بصيغة JSON المحدثة للاختبار.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { 
      temperature: 0.1, 
      responseMimeType: "application/json" 
    }
  });

  return cleanJson(response.text);
}

export interface TextBlock {
  type: 'heading1' | 'heading2' | 'paragraph';
  text: string;
}

export async function structurePdfText(textContent: string): Promise<{ blocks: TextBlock[] }> {
  const prompt = `
أنت خبير في معالجة وهيكلة النصوص التعليمية للمنهج الرياضي والعلمي العربي.
مهمتك هي تحليل النص المستخرج من ملف PDF وتفكيكه إلى كتل نصية مهيكلة كالتالي:
- عناوين أساسية (heading1) مثل: اسم الوحدة، الفصل، العناوين الكبرى للمحتوى، الأقسام الرئيسية.
- عناوين فرعية/ثانوية (heading2) مثل: أسماء الدروس، أسماء الفقرات الفرعية، عناوين النشاطات أو النظريات.
- فقرات عادية (paragraph) تحتوي على التعريفات، الشرح، القوانين، التمارين، والرموز الرياضية LaTeX.

تحذير: لا تدمج العناوين مع الفقرات العادية. افصل كل جزء بوضوح وحافظ على كامل المحتوى الرياضي وصيغ LaTeX بدقة وبدون أي نقص.
لا تقم بتلخيص أو حذف أي محتوى! بل وزعه بالكامل على كتل.

أخرج النتيجة بصيغة JSON حصراً بالصيغة التالية:
{
  "blocks": [
    { "type": "heading1", "text": "العنوان الأساسي هنا" },
    { "type": "heading2", "text": "العنوان الفرعي هنا" },
    { "type": "paragraph", "text": "نص الفقرة والشروحات والرموز الرياضية $f(x) = y$ هنا" }
  ]
}
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { text: `النص الأصلي المراد هيكلته وتحليل عناوينه:\n${textContent.substring(0, 80000)}` }
        ]
      }
    ],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });

  return cleanJson(response.text || '{"blocks": []}');
}


export async function generateSmartGuidanceForQuestion(
  questionText: string,
  solutionText?: string,
  pdfContent?: string
): Promise<string> {
  const prompt = `
أنت خبير تربوي ومستشار تعليمي متميز للمنهج السوري والعربي في مادة الرياضيات.
مهمتك هي صياغة "إرشاد ذكي" (Smart Guidance) موجه للطالب لمساعدته في فهم وحل السؤال التالي دون كشف كامل الحل مباشرة بل كمنبهات وتلميحات وإضاءات ذكية تفيده في التعلم الذاتي والتفوق.

السؤال:
${questionText}

${solutionText ? `الحل التفصيلي:\n${solutionText}` : ''}

${pdfContent ? `المرجع التعليمي:\n${pdfContent.substring(0, 15000)}` : ''}

التعليمات الهامة لصياغة الإرشادات الذكية:
1. صغ الإرشاد باللغة العربية بأسلوب تربوي، مشجع وواضح جداً ومباشر.
2. ركز على:
   أ. العقبة الأساسية أو "الفخ الامتحاني" (Exam Trap) أو الأخطاء الشائعة التي قد يقع فيها الطلاب عند حل هذا النمط من المسائل.
   ب. القانون الرياضي أو النظرية أو المفهوم الأساسي المعتمد في المنهاج كبداية انطلاق، واكتب القوانين والرموز بصيغة LaTeX واضحة.
   ج. الترتيب والمنهجية الفكرية السليمة لحل السؤال خطوة بخطوة دون كتابة الحل بأكمله، كالتنبيه إلى الشروط (مثلاً شروط التعريف، أو التحقق من المتراجحة، أو تمثيل الشجرة الاحتمالية...).
3. معايير التنسيق (صيغ الرياضيات والـ LaTeX):
   أ. استخدم الرمز '$' لكافة الصيغ والمعادلات الرياضية (LaTeX)، ولا تستخدم '$$' أبداً.
   ب. لا تقم أبداً بإدخال كلمات عربية أو فراغات نصية عادية من اللغة العربية داخل $ ... $. فقط الرموز الرياضية والأرقام والنسب والأسماء والرموز الهندسية توضع داخل $ ... $.
   ج. تجنب استخدام الشُرط المائلة في نهاية الأسطر.
4. أخرج الإرشاد الذكي مباشرة كنص ماركداون عربي غني ومفعم بالفائدة والجمال (بدون مقدمات ترحيبية أو ذيل أو عبارات لغو).

أخرج الإرشاد الذكي مباشرة:
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    config: {
      temperature: 0.7
    }
  });

  return response.text ? response.text.trim() : "انتبه لربط المفاهيم واستخدم القوانين الرياضية المناسبة في الحل العام.";
}


export async function auditReviewTableInSummary(
  existingSummary: string,
  pdfContent: string,
  config: { grade: string, subject: string, part: string, unit: string }
): Promise<string> {
  const prompt = `
أنت خبير تربوي ومستشار تعليمي متميز للمنهج السوري والعربي في مادة الرياضيات.
مهمتك هي إعادة تدقيق وتصحيح وصقل "جدول مراجعة التمارين والأنشطة والمسائل الأساسية من المرجع" الموجود حالياً في نهاية الملخص الدراسي المكتوب بالماركداون.

الملخص الدراسي الحالي:
"""
${existingSummary}
"""

المرجع المدرسي المعتمد للتحقق وتدقيق جدول المراجعة واستخراج وتصحيح تفاصيله:
${pdfContent.substring(0, 100000)}

التعليمات الإلزامية لعملية إعادة التدقيق والتصحيح:
1. استهدف وتفحص جدول المراجعة في نهاية الملخص.
2. تدقيق أرقام الصفحات: قارن كل تمرين أو نشاط أو تدريب مذكور في الجدول بالمرجع المرفق، وصحح أرقام الصفحات لتكون دقيقة 100% ومطابقة تماماً لموضعها الفعلي في المرجع (مثلاً إذا وردت صفحة 12 وهي في الواقع بصفحة 15، صححها لتصبح $15$).
3. منع التكرار: ادمج أو احذف أي تمرينات أو أمثلة محلولة أو تدريبات أو مسائل تحمل نفس الفكرة الكبرى التعليمية. تخلص تماماً من التكرار وركز فقط على اختيار تمرين واحد (الأكثر شمولاً وعمقاً) ليمثل الفكرة.
4. إضافة عمود "الطلب": غيّر تخطيط الجدول بالماركداون ليصبح بالشكل التالي:
| تسلسل | التمرين | الصفحة | الطلب | الفكرة الكبرى |

وفي خانة "الطلب": إذا كان للتمرين في المرجع المرفق أكثر من طلب أو جزء (مثلاً ثلاثة طلبات)، فحدد الطلب الفرعي المهم والمميز المطلوب من الطالب مراجعته وتركيز انتباهه عليه بوضوح ودقة (مثلاً تكتب: "الطلب ②" أو "الطلب الأول" أو "الطلب أ" أو "الطلب الثاني")، أما إذا كان السؤال بأكمله مهماً ومستحقاً المراجعة دون تشتيت فاكتب "-".
5. احتفظ ببقية نصوص الملخص، شروحه، تعاريفه وقوانينه الرياضية كما هي في الأعلى دون إجراء تعديلات مشوهة، غير فقط الجدول في الأسفل بتحديثه وتدقيقه بالشكل المهني الصحيح. وسّع الجدول وقوّم أرقام صفحاته لتكون حقيقية خالية من الاختلاط.
6. تأكد من كتابة كل المعادلات والرموز الرياضية وأرقام الصفحات بلغة LaTeX المحشورة بـ $ مفرد حصراً (مثلاً $f(x)=y$, صفحة $23$) ولا تستخدم الرمز المزدوج $$ إطلاقاً.
7. أخرج الملخص الكامل الجديد والجدول المعدل والمدقق مباشرة بصيغة الماركداون العربي دون مقدمات أو أوسمة ترحيبية أو تعقيبات خارج النص.

أخرج الملخص والجدول المدقق كاملاً مباشرة:
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    config: {
      temperature: 0.15
    }
  });

  return response.text ? response.text.trim() : existingSummary;
}

// ============================================================================
// 📘 Lesson Notebook (نوطة الدرس الشاملة) Creator Guidance and Prompts
// ============================================================================

export const LESSON_NOTEBOOK_GENERATION_PROMPT = AI_BOOKLET_NOTEBOOK_PROMPT;

export async function generateLessonSummary(
  pdfContent: string,
  config: { title: string; grade: string; subject: string; part?: string; unit?: string },
  originalTitles: string[] = []
): Promise<any> {
  let titlesInstruction = '';
  if (originalTitles && originalTitles.length > 0) {
    titlesInstruction = `
CRITICAL TITLES REQUIREMENT:
You MUST create exactly ${originalTitles.length} sections in the Lesson Notebook matching these exact sequential headings (Do NOT drop or abbreviate any, keeping structural alignment absolute):
${originalTitles.map((t, idx) => `${idx + 1}. "${t}"`).join('\n')}
`;
  } else {
    titlesInstruction = `
Generate a fully sequenced set of chapters covering all distinct headers, definitions, and theorems of the reference text without truncation.
`;
  }

  const prompt = `
${LESSON_NOTEBOOK_GENERATION_PROMPT}

CURRICULUM METADATA:
- العنوان الأصلي للدرس: ${config.title}
- الصف الدراسي: ${config.grade}
- المادة الدراسية: ${config.subject}
- الجزء: ${config.part || 'عام'}
- الوحدة: ${config.unit || 'عام'}

${titlesInstruction}

REFERENCE SOURCE TEXT (FROM LIBRARY):
${pdfContent.substring(0, 75000)}
`;

  console.log("Generating Comprehensive Lesson Notebook...");
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.3,
      responseMimeType: "application/json"
    }
  });

  const text = response.text || "{}";
  return cleanJson(text);
}

export async function regenerateSummarySectionAI(
  sectionData: any,
  instruction: string
): Promise<any> {
  const prompt = `
أنت خبير تربوي ومصمم مناهج متميز وصاحب أشهر النوطات التعليمية لتبسيط مادة الرياضيات. مهمتك هي إعادة إنشاء أو تعديل فقرة معينة من "نوطة الدرس الشاملة" بناءً على توجيهات المستخدم وتحديثها لترقى لأعلى مستويات الاحترافية البصرية والتعليمية.

CRITICAL VISUAL & PEDAGOGICAL MANDATES (شروط التنسيق والجودة الحاسمة):
1. **استقلالية المفاهيم وكل مفهوم بفقرة مستقلة**:
   - لا تضع عدة مفاهيم رياضية أو حالات أو تعاريف في كتلة نصية متصلة واحدة أبداً لأن هذا يشتت ذهن الطالب.
   - ضع كل مفهوم، فكرة، تعريف، مبرهنة، أو حالة خاصة في فقرة مستقلة تماماً ومفصولة بتباعد أسطر واضح (\\n\\n).
   
2. **إبراز بداية السطر بخط عريض واضح**:
   - يجب إجبارياً البدء في أول الفقرة مباشرة بعنوان عريض مميز يسبقه أيقونة مناسبة دالة، مثل:
     * **📍 تعريف [المفهوم]:** شرح المفهوم هنا...
     * **🔸 مبرهنة [المبرهنة]:** التفصيل بالتكامل مع LaTeX...
     * **🔹 قاعدة ذهبية [القاعدة]:** القانون الشامل...
     * **💡 تنبيه تربوي فائق:** ملاحظة الامتحانات...
   - يمنع البدء بكلمات عادية مسترسلة من دون تمييز المفهوم بخط عريض واضح في بداية أول سطر.

3. **الترقيم الدائري السلس**:
   - استخدم الأرقام الدائرية المغلقة ①، ②، ③... لفرز وترقيم خطوات الحلول بدلاً من الترقيم العادي أو الكتابي لزيادة الفخامة والوضوح.

الفقرة الحالية المراد تعديلها:
${JSON.stringify(sectionData, null, 2)}

تعليمات المستخدم للتعديل أو إعادة الإنشاء:
"${instruction}"

الشروط الإلزامية:
1. صغ الفقرة بأسلوب نوطة متكاملة تشمل تبسيط التعاريف والمبرهنات بشكل ممتع ومهيكل للطالب.
2. استخدم LaTeX بـ $ مفردة فقط للمعادلات والرموز الرياضية (مثال $f(x)=2$). لا تستخدم $$ مطلقاً.
3. قم بتوليد كود SVG نظيف وجذاب ذو تباين عالٍ وخلفيات شفافة مع خطوط ونصوص واضحة جداً للرسم الهندسي.
4. أخرج النتيجة بترميز JSON مطابق تماماً لبنية هذه الفقرة فقط:

{
  "title": "العنوان الأصلي للفقرة",
  "concept": "الشرح المفهومي الغني للتعاريف والمبرهنات بأسلوب نوطة ميسرة غير مختصرة (مع تطبيق شروط التنسيق الحاسمة في الأعلى والتفكيك الفقرات)",
  "svgCode": "جزء كود SVG الرسومي بالكامل (سوليد أبيض في الخلفية لحفظ المظهر بالطباعة)",
  "examGuidance": "كيف يأتي سؤال الامتحان حول المفهوم وكيف يحل الطالب خطوة بخطوة بالتفصيل مع الدلالات للامتحان وبخطوات مرقمة",
  "notes": "الملاحظات والنتائج الذهبية وقوانين الفقرة المساعدة للفهم والتذكر",
  "traps": "المطبات الامتحانية والتحذيرات والزلات الشائعة للطلاب في الامتحانات",
  "solvedExample": {
    "exampleText": "تمرين أو مثال الأنشطة المحلول من الكتاب",
    "solutionText": "الحل الكامل المفسر خطوة بخطوة بالترقيم الدائري ①, ②"
  },
  "extraExample": {
    "exampleText": "تمرين إضافي من الذكاء الاصطناعي لترسيخ هذا المفهوم بالتحديد",
    "solutionText": "خطوات الحل النموذجي للتمرين الإضافي مرقمة بدقة بالأرقام الدائرية ①, ②"
  }
}
`;

  console.log("Regenerating section AI...");
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.4,
      responseMimeType: "application/json"
    }
  });

  const text = response.text || "{}";
  return cleanJson(text);
}

export async function regenerateSingleFieldAI(
  sectionTitle: string,
  sectionConcept: string,
  fieldKey: string,
  fieldLabel: string,
  currentValue: string,
  instruction: string
): Promise<string> {
  const isSvg = fieldKey === 'svgCode';
  
  const prompt = isSvg ? `
أنت خبير رسم وتوضيح رياضي وهندسي ومطور SVG للمناهج التعليمية.
مهمتك توليد أو تعديل كود SVG دقيق واحترافي للفقرة الرياضية التالية:

سياق الفقرة:
- عنوان الفقرة: "${sectionTitle}"
- المفهوم الأساسي: "${sectionConcept}"
- الحقل المحدد: "${fieldLabel}"
- كود SVG الحالي (إن وجد): "${currentValue}"
- توجيهات المستخدم: "${instruction}"

قواعد وضوابط إلزامية وصارمة للرسم (CRITICAL MANDATORY RULES):
1. الإعدادات الأساسية للوسم:
   يجب أن يبدأ كود SVG تماماً بالوسم التالي:
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 550" width="200%" height="200%">
2. الخلفية شفافة تماماً (TRANSPARENT BACKGROUND):
   - يمنع منعاً باتاً وضع مستطيل خلفية أبيض أو ملون (لا تضع أي <rect width="100%" height="100%" ...> أو خلفية).
   - يجب أن تكون الخلفية شفافة 100%.
3. بدون أي كتابات توضيحية أو مفاتيح للرسم (NO EXPLANATORY TEXT OR LEGENDS):
   - يمنع وضع مفاتيح رسم أو نصوص شرح جانبية أو فقرات توضيحية داخل الرسم.
   - يقتصر الرسم فقط على الأشكال الهندسية، المحاور، المنحنيات، والرموز النقطية (مثل A, B, C, x, y, O, u).
4. بدون أي عناوين للرسم (NO TITLES):
   - يمنع كتابة أي عنوان للرسم مثل "شكل 1" أو "رسم بياني" أو استخدام وسوم <title> داخل SVG.
5. حجم خط الرسم متوسط (MEDIUM STROKE WIDTH):
   - استخدم سماكة خط متوسطة وواضحة (stroke-width="2.5" إلى stroke-width="3") للخطوط والمحاور والأشكال الأساسية، و(stroke-width="1.5") للخطوط المساعدة أو المتقطعة.
6. خط الرموز والنقاط 30px (SYMBOL LABELS FONT-SIZE 30px):
   - جميع الرموز الرياضية والنقاط وتسميات المحاور والزوايا والأعداد يجب أن تكون بحجم خط 30px تحديداً: (font-size="30px" أو font-size="30") مع font-weight="bold" و fill="#000000" و font-family="sans-serif".
7. التنسيق: خصائص مباشرة inline (دون وسوم <style>).

أعد فقط كود SVG خام داخل وسوم <svg>...</svg> دون نصوص تقديمية أو كتل ماركداون.
` : `
You are an elite mathematics pedagogical expert and teacher of the Syrian/Arab curriculum.
Your task is to refine, expand, or recreate a specific section field/part for a comprehensive student study booklet (نوطة دراسية مبسطة).

CONTEXT:
- Section Title: "${sectionTitle}"
- Section Core Concept: "${sectionConcept}"
- Selected Part of Paragraph: "${fieldLabel}"
- Current Paragraph Text: "${currentValue}"
- User Revision Instructions (what they want you to adapt/add): "${instruction}"

FORMATTING CONSTRAINTS:
1. Write in elegant, student-friendly Egyptian/Syrian academic Arabic. Do not use academic dry text, write smoothly and sequence steps clearly.
2. Formulate equations, expressions, limits, derivatives, geometric coordinates, and numeric variables using LaTeX enclosed strictly with single dollar delimiters. NEVER use double dollar sign flags.
3. Do NOT wrap general Arabic words or spaces inside LaTeX delimiters. ONLY formulas and math variables belong in math mode.
4. Add very useful pedagogical remarks if matching, or solve step-by-step with Arabic circled numbers (①, ②, ③) if revising solutions.

Return ONLY the updated text. Do NOT add markdown wrappers, JSON formatting, conversational prefix or suffix notes. Output the revised text directly.
`;

  console.log(`Regenerating single field ${fieldKey} via Gemini...`);
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    config: {
      temperature: isSvg ? 0.2 : 0.4
    }
  });

  let text = response.text || "";
  // Clean potential markdown wrap
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  }
  return isSvg ? cleanAndEnforceMathSvg(text) : text.trim();
}


// ============================================================================
// 🎓 Professional Exam Summaries API (ملخصات امتحانية مكثفة لمراجعة سريعة)
// ============================================================================

export async function generateExamSummaryText(
  pdfContentsList: { bookTitle: string; textContent: string }[],
  config: { grade: string; subject: string; instruction?: string }
): Promise<string> {
  const mergedDocsText = pdfContentsList
    .map((pdf, idx) => `المرجع (${idx + 1}): [${pdf.bookTitle}]\n${pdf.textContent.substring(0, 45000)}`)
    .join("\n\n---\n\n");

  const prompt = `
أنت خبير تربوي ومدرس رياضيات متميز للمناهج العربية السورية والمصرية والمناهج المتقدمة.
مهمتك هي بناء ملخص امتحاني فائق التركيز والدقة يُمكّن الطالب من مراجعة المراجع المرفقة بالكامل في ساعتين على الأكثر!

قواعد الصياغة والمنهجية الصارمة المطلوبة:
1. الفكرة الكبرى والهدف الأساسي: تلخيص المحتوى المرفق بشكل مركز جداً ومحدد واختصار الوقت إلى ساعتين كحد أقصى للمراجعة الكاملة.
2. حذف وإسقاط الحشو التكراري تماماً: يجب حذف ومسح القسم النظري المطول، والتعاريف الإنشائية الطويلة، والأمثلة المحلولة التقليدية بالخطوات السردية، والتدريبات التقليدية المكررة والأنشطة والتمارين الطويلة ومسائل الوحدة التفصيلية، مع استبدالها بخلاصة ذهبية سريعة وعملية.
3. مهارات الحل الذكية أولاً: إذا كانت هناك مسائل أو تمارين معينة في المرجع تحتاج إلى مهارة رياضية خاصة أو طريقة غير مباشرة أو إستراتيجية حل ذكية، فيجب صياغة شرح "مختصر للغاية وموجز" لهذه المهارة وكيفية تطبيقها لحل تلك التمارين مباشرة (مثال: "لتجاوز عقبة [معينة] نطبق القانون [كذا]").
4. منع تكرار المهارات (مهم جداً عند دمج عدة مراجع): في حال دمج وتلخيص أكثر من مرجع معاً، تأكد تماماً وبصرامة عدم تكرار شرح أي مهارة أو قاعدة متشابهة أو تكرار طرائق الحل؛ يجب دمج الأفكار وتوحيدها لتكون سلسلة مهارات فريدة متعاقبة تغطي كل الأفكار المعيارية دون تكرار.
5. استخدام LaTeX بشكل صحيح: صغ المعادلات والرموز الرياضية باحترافية بلغة LaTeX ونظمها بين رمزي دولار مفردين حصراً $ ... $ (مثال: $f(x)=y$). يمنع منعاً باتاً استخدام الرمز المزدوج $$ لتفادي أي مشاكل في المحاذاة والعرض.

${config.instruction ? `تعليمات توجيهية خاصة وإضافية من المعلم لتعديل صياغة أو بنية التلخيص:
"""
${config.instruction}
"""` : ''}

USER CONFIGURATION:
الصف: ${config.grade}
المادة: ${config.subject}

المحتوى النصي المستخلص من المراجع المحددة للتلخيص:
"""
${mergedDocsText}
"""

اكتب الملخص باللغة العربية بأسلوب راقٍ وممتاز يسهل حفظه واسترجاعه بسرعة قبل الامتحان. أرجع مباشرة نص الملخص بالـ Markdown دون أي تعقيبات أو مقدمات.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.25 }
  });

  return response.text || "";
}

export async function generateCustomizedExamSummaryText(
  existingSummary: string,
  instruction: string,
  actionType: "expand" | "condense" | "custom",
  config: { grade: string; subject: string }
): Promise<string> {
  const prompt = `
أنت خبير تربوي ومدرس رياضيات متميز للمناهج العربية.
لديك ملخص امتحاني مكثف حالي، والمطلوب منك تعديله وتعديل صياغته بناءً على طلب المعلم وتحقيق الإجراء المطلوب أدناه بذكاء تام ودقة متناهية.

الملخص الامتحاني المكثف الحالي:
"""
${existingSummary}
"""

الإجراء المطلوب: [${actionType === 'expand' ? 'توسيع الملخص لزيادة التفاصيل المفيدة وذكر مهارات حل إضافية مفقودة وبطريقة ملخصة وغير مكررة' : actionType === 'condense' ? 'تقليص وتكثيف شديد للملخص لحذف أي شرح نظري زائد والتمسك بالمهارات الأساسية بوضوح تام وبأقل عدد من الكلمات' : 'تحديث مخصص للمحتوى كلياً بناء على التوجيهات'}]

تعليمات وتوجيهات المعلم المحددة:
"""
${instruction}
"""

قواعد الصياغة:
1. صغ جميع الأرقام والمعادلات الرياضية بلغة LaTeX المضمنة بين رمزي دولار مفردين $ ... $ حصراً. يمنع تماماً استخدام رموز الدولار المزدوجة $$.
2. حافظ على الطابع المكثف، البسيط والعملي للمادة دون الإطالة والتعاريف الحشوية النظرية السردية المكررة.
3. في حال وجود تمارين تحتاج مهارة، يجب تقديم شرح مقتضب مختصر جداً وسهل الفهم للطلاب مع منع تكرار المهارات.

اكتب النص المعدل والكامل للملخص باللغة العربية بأسلوب راقٍ وممتاز بالـ Markdown. أرجع النص الجديد مباشرة دون أي تعقيبات أو مقدمات خارجة.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.3 }
  });

  return response.text || "";
}

const SOLVE_PAST_PAPER_PROMPT = `
You are an expert mathematical educator, solver, and curriculum consultant for the Syrian/Arab curriculum (particularly the Scientific Baccalaureate / Third Secondary Scientific).
Your task is to analyze the provided test sheet or text of a past exam, extract every question, digitize/render each question with high-quality LaTeX and elegant Arabic, and solve every single question with a comprehensive, step-by-step mathematical solution.

STRICT CONSTRAINTS & RULES:
1. **Curriculum terminology**: Absolutely ban the word "دالة" (and its derivatives). You MUST strictly replace it with "تابع" (and its derivatives).
2. **Strict Math Formatting (LaTeX)**: EVERY single mathematical variable, equation, or number MUST be wrapped in a single '$' symbol (e.g., $x$ or $f(x)=y$). NEVER output double dollar '$$' markers, as they break the RTL Arabic text layout and cause serious layout defects in the rendering library.
3. **Arabic Text & LaTeX Delimiters ($) Rule**:
   - Do NOT wrap ordinary Arabic words, sentence fragments, or instructions inside math delimiters '$ ... $'.
   - ONLY wrap the actual mathematical symbols, variables, formulas, equations, or numbers themselves in '$'.
   - For example, write: "مستقيم يمر بالنقطة $A(2i)$ ويميل بزاوية $\\frac{\\pi}{4}$"
   - NEVER write: "$مستقيم يمر بالنقطة A(2i) ويميل بزاوية \\frac{\\pi}{4}$"
   - Ensure that Arabic linking text/conjunctions (like 'أو', 'فإن', 'إذاً', 'حيث', 'يمر بـ') are strictly outside the '$' signs.
   - **Vector Formatting Rules (CRITICAL)**: When formatting vectors in LaTeX, you MUST strictly differentiate between:
     * A vector with a beginning and an end (two letters): write it in the form '\\overrightarrow{AB}' (e.g., $\\overrightarrow{AB}$).
     * A vector represented by a single letter: write it in the form '\\vec{u}' (e.g., $\\vec{u}$).
4. **Original Numbering**: Preserve the layout and sequential numbering of questions in the source (e.g. "السؤال الأول", "ثانياً").
5. **Circled Step Numbers**: In the "solution" text of essay/writing questions, you MUST number the steps or answers to sub-questions using circled numbers like ①, ②, ③, ④, ⑤. Do NOT write "الطلب الأول:" or "1-". Use circled numbers. Each step should be on a new line and separated by a double newline (\\\\n\\\\n) for clean vertical spacing.
6. **No Literal Newlines in Strings**: This is a critical JSON rule. Use \\\\n for line breaks inside text fields, never output literal unescaped newlines in the JSON values.
7. **Graphic SVGs / Tables**:
   - If a question asks to raw drawing, graphing, or geometric representations, or contains a table of variation, you MUST generate high-fidelity SVG code.
     * Use large bold black text in SVGs (font-weight: "bold", fill: "#000000", font-size: 20px+).
     * Add a solid white background rect to the SVG to ensure visibility in dark mode: \`<rect width="100%" height="100%" fill="#ffffff" />\`.
     * Return this in "solutionSvgCode" (for solutions) or "svgCode" (if part of question text).
   - If there is a variation table, you may render it either as LaTeX \\begin{array} in text or generate an SVG. Under RTL Arabic layout, a well-formed LaTeX array inside '$ ... $' is preferred, but SVGs are also highly welcome.
8. **JSON Schema**: Return a strict, valid JSON object with:
   - "title": Title of the exam (e.g. "دورة عام 2022 - الدورة الثانية")
   - "grade": Grade level
   - "subject": Subject name
   - "year": Year of the exam
   - "questions": An array of questions:
     * "id": unique string ID (e.g., q1, q2_a)
     * "topic": precise math topic (e.g., "نهاية تابع مثلثي")
     * "type": either "mcq" or "essay"
     * "question": text of the question (must have proper LaTeX)
     * "subParts": array of strings (options if mcq - prefixed with (أ), (ب), (ج), (د)), or sub-questions if essay (or empty array)
     * "solution": detailed, step-by-step mathematical solution (with circled numbers and proper \\\\n\\\\n spacing)
     * "svgCode": SVG string or empty
     * "solutionSvgCode": SVG string or empty
`;

export async function solvePastPaperAI(
  pdfContent: string,
  config: { grade: string; subject: string; year: string; title: string }
): Promise<any> {
  const prompt = `
${SOLVE_PAST_PAPER_PROMPT}

USER SPECIFICATIONS:
الصف: ${config.grade}
المادة: ${config.subject}
المنهاج والسنة المحددة: ${config.year}
العنوان المختار للدورة: ${config.title}

PAST EXAM REFERENCE TEXT (PDF / OCR DATA):
${pdfContent.substring(0, 95000)}

Analyze the reference content, extract/formulate all math questions exactly (in professional educational Arabic with proper LaTex), solve everything with steps, and return a strict valid JSON matching the schema requested.
`;

  console.log("Analyzing and Solving Past Exam Paper...");
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.15,
      responseMimeType: "application/json"
    }
  });

  return cleanJson(response.text || "{}");
}


// ============================================================================
// ✍️ Textbook Practice Exercises (تدرب) AI Support
// ============================================================================

export async function generatePracticeExerciseSolutionAI(
  sectionTitle: string,
  questionText: string,
  currentSolution: string,
  currentStrategy: string
): Promise<{ solutionText: string; strategyText: string }> {
  const prompt = `
أنت خبير تربوي فائق المهارة في حل وتبسيط مناهج الرياضيات المدرسية (المنهاج السوري).
المفهوم أو الفقرة الحالية: "${sectionTitle}"

نص تمرين "تدرّب" المختار:
"${questionText}"

الرجاء توليد أو تحسين:
1. فكرة الحل (استراتيجية الحل): شرح ذكي ومبسط لكيفية البدء بالتفكير وحل التمرين وتجاوز الصعوبة فيه باختصار وبساطة مركزاً على المفاهيم والقوانين الرياضية الأساسية.
2. الحل النموذجي والتفصيلي الكامل لكافة طلبات التمرين: يوضع الحل كاملاً بدقة متناهية مع التقيد الصارم بالقواعد التنسيقية والوسوم المحددة أدناه.

قواعد وضوابط إلزامية وصارمة لتنسيق وكتابة الحل (MANDATORY FORMATTING & TAG RULES):
1. العناوين الرئيسية باللون الأحمر (Main Headings in Red):
   - يجب صياغة أي عنوان رئيسي في الحل باللون الأحمر باستخدام وسم النجمة المفردة: \`*العنوان الرئيسي باللون الأحمر*\`.
   - أمثلة:
     * \`*حل الطلب الأول:* \`
     * \`*دراسة تغيرات التابع والاطراد:* \`
     * \`*إيجاد معادلة المماس في النقطة المعطاة:* \`
2. العناوين الفرعية باللون الأزرق (Subheadings in Blue):
   - يجب صياغة أي عنوان فرعي أو خطوة فرعية باللون الأزرق باستخدام وسم النجمة والهاش: \`*#العنوان الفرعي باللون الأزرق#*\`.
   - أمثلة:
     * \`*#حساب النهايات عند أطراف مجموعة التعريف:#*\`
     * \`*#دراسة إشارة المشتق وتحديد القيم الحدية:#*\`
     * \`*#التعويض في معادلة المستقيم:#*\`
3. قانون عام ضمن إطار أحمر (General Law / Formula in Red Border):
   - يجب وضع أي قانون عام، دستور رياضي، قاعدة أساسية، أو مبرهنة معتمدة ضمن إطار أحمر محدد باستخدام وسوم الثلاث نجمات: \`***القانون العام أو الدستور***\`.
   - في حال كان القانون يتضمن رموزاً أو معادلات بصيغة LaTeX، يجب إحاطتها بالدولار داخل النجمات الثلاث حصراً.
   - أمثلة:
     * \`***دستور مشتق جداء تابعين: $(u \\cdot v)' = u'v + uv'$***\`
     * \`***دستور المسافة بين نقطتين في الفراغ: $AB = \\sqrt{(x_B-x_A)^2 + (y_B-y_A)^2 + (z_B-z_A)^2}$***\`
     * \`***شرط تعامد مستقيمين: $\\vec{u} \\cdot \\vec{v} = 0$***\`
4. الترقيم ورموز وصيغ الرياضيات (LaTeX & Mathematical Notation):
   - صياغة المعادلات والرموز الرياضية باستخدام LaTeX بمحدد مفرد '$ ... $' حصراً (مثال: $f(x) = x^2$). يمنع منعاً باتاً استخدام المحدد المزدوج '$$'.
   - تفريق الأشعة بدقة: المتجه بحرفين يكتب بالشكل \`\\overrightarrow{AB}\` والمتجه بحرف واحد يكتب \`\\vec{u}\`.
   - ترقيم خطوات وإجابات الطلبات بالرموز الدائرية المغلقة (①, ②, ③...).
   - يمنع استخدام كلمة "دالة" واستخدم دائماً كلمة "تابع".

أخرج النتيجة بصيغة JSON نظيفة ومطابقة للمخطط التالي تماماً بدون أي مقدمات أو هوامش خارج ملف الـ JSON:
{
  "strategyText": "فكرة الحل واستراتيجية التفكير المختصرة والذكية هنا",
  "solutionText": "خطوات الحل النموذجي المفصل مع العناوين الرئيسية الحمراء والعناوين الفرعية الزرقاء والقوانين العامة ضمن إطار أحمر والترقيم الدائري"
}
`;

  // 1. إثراء التوجيه عبر طبقة المايسترو
  const enrichedPrompt = globalOrchestrator.buildEnrichedPrompt(prompt, sectionTitle || "تمرين تدرب");

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: enrichedPrompt,
    config: {
      temperature: 0.3,
      responseMimeType: "application/json"
    }
  });

  const text = response.text || "{}";
  const parsed = cleanJson(text);

  // 2. التحقق العلمي والتدقيق الرياضي للحل الناتج
  const validatedSol = globalOrchestrator.validateMathSolution(parsed.solutionText || "", sectionTitle);
  const validatedStrat = globalOrchestrator.validateMathSolution(parsed.strategyText || "", `${sectionTitle} (استراتيجية)`);

  return {
    solutionText: validatedSol.text,
    strategyText: validatedStrat.text
  };
}

export async function shortenPracticeExerciseSolutionAI(
  questionText: string,
  currentSolution: string
): Promise<string> {
  const prompt = `
أنت خبير رياضيات متخصص في كتابة الحلول الرياضية الموجزة والمثالية لطباعة الملخصات والكراسات المدرسية (المنهاج السوري).
المطلوب منك تقليص واختصار الحل المعطى أدناه بدقة فائقة مع الالتزام الصارم بقواعد التنسيق والوسوم:

قواعد وضوابط إلزامية وصارمة لتنسيق وكتابة الحل المقلّص (MANDATORY FORMATTING RULES):
1. العناوين الرئيسية باللون الأحمر (Main Headings in Red):
   - يجب صياغة أي عنوان رئيسي في الحل باللون الأحمر باستخدام وسم النجمة المفردة: \`*العنوان الرئيسي باللون الأحمر*\` (مثال: \`*حل الطلب الأول:* \`).
2. العناوين الفرعية باللون الأزرق (Subheadings in Blue):
   - يجب صياغة أي عنوان فرعي باللون الأزرق باستخدام وسم النجمة والهاش: \`*#العنوان الفرعي باللون الأزرق#*\` (مثال: \`*#حساب المشتق:#*\`).
3. قانون عام ضمن إطار أحمر (General Law / Formula in Red Border):
   - أي قانون عام، دستور رياضي، أو مبرهنة أساسية تطبق في الحل يجب وضعها ضمن إطار أحمر باستخدام الثلاث نجمات: \`***القانون العام أو الدستور: $...$***\`.
4. قواعد التقليص والاختصار:
   - حذف جميع الشروحات التمهيدية المطولة والاستطرادات الإنشائية غير اللازمة.
   - اختصار الخطوات الحسابية البديهية في سطر واحد أو دمجها لتوفير المساحة عند الطباعة.
   - الإبقاء بدقة متناهية على كافة الخطوات الرياضية الجوهرية، القوانين المطبقة، والنتائج النهائية الصحيحة 100%.
   - ترقيم حلول الطلبات بالرموز الدائرية (①, ②, ③...).
   - استخدام صيغ LaTeX المحاطة بدولار مفرد $ ... $ حصراً لكافة الرموز والمعادلات (يمنع استخدام $$).
   - استخدام كلمة "تابع" بدلاً من "دالة"، وتفريق الأشعة: \`\\overrightarrow{AB}\` و \`\\vec{u}\`.

نص المسألة/التمرين:
"${questionText}"

الحل الحالي المراد تقليصه:
"${currentSolution}"

أخرج النص المقلّص مباشرة بصيغة Markdown/LaTeX مع الالتزام التام بالوسوم المذكورة (عناوين رئيسية حمراء *...*، عناوين فرعية زرقاء *#...#*، قوانين عامة في إطار أحمر ***...***) بدون أي مقدمات أو هوامش تعليقية.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2
    }
  });

  return (response.text || "").trim();
}

export function cleanAndEnforceMathSvg(svgText: string): string {
  if (!svgText || !svgText.trim()) return '';
  let clean = svgText.trim();
  
  // Extract svg if wrapped in other text
  const match = clean.match(/<svg[\s\S]*?<\/svg>/i);
  if (match) {
    clean = match[0];
  } else if (!clean.startsWith('<svg')) {
    return clean;
  }

  // 1. Remove XML/HTML comments
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Remove <title>...</title> and <desc>...</desc> tags
  clean = clean.replace(/<title[\s\S]*?<\/title>/gi, '');
  clean = clean.replace(/<desc[\s\S]*?<\/desc>/gi, '');

  // 3. Remove background rects (strictly transparent background)
  clean = clean.replace(/<rect[^>]*(?:width=["'](?:100%|700(?:px)?)["']|fill=["'](?:#ffffff|#fff|white|#f8fafc|#f1f5f9)["'])[^>]*\/?>/gi, '');
  clean = clean.replace(/<rect[^>]*(?:fill=["'](?:#ffffff|#fff|white|#f8fafc|#f1f5f9)["'])[^>]*(?:width=["'](?:100%|700(?:px)?)["'])[^>]*\/?>/gi, '');
  
  // 4. Remove legend or title text elements like 'الشكل', 'رسم توضيحي', 'مفتاح الرسم', etc.
  clean = clean.replace(/<text[^>]*>[\s]*(?:الشكل|رسم توضيحي|مفتاح الرسم|مخطط توضيحي|تمرين|توضيح)[\s\S]*?<\/text>/gi, '');

  // 5. Enforce root svg attributes: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 550" width="200%" height="200%">
  clean = clean.replace(/<svg\b[^>]*>/i, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 550" width="200%" height="200%" style="background: transparent; max-width: 100%; height: auto; display: block; margin: 0 auto;">');

  // 6. Ensure transparent background
  clean = clean.replace(/background(-color)?\s*:\s*[^;"]+;?/gi, 'background: transparent;');

  // 7. Ensure text symbol elements have font-size="30px" and bold styling
  clean = clean.replace(/<text\b([^>]*)>/gi, (_fullMatch, attrs) => {
    let newAttrs = attrs;
    if (/font-size=["'][^"']+["']/i.test(newAttrs)) {
      newAttrs = newAttrs.replace(/font-size=["'][^"']+["']/i, 'font-size="30px"');
    } else {
      newAttrs += ' font-size="30px"';
    }
    if (!/font-weight=/i.test(newAttrs)) {
      newAttrs += ' font-weight="bold"';
    }
    if (!/font-family=/i.test(newAttrs)) {
      newAttrs += ' font-family="sans-serif"';
    }
    return `<text${newAttrs}>`;
  });

  return clean;
}

export async function generatePracticeExerciseSvgAI(
  sectionTitle: string,
  questionText: string,
  instruction: string = ""
): Promise<string> {
  const prompt = `
أنت خبير رسم وتوضيح رياضي وهندسي ومطور SVG للمناهج السورية والعربية.
مهمتك توليد كود SVG دقيق واحترافي للتمرين الرياضي التالي:

سياق المسألة:
- عنوان الوحدة/الفقرة: "${sectionTitle}"
- نص المسألة والمطلوب رسمه: "${questionText}"
${instruction ? `- توجيهات إضافية خاصة من المستخدم: "${instruction}"` : ""}

قواعد وضوابط إلزامية وصارمة للرسم (CRITICAL MANDATORY RULES):
1. الإعدادات الأساسية للوسم:
   يجب أن يبدأ كود SVG تماماً بالوسم التالي:
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 550" width="200%" height="200%">
2. الخلفية شفافة تماماً (TRANSPARENT BACKGROUND):
   - يمنع منعاً باتاً وضع مستطيل خلفية أبيض أو ملون (لا تضع أي <rect width="100%" height="100%" ...> أو خلفية).
   - يجب أن تكون الخلفية شفافة 100%.
3. بدون أي كتابات توضيحية أو مفاتيح للرسم (NO EXPLANATORY TEXT OR LEGENDS):
   - يمنع وضع مفاتيح رسم أو نصوص شرح جانبية أو فقرات توضيحية داخل الرسم.
   - يقتصر الرسم فقط على الأشكال الهندسية، المحاور، المنحنيات، والرموز النقطية (مثل A, B, C, x, y, O, u).
4. بدون أي عناوين للرسم (NO TITLES):
   - يمنع كتابة أي عنوان للرسم مثل "شكل 1" أو "رسم بياني" أو استخدام وسوم <title> داخل SVG.
5. حجم خط الرسم متوسط (MEDIUM STROKE WIDTH):
   - استخدم سماكة خط متوسطة وواضحة (stroke-width="2.5" إلى stroke-width="3") للخطوط والمحاور والأشكال الأساسية، و(stroke-width="1.5") للخطوط المساعدة أو المتقطعة.
6. خط الرموز والنقاط 30px (SYMBOL LABELS FONT-SIZE 30px):
   - جميع الرموز الرياضية والنقاط وتسميات المحاور والزوايا والأعداد يجب أن تكون بحجم خط 30px تحديداً: (font-size="30px" أو font-size="30") مع font-weight="bold" و fill="#000000" و font-family="sans-serif".
7. التنسيق: خصائص مباشرة inline (دون وسوم <style>).

أعد فقط كود SVG خام داخل وسوم <svg>...</svg> دون نصوص تقديمية أو كتل ماركداون.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2
    }
  });

  let text = response.text || "";
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  }
  return cleanAndEnforceMathSvg(text);
}

export async function editPracticeExerciseSvgAI(
  currentSvg: string,
  instruction: string,
  questionText: string
): Promise<string> {
  const prompt = `
أنت خبير رسم وتوضيح رياضي وهندسي ومطور SVG. عدل كود SVG التالي بناءً على طلب المستخدم:

السياق:
- نص المسألة: "${questionText}"
- كود SVG الحالي:
${currentSvg}

- طلب التعديل: "${instruction}"

قواعد وضوابط إلزامية وصارمة للرسم (CRITICAL MANDATORY RULES):
1. الإعدادات الأساسية للوسم:
   يجب أن يبدأ كود SVG تماماً بالوسم التالي:
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 550" width="200%" height="200%">
2. الخلفية شفافة تماماً (TRANSPARENT BACKGROUND):
   - إزالة أي مستطيل خلفية أبيض أو ملون (<rect fill="#ffffff">).
   - يجب أن تكون الخلفية شفافة 100%.
3. بدون أي كتابات توضيحية أو مفاتيح للرسم (NO EXPLANATORY TEXT OR LEGENDS).
4. بدون أي عناوين للرسم (NO TITLES).
5. حجم خط الرسم متوسط: (stroke-width="2.5" إلى stroke-width="3").
6. خط الرموز والنقاط 30px: (font-size="30px") مع font-weight="bold" و fill="#000000".

أعد فقط كود SVG خام داخل وسوم <svg>...</svg> دون نصوص تقديمية أو كتل ماركداون.
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2
    }
  });

  let text = response.text || "";
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  }
  return cleanAndEnforceMathSvg(text);
}

export async function verifyPracticeExerciseSolutionAI(
  questionText: string,
  currentSolution: string,
  currentStrategy: string,
  focusPrompt?: string
): Promise<{
  isCorrect: boolean;
  notes: string;
  optimizedSolution: string;
  optimizedSolutionShort: string;
  optimizedStrategy: string;
}> {
  const prompt = `
أنت خبير فائق في الرياضيات واللغة العربية والمصطلحات التربوية لخدمة المنهاج الدراسي السوري.
مهمتك هي مراجعة وتدقيق تمرين رياضيات وحله المقترح للتأكد من دقته وصحته علمياً، رياضياً، ولغوياً وإملائياً.

${focusPrompt ? `توجيهات خاصة وتركيز مطلوب للتدقيق (من قِبل المستخدم):
"** ${focusPrompt} **"
(يرجى الالتزام بهذه التوجيهات الخاصة كأولوية قصوى أثناء عملية المراجعة والتصحيح وتحسين الصياغة!)` : ''}

السؤال الأصلي:
"${questionText}"

الاستراتيجية الحالية:
"${currentStrategy}"

الحل الحالي المقترح:
"${currentSolution}"

المطلوب بدقة:
1. تحقق من صحة ودقة الحل رياضياً بنسبة 100%. صحح أي حسابات أو أخطاء في الرموز أو خطوات الاستنتاج.
2. تحقق من الصياغة الإملائية واللغوية بالعربية الفصحى (مثال: استخدام التاء المربوطة والهمزات بالشكل الصحيح تماماً، واستخدم "تابع" بدلاً من "دالة" ومراجعة المصطلحات بدقة متناهية).
3. قم بتوليد نسختين مختلفتين من الحل المدقق والمصحح:
   - النسخة الأولى (الحل المفصل والكامل): حافظ فيه على التفسير التفصيلي والخطوات الكاملة والتحليل الوافي.
   - النسخة الثانية (الحل المختصر والموجز): قم بحذف التفاصيل الزائدة أو الحشو الجانبي أو الخطوات الحسابية البديهية ليكون مركزاً ومختصراً وذكياً جداً دون الإخلال بصحته الرياضية أو المنطقية، لتوفير المساحة عند الطباعة.
4. قواعد وضوابط إلزامية وصارمة للوسوم والتنسيق البصري في كلتا النسختين (MANDATORY TAGS & FORMATTING RULES):
   - العناوين الرئيسية باللون الأحمر (Main Headings in Red):
     * يجب صياغة أي عنوان رئيسي في الحل باللون الأحمر باستخدام وسم النجمة المفردة: \`*العنوان الرئيسي باللون الأحمر*\` (مثال: \`*حل الطلب الأول:* \`، \`*دراسة تغيرات التابع:* \`).
   - العناوين الفرعية باللون الأزرق (Subheadings in Blue):
     * يجب صياغة أي عنوان فرعي أو خطوة فرعية باللون الأزرق باستخدام وسم النجمة والهاش: \`*#العنوان الفرعي باللون الأزرق#*\` (مثال: \`*#حساب النهايات:#*\`، \`*#دراسة إشارة المشتق:#*\`).
   - قانون عام ضمن إطار أحمر (General Law / Formula in Red Border):
     * أي قانون عام، دستور رياضي، قاعدة أساسية، أو مبرهنة معتمدة يجب وضعها ضمن إطار أحمر محدد باستخدام وسوم الثلاث نجمات: \`***القانون العام أو الدستور***\`.
     * في حال احتواء القانون على صيغة LaTeX، يجب إحاطتها بالدولار داخل النجمات الثلاث: \`***دستور المشتق: $(u \\cdot v)' = u'v + uv'$***\` أو \`***شرط التعامد: $\\vec{u} \\cdot \\vec{v} = 0$***\`.
   - الضوابط الرياضية والرمزية:
     * يجب استخدام المحدد المفرد '$ ... $' حصراً لرموز وصيغ LaTeX، ويمنع تماماً استخدام المحدد المزدوج '$$'.
     * تفريق الأشعة بدقة: الحرفان لهما بداية ونهاية يكتبان بالشكل '\\\\overrightarrow{AB}' والشعاع الحرف الواحد بالشكل '\\\\vec{u}'.
     * استخدام الترقيم الدائري لخطوات الحل (①، ②، ③...).
     * يمنع استخدام كلمة "دالة" واستخدم دائماً كلمة "تابع".

الرجاء إرجاع النتيجة بصيغة JSON صالحة تماماً بالمخطط التالي:
{
  "isCorrect": true,
  "notes": "تقرير وملاحظات التدقيق المفصلة باللغة العربية (ماذا تم تصحيحه رياضياً وإملائياً؟ وما هي النصيحة المنهجية؟)",
  "optimizedSolution": "خطوات الحل التفصيلي النموذجي المصحح بالكامل مع الالتزام الصارم بالوسوم: عناوين رئيسية حمراء *...* وعناوين فرعية زرقاء *#...#* وقوانين عامة ضمن إطار أحمر ***...*** والترقيم الدائري",
  "optimizedSolutionShort": "خطوات الحل المختصر والموجز والمعدل بحذف التفاصيل غير الضرورية لتقليل مساحة الورق، مع الالتزام الصارم بنفس الوسوم: عناوين رئيسية حمراء *...* وعناوين فرعية زرقاء *#...#* وقوانين عامة ضمن إطار أحمر ***...***",
  "optimizedStrategy": "فكرة واستراتيجية الحل السريعة والمحسنة والمصححة لغوياً ورياضياً"
}
`;

  const enrichedPrompt = globalOrchestrator.buildEnrichedPrompt(prompt, "تدقيق ومراجعة تمرين تدرب");

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: enrichedPrompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  const textResp = response.text || "{}";
  const parsed = cleanJson(textResp);

  const valLong = globalOrchestrator.validateMathSolution(parsed.optimizedSolution || currentSolution, "الحل المفصل");
  const valShort = globalOrchestrator.validateMathSolution(parsed.optimizedSolutionShort || parsed.optimizedSolution || currentSolution, "الحل المختصر");
  const valStrat = globalOrchestrator.validateMathSolution(parsed.optimizedStrategy || currentStrategy, "استراتيجية الحل");

  return {
    isCorrect: typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : true,
    notes: parsed.notes || "تم التدقيق والمراجعة بنجاح بنسبة 100%.",
    optimizedSolution: valLong.text,
    optimizedSolutionShort: valShort.text,
    optimizedStrategy: valStrat.text
  };
}

export async function verifyLessonSectionAI(
  title: string,
  content: string,
  guidance?: string,
  notesText?: string,
  trapsText?: string,
  examGuidanceText?: string,
  focusPrompt?: string,
  exampleText?: string,
  solutionText?: string,
  extraExampleText?: string,
  extraSolutionText?: string
): Promise<{
  isCorrect: boolean;
  notes: string;
  optimizedTitle: string;
  optimizedContent: string;
  optimizedGuidance: string;
  optimizedNotes: string;
  optimizedTraps: string;
  optimizedExamGuidance: string;
  optimizedExampleText: string;
  optimizedSolutionText: string;
  optimizedExtraExampleText: string;
  optimizedExtraSolutionText: string;
}> {
  const prompt = `
أنت خبير تربوي وعلمي وفائق الاقتدار في تدقيق وحسابات مادة الرياضيات باللغة العربية وصياغة المناهج التعليمية السورية.
مهمتك هي إجراء تدقيق علمي، لغوي، وإملائي وتنسيقي احترافي لفقرة الشرح التعليمية وتدريباتها المرافقة في ملخص الدرس.

${focusPrompt ? `توجيهات خاصة وتركيز مطلوب للتدقيق من المعلم/المستخدم:
"** ${focusPrompt} **"
(يرجى الالتزام بهذه التوجيهات الخاصة كأولوية قصوى أثناء التدقيق والتعديل وتنسيق الفقرة!)` : ''}

عنوان الفقرة الحالي:
"${title}"

فقرة الشرح الأساسية:
"${content}"

الإرشادات والتوجيهات الذهبية الحالية:
"${guidance || ''}"

الملاحظات والقواعد الحالية:
"${notesText || ''}"

الأخطاء والمطبات الشائعة الحالية:
"${trapsText || ''}"

طريقة ورودها في الامتحان:
"${examGuidanceText || ''}"

تمرين التطبيق العملي من الكتاب (السؤال):
"${exampleText || ''}"

حل تمرين التطبيق العملي:
"${solutionText || ''}"

التمرين الإضافي المكرّس من الذكاء الاصطناعي (السؤال):
"${extraExampleText || ''}"

حل التمرين الإضافي:
"${extraSolutionText || ''}"

المطلوب بدقة عالية:
1. التدقيق العلمي والرياضي: التأكد من صحة الدساتير، القوانين، الشروط والخطوات الاستنتاجية، وتصحيح أي خطأ رياضياتي فوراً.
2. التدقيق اللغوي والإملائي: تصحيح الهمزات والتاء المربوطة والمصطلحات بدقة (استبدال كلمة "دالة" بكلمة "تابع" دائماً، كتابة الأشعة مثل '\\overrightarrow{AB}' أو '\\vec{u}').
3. التنسيق الاحترافي والرمزية البصرية:
   - استخدام محددات LaTeX المفردة '$ ... $' فقط.
   - استخدام التنسيقات البصرية للتميز:
     * النجمة المفردة للنصوص الحمراء: \`*عبارة حمراء*\`
     * النجمة والهاش للنصوص الزرقاء: \`*#عبارة زرقاء#*\`
     * النجمتين المزدوجتين للعبارات الهامة بظل بنفسجي: \`**عبارة هامة بظل بنفسجي**\`
     * الثلاث نجمات للقوانين والدساتير لتظهر في إطار محدد محاط بحد أحمر وخلفية ناعمة: \`***$القانون$***\`
4. إرجاع النتيجة بصيغة JSON وفق المخطط التالي:
{
  "isCorrect": true,
  "notes": "تقرير التدقيق والتصحيح المفصل لغوياً وعلمياً وتنسيقياً",
  "optimizedTitle": "العنوان المصحح والمدقق",
  "optimizedContent": "فقرة الشرح المصححة والمدققة والمنسقة بأعلى معايير الجودة والجمالية",
  "optimizedGuidance": "الإرشادات المصححة والمدققة",
  "optimizedNotes": "الملاحظات المدققة والمنسقة",
  "optimizedTraps": "المطبات والأخطاء الشائعة المدققة",
  "optimizedExamGuidance": "طريقة الامتحان المدققة",
  "optimizedExampleText": "تمرين التطبيق العملي المصحح والمدقق",
  "optimizedSolutionText": "حل تمرين التطبيق العملي المصحح والمدقق",
  "optimizedExtraExampleText": "التمرين الإضافي المصحح والمدقق",
  "optimizedExtraSolutionText": "حل التمرين الإضافي المصحح والمدقق"
}
`;

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  const textResp = response.text || "{}";
  const parsed = cleanJson(textResp);
  return {
    isCorrect: typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : true,
    notes: parsed.notes || "تم إجراء التدقيق العلمي واللغوي والتنسيق الاحترافي للفقرة بنجاح.",
    optimizedTitle: parsed.optimizedTitle || title,
    optimizedContent: parsed.optimizedContent || content,
    optimizedGuidance: parsed.optimizedGuidance || guidance || '',
    optimizedNotes: parsed.optimizedNotes || notesText || '',
    optimizedTraps: parsed.optimizedTraps || trapsText || '',
    optimizedExamGuidance: parsed.optimizedExamGuidance || examGuidanceText || '',
    optimizedExampleText: parsed.optimizedExampleText || exampleText || '',
    optimizedSolutionText: parsed.optimizedSolutionText || solutionText || '',
    optimizedExtraExampleText: parsed.optimizedExtraExampleText || extraExampleText || '',
    optimizedExtraSolutionText: parsed.optimizedExtraSolutionText || extraSolutionText || ''
  };
}

// ============================================================================
// 📊 Comprehensive Test Evaluation AI Service
// ============================================================================

export async function evaluateTestWithReferences(
  testTitle: string,
  testData: any,
  references: { name: string; content: string }[]
): Promise<any> {
  const referencesSummary = references.map((r, i) => `Reference ${i+1} [Name: ${r.name}]:\n${r.content.substring(0, 40000)}`).join("\n---\n");

  const prompt = `
You are a top-tier educational auditing expert and math syllabus inspector for the Syrian/Arab curriculum.
Your job is to perform a comprehensive, precise, and scientifically accurate evaluation of a math test against one or more specified educational reference textbooks/PDF documents.

TEST DETAILS:
Title: ${testTitle}
Test Structure and Questions:
${JSON.stringify(testData, null, 2)}

SPECIFIED REFERENCES FOR COMPARISON (OCR DATA):
${referencesSummary}

Your analysis must be extremely thorough, scientific, and provide exact statistics. Generate the output as a structured JSON object with the following schema:
{
  "overallDifficulty": "سهل" | "متوسط" | "صعب",
  "difficultyJustification": "Detailed analysis of why this overall difficulty was chosen...",
  "questionDifficulties": [
    {
      "sectionTitle": "Section name (e.g., أولاً)",
      "questionNumber": 1,
      "text": "Question snippet...",
      "difficulty": "سهل" | "متوسط" | "صعب",
      "justification": "Why this question's difficulty was set, based on curriculum norms..."
    }
  ],
  "difficultyProgression": {
    "isGradual": true | false,
    "analysis": "Detailed feedback on the difficulty progression (التدرج في الصعوبة) of the test. Does it transition logically from direct concepts to complex questions/problems? How is the balance?",
    "improvementSuggestions": "Suggestions to improve difficulty progression..."
  },
  "referenceStatistics": {
    "perReferencePercentages": [
      {
        "referenceName": "Name of the reference",
        "percentage": 45.5,
        "questionsCount": 5,
        "justification": "Why these questions correspond to this reference, matching with specific concepts..."
      }
    ],
    "perConceptPercentages": [
      {
        "conceptName": "Concept / Unit name (e.g., المتتاليات, نهاية متتالية)",
        "percentage": 30.0,
        "questionsCount": 3,
        "justification": "Which questions test this concept and how they match the reference's teaching..."
      }
    ],
    "comparisonTable": [
      {
        "questionText": "Question snippet...",
        "matchedConcept": "Matched concept/example from references...",
        "status": "طابق المفهوم تماماً" | "تطبيق معدل بذكاء" | "تمرين مركب مستحدث",
        "description": "Analysis of how this question compares to the exercises, examples, and theorems of the selected reference."
      }
    ]
  },
  "scientificAccuracy": {
    "isAccurate": true | false,
    "detectedErrors": [
      {
        "location": "Section X, Question Y",
        "errorType": "خطأ علمي" | "خطأ صياغة" | "خطأ خيارات" | "خطأ تنسيق",
        "description": "Detailed scientific description of the error...",
        "suggestedFix": "Precise mathematical correction..."
      }
    ],
    "generalAuditComment": "Comprehensive review of the test's scientific and mathematical rigor..."
  },
  "estimatedSolvingTime": {
    "totalMinutes": 180,
    "perSectionEstimation": [
      {
        "sectionTitle": "Section Title",
        "minutes": 45,
        "averageStudentSpeedAnalysis": "Breakdown of how much time an average student needs for this section and why..."
      }
    ],
    "justification": "Why this total time is appropriate for an average student under normal exam conditions..."
  },
  "recommendations": [
    "Recommendation 1...",
    "Recommendation 2..."
  ]
}

CRITICAL CONSTRAINTS (MANDATORY):
1. STATISTICS MUST BE EXACT: Calculate the exact percentages based on the total number of questions/points. For reference percentages, use the names of the selected references exactly as provided in the Reference headers above.
2. LATEX COMPATIBILITY: Wrap all mathematical variables, equations, or numbers in single dollar signs '$ ... $'. DO NOT use double dollar signs '$$'.
3. NO HALLUCINATION: Be extremely precise. Match actual mathematical concepts in the Syrian syllabus (such as المتتاليات, نهاية متتالية, الاشتقاق, التوابع الأسية واللوغاريتمية, الأشعة في الفراغ, الأعداد العقدية, إلخ).
4. PROFESSIONAL ARABIC: Use formal, premium educational Arabic terminology (use 'تابع' instead of 'دالة').
5. STRICT JSON RULE: Do NOT include any literal newlines inside JSON string values. Use '\\\\n' for line breaks.

Ensure the returned JSON is syntactically perfect and matches the schema exactly.
`;

  console.log("Evaluating test against references...");
  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  return cleanJson(response.text || "{}");
}

// ============================================================================
// 🧠 Pattern Recognition & Guided Questions Generator for Practice (تدرّب)
// ============================================================================
export interface GeneratedGuidedQuestionResult {
  patternType: string; // e.g. "إثبات بالتراجع" أو "دراسة نهاية متتالية عبر الإحاطة"
  guidedQuestions: {
    id: string;
    questionOrder: number;
    title: string;
    prompt: string;
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
      misconceptionDiagnosis?: string;
    }[];
    hint?: string;
    hintLevel1?: string;
    hintLevel2?: string;
    skipExplanation?: string;
    conceptMap?: string;
    isFinalResult?: boolean;
  }[];
}

export async function generateGuidedQuestionsForExercise(
  exercise: {
    title: string;
    questionText: string;
    solutionText?: string;
    strategyText?: string;
  },
  context?: {
    grade?: string;
    subject?: string;
    unit?: string;
    lessonTitle?: string;
  }
): Promise<GeneratedGuidedQuestionResult> {
  const prompt = `أنت خبير تربوي وموجّه اختصاصي أول في مادة الرياضيات للمناهج السورية (الثالث الثانوي العلمي - بكالوريا).
مهمتك الأساسية هي تحويل هذا التمرين من فقرة "تدرّب" إلى "مسار تفكير تفاعلي ومحطات تدريب للتعرف الفوري على النمط البنيوي للمسألة" (Pattern Recognition in Exam Conditions).

الهدف التربوي الاستراتيجي:
الهدف ليس مجرد حفظ الحلول، بل تدريب عقل الطالب على تفكيك بنية المسألة فور قراءتها في الامتحان وتحديد النمط والمفاتيح الرياضية عبر سلّم تلميحات مزدوج (Hint Ladder) وتشخيص دقيق.

بيانات التمرين:
- عنوان التمرين: ${exercise.title || 'تمرين تدريبي'}
- نص مسألة التمرين:
${exercise.questionText}

${exercise.strategyText ? `- فكرة واستراتيجية الحل السريعة المتاحة:\n${exercise.strategyText}\n` : ''}
${exercise.solutionText ? `- الحل التفصيلي للتمرين:\n${exercise.solutionText}\n` : ''}
${context?.lessonTitle ? `- عنوان الدرس الأب: ${context.lessonTitle}` : ''}
${context?.unit ? `- الوحدة الدراسية: ${context.unit}` : ''}
${context?.grade ? `- الصف: ${context.grade}` : ''}

المطلوب:
قم بتوليد منظومة متكاملة من 4 محطات أسئلة موجهة (Guided Cognitive Stations) كالتالي:

1. **المحطة الأولى: التعرف البنيوي وتشخيص النمط (Pattern Recognition & Problem Type)**
   - السؤال: يسأل الطالب بدقة عن تشخيص بنية المسألة، المعطيات الأساسية، والمطلوب الرياضي المحدد.
   - 4 خيارات (واحد فقط صحيح، وثلاثة مشتتات ذكية شائعة مع تشخيص سوء الفهم لكل مشتت في \`misconceptionDiagnosis\`).
   - سلّم التلميحات المزدوج:
     * \`hintLevel1\`: نقلة مفاهيمية عامة توجّه لأي فكرة أو قانون يجب استحضاره دون كشف الخطوة أو أي جزء من الحل.
     * \`hintLevel2\`: تلميح قريب من الحل (Bottom-out hint) يقترب من الخطوة الفعلية دون كتابتها حرفياً كاملة.
     * \`skipExplanation\`: سطران موجزان لكيفية التفكير الصحيح في هذه المحطة تحديداً دون إعطاء الجواب المباشر.
   - خريطة الحل / المسار المعرفي (\`conceptMap\`).

2. **المحطة الثانية: اختيار الأداة الرياضية والقانون المنطلق (Tool & Theorem Selection)**
   - السؤال: يسأل الطالب عن المبرهنة، القاعدة، أو القانون الرياضي الواجب استحضاره أولاً للبدء.
   - 4 خيارات مع تشخيص المشتتات (\`misconceptionDiagnosis\`).
   - \`hintLevel1\` + \`hintLevel2\` + \`skipExplanation\` + \`conceptMap\`.

3. **المحطة الثالثة: الخطوة التنفيذية المفصلية والتحويل الجبري (Core Execution Step)**
   - السؤال: يسأل عن الخطوة الجوهرية أو التحويل الجبري / التحليلي الدقيق في منتصف الحل.
   - 4 خيارات مع تشخيص المشتتات (\`misconceptionDiagnosis\`).
   - \`hintLevel1\` + \`hintLevel2\` + \`skipExplanation\` + \`conceptMap\`.

4. **المحطة الرابعة والأخيرة: الناتج النهائي والخلاصة الرياضية (Final Result Station)**
   - يجب وضع حقل \`"isFinalResult": true\` حصراً لهذه المحطة!
   - السؤال: يسأل عن الناتج النهائي الدقيق أو النتيجة الحسابية/البرهانية النهائية للتمرين.
   - 4 خيارات (واحد صحيح، وثلاثة مشتتات حسابية قريبة جداً مع \`misconceptionDiagnosis\` لكل خيار خاطئ يشخص نقطة الانحراف المحتملة في التفكير).
   - لا تلميحات هنا للمحطة الرابعة لأنها محطة التزام وتقييم مباشر.

صيغة الاستجابة JSON الصارمة:
{
  "patternType": "اسم النمط البنيوي (مثال: إثبات صحة قضية بالتراجع للمتتاليات)",
  "guidedQuestions": [
    {
      "id": "q1",
      "questionOrder": 1,
      "title": "المحطة الأولى: التعرف البنيوي وتشخيص النمط",
      "prompt": "صياغة السؤال الموجه الأول...",
      "options": [
        { "id": "opt_1_1", "text": "الخيار الأول...", "isCorrect": true, "misconceptionDiagnosis": "إجابة دقيقة وصحيحة." },
        { "id": "opt_1_2", "text": "الخيار الثاني...", "isCorrect": false, "misconceptionDiagnosis": "تشخيص سبب الخطأ في هذا الخيار..." },
        { "id": "opt_1_3", "text": "الخيار الثالث...", "isCorrect": false, "misconceptionDiagnosis": "تشخيص سبب الخطأ..." },
        { "id": "opt_1_4", "text": "الخيار الرابع...", "isCorrect": false, "misconceptionDiagnosis": "تشخيص سبب الخطأ..." }
      ],
      "hint": "تلميح توجيهي عام...",
      "hintLevel1": "تلميح المستوى 1: نقلة مفاهيمية عامة...",
      "hintLevel2": "تلميح المستوى 2: تلميح قريب من الحل...",
      "skipExplanation": "كيفية التفكير في هذه المحطة باختصار في سطرين...",
      "conceptMap": "الخريطة المعرفية ومسار التفكير المنطقي...",
      "isFinalResult": false
    },
    {
      "id": "q2",
      "questionOrder": 2,
      "title": "المحطة الثانية: اختيار الأداة والقانون المنطلق",
      "prompt": "صياغة السؤال الموجه الثاني...",
      "options": [
        { "id": "opt_2_1", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
        { "id": "opt_2_2", "text": "...", "isCorrect": true, "misconceptionDiagnosis": "إجابة صحيحة." },
        { "id": "opt_2_3", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
        { "id": "opt_2_4", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
      ],
      "hint": "تلميح عام...",
      "hintLevel1": "تلميح المستوى 1...",
      "hintLevel2": "تلميح المستوى 2...",
      "skipExplanation": "كيف نفكر في هذه المحطة...",
      "conceptMap": "خريطة مسار الحل...",
      "isFinalResult": false
    },
    {
      "id": "q3",
      "questionOrder": 3,
      "title": "المحطة الثالثة: الخطوة التنفيذية والتحويل الجبري المفصلي",
      "prompt": "صياغة السؤال الموجه الثالث...",
      "options": [
        { "id": "opt_3_1", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
        { "id": "opt_3_2", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." },
        { "id": "opt_3_3", "text": "...", "isCorrect": true, "misconceptionDiagnosis": "إجابة صحيحة." },
        { "id": "opt_3_4", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "..." }
      ],
      "hint": "تلميح...",
      "hintLevel1": "تلميح المستوى 1...",
      "hintLevel2": "تلميح المستوى 2...",
      "skipExplanation": "كيف نفكر في هذه المحطة...",
      "conceptMap": "مسار الحل...",
      "isFinalResult": false
    },
    {
      "id": "q4",
      "questionOrder": 4,
      "title": "المحطة الرابعة: الناتج النهائي والتحقق الرياضي",
      "prompt": "ما هو الناتج النهائي أو الخلاصة الرياضية الدقيقة للتمرين؟",
      "options": [
        { "id": "opt_4_1", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "اختيارك لهذا الناتج يشير إلى إغفال شرط التقارب أو خطأ في إشارة الحد الأخير..." },
        { "id": "opt_4_2", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "تشخيص محدد للخطأ الحسابي في هذا الخيار..." },
        { "id": "opt_4_3", "text": "...", "isCorrect": false, "misconceptionDiagnosis": "تشخيص محدد..." },
        { "id": "opt_4_4", "text": "...", "isCorrect": true, "misconceptionDiagnosis": "أحسنت! هذا بالضبط ما توقعناه ✅" }
      ],
      "hint": "تلميح حول التدقيق الحسابي للناتج...",
      "conceptMap": "طريقة التحقق من صحة الناتج النهائي...",
      "isFinalResult": true
    }
  ]
}

قواعد ملزمة:
1. استخدم صيغة LaTeX لجميع الرموز والمعادلات بين علامات '$...$' مفردة حصراً.
2. تأكد تماماً أن خياراً واحداً فقط في كل محطة يحمل isCorrect: true.
3. التزم بلغة عربية فصيحة ومصطلحات المنهاج السوري الدقيقة.
4. إرجاع JSON صحيح وصالح تماماً.`;

  const enrichedPrompt = globalOrchestrator.buildEnrichedPrompt(prompt, context?.unit || context?.lessonTitle || exercise.title || "تمرين تدرب");

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: enrichedPrompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  const parsed = cleanJson(response.text || "{}");
  
  // التدقيق والتحقق من الأسئلة الموجهة
  if (Array.isArray(parsed.guidedQuestions)) {
    const validated = globalOrchestrator.validateQuestionSet(
      parsed.guidedQuestions.map((q: any) => ({
        ...q,
        questionText: q.prompt || q.title,
      }))
    );
    parsed.guidedQuestions = parsed.guidedQuestions.map((q: any, idx: number) => ({
      ...q,
      prompt: validated.questions[idx]?.questionText || q.prompt,
      options: validated.questions[idx]?.options || q.options,
    }));
  }

  return parsed as GeneratedGuidedQuestionResult;
}

// ============================================================================
// 🎯 9. AI Unit Quiz Generator (اختبار الوحدة الشامل)
// ============================================================================
export interface GeneratedUnitQuizResult {
  title: string;
  unit: string;
  totalQuestions: number;
  questions: Array<{
    id: string;
    questionNumber: number;
    questionText: string;
    options: Array<{
      id: string;
      text: string;
      isCorrect: boolean;
    }>;
    correctOptionId: string;
    explanation?: string;
    hint?: string;
    topic?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
}

export async function generateUnitQuizAI(
  doc: Document,
  sections: LessonSection[],
  questionCount: number = 10
): Promise<GeneratedUnitQuizResult> {
  const sectionsSummary = sections.map((s, idx) => {
    let exSummary = '';
    if (s.practiceExercises && s.practiceExercises.length > 0) {
      exSummary += `\nتمارين تدرّب: ${s.practiceExercises.map(e => e.questionText || e.title).join(' | ')}`;
    }
    if (s.practicalExercises && s.practicalExercises.length > 0) {
      exSummary += `\nتمارين تطبيقية: ${s.practicalExercises.map(e => e.questionText || e.title).join(' | ')}`;
    }
    return `[فقرة ${idx + 1}: ${s.title}]\nالمحتوى: ${s.content ? s.content.substring(0, 400) : ''}...\nإرشادات وامتحانات: ${s.guidance || ''} ${s.examGuidance || ''}${exSummary}`;
  }).join('\n\n');

  const basePrompt = `أنت خبير تربوي وموجّه أول لمادة الرياضيات في الجمهورية العربية السورية (المنهاج الحديث للثانوية العامة / البكالوريا العلمي).
مهمتك: تأليف "اختبار الوحدة" (Unit Quiz / Exam) شامل واحترافي مؤلف من ${questionCount} أسئلة على الأقل من نمط الاختيار من متعدد (MCQ) لهذه الوحدة.

بيانات الوحدة والكراس:
- عنوان الكراس: ${doc.title}
- الوحدة: ${doc.unit || 'الوحدة الدراسية'}
- الصف والمادة: ${doc.grade} - ${doc.subject}
- الجزء: ${doc.part || ''}

ملخص فقرات ومفاهيم وتمارين الوحدة:
${sectionsSummary}

المطلوب:
1. توليد ${questionCount} سؤالاً متنوعاً يغطي كامل مفاصل ومفاهيم الوحدة بالتدرج البيداغوجي:
   - أسئلة مفاهيمية ورصد الشروط والقواعد (3 أسئلة).
   - أسئلة حسابية وتطبيق مباشر للقوانين والنظريات (4 أسئلة).
   - أسئلة مسائل مركبة والربط والاستنتاج والتمييز بين الحالات (3 أسئلة).
2. لكل سؤال:
   - id: معرف فريد مثل "uq_1", "uq_2", إلخ.
   - questionNumber: رقم السؤال من 1 إلى ${questionCount}.
   - questionText: نص السؤال بأسلوب امتحاني واضح ودقيق، واستخدام صيغة LaTeX الرياضية بين '$...$' مفردة حصراً للمعادلات والرموز.
   - options: مصفوفة من 4 خيارات حصرية (أ، ب، ج، د) دقيقة ومتوازنة رياضياً، خيار واحد منها صحيح فقط (isCorrect: true) وثلاث مموهات واقعية تعكس أخطاء شائعة (isCorrect: false).
   - correctOptionId: معرف الخيار الصحيح المطابق تماماً لـ id الخيار في المصفوفة.
   - explanation: شرح تفصيلي لطريقة الحل الصحيحة خطوة بخطوة باللاتكس '$...$'.
   - hint: تلميح تربوي يساعد الطالب على استرجاع القاعدة المناسبة.
   - topic: موضوع السؤال داخل الوحدة.
   - difficulty: "easy" أو "medium" أو "hard".

يجب أن تكون النتيجة حصراً بتنسيق JSON صالح كالتالي:
{
  "title": "اختبار ${doc.unit || doc.title}",
  "unit": "${doc.unit || doc.title}",
  "totalQuestions": ${questionCount},
  "questions": [
    {
      "id": "uq_1",
      "questionNumber": 1,
      "topic": "...",
      "difficulty": "easy",
      "questionText": "...",
      "options": [
        { "id": "opt_1_a", "text": "...", "isCorrect": true },
        { "id": "opt_1_b", "text": "...", "isCorrect": false },
        { "id": "opt_1_c", "text": "...", "isCorrect": false },
        { "id": "opt_1_d", "text": "...", "isCorrect": false }
      ],
      "correctOptionId": "opt_1_a",
      "explanation": "شرح الحل النموذجي...",
      "hint": "تلميح تربوي..."
    }
  ]
}

قواعد ملزمة:
1. استخدم LaTeX بين علامات '$...$' مفردة حصراً لجميع المعادلات والرموز. يُمنع استخدام '$$'.
2. احرص على أن تكون الخيارات الأربعة فريدة ومقنعة وتحتوي خياراً واحداً صحيحاً تماماً.
3. التزم باللغة العربية الفصيحة ومصطلحات المنهاج السوري الدقيقة (استخدم 'تابع' بدلاً من 'دالة'، لا تستخدم الجداء الخارجي للأشعة).
4. إرجاع JSON صحيح وصالح تماماً بدون أي نصوص تمهيدية أو ختامية.`;

  // 1. إثراء التوجيه عبر طبقة المايسترو ومنظومة الوكلاء
  const enrichedPrompt = globalOrchestrator.buildEnrichedPrompt(basePrompt, doc.unit || doc.title);

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: enrichedPrompt,
    config: {
      temperature: 0.25,
      responseMimeType: "application/json"
    }
  });

  const parsed = cleanJson(response.text || "{}");

  // 2. التدقيق والتحقق الرياضي واللاتكس عبر وكيل التدقيق
  if (Array.isArray(parsed.questions)) {
    const validated = globalOrchestrator.validateQuestionSet(parsed.questions);
    parsed.questions = validated.questions;
    (parsed as any).validationScore = validated.averageScore;
    (parsed as any).validationResults = validated.validationResults;
  }

  return parsed as GeneratedUnitQuizResult;
}









export async function generateUnitMindMapAI(
  doc: Document,
  sections: LessonSection[]
): Promise<{ title: string; svgCode: string; markdownSchema?: string; treeData?: any }> {
  // Extract all sections, practice exercises, and rules
  const sectionsSummary = sections.map((s, idx) => {
    let extra = '';
    if (s.practiceExercises && s.practiceExercises.length > 0) {
      extra += '\nتمارين وتطبيقات: ' + s.practiceExercises.map(e => e.questionText || e.title).join(' | ');
    }
    return `[الفقرة ${idx + 1}: ${s.title}]\nالمحتوى المعرفي: ${s.content ? s.content.substring(0, 1800) : ''}\n${extra}`;
  }).join('\n\n');

  const prompt = `# 🧭 نظام هندسة الخرائط الذهنية والمفاهيمية الذكية (Sleek Minimalist Mind Map Engine)

## 🎯 الهوية والدور:
أنت خبير تصميم خرائط ذهنية ومعرفية رياضية فائقة الجمال والوضوح (Minimalist Visual Mindmap Designer).
مهمتك هي قراءة مفاهيم الوحدة وتحويلها إلى **خريطة ذهنية بصرية أنيقة، مركزة، وموجزة جداً** بدون حشو أو نصوص طويلة أو شروح مفرطة (كما في الخرائط الذهنية الحديثة المتناسقة).

- **الوحدة الدراسية:** ${doc.unit || doc.title}
- **المادة والمرحلة:** ${doc.subject || 'الرياضيات'} - ${doc.grade || 'الثالث الثانوي العلمي'}

محتوى الوحدة والمفاهيم:
${sectionsSummary}

---

## 💎 القواعد البصرية والهندسية الصارمة (Strict Rules):

1. **الإيجاز التام والتركيز (No Long Text / High Conciseness):**
   - **يُمنع منعاً باتاً كتابة فقرات أو شروح طويلة** في العقد.
   - عنوان العقدة (\`label\`) يجب ألا يتجاوز **3 إلى 5 كلمات** كحد أقصى (مثل: "المتتالية الحسابية", "دراسة اطراد المتتالية", "خطوة التحقق $E(n_0)$", "نهاية تابع مركب").
   - اترك حقل \`description\` فارغاً أو في حدود جملة واحدة فائقة الاختصار (أقل من 8 كلمات) لتفادي أي تكدس بصري.

2. **التنظيم الهيكلي المتوازن (Hierarchical Branching):**
   - **العقدة المركزية (\`root\`):** عنوان الوحدة الرئيسي والمفهوم الجامع (مثل: "المتتاليات والإثبات بالتدريج").
   - **الفروع الرئيسية (2 إلى 4 فروع أساسية):** المحاور الكبرى للوحدة (مثل: "الإثبات بالتدريج", "دراسة اطراد المتتالية", "المتتاليات التدريجية").
   - **العقد الفرعية / التطبيقية (2 إلى 3 تحت كل فرع):** الحالات الخاصة، الخطوات الدقيقة، أو القوانين الحاكمة.

3. **الرموز والصيغ الرياضية (Inline LaTeX):**
   - ضع الصيغة الرياضية الأساسية مباشرة في حقل \`latex\` أو مدمجة باختصار شديد داخل \`label\` بين علامتي \`$ ... $\` (مثل: \`$u_{n+1} = u_n + r$\` أو \`$u_{n+1} - u_n > 0$\` أو \`$\\\\lim_{x \\\\to a} f(x)$\`).
   - لا تستخدم \\left أو \\right في كود LaTeX.

4. **تسميات الروابط الدلالية (Short Edge Labels):**
   - كل رابط (\`from\` ➔ \`to\`) يجب أن يحمل تسمية قصيرة ومحددة (كلمة أو كلمتان فقط) مثل:
     - "تتضمن دراسة" | "تستخدم لإثبات" | "تعتمد على" | "حالات خاصة" | "فحص" | "تطبيق" | "خطوة 1" | "خطوة 2".

---

## 📤 هيكل الرد المطلوب (Strict Minimal JSON Schema):

{
  "title": "${doc.unit || doc.title}",
  "unit": "${doc.unit || doc.title}",
  "nodes": [
    {
      "id": "root",
      "label": "العنوان الرئيسي للوحدة",
      "category": "root",
      "latex": null
    },
    {
      "id": "branch_1",
      "label": "الفرع الرئيسي الأول",
      "category": "concept",
      "latex": null
    },
    {
      "id": "sub_1_1",
      "label": "مفهوم أو خطوة فرعية",
      "category": "procedure",
      "latex": "$E(n_0)$"
    },
    {
      "id": "sub_1_2",
      "label": "خطوة البرهان",
      "category": "procedure",
      "latex": "$E(n) \\\\Rightarrow E(n+1)$"
    },
    {
      "id": "branch_2",
      "label": "الفرع الرئيسي الثاني",
      "category": "concept",
      "latex": null
    },
    {
      "id": "sub_2_1",
      "label": "المتتالية الحسابية",
      "category": "theorem",
      "latex": "$u_{n+1} = u_n + r$"
    },
    {
      "id": "sub_2_2",
      "label": "المتتالية الهندسية",
      "category": "theorem",
      "latex": "$u_{n+1} = q \\\\cdot u_n$"
    }
  ],
  "edges": [
    {
      "from": "root",
      "to": "branch_1",
      "label": "تستخدم لإثبات"
    },
    {
      "from": "branch_1",
      "to": "sub_1_1",
      "label": "خطوة"
    },
    {
      "from": "branch_1",
      "to": "sub_1_2",
      "label": "خطوة"
    },
    {
      "from": "root",
      "to": "branch_2",
      "label": "تتضمن دراسة"
    },
    {
      "from": "branch_2",
      "to": "sub_2_1",
      "label": "حالات خاصة"
    },
    {
      "from": "branch_2",
      "to": "sub_2_2",
      "label": "حالات خاصة"
    }
  ],
  "summary": "خلاصة مكثفة وموجزة للترابط البصري للوحدة."
}
`;

  try {
    const response = await generateWithFallback(MODELS_FALLBACK, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      }
    });

    const parsed = cleanJson(response.text || "{}");
    const mapTitle = parsed.title || `خريطة مفاهيم: ${doc.unit || doc.title}`;
    
    // Normalize data through concept map parser
    const normalizedConceptMap = normalizeConceptMapData(parsed, mapTitle);
    const svgCode = generateSvgFromConceptMap(normalizedConceptMap, mapTitle);

    // Markdown representation for export & schema inspection
    let markdownSchema = parsed.markdownSchema || '';
    if (!markdownSchema && normalizedConceptMap.nodes.length > 0) {
      markdownSchema = `# 🧭 ${mapTitle}\n\n## 📝 الخلاصة التركيبية:\n${normalizedConceptMap.summary || 'خريطة المفاهيم والعلاقات الهيكلية للوحدة.'}\n\n## 📊 العقد والمفاهيم الرئيسية:\n` +
        normalizedConceptMap.nodes.map(n => `- **[${CATEGORY_CONFIG[n.category as keyof typeof CATEGORY_CONFIG]?.label || n.category}]** ${n.label}${n.description ? `: ${n.description}` : ''}${n.latex ? ` (${n.latex})` : ''}`).join('\n') +
        `\n\n## 🔗 شبكة الروابط والعلاقات:\n` +
        normalizedConceptMap.edges.map(e => {
          const src = normalizedConceptMap.nodes.find(n => n.id === e.from)?.label || e.from;
          const tgt = normalizedConceptMap.nodes.find(n => n.id === e.to)?.label || e.to;
          return `- **${src}** ──( ${e.label || 'يرتبط بـ'} )──➔ **${tgt}**`;
        }).join('\n');
    }

    return {
      title: mapTitle,
      svgCode: svgCode,
      markdownSchema: markdownSchema,
      treeData: normalizedConceptMap
    };
  } catch (error) {
    console.error("Error generating unit concept map:", error);
    throw new Error("حدث خطأ أثناء توليد الخريطة المفاهيمية بالذكاء الاصطناعي.");
  }
}

// ============================================================================
// 📚 10. AI Comprehensive Unit Review Generator (مراجعة شاملة للوحدة)
// ============================================================================
export interface GeneratedUnitReviewResult {
  title: string;
  unit: string;
  summaryText: string;
  definitions: Array<{
    id: string;
    term: string;
    explanation: string;
    formula?: string;
  }>;
  theorems: Array<{
    id: string;
    name: string;
    statement: string;
    conditions?: string;
    notes?: string;
  }>;
  results: Array<{
    id: string;
    title: string;
    statement: string;
    formula?: string;
  }>;
  trapsAndTips: Array<{
    id: string;
    title: string;
    trap: string;
    correctMethod: string;
  }>;
  formulasSummary?: string;
}

export async function generateUnitComprehensiveReviewAI(
  doc: Document,
  sections: LessonSection[],
  customInstruction?: string
): Promise<GeneratedUnitReviewResult> {
  const sectionsContent = sections.map((s, idx) => {
    const title = s.title || `فقرة ${idx + 1}`;
    const text = s.content ? s.content.trim() : '';
    const guidance = s.guidance ? `\n- إرشادات المعلم: ${s.guidance}` : '';
    const notes = s.notes ? `\n- ملاحظات إضافية: ${s.notes}` : '';
    const traps = s.traps ? `\n- مطبات امتحانية: ${s.traps}` : '';
    const examGuidance = s.examGuidance ? `\n- توجيه امتحاني: ${s.examGuidance}` : '';
    const example = s.exampleText ? `\n- مثال توضيحي: ${s.exampleText}` : '';
    return `### [الفقرة ${idx + 1}: ${title}]\n${text}${guidance}${notes}${traps}${examGuidance}${example}`;
  }).join('\n\n---\n\n');

  const prompt = `أنت خبير تربوي وموجّه أول لمادة الرياضيات في الجمهورية العربية السورية (المرحلة الثانوية - بكالوريا علمي).
مهمتك: إعداد "مراجعة شاملة للأفكار النظرية للوحدة" (Comprehensive Theoretical Review) تجمع كافة المفاصل النظرية للوحدة التعليمية بصياغة رياضية محكمة وأسلوب تربوي رصين.

بيانات الكراس والوحدة:
- عنوان الكراس: ${doc.title}
- الوحدة الدراسية: ${doc.unit || doc.title}
- الصف والمادة: ${doc.grade} - ${doc.subject}
- الجزء: ${doc.part || ''}

${customInstruction ? `ملاحظات وتوجيهات خاصة من المدرس:\n${customInstruction}\n` : ''}

محتوى كافة فقرات ودروس الوحدة الحالية:
${sectionsContent}

---

المطلوب استخلاصه بدقة بالغة وبأعلى المعايير الأكاديمية:
1. **التعاريف والمفاهيم الأساسية (Definitions)**:
   - استخراج جميع التعاريف والمصطلحات الرياضية المركزية في الوحدة مع شرح كل مفهوم والصيغة الرياضية الدقيقة له بـ LaTeX.
2. **المبرهنات والنظريات الأساسية (Theorems & Principles)**:
   - استخراج جميع المبرهنات، نص المبرهنة، شروط الانطلاق وتطبيقها، والملاحظات البيداغوجية المتعلقة بها.
3. **النتائج والقواعد والخواص الرياضية (Results & Corollaries)**:
   - استخراج كافة النتائج المنبثقة، الخواص الجبرية والتحليلية، والقوانين الحاسمة للحل.
4. **المطبات الامتحانية وملاحظات التوجيه الذهبي (Exam Traps & Crucial Tips)**:
   - الأخطاء الشائعة وسوء الفهم التي يقع فيها الطلاب في الامتحانات وكيفية التفكير والحل الصحيح لتفاديها.
5. **الملخص الشامل المنسق (Master Summary Text)**:
   - نص Markdown متكامل ومرتب بفواصل وعناوين فرعية، يستعرض الوحدة بشكل تسلسلي مكثف مع معادلات LaTeX واضحة بين '$...$' مفردة، ليكون مرجعاً نظرياً ذهبياً للطالب قبل الامتحان.
6. **خلاصة القوانين السريعة (Formulas Summary)**:
   - جدول أو قائمة بالقوانين والصيغ الرياضية الرمزية الحصرية للوحدة.

تنسيق الإخراج المطلوب (JSON صالح حصراً):
{
  "title": "مراجعة شاملة: ${doc.unit || doc.title}",
  "unit": "${doc.unit || doc.title}",
  "summaryText": "نص المراجعة الشاملة المنسق بصيغة Markdown مع معادلات LaTeX...",
  "definitions": [
    {
      "id": "def_1",
      "term": "اسم المفهوم أو التعريف",
      "explanation": "الشرح الدقيق للمفهوم باللغة الرياضية الفصحى...",
      "formula": "الصيغة الرمزية إن وجدت بـ LaTeX مثل $u_{n+1} - u_n = r$"
    }
  ],
  "theorems": [
    {
      "id": "thm_1",
      "name": "اسم المبرهنة (مثال: مبرهنة الإحاطة / مبرهنة التقارب المطرد)",
      "statement": "نص المبرهنة الدقيق...",
      "conditions": "شروط تطبيق المبرهنة...",
      "notes": "ملاحظات وتنبيهات تطبيقية هامة..."
    }
  ],
  "results": [
    {
      "id": "res_1",
      "title": "عنوان النتيجة أو الخاصية",
      "statement": "نص النتيجة الرياضية...",
      "formula": "العلاقة الرياضية بـ LaTeX"
    }
  ],
  "trapsAndTips": [
    {
      "id": "trap_1",
      "title": "عنوان المطب أو الخطأ الشائع",
      "trap": "وصف الخطأ الشائع الذي يرتكبه الطالب...",
      "correctMethod": "القاعدة الصحيحة والتعليل الرياضي السليم..."
    }
  ],
  "formulasSummary": "قائمة مركزة بأهم القوانين والعلاقات الرياضية للوحدة..."
}

قواعد ملزمة:
1. استخدم LaTeX بين علامات '$...$' مفردة حصراً لجميع المعادلات والرموز الرياضية.
2. احرص على استيعاب كافة الأفكار النظرية الواردة في فقرات الوحدة وعدم إغفال أي مبرهنة أو تعريف أساسي.
3. التزم بلغة عربية فصيحة ومصطلحات المنهاج السوري الدقيقة.
4. إرجاع JSON صحيح وصالح تماماً.`;

  const enrichedPrompt = globalOrchestrator.buildEnrichedPrompt(prompt, doc.unit || doc.title);

  const response = await generateWithFallback(MODELS_FALLBACK, {
    contents: enrichedPrompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  const parsed = cleanJson(response.text || "{}");
  const harmonized = globalOrchestrator.validateAndHarmonizeReview(parsed);
  return harmonized.data as GeneratedUnitReviewResult;
}
