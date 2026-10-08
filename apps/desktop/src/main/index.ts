import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { app, shell } from 'electron';
import { DEFAULT_CLAUDE_SETTINGS } from '@netgongbu/ai';
import type { AiPrefs } from '@netgongbu/llm';
import { AiHub } from '@netgongbu/llm/node';
import { createDesktopAi } from './ai';
import { registerConnectionIpc } from './connection';
import { registerAiIpc, registerSettingsIpc, registerTraceIpc } from './ipc';
import { LabBrowser } from './lab-browser';
import { rendererDir, userPath } from './paths';
import { registerAppScheme, serveRenderer } from './protocol';
import { SettingsStore } from './settings';
import { lookupHost } from './trace/dns';
import { dnsLookups } from './trace/enrich';
import { execTool } from './trace/exec';
import { GeoIpDb } from './trace/geo';
import { snapshotLocal } from './trace/local';
import { TraceStore } from './trace/store';
import { runTraceroute } from './trace/traceroute';
import { createMainWindow } from './window';

const log = (message: string): void => {
  console.log(`[main ${new Date().toISOString()}] ${message}`);
};

// Tests run against a throw-away data folder instead of the learner's.
if (process.env.NETGONGBU_USER_DATA) app.setPath('userData', process.env.NETGONGBU_USER_DATA);

registerAppScheme();

async function start(): Promise<void> {
  serveRenderer(rendererDir);
  const settings = new SettingsStore(userPath('settings.json'));
  const secrets = settings.secrets();
  // Before the learner chooses: Claude with the key they saved earlier (or ANTHROPIC_API_KEY).
  const defaults: AiPrefs | undefined = secrets.get('anthropic')
    ? {
        provider: 'anthropic',
        providers: { anthropic: { method: 'api', ...DEFAULT_CLAUDE_SETTINGS } },
      }
    : undefined;
  const hub = new AiHub({
    prefs: settings.prefs(),
    secrets,
    workDir: userPath('ai-workdir'),
    log,
    openExternal: (url) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
    },
    ...(defaults && { defaults }),
  });
  app.on('will-quit', () => {
    hub.dispose();
  });
  const ai = await createDesktopAi(hub, log);
  const geo = new GeoIpDb(userPath('geo'));
  await geo.open();
  registerAiIpc(ai);
  registerSettingsIpc({ geo: () => geo.status() });

  const win = createMainWindow();
  registerConnectionIpc(win, hub, log);
  registerTraceIpc({
    win,
    browser: new LabBrowser(win),
    store: new TraceStore(userPath('traces')),
    geo,
    agent: {
      local: () =>
        snapshotLocal({
          platform: process.platform,
          exec: execTool,
          interfaces: networkInterfaces,
          readFile: (path) => readFile(path, 'utf8').catch(() => null),
          exists: existsSync,
        }),
      dns: lookupHost,
      traceroute: (target, onHop, signal) =>
        runTraceroute(target, onHop, { platform: process.platform, signal }),
      lookups: dnsLookups((ip) => geo.lookup(ip)),
      geoSource: () => (geo.status().installed ? geo.status().attribution : null),
    },
    log,
  });
  log(`ready (data ${userPath()})`);
}

// One window owns the browser view and the IPC wiring, so closing it ends the app (macOS too).
app.on('window-all-closed', () => {
  app.quit();
});

app
  .whenReady()
  .then(start)
  .catch((err: unknown) => {
    console.error(err);
    app.exit(1);
  });
