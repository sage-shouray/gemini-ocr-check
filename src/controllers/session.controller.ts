import { Request, Response } from 'express';
import { createSession, getSession, deleteSession, getAllActiveSessions } from '../services/session.service';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export async function createSessionHandler(_req: Request, res: Response): Promise<void> {
  try {
    const session = createSession();
    logger.info('Session created', { sessionId: session.sessionId });
    sendSuccess(res, { sessionId: session.sessionId }, 201);
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
