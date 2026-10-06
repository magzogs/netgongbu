import { app, BrowserWindow } from 'electron';
import { DEFAULT_CLAUDE_SETTINGS } from '@magvirtualedu/ai';
import { createDesktopAi } from './ai';
import { registerAiIpc, registerSettingsIpc } from './ipc';
import { rendererDir, userPath } from './paths';
import { registerAppScheme, serveRenderer } from './protocol';
import { SettingsStore } from './settings';
import { createMainWindow } from './window';

const log = (message: string): void => {
  console.log(`[main ${new Date().toISOString()}] ${message}`);
};

// Tests run against a throw-away data folder instead of the learner's.
if (process.env.MAGVE_USER_DATA) app.setPath('userData', process.env.MAGVE_USER_DATA);

registerAppScheme();

async function start(): Promise<void> {
  serveRenderer(rendererDir);
  const settings = new SettingsStore(userPath('settings.json'));
  const ai = await createDesktopAi(settings, log);
  registerAiIpc(ai);
  registerSettingsIpc({
    settings,
    model: ai.fake ? 'fake' : DEFAULT_CLAUDE_SETTINGS.model,
    geo: () => ({ installed: false, version: null, attribution: '' }),
  });
  createMainWindow();
  log(`ready (data ${userPath()})`);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app
  .whenReady()
  .then(start)
  .catch((err: unknown) => {
    console.error(err);
    app.exit(1);
  });
