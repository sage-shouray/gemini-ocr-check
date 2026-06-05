import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import type { MobileEventType } from '../types/invoice.types';

const desktopClients = new Map<string, WebSocket>();
const mobileClients  = new Map<string, WebSocket>();

// ── Desktop registry ──────────────────────────────────────────────────────────

export function registerClient(sessionId: string, ws: WebSocket): void {
  desktopClients.set(sessionId, ws);
  logger.debug('Desktop client registered', { sessionId });
}

export function unregisterDesktopClient(ws: WebSocket): void {
  for (const [sessionId, client] of desktopClients) {
    if (client === ws) {
      desktopClients.delete(sessionId);
      logger.debug('Desktop client unregistered', { sessionId });
      break;
    }
  }
}

/** @deprecated Use unregisterDesktopClient — kept for back-compat with index.ts import */
export const unregisterClient = unregisterDesktopClient;

export function notifyDesktop(sessionId: string, data: object): void {
  const client = desktopClients.get(sessionId);
  if (!client || client.readyState !== WebSocket.OPEN) return;
  try {
    client.send(JSON.stringify(data));
  } catch (err) {
    logger.warn('Failed to notify desktop client', { sessionId, error: String(err) });
  }
}

// ── Mobile registry ───────────────────────────────────────────────────────────

export function registerMobileClient(sessionId: string, ws: WebSocket): void {
  mobileClients.set(sessionId, ws);
  logger.debug('Mobile client registered', { sessionId });
}

export function unregisterMobileClient(ws: WebSocket): void {
  for (const [sessionId, client] of mobileClients) {
    if (client === ws) {
      mobileClients.delete(sessionId);
      logger.debug('Mobile client unregistered', { sessionId });
      break;
    }
  }
}

/** Forward a mobile lifecycle event to the watching desktop client. */
export function relayMobileEvent(
  sessionId: string,
  eventType: MobileEventType,
  data?: Record<string, unknown>,
): void {
  notifyDesktop(sessionId, { type: eventType, sessionId, ...(data ?? {}) });
}
