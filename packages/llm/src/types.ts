import { tr } from '@netgongbu/schema';
import { z } from 'zod';

/*
 * The AI the viewer talks to: who answers (provider), how the app reaches it (method), and with
 * which model and effort. Shared by the viewer (types and labels only) and the Node side that
 * makes the calls (src/node: the desktop app's main process and the web server).
 */

export const PROVIDER_IDS = ['openai', 'anthropic', 'local'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Providers reached through their official command-line tool. */
export const CLI_PROVIDERS = ['openai', 'anthropic'] as const;
export type CliProvider = (typeof CLI_PROVIDERS)[number];

/**
 * oauth: the learner signs in with their ChatGPT or Claude account. The official CLI (Codex CLI,
 * Claude Code) runs the sign-in and keeps the tokens; this app never holds them.
 * api: an API key (or, for a local server, its address).
 * cli: the CLI as it is already set up on this computer, whatever it signed in with.
 */
export const METHODS = ['oauth', 'api', 'cli'] as const;
export type Method = (typeof METHODS)[number];

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  vendor: string;
  methods: readonly Method[];
  /** The official CLI: its name and the command it installs. */
  cli?: { name: string; command: string; install: string };
  /** Placeholder for the API key field. */
  keyHint?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'ChatGPT',
    vendor: 'OpenAI',
    methods: ['oauth', 'api', 'cli'],
    cli: { name: 'Codex CLI', command: 'codex', install: 'npm install -g @openai/codex' },
    keyHint: 'sk-…',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude',
    vendor: 'Anthropic',
    methods: ['oauth', 'api', 'cli'],
    cli: {
      name: 'Claude Code',
      command: 'claude',
      install: 'curl -fsSL https://claude.ai/install.sh | bash',
    },
    keyHint: 'sk-ant-…',
  },
  local: {
    id: 'local',
    // Getters: the labels follow the language at the time they are read.
    get label() {
      return tr('로컬 LLM', 'Local LLM');
    },
    get vendor() {
      return tr('OpenAI 호환 서버', 'OpenAI-compatible server');
    },
    methods: ['api'],
  },
};

export const METHOD_LABELS: Record<Method, string> = {
  get oauth() {
    return tr('계정 로그인', 'Account sign-in');
  },
  get api() {
    return tr('API 키', 'API key');
  },
  cli: 'CLI',
};

/** Where the common local servers listen by default (OpenAI-compatible /v1). */
export const LOCAL_PRESETS = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1' },
] as const;

export const DEFAULT_LOCAL_URL: string = LOCAL_PRESETS[0].baseUrl;

const EFFORT_LABELS: Record<string, readonly [ko: string, en: string]> = {
  none: ['없음', 'None'],
  minimal: ['최소', 'Minimal'],
  low: ['낮음', 'Low'],
  medium: ['보통', 'Medium'],
  high: ['높음', 'High'],
  xhigh: ['매우 높음', 'Extra high'],
  max: ['최대', 'Max'],
  ultra: ['울트라', 'Ultra'],
};

/** "보통 (medium)" for the levels we know, the raw name otherwise. */
export function effortLabel(effort: string): string {
  const label = Object.hasOwn(EFFORT_LABELS, effort) ? EFFORT_LABELS[effort] : undefined;
  if (!label) return effort;
  // English: the name itself is already English ("Medium"), so no raw name in parentheses.
  return tr(`${label[0]} (${effort})`, label[1]);
}

export const BaseUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((u) => /^https?:\/\/[^\s/]+/.test(u), {
    error: () =>
      tr('http:// 또는 https:// 주소가 필요합니다.', 'Enter an http:// or https:// address.'),
  });

export const ProviderPrefsSchema = z.object({
  method: z.enum(METHODS),
  /** Empty: the provider's default model. */
  model: z.string().max(200).default(''),
  /** Null: the model's default effort. */
  effort: z.string().max(40).nullable().default(null),
  /** The CLI to run; unset to find it automatically. */
  cliPath: z.string().max(1024).optional(),
  /** Local server address (local provider only). */
  baseUrl: z.string().max(2048).optional(),
});
export type ProviderPrefs = z.infer<typeof ProviderPrefsSchema>;

export const AiPrefsSchema = z.object({
  /** Where questions go; null until the learner connects one. */
  provider: z.enum(PROVIDER_IDS).nullable(),
  providers: z.partialRecord(z.enum(PROVIDER_IDS), ProviderPrefsSchema),
});
export type AiPrefs = z.infer<typeof AiPrefsSchema>;

export const EMPTY_PREFS: AiPrefs = { provider: null, providers: {} };

export function defaultProviderPrefs(provider: ProviderId): ProviderPrefs {
  return provider === 'local'
    ? { method: 'api', model: '', effort: null, baseUrl: DEFAULT_LOCAL_URL }
    : { method: 'oauth', model: '', effort: null };
}

export function prefsFor(prefs: AiPrefs, provider: ProviderId): ProviderPrefs {
  return prefs.providers[provider] ?? defaultProviderPrefs(provider);
}

/** A change from the viewer's connection settings, for one provider. */
export const PrefsChangeSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  /** Make this the provider questions go to. */
  activate: z.boolean().optional(),
  method: z.enum(METHODS).optional(),
  model: z.string().trim().max(200).optional(),
  effort: z.string().trim().max(40).nullable().optional(),
  /** null: find the CLI automatically again. */
  cliPath: z.string().trim().max(1024).nullable().optional(),
  baseUrl: BaseUrlSchema.optional(),
});
export type PrefsChange = z.infer<typeof PrefsChangeSchema>;

export const ApiKeyInputSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  key: z.string().trim().min(8).max(400).nullable(),
});

export interface ModelOption {
  id: string;
  label: string;
  description?: string;
  /** Effort levels the model takes, lowest first; empty when it takes none. */
  efforts: string[];
  /** The model's own default effort, when known. */
  defaultEffort?: string;
  /** Accepts pictures (the 3D view can be sent with a question). */
  vision?: boolean;
  /** The provider's recommended model. */
  recommended?: boolean;
}

export type ModelsResult = { ok: true; models: ModelOption[] } | { ok: false; error: string };

export type AccountState =
  | { state: 'unknown' }
  | { state: 'checking' }
  | { state: 'signed-out' }
  | {
      state: 'signed-in';
      /** subscription: a ChatGPT or Claude account; apiKey: the CLI uses an API key. */
      kind: 'subscription' | 'apiKey' | 'other';
      label: string;
    }
  | { state: 'error'; message: string };

export interface CliInfo {
  /** The executable found (or set); null when there is none. */
  path: string | null;
  version: string | null;
  /** Set by the learner rather than found automatically. */
  custom: boolean;
  error: string | null;
}

export interface LoginState {
  provider: CliProvider;
  running: boolean;
  /** Where the sign-in page is, in case the browser did not open. */
  url: string | null;
  error: string | null;
}

export type KeySource = 'saved' | 'environment' | null;

/** Everything the connection settings show. */
export interface AiStatus {
  prefs: AiPrefs;
  keys: Record<ProviderId, KeySource>;
  /** Whether an API key can be stored safely here (desktop: OS keychain; server: memory only). */
  keyStorage: 'keychain' | 'memory' | 'unavailable';
  cli: Record<CliProvider, CliInfo>;
  accounts: Record<CliProvider, AccountState>;
  login: LoginState | null;
  /** The chosen provider has what it needs (a key, a signed-in CLI, a server address). */
  ready: boolean;
  /** Why not, for the viewer to show. */
  notReady: string | null;
}

export const ChatPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  /** A picture as a data: URL, for models that can see. */
  z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string() }) }),
]);
export type ChatPart = z.infer<typeof ChatPartSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([z.string(), z.array(ChatPartSchema)]),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** A question: an id to match its events, then the conversation (system first). */
export const ChatRequestSchema = z.object({
  id: z.string().min(1).max(100),
  // Text plus at most a screenshot or two (data: URLs of a few megabytes).
  messages: z.array(ChatMessageSchema).min(1).max(60),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** The answer as it is written, then done (or an error), for one question id. */
export type ChatEvent =
  | { id: string; type: 'delta'; text: string }
  | { id: string; type: 'done'; model: string | null }
  | { id: string; type: 'error'; message: string };
