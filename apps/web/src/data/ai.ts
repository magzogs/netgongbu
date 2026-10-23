import type { LabApi } from '@netgongbu/bridge';
import type {
  AiStatus,
  ChatMessage,
  CliProvider,
  ModelsResult,
  PrefsChange,
  ProviderId,
} from '@netgongbu/llm';
import { lab } from './backend';

/**
 * The AI connection and questions to it. Both live where the CLIs can run and the keys are kept:
 * the desktop app's main process (IPC).
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
  /** The status whenever it changes (a sign-in finished, a CLI was found). */
  onStatus: (listener: (status: AiStatus) => void) => () => void;
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

export const ai: AiClient = viaMain(lab);
