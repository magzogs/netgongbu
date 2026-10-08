import { z } from 'zod';
import { tr } from '@netgongbu/schema';
import type { ModelOption } from '../types';
import { AiError, request, sseJson, type Fetch } from './http';
import type { Answer, Ask, Provider, Turn } from './provider';

/*
 * A local server with an OpenAI-compatible Chat Completions API: Ollama (/v1), LM Studio,
 * llama.cpp's llama-server, vLLM, LocalAI, Jan.
 */

const ModelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

const ChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).optional(),
        message: z.object({ content: z.string().nullish() }).optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  model: z.string().optional(),
  error: z.union([z.string(), z.object({ message: z.string().optional() })]).optional(),
});

type Content =
  string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

function content(turn: Turn): Content {
  if (!turn.images?.length) return turn.text;
  return [
    { type: 'text', text: turn.text },
    ...turn.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ];
}

export function localServer(baseUrl: string, apiKey?: string, fetchImpl: Fetch = fetch): Provider {
  const base = baseUrl.replace(/\/+$/, '');
  const what = tr(`LLM 서버(${baseUrl})`, `the LLM server (${baseUrl})`);
  const headers = {
    'content-type': 'application/json',
    ...(apiKey && { authorization: `Bearer ${apiKey}` }),
  };

  return {
    async models(signal) {
      const res = await request(
        `${base}/models`,
        { headers, ...(signal && { signal }) },
        what,
        fetchImpl,
      );
      const parsed = ModelsSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success)
        throw new AiError(
          tr('모델 목록의 형식을 알 수 없습니다.', 'The model list is in an unknown format.'),
          'format',
        );
      return parsed.data.data
        .map((m): ModelOption => ({ id: m.id, label: m.id, efforts: [] }))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async ask(ask: Ask): Promise<Answer> {
      if (!ask.model)
        throw new AiError(tr('사용할 모델을 고르세요.', 'Choose a model to use.'), 'format');
      const res = await request(
        `${base}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: ask.model,
            messages: [
              { role: 'system', content: ask.system },
              ...ask.turns.map((t) => ({ role: t.role, content: content(t) })),
            ],
            stream: true,
            temperature: 0.3,
            ...(ask.schema && {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'answer', schema: ask.schema },
              },
            }),
          }),
          ...(ask.signal && { signal: ask.signal }),
        },
        what,
        fetchImpl,
      );
      let text = '';
      let stop: Answer['stop'] = 'end';
      let model: string | null = null;
      const take = (json: unknown): void => {
        const chunk = ChunkSchema.safeParse(json);
        if (!chunk.success) return;
        const { error } = chunk.data;
        if (error)
          throw new AiError(
            typeof error === 'string' ? error : (error.message ?? tr('오류', 'Error')),
          );
        model = chunk.data.model ?? model;
        const choice = chunk.data.choices?.[0];
        if (choice?.finish_reason === 'length') stop = 'max_tokens';
        const piece = choice?.delta?.content ?? choice?.message?.content ?? '';
        if (piece) {
          text += piece;
          ask.onText?.(piece);
        }
      };
      // A server that ignores `stream` answers with one JSON body.
      if (!res.headers.get('content-type')?.includes('text/event-stream') || !res.body) {
        take(await res.json().catch(() => null));
      } else {
        for await (const json of sseJson(res.body)) take(json);
      }
      return { text, stop, model };
    },
  };
}
