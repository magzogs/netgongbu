// The scenario API with a canned model instead of Claude, for working on the viewer without an
// API key: `pnpm dev:fake` at the repo root. Every question gets the DNS part of the example
// scenario; the first answer has a broken path so the correction loop runs too.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import type Anthropic from '@anthropic-ai/sdk';
import { scenarioToDraft, ScenarioSchema } from '@magvirtualedu/schema';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { ScenarioStore } from '../src/store';
import { TopologyLibrary } from '../src/topologies';

const config = loadConfig();
const sample = ScenarioSchema.parse(
  JSON.parse(readFileSync(join(config.dataDir, 'scenarios', 'visit-example-com.json'), 'utf8')),
);
const log = (message: string): void => {
  console.log(`[fake-ai] ${message}`);
};

function answer(firstTry: boolean): string {
  const draft = scenarioToDraft(sample);
  draft.title = 'DNS 조회만 따라가 보기 (가짜 AI)';
  draft.beats = draft.beats.slice(2, 6);
  draft.unsupported =
    '가짜 AI 서버의 고정 응답입니다. 실제 서버는 질문에 맞는 시나리오를 만듭니다.';
  const hop = draft.beats[1]?.hops[0];
  if (firstTry && hop) hop.path = ['r-home', 'dns'];
  return JSON.stringify(draft);
}

const app = createApp({
  topologies: new TopologyLibrary(config.dataDir),
  store: new ScenarioStore(join(config.storeDir, '..', 'fake-scenarios')),
  config: { ...config, model: 'fake' },
  log,
  model: {
    async reply(_system, messages) {
      const firstTry = messages.length === 1;
      const last = messages.at(-1)?.content;
      if (!firstTry && typeof last === 'string') log(`correction asked:\n${last}`);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const text: Anthropic.Beta.BetaTextBlock = {
        type: 'text',
        text: answer(firstTry),
        citations: null,
      };
      return { content: [text], stopReason: 'end_turn', model: 'fake' };
    },
  },
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log(`fake scenario server on http://localhost:${String(info.port)}`);
});
