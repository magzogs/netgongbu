import { app } from 'electron';
import { join, resolve } from 'node:path';

/** The renderer dev server (electron-vite dev), or undefined when running the built app. */
export const devRendererUrl: string | undefined = process.env.ELECTRON_RENDERER_URL;

/** The built viewer, served under app://bundle/. */
export const rendererDir = join(__dirname, '../renderer');

/** Topologies and example scenarios: the viewer's public data (source folder while developing). */
export function dataDir(): string {
  return devRendererUrl
    ? resolve(__dirname, '../../../web/public/data')
    : join(rendererDir, 'data');
}

/** A path inside this app's own data folder (settings, generated scenarios, traces, GeoIP). */
export function userPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts);
}
