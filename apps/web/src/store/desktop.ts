import type { StateCreator } from 'zustand';
import type { GeoEvent, TraceEntry, TraceEvent } from '@magvirtualedu/bridge';
import { buildFromReport, type Hop } from '@magvirtualedu/trace';
import { lab } from '../data/backend';
import type { ViewerEntry } from '../data/load';
import type { ViewerState } from './viewer';

export type TraceRun =
  | { kind: 'idle' }
  | {
      kind: 'running';
      input: string;
      message: string;
      page: { url: string; title: string } | null;
      hops: Hop[];
    }
  | { kind: 'error'; input: string; message: string };

export type GeoDownload =
  | { kind: 'idle' }
  | { kind: 'running'; received: number; total: number | null }
  | { kind: 'done'; version: string }
  | { kind: 'error'; message: string };

/** UI state for features that exist only in the desktop app. */
export interface DesktopSlice {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** The laptop's web browser panel. */
  browserOpen: boolean;
  setBrowserOpen: (open: boolean) => void;
  /** Empty the browser's caches before measuring, so DNS, TCP and TLS really happen. */
  freshLoad: boolean;
  setFreshLoad: (fresh: boolean) => void;
  traceRun: TraceRun;
  startTrace: (input: string) => Promise<void>;
  cancelTrace: () => void;
  geoDownload: GeoDownload;
  downloadGeo: () => void;
  /** Subscribes to the main process's trace and download events (once, at start). */
  connectDesktop: () => Promise<void>;
}

export function traceEntry(e: TraceEntry): ViewerEntry {
  const date = e.startedAt.slice(0, 16).replace('T', ' ');
  return {
    id: e.id,
    topologyId: e.id,
    title: `${e.host} 접속 실측 (${date})`,
    question: e.input,
    source: 'trace',
  };
}

let connected = false;

export const createDesktopSlice: StateCreator<ViewerState, [], [], DesktopSlice> = (set, get) => {
  const onTrace = (event: TraceEvent): void => {
    const run = get().traceRun;
    switch (event.type) {
      case 'phase':
        if (run.kind === 'running') set({ traceRun: { ...run, message: event.message } });
        break;
      case 'page':
        if (run.kind === 'running')
          set({ traceRun: { ...run, page: { url: event.url, title: event.title } } });
        break;
      case 'hop':
        if (run.kind === 'running') set({ traceRun: { ...run, hops: [...run.hops, event.hop] } });
        break;
      case 'done': {
        const { scenario } = buildFromReport(event.report, event.id);
        const entry: ViewerEntry = {
          id: event.id,
          topologyId: event.id,
          title: scenario.title,
          question: event.report.input,
          source: 'trace',
        };
        set((s) => ({
          catalog: [entry, ...s.catalog],
          traceRun: { kind: 'idle' },
          browserOpen: false,
        }));
        void get().open(event.id);
        break;
      }
      case 'error':
        set({
          traceRun: {
            kind: 'error',
            input: run.kind === 'running' ? run.input : '',
            message: event.message,
          },
        });
        break;
    }
  };

  const onGeo = (event: GeoEvent): void => {
    if (event.type === 'progress')
      set({ geoDownload: { kind: 'running', received: event.received, total: event.total } });
    else if (event.type === 'done') set({ geoDownload: { kind: 'done', version: event.version } });
    else set({ geoDownload: { kind: 'error', message: event.message } });
  };

  return {
    settingsOpen: false,
    setSettingsOpen(settingsOpen) {
      set({ settingsOpen });
    },
    browserOpen: false,
    setBrowserOpen(browserOpen) {
      set({ browserOpen });
    },
    freshLoad: true,
    setFreshLoad(freshLoad) {
      set({ freshLoad });
    },
    traceRun: { kind: 'idle' },
    async startTrace(input) {
      if (!lab || get().traceRun.kind === 'running') return;
      set({
        traceRun: {
          kind: 'running',
          input,
          message: `${input}을(를) 여는 중…`,
          page: null,
          hops: [],
        },
      });
      try {
        await lab.trace.start({ input, clearCache: get().freshLoad });
      } catch (err) {
        set({
          traceRun: {
            kind: 'error',
            input,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
    cancelTrace() {
      void lab?.trace.cancel();
    },
    geoDownload: { kind: 'idle' },
    downloadGeo() {
      if (!lab || get().geoDownload.kind === 'running') return;
      set({ geoDownload: { kind: 'running', received: 0, total: null } });
      void lab.geo.download();
    },
    async connectDesktop() {
      if (!lab || connected) return;
      connected = true;
      lab.trace.onEvent(onTrace);
      lab.geo.onEvent(onGeo);
      const [traces, settings] = await Promise.all([
        lab.trace.list().catch(() => []),
        lab.settings.get().catch(() => null),
      ]);
      set((s) => ({ catalog: [...s.catalog, ...traces.map(traceEntry)] }));
      if (settings?.geo.installed)
        set({ geoDownload: { kind: 'done', version: settings.geo.version ?? '' } });
    },
  };
};
