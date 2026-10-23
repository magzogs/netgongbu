import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiPrefs, AiStatus, ProviderId } from '../src';
import { AiHub, type SecretStore } from '../src/node';

const bin = join(import.meta.dirname, 'fixtures', 'bin');

function memorySecrets(): SecretStore {
  const keys = new Map<ProviderId, string>();
  return {
    kind: 'keychain',
    get: (p) => {
      const key = keys.get(p);
      return key ? { key, source: 'saved' } : null;
    },
    set: (p, key) => {
      if (key) keys.set(p, key);
      else keys.delete(p);
    },
  };
}

/** Answers GET …/models and streams a two-piece chat answer. */
const fakeFetch = ((url: string) => {
  if (url.endsWith('/models')) {
    return Promise.resolve(
      Response.json({
        data: [
          { id: 'gpt-4o', created: 1 },
          { id: 'gpt-5.2', created: 2 },
        ],
      }),
    );
  }
  const body = ['data: {"choices":[{"delta":{"content":"안녕"}}]}\n\n', 'data: [DONE]\n\n'].join(
    '',
  );
  return Promise.resolve(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
}) as typeof fetch;

let hub: AiHub | null = null;
afterEach(() => {
  hub?.dispose();
  hub = null;
});

function makeHub(opened: string[] = []) {
  let saved: AiPrefs | null = null;
  hub = new AiHub({
    prefs: { read: () => saved, write: (p) => (saved = p) },
    secrets: memorySecrets(),
    workDir: mkdtempSync(join(tmpdir(), 'netgongbu-hub-')),
    log: () => undefined,
    openExternal: (url) => opened.push(url),
    fetchImpl: fakeFetch,
  });
  return { hub, saved: () => saved };
}

function until(target: AiHub, done: (s: AiStatus) => boolean): Promise<AiStatus> {
  return new Promise((resolve) => {
    if (done(target.status())) {
      resolve(target.status());
      return;
    }
    const off = target.subscribe((s) => {
      if (done(s)) {
        off();
        resolve(s);
      }
    });
  });
}

describe('AiHub', () => {
  it('says what is missing until a provider is ready', async () => {
    const { hub } = makeHub();
    expect(hub.status()).toMatchObject({
      ready: false,
      notReady: expect.stringContaining('연결된 AI가 없습니다') as string,
    });
    await hub.change({ provider: 'openai', method: 'api', activate: true });
    expect(hub.status().notReady).toBe('ChatGPT API 키를 입력하세요.');
    hub.setKey('openai', 'sk-test-123456');
    expect(hub.status().ready).toBe(true);
    const listed = await hub.models('openai');
    expect(listed).toMatchObject({ ok: true, models: [{ id: 'gpt-5.2' }, { id: 'gpt-4o' }] });
    expect(hub.status()).toMatchObject({ ready: true, keys: { openai: 'saved' } });
    expect(hub.connection()).toEqual({
      provider: 'openai',
      method: 'api',
      model: 'gpt-5.2',
      effort: null,
      apiKey: 'sk-test-123456',
    });
  });

  it('keeps an effort only while the chosen model takes it', async () => {
    const { hub, saved } = makeHub();
    hub.setKey('openai', 'sk-test-123456');
    await hub.change({
      provider: 'openai',
      method: 'api',
      model: 'gpt-5.2',
      effort: 'xhigh',
      activate: true,
    });
    await hub.models('openai');
    expect(hub.connection()?.effort).toBe('xhigh');
    await hub.change({ provider: 'openai', model: 'gpt-4o' });
    expect(hub.connection()?.effort).toBeNull();
    await hub.models('openai');
    expect(saved()?.providers.openai).toMatchObject({ model: 'gpt-4o', effort: null });
  });

  it('streams a chat answer from a local server', async () => {
    const { hub } = makeHub();
    await hub.change({
      provider: 'local',
      baseUrl: 'http://127.0.0.1:9/v1',
      model: 'gemma3',
      activate: true,
    });
    const pieces: string[] = [];
    await hub.chat(
      [
        { role: 'system', content: 's' },
        { role: 'user', content: 'q' },
      ],
      (t) => pieces.push(t),
      new AbortController().signal,
    );
    expect(pieces).toEqual(['안녕']);
  });

  it('runs only the named program as a CLI', async () => {
    const { hub } = makeHub();
    await expect(hub.change({ provider: 'anthropic', cliPath: '/bin/rm' })).rejects.toThrow(
      'claude 실행 파일',
    );
    const status = await hub.change({
      provider: 'anthropic',
      method: 'cli',
      cliPath: join(bin, 'claude'),
      activate: true,
    });
    expect(status.cli.anthropic).toMatchObject({ version: '9.9.9 (Claude Code)', custom: true });
    expect(status.notReady).toBe('Claude Code에 로그인되어 있지 않습니다.');
  });

  it('signs in with a ChatGPT account through the Codex CLI and lists its models', async () => {
    const opened: string[] = [];
    const { hub } = makeHub(opened);
    const status = await hub.change({
      provider: 'openai',
      method: 'oauth',
      cliPath: join(bin, 'codex'),
      activate: true,
    });
    expect(status.notReady).toBe('ChatGPT 계정으로 로그인하세요.');
    await hub.signIn('openai');
    expect(opened).toEqual(['https://auth.example/oauth']);
    const after = await until(hub, (s) => s.accounts.openai.state === 'signed-in' && !s.login);
    expect(after).toMatchObject({
      ready: true,
      accounts: { openai: { label: 'learner@example.com · ChatGPT Plus' } },
    });
    const models = await hub.models('openai');
    expect(models.ok && models.models.map((m) => m.id)).toEqual(['gpt-fast', 'gpt-deep']);
    expect(hub.connection()).toMatchObject({
      provider: 'openai',
      method: 'oauth',
      model: 'gpt-fast',
    });
  });
});
