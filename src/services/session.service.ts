import { v4 as uuidv4 } from 'uuid';
import { SessionData } from '../types/invoice.types';
import { logger } from '../utils/logger';

const store = new Map<string, SessionData>();
const SESSION_TTL_MS = 30 * 60 * 1000;

export function createSession(): SessionData {
  const session: SessionData = {
    sessionId: uuidv4(),
    createdAt: new Date(),
    status: 'waiting',
    extractionResult: null,
    error: null,
  };
  store.set(session.sessionId, session);
  scheduleExpiry(session.sessionId);
  logger.info('Session created', { sessionId: session.sessionId });
  return session;
}

export function getSession(id: string): SessionData | null {
  return store.get(id) ?? null;
}

export function updateSession(id: string, partial: Partial<Omit<SessionData, 'sessionId' | 'createdAt'>>): void {
  const session = store.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  Object.assign(session, partial);
}

export function deleteSession(id: string): void {
  store.delete(id);
  logger.info('Session deleted', { sessionId: id });
}

export function getAllActiveSessions(): SessionData[] {
  return Array.from(store.values());
}

function scheduleExpiry(id: string): void {
  setTimeout(() => {
    if (store.delete(id)) {
      logger.info('Session expired', { sessionId: id });
    }
  }, SESSION_TTL_MS).unref();
}
