import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { networkInterfaces } from 'os';
import { config } from '../config/env';
import { createSession, getSession, deleteSession, getAllActiveSessions } from '../services/session.service';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function mobileUrl(sessionId: string): string {
  let base = config.BASE_URL;
  // When BASE_URL is localhost the phone can't reach it — use LAN IP instead
  if (!base || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(base)) {
    base = `http://${getLocalIp()}:${config.PORT}`;
  }
  return `${base}/mobile/${sessionId}`;
}

export async function createSessionHandler(_req: Request, res: Response): Promise<void> {
  try {
    const session = createSession();
    const mobile = mobileUrl(session.sessionId);
    const qrCodeDataUrl = await QRCode.toDataURL(mobile, { width: 300, margin: 2 });
    logger.info('Session created', { sessionId: session.sessionId });
    sendSuccess(res, { sessionId: session.sessionId, qrCodeDataUrl, mobileUrl: mobile }, 201);
  } catch {
    sendError(res, 'Failed to create session', 500);
  }
}

export function getSessionHandler(req: Request, res: Response): void {
  const sessionId = req.params['id'] ?? '';
  const session = getSession(sessionId);
  if (!session) {
    sendError(res, 'Session not found or expired', 404);
    return;
  }
  sendSuccess(res, session);
}

export function listSessionsHandler(_req: Request, res: Response): void {
  sendSuccess(res, getAllActiveSessions());
}

export function deleteSessionHandler(req: Request, res: Response): void {
  const sessionId = req.params['id'] ?? '';
  if (!getSession(sessionId)) {
    sendError(res, 'Session not found', 404);
    return;
  }
  deleteSession(sessionId);
  sendSuccess(res, { message: 'Session deleted' });
}
