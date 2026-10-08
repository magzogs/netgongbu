// The scenario API with a canned model instead of the connected AI, for working on the viewer
// without one: `pnpm dev:fake` at the repo root.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { cannedModel, ScenarioService, ScenarioStore, TopologyLibrary } from '@netgongbu/ai';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createHub } from '../src/hub';

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

// Questions about the screen still go to the AI connected in the viewer.
const hub = createHub(config, log);
serve(
  { fetch: createApp({ scenarios, hub }).fetch, port: config.port, hostname: '127.0.0.1' },
  (info) => {
    log(`fake scenario server on http://127.0.0.1:${String(info.port)}`);
  },
);
