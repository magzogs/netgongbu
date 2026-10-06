import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { LabApi } from '@magvirtualedu/bridge';
// Channel names only: the schemas (zod) stay out of the sandboxed preload.
import { Channels } from '@magvirtualedu/bridge/channels';

/*
 * The only bridge between the sandboxed viewer and the main process: a fixed set of channels,
 * no raw ipcRenderer, no Node. Every payload is validated again in the main process.
 */

// Payload types come from LabApi: `never` lets each helper stand in for any of its members.
function listen(channel: string): (listener: (value: never) => void) => () => void {
  return (listener) => {
    const handler = (_event: IpcRendererEvent, value: unknown): void => {
      listener(value as never);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

const invoke = (channel: string, ...args: unknown[]): Promise<never> =>
  ipcRenderer.invoke(channel, ...args) as Promise<never>;

const api: LabApi = {
  ai: {
    status: () => invoke(Channels.aiStatus),
    catalog: () => invoke(Channels.aiCatalog),
    scenario: (id) => invoke(Channels.aiScenario, id),
    ask: (topologyId, question) => invoke(Channels.aiAsk, topologyId, question),
  },
  settings: {
    get: () => invoke(Channels.settingsGet),
    setApiKey: (key) => invoke(Channels.settingsSetApiKey, key),
  },
  trace: {
    start: (request) => invoke(Channels.traceStart, request),
    cancel: () => invoke(Channels.traceCancel),
    list: () => invoke(Channels.traceList),
    get: (id) => invoke(Channels.traceGet, id),
    onEvent: listen(Channels.traceEvent),
  },
  browser: {
    setBounds: (rect) => {
      ipcRenderer.send(Channels.browserBounds, rect);
    },
  },
  geo: {
    download: () => invoke(Channels.geoDownload),
    onEvent: listen(Channels.geoEvent),
  },
};

contextBridge.exposeInMainWorld('lab', api);
