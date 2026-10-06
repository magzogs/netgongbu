/** IPC channel names. invoke = renderer asks main; event = main pushes to the renderer. */
export const Channels = {
  aiStatus: 'ai:status',
  aiCatalog: 'ai:catalog',
  aiScenario: 'ai:scenario',
  aiAsk: 'ai:ask',
  settingsGet: 'settings:get',
  settingsSetApiKey: 'settings:set-api-key',
  traceStart: 'trace:start',
  traceCancel: 'trace:cancel',
  traceList: 'trace:list',
  traceGet: 'trace:get',
  traceEvent: 'trace:event',
  browserBounds: 'browser:bounds',
  geoDownload: 'geo:download',
  geoEvent: 'geo:event',
} as const;
