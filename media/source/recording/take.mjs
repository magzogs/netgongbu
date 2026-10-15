// Records Net Gongbu in use, off screen: the built viewer (apps/desktop/out/renderer, served on
// http://127.0.0.1:8190) in headless Chromium with the desktop preload mocked (mock.js), on its
// built-in measured example (Seoul to a US server, demo data). The page runs K times slower than
// real time (slowmo.js) while 2x screenshots are taken as fast as they come; each frame is stamped
// with the page's own time, so edit.mjs can play the take back at normal speed. pointer.js draws the
// pointer and click rings at the real mouse events.
//
//   node take.mjs <ko|en> [out-dir]      → out-dir (default ../../raw/take-<lang>)/f00001.jpg …, take.json (frame times, actions)
//
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const [lang = 'ko', out = path.join(here, `../../raw/take-${lang}`)] = process.argv.slice(2);
const K = 6; // slow motion
const URL_ = process.env.VIEWER_URL ?? 'http://127.0.0.1:8190/';
const W = 1440, H = 810;
mkdirSync(out, { recursive: true });

// Playwright: PLAYWRIGHT_FROM is a folder whose node_modules has playwright or playwright-core (default: apps/desktop,
// which has playwright-core); CHROME may point at a Chromium build when Playwright's own is not installed.
function loadPlaywright() {
  const req = createRequire(path.resolve(process.env.PLAYWRIGHT_FROM ?? path.join(here, '../../../apps/desktop'), 'x.js'));
  for (const name of ['playwright', 'playwright-core']) { try { return req(name); } catch { /* the next one */ } }
  throw new Error('Playwright not found: set PLAYWRIGHT_FROM to a folder whose node_modules has playwright or playwright-core');
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
await ctx.addInitScript(`window.__SLOWMO__ = ${K};`);
for (const f of ['slowmo.js', 'mock.js', 'pointer.js']) await ctx.addInitScript({ path: path.join(here, f) });
await ctx.addInitScript((l) => { localStorage.clear(); localStorage.setItem('netgongbu.locale', l); }, lang);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(URL_);
await page.waitForSelector('.player', { timeout: 60_000 });
await page.locator('.picker select').selectOption('trace-demo');
const cdp = await ctx.newCDPSession(page);
await cdp.send('Animation.enable');
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / K });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cur = [1010, 590];
await page.mouse.move(...cur);
await sleep(3000 * K);

// ---- capture: as many frames as come, each stamped with the page's time ----
const rec0 = performance.now();
const now = () => (performance.now() - rec0) / 1000 / K; // seconds of the take
const frames = [], writes = [], actions = [];
let capturing = true;
const loop = (async () => {
  while (capturing) {
    const a = performance.now();
    const data = await page.screenshot({ type: 'jpeg', quality: 92, scale: 'device', caret: 'initial', animations: 'allow' });
    const b = performance.now();
    const file = `f${String(frames.length + 1).padStart(5, '0')}.jpg`;
    frames.push({ file, t: +(((a + b) / 2 - rec0) / 1000 / K).toFixed(4) });
    writes.push(writeFile(path.join(out, file), data));
  }
})();

// ---- the pointer: eased moves along a slight arc, presses, waits (in seconds of the take) ----
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
async function move(to, dur = 0.7) {
  const from = cur, t0 = now(), dx = to[0] - from[0], dy = to[1] - from[1], bow = 0.07;
  actions.push({ t: +t0.toFixed(3), move: to.map(Math.round), dur });
  for (;;) {
    const u = Math.min(1, (now() - t0) / dur), e = ease(u), s = Math.sin(Math.PI * e) * bow;
    await page.mouse.move(from[0] + dx * e - dy * s, from[1] + dy * e + dx * s);
    if (u >= 1) break;
    await sleep(12 * K);
  }
  cur = to;
}
async function click(name) {
  actions.push({ t: +now().toFixed(3), click: cur.map(Math.round), name });
  await page.mouse.down(); await sleep(80 * K); await page.mouse.up();
}
const wait = (s) => sleep(s * 1000 * K);
async function at(locator) { const b = await locator.boundingBox(); if (!b) throw new Error('not on screen: ' + locator); return [b.x + b.width / 2, b.y + b.height / 2]; }
const mark = (name) => actions.push({ t: +now().toFixed(3), mark: name });

// ---- the take ----
await wait(0.9);
// open the folded laptop and home: the camera goes down into Seoul
await move(await at(page.locator('.cluster-label__open').first()), 0.9); await wait(0.12); await click('expand');
await wait(1.6);
// step along: HSTS, the browser asks the OS resolver, the DNS query goes out to the router
const next = page.locator('.controls button').nth(2);
await move(await at(next), 0.8); await wait(0.1);
await click('step 2'); await wait(1.1);
await click('step 3'); await wait(1.3);
await click('step 4'); await wait(2.0);
// the follow camera, then the TLS ClientHello: from the laptop across the Pacific
await move(await at(page.locator('.controls .pill-button').first()), 0.45); await wait(0.08); await click('follow'); await wait(0.35);
await move(await at(page.locator('.scrubber__beat').nth(15)), 0.55); await wait(0.1); await click('beat 16'); await wait(0.5);
await move(await at(page.locator('.controls .icon-button--primary')), 0.5); await wait(0.08); await click('play'); mark('hello');
// meanwhile, its headers: scroll the header panel down to the TLS fields (SNI, ALPN, key share)
await wait(0.4);
const panel = page.locator('.inspector');
const pb = await panel.boundingBox();
await move([pb.x + pb.width * 0.55, pb.y + pb.height * 0.62], 0.7); await wait(0.15);
mark('scroll');
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 22); await wait(0.045); }
await wait(2.2);
// packet anatomy, layer by layer
await move(await at(page.locator('.inspector__lab')), 0.6); await wait(0.1); await click('anatomy'); await wait(1.3);
const row = (i) => page.locator('.encap__label').nth(i);
const cell = (name) => page.locator('.lcell', { hasText: name }).first();
await move(await at(row(0)), 0.5); await wait(0.08); await click('tls'); await wait(0.7);
await move(await at(cell('Handshake Type')), 0.6); mark('hover handshake'); await wait(1.4);
await move(await at(row(1)), 0.6); await wait(0.08); await click('tcp'); await wait(1.2);
await move(await at(row(2)), 0.4); await wait(0.08); await click('ipv4'); await wait(0.6);
await move(await at(cell('Time To Live')), 0.6); mark('hover ttl'); await wait(1.3);
await move(await at(page.locator('.lab button', { hasText: 'BIN' }).first()), 0.6); await wait(0.08); await click('bin'); await wait(1.0);
await move(await at(cell(/^DF/)), 0.7); mark('hover df'); await wait(1.6);
mark('end');

capturing = false;
await loop; await Promise.all(writes);
writeFileSync(path.join(out, 'take.json'), JSON.stringify({ lang, K, size: [W * 2, H * 2], frames, actions }, null, 1));
console.log(`${out}: ${frames.length} frames over ${now().toFixed(2)} s (${(frames.length / now()).toFixed(1)} per second of the take)`);
await browser.close();
