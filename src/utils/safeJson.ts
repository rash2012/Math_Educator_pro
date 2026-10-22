/**
 * Safe JSON parser for LLM responses containing LaTeX mathematical expressions.
 * Handles unescaped backslashes, LaTeX commands (\frac, \sqrt, \alpha, \beta, \to, etc.),
 * trailing commas, and markdown code fences.
 */
export function safeParseJson<T = any>(raw: string): T {
  if (!raw || typeof raw !== 'string') {
    throw new Error('القيمة المدخلة فارغة أو غير صالحة');
  }

  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Find boundaries of JSON array or object
  const firstBracket = cleaned.indexOf('[');
  const firstBrace = cleaned.indexOf('{');
  let startIdx = 0;
  let endIdx = cleaned.length;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf(']') + 1;
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf('}') + 1;
  }

  if (startIdx >= 0 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx);
  }

  // 1. Try standard JSON.parse first
  try {
    return JSON.parse(cleaned);
  } catch (err1) {
    // 2. Fix unescaped backslashes (especially LaTeX math commands)
    try {
      // Lookbehind (?<!\\) ensures we only double backslashes that are NOT already escaped
      let fixed = cleaned.replace(/(?<!\\)\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
      // Fix \b, \f, \n, \r, \t when followed by letters (e.g. \frac, \theta, \beta, \neq, \right)
      fixed = fixed.replace(/(?<!\\)\\([bfnrt])([a-zA-Z])/g, '\\\\$1$2');
      // Remove trailing commas before closing braces or brackets
      fixed = fixed.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed);
    } catch (err2) {
      // 3. Last resort fallback
      let lastResort = cleaned.replace(/(?<!\\)\\([^"])/g, '\\\\$1').replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(lastResort);
    }
  }
}
