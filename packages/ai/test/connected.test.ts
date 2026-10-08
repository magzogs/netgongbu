import { describe, expect, it } from 'vitest';
import type { AiHub } from '@netgongbu/llm/node';
import { jsonOf, textModel } from '../src/connected';
import { generateScenario } from '../src/generate';
import { goodDraft, sample, topology } from './fakes';

type Complete = AiHub['complete'];

describe('textModel', () => {
  it('sends the conversation as text with the scenario schema and plays the JSON answer', async () => {
    const calls: Parameters<Complete>[0][] = [];
    const complete: Complete = (request) => {
      calls.push(request);
      return Promise.resolve({
        text: `여기 있습니다:\n\`\`\`json\n${JSON.stringify(goodDraft())}\n\`\`\``,
        stop: 'end',
        model: 'gpt-fast',
      });
    };
    const result = await generateScenario({
      topology,
      example: sample,
      question: 'ping은?',
      id: 'ask-1',
      model: textModel({ complete }),
      maxAttempts: 1,
    });
    expect(result).toMatchObject({ attempts: 1, model: 'gpt-fast' });
    expect(calls[0]?.system).toContain('"id":"home-to-web"');
    expect(calls[0]?.system).toMatch(/JSON object only/);
    expect(calls[0]?.turns).toEqual([
      { role: 'user', text: 'Question from the learner:\nping은?' },
    ]);
    expect(calls[0]?.schema).toMatchObject({ required: ['title', 'beats', 'unsupported'] });
  });

  it('passes a refusal on', async () => {
    const complete: Complete = () => Promise.resolve({ text: '', stop: 'refusal', model: null });
    const reply = await textModel({ complete }).reply([], [{ role: 'user', content: 'q' }]);
    expect(reply.stopReason).toBe('refusal');
  });
});

describe('jsonOf', () => {
  it('finds the object in a fenced or chatty answer', () => {
    expect(jsonOf('{"a":1}')).toBe('{"a":1}');
    expect(jsonOf('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(jsonOf('Here you go: {"a":{"b":2}} — done')).toBe('{"a":{"b":2}}');
  });
});
