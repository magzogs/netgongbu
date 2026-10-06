// The scenario API with a canned model instead of Claude, for working on the viewer without an
// API key: `pnpm dev:fake` at the repo root.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { cannedModel, ScenarioService, ScenarioStore, TopologyLibrary } from '@magvirtualedu/ai';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

const config = loadConfig();
const log = (message: string): void => {
  console.log(`[fake-ai] ${message}`);
};
const topologies = new TopologyLibrary(config.dataDir);
const example = await topologies.exampleFor('home-to-web');
if (!example) throw new Error('No example scenario in the data folder');
const model = cannedModel(example);

const scenarios = new ScenarioService({
  topologies,
  store: new ScenarioStore(join(config.storeDir, '..', 'fake-scenarios')),
  model: () => model,
  maxAttempts: config.maxAttempts,
  maxQuestionLength: config.maxQuestionLength,
  noCredentialsMessage: '',
  log,
});

serve({ fetch: createApp({ scenarios, model: 'fake' }).fetch, port: config.port }, (info) => {
  log(`fake scenario server on http://localhost:${String(info.port)}`);
});
