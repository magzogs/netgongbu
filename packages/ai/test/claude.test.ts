import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { claudeModel } from '../src/claude';

/** Records the request body and returns a canned final message. */
function recordingClient() {
  const bodies: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream(body: Record<string, unknown>) {
          bodies.push(body);
          return {
            finalMessage: () =>
              Promise.resolve({
                content: [{ type: 'text', text: '{}' }],
                stop_reason: 'end_turn',
                model: 'claude-opus-5-5',
              }),
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, bodies };
}

const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: 'sys' }];
const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: 'q' }];

describe('claudeModel', () => {
  it('streams a structured-output request with effort and server-side fallbacks', async () => {
    const { client, bodies } = recordingClient();
    const reply = await claudeModel(client, { model: 'claude-opus-5-5', effort: 'high' }).reply(
      system,
      messages,
    );
    expect(reply).toEqual({
      content: [{ type: 'text', text: '{}' }],
      stopReason: 'end_turn',
      model: 'claude-opus-5-5',
    });
    const body = bodies[0]!;
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      system,
      messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema' } },
    });
    expect(body).not.toHaveProperty('tool_choice');
    const schema = (body.output_config as { format: { schema: { required: string[] } } }).format
      .schema;
    expect(schema.required).toEqual(['title', 'beats', 'unsupported']);
  });

  it('leaves fallbacks out for models that do not take them', async () => {
    const { client, bodies } = recordingClient();
    await claudeModel(client, { model: 'claude-haiku-4-5', effort: 'low' }).reply(system, messages);
    expect(bodies[0]).not.toHaveProperty('fallbacks');
    expect(bodies[0]).not.toHaveProperty('betas');
  });
});
