import type { LabApi } from '@magvirtualedu/bridge';
import {
  DEFAULT_LLM_CONFIG,
  LlmConfigSchema,
  listModels,
  streamChat,
  type ChatMessage,
  type LlmConfig,
} from '@magvirtualedu/llm';
import { isDesktop, lab } from './backend';

/** How questions reach the local LLM server: directly (web) or through the main process (desktop). */
export interface LlmTransport {
  models: (config: LlmConfig) => Promise<string[]>;
  /** Calls `onText` with each piece of the answer; resolves when it is complete or stopped. */
  chat: (
    config: LlmConfig,
    messages: ChatMessage[],
    onText: (text: string) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}

const MODELS_TIMEOUT_MS = 8000;

const direct: LlmTransport = {
  models: (config) => listModels(config, AbortSignal.timeout(MODELS_TIMEOUT_MS)),
  async chat(config, messages, onText, signal) {
    try {
      for await (const text of streamChat(config, messages, signal)) onText(text);
    } catch (err) {
      if (!signal.aborted) throw err;
    }
  },
};

let nextId = 0;

function viaMain(api: LabApi): LlmTransport {
  return {
    async models(config) {
      const result = await api.llm.models(config);
      if (!result.ok) throw new Error(result.error);
      return result.models;
    },
    chat(config, messages, onText, signal) {
      const id = `q${String(++nextId)}-${String(Date.now())}`;
      return new Promise<void>((resolve, reject) => {
        const off = api.llm.onEvent((event) => {
          if (event.id !== id) return;
          if (event.type === 'delta') {
            onText(event.text);
            return;
          }
          off();
          if (event.type === 'done') resolve();
          else reject(new Error(event.message));
        });
        signal.addEventListener('abort', () => {
          void api.llm.cancel(id);
        });
        api.llm.chat({ id, config, messages }).catch((err: unknown) => {
          off();
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });
    },
  };
}

export const llm: LlmTransport = lab ? viaMain(lab) : direct;

/** Why a web page may not reach a local server although it runs. */
export const CONNECT_HINT = isDesktop
  ? '서버가 실행 중인지, 주소와 포트가 맞는지 확인하세요.'
  : '서버가 실행 중인지 확인하세요. 웹 브라우저에서는 서버가 이 페이지의 요청(CORS)을 허용해야 합니다: Ollama는 기본으로 허용하고, LM Studio는 서버 설정에서 "Enable CORS"를 켜세요.';

const CONFIG_KEY = 'magve.llm';

/** The server last used, remembered in this browser (or this app). */
export function savedLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const parsed = LlmConfigSchema.safeParse(raw ? JSON.parse(raw) : null);
    if (parsed.success) return parsed.data;
  } catch {
    // Start from the default.
  }
  return DEFAULT_LLM_CONFIG;
}

export function saveLlmConfig(config: LlmConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Not remembered; it still applies now.
  }
}
