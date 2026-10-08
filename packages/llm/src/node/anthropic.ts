import Anthropic from '@anthropic-ai/sdk';
import { tr } from '@netgongbu/schema';
import type { ModelOption } from '../types';
import { AiError, parseDataUrl } from './http';
import type { Answer, Ask, Provider, Turn } from './provider';

/** Claude through the Messages API with an API key (the official SDK). */

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/** Models that accept server-side `fallbacks: "default"` when a request is declined. */
export const FALLBACK_CAPABLE = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

type ImageType = Anthropic.Beta.BetaBase64ImageSource['media_type'];
const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function content(turn: Turn): Anthropic.Beta.BetaMessageParam['content'] {
  if (turn.role === 'assistant' || !turn.images?.length) return turn.text;
  const images = turn.images.flatMap((url): Anthropic.Beta.BetaImageBlockParam[] => {
    const image = parseDataUrl(url);
    if (!image || !IMAGE_TYPES.has(image.mediaType)) return [];
    const source = { type: 'base64', media_type: image.mediaType as ImageType, data: image.data };
    return [{ type: 'image', source: source as Anthropic.Beta.BetaBase64ImageSource }];
  });
  return [...images, { type: 'text', text: turn.text }];
}

/** A failed SDK call as an error the viewer can show. */
export function anthropicFailure(err: unknown): unknown {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  )
    return new AiError(
      tr('Anthropic API 키가 올바르지 않습니다.', 'The Anthropic API key is not valid.'),
      'auth',
    );
  if (err instanceof Anthropic.RateLimitError)
    return new AiError(
      tr(
        '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
        'Rate limit reached. Please try again in a moment.',
      ),
    );
  if (err instanceof Anthropic.APIConnectionError)
    return new AiError(
      tr('Anthropic API에 연결하지 못했습니다.', 'Could not connect to the Anthropic API.'),
      'connect',
    );
  if (err instanceof Anthropic.APIError)
    return new AiError(
      tr(
        `Claude API 오류 (${String(err.status)}): ${err.message}`,
        `Claude API error (${String(err.status)}): ${err.message}`,
      ),
    );
  return err;
}

export function anthropicApi(client: Anthropic): Provider {
  return {
    async models() {
      const models: ModelOption[] = [];
      try {
        for await (const m of client.models.list()) {
          const effort = m.capabilities?.effort;
          const efforts = effort?.supported
            ? EFFORT_LEVELS.filter((level) => effort[level]?.supported)
            : [];
          models.push({
            id: m.id,
            label: m.display_name,
            efforts,
            vision: m.capabilities?.image_input.supported ?? true,
            recommended: m.id === 'claude-opus-5-5',
          });
        }
      } catch (err) {
        throw anthropicFailure(err);
      }
      return models;
    },

    async ask(ask: Ask): Promise<Answer> {
      if (!ask.model)
        throw new AiError(tr('사용할 모델을 고르세요.', 'Choose a model to use.'), 'format');
      const fallback = FALLBACK_CAPABLE.has(ask.model);
      try {
        const stream = client.beta.messages.stream(
          {
            model: ask.model,
            max_tokens: 32000,
            system: ask.system,
            messages: ask.turns.map((t) => ({ role: t.role, content: content(t) })),
            ...((ask.effort ?? ask.schema) && {
              output_config: {
                ...(ask.effort && { effort: ask.effort as (typeof EFFORT_LEVELS)[number] }),
                ...(ask.schema && { format: { type: 'json_schema', schema: ask.schema } }),
              },
            }),
            ...(fallback && {
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default' as const,
            }),
          },
          { ...(ask.signal && { signal: ask.signal }) },
        );
        if (ask.onText) stream.on('text', ask.onText);
        const message = await stream.finalMessage();
        const text = message.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        const stop =
          message.stop_reason === 'refusal'
            ? 'refusal'
            : message.stop_reason === 'max_tokens'
              ? 'max_tokens'
              : 'end';
        return { text, stop, model: message.model };
      } catch (err) {
        if (ask.signal?.aborted) throw err;
        throw anthropicFailure(err);
      }
    },
  };
}
