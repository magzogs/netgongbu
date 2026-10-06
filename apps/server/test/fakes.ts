import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  scenarioToDraft,
  ScenarioSchema,
  TopologySchema,
  type ScenarioDraft,
} from '@magvirtualedu/schema';
import type { ModelReply, ScenarioModel } from '../src/generate';

export const dataDir = join(import.meta.dirname, '..', '..', 'web', 'public', 'data');

const read = (path: string): unknown => JSON.parse(readFileSync(join(dataDir, path), 'utf8'));
export const topology = TopologySchema.parse(read('topologies/home-to-web.json'));
export const sample = ScenarioSchema.parse(read('scenarios/visit-example-com.json'));

/** A playable two-beat answer on the home-to-web topology. */
export function goodDraft(): ScenarioDraft {
  const draft = scenarioToDraft(sample);
  return { ...draft, title: 'ping 8.8.8.8', beats: draft.beats.slice(0, 2) };
}

export function textReply(
  text: string,
  stopReason: ModelReply['stopReason'] = 'end_turn',
): ModelReply {
  const block = { type: 'text', text, citations: null } as Anthropic.Beta.BetaTextBlock;
  return { content: [block], stopReason, model: 'claude-opus-5-5' };
}

export interface FakeModel extends ScenarioModel {
  calls: {
    system: Anthropic.Beta.BetaTextBlockParam[];
    messages: Anthropic.Beta.BetaMessageParam[];
  }[];
}

/** Replies with the given answers in order, recording what it was asked. */
export function fakeModel(...replies: ModelReply[]): FakeModel {
  const calls: FakeModel['calls'] = [];
  return {
    calls,
    reply(system, messages) {
      calls.push({ system, messages: structuredClone(messages) });
      const next = replies.shift();
      if (!next) throw new Error('fake model has no more replies');
      return Promise.resolve(next);
    },
  };
}
