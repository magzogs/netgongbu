import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { claudeModel } from '@magvirtualedu/ai';
import { hasCredentials, loadConfig } from './config';
import { ScenarioStore } from './store';
import { TopologyLibrary } from './topologies';

const config = loadConfig();
const log = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const model = hasCredentials() ? claudeModel(new Anthropic(), config) : null;
const app = createApp({
  topologies: new TopologyLibrary(config.dataDir),
  store: new ScenarioStore(config.storeDir),
  model,
  config,
  log,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log(
    `scenario server on http://localhost:${String(info.port)} (model ${config.model}, effort ${config.effort})`,
  );
  if (!model) log('ANTHROPIC_API_KEY is not set: questions will be refused until it is.');
});
