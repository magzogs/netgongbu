import { z } from 'zod';

/*
 * A local LLM server with an OpenAI-compatible API: Ollama (/v1), LM Studio, llama.cpp's
 * llama-server, vLLM, LocalAI, Jan. The viewer uses it to answer questions about what is on
 * screen. The web viewer calls the server directly; the desktop app calls it from its main
 * process (no CORS, and the page's Content-Security-Policy stays strict).
 */

export const LlmConfigSchema = z.object({
  /** e.g. http://localhost:11434/v1 (the part before /chat/completions). */
  baseUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((u) => /^https?:\/\/[^\s/]+/.test(u), 'http:// 또는 https:// 주소가 필요합니다.'),
  model: z.string().trim().max(400),
  /** Optional: most local servers take none (or any). */
  apiKey: z.string().trim().max(400).optional(),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export const ChatPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  /** A picture as a data: URL, for models that can see (llava, qwen2.5-vl, gemma3, …). */
  z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string() }) }),
]);
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([z.string(), z.array(ChatPartSchema)]),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export interface LlmPreset {
  id: string;
  label: string;
  baseUrl: string;
}

/** Where the common local servers listen by default. */
export const LLM_PRESETS: readonly LlmPreset[] = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1' },
];

export const DEFAULT_LLM_CONFIG: LlmConfig = { baseUrl: LLM_PRESETS[0]?.baseUrl ?? '', model: '' };

export class LlmError extends Error {
  constructor(
    message: string,
    /** connect: the server could not be reached; http: it answered with an error. */
    readonly kind: 'connect' | 'http' | 'format' = 'http',
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

type Fetch = typeof fetch;

function endpoint(config: LlmConfig, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, '')}/${path}`;
}

function headers(config: LlmConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(config.apiKey && { authorization: `Bearer ${config.apiKey}` }),
  };
}

async function request(
  config: LlmConfig,
  path: string,
  init: RequestInit,
  fetchImpl: Fetch,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(endpoint(config, path), init);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new LlmError(`LLM 서버(${config.baseUrl})에 연결하지 못했습니다.`, 'connect');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // OpenAI-style errors: {"error": {"message": …}} or {"error": "…"}.
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } | string };
      detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? detail);
    } catch {
      // Not JSON: keep the text.
    }
    throw new LlmError(`LLM 서버 오류 (HTTP ${String(res.status)})${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

const ModelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

/** The models the server offers (GET /models), sorted. */
export async function listModels(
  config: LlmConfig,
  signal?: AbortSignal,
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  const res = await request(
    config,
    'models',
    { headers: headers(config), ...(signal && { signal }) },
    fetchImpl,
  );
  const parsed = ModelsSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new LlmError('모델 목록의 형식을 알 수 없습니다.', 'format');
  return parsed.data.data.map((m) => m.id).sort((a, b) => a.localeCompare(b));
}

const ChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).optional(),
        message: z.object({ content: z.string().nullish() }).optional(),
      }),
    )
    .optional(),
});

/** Text in one streamed chunk (or in a whole, unstreamed answer). */
function textOf(json: unknown): string {
  const parsed = ChunkSchema.safeParse(json);
  const choice = parsed.success ? parsed.data.choices?.[0] : undefined;
  return choice?.delta?.content ?? choice?.message?.content ?? '';
}

/**
 * Lines of a server-sent event stream as they arrive. Exported for tests.
 */
export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        yield buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Asks the model and yields its answer piece by piece as it is written
 * (POST /chat/completions with stream: true).
 */
export async function* streamChat(
  config: LlmConfig,
  messages: readonly ChatMessage[],
  signal?: AbortSignal,
  fetchImpl: Fetch = fetch,
): AsyncGenerator<string> {
  if (!config.model) throw new LlmError('사용할 모델을 고르세요.', 'format');
  const res = await request(
    config,
    'chat/completions',
    {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify({ model: config.model, messages, stream: true, temperature: 0.3 }),
      ...(signal && { signal }),
    },
    fetchImpl,
  );
  // A server that ignores `stream` answers with one JSON body.
  if (!res.headers.get('content-type')?.includes('text/event-stream') || !res.body) {
    const text = textOf(await res.json().catch(() => null));
    if (text) yield text;
    return;
  }
  for await (const line of lines(res.body)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    const error = (json as { error?: { message?: string } | string }).error;
    if (error) throw new LlmError(typeof error === 'string' ? error : (error.message ?? '오류'));
    const text = textOf(json);
    if (text) yield text;
  }
}

/**
 * Reasoning models (qwen3, deepseek-r1, …) think aloud between <think> tags before they answer.
 * Splits that from the answer; `thinking` is true while the thought is still being written.
 */
export function splitThinking(text: string): { answer: string; thinking: boolean } {
  let answer = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
  const open = answer.indexOf('<think>');
  const thinking = open >= 0;
  if (thinking) answer = answer.slice(0, open);
  return { answer: answer.trimStart(), thinking };
}
