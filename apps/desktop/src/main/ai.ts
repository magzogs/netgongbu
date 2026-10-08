import {
  cannedModel,
  connectedModel,
  ScenarioService,
  ScenarioStore,
  TopologyLibrary,
} from '@netgongbu/ai';
import type { AiHub } from '@netgongbu/llm/node';
import { dataDir, userPath } from './paths';

export interface DesktopAi {
  service: ScenarioService;
  topologies: TopologyLibrary;
  /** NETGONGBU_FAKE_AI=1: canned answers instead of the connected AI, for working without one. */
  fake: boolean;
}

/** Scenario generation through the shared ScenarioService, with whichever AI is connected. */
export async function createDesktopAi(
  hub: AiHub,
  log: (message: string) => void,
): Promise<DesktopAi> {
  const topologies = new TopologyLibrary(dataDir());
  const fake = process.env.NETGONGBU_FAKE_AI === '1';
  const example = fake ? await topologies.exampleFor('home-to-web') : undefined;
  const canned = example ? cannedModel(example) : null;

  const service = new ScenarioService({
    topologies,
    store: new ScenarioStore(userPath('scenarios')),
    model: () => canned ?? connectedModel(hub),
    maxAttempts: 3,
    maxQuestionLength: 500,
    noCredentialsMessage: () =>
      hub.status().notReady ?? 'AI에게 질문 → 연결 설정에서 ChatGPT나 Claude를 연결하세요.',
    log,
  });
  return { service, topologies, fake };
}
