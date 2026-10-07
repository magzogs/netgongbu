import { DEFAULT_CLAUDE_SETTINGS, EFFORTS, type Effort } from '@magvirtualedu/ai';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export interface ServerConfig {
  port: number;
  /** Folder with topologies/*.json (shared with the viewer's public data). */
  dataDir: string;
  /** Folder where generated scenarios are stored as <id>.json. */
  storeDir: string;
  /** The AI connection choice (provider, method, model, effort; no keys). */
  aiPrefsFile: string;
  /** An empty folder the AI CLIs run in. */
  aiWorkDir: string;
  model: string;
  effort: Effort;
  /** Attempts per question, including the corrections after failed validation. */
  maxAttempts: number;
  /** Longest question accepted, in characters. */
  maxQuestionLength: number;
}

function effortFrom(value: string | undefined): Effort {
  return EFFORTS.find((e) => e === value) ?? DEFAULT_CLAUDE_SETTINGS.effort;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    // Not the generic PORT: dev tools set that for the web app, which proxies /api to here.
    port: Number(env.SCENARIO_PORT ?? 8787),
    dataDir: resolve(env.DATA_DIR ?? resolve(appDir, '../web/public/data')),
    storeDir: resolve(env.STORE_DIR ?? resolve(appDir, '.data/scenarios')),
    aiPrefsFile: resolve(appDir, '.data/ai.json'),
    aiWorkDir: resolve(appDir, '.data/ai-workdir'),
    model: env.SCENARIO_MODEL ?? DEFAULT_CLAUDE_SETTINGS.model,
    effort: effortFrom(env.SCENARIO_EFFORT),
    maxAttempts: Number(env.SCENARIO_MAX_ATTEMPTS ?? 3),
    maxQuestionLength: 500,
  };
}
