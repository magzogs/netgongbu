import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { devRendererUrl } from './paths';
import { APP_ORIGIN } from './protocol';

/** The name the viewer gives a pop-out window (apps/web/src/ui/PopoutWindow.tsx). */
const POPOUT_NAME = 'magve-popout';

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

  // The viewer never navigates away; links go to the system browser. The only window it opens
  // is an empty one the viewer itself draws into (a panel popped out, e.g. the packet anatomy).
  win.webContents.on('will-navigate', (event, url) => {
    if (!isViewerUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (url === 'about:blank' && frameName === POPOUT_NAME) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          minWidth: 560,
          minHeight: 360,
          backgroundColor: '#17100b',
          autoHideMenuBar: true,
        },
      };
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // A popped-out window shows the viewer's own DOM: it never loads or opens anything itself.
  win.webContents.on('did-create-window', (child) => {
    child.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  void win.loadURL(devRendererUrl ?? `${APP_ORIGIN}/index.html`);
  return win;
}
