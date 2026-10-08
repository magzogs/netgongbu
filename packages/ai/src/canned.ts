import type Anthropic from '@anthropic-ai/sdk';
import { scenarioToDraft, tr, type Scenario } from '@netgongbu/schema';
import type { ScenarioModel } from './generate';

/**
 * A model that answers every question with part of an example scenario, for working on the
 * apps without an API key. The first answer has a broken path, so the correction loop runs too.
 */
export function cannedModel(example: Scenario, delayMs = 2500): ScenarioModel {
  const answer = (firstTry: boolean): string => {
    const draft = scenarioToDraft(example);
    draft.title = tr('DNS 조회만 따라가 보기 (가짜 AI)', 'Following just the DNS lookup (fake AI)');
    draft.beats = draft.beats.slice(2, 6);
    draft.unsupported = tr(
      '가짜 AI의 고정 응답입니다. 실제 AI는 질문에 맞는 시나리오를 만듭니다.',
      'A fixed answer from the fake AI. The real AI builds a scenario for your question.',
    );
    const hop = draft.beats[1]?.hops[0];
    if (firstTry && hop) hop.path = [hop.path[0] ?? 'r-home', 'dns'];
    return JSON.stringify(draft);
  };
  return {
    async reply(_system, messages) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const text: Anthropic.Beta.BetaTextBlock = {
        type: 'text',
        text: answer(messages.length === 1),
        citations: null,
      };
      return { content: [text], stopReason: 'end_turn', model: 'fake' };
    },
  };
}
