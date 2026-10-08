import type { BrowserWindow } from 'electron';
import { z } from 'zod';
import { Channels } from '@netgongbu/bridge';
import {
  ApiKeyInputSchema,
  CLI_PROVIDERS,
  ChatRequestSchema,
  PROVIDER_IDS,
  PrefsChangeSchema,
  type ChatEvent,
} from '@netgongbu/llm';
import type { AiHub } from '@netgongbu/llm/node';
import { handle } from './ipc';

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const ProviderSchema = z.enum(PROVIDER_IDS);
const CliProviderSchema = z.enum(CLI_PROVIDERS);

/**
 * The AI connection and questions to it. The main process holds the API keys (encrypted by the
 * OS keychain), runs the official CLIs and makes every request, so the viewer needs no CORS
 * permission and its Content-Security-Policy stays closed to other origins. Answers stream back
 * as events; the connection status is pushed whenever it changes (a sign-in finished).
 */
export function registerConnectionIpc(
  win: BrowserWindow,
  hub: AiHub,
  log: (message: string) => void,
): void {
  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };
  hub.subscribe((status) => {
    send(Channels.connectionEvent, status);
  });

  handle(Channels.connectionStatus, (refresh: unknown) =>
    refresh === true ? hub.refresh() : hub.status(),
  );
  handle(Channels.connectionChange, (raw: unknown) => hub.change(PrefsChangeSchema.parse(raw)));
  handle(Channels.connectionKey, (raw: unknown) => {
    const { provider, key } = ApiKeyInputSchema.parse(raw);
    return hub.setKey(provider, key);
  });
  handle(Channels.connectionModels, (provider: unknown, refresh: unknown) =>
    hub.models(ProviderSchema.parse(provider), refresh === true),
  );
  handle(Channels.connectionSignIn, (provider: unknown) =>
    hub.signIn(CliProviderSchema.parse(provider)),
  );
  handle(Channels.connectionStopSignIn, () => hub.stopSignIn());
  handle(Channels.connectionSignOut, (provider: unknown) =>
    hub.signOut(CliProviderSchema.parse(provider)),
  );

  const running = new Map<string, AbortController>();
  handle(Channels.chatAsk, (raw: unknown) => {
    const request = ChatRequestSchema.parse(raw);
    running.get(request.id)?.abort();
    const controller = new AbortController();
    running.set(request.id, controller);
    const emit = (event: ChatEvent): void => {
      send(Channels.chatEvent, event);
    };
    const started = Date.now();
    void hub
      .chat(
        request.messages,
        (text) => {
          emit({ id: request.id, type: 'delta', text });
        },
        controller.signal,
      )
      .then(({ model }) => {
        emit({ id: request.id, type: 'done', model });
        log(`chat ${model ?? '?'}: answered in ${String(Date.now() - started)} ms`);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) emit({ id: request.id, type: 'done', model: null });
        else emit({ id: request.id, type: 'error', message: message(err) });
      })
      .finally(() => {
        running.delete(request.id);
      });
  });
  handle(Channels.chatCancel, (id: unknown) => {
    if (typeof id === 'string') running.get(id)?.abort();
  });
}
