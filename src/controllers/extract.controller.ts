import { Request, Response } from 'express';
import fs from 'fs';
import { preprocessImage } from '../services/preprocess.service';
import { extractInvoiceData } from '../services/gemini.service';
import { getSession, updateSession } from '../services/session.service';
import { notifyDesktop } from '../services/ws.service';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export async function extractHandler(req: Request, res: Response): Promise<void> {
  const sessionId = req.params['sessionId'] ?? '';
  const file = req.file;

  if (!file) {
    sendError(res, 'No file uploaded', 400);
    return;
  }

  if (sessionId && !getSession(sessionId)) {
    deleteTemp(file.path);
    sendError(res, 'Session not found or expired', 404);
    return;
  }

  // ── 1. Mark processing ───────────────────────────────────────────────────
  if (sessionId) {
    updateSession(sessionId, { status: 'processing' });
    notifyDesktop(sessionId, { status: 'processing' });
  }

  try {
    // ── 2. Read file buffer ──────────────────────────────────────────────────
    const inputBuffer = fs.readFileSync(file.path);
    let imageBuffers: Buffer[];
    const allSteps: string[] = [];
    const allWarnings: string[] = [];

    // ── 3. Preprocess ────────────────────────────────────────────────────────
    let extractMime: string;

    if (file.mimetype === 'application/pdf') {
      // Gemini understands PDF natively — no Ghostscript / pdf2pic needed.
      imageBuffers = [inputBuffer];
      extractMime  = 'application/pdf';
      allSteps.push('PDF passed directly to Gemini (native multi-page support)');
    } else {
      const preprocessed = await preprocessImage(inputBuffer, file.mimetype);
      imageBuffers = [preprocessed.buffer];
      extractMime  = 'image/png';
      allSteps.push(...preprocessed.steps);
      allWarnings.push(...preprocessed.warnings);
    }

    // ── 4. Extract ───────────────────────────────────────────────────────────
    const extractionResult = await extractInvoiceData(imageBuffers, extractMime);

    // ── 5 & 6. Update session + notify desktop ───────────────────────────────
    if (sessionId) {
      updateSession(sessionId, { status: 'done', extractionResult });
      notifyDesktop(sessionId, { status: 'done', data: extractionResult });
    }

    logger.info('Extraction complete', {
      sessionId,
      fileName: file.originalname,
      confidence: extractionResult._meta?.confidence,
    });

    // ── 8. Respond ───────────────────────────────────────────────────────────
    sendSuccess(res, {
      sessionId: sessionId || null,
      fileName: file.originalname,
      extractedAt: new Date().toISOString(),
      preprocessing: { steps: allSteps, warnings: allWarnings },
      data: extractionResult,
    });
  } catch (err) {
    // ── 9. Error handling ────────────────────────────────────────────────────
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Extraction failed', { sessionId, error: message });

    if (sessionId) {
      updateSession(sessionId, { status: 'error', error: message });
      notifyDesktop(sessionId, { status: 'error', error: message });
    }

    sendError(res, message, 500);
  } finally {
    // ── 7. Delete temp file ──────────────────────────────────────────────────
    deleteTemp(file.path);
  }
}

function deleteTemp(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* already gone */ }
}
