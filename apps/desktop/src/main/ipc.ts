import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {
  Channels,
  RectSchema,
  TraceStartSchema,
  type AskResult,
  type Settings,
  type TraceEvent,
} from '@netgongbu/bridge';
import type { DesktopAi } from './ai';
import type { LabBrowser } from './lab-browser';
import type { GeoIpDb } from './trace/geo';
import { runTrace, type TraceRunDeps } from './trace/run';
import { newTraceId, type TraceStore } from './trace/store';
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
  geo: () => Settings['geo'];
}

export function settingsSnapshot({ geo }: SettingsDeps): Settings {
  return { geo: geo(), platform: process.platform };
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
}

export interface TraceIpcDeps {
  win: BrowserWindow;
  browser: LabBrowser;
  store: TraceStore;
  geo: GeoIpDb;
  /** Everything runTrace needs except the page capture and the event sink. */
  agent: Omit<TraceRunDeps, 'capture' | 'emit'>;
  log: (message: string) => void;
}

/** Measuring a page load, the laptop's browser view and the location database. */
export function registerTraceIpc({ win, browser, store, geo, agent, log }: TraceIpcDeps): void {
  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };
  let running: AbortController | null = null;

  handle(Channels.traceStart, (raw: unknown) => {
    const request = TraceStartSchema.parse(raw);
    if (running) throw new Error('이미 측정 중입니다.');
    const controller = new AbortController();
    running = controller;
    const emit = (event: TraceEvent): void => {
      if (event.type === 'phase' || event.type === 'error')
        log(`trace ${event.type}: ${event.message}`);
      send(Channels.traceEvent, event);
    };
    const started = Date.now();
    void runTrace(
      request.input,
      {
        ...agent,
        capture: (input, signal) => browser.capture(input, signal, request.clearCache),
        emit,
      },
      controller.signal,
    )
      .then(async (report) => {
        const id = newTraceId();
        await store.save(id, report);
        log(
          `trace ${id} for ${request.input}: ${String(report.path.hops.length)} hops in ${String(Date.now() - started)} ms`,
        );
        emit({ type: 'done', id, report });
      })
      .catch((err: unknown) => {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        running = null;
      });
  });
  handle(Channels.traceCancel, () => {
    running?.abort();
  });
  handle(Channels.traceList, () => store.list());
  handle(Channels.traceGet, (id: unknown) => (typeof id === 'string' ? store.get(id) : null));

  ipcMain.on(Channels.browserBounds, (event, rect: unknown) => {
    if (!isViewerUrl(event.senderFrame?.url ?? '')) return;
    const parsed = RectSchema.nullable().safeParse(rect);
    if (parsed.success) browser.setBounds(parsed.data);
  });

  let downloading = false;
  handle(Channels.geoDownload, async () => {
    if (downloading) return;
    downloading = true;
    try {
      const version = await geo.download((received, total) => {
        send(Channels.geoEvent, { type: 'progress', received, total });
      });
      send(Channels.geoEvent, { type: 'done', version });
      log(`GeoIP database ${version} installed`);
    } catch (err) {
      send(Channels.geoEvent, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      downloading = false;
    }
  });
}
