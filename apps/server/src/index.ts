import { serve } from '@hono/node-server';
import { connectedModel, ScenarioService, ScenarioStore, TopologyLibrary } from '@netgongbu/ai';
import { createApp } from './app';
import { loadConfig } from './config';
import { createHub } from './hub';

const config = loadConfig();
const log = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const hub = createHub(config, log);
const scenarios = new ScenarioService({
  topologies: new TopologyLibrary(config.dataDir),
  store: new ScenarioStore(config.storeDir),
  model: () => connectedModel(hub),
  maxAttempts: config.maxAttempts,
  maxQuestionLength: config.maxQuestionLength,
  noCredentialsMessage: () => hub.status().notReady ?? 'AI 연결 설정을 확인하세요.',
  log,
});
const app = createApp({ scenarios, hub });

// Only this computer: the server can use the learner's AI accounts.
serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  log(`scenario server on http://127.0.0.1:${String(info.port)}`);
  const why = hub.status().notReady;
  if (why) log(`AI not connected yet: ${why}`);
});
process.on('SIGINT', () => {
  hub.dispose();
  process.exit(0);
});
