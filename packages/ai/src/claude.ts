import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ScenarioDraftSchema } from '@magvirtualedu/schema';
import type { ScenarioModel } from './generate';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface ClaudeSettings {
  model: string;
  effort: Effort;
}

export const DEFAULT_CLAUDE_SETTINGS: ClaudeSettings = { model: 'claude-opus-5-5', effort: 'high' };

/** Models that accept server-side `fallbacks: "default"`. */
const FALLBACK_CAPABLE = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

/**
 * Claude via the Messages API with structured output in the scenario draft format.
 * (Claude Opus 5.5 rejects forced tool_choice, so the JSON comes from output_config.format.)
 * Streams to stay clear of HTTP timeouts on long answers; a declined request is retried
 * server-side on Anthropic's recommended fallback model.
 */
export function claudeModel(client: Anthropic, config: ClaudeSettings): ScenarioModel {
  const format = zodOutputFormat(ScenarioDraftSchema);
  const fallback = FALLBACK_CAPABLE.has(config.model);

  return {
    async reply(system, messages) {
      const stream = client.beta.messages.stream({
        model: config.model,
        max_tokens: 32000,
        output_config: { effort: config.effort, format },
        system,
        messages,
        ...(fallback && {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }),
      });
      const message = await stream.finalMessage();
      return { content: message.content, stopReason: message.stop_reason, model: message.model };
    },
  };
}
