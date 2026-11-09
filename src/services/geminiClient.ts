/**
 * Client-side Gemini API Proxy
 * Communicates with server-side /api/gemini endpoints.
 * Never imports @google/genai or exposes API keys in browser code.
 */

export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

export enum ThinkingLevel {
  THINKING_LEVEL_UNSPECIFIED = "THINKING_LEVEL_UNSPECIFIED",
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  MINIMAL = "MINIMAL",
}

export interface GenerateContentRequest {
  model?: string;
  models?: string[];
  contents: any;
  prompt?: any;
  config?: any;
}

export interface GenerateContentResponseLike {
  text: string;
  candidates?: any[];
  usageMetadata?: any;
  modelUsed?: string;
}

/**
 * Standard content generation via server proxy
 */
export async function callServerGemini(
  params: GenerateContentRequest,
  retryCount = 0
): Promise<GenerateContentResponseLike> {
  try {
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const rawText = await response.text();

    // Check if proxy/server returned a warming-up page (e.g. Cloud Run "Starting Server..." page with 200 OK)
    const isWarmingUp = rawText.includes('Starting Server') || rawText.includes('starting server') || rawText.includes('Starting Container');
    const isHtml = rawText.trim().startsWith('<!') || rawText.trim().startsWith('<html') || rawText.includes('<body') || rawText.includes('<style');

    if ((isWarmingUp || (response.status === 200 && isHtml)) && retryCount < 5) {
      const waitMs = 1500 * (retryCount + 1);
      console.warn(`[Gemini Client Proxy] Server warming up/starting (attempt ${retryCount + 1}), retrying in ${waitMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return callServerGemini(params, retryCount + 1);
    }

    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      // If server returned HTML (e.g., 500 error page from server restart or proxy), extract human-readable text
      const cleanSnippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
      throw new Error(`استجابة غير مهيأة من خادم الذكاء الاصطناعي (${response.status}): ${cleanSnippet || 'خطأ داخلي'}`);
    }

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || `HTTP ${response.status}`;

      // Rate limit retry with backoff
      if ((response.status === 429 || String(errorMessage).includes('429')) && retryCount < 3) {
        const waitMs = Math.pow(2, retryCount) * 1500;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return callServerGemini(params, retryCount + 1);
      }

      throw new Error(errorMessage);
    }

    return {
      text: data.text || '',
      candidates: data.candidates,
      usageMetadata: data.usageMetadata,
      modelUsed: data.modelUsed,
    };
  } catch (err: any) {
    console.error('[Gemini Client Proxy Error]', err);
    throw err;
  }
}

/**
 * Server-Sent Events (SSE) streaming content generation
 */
export async function* streamServerGemini(
  params: GenerateContentRequest
): AsyncGenerator<string, void, unknown> {
  const response = await fetch('/api/gemini/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok || !response.body) {
    const rawText = await response.text();
    let errText = `HTTP ${response.status}`;
    try {
      const errObj = JSON.parse(rawText);
      errText = errObj.error || errText;
    } catch {
      const cleanSnippet = rawText.replace(/<[^>]+>/g, ' ').trim().substring(0, 120);
      errText = cleanSnippet || errText;
    }
    throw new Error(errText);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') return;

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) yield parsed.text;
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) continue;
        throw parseErr;
      }
    }
  }
}

/**
 * Connect to Gemini Live API via server WebSocket bridge
 */
export function connectServerLiveGemini(options?: { model?: string; voice?: string }): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const params = new URLSearchParams();
  if (options?.model) params.set('model', options.model);
  if (options?.voice) params.set('voice', options.voice);

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const wsUrl = `${protocol}//${host}/api/gemini/live${queryString}`;
  return new WebSocket(wsUrl);
}
