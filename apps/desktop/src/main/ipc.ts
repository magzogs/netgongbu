import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ApiKeySchema, Channels, type AskResult, type Settings } from '@magvirtualedu/bridge';
import type { DesktopAi } from './ai';
import type { SettingsStore } from './settings';
import { isViewerUrl } from './window';

/** Only the viewer may call the main process (not a page loaded in the laptop's browser). */
function trusted(event: IpcMainInvokeEvent): boolean {
  return isViewerUrl(event.senderFrame?.url ?? '');
}

/** ipcMain.handle with a sender check: anything else is rejected before the handler runs. */
export function handle(channel: string, handler: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!trusted(event))
      throw new Error(`Refused ${channel} from ${event.senderFrame?.url ?? '?'}`);
    return handler(...args);
  });
}

export interface SettingsDeps {
  settings: SettingsStore;
  model: string;
  geo: () => Settings['geo'];
}

export function settingsSnapshot({ settings, model, geo }: SettingsDeps): Settings {
  const key = settings.apiKey();
  return {
    hasApiKey: key !== null,
    apiKeySource: key?.source ?? null,
    canSaveKey: settings.canSaveKey,
    model,
    geo: geo(),
    platform: process.platform,
  };
}

export function registerAiIpc(ai: DesktopAi): void {
  handle(Channels.aiStatus, () => ({ ready: ai.service.ready, fake: ai.fake }));
  handle(Channels.aiCatalog, () => ai.service.catalog());
  handle(Channels.aiScenario, async (id: unknown) =>
    typeof id === 'string' ? ((await ai.service.scenario(id)) ?? null) : null,
  );
  handle(Channels.aiAsk, async (topologyId: unknown, question: unknown): Promise<AskResult> => {
    const result = await ai.service.ask({ topologyId, question });
    return result.ok
      ? { ok: true, entry: result.entry, scenario: result.scenario }
      : { ok: false, code: result.code, error: result.error, issues: result.issues };
  });
}

export function registerSettingsIpc(deps: SettingsDeps): void {
  handle(Channels.settingsGet, () => settingsSnapshot(deps));
  handle(Channels.settingsSetApiKey, (key: unknown) => {
    deps.settings.setApiKey(ApiKeySchema.parse(key));
    return settingsSnapshot(deps);
  });
}
