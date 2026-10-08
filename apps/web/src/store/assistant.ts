import type { StateCreator } from 'zustand';
import {
  splitThinking,
  type AiStatus,
  type ChatMessage,
  type CliProvider,
  type ModelOption,
  type PrefsChange,
  type ProviderId,
} from '@netgongbu/llm';
import type { ValidationIssue } from '@netgongbu/schema';
import { ai, errorText } from '../data/ai';
import { AskError, type AiStatus as ScenarioAvailability } from '../data/aiApi';
import { backend } from '../data/backend';
import { screenContext, type LabFocus } from '../engine/screenContext';
import { captureScene } from '../scene/capture';
import type { ViewerState } from './viewer';

/**
 * Questions to AI, in one conversation: questions about what is on screen (answered in words,
 * with a description of the screen and optionally a picture of the 3D view) and questions to
 * show as a new scenario (generated, checked and played). The AI is whichever the learner
 * connected: ChatGPT or Claude by account, API key or CLI, or a local model.
 */

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  /** question: answered in words; scenario: answered with a new scenario. */
  kind: 'question' | 'scenario';
  text: string;
  /** For a question: what of the screen went with it. */
  chips?: string[];
  withImage?: boolean;
  /** For an answer: still being written (a scenario: since when), or why it failed. */
  pending?: boolean;
  startedAt?: number;
  error?: string;
  issues?: readonly ValidationIssue[];
  /** For a made scenario: the entry to open again. */
  scenarioId?: string;
}

export type ModelList =
  | { kind: 'loading' }
  | { kind: 'ready'; models: ModelOption[] }
  | { kind: 'error'; message: string };

export interface AssistantSlice {
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  /** The AI connection; null until it has been read (or while the server is offline). */
  connection: AiStatus | null;
  connectionError: string | null;
  /** Reads the connection; with `refresh`, the CLIs are looked for and asked again. */
  loadConnection: (refresh?: boolean) => Promise<void>;
  /** Subscribes to connection changes (once, at start). */
  connectAssistant: () => Promise<void>;
  changeConnection: (change: PrefsChange) => Promise<void>;
  setApiKey: (provider: ProviderId, key: string | null) => Promise<void>;
  signIn: (provider: CliProvider) => Promise<void>;
  stopSignIn: () => Promise<void>;
  signOut: (provider: CliProvider) => Promise<void>;
  models: Partial<Record<ProviderId, ModelList>>;
  loadModels: (provider: ProviderId, refresh?: boolean) => Promise<void>;

  /** Whether a scenario can be generated (the server or main process has a model). */
  aiStatus: ScenarioAvailability;
  checkAi: () => Promise<void>;

  messages: AssistantMessage[];
  /** An answer in words is being written. */
  answering: boolean;
  /** A scenario is being made. */
  making: boolean;
  /** Send a picture of the 3D view with each question (models that can see). */
  withImage: boolean;
  setWithImage: (on: boolean) => void;
  /** Opens the panel and asks about the screen; the answer streams into the conversation. */
  ask: (question: string) => Promise<void>;
  /** Opens the panel and makes a scenario that shows the answer, then plays it. */
  makeScenario: (question: string) => Promise<void>;
  stopAnswer: () => void;
  clearConversation: () => void;
  /** The packet anatomy view's layer and field, for questions about it. */
  labFocus: LabFocus | null;
  setLabFocus: (focus: LabFocus | null) => void;
}

const SYSTEM = [
  '당신은 네트워크 교육 앱 "Net Gongbu"의 튜터입니다. 이 앱은 메시지가 브라우저에서 출발해 운영체제, 랜카드, 공유기, 통신사 라우터를 거쳐 서버까지 가는 과정을 3D 지도 위에서 단계별로 보여 주고, 패킷을 계층별 헤더와 실제 바이트로 해부해 보여 줍니다.',
  '학습자가 지금 보고 있는 화면의 내용이 질문과 함께 [화면] 아래에 글로 주어집니다(그림이 함께 오면 3D 장면의 모습입니다). 그 내용을 근거로 학습자의 질문에 한국어로 답하세요.',
  '- 화면에 있는 값(주소, 포트, 헤더 필드, 장비)을 그대로 짚어 가며 설명하고, 장비는 화면의 번호와 이름으로 부르세요(예: "3번 공유기").',
  '- 화면에 없는 내용은 일반적인 네트워크 지식으로 보충하되, 그렇다고 밝히세요. 모르는 것은 지어내지 마세요.',
  '- 처음 배우는 사람이 이해하도록 짧은 문단과 목록으로, 필요하면 간단한 비유를 쓰세요. 용어는 처음 나올 때 풀어 쓰세요.',
  '- 지금 화면에 없는 과정(다른 명령, 다른 상황)을 궁금해하면, 질문 칸의 "시나리오로 보기"를 누르면 그 과정을 3D로 만들어 재생할 수 있다고 알려 주세요.',
].join('\n');

/** Earlier questions and answers sent with a new question; the screen goes only with the last. */
const HISTORY_TURNS = 6;
/** While a sign-in or an account check runs, the web viewer asks for the status this often. */
const POLL_MS = 1500;

let nextMessageId = 0;
let running: AbortController | null = null;
let poll: number | null = null;

function inProgress(status: AiStatus | null): boolean {
  return Boolean(
    status &&
    (status.login?.running === true ||
      status.accounts.openai.state === 'checking' ||
      status.accounts.anthropic.state === 'checking'),
  );
}

export const createAssistantSlice: StateCreator<ViewerState, [], [], AssistantSlice> = (
  set,
  get,
) => {
  /** A new status: keep it, and (web) keep asking while something is still running. */
  const take = (connection: AiStatus): void => {
    const before = get().connection;
    set({ connection, connectionError: null });
    if (before?.ready !== connection.ready || before.prefs.provider !== connection.prefs.provider)
      void get().checkAi();
    if (ai.onStatus || poll !== null || !inProgress(connection)) return;
    poll = window.setInterval(() => {
      void ai.status().then(
        (next) => {
          if (!inProgress(next) && poll !== null) {
            window.clearInterval(poll);
            poll = null;
          }
          take(next);
        },
        () => undefined,
      );
    }, POLL_MS);
  };
  const failed = (err: unknown): void => {
    set({ connectionError: errorText(err) });
  };

  return {
    assistantOpen: false,
    setAssistantOpen(assistantOpen) {
      set({ assistantOpen });
      if (assistantOpen) void get().loadConnection(true);
    },

    connection: null,
    connectionError: null,
    async loadConnection(refresh = false) {
      try {
        take(await ai.status(refresh));
      } catch (err) {
        failed(err);
      }
    },
    async connectAssistant() {
      ai.onStatus?.(take);
      await get().loadConnection();
    },
    async changeConnection(change) {
      try {
        take(await ai.change(change));
      } catch (err) {
        failed(err);
      }
    },
    async setApiKey(provider, key) {
      try {
        take(await ai.setKey(provider, key));
        await get().loadModels(provider, true);
      } catch (err) {
        failed(err);
      }
    },
    async signIn(provider) {
      try {
        take(await ai.signIn(provider));
      } catch (err) {
        failed(err);
      }
    },
    async stopSignIn() {
      try {
        take(await ai.stopSignIn());
      } catch (err) {
        failed(err);
      }
    },
    async signOut(provider) {
      try {
        take(await ai.signOut(provider));
      } catch (err) {
        failed(err);
      }
    },

    models: {},
    async loadModels(provider, refresh = false) {
      set((s) => ({ models: { ...s.models, [provider]: { kind: 'loading' } } }));
      try {
        const result = await ai.models(provider, refresh);
        set((s) => ({
          models: {
            ...s.models,
            [provider]: result.ok
              ? { kind: 'ready', models: result.models }
              : { kind: 'error', message: result.error },
          },
        }));
        // Listing may have picked a model: read the choice back.
        if (result.ok) await get().loadConnection();
      } catch (err) {
        set((s) => ({
          models: { ...s.models, [provider]: { kind: 'error', message: errorText(err) } },
        }));
      }
    },

    aiStatus: 'checking',
    async checkAi() {
      set({ aiStatus: await backend.aiStatus() });
    },

    messages: [],
    answering: false,
    making: false,
    withImage: false,
    setWithImage(withImage) {
      set({ withImage });
    },

    async ask(question) {
      const text = question.trim();
      if (!text || get().answering) return;
      const state = get();
      const context = screenContext(state);
      const image = state.withImage ? captureScene() : null;
      const history: ChatMessage[] = state.messages
        .filter((m) => m.kind === 'question' && !m.pending && !m.error && m.text)
        .slice(-HISTORY_TURNS * 2)
        .map((m) => ({
          role: m.role,
          content: m.role === 'assistant' ? splitThinking(m.text).answer : m.text,
        }));
      const prompt = `[화면]\n${context.text}\n\n[질문]\n${text}`;
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM },
        ...history,
        {
          role: 'user',
          content: image
            ? [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: image } },
              ]
            : prompt,
        },
      ];
      const askedId = ++nextMessageId;
      const answerId = ++nextMessageId;
      set((s) => ({
        assistantOpen: true,
        answering: true,
        messages: [
          ...s.messages,
          {
            id: askedId,
            role: 'user',
            kind: 'question',
            text,
            chips: context.chips,
            withImage: image !== null,
          },
          { id: answerId, role: 'assistant', kind: 'question', text: '', pending: true },
        ],
      }));
      const update = (change: (m: AssistantMessage) => AssistantMessage): void => {
        set((s) => ({ messages: s.messages.map((m) => (m.id === answerId ? change(m) : m)) }));
      };

      const controller = new AbortController();
      running = controller;
      try {
        await ai.chat(
          messages,
          (piece) => {
            update((m) => ({ ...m, text: m.text + piece }));
          },
          controller.signal,
        );
        update((m) => ({ ...m, pending: false }));
      } catch (err) {
        update((m) => ({ ...m, pending: false, error: errorText(err) }));
      } finally {
        if (running === controller) running = null;
        set({ answering: false });
      }
    },

    async makeScenario(question) {
      const text = question.trim();
      const topologyId = get().world?.topology.id;
      if (text.length < 3 || !topologyId || get().making) return;
      const askedId = ++nextMessageId;
      const answerId = ++nextMessageId;
      set((s) => ({
        assistantOpen: true,
        making: true,
        messages: [
          ...s.messages,
          { id: askedId, role: 'user', kind: 'scenario', text },
          {
            id: answerId,
            role: 'assistant',
            kind: 'scenario',
            text: '',
            pending: true,
            startedAt: Date.now(),
          },
        ],
      }));
      const update = (change: Partial<AssistantMessage>): void => {
        set((s) => ({
          messages: s.messages.map((m) => (m.id === answerId ? { ...m, ...change } : m)),
        }));
      };
      try {
        const { entry } = await backend.ask(topologyId, text);
        set((s) => ({ catalog: [{ ...entry, source: 'ai' as const }, ...s.catalog] }));
        update({
          pending: false,
          text: `“${entry.title}” 시나리오를 만들었습니다. 지금 재생합니다.`,
          scenarioId: entry.id,
        });
        await get().open(entry.id);
      } catch (err) {
        update({
          pending: false,
          error: errorText(err),
          issues: err instanceof AskError ? err.issues : [],
        });
      } finally {
        set({ making: false });
      }
    },

    stopAnswer() {
      running?.abort();
    },

    clearConversation() {
      running?.abort();
      set({ messages: [] });
    },

    labFocus: null,
    setLabFocus(labFocus) {
      set({ labFocus });
    },
  };
};
