import type { ChildProcess } from 'node:child_process';
import { z } from 'zod';
import type { AccountState, ModelOption } from '../types';
import { AiError } from './http';
import { cliEnv, onLines, spawnCli, tail } from './process';
import { asOnePrompt, type Answer, type Ask, type Provider } from './provider';

/*
 * ChatGPT through the official Codex CLI's app server (`codex app-server`): JSON-RPC over stdio,
 * the protocol Codex's own IDE extensions use. It signs in with a ChatGPT account (the CLI opens
 * the OAuth page and keeps the tokens), lists the models the account can use with the effort
 * levels each takes, and streams answers. Each question runs in its own throw-away thread with
 * no tools, in an empty folder, read-only.
 */

/** Tools and integrations a tutor's answer does not need (unknown names are ignored). */
const OFF = [
  'plugins',
  'apps',
  'shell_tool',
  'unified_exec',
  'browser_use',
  'computer_use',
  'multi_agent',
  'image_generation',
  'hooks',
  'skill_search',
  'tool_suggest',
  'goals',
  'memories',
];
const ARGS = [
  'app-server',
  ...OFF.flatMap((f) => ['-c', `features.${f}=false`]),
  '-c',
  'mcp_servers={}',
];

const REQUEST_TIMEOUT_MS = 30_000;

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

type Listener = (method: string, params: Record<string, unknown>) => void;

const ModelSchema = z.looseObject({
  id: z.string(),
  model: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  hidden: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string() })).default([]),
  defaultReasoningEffort: z.string().nullish(),
  inputModalities: z.array(z.string()).optional(),
});
const ModelListSchema = z.object({
  data: z.array(ModelSchema),
  nextCursor: z.string().nullish(),
});

const AccountSchema = z.object({
  account: z
    .looseObject({
      type: z.string(),
      email: z.string().nullish(),
      planType: z.string().nullish(),
    })
    .nullable(),
});

const TurnSchema = z.object({
  turn: z.looseObject({
    id: z.string(),
    status: z.string().optional(),
    error: z.looseObject({ message: z.string(), codexErrorInfo: z.unknown().optional() }).nullish(),
  }),
});

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
};

/** A failed turn's error in words the learner can act on. */
function turnError(error: { message: string; codexErrorInfo?: unknown }): AiError {
  const info = typeof error.codexErrorInfo === 'string' ? error.codexErrorInfo : null;
  if (info === 'unauthorized')
    return new AiError('ChatGPT 로그인이 만료되었습니다. 다시 로그인해 주세요.', 'auth');
  if (info === 'usageLimitExceeded')
    return new AiError(`사용 한도에 도달했습니다. ${error.message}`.trim());
  return new AiError(error.message || 'Codex가 답하지 못했습니다.');
}

export class CodexAppServer implements Provider {
  private child: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<Listener>();
  private stderr = '';

  constructor(
    readonly path: string,
    private readonly options: { cwd: string; log: (message: string) => void },
  ) {}

  /** Notifications from the server (login finished, account changed, …). */
  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private start(): Promise<void> {
    this.starting ??= new Promise<void>((resolve, reject) => {
      const child = spawnCli(this.path, ARGS, {
        cwd: this.options.cwd,
        env: cliEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;
      this.stderr = '';
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (d: string) => {
        this.stderr = (this.stderr + d).slice(-4000);
      });
      onLines(child.stdout, (line) => {
        this.receive(line);
      });
      child.on('error', (err) => {
        this.stopped(new AiError(`Codex CLI를 실행하지 못했습니다: ${err.message}`, 'connect'));
        reject(err);
      });
      child.on('exit', (code) => {
        this.stopped(
          new AiError(
            `Codex CLI가 종료되었습니다 (코드 ${String(code)})${this.stderr ? `: ${tail(this.stderr, 2)}` : ''}`,
            'connect',
          ),
        );
      });
      this.call('initialize', {
        clientInfo: { name: 'magve', title: 'Network in 3D', version: '0.1.0' },
        capabilities: null,
      })
        .then(() => {
          this.notify('initialized');
          this.options.log(`codex app-server started (${this.path})`);
          resolve();
        })
        .catch((err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
    return this.starting;
  }

  private stopped(err: Error): void {
    this.child = null;
    this.starting = null;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  private receive(line: string): void {
    let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }
    if (msg.method !== undefined && msg.id !== undefined) {
      // A request from the server (an approval, a question): this client offers no tools.
      this.write({ id: msg.id, error: { code: -32601, message: 'Not supported by this client' } });
      return;
    }
    if (msg.method !== undefined) {
      const params = (msg.params ?? {}) as Record<string, unknown>;
      for (const listener of this.listeners) listener(msg.method, params);
      return;
    }
    if (msg.id === undefined) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) {
      const error = msg.error as { message?: string };
      p.reject(new AiError(error.message ?? 'Codex 요청이 실패했습니다.'));
    } else {
      p.resolve(msg.result);
    }
  }

  private write(message: unknown): void {
    this.child?.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  private notify(method: string): void {
    this.write({ method });
  }

  private call(method: string, params?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AiError(`Codex가 ${method}에 답하지 않습니다.`, 'connect'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write(params === undefined ? { id, method } : { id, method, params });
    });
  }

  async request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    await this.start();
    return this.call(method, params, timeoutMs);
  }

  async account(): Promise<AccountState> {
    const parsed = AccountSchema.safeParse(await this.request('account/read', {}));
    const account = parsed.success ? parsed.data.account : null;
    if (!account) return { state: 'signed-out' };
    if (account.type === 'chatgpt') {
      const plan = account.planType ? (PLAN_LABELS[account.planType] ?? account.planType) : null;
      const label = [account.email, plan && `ChatGPT ${plan}`].filter(Boolean).join(' · ');
      return { state: 'signed-in', kind: 'subscription', label: label || 'ChatGPT 계정' };
    }
    if (account.type === 'apiKey') return { state: 'signed-in', kind: 'apiKey', label: 'API 키' };
    return { state: 'signed-in', kind: 'other', label: account.type };
  }

  /** Starts the ChatGPT sign-in; `onDone` runs when the browser flow ends. */
  async login(onDone: (error: string | null) => void): Promise<{ loginId: string; url: string }> {
    const result = z
      .object({ loginId: z.string(), authUrl: z.string() })
      .parse(await this.request('account/login/start', { type: 'chatgpt' }));
    const off = this.on((method, params) => {
      if (method !== 'account/login/completed') return;
      if (params.loginId !== null && params.loginId !== result.loginId) return;
      off();
      const error = typeof params.error === 'string' ? params.error : '로그인하지 못했습니다.';
      onDone(params.success === true ? null : error);
    });
    return { loginId: result.loginId, url: result.authUrl };
  }

  async cancelLogin(loginId: string): Promise<void> {
    await this.request('account/login/cancel', { loginId }).catch(() => undefined);
  }

  async logout(): Promise<void> {
    await this.request('account/logout');
  }

  async models(): Promise<ModelOption[]> {
    const models: ModelOption[] = [];
    let cursor: string | null = null;
    do {
      const page = ModelListSchema.parse(
        await this.request('model/list', cursor ? { cursor } : {}),
      );
      for (const m of page.data) {
        if (m.hidden) continue;
        models.push({
          id: m.model,
          label: m.displayName,
          ...(m.description && { description: m.description }),
          efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort),
          ...(m.defaultReasoningEffort && { defaultEffort: m.defaultReasoningEffort }),
          vision: m.inputModalities?.includes('image') ?? false,
          ...(m.isDefault && { recommended: true }),
        });
      }
      cursor = page.nextCursor ?? null;
    } while (cursor);
    return models;
  }

  async ask(ask: Ask): Promise<Answer> {
    const thread = z
      .object({ thread: z.object({ id: z.string() }), model: z.string().optional() })
      .parse(
        await this.request('thread/start', {
          ...(ask.model && { model: ask.model }),
          ephemeral: true,
          cwd: this.options.cwd,
          sandbox: 'read-only',
          approvalPolicy: 'never',
          baseInstructions: ask.system,
        }),
      );
    const threadId = thread.thread.id;
    const prompt = asOnePrompt(ask.turns);
    const messages = new Map<string, string>();
    // Written by the notification listener while the turn runs.
    const seen: { last: string | null; failure: AiError | null; turnId: string | null } = {
      last: null,
      failure: null,
      turnId: null,
    };

    const finished = new Promise<{ status: string; error: AiError | null }>((resolve) => {
      const off = this.on((method, params) => {
        if (params.threadId !== threadId) return;
        if (method === 'item/agentMessage/delta') {
          const itemId = String(params.itemId);
          const delta = typeof params.delta === 'string' ? params.delta : '';
          messages.set(itemId, (messages.get(itemId) ?? '') + delta);
          seen.last = itemId;
          ask.onText?.(delta);
        } else if (method === 'item/completed') {
          const item = params.item as { type?: string; id?: string; text?: string } | undefined;
          if (item?.type === 'agentMessage' && item.id && typeof item.text === 'string') {
            if (!messages.has(item.id)) ask.onText?.(item.text);
            messages.set(item.id, item.text);
            seen.last = item.id;
          }
        } else if (method === 'error' && params.willRetry !== true) {
          seen.failure = turnError(params.error as { message: string });
        } else if (method === 'turn/completed') {
          off();
          const turn = TurnSchema.safeParse(params);
          const error = turn.success ? turn.data.turn.error : null;
          resolve({
            status: turn.success ? (turn.data.turn.status ?? 'completed') : 'completed',
            error: error ? turnError(error) : seen.failure,
          });
        }
      });
    });

    const abort = (): void => {
      const { turnId } = seen;
      if (turnId) void this.request('turn/interrupt', { threadId, turnId }).catch(() => undefined);
    };
    ask.signal?.addEventListener('abort', abort);
    try {
      const started = TurnSchema.parse(
        await this.request('turn/start', {
          threadId,
          input: [
            { type: 'text', text: prompt.text, text_elements: [] },
            ...prompt.images.map((url) => ({ type: 'image', url })),
          ],
          ...(ask.model && { model: ask.model }),
          ...(ask.effort && { effort: ask.effort }),
          ...(ask.schema && { outputSchema: ask.schema }),
        }),
      );
      seen.turnId = started.turn.id;
      if (ask.signal?.aborted) abort();
      const { status, error } = await finished;
      if (status === 'failed') throw error ?? new AiError('Codex가 답하지 못했습니다.');
      if (status === 'interrupted' && !ask.signal?.aborted)
        throw error ?? new AiError('답이 중간에 멈췄습니다.');
      const text = seen.last ? (messages.get(seen.last) ?? '') : '';
      return { text, stop: 'end', model: thread.model ?? (ask.model || null) };
    } finally {
      ask.signal?.removeEventListener('abort', abort);
      void this.request('thread/unsubscribe', { threadId }).catch(() => undefined);
    }
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.starting = null;
  }
}
