import { describe, expect, it } from 'vitest';
import { generateScenario, GenerationError } from '../src/generate';
import { fakeModel, goodDraft, sample, textReply, topology } from './fakes';

function request(model: ReturnType<typeof fakeModel>, maxAttempts = 3) {
  return generateScenario({
    topology,
    example: sample,
    question: 'ping 8.8.8.8은 어떻게 동작하나요?',
    id: 'ask-test',
    model,
    maxAttempts,
  });
}

describe('generateScenario', () => {
  it('returns a playable first answer as a stored scenario', async () => {
    const model = fakeModel(textReply(JSON.stringify(goodDraft())));
    const result = await request(model);
    expect(result.attempts).toBe(1);
    expect(result.scenario).toMatchObject({
      id: 'ask-test',
      topologyId: 'home-to-web',
      question: 'ping 8.8.8.8은 어떻게 동작하나요?',
      title: 'ping 8.8.8.8',
    });
    expect(result.scenario.beats.map((b) => b.id)).toEqual(['step-1', 'step-2']);
  });

  it('caches the instructions, topology and example, and asks the question last', async () => {
    const model = fakeModel(textReply(JSON.stringify(goodDraft())));
    await request(model);
    const [{ system, messages }] = model.calls as [(typeof model.calls)[number]];
    expect(system).toHaveLength(2);
    expect(system[1]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[1]?.text).toContain('"id":"home-to-web"');
    expect(system[1]?.text).toContain('192.168.0.1 누구세요?');
    expect(messages).toEqual([
      { role: 'user', content: 'Question from the learner:\nping 8.8.8.8은 어떻게 동작하나요?' },
    ]);
  });

  it('sends the problems back and accepts the corrected answer', async () => {
    const broken = goodDraft();
    broken.beats[0]!.hops[0]!.path = ['laptop', 'web-1'];
    const model = fakeModel(
      textReply(JSON.stringify(broken)),
      textReply(JSON.stringify(goodDraft())),
    );
    const result = await request(model);
    expect(result.attempts).toBe(2);
    const retry = model.calls[1]!.messages;
    expect(retry).toHaveLength(3);
    expect(retry[1]?.role).toBe('assistant');
    expect(retry[2]?.content).toContain(
      'beat 1, hop 1: There is no link between "laptop" and "web-1". "laptop" is linked to: r-home.',
    );
    expect(retry[2]?.content).toContain('Return the complete corrected scenario.');
  });

  it('asks again when the answer is not JSON', async () => {
    const model = fakeModel(textReply('{"title": "cut'), textReply(JSON.stringify(goodDraft())));
    await expect(request(model)).resolves.toMatchObject({ attempts: 2 });
    expect(model.calls[1]!.messages[2]?.content).toContain('not valid JSON');
  });

  it('stops without retrying when the model refuses or runs out of tokens', async () => {
    const refusing = fakeModel(textReply('', 'refusal'));
    await expect(request(refusing)).rejects.toMatchObject({ code: 'refused' });
    expect(refusing.calls).toHaveLength(1);
    const truncated = fakeModel(textReply('{"title":', 'max_tokens'));
    await expect(request(truncated)).rejects.toMatchObject({ code: 'truncated' });
  });

  it('gives up after maxAttempts with the last problems', async () => {
    const broken = goodDraft();
    broken.beats[1]!.nodeActions = [{ node: 'ghost', text: 'x', kind: null }];
    const answer = JSON.stringify(broken);
    const model = fakeModel(textReply(answer), textReply(answer));
    const error = await request(model, 2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationError);
    expect(error).toMatchObject({
      code: 'invalid',
      issues: [{ where: 'beat step-2', message: expect.stringContaining('"ghost"') as string }],
    });
    expect(model.calls).toHaveLength(2);
  });
});
