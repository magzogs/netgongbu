import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AiHub, Answer, Turn } from '@magvirtualedu/llm/node';
import { ScenarioDraftSchema } from '@magvirtualedu/schema';
import { claudeModel } from './claude';
import type { ModelReply, ScenarioModel } from './generate';

/** The scenario draft format as a JSON Schema every provider's structured output accepts. */
const SCENARIO_SCHEMA = zodOutputFormat(ScenarioDraftSchema).schema as Record<string, unknown>;

/** Said to models whose JSON is not enforced by the API (CLIs, local servers). */
const JSON_ONLY = '\n\nAnswer with the JSON object only: no other text, no code fence.';

const STOP: Record<Answer['stop'], ModelReply['stopReason']> = {
  end: 'end_turn',
  max_tokens: 'max_tokens',
  refusal: 'refusal',
};

function text(content: Anthropic.Beta.BetaMessageParam['content']): string {
  if (typeof content === 'string') return content;
  return content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}

/** The JSON object in an answer that may have wrapped it in a code fence or a sentence. */
export function jsonOf(answer: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer)?.[1];
  const body = (fenced ?? answer).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/**
 * A scenario model on any connection: the conversation is sent as plain text, the answer is
 * asked for in the scenario JSON Schema, and comes back as one text block.
 */
export function textModel(hub: Pick<AiHub, 'complete'>): ScenarioModel {
  return {
    async reply(system, messages) {
      const turns: Turn[] = messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        text: text(m.content),
      }));
      const answer = await hub.complete({
        system: system.map((b) => b.text).join('\n\n') + JSON_ONLY,
        turns,
        schema: SCENARIO_SCHEMA,
      });
      const block = { type: 'text', text: jsonOf(answer.text), citations: null };
      return {
        content: [block as Anthropic.Beta.BetaTextBlock],
        stopReason: STOP[answer.stop],
        model: answer.model ?? 'unknown',
      };
    },
  };
}

/**
 * The scenario model for the AI the learner connected, or null while none is ready. Claude with
 * an API key keeps the native path (cached system prompt, structured output, fallbacks).
 */
export function connectedModel(hub: AiHub): ScenarioModel | null {
  const connection = hub.connection();
  if (!connection) return null;
  if (connection.provider === 'anthropic' && connection.method === 'api' && connection.apiKey) {
    return claudeModel(hub.anthropicClient(connection.apiKey), {
      model: connection.model,
      effort: connection.effort,
    });
  }
  return textModel(hub);
}
