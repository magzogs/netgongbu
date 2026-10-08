import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeCli } from '../src/node/claude';
import { CodexAppServer } from '../src/node/codex';
import { cliVersion, isCliPathFor } from '../src/node/locate';

const bin = join(import.meta.dirname, 'fixtures', 'bin');
const cwd = mkdtempSync(join(tmpdir(), 'netgongbu-cli-'));
const log = (): undefined => undefined;

describe('Codex app server', () => {
  let codex: CodexAppServer | null = null;
  afterEach(() => {
    codex?.stop();
    delete process.env.FAKE_CODEX_SIGNED_IN;
  });

  it('signs in with ChatGPT, then reads the account', async () => {
    codex = new CodexAppServer(join(bin, 'codex'), { cwd, log });
    expect(await codex.account()).toEqual({ state: 'signed-out' });
    const finished = new Promise<string | null>((resolve) => {
      void codex?.login(resolve).then(({ url }) => {
        expect(url).toBe('https://auth.example/oauth');
      });
    });
    expect(await finished).toBeNull();
    expect(await codex.account()).toEqual({
      state: 'signed-in',
      kind: 'subscription',
      label: 'learner@example.com · ChatGPT Plus',
    });
  });

  it('lists the visible models of every page with their effort levels', async () => {
    codex = new CodexAppServer(join(bin, 'codex'), { cwd, log });
    expect(await codex.models()).toEqual([
      {
        id: 'gpt-fast',
        label: 'GPT Fast',
        description: 'quick',
        efforts: ['low', 'high'],
        defaultEffort: 'low',
        vision: true,
        recommended: true,
      },
      {
        id: 'gpt-deep',
        label: 'GPT Deep',
        efforts: ['medium', 'xhigh'],
        defaultEffort: 'medium',
        vision: false,
      },
    ]);
  });

  it('answers in a throw-away read-only thread with the model, effort and schema', async () => {
    process.env.FAKE_CODEX_SIGNED_IN = '1';
    codex = new CodexAppServer(join(bin, 'codex'), { cwd, log });
    const pieces: string[] = [];
    const answer = await codex.ask({
      model: 'gpt-deep',
      effort: 'xhigh',
      system: '튜터 지침',
      turns: [
        { role: 'user', text: '앞 질문' },
        { role: 'assistant', text: '앞 답' },
        { role: 'user', text: 'TTL?', images: ['data:image/png;base64,AA'] },
      ],
      schema: { type: 'object' },
      onText: (t) => pieces.push(t),
    });
    expect(pieces.join('')).toBe(answer.text);
    expect(JSON.parse(answer.text)).toEqual({
      model: 'gpt-deep',
      effort: 'xhigh',
      instructions: '튜터 지침',
      sandbox: 'read-only',
      ephemeral: true,
      text: expect.stringContaining('<user>\n앞 질문\n</user>') as string,
      images: 1,
      schema: true,
    });
    expect(answer.model).toBe('gpt-deep');
  });

  it('explains a signed-out account and stops a turn when asked', async () => {
    codex = new CodexAppServer(join(bin, 'codex'), { cwd, log });
    const turn = {
      model: '',
      effort: null,
      system: '',
      turns: [{ role: 'user' as const, text: 'q' }],
    };
    await expect(codex.ask(turn)).rejects.toMatchObject({ kind: 'auth' });
    process.env.FAKE_CODEX_SIGNED_IN = '1';
    codex.stop();
    codex = new CodexAppServer(join(bin, 'codex'), { cwd, log });
    const controller = new AbortController();
    const waiting = codex.ask({
      ...turn,
      turns: [{ role: 'user', text: 'WAIT' }],
      signal: controller.signal,
    });
    setTimeout(() => {
      controller.abort();
    }, 200);
    await expect(waiting).resolves.toMatchObject({ text: '' });
  });
});

describe('Claude Code CLI', () => {
  afterEach(() => {
    delete process.env.FAKE_CLAUDE_SIGNED_IN;
  });

  it('reads the version and the account', async () => {
    const claude = new ClaudeCli(join(bin, 'claude'), { cwd, log });
    expect(await cliVersion(join(bin, 'claude'))).toBe('9.9.9 (Claude Code)');
    expect(await claude.account()).toEqual({ state: 'signed-out' });
    process.env.FAKE_CLAUDE_SIGNED_IN = '1';
    expect(await claude.account()).toEqual({
      state: 'signed-in',
      kind: 'subscription',
      label: 'learner@example.com · Claude Max',
    });
  });

  it('signs in through `claude auth login`, passing on the page address', async () => {
    const urls: string[] = [];
    const { done } = new ClaudeCli(join(bin, 'claude'), { cwd, log }).login((u) => urls.push(u));
    await done;
    expect(urls).toEqual(['https://claude.ai/oauth/authorize?code=true']);
  });

  it('lists the models from the initialize handshake', async () => {
    const models = await new ClaudeCli(join(bin, 'claude'), { cwd, log }).models();
    expect(models).toEqual([
      {
        id: 'default',
        label: 'Default (recommended)',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        vision: true,
        recommended: true,
      },
      { id: 'haiku', label: 'Haiku', description: 'Fastest', efforts: [], vision: true },
    ]);
  });

  it('streams an answer from a tool-less safe-mode run with model, effort and system prompt', async () => {
    const pieces: string[] = [];
    const answer = await new ClaudeCli(join(bin, 'claude'), { cwd, log }).ask({
      model: 'opus',
      effort: 'max',
      system: '튜터 지침',
      turns: [{ role: 'user', text: 'TTL?', images: ['data:image/png;base64,AA'] }],
      onText: (t) => pieces.push(t),
    });
    expect(pieces.join('')).toBe(answer.text);
    expect(JSON.parse(answer.text)).toEqual({
      model: 'opus',
      effort: 'max',
      system: '튜터 지침',
      tools: '',
      safe: true,
      text: 'TTL?',
      images: 1,
    });
    expect(answer.model).toBe('claude-fake-1');
  });

  it('returns the structured output and reports CLI errors', async () => {
    const claude = new ClaudeCli(join(bin, 'claude'), { cwd, log });
    const turn = {
      model: 'default',
      effort: null,
      system: 's',
      turns: [{ role: 'user' as const, text: 'q' }],
    };
    const structured = await claude.ask({ ...turn, schema: { type: 'object' } });
    expect(JSON.parse(structured.text)).toEqual({ schema: 'object' });
    await expect(
      claude.ask({ ...turn, turns: [{ role: 'user', text: 'AUTHFAIL' }] }),
    ).rejects.toMatchObject({ kind: 'auth' });
  });

  it('accepts only the right program as a CLI path', () => {
    expect(isCliPathFor('anthropic', '/usr/local/bin/claude')).toBe(true);
    expect(isCliPathFor('anthropic', '/bin/rm')).toBe(false);
    expect(isCliPathFor('openai', 'codex')).toBe(false);
  });
});
