// Launches the built desktop app (electron-vite build first) with a throw-away data folder and
// the canned AI, checks the viewer works through the preload bridge, and saves screenshots to
// e2e/out/. Run: pnpm --filter @magvirtualedu/desktop test:e2e
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const here = import.meta.dirname;
const appDir = join(here, '..');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const executablePath = createRequire(import.meta.url)('electron') as unknown as string;

const app = await electron.launch({
  executablePath,
  args: [appDir],
  env: {
    ...process.env,
    MAGVE_FAKE_AI: '1',
    MAGVE_USER_DATA: mkdtempSync(join(tmpdir(), 'magve-')),
  },
});
app.process().stdout?.on('data', (d: Buffer) => process.stdout.write(`[app] ${d.toString()}`));
app.process().stderr?.on('data', (d: Buffer) => process.stderr.write(`[app] ${d.toString()}`));

const failures: string[] = [];
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

try {
  const win = await app.firstWindow();
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForSelector('.player', { timeout: 20_000 });
  await win.waitForTimeout(1500);

  check(
    (await win.evaluate(() => typeof (window as { lab?: unknown }).lab)) === 'object',
    'preload exposes window.lab',
  );
  check(
    (await win.locator('.settings-button').count()) === 1,
    'settings button shown in the desktop app',
  );
  check((await win.locator('.scenario-note, .narration').count()) > 0, 'player renders');
  await win.screenshot({ path: join(out, '1-start.png') });

  // Ask the canned AI through IPC: first answer is broken, the service corrects it.
  await win.locator('.ask-button').click();
  await win.locator('.ask__input').fill('DNS는 어떻게 동작하나요?');
  await win.locator('.ask .primary-button').click();
  await win.waitForFunction(() => document.querySelector('.ask') === null, undefined, {
    timeout: 30_000,
  });
  const picked = await win.locator('.picker select').inputValue();
  check(picked.startsWith('ask-'), `generated scenario opened (${picked})`);
  await win.waitForTimeout(800);
  await win.screenshot({ path: join(out, '2-ai-scenario.png') });

  await win.locator('.settings-button').click();
  await win.waitForSelector('.settings');
  const keyStatus = win.locator('.settings__status').first();
  await win.waitForFunction(
    () => document.querySelector('.settings__status')?.textContent !== '불러오는 중…',
  );
  const status = await keyStatus.textContent();
  check(status !== null && status.length > 0, `settings show key status: ${status ?? ''}`);
  await win.screenshot({ path: join(out, '3-settings.png') });

  await win.keyboard.press('Escape');

  // The laptop's browser: load a real page, trace the path, open the measured scenario.
  await win.locator('.browser-button').click();
  await win.locator('.browser__address input').fill('example.com');
  await win.locator('.browser__address input').press('Enter');
  await win.waitForSelector('.browser__log', { timeout: 10_000 });
  await win.waitForFunction(() => document.querySelectorAll('.hops li').length > 0, undefined, {
    timeout: 60_000,
  });
  await win.screenshot({ path: join(out, '4-browser-measuring.png') });
  const pagePng = await app.evaluate(async ({ webContents, session }) => {
    const lab = webContents
      .getAllWebContents()
      .find((wc) => wc.session === session.fromPartition('lab-browser'));
    return lab ? (await lab.capturePage()).toPNG().toString('base64') : null;
  });
  check(pagePng !== null, 'laptop browser view rendered the page');
  if (pagePng) writeFileSync(join(out, '4b-browser-page.png'), Buffer.from(pagePng, 'base64'));

  await win.waitForFunction(
    () => document.querySelector<HTMLSelectElement>('.picker select')?.value.startsWith('trace-'),
    undefined,
    { timeout: 120_000 },
  );
  await win.waitForTimeout(1500);
  const title = await win.locator('.picker select option:checked').textContent();
  check(title?.includes('실측') ?? false, `measured scenario opened: ${title ?? ''}`);
  // "1 / 20": the step counter shows how many steps the measured scenario has.
  const counter = (await win.locator('.narration__step').textContent()) ?? '';
  const beats = Number(counter.split('/')[1]?.trim() ?? 0);
  check(beats > 8, `scenario has ${String(beats)} steps`);
  await win.screenshot({ path: join(out, '5-measured-map.png') });

  // Packet anatomy: jump to the HTTP request step and open it with P.
  const box = await win.locator('.scrubber').boundingBox();
  if (box) await win.mouse.click(box.x + box.width * 0.72, box.y + box.height / 2);
  await win.locator('.narration__text').click();
  await win.keyboard.press('p');
  await win.waitForSelector('.lab', { timeout: 5000 }).catch(() => undefined);
  const hexBytes = await win.locator('.hex__byte').count();
  check(hexBytes > 40, `packet anatomy shows the frame (${String(hexBytes)} byte cells)`);
  await win.screenshot({ path: join(out, '6-packet-anatomy.png') });

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await app.close();
}

if (failures.length > 0) {
  console.error(`${String(failures.length)} check(s) failed`);
  process.exit(1);
}
console.log(`screenshots in ${out}`);
