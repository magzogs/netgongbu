import type { LabApi } from '@magvirtualedu/bridge';
import type { Scenario } from '@magvirtualedu/schema';
import {
  askScenario,
  AskError,
  fetchAiCatalog,
  fetchAiScenario,
  fetchAiStatus,
  type AiEntry,
  type AiStatus,
} from './aiApi';

/** The desktop app's main process, exposed by its preload script; undefined on the web. */
export const lab: LabApi | undefined = (globalThis as { lab?: LabApi }).lab;
export const isDesktop = lab !== undefined;

/** Where AI scenarios come from: the HTTP server (web) or the main process (desktop). */
export interface Backend {
  aiStatus: () => Promise<AiStatus>;
  aiCatalog: () => Promise<AiEntry[]>;
  aiScenario: (id: string) => Promise<unknown>;
  /** Throws AskError with the reason when no playable scenario came back. */
  ask: (topologyId: string, question: string) => Promise<{ entry: AiEntry; scenario: Scenario }>;
}

const httpBackend: Backend = {
  aiStatus: fetchAiStatus,
  aiCatalog: fetchAiCatalog,
  aiScenario: fetchAiScenario,
  ask: askScenario,
};

function desktopBackend(api: LabApi): Backend {
  return {
    aiStatus: () =>
      api.ai.status().then(
        (s) => (s.ready ? 'ready' : 'no-key'),
        () => 'offline',
      ),
    aiCatalog: () => api.ai.catalog().catch(() => []),
    aiScenario: async (id) => {
      const scenario = await api.ai.scenario(id);
      if (!scenario) throw new Error('AI 시나리오를 찾을 수 없습니다.');
      return scenario;
    },
    ask: async (topologyId, question) => {
      const result = await api.ai.ask(topologyId, question);
      if (!result.ok) throw new AskError(result.error, result.issues);
      return { entry: result.entry, scenario: result.scenario };
    },
  };
}

export const backend: Backend = lab ? desktopBackend(lab) : httpBackend;
