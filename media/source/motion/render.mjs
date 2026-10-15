// Renders one of Net Gongbu's motion-graphic clips (edunet.html) into media/motion/, frame by frame:
// renderAt(t) → screenshot → ffmpeg (30 fps, H.264), plus a PNG poster. Every frame is a pure function of t.
// The same page draws the clips at the ends of Net Gongbu's book on magzog.com (magHome, scripts/motion/).
//
//   node render.mjs features ko        → ../../motion/features-ko.mp4 + features-ko.png
//   node render.mjs stack              → ../../motion/stack.mp4 (no words, one file)
//   node render.mjs how en --scale 2   → ../../motion/how-en@2x.mp4 + how-en@2x.png
//
// Playwright: PLAYWRIGHT_FROM is a folder whose node_modules has playwright or playwright-core (default: apps/desktop,
// which has playwright-core); CHROME may point at a Chromium build when Playwright's own is not installed.
// Needs ffmpeg, and the network for the fonts (Google Fonts).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const scale = Number(flag('--scale') ?? 1);
const outDir = flag('--out') ?? path.join(here, '../../motion');
const [page, lang] = args;
if (!['features', 'how', 'stack'].includes(page)) throw new Error('usage: render.mjs <features|how|stack> [ko|en] [--scale n] [--out dir]');
const FPS = 30;
const base = path.join(outDir, `${page}${lang ? `-${lang}` : ''}${scale === 1 ? '' : `@${scale}x`}`);
mkdirSync(outDir, { recursive: true });

function loadPlaywright() {
  const req = createRequire(path.resolve(process.env.PLAYWRIGHT_FROM ?? path.join(here, '../../../apps/desktop'), 'x.js'));
  for (const name of ['playwright', 'playwright-core']) { try { return req(name); } catch { /* the next one */ } }
  throw new Error('Playwright not found: set PLAYWRIGHT_FROM to a folder whose node_modules has playwright or playwright-core');
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const tab = await browser.newPage({ deviceScaleFactor: scale });
tab.on('pageerror', (e) => console.error('page error:', e.message));
await tab.goto(`file://${here}/edunet.html?clip=${page}&lang=${lang ?? 'ko'}`);
await tab.evaluate(() => window.ready);
const info = await tab.evaluate(() => window.CLIP_INFO);
await tab.setViewportSize({ width: info.w, height: info.h });
const shot = async (t) => { await tab.evaluate((x) => window.renderAt(x), t); return tab.screenshot({ clip: { x: 0, y: 0, width: info.w, height: info.h }, type: 'png' }); };

const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', `${base}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
const n = Math.round(info.duration * FPS);
for (let i = 0; i < n; i++) { const buf = await shot(i / FPS); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); }
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
// the poster: the frame the clip says stands for it
writeFileSync(`${base}.png`, await shot(info.poster));
await browser.close();
console.log(`${base}.mp4 (${n} frames)`);
