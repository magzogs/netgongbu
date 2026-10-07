import { describe, expect, it } from 'vitest';
import { BaseUrlSchema, effortLabel, splitThinking } from '../src';
import { localServer } from '../src/node/local';
import { openaiApi, openaiEfforts } from '../src/node/openai';
import { asOnePrompt, toTurns, type Ask } from '../src/node/provider';

/** A fetch that answers with a stream of these pieces (split anywhere, like a real network). */
function sse(pieces: string[], seen?: { url: string; body: unknown }[]): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    seen?.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
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
  }) as typeof fetch;
}

const json =
  (body: unknown, status = 200): typeof fetch =>
  () =>
    Promise.resolve(Response.json(body, { status }));

function ask(over: Partial<Ask> = {}): Ask & { pieces: string[] } {
  const pieces: string[] = [];
  return {
    model: 'm',
    effort: null,
    system: 'sys',
    turns: [{ role: 'user', text: 'TTL?' }],
    onText: (t) => pieces.push(t),
    pieces,
    ...over,
  };
}

const chunk = (text: string): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

describe('local server (OpenAI-compatible)', () => {
  it('joins the streamed pieces, even when a line arrives in two parts', async () => {
    const whole = chunk('IPv4 헤더의 ') + chunk('TTL은 ') + chunk('홉마다 1씩 줄어듭니다.');
    const pieces = [whole.slice(0, 17), whole.slice(17, 60), whole.slice(60), 'data: [DONE]\n\n'];
    const seen: { url: string; body: unknown }[] = [];
    const a = ask();
    const answer = await localServer(
      'http://localhost:11434/v1/',
      undefined,
      sse(pieces, seen),
    ).ask(a);
    expect(answer.text).toBe('IPv4 헤더의 TTL은 홉마다 1씩 줄어듭니다.');
    expect(a.pieces.join('')).toBe(answer.text);
    expect(seen[0]).toMatchObject({
      url: 'http://localhost:11434/v1/chat/completions',
      body: {
        model: 'm',
        stream: true,
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'TTL?' },
        ],
      },
    });
  });

  it('accepts a whole (unstreamed) answer', async () => {
    const fetchImpl = json({ choices: [{ message: { content: '한 번에 온 답' } }] });
    expect((await localServer('http://x/v1', undefined, fetchImpl).ask(ask())).text).toBe(
      '한 번에 온 답',
    );
  });

  it('explains a server that cannot be reached, and passes on its errors', async () => {
    const refused = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await expect(localServer('http://x/v1', undefined, refused).ask(ask())).rejects.toMatchObject({
      kind: 'connect',
    });
    const missing = json({ error: { message: 'model "x" not found' } }, 404);
    await expect(localServer('http://x/v1', undefined, missing).ask(ask())).rejects.toThrow(
      /404.*model "x" not found/,
    );
  });

  it('reads the model list, sorted', async () => {
    const fetchImpl = json({ object: 'list', data: [{ id: 'llama3.2' }, { id: 'gemma3:4b' }] });
    const models = await localServer('http://x/v1', undefined, fetchImpl).models();
    expect(models.map((m) => m.id)).toEqual(['gemma3:4b', 'llama3.2']);
  });
});

describe('OpenAI API', () => {
  const event = (e: unknown): string => `data: ${JSON.stringify(e)}\n\n`;

  it('streams a Responses API answer with the chosen effort', async () => {
    const seen: { url: string; body: unknown }[] = [];
    const fetchImpl = sse(
      [
        event({ type: 'response.created' }),
        event({ type: 'response.output_text.delta', delta: 'TTL은 ' }),
        event({ type: 'response.output_text.delta', delta: '줄어듭니다.' }),
        event({ type: 'response.completed', response: { model: 'gpt-5.2-2026-01-01' } }),
      ],
      seen,
    );
    const a = ask({
      model: 'gpt-5.2',
      effort: 'high',
      turns: [
        { role: 'user', text: '앞 질문' },
        { role: 'assistant', text: '앞 답' },
        { role: 'user', text: 'TTL?', images: ['data:image/png;base64,AAAA'] },
      ],
    });
    const answer = await openaiApi('sk-test', fetchImpl).ask(a);
    expect(answer).toEqual({ text: 'TTL은 줄어듭니다.', stop: 'end', model: 'gpt-5.2-2026-01-01' });
    expect(a.pieces).toEqual(['TTL은 ', '줄어듭니다.']);
    expect(seen[0]?.url).toBe('https://api.openai.com/v1/responses');
    expect(seen[0]?.body).toMatchObject({
      model: 'gpt-5.2',
      instructions: 'sys',
      stream: true,
      reasoning: { effort: 'high' },
      input: [
        { role: 'user', content: [{ type: 'input_text', text: '앞 질문' }] },
        { role: 'assistant', content: '앞 답' },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'TTL?' },
            { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
          ],
        },
      ],
    });
  });

  it('reports a cut-off answer and a failed one', async () => {
    const cut = sse([
      `data: ${JSON.stringify({ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } })}\n\n`,
    ]);
    expect((await openaiApi('k', cut).ask(ask())).stop).toBe('max_tokens');
    const failed = sse([
      `data: ${JSON.stringify({ type: 'response.failed', response: { error: { message: 'boom' } } })}\n\n`,
    ]);
    await expect(openaiApi('k', failed).ask(ask())).rejects.toThrow('boom');
  });

  it('lists chat models newest first, without snapshots and non-chat models', async () => {
    const fetchImpl = json({
      data: [
        { id: 'gpt-4o', created: 10 },
        { id: 'gpt-4o-2024-08-06', created: 11 },
        { id: 'text-embedding-3-large', created: 30 },
        { id: 'gpt-5.2', created: 20 },
        { id: 'o3', created: 15 },
        { id: 'gpt-realtime', created: 40 },
      ],
    });
    const models = await openaiApi('k', fetchImpl).models();
    expect(models.map((m) => [m.id, m.efforts.join(',')])).toEqual([
      ['gpt-5.2', 'none,low,medium,high,xhigh'],
      ['o3', 'low,medium,high'],
      ['gpt-4o', ''],
    ]);
  });

  it('knows the effort levels of each model family', () => {
    expect(openaiEfforts('gpt-5')).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(openaiEfforts('gpt-5.1-mini')).toEqual(['none', 'low', 'medium', 'high']);
    expect(openaiEfforts('gpt-5-chat-latest')).toEqual([]);
    expect(openaiEfforts('gpt-4.1')).toEqual([]);
  });

  it('turns a refused key into an auth error', async () => {
    const refused = json({ error: { message: 'Incorrect API key provided' } }, 401);
    await expect(openaiApi('bad', refused).models()).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('conversation helpers', () => {
  it('splits the viewer’s messages into a system prompt and turns with pictures', () => {
    expect(
      toTurns([
        { role: 'system', content: '지침' },
        { role: 'user', content: '첫 질문' },
        { role: 'assistant', content: '첫 답' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '그림 질문' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
          ],
        },
      ]),
    ).toEqual({
      system: '지침',
      turns: [
        { role: 'user', text: '첫 질문' },
        { role: 'assistant', text: '첫 답' },
        { role: 'user', text: '그림 질문', images: ['data:image/png;base64,AA'] },
      ],
    });
  });

  it('writes earlier turns out as a transcript for one-message CLIs', () => {
    expect(asOnePrompt([{ role: 'user', text: 'q' }])).toEqual({ text: 'q', images: [] });
    const { text } = asOnePrompt([
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
      { role: 'user', text: 'q2' },
    ]);
    expect(text).toBe(
      '<conversation_so_far>\n<user>\nq1\n</user>\n\n<assistant>\na1\n</assistant>\n</conversation_so_far>\n\nq2',
    );
  });

  it('hides a reasoning model’s thoughts and says when it is still thinking', () => {
    expect(splitThinking('<think>음…</think>\n답입니다')).toEqual({
      answer: '답입니다',
      thinking: false,
    });
    expect(splitThinking('<think>아직 생각')).toEqual({ answer: '', thinking: true });
  });

  it('takes http(s) server addresses only, and names effort levels', () => {
    expect(BaseUrlSchema.safeParse('http://localhost:11434/v1').success).toBe(true);
    expect(BaseUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
    expect(effortLabel('xhigh')).toBe('매우 높음 (xhigh)');
    expect(effortLabel('turbo')).toBe('turbo');
  });
});
