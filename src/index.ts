import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config/env';
import { logger } from './utils/logger';
import {
  registerClient,
  unregisterClient,
  notifyDesktop,
  registerMobileClient,
  unregisterMobileClient,
  relayMobileEvent,
} from './services/ws.service';
import { getSession } from './services/session.service';
import extractRouter from './routes/extract.route';
import sessionRouter from './routes/session.route';
import { errorMiddleware } from './middleware/error.middleware';
import type { MobileEventType } from './types/invoice.types';

const pkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
) as { version: string };

// ── App + HTTP server ────────────────────────────────────────────────────────
export const app = express();
const httpServer = http.createServer(app);

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const VALID_MOBILE_EVENTS = new Set<string>([
  'mobile_connected', 'camera_opened', 'image_captured', 'uploading', 'upload_complete',
]);

wss.on('connection', (ws) => {
  logger.debug('WebSocket client connected');

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        type?: string;
        sessionId?: string;
        eventType?: string;
        data?: Record<string, unknown>;
      };

      // Desktop registers to receive updates for a session
      if (msg.type === 'register' && typeof msg.sessionId === 'string') {
        registerClient(msg.sessionId, ws);
        ws.send(JSON.stringify({ type: 'registered', sessionId: msg.sessionId }));
        return;
      }

      // Mobile announces its presence for a session
      if (msg.type === 'mobile_register' && typeof msg.sessionId === 'string') {
        const session = getSession(msg.sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: 'session_invalid', sessionId: msg.sessionId }));
          return;
        }
        registerMobileClient(msg.sessionId, ws);
        ws.send(JSON.stringify({ type: 'mobile_registered', sessionId: msg.sessionId }));
        // Immediately tell the desktop a phone has connected
        relayMobileEvent(msg.sessionId, 'mobile_connected');
        return;
      }

      // Mobile sends lifecycle events (camera_opened, image_captured, uploading, upload_complete)
      if (
        msg.type === 'mobile_event' &&
        typeof msg.sessionId === 'string' &&
        typeof msg.eventType === 'string' &&
        VALID_MOBILE_EVENTS.has(msg.eventType)
      ) {
        relayMobileEvent(msg.sessionId, msg.eventType as MobileEventType, msg.data);
        return;
      }
    } catch {
      // ignore unparseable frames
    }
  });

  ws.on('close', () => {
    unregisterClient(ws);
    unregisterMobileClient(ws);
  });
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
