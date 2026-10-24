import type { AiEntry, LabApi } from '@netgongbu/bridge';
import { tr, type Scenario, type ValidationIssue } from '@netgongbu/schema';
import { locale } from '../i18n';

/** The desktop app's main process, exposed by its preload script as window.lab. */
export const lab: LabApi = desktopLab();

function desktopLab(): LabApi {
  const api = (globalThis as { lab?: LabApi }).lab;
  if (!api)
    throw new Error('The viewer runs only inside the Net Gongbu desktop app (no window.lab).');
  return api;
}

// Before any other call, so the main process answers in the viewer's language from the start.
void lab.settings.setLocale(locale);

export type AiStatus = 'checking' | 'offline' | 'no-key' | 'ready';

export class AskError extends Error {
  constructor(
    message: string,
    readonly issues: readonly ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'AskError';
  }
}

/** AI scenarios, made and kept by the main process. */
export interface Backend {
  aiStatus: () => Promise<AiStatus>;
  aiCatalog: () => Promise<AiEntry[]>;
  aiScenario: (id: string) => Promise<unknown>;
  /** Throws AskError with the reason when no playable scenario came back. */
  ask: (topologyId: string, question: string) => Promise<{ entry: AiEntry; scenario: Scenario }>;
}

export const backend: Backend = {
  aiStatus: () =>
    lab.ai.status().then(
      (s) => (s.ready ? 'ready' : 'no-key'),
      () => 'offline',
    ),
  aiCatalog: () => lab.ai.catalog().catch(() => []),
  aiScenario: async (id) => {
    const scenario = await lab.ai.scenario(id);
    if (!scenario) throw new Error(tr('AI 시나리오를 찾을 수 없습니다.', 'AI scenario not found.'));
    return scenario;
  },
  ask: async (topologyId, question) => {
    const result = await lab.ai.ask(topologyId, question);
    if (!result.ok) throw new AskError(result.error, result.issues);
    return { entry: result.entry, scenario: result.scenario };
  },
};
