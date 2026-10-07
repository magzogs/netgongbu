// Launches the built desktop app (electron-vite build first) with a throw-away data folder and
// the canned AI, checks the viewer works through the preload bridge, and saves screenshots to
// e2e/out/. Run: pnpm --filter @magvirtualedu/desktop test:e2e
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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

// A stand-in for a local LLM server (OpenAI-compatible, like Ollama's /v1): one model, and an
// answer streamed in pieces that repeats what it was told about the screen.
interface LlmRequest {
  messages: { role: string; content: string | { type: string }[] }[];
}
const llmRequests: LlmRequest[] = [];
const llmServer = createServer((req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'stand-in:1b' }] }));
    return;
  }
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on('end', () => {
    llmRequests.push(JSON.parse(body) as LlmRequest);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const piece of ['<think>…</think>', '**스탠드인** ', '답: ', '화면을 받았습니다.']) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
    }
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((resolve) => llmServer.listen(0, '127.0.0.1', resolve));
const llmUrl = `http://127.0.0.1:${String((llmServer.address() as AddressInfo).port)}/v1`;

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

  // Questions about the screen: the main process asks the local LLM and streams the answer.
  await win.locator('.tutor-button').click();
  await win.locator('.tutor__settings input').first().fill(llmUrl);
  await win.locator('.tutor__settings .primary-button').click();
  await win.waitForFunction(() =>
    document.querySelector('.tutor__model')?.textContent.includes('stand-in'),
  );
  await win.locator('.tutor__input').fill('이 단계에서 무슨 일이 일어나나요?');
  await win.locator('.tutor__input').press('Enter');
  await win.waitForFunction(
    () => document.querySelector('.tutor__msg--assistant')?.textContent.includes('화면을 받았'),
    undefined,
    { timeout: 10_000 },
  );
  const answer = (await win.locator('.tutor__msg--assistant').first().textContent()) ?? '';
  check(!answer.includes('…'), `local LLM answers through the main process: ${answer}`);
  const system = llmRequests.at(-1)?.messages[0]?.content;
  check(
    typeof system === 'string' && system.includes('[지금 단계'),
    'the question goes with a description of the screen',
  );
  await win.screenshot({ path: join(out, '3b-screen-question.png') });
  await win.locator('.tutor__actions .text-button', { hasText: '닫기' }).click();

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
  const layers = await win.locator('.encap__label').count();
  const cells = await win.locator('.lcell').count();
  check(
    layers >= 4 && cells > 5,
    `layers stacked (${String(layers)}) and a header drawn bit by bit (${String(cells)} cells)`,
  );
  await win.locator('.lcell').first().click();
  await win.locator('.lab .segmented button').nth(1).click();
  const bits = (await win.locator('.lcell.is-focused .lcell__raw').first().textContent()) ?? '';
  check(/^[01 ]+$/.test(bits), `binary view shows the pinned field's bits (${bits})`);
  await win.screenshot({ path: join(out, '6-packet-anatomy.png') });
  await win.locator('.lab .segmented button').nth(0).click();

  // The anatomy view in a window of its own, and back.
  const [popout] = await Promise.all([
    app.waitForEvent('window'),
    win.locator('.lab__window-actions button', { hasText: '새 창' }).click(),
  ]);
  await popout.waitForSelector('.lab .hex__byte', { timeout: 5000 });
  const popped = await popout.locator('.hex__byte').count();
  check(
    popped > 40 && (await win.locator('.lab').count()) === 0,
    `packet anatomy pops out into its own window (${String(popped)} byte cells there)`,
  );
  await popout.setViewportSize({ width: 1100, height: 760 });
  await popout.screenshot({ path: join(out, '7-anatomy-window.png') });
  await popout.locator('.lab__window-actions button', { hasText: '앱 안으로' }).click();
  await win.waitForSelector('.lab', { timeout: 5000 });
  await popout.waitForEvent('close', { timeout: 5000 }).catch(() => undefined);
  check(popout.isClosed(), 'docking it back closes the window');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await app.close();
  llmServer.close();
}

if (failures.length > 0) {
  console.error(`${String(failures.length)} check(s) failed`);
  process.exit(1);
}
console.log(`screenshots in ${out}`);
