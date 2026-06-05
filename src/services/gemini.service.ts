import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { config } from '../config/env';
import { buildInvoiceExtractionPrompt } from '../prompts/invoice.prompt';
import { InvoiceExtraction } from '../types/invoice.types';
import { logger } from '../utils/logger';

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

const MODEL_CONFIG = {
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0,
    maxOutputTokens: 8192,
  },
} as const;

const RETRY_DELAYS_MS = [1000, 2000, 4000];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractInvoiceData(
  imageBuffers: Buffer[],
  mimeType: string
): Promise<InvoiceExtraction> {
  return withExponentialBackoff(() => runExtraction(imageBuffers, mimeType));
}

/**
 * Generic exponential-backoff wrapper. Exported for reuse in other services.
 * 3 total attempts with delays of 1 s, 2 s, 4 s between each failure.
 */
export async function withExponentialBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      logger.debug('Gemini call attempt', { attempt });
      return await fn();
    } catch (err) {
      lastError = err;
      const delayMs = RETRY_DELAYS_MS[attempt - 1];
      if (delayMs === undefined) break;
      logger.warn('Gemini call failed, retrying', {
        attempt,
        delayMs,
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Core extraction logic
// ---------------------------------------------------------------------------

async function runExtraction(
  imageBuffers: Buffer[],
  mimeType: string
): Promise<InvoiceExtraction> {
  const model = genAI.getGenerativeModel(MODEL_CONFIG);

  const parts = buildParts(imageBuffers, mimeType);
  logger.debug('Sending to Gemini', { pages: imageBuffers.length, mimeType });

  const result = await model.generateContent(parts);
  const rawText = result.response.text();
  logger.debug('Gemini response received', { length: rawText.length });

  try {
    return parseResponse(rawText);
  } catch {
    logger.warn('Initial parse failed — retrying Gemini with JSON correction hint');
    return retryWithJsonHint(model, parts, rawText);
  }
}

async function retryWithJsonHint(
  model: ReturnType<typeof genAI.getGenerativeModel>,
  originalParts: Part[],
  badResponse: string
): Promise<InvoiceExtraction> {
  const correctionParts: Part[] = [
    ...originalParts,
    { text: badResponse },
    {
      text: 'Your previous response was not valid JSON. Return ONLY the JSON object, nothing else.',
    },
  ];

  const result = await model.generateContent(correctionParts);
  const rawText = result.response.text();
  logger.debug('Gemini correction response received', { length: rawText.length });

  try {
    return parseResponse(rawText);
  } catch {
    logger.error('Gemini correction attempt also failed to produce valid JSON', {
      text: rawText.slice(0, 500),
    });
    throw new Error('Gemini returned non-JSON output after correction attempt');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParts(imageBuffers: Buffer[], mimeType: string): Part[] {
  const parts: Part[] = [{ text: buildInvoiceExtractionPrompt() }];

  for (const buffer of imageBuffers) {
    parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
  }

  if (imageBuffers.length > 1) {
    parts.push({
      text: 'These are pages of the SAME invoice. Combine all line items across pages.',
    });
  }

  return parts;
}

function parseResponse(text: string): InvoiceExtraction {
  const cleaned = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  return JSON.parse(cleaned) as InvoiceExtraction;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
