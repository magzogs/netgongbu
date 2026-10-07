import { describe, expect, it } from 'vitest';
import {
  LlmConfigSchema,
  LlmError,
  listModels,
  splitThinking,
  streamChat,
  type LlmConfig,
} from '../src';

const config: LlmConfig = { baseUrl: 'http://localhost:11434/v1/', model: 'qwen2.5:7b' };

/** A fetch that answers with a stream of these pieces (split anywhere, like a real network). */
function sse(pieces: string[]): typeof fetch {
  return () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const p of pieces) controller.enqueue(encoder.encode(p));
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
  };
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const piece of gen) out += piece;
  return out;
}

const chunk = (text: string): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

describe('streamChat', () => {
  it('joins the streamed pieces, even when a line arrives in two parts', async () => {
    const whole = chunk('IPv4 헤더의 ') + chunk('TTL은 ') + chunk('홉마다 1씩 줄어듭니다.');
    const pieces = [whole.slice(0, 17), whole.slice(17, 60), whole.slice(60), 'data: [DONE]\n\n'];
    const text = await collect(
      streamChat(config, [{ role: 'user', content: 'TTL?' }], undefined, sse(pieces)),
    );
    expect(text).toBe('IPv4 헤더의 TTL은 홉마다 1씩 줄어듭니다.');
  });

  it('posts the model and messages to …/chat/completions', async () => {
    let seen: { url: string; body: unknown } | null = null;
    const fetchImpl = ((url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(init.body as string) };
      return sse(['data: [DONE]\n'])(url, init);
    }) as typeof fetch;
    await collect(streamChat(config, [{ role: 'user', content: 'hi' }], undefined, fetchImpl));
    expect(seen).toMatchObject({
      url: 'http://localhost:11434/v1/chat/completions',
      body: { model: 'qwen2.5:7b', stream: true, messages: [{ role: 'user', content: 'hi' }] },
    });
  });

  it('accepts a whole (unstreamed) answer', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        Response.json({ choices: [{ message: { content: '한 번에 온 답' } }] }),
      )) as typeof fetch;
    expect(await collect(streamChat(config, [], undefined, fetchImpl))).toBe('한 번에 온 답');
  });

  it('explains a server that cannot be reached, and passes on its errors', async () => {
    const refused = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await expect(collect(streamChat(config, [], undefined, refused))).rejects.toMatchObject({
      kind: 'connect',
    });
    const missing = (() =>
      Promise.resolve(
        Response.json({ error: { message: 'model "x" not found' } }, { status: 404 }),
      )) as typeof fetch;
    await expect(collect(streamChat(config, [], undefined, missing))).rejects.toThrow(
      /404.*model "x" not found/,
    );
  });

  it('needs a model', async () => {
    await expect(collect(streamChat({ ...config, model: '' }, []))).rejects.toBeInstanceOf(
      LlmError,
    );
  });
});

describe('listModels', () => {
  it('reads the OpenAI-style model list, sorted', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        Response.json({ object: 'list', data: [{ id: 'llama3.2' }, { id: 'gemma3:4b' }] }),
      )) as typeof fetch;
    expect(await listModels(config, undefined, fetchImpl)).toEqual(['gemma3:4b', 'llama3.2']);
  });
});

describe('config', () => {
  it('takes http(s) server addresses only', () => {
    expect(LlmConfigSchema.safeParse(config).success).toBe(true);
    expect(LlmConfigSchema.safeParse({ ...config, baseUrl: 'file:///etc/passwd' }).success).toBe(
      false,
    );
  });
});

describe('splitThinking', () => {
  it('hides a reasoning model’s thoughts and says when it is still thinking', () => {
    expect(splitThinking('<think>음…</think>\n답입니다')).toEqual({
      answer: '답입니다',
      thinking: false,
    });
    expect(splitThinking('<think>아직 생각')).toEqual({ answer: '', thinking: true });
    expect(splitThinking('그냥 답')).toEqual({ answer: '그냥 답', thinking: false });
  });
});
