import type { StateCreator } from 'zustand';
import { splitThinking, type ChatMessage, type LlmConfig } from '@magvirtualedu/llm';
import { llm, saveLlmConfig, savedLlmConfig } from '../data/llm';
import { screenContext, type LabFocus } from '../engine/screenContext';
import { captureScene } from '../scene/capture';
import type { ViewerState } from './viewer';

/**
 * Questions about what is on screen, answered by a local LLM (Ollama, LM Studio, …). Each
 * question is sent with a written description of the screen at that moment (and, for models that
 * can see, optionally a picture of the 3D view).
 */

export interface TutorMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** For a question: what of the screen went with it. */
  chips?: string[];
  withImage?: boolean;
  /** For an answer: still being written, or why it failed. */
  pending?: boolean;
  error?: string;
}

export type ModelList =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; models: string[] }
  | { kind: 'error'; message: string };

export interface TutorSlice {
  tutorOpen: boolean;
  setTutorOpen: (open: boolean) => void;
  llmConfig: LlmConfig;
  setLlmConfig: (config: LlmConfig) => void;
  llmModels: ModelList;
  /** Asks the server which models it has; picks the first when none is chosen. */
  refreshModels: () => Promise<void>;
  tutorMessages: TutorMessage[];
  tutorBusy: boolean;
  /** Send a picture of the 3D view with each question (models that can see). */
  tutorWithImage: boolean;
  setTutorWithImage: (on: boolean) => void;
  /** Opens the panel and asks; the answer streams into the conversation. */
  askTutor: (question: string) => Promise<void>;
  stopTutor: () => void;
  clearTutor: () => void;
  /** The packet anatomy view's layer and field, for questions about it. */
  labFocus: LabFocus | null;
  setLabFocus: (focus: LabFocus | null) => void;
}

const SYSTEM = [
  '당신은 네트워크 교육 앱 "Network in 3D"의 튜터입니다. 이 앱은 메시지가 브라우저에서 출발해 운영체제, 랜카드, 공유기, 통신사 라우터를 거쳐 서버까지 가는 과정을 3D 지도 위에서 단계별로 보여 주고, 패킷을 계층별 헤더와 실제 바이트로 해부해 보여 줍니다.',
  '학습자가 지금 보고 있는 화면의 내용이 [화면] 아래에 글로 주어집니다(그림이 함께 오면 3D 장면의 모습입니다). 그 내용을 근거로 학습자의 질문에 한국어로 답하세요.',
  '- 화면에 있는 값(주소, 포트, 헤더 필드, 장비)을 그대로 짚어 가며 설명하고, 장비는 화면의 번호와 이름으로 부르세요(예: "3번 공유기").',
  '- 화면에 없는 내용은 일반적인 네트워크 지식으로 보충하되, 그렇다고 밝히세요. 모르는 것은 지어내지 마세요.',
  '- 처음 배우는 사람이 이해하도록 짧은 문단과 목록으로, 필요하면 간단한 비유를 쓰세요. 용어는 처음 나올 때 풀어 쓰세요.',
].join('\n');

/** Earlier turns sent with a new question; the screen description is sent only once, fresh. */
const HISTORY_TURNS = 6;

let nextMessageId = 0;
let running: AbortController | null = null;

export const createTutorSlice: StateCreator<ViewerState, [], [], TutorSlice> = (set, get) => ({
  tutorOpen: false,
  setTutorOpen(tutorOpen) {
    set({ tutorOpen });
    if (tutorOpen && get().llmModels.kind === 'idle') void get().refreshModels();
  },
  llmConfig: savedLlmConfig(),
  setLlmConfig(llmConfig) {
    saveLlmConfig(llmConfig);
    set({ llmConfig });
  },
  llmModels: { kind: 'idle' },
  async refreshModels() {
    const config = get().llmConfig;
    set({ llmModels: { kind: 'loading' } });
    try {
      const models = await llm.models(config);
      set({ llmModels: { kind: 'ready', models } });
      const current = get().llmConfig;
      if (models.length > 0 && !models.includes(current.model)) {
        get().setLlmConfig({ ...current, model: models[0] ?? '' });
      }
    } catch (err) {
      set({
        llmModels: { kind: 'error', message: err instanceof Error ? err.message : String(err) },
      });
    }
  },
  tutorMessages: [],
  tutorBusy: false,
  tutorWithImage: false,
  setTutorWithImage(tutorWithImage) {
    set({ tutorWithImage });
  },

  async askTutor(question) {
    const text = question.trim();
    if (!text || get().tutorBusy) return;
    const state = get();
    const context = screenContext(state);
    const image = state.tutorWithImage ? captureScene() : null;
    const history: ChatMessage[] = state.tutorMessages
      .filter((m) => !m.pending && !m.error && m.text)
      .slice(-HISTORY_TURNS * 2)
      .map((m) => ({
        role: m.role,
        content: m.role === 'assistant' ? splitThinking(m.text).answer : m.text,
      }));
    const messages: ChatMessage[] = [
      { role: 'system', content: `${SYSTEM}\n\n[화면]\n${context.text}` },
      ...history,
      {
        role: 'user',
        content: image
          ? [
              { type: 'text', text },
              { type: 'image_url', image_url: { url: image } },
            ]
          : text,
      },
    ];
    const asked: TutorMessage = {
      id: ++nextMessageId,
      role: 'user',
      text,
      chips: context.chips,
      withImage: image !== null,
    };
    const answerId = ++nextMessageId;
    set((s) => ({
      tutorOpen: true,
      tutorBusy: true,
      tutorMessages: [
        ...s.tutorMessages,
        asked,
        { id: answerId, role: 'assistant', text: '', pending: true },
      ],
    }));
    const update = (change: (m: TutorMessage) => TutorMessage): void => {
      set((s) => ({
        tutorMessages: s.tutorMessages.map((m) => (m.id === answerId ? change(m) : m)),
      }));
    };

    const controller = new AbortController();
    running = controller;
    try {
      await llm.chat(
        state.llmConfig,
        messages,
        (piece) => {
          update((m) => ({ ...m, text: m.text + piece }));
        },
        controller.signal,
      );
      update((m) => ({ ...m, pending: false }));
    } catch (err) {
      update((m) => ({
        ...m,
        pending: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      if (running === controller) running = null;
      set({ tutorBusy: false });
    }
  },

  stopTutor() {
    running?.abort();
  },

  clearTutor() {
    running?.abort();
    set({ tutorMessages: [] });
  },

  labFocus: null,
  setLabFocus(labFocus) {
    set({ labFocus });
  },
});
