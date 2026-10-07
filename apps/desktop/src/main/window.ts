import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { devRendererUrl } from './paths';
import { APP_ORIGIN } from './protocol';

/** Whether a page URL is the viewer itself (dev server or the app:// bundle). */
export function isViewerUrl(url: string): boolean {
  return (
    url.startsWith(`${APP_ORIGIN}/`) ||
    (devRendererUrl !== undefined && url.startsWith(devRendererUrl))
  );
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Network in 3D',
    backgroundColor: '#17100b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => {
    win.show();
  });

  // The viewer never navigates away or opens windows; links go to the system browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isViewerUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(devRendererUrl ?? `${APP_ORIGIN}/index.html`);
  return win;
}
