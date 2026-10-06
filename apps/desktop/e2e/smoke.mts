// Launches the built desktop app (electron-vite build first) with a throw-away data folder and
// the canned AI, checks the viewer works through the preload bridge, and saves screenshots to
// e2e/out/. Run: pnpm --filter @magvirtualedu/desktop test:e2e
import { mkdirSync, mkdtempSync } from 'node:fs';
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
  const status = await win.locator('.settings__status').textContent();
  check(status !== null && status.length > 0, `settings show key status: ${status ?? ''}`);
  await win.screenshot({ path: join(out, '3-settings.png') });

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await app.close();
}

if (failures.length > 0) {
  console.error(`${String(failures.length)} check(s) failed`);
  process.exit(1);
}
console.log(`screenshots in ${out}`);
