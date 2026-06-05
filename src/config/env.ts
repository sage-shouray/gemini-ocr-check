import path from 'path';

// Load .env before any process.env access. Using an explicit absolute path
// avoids failures when the process is started from a directory other than
// the project root (e.g. ts-node called from a parent directory, or certain
// process managers that change cwd).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  GEMINI_API_KEY: requireEnv('GEMINI_API_KEY'),
  PORT: parseInt(process.env['PORT'] ?? '3000', 10),
  NODE_ENV: (process.env['NODE_ENV'] ?? 'development') as 'development' | 'production' | 'test',
  BASE_URL: process.env['BASE_URL'] ?? '',
} as const;

export type Config = typeof config;
