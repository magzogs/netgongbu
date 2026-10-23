import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync } from 'node:fs';
import { tr } from '@netgongbu/schema';
import {
  CLI_PROVIDERS,
  EMPTY_PREFS,
  PROVIDER_IDS,
  PROVIDERS,
  prefsFor,
  type AccountState,
  type AiPrefs,
  type AiStatus,
  type ChatMessage,
  type CliInfo,
  type CliProvider,
  type KeySource,
  type LoginState,
  type ModelOption,
  type ModelsResult,
  type PrefsChange,
  type ProviderId,
  type ProviderPrefs,
} from '../types';
import { anthropicApi } from './anthropic';
import { ClaudeCli } from './claude';
import { CodexAppServer } from './codex';
import { AiError, type Fetch } from './http';
import { localServer } from './local';
import { cliVersion, findCli, isCliPathFor } from './locate';
import { openaiApi } from './openai';
import { toTurns, type Answer, type Provider, type Turn } from './provider';

/** Where API keys are kept: the desktop app's OS keychain. */
export interface SecretStore {
  readonly kind: AiStatus['keyStorage'];
  get: (provider: ProviderId) => { key: string; source: 'saved' | 'environment' } | null;
  /** Throws when the key cannot be stored safely. */
  set: (provider: ProviderId, key: string | null) => void;
}

export interface PrefsStore {
  read: () => AiPrefs | null;
  write: (prefs: AiPrefs) => void;
}

export interface HubOptions {
  prefs: PrefsStore;
  secrets: SecretStore;
  /** An empty folder the CLIs run in (and write a temporary prompt file to). */
  workDir: string;
  log: (message: string) => void;
  /** Opens a sign-in page in the system browser. */
  openExternal: (url: string) => void;
  /** The choice before the learner makes one (e.g. Claude when ANTHROPIC_API_KEY is set). */
  defaults?: AiPrefs;
  fetchImpl?: Fetch;
}

/** The connection questions go to, for code that needs more than `ask` (scenario generation). */
export interface Connection {
  provider: ProviderId;
  method: ProviderPrefs['method'];
  model: string;
  effort: string | null;
  apiKey: string | null;
}

const MODELS_TTL_MS = 10 * 60_000;
const MODELS_TIMEOUT_MS = 30_000;

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function emptyCli(): CliInfo {
  return { path: null, version: null, custom: false, error: null };
}

/**
 * The AI questions go to, for the desktop app's main process: the learner's choice of provider,
 * method, model and effort; API keys; the official CLIs (found, signed in, signed out); model
 * lists; and the calls themselves.
 */
export class AiHub {
  private prefs: AiPrefs;
  private readonly cli: Record<CliProvider, CliInfo> = {
    openai: emptyCli(),
    anthropic: emptyCli(),
  };
  private readonly accounts: Record<CliProvider, AccountState> = {
    openai: { state: 'unknown' },
    anthropic: { state: 'unknown' },
  };
  private readonly detecting = new Map<CliProvider, Promise<void>>();
  private login: LoginState | null = null;
  private cancelLogin: (() => void) | null = null;
  private codex: CodexAppServer | null = null;
  private claude: ClaudeCli | null = null;
  private anthropic: { key: string; client: Anthropic } | null = null;
  private readonly modelCache = new Map<string, { at: number; models: ModelOption[] }>();
  private readonly listeners = new Set<(status: AiStatus) => void>();

  constructor(private readonly options: HubOptions) {
    this.prefs = options.prefs.read() ?? options.defaults ?? EMPTY_PREFS;
    mkdirSync(options.workDir, { recursive: true });
    const active = this.prefs.provider;
    if (active && active !== 'local') void this.detect(active);
  }

  /** Called with the new status whenever it changes (a sign-in finished, a CLI was found). */
  subscribe(listener: (status: AiStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }

  status(): AiStatus {
    const keys = Object.fromEntries(
      PROVIDER_IDS.map((p) => [p, this.options.secrets.get(p)?.source ?? null]),
    ) as Record<ProviderId, KeySource>;
    const notReady = this.whyNotReady();
    return {
      prefs: this.prefs,
      keys,
      keyStorage: this.options.secrets.kind,
      cli: { openai: { ...this.cli.openai }, anthropic: { ...this.cli.anthropic } },
      accounts: { ...this.accounts },
      login: this.login && { ...this.login },
      ready: notReady === null,
      notReady,
    };
  }

  private whyNotReady(): string | null {
    const provider = this.prefs.provider;
    if (!provider)
      return tr(
        '연결된 AI가 없습니다. 연결 설정에서 ChatGPT나 Claude를 연결하세요.',
        'No AI is connected. Connect ChatGPT or Claude in the connection settings.',
      );
    const info = PROVIDERS[provider];
    const prefs = prefsFor(this.prefs, provider);
    if (prefs.method === 'api') {
      if (provider === 'local')
        return prefs.baseUrl
          ? null
          : tr('로컬 서버 주소를 입력하세요.', 'Enter the local server address.');
      // The model is picked from the list once the key works.
      return this.options.secrets.get(provider)
        ? null
        : tr(`${info.label} API 키를 입력하세요.`, `Enter your ${info.label} API key.`);
    }
    const cliName = info.cli?.name ?? 'CLI';
    const cli = this.cli[provider as CliProvider];
    if (!cli.path) {
      return this.detecting.has(provider as CliProvider)
        ? tr(`${cliName}를 찾는 중입니다…`, `Looking for ${cliName}…`)
        : tr(`${cliName}가 설치되어 있지 않습니다.`, `${cliName} is not installed.`);
    }
    const account = this.accounts[provider as CliProvider];
    if (account.state === 'signed-out') {
      return prefs.method === 'oauth'
        ? tr(`${info.label} 계정으로 로그인하세요.`, `Sign in with your ${info.label} account.`)
        : tr(`${cliName}에 로그인되어 있지 않습니다.`, `${cliName} is not signed in.`);
    }
    return null;
  }

  /** Finds the CLI (or checks the one set), its version and who it is signed in as. */
  refresh(provider?: CliProvider): Promise<AiStatus> {
    const which = provider ? [provider] : [...CLI_PROVIDERS];
    return Promise.all(which.map((p) => this.detect(p, true))).then(() => this.status());
  }

  private detect(provider: CliProvider, force = false): Promise<void> {
    const running = this.detecting.get(provider);
    if (running) return running;
    if (!force && this.cli[provider].path) return Promise.resolve();
    const job = (async () => {
      const custom = prefsFor(this.prefs, provider).cliPath;
      const info: CliInfo = { path: null, version: null, custom: Boolean(custom), error: null };
      try {
        const path = custom ?? (await findCli(provider));
        if (path) {
          info.version = await cliVersion(path);
          info.path = path;
        }
      } catch (err) {
        info.error = message(err);
      }
      this.cli[provider] = info;
      if (info.path) await this.checkAccount(provider);
      else this.accounts[provider] = { state: 'unknown' };
    })().finally(() => {
      this.detecting.delete(provider);
      this.changed();
    });
    this.detecting.set(provider, job);
    this.changed();
    return job;
  }

  private async checkAccount(provider: CliProvider): Promise<void> {
    this.accounts[provider] = { state: 'checking' };
    this.changed();
    try {
      this.accounts[provider] =
        provider === 'openai' ? await this.codexCli().account() : await this.claudeCli().account();
    } catch (err) {
      this.accounts[provider] = { state: 'error', message: message(err) };
    }
    this.changed();
  }

  private codexCli(): CodexAppServer {
    const path = this.cli.openai.path;
    if (!path)
      throw new AiError(
        tr('Codex CLI가 설치되어 있지 않습니다.', 'Codex CLI is not installed.'),
        'connect',
      );
    if (this.codex?.path !== path) {
      this.codex?.stop();
      this.codex = new CodexAppServer(path, { cwd: this.options.workDir, log: this.options.log });
    }
    return this.codex;
  }

  private claudeCli(): ClaudeCli {
    const path = this.cli.anthropic.path;
    if (!path)
      throw new AiError(
        tr('Claude Code가 설치되어 있지 않습니다.', 'Claude Code is not installed.'),
        'connect',
      );
    if (this.claude?.path !== path) {
      this.claude = new ClaudeCli(path, { cwd: this.options.workDir, log: this.options.log });
    }
    return this.claude;
  }

  /** The official SDK client for a key (rebuilt when the key changes). */
  anthropicClient(key: string): Anthropic {
    if (this.anthropic?.key !== key) {
      this.anthropic = { key, client: new Anthropic({ apiKey: key }) };
    }
    return this.anthropic.client;
  }

  private key(provider: ProviderId): string {
    const key = this.options.secrets.get(provider)?.key;
    if (!key)
      throw new AiError(
        tr(
          `${PROVIDERS[provider].label} API 키를 입력하세요.`,
          `Enter your ${PROVIDERS[provider].label} API key.`,
        ),
        'auth',
      );
    return key;
  }

  private async providerFor(provider: ProviderId): Promise<Provider> {
    const prefs = prefsFor(this.prefs, provider);
    if (provider === 'local') {
      if (!prefs.baseUrl)
        throw new AiError(
          tr('로컬 서버 주소를 입력하세요.', 'Enter the local server address.'),
          'format',
        );
      return localServer(
        prefs.baseUrl,
        this.options.secrets.get('local')?.key,
        this.options.fetchImpl,
      );
    }
    if (prefs.method === 'api') {
      return provider === 'openai'
        ? openaiApi(this.key('openai'), this.options.fetchImpl)
        : anthropicApi(this.anthropicClient(this.key('anthropic')));
    }
    await this.detect(provider);
    return provider === 'openai' ? this.codexCli() : this.claudeCli();
  }

  /** What the cached model list is for: a different key, CLI or server is a different list. */
  private cacheKey(provider: ProviderId): string {
    const prefs = prefsFor(this.prefs, provider);
    if (provider === 'local') return `local:${prefs.baseUrl ?? ''}`;
    if (prefs.method === 'api')
      return `${provider}:api:${this.options.secrets.get(provider)?.key.slice(-6) ?? ''}`;
    return `${provider}:cli:${this.cli[provider].path ?? ''}`;
  }

  /** The models this provider offers through the chosen method; picks one when none is chosen. */
  async models(provider: ProviderId, refresh = false): Promise<ModelsResult> {
    try {
      const key = this.cacheKey(provider);
      const cached = this.modelCache.get(key);
      let models =
        cached && !refresh && Date.now() - cached.at < MODELS_TTL_MS ? cached.models : null;
      if (!models) {
        const source = await this.providerFor(provider);
        const signal = AbortSignal.timeout(MODELS_TIMEOUT_MS);
        models = await source.models(signal);
        this.modelCache.set(this.cacheKey(provider), { at: Date.now(), models });
      }
      this.pickModel(provider, models);
      return { ok: true, models };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error && err.name === 'TimeoutError'
            ? tr(
                '모델 목록을 가져오는 데 시간이 너무 오래 걸립니다.',
                'Fetching the model list is taking too long.',
              )
            : message(err),
      };
    }
  }

  /** Keeps the chosen model and effort when the list has them, else the recommended model. */
  private pickModel(provider: ProviderId, models: readonly ModelOption[]): void {
    const prefs = prefsFor(this.prefs, provider);
    const model =
      models.find((m) => m.id === prefs.model) ?? models.find((m) => m.recommended) ?? models[0];
    if (!model) return;
    const effort = prefs.effort && model.efforts.includes(prefs.effort) ? prefs.effort : null;
    if (model.id !== prefs.model || effort !== prefs.effort) {
      this.save(provider, { ...prefs, model: model.id, effort });
    }
  }

  private save(provider: ProviderId, prefs: ProviderPrefs, activate = false): void {
    this.prefs = {
      provider: activate ? provider : this.prefs.provider,
      providers: { ...this.prefs.providers, [provider]: prefs },
    };
    this.options.prefs.write(this.prefs);
    this.changed();
  }

  /** The learner changed the connection settings. */
  async change(change: PrefsChange): Promise<AiStatus> {
    const { provider } = change;
    const before = prefsFor(this.prefs, provider);
    const next: ProviderPrefs = { ...before };
    if (change.method && PROVIDERS[provider].methods.includes(change.method))
      next.method = change.method;
    if (change.model !== undefined) next.model = change.model;
    if (change.effort !== undefined) next.effort = change.effort;
    if (change.baseUrl !== undefined && provider === 'local') next.baseUrl = change.baseUrl;
    if (change.cliPath !== undefined && provider !== 'local') {
      if (change.cliPath === null || change.cliPath === '') {
        delete next.cliPath;
      } else if (isCliPathFor(provider, change.cliPath)) {
        next.cliPath = change.cliPath;
      } else {
        throw new AiError(
          tr(
            `${PROVIDERS[provider].cli?.command ?? ''} 실행 파일의 전체 경로를 입력하세요.`,
            `Enter the full path to the ${PROVIDERS[provider].cli?.command ?? ''} executable.`,
          ),
          'format',
        );
      }
    }
    this.save(provider, next, change.activate === true);
    if (provider !== 'local' && next.method !== 'api') {
      await this.detect(provider, next.cliPath !== before.cliPath);
    }
    return this.status();
  }

  setKey(provider: ProviderId, key: string | null): AiStatus {
    this.options.secrets.set(provider, key);
    this.changed();
    return this.status();
  }

  /** Signs in with a ChatGPT or Claude account through the official CLI's OAuth flow. */
  async signIn(provider: CliProvider): Promise<AiStatus> {
    this.cancelLogin?.();
    await this.detect(provider);
    const done = (error: string | null): void => {
      this.cancelLogin = null;
      this.login = error ? { provider, running: false, url: null, error } : null;
      for (const key of this.modelCache.keys())
        if (key.startsWith(provider)) this.modelCache.delete(key);
      this.options.log(`${provider} sign-in ${error ? `failed: ${error}` : 'finished'}`);
      void this.checkAccount(provider);
    };
    this.login = { provider, running: true, url: null, error: null };
    try {
      if (provider === 'openai') {
        const codex = this.codexCli();
        const { loginId, url } = await codex.login(done);
        this.login = { provider, running: true, url, error: null };
        this.cancelLogin = () => {
          void codex.cancelLogin(loginId);
          done(tr('로그인을 취소했습니다.', 'Sign-in canceled.'));
        };
        this.options.openExternal(url);
      } else {
        // Claude Code opens the browser itself; the address is shown in case it could not.
        const { done: finished, cancel } = this.claudeCli().login((url) => {
          if (this.login?.provider === provider) this.login = { ...this.login, url };
          this.changed();
        });
        this.cancelLogin = () => {
          cancel();
        };
        finished.then(
          () => {
            done(null);
          },
          (err: unknown) => {
            done(message(err));
          },
        );
      }
    } catch (err) {
      this.login = { provider, running: false, url: null, error: message(err) };
    }
    this.changed();
    return this.status();
  }

  stopSignIn(): AiStatus {
    this.cancelLogin?.();
    this.login = null;
    this.changed();
    return this.status();
  }

  async signOut(provider: CliProvider): Promise<AiStatus> {
    try {
      if (provider === 'openai') await this.codexCli().logout();
      else await this.claudeCli().logout();
    } finally {
      for (const key of this.modelCache.keys())
        if (key.startsWith(provider)) this.modelCache.delete(key);
      await this.checkAccount(provider);
    }
    return this.status();
  }

  /** The active connection, or null while it is not ready. */
  connection(): Connection | null {
    const provider = this.prefs.provider;
    if (!provider || this.whyNotReady() !== null) return null;
    const prefs = prefsFor(this.prefs, provider);
    return {
      provider,
      method: prefs.method,
      model: prefs.model,
      effort: this.effortFor(provider),
      apiKey: prefs.method === 'api' ? (this.options.secrets.get(provider)?.key ?? null) : null,
    };
  }

  /** The chosen effort, when the chosen model takes it (as far as the last model list says). */
  private effortFor(provider: ProviderId): string | null {
    const prefs = prefsFor(this.prefs, provider);
    if (!prefs.effort) return null;
    const listed = this.modelCache
      .get(this.cacheKey(provider))
      ?.models.find((m) => m.id === prefs.model);
    return !listed || listed.efforts.includes(prefs.effort) ? prefs.effort : null;
  }

  private active(): { provider: ProviderId; prefs: ProviderPrefs } {
    const provider = this.prefs.provider;
    const why = this.whyNotReady();
    if (!provider || why)
      throw new AiError(why ?? tr('연결된 AI가 없습니다.', 'No AI is connected.'), 'auth');
    return { provider, prefs: prefsFor(this.prefs, provider) };
  }

  /** Asks the active model; `onText` gets the answer as it is written. */
  async chat(
    messages: readonly ChatMessage[],
    onText: (text: string) => void,
    signal: AbortSignal,
  ): Promise<{ model: string | null }> {
    const { provider, prefs } = this.active();
    const source = await this.providerFor(provider);
    const { system, turns } = toTurns(messages);
    const answer = await source.ask({
      model: prefs.model,
      effort: this.effortFor(provider),
      system,
      turns,
      signal,
      onText,
    });
    if (answer.stop === 'refusal' && !answer.text)
      throw new AiError(
        tr('AI가 이 질문에 대한 답을 거절했습니다.', 'The AI declined to answer this question.'),
        'refused',
      );
    return { model: answer.model };
  }

  /** A whole answer that follows a JSON Schema (scenario generation), from the active model. */
  async complete(request: {
    system: string;
    turns: Turn[];
    schema: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<Answer> {
    const { provider, prefs } = this.active();
    const source = await this.providerFor(provider);
    return source.ask({
      model: prefs.model,
      effort: this.effortFor(provider),
      system: request.system,
      turns: request.turns,
      schema: request.schema,
      ...(request.signal && { signal: request.signal }),
    });
  }

  dispose(): void {
    this.cancelLogin?.();
    this.codex?.stop();
    this.codex = null;
  }
}
