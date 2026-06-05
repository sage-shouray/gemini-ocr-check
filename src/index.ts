import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config/env';
import { logger } from './utils/logger';
import { registerClient, unregisterClient, notifyDesktop } from './services/ws.service';
import extractRouter from './routes/extract.route';
import sessionRouter from './routes/session.route';
import { errorMiddleware } from './middleware/error.middleware';

const pkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
) as { version: string };

// ── App + HTTP server ────────────────────────────────────────────────────────
export const app = express();
const httpServer = http.createServer(app);

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  logger.debug('WebSocket client connected');

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string; sessionId?: string };
      if (msg.type === 'register' && typeof msg.sessionId === 'string') {
        registerClient(msg.sessionId, ws);
        ws.send(JSON.stringify({ type: 'registered', sessionId: msg.sessionId }));
      }
    } catch {
      // ignore unparseable frames
    }
  });

  ws.on('close', () => unregisterClient(ws));
  ws.on('error', (err) => logger.warn('WebSocket error', { error: err.message }));
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Named HTML routes must come before express.static so they win over directory listing
app.get('/', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'desktop.html'));
});

app.get('/mobile/:sessionId', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'mobile.html'));
});

app.use(express.static(path.join(process.cwd(), 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1', extractRouter);
app.use('/api/v1', sessionRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: pkg.version });
});

app.use(errorMiddleware);

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(config.PORT, () => {
  logger.info(`Server running on port ${config.PORT} [${config.NODE_ENV}]`);
});

export { notifyDesktop };
