import { net, protocol } from 'electron';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://bundle`;

/**
 * The built viewer is served from app://bundle/ rather than file://, so fetch() of its data files
 * works and the page gets a proper origin and a Content-Security-Policy. Must run before ready.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React and three.js set inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

/** Serves files under `root`; anything outside it (or missing) is a 404. */
export function serveRenderer(root: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = normalize(join(root, relative));
    if (!file.startsWith(root + sep)) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(file).toString()).catch(() => null);
    if (!response?.ok) return new Response('Not found', { status: 404 });
    if (extname(file) !== '.html') return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(response.body, { status: 200, headers });
  });
}
