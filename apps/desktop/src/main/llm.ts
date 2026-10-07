import type { BrowserWindow } from 'electron';
import { Channels, LlmChatSchema, type LlmEvent, type LlmModels } from '@magvirtualedu/bridge';
import { LlmConfigSchema, listModels, streamChat } from '@magvirtualedu/llm';
import { handle } from './ipc';

/** Longest a model list may take: a server that does not answer is reported quickly. */
const MODELS_TIMEOUT_MS = 8000;

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Questions about the screen to a local LLM server (Ollama, LM Studio, llama.cpp …). The main
 * process makes the requests, so the viewer needs no CORS permission from the server and its
 * Content-Security-Policy stays closed to other origins. The answer streams back as events.
 */
export function registerLlmIpc(win: BrowserWindow, log: (message: string) => void): void {
  const send = (event: LlmEvent): void => {
    if (!win.isDestroyed()) win.webContents.send(Channels.llmEvent, event);
  };
  const running = new Map<string, AbortController>();

  handle(Channels.llmModels, async (raw: unknown): Promise<LlmModels> => {
    const config = LlmConfigSchema.safeParse(raw);
    if (!config.success) return { ok: false, error: '서버 주소가 올바르지 않습니다.' };
    try {
      return {
        ok: true,
        models: await listModels(config.data, AbortSignal.timeout(MODELS_TIMEOUT_MS)),
      };
    } catch (err) {
      return { ok: false, error: message(err) };
    }
  });

  handle(Channels.llmChat, (raw: unknown) => {
    const request = LlmChatSchema.parse(raw);
    running.get(request.id)?.abort();
    const controller = new AbortController();
    running.set(request.id, controller);
    const started = Date.now();
    void (async () => {
      try {
        for await (const text of streamChat(request.config, request.messages, controller.signal)) {
          send({ id: request.id, type: 'delta', text });
        }
        send({ id: request.id, type: 'done' });
        log(`llm ${request.config.model}: answered in ${String(Date.now() - started)} ms`);
      } catch (err) {
        if (controller.signal.aborted) send({ id: request.id, type: 'done' });
        else send({ id: request.id, type: 'error', message: message(err) });
      } finally {
        running.delete(request.id);
      }
    })();
  });

  handle(Channels.llmCancel, (id: unknown) => {
    if (typeof id === 'string') running.get(id)?.abort();
  });
}
