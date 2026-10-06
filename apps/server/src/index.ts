import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { claudeModel, ScenarioService, ScenarioStore, TopologyLibrary } from '@magvirtualedu/ai';
import { createApp } from './app';
import { hasCredentials, loadConfig } from './config';

const config = loadConfig();
const log = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const model = hasCredentials() ? claudeModel(new Anthropic(), config) : null;
const scenarios = new ScenarioService({
  topologies: new TopologyLibrary(config.dataDir),
  store: new ScenarioStore(config.storeDir),
  model: () => model,
  maxAttempts: config.maxAttempts,
  maxQuestionLength: config.maxQuestionLength,
  noCredentialsMessage: 'AI 서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.',
  log,
});
const app = createApp({ scenarios, model: config.model });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log(
    `scenario server on http://localhost:${String(info.port)} (model ${config.model}, effort ${config.effort})`,
  );
  if (!model) log('ANTHROPIC_API_KEY is not set: questions will be refused until it is.');
});
