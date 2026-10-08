import { app, session, WebContentsView, type BrowserWindow, type Session } from 'electron';
import type { Rect } from '@netgongbu/bridge';
import { tr } from '@netgongbu/schema';
import { collectRequests, type CdpEvent } from '@netgongbu/trace';
import type { PageCapture } from './trace/run';

/** In-memory session: nothing the laptop's browser visits is kept after the app quits. */
const PARTITION = 'lab-browser';
/** After the page has loaded, wait this long for no new requests before calling it done. */
const QUIET_MS = 1200;
const MAX_SETTLE_MS = 8000;

/** What the learner typed → a URL the browser can load (https:// added like modern browsers). */
export function normalizeInput(input: string): URL {
  const text = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      tr('http 또는 https 주소만 열 수 있습니다.', 'Only http or https addresses can be opened.'),
    );
  }
  return url;
}

function hardenSession(s: Session): void {
  // A web page in the lab gets no camera, location, notifications, downloads or pop-ups.
  s.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
  s.setPermissionCheckHandler(() => false);
  s.on('will-download', (event) => {
    event.preventDefault();
  });
  // Present itself as the Chromium it is, without the Electron and app tokens
  // (Electron writes the app token as the product name without spaces: NetGongbu/0.1.0).
  s.setUserAgent(
    s
      .getUserAgent()
      .replace(/ Electron\/\S+/, '')
      .replace(` ${app.name.replaceAll(' ', '')}/${app.getVersion()}`, ''),
  );
}

/**
 * The laptop's web browser: a real Chromium view placed over the viewer where the browser panel
 * is, with DevTools Network events recorded while a page loads.
 */
export class LabBrowser {
  private view: WebContentsView | null = null;
  private readonly session: Session;

  constructor(private readonly win: BrowserWindow) {
    this.session = session.fromPartition(PARTITION);
    hardenSession(this.session);
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view;
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      // Links that open a new window stay in the laptop's browser.
      if (/^https?:\/\//.test(url)) void wc.loadURL(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      if (!/^https?:\/\//.test(url)) event.preventDefault();
    });
    view.setVisible(false);
    view.setBorderRadius(6);
    this.win.contentView.addChildView(view);
    this.view = view;
    return view;
  }

  /** Shows the page in this rectangle of the main window, or hides it. */
  setBounds(rect: Rect | null): void {
    const view = this.ensureView();
    if (!rect || rect.width < 1 || rect.height < 1) {
      view.setVisible(false);
      return;
    }
    view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    view.setVisible(true);
  }

  /**
   * Loads the page and returns every request Chromium made for it. With `fresh`, caches,
   * cookies, DNS cache and open connections are cleared first so DNS, TCP and TLS really happen.
   */
  async capture(input: string, signal: AbortSignal, fresh: boolean): Promise<PageCapture> {
    const url = normalizeInput(input);
    const wc = this.ensureView().webContents;
    if (fresh) {
      await this.session.clearCache();
      await this.session.clearHostResolverCache();
      await this.session.clearStorageData();
      await this.session.closeAllConnections();
    }

    // A view that never loaded anything has no renderer yet, and DevTools commands to it wait
    // forever; give it an empty page first.
    if (wc.getURL() === '') await wc.loadURL('about:blank');

    const events: CdpEvent[] = [];
    let lastEventAt = Date.now();
    const onMessage = (_event: unknown, method: string, params: unknown): void => {
      if (!method.startsWith('Network.')) return;
      events.push({ method, params } as CdpEvent);
      lastEventAt = Date.now();
    };
    if (wc.debugger.isAttached()) wc.debugger.detach();
    wc.debugger.attach('1.3');
    wc.debugger.on('message', onMessage);
    const abort = (): void => {
      wc.stop();
    };
    signal.addEventListener('abort', abort);
    try {
      await wc.debugger.sendCommand('Network.enable');
      await wc.debugger.sendCommand('Network.setCacheDisabled', { cacheDisabled: fresh });
      await wc.loadURL(url.toString()).catch(() => undefined);
      // Let the page's own requests (images, scripts) finish, up to a limit.
      const started = Date.now();
      while (
        !signal.aborted &&
        Date.now() - lastEventAt < QUIET_MS &&
        Date.now() - started < MAX_SETTLE_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } finally {
      signal.removeEventListener('abort', abort);
      wc.debugger.off('message', onMessage);
      if (wc.debugger.isAttached()) wc.debugger.detach();
    }

    const { requests, documentChain } = collectRequests(events);
    return {
      requests,
      documentChain,
      userAgent: wc.getUserAgent(),
      title: wc.getTitle(),
      finalUrl: wc.getURL(),
    };
  }
}
