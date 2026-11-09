import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let portArg = Number(process.env.PORT);
const portIndex = process.argv.indexOf('--port');
if (!portArg && portIndex !== -1 && process.argv[portIndex + 1]) {
  portArg = Number(process.argv[portIndex + 1]);
}
const PORT = portArg || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize server-side Gemini client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const DEFAULT_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeModelName(name: string): string {
  if (!name) return 'gemini-3.8-flash';
  const trimmed = name.trim();
  // Map deprecated / unsupported models to high-throughput current models
  if (trimmed === 'gemini-2.5-pro' || trimmed === 'gemini-2.0-pro' || trimmed === 'gemini-1.5-pro') {
    return 'gemini-3.8-flash';
  }
  if (trimmed === 'gemini-2.0-flash' || trimmed === 'gemini-1.5-flash') {
    return 'gemini-3.8-flash';
  }
  return trimmed;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Generous limit for payloads containing base64 images (e.g., OCR from PDFs/past papers)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(apiKey),
      env: isProduction ? 'production' : 'development',
    });
  });

  // POST /api/gemini/generate - Standard generation with model fallback support
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      if (!apiKey) {
        return res.status(500).json({
          error: 'Gemini API key is not configured on the server. Please attach an API key in the Settings > Secrets panel.',
        });
      }

      const { model, models, contents, prompt, config } = req.body || {};
      const rawList: string[] = Array.isArray(models) && models.length > 0
        ? models
        : model
        ? [model]
        : DEFAULT_MODELS;

      // Sanitize model list and remove duplicates
      const modelList = Array.from(new Set(rawList.map(sanitizeModelName)));
      // Ensure reliable flash fallbacks are present
      if (!modelList.includes('gemini-3.8-flash')) modelList.push('gemini-3.8-flash');
      if (!modelList.includes('gemini-3.5-flash')) modelList.push('gemini-3.5-flash');

      const promptContents = contents !== undefined ? contents : prompt;
      if (promptContents === undefined) {
        return res.status(400).json({ error: 'Missing contents or prompt parameter in request body.' });
      }

      let lastError: any = null;

      for (let attempt = 0; attempt < modelList.length; attempt++) {
        const currentModel = modelList[attempt];
        try {
          const response = await ai.models.generateContent({
            model: currentModel,
            contents: promptContents,
            config: config || undefined,
          });

          return res.json({
            text: response.text || '',
            candidates: response.candidates,
            usageMetadata: response.usageMetadata,
            modelUsed: currentModel,
          });
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.response?.status;
          console.warn(`[Server Gemini] Model ${currentModel} failed (status: ${status}): ${err?.message || err}`);

          if (String(status).includes('429') && attempt < modelList.length - 1) {
            await delay(1200);
          } else {
            await delay(400);
          }
        }
      }

      // Convert any error status (including string statuses like 'RESOURCE_EXHAUSTED') into a valid HTTP numeric code
      let httpCode = 500;
      const rawCode = lastError?.status || lastError?.code || lastError?.error?.code || lastError?.response?.status;
      if (typeof rawCode === 'number' && rawCode >= 400 && rawCode < 600) {
        httpCode = rawCode;
      } else {
        const errStr = String(lastError?.message || lastError?.status || '');
        if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.toLowerCase().includes('quota')) {
          httpCode = 429;
        } else if (errStr.includes('404') || errStr.includes('NOT_FOUND')) {
          httpCode = 404;
        } else if (errStr.includes('400') || errStr.includes('INVALID_ARGUMENT')) {
          httpCode = 400;
        }
      }

      return res.status(httpCode).json({
        error: lastError?.message || 'Failed to generate content with Gemini API.',
        status: httpCode,
      });
    } catch (globalErr: any) {
      console.error('[Server Gemini Error]', globalErr);
      if (!res.headersSent) {
        return res.status(500).json({
          error: globalErr?.message || 'Internal server error while calling Gemini API.',
        });
      }
    }
  });

  // POST /api/gemini/stream - Server-Sent Events (SSE) streaming endpoint
  app.post('/api/gemini/stream', async (req, res) => {
    try {
      if (!apiKey) {
        return res.status(500).json({
          error: 'Gemini API key is not configured on the server.',
        });
      }

      const { model, models, contents, prompt, config } = req.body || {};
      const targetModel = sanitizeModelName(model || (Array.isArray(models) && models[0]) || 'gemini-3.8-flash');
      const promptContents = contents !== undefined ? contents : prompt;

      if (promptContents === undefined) {
        return res.status(400).json({ error: 'Missing contents or prompt parameter in request body.' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseStream = await ai.models.generateContentStream({
        model: targetModel,
        contents: promptContents,
        config: config || undefined,
      });

      for await (const chunk of responseStream) {
        const chunkText = chunk.text || '';
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      console.error('[Server Gemini Stream Error]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Stream generation failed' });
      } else {
        res.write(`data: ${JSON.stringify({ error: err?.message || 'Stream error' })}\n\n`);
        res.end();
      }
    }
  });

  // WebSocket Server for Live API (real-time voice & low latency streaming)
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (clientWs: WebSocket, request) => {
    console.log('[Live WebSocket] Client connected to Live API proxy');
    if (!apiKey) {
      clientWs.send(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on server' }));
      clientWs.close();
      return;
    }

    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const model = url.searchParams.get('model') || 'gemini-3.8-live';
      const voice = url.searchParams.get('voice') || 'Zephyr';

      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
        callbacks: {
          onmessage: (message: any) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;

            for (const part of message.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
              if (part.text) {
                clientWs.send(JSON.stringify({ text: part.text }));
              }
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (e: any) => {
            console.error('[Live Session Error]', e);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ error: e?.message || 'Live API error' }));
            }
          },
          onclose: () => {
            console.log('[Live Session Closed]');
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      clientWs.on('message', (data: any) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (parsed.text) {
            session.sendRealtimeInput({
              text: parsed.text,
            });
          } else if (parsed.realtimeInput) {
            session.sendRealtimeInput(parsed.realtimeInput);
          }
        } catch (e: any) {
          console.warn('[Live Client Message Parse Error]', e?.message || e);
        }
      });

      clientWs.on('close', () => {
        try {
          (session as any)?.close?.();
        } catch {}
      });
    } catch (sessionErr: any) {
      console.error('[Live Connect Error]', sessionErr);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: sessionErr?.message || 'Failed to establish Live session' }));
        clientWs.close();
      }
    }
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/api/gemini/live' || pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  let viteMiddleware: any = null;

  // Mount Vite middleware in development mode, or serve static dist in production
  if (!isProduction) {
    app.use(async (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      // Wait briefly if Vite is still bootstrapping
      const startWait = Date.now();
      while (!viteMiddleware && Date.now() - startWait < 6000) {
        await delay(100);
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      next();
    });

    createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    })
      .then((vite) => {
        viteMiddleware = vite.middlewares;
        console.log('[Server] Vite middleware mounted and ready in development mode');
      })
      .catch((err) => {
        console.error('[Server] Failed to initialize Vite dev server:', err);
      });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[Server] Serving production static files from ${distPath}`);
  }

  // Start listening immediately so port 3000 binds without delay
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Math Educator Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
