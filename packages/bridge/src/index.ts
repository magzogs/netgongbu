import { z } from 'zod';
import type { Scenario, ValidationIssue } from '@magvirtualedu/schema';
import type { Hop, TraceReport } from '@magvirtualedu/trace';

export { Channels } from './channels';

export interface AiEntry {
  id: string;
  topologyId: string;
  title: string;
  question: string;
  createdAt: string;
}

export type AskResult =
  | { ok: true; entry: AiEntry; scenario: Scenario }
  | { ok: false; code: string; error: string; issues: readonly ValidationIssue[] };

export interface AiStatusInfo {
  ready: boolean;
  /** Answers come from the canned model (MAGVE_FAKE_AI=1), not Claude. */
  fake: boolean;
}

export interface Settings {
  hasApiKey: boolean;
  /** saved: stored encrypted by this app; environment: ANTHROPIC_API_KEY. */
  apiKeySource: 'saved' | 'environment' | null;
  /** Whether the OS keychain can encrypt a saved key (the app refuses to store it otherwise). */
  canSaveKey: boolean;
  model: string;
  geo: { installed: boolean; version: string | null; attribution: string };
  platform: string;
}

/** Where the laptop's browser view sits on screen, in CSS pixels of the main window. */
export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Rect = z.infer<typeof RectSchema>;

export const TraceStartSchema = z.object({
  input: z.string().trim().min(1).max(2048),
  /** Empty the browser's caches first so DNS, TCP and TLS really happen. */
  clearCache: z.boolean(),
});
export type TraceStart = z.infer<typeof TraceStartSchema>;

export const ApiKeySchema = z.string().trim().min(10).max(400).nullable();

export type TracePhase = 'browser' | 'local' | 'dns' | 'path' | 'enrich';

export type TraceEvent =
  | { type: 'phase'; phase: TracePhase; message: string }
  | { type: 'page'; url: string; title: string }
  | { type: 'hop'; hop: Hop }
  | { type: 'done'; id: string; report: TraceReport }
  | { type: 'error'; message: string };

export interface TraceEntry {
  id: string;
  input: string;
  host: string;
  startedAt: string;
}

export type GeoEvent =
  | { type: 'progress'; received: number; total: number | null }
  | { type: 'done'; version: string }
  | { type: 'error'; message: string };

export type Unsubscribe = () => void;

/** What the preload script exposes to the viewer as window.lab (desktop app only). */
export interface LabApi {
  ai: {
    status: () => Promise<AiStatusInfo>;
    catalog: () => Promise<AiEntry[]>;
    scenario: (id: string) => Promise<Scenario | null>;
    ask: (topologyId: string, question: string) => Promise<AskResult>;
  };
  settings: {
    get: () => Promise<Settings>;
    setApiKey: (key: string | null) => Promise<Settings>;
  };
  trace: {
    start: (request: TraceStart) => Promise<void>;
    cancel: () => Promise<void>;
    list: () => Promise<TraceEntry[]>;
    get: (id: string) => Promise<TraceReport | null>;
    onEvent: (listener: (event: TraceEvent) => void) => Unsubscribe;
  };
  browser: {
    /** Shows the laptop's browser page in this rectangle, or hides it with null. */
    setBounds: (rect: Rect | null) => void;
  };
  geo: {
    download: () => Promise<void>;
    onEvent: (listener: (event: GeoEvent) => void) => Unsubscribe;
  };
}
