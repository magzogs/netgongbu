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
  connection: {
    status: (refresh) => invoke(Channels.connectionStatus, refresh === true),
    change: (change) => invoke(Channels.connectionChange, change),
    setKey: (provider, key) => invoke(Channels.connectionKey, { provider, key }),
    models: (provider, refresh) => invoke(Channels.connectionModels, provider, refresh === true),
    signIn: (provider) => invoke(Channels.connectionSignIn, provider),
    stopSignIn: () => invoke(Channels.connectionStopSignIn),
    signOut: (provider) => invoke(Channels.connectionSignOut, provider),
    onStatus: listen(Channels.connectionEvent),
  },
  chat: {
    ask: (request) => invoke(Channels.chatAsk, request),
    cancel: (id) => invoke(Channels.chatCancel, id),
    onEvent: listen(Channels.chatEvent),
  },
};

contextBridge.exposeInMainWorld('lab', api);
