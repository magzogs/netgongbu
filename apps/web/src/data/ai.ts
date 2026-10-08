import type { LabApi } from '@netgongbu/bridge';
import type {
  AiStatus,
  ChatEvent,
  ChatMessage,
  CliProvider,
  ModelsResult,
  PrefsChange,
  ProviderId,
} from '@netgongbu/llm';
import { lab } from './backend';

/**
 * The AI connection and questions to it. Both live where the CLIs can run and the keys are kept:
 * the desktop app's main process (IPC) or, on the web, the local server (/api/ai).
 */
export interface AiClient {
  /** With `refresh`, the CLIs are looked for again and asked who they are signed in as. */
  status: (refresh?: boolean) => Promise<AiStatus>;
  change: (change: PrefsChange) => Promise<AiStatus>;
  setKey: (provider: ProviderId, key: string | null) => Promise<AiStatus>;
  models: (provider: ProviderId, refresh?: boolean) => Promise<ModelsResult>;
  signIn: (provider: CliProvider) => Promise<AiStatus>;
  stopSignIn: () => Promise<AiStatus>;
  signOut: (provider: CliProvider) => Promise<AiStatus>;
  /** Status pushed when it changes (desktop); null where it has to be polled (web). */
  onStatus: ((listener: (status: AiStatus) => void) => () => void) | null;
  /** Calls `onText` with each piece of the answer; resolves when it is complete or stopped. */
  chat: (
    messages: ChatMessage[],
    onText: (text: string) => void,
    signal: AbortSignal,
  ) => Promise<{ model: string | null }>;
}

/** "Error invoking remote method 'x': AiError: message" → "message". */
export function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');
}

let nextId = 0;
const newId = (): string => `q${String(++nextId)}-${String(Date.now())}`;

function viaMain(api: LabApi): AiClient {
  return {
    status: (refresh) => api.connection.status(refresh),
    change: (change) => api.connection.change(change),
    setKey: (provider, key) => api.connection.setKey(provider, key),
    models: (provider, refresh) => api.connection.models(provider, refresh),
    signIn: (provider) => api.connection.signIn(provider),
    stopSignIn: () => api.connection.stopSignIn(),
    signOut: (provider) => api.connection.signOut(provider),
    onStatus: (listener) => api.connection.onStatus(listener),
    chat(messages, onText, signal) {
      const id = newId();
      return new Promise((resolve, reject) => {
        const off = api.chat.onEvent((event) => {
          if (event.id !== id) return;
          if (event.type === 'delta') {
            onText(event.text);
            return;
          }
          off();
          if (event.type === 'done') resolve({ model: event.model });
          else reject(new Error(event.message));
        });
        signal.addEventListener('abort', () => {
          void api.chat.cancel(id);
        });
        api.chat.ask({ id, messages }).catch((err: unknown) => {
          off();
          reject(new Error(errorText(err)));
        });
      });
    },
  };
}

const API = `${import.meta.env.BASE_URL}api/ai`;
const OFFLINE = 'AI 서버에 연결하지 못했습니다. 저장소 루트에서 pnpm dev로 함께 실행하세요.';

async function call<T>(path: string, init?: { body: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...(init && {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(init.body),
      }),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok)
    throw new Error(body?.error ?? (res.status >= 500 ? OFFLINE : `HTTP ${String(res.status)}`));
  return body as T;
}

/** The server's answer stream: `data: <ChatEvent>` lines. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (e: ChatEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) onEvent(JSON.parse(line.slice(5)) as ChatEvent);
      newline = buffer.indexOf('\n');
    }
  }
}

const viaServer: AiClient = {
  status: (refresh) => call(`/status${refresh ? '?refresh=1' : ''}`),
  change: (change) => call('/change', { body: change }),
  setKey: (provider, key) => call('/key', { body: { provider, key } }),
  models: (provider, refresh) => call(`/models?provider=${provider}${refresh ? '&refresh=1' : ''}`),
  signIn: (provider) => call('/sign-in', { body: { provider } }),
  stopSignIn: () => call('/sign-in/stop', { body: {} }),
  signOut: (provider) => call('/sign-out', { body: { provider } }),
  onStatus: null,
  async chat(messages, onText, signal) {
    let res: Response;
    try {
      res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: newId(), messages }),
        signal,
      });
    } catch (err) {
      if (signal.aborted) return { model: null };
      throw err instanceof TypeError ? new Error(OFFLINE) : err;
    }
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? OFFLINE);
    }
    // Set by the event reader.
    const end: { model: string | null; failure: string | null } = { model: null, failure: null };
    try {
      await readEvents(res.body, (event) => {
        if (event.type === 'delta') onText(event.text);
        else if (event.type === 'done') end.model = event.model;
        else end.failure = event.message;
      });
    } catch (err) {
      if (!signal.aborted) throw err;
    }
    if (end.failure) throw new Error(end.failure);
    return { model: end.model };
  },
};

export const ai: AiClient = lab ? viaMain(lab) : viaServer;
