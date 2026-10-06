import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface ServerConfig {
  port: number;
  /** Folder with topologies/*.json (shared with the viewer's public data). */
  dataDir: string;
  /** Folder where generated scenarios are stored as <id>.json. */
  storeDir: string;
  model: string;
  effort: Effort;
  /** Attempts per question, including the corrections after failed validation. */
  maxAttempts: number;
  /** Longest question accepted, in characters. */
  maxQuestionLength: number;
}

function effortFrom(value: string | undefined): Effort {
  return EFFORTS.find((e) => e === value) ?? 'high';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    // Not the generic PORT: dev tools set that for the web app, which proxies /api to here.
    port: Number(env.SCENARIO_PORT ?? 8787),
    dataDir: resolve(env.DATA_DIR ?? resolve(appDir, '../web/public/data')),
    storeDir: resolve(env.STORE_DIR ?? resolve(appDir, '.data/scenarios')),
    model: env.SCENARIO_MODEL ?? 'claude-opus-5-5',
    effort: effortFrom(env.SCENARIO_EFFORT),
    maxAttempts: Number(env.SCENARIO_MAX_ATTEMPTS ?? 3),
    maxQuestionLength: 500,
  };
}

/** True when the SDK can find credentials without an interactive login. */
export function hasCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_AUTH_TOKEN ?? env.ANTHROPIC_PROFILE);
}
