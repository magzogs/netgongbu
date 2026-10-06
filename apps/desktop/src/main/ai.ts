import Anthropic from '@anthropic-ai/sdk';
import {
  cannedModel,
  claudeModel,
  DEFAULT_CLAUDE_SETTINGS,
  ScenarioService,
  ScenarioStore,
  TopologyLibrary,
  type ScenarioModel,
} from '@magvirtualedu/ai';
import { dataDir, userPath } from './paths';
import type { SettingsStore } from './settings';

export interface DesktopAi {
  service: ScenarioService;
  topologies: TopologyLibrary;
  /** MAGVE_FAKE_AI=1: canned answers instead of Claude, for working without a key. */
  fake: boolean;
}

/** Claude through the shared ScenarioService, with the key from the app's settings. */
export async function createDesktopAi(
  settings: SettingsStore,
  log: (message: string) => void,
): Promise<DesktopAi> {
  const topologies = new TopologyLibrary(dataDir());
  const fake = process.env.MAGVE_FAKE_AI === '1';
  const example = fake ? await topologies.exampleFor('home-to-web') : undefined;
  const canned = example ? cannedModel(example) : null;

  // One client per key, rebuilt when the learner changes the key in settings.
  let current: { key: string; model: ScenarioModel } | null = null;
  const model = (): ScenarioModel | null => {
    if (canned) return canned;
    const key = settings.apiKey()?.key;
    if (!key) return null;
    if (current?.key !== key) {
      current = {
        key,
        model: claudeModel(new Anthropic({ apiKey: key }), DEFAULT_CLAUDE_SETTINGS),
      };
    }
    return current.model;
  };

  const service = new ScenarioService({
    topologies,
    store: new ScenarioStore(userPath('scenarios')),
    model,
    maxAttempts: 3,
    maxQuestionLength: 500,
    noCredentialsMessage: '설정에서 Anthropic API 키를 입력해 주세요.',
    log,
  });
  return { service, topologies, fake };
}
