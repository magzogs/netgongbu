// Edits a take from take.mjs into a video: frames picked by their own time at 30 fps, a camera that
// closes in on what is being done (CAMERA, anchored to the take's actions so both languages follow
// it), and a short crossfade at the end back to the first frame, so the clip loops and its poster
// (the first frame) fits.
//
//   node edit.mjs <take-dir> <out.mp4> [--size 1920x1080] [--crf 20] [--wide] [--stills <dir>]
//
// --wide: no camera, the whole window. --stills: also PNG stills of the whole window at STILLS.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const [v] = args.splice(i, 2).slice(1); return v; };
const bool = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const [OW, OH] = flag('--size', '1920x1080').split('x').map(Number);
const crf = flag('--crf', '20');
const wide = bool('--wide');
const stillsDir = flag('--stills', null);
const [takeDir, outFile] = args.map((p) => path.resolve(p));
const take = JSON.parse(readFileSync(path.join(takeDir, 'take.json'), 'utf8'));
const [SW, SH] = take.size, VW = SW / 2, VH = SH / 2; // capture (2x) and window (CSS px)
const FPS = 30, FADE = 0.6;

// ---- the camera: [action, seconds after it, [centre x, centre y (window px), zoom]] ----
const FULL = [VW / 2, VH / 2, 1];
const ZONE = [640, 498, 1.3];      // the opened laptop and home, with the narration and controls
const PANEL = [907, 360, 1.35];    // the header panel beside the globe
const LAB = [690, 449, 1.12];      // packet anatomy: encapsulation and header structure
const BITS = [900, 520, 1.4];      // the IPv4 header bits and a field's explanation
const CAMERA = [
  ['start', 0, FULL], ['expand', 1.2, FULL], ['step 2', -0.3, ZONE],
  ['play', 0.6, ZONE], ['scroll', 0.6, PANEL],
  ['anatomy', -0.1, PANEL], ['anatomy', 0.7, FULL],
  ['tls', 0.1, FULL], ['tls', 1.1, LAB],
  ['hover df', -0.9, LAB], ['hover df', 0.3, BITS], ['end', 0, BITS],
];
const STILLS = [['01-laptop-and-home', 'step 2', -0.4], ['02-dns-query', 'step 4', 1.4], ['03-clienthello-pacific', 'hello', 1.6],
  ['04-tls-headers', 'scroll', 2.0], ['05-anatomy-tls', 'hover handshake', 1.0], ['06-anatomy-ipv4-bits', 'hover df', 1.2]];

const when = (name) => {
  if (name === 'start') return 0;
  const a = take.actions.find((x) => x.name === name || x.mark === name);
  if (!a) throw new Error('no action ' + name);
  return a.t;
};
const END = when('end');
const keys = CAMERA.map(([a, dt, cam]) => [when(a) + dt, cam]);
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
function camAt(t) {
  if (wide) return FULL;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, c1] = keys[i], [t0, c0] = keys[i - 1];
    if (t <= t1) { const u = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)))); return c0.map((v, k) => v + (c1[k] - v) * u); }
  }
  return keys[keys.length - 1][1];
}
function crop([cx, cy, z]) {
  const w = SW / z, h = SH / z;
  return [Math.min(SW - w, Math.max(0, cx * 2 - w / 2)), Math.min(SH - h, Math.max(0, cy * 2 - h / 2)), w, h];
}
const frames = take.frames;
let fi = 0;
function frameAt(t) { // the last frame taken at or before t (frames are in time order)
  while (fi + 1 < frames.length && frames[fi + 1].t <= t) fi++;
  while (fi > 0 && frames[fi].t > t) fi--;
  return 'file://' + path.join(takeDir, frames[fi].file);
}

// Playwright: PLAYWRIGHT_FROM is a folder whose node_modules has playwright or playwright-core (default: apps/desktop,
// which has playwright-core); CHROME may point at a Chromium build when Playwright's own is not installed.
function loadPlaywright() {
  const req = createRequire(path.resolve(process.env.PLAYWRIGHT_FROM ?? path.join(here, '../../../apps/desktop'), 'x.js'));
  for (const name of ['playwright', 'playwright-core']) { try { return req(name); } catch { /* the next one */ } }
  throw new Error('Playwright not found: set PLAYWRIGHT_FROM to a folder whose node_modules has playwright or playwright-core');
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: OW, height: OH } });
await page.goto('file://' + path.join(here, 'canvas.html'));
await page.evaluate(([w, h]) => window.size(w, h), [OW, OH]);
const shot = () => page.screenshot({ clip: { x: 0, y: 0, width: OW, height: OH }, type: 'png' });

if (stillsDir) {
  mkdirSync(stillsDir, { recursive: true });
  const lang = take.lang;
  for (const [name, a, dt] of STILLS) {
    fi = 0; const src = frameAt(when(a) + dt);
    await page.evaluate((l) => window.draw(l), [[src, crop(FULL), 1]]);
    writeFileSync(path.join(stillsDir, `still-${lang}-${name}.png`), await shot());
  }
  fi = 0;
}

mkdirSync(path.dirname(outFile), { recursive: true });
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
ff.on('exit', (code) => { if (code) { console.error('ffmpeg failed'); process.exit(1); } });
const n = Math.round(END * FPS);
const first = [frameAt(0), crop(camAt(0)), 1];
for (let i = 0; i < n; i++) {
  const t = i / FPS;
  const layers = [[frameAt(t), crop(camAt(t)), 1]];
  const f = (t - (END - FADE)) / FADE;
  if (f > 0) layers.push([first[0], first[1], ease(Math.min(1, f))]);
  await page.evaluate(([l, p]) => window.draw(l, p), [layers, [frameAt(t + 1 / FPS)]]);
  if (!ff.stdin.write(await shot())) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`${outFile}: ${n} frames, ${(n / FPS).toFixed(2)} s`);
