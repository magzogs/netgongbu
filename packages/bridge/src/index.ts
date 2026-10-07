import { z } from 'zod';
import type {
  AiStatus,
  ChatEvent,
  ChatRequest,
  CliProvider,
  ModelsResult,
  PrefsChange,
  ProviderId,
} from '@magvirtualedu/llm';
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
  /** Answers come from the canned model (MAGVE_FAKE_AI=1), not the connected AI. */
  fake: boolean;
}

export interface Settings {
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
  /** Which AI answers (ChatGPT, Claude, a local model), how it is reached, model and effort. */
  connection: {
    /** With `refresh`, looks for the CLIs again and asks who they are signed in as. */
    status: (refresh?: boolean) => Promise<AiStatus>;
    change: (change: PrefsChange) => Promise<AiStatus>;
    setKey: (provider: ProviderId, key: string | null) => Promise<AiStatus>;
    models: (provider: ProviderId, refresh?: boolean) => Promise<ModelsResult>;
    signIn: (provider: CliProvider) => Promise<AiStatus>;
    stopSignIn: () => Promise<AiStatus>;
    signOut: (provider: CliProvider) => Promise<AiStatus>;
    /** The status whenever it changes (a sign-in finished, a CLI was found). */
    onStatus: (listener: (status: AiStatus) => void) => Unsubscribe;
  };
  /** Questions to the connected AI, answered in the main process. */
  chat: {
    /** Starts answering; the answer arrives as events with the same id. */
    ask: (request: ChatRequest) => Promise<void>;
    cancel: (id: string) => Promise<void>;
    onEvent: (listener: (event: ChatEvent) => void) => Unsubscribe;
  };
}
