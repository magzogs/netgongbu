import { z } from 'zod';
import type { ModelOption } from '../types';
import { AiError, request, sseJson, type Fetch } from './http';
import type { Answer, Ask, Provider, Turn } from './provider';

/** OpenAI's API with an API key: the model list and the Responses API, streamed. */

const API = 'https://api.openai.com/v1';
const WHAT = 'OpenAI API';

const ModelsSchema = z.object({
  data: z.array(z.object({ id: z.string(), created: z.number().optional() })),
});

// Models that answer questions; not embeddings, speech, images, moderation or old completions.
const CHAT = /^(gpt-|o\d|chatgpt-)/;
const NOT_CHAT =
  /(embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|search|moderation|instruct|babbage|davinci|computer-use|sora)/;
/** Dated snapshots (gpt-4o-2024-08-06) duplicate their alias. */
const SNAPSHOT = /-\d{4}-\d{2}-\d{2}$/;

/**
 * Reasoning effort levels by model family. GET /models does not say which levels a model takes,
 * so they follow OpenAI's documentation per family; "기본값" (no effort sent) is always there.
 */
export function openaiEfforts(id: string): string[] {
  if (/^o\d/.test(id)) return ['low', 'medium', 'high'];
  const match = /^gpt-(\d+)(?:\.(\d+))?/.exec(id);
  if (!match || id.includes('chat')) return [];
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  if (major < 5) return [];
  if (major === 5 && minor === 0) return ['minimal', 'low', 'medium', 'high'];
  if (major === 5 && minor === 1) return ['none', 'low', 'medium', 'high'];
  if (major === 5) return ['none', 'low', 'medium', 'high', 'xhigh'];
  return ['low', 'medium', 'high', 'xhigh'];
}

function input(turn: Turn): unknown {
  if (turn.role === 'assistant') return { role: 'assistant', content: turn.text };
  return {
    role: 'user',
    content: [
      { type: 'input_text', text: turn.text },
      ...(turn.images ?? []).map((url) => ({ type: 'input_image', image_url: url })),
    ],
  };
}

const EventSchema = z.looseObject({
  type: z.string(),
  delta: z.string().optional(),
  message: z.string().optional(),
  response: z
    .looseObject({
      model: z.string().optional(),
      error: z.object({ message: z.string() }).nullish(),
      incomplete_details: z.object({ reason: z.string().optional() }).nullish(),
    })
    .optional(),
});

export function openaiApi(apiKey: string, fetchImpl: Fetch = fetch): Provider {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };

  return {
    async models(signal) {
      const res = await request(
        `${API}/models`,
        { headers, ...(signal && { signal }) },
        WHAT,
        fetchImpl,
      );
      const parsed = ModelsSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new AiError('모델 목록의 형식을 알 수 없습니다.', 'format');
      return parsed.data.data
        .filter((m) => CHAT.test(m.id) && !NOT_CHAT.test(m.id) && !SNAPSHOT.test(m.id))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id))
        .map((m): ModelOption => ({
          id: m.id,
          label: m.id,
          efforts: openaiEfforts(m.id),
          vision: !m.id.startsWith('gpt-3.5'),
        }));
    },

    async ask(ask: Ask): Promise<Answer> {
      if (!ask.model) throw new AiError('사용할 모델을 고르세요.', 'format');
      const res = await request(
        `${API}/responses`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: ask.model,
            instructions: ask.system,
            input: ask.turns.map(input),
            stream: true,
            store: false,
            ...(ask.effort && { reasoning: { effort: ask.effort } }),
            ...(ask.schema && {
              text: {
                format: { type: 'json_schema', name: 'answer', schema: ask.schema, strict: false },
              },
            }),
          }),
          ...(ask.signal && { signal: ask.signal }),
        },
        WHAT,
        fetchImpl,
      );
      if (!res.body) throw new AiError('OpenAI API가 빈 응답을 보냈습니다.', 'format');
      let text = '';
      let stop: Answer['stop'] = 'end';
      let model: string | null = null;
      for await (const json of sseJson(res.body)) {
        const event = EventSchema.safeParse(json);
        if (!event.success) continue;
        const { type, delta, response } = event.data;
        if (type === 'response.output_text.delta' && delta) {
          text += delta;
          ask.onText?.(delta);
        } else if (type === 'response.refusal.delta') {
          stop = 'refusal';
        } else if (type === 'response.completed') {
          model = response?.model ?? model;
        } else if (type === 'response.incomplete') {
          model = response?.model ?? model;
          stop =
            response?.incomplete_details?.reason === 'content_filter' ? 'refusal' : 'max_tokens';
        } else if (type === 'response.failed') {
          throw new AiError(response?.error?.message ?? 'OpenAI API가 답하지 못했습니다.');
        } else if (type === 'error') {
          throw new AiError(event.data.message ?? 'OpenAI API 오류');
        }
      }
      return { text, stop, model };
    },
  };
}
