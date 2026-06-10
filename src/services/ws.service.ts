import { WebSocket } from 'ws';
import { logger } from '../utils/logger';

const desktopClients = new Map<string, WebSocket>();

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
