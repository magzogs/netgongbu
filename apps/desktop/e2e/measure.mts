// Measures pages in the built desktop app and saves screenshots of the result to e2e/out/.
//   pnpm --filter @netgongbu/desktop measure -- example.com info.cern.ch
// Options: --user-data <dir> (default: the app's own data folder, so traces and the location
// database are kept), --download-geo (download the DB-IP location database first if missing),
// --open <trace id> (open a saved measurement instead of measuring), --tour (play the result
// with the follow camera on and take a screenshot every few seconds).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string): boolean => args.includes(name);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const userData = option('--user-data');
const openId = option('--open');
const urls = args.filter(
  (a, i) => !a.startsWith('--') && !['--user-data', '--open'].includes(args[i - 1] ?? ''),
);
if (urls.length === 0 && !openId) urls.push('example.com');

const here = import.meta.dirname;
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const executablePath = createRequire(import.meta.url)('electron') as unknown as string;

const app = await electron.launch({
  executablePath,
  // Korean, whatever the system's language: the steps find controls by their Korean labels.
  args: ['--lang=ko', join(here, '..')],
  env: { ...process.env, ...(userData && { NETGONGBU_USER_DATA: userData }) },
});
app.process().stdout?.on('data', (d: Buffer) => process.stdout.write(`[app] ${d.toString()}`));

const LOCALE_KEY = 'netgongbu.locale';
let savedLocale: string | null = null;

try {
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForSelector('.player', { timeout: 20_000 });
  // A language picked in the settings outlasts --lang: use Korean for this run, then put it back.
  savedLocale = await win.evaluate((key) => localStorage.getItem(key), LOCALE_KEY);
  if (savedLocale && savedLocale !== 'ko') {
    await win.evaluate((key) => {
      localStorage.setItem(key, 'ko');
    }, LOCALE_KEY);
    await win.reload();
    await win.waitForSelector('.player', { timeout: 20_000 });
  }

  if (flag('--download-geo')) {
    await win.locator('.settings-button').click();
    await win.waitForSelector('.settings');
    const button = win.locator('.settings button', { hasText: '내려받기' });
    if ((await button.count()) > 0) {
      console.log('downloading the location database…');
      await button.click();
      await win.waitForFunction(
        () => document.querySelector('.settings')?.textContent.includes('설치됨'),
        undefined,
        {
          timeout: 600_000,
          polling: 2000,
        },
      );
    }
    console.log(
      `location database: ${(await win.locator('.settings').textContent())?.match(/설치됨 \([^)]*\)/)?.[0] ?? '?'}`,
    );
    await win.keyboard.press('Escape');
  }

  const tour = async (name: string): Promise<void> => {
    if (!flag('--tour')) return;
    await win.locator('.player .toggle input').uncheck();
    await win.locator('.pill-button', { hasText: '따라가기' }).click();
    await win.locator('.icon-button--primary').click();
    for (let i = 1; i <= 8; i++) {
      await win.waitForTimeout(3500);
      const step = (await win.locator('.narration__step').textContent()) ?? '';
      await win.screenshot({ path: join(out, `tour-${name}-${String(i)}.png`) });
      console.log(`tour ${String(i)}: step ${step}`);
    }
  };

  if (openId) {
    await win.locator('.picker select').selectOption(openId);
    await win.waitForTimeout(2000);
    await win.screenshot({ path: join(out, `open-${openId}.png`) });
    await tour(openId);
  }

  for (const url of urls) {
    await win.locator('.browser-button').click();
    await win.locator('.browser__address input').fill(url);
    await win.locator('.browser__address input').press('Enter');
    await win.waitForFunction(
      () =>
        document.querySelector<HTMLSelectElement>('.picker select')?.value.startsWith('trace-') &&
        !document.querySelector('.browser'),
      undefined,
      { timeout: 180_000 },
    );
    await win.waitForTimeout(2000);
    const name = url.replace(/[^a-z0-9.]+/gi, '_');
    await win.screenshot({ path: join(out, `measure-${name}.png`) });
    console.log(
      `${url}: ${(await win.locator('.picker select option:checked').textContent()) ?? ''}`,
    );
  }
} finally {
  if (savedLocale && savedLocale !== 'ko') {
    const restore = savedLocale;
    const win = await app.firstWindow();
    await win
      .evaluate(
        ([key, value]) => {
          localStorage.setItem(key, value);
        },
        [LOCALE_KEY, restore] as const,
      )
      .catch(() => undefined);
  }
  await app.close();
}
