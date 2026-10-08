import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenarioService, ScenarioStore, TopologyLibrary, type ScenarioModel } from '@netgongbu/ai';
import type { AiPrefs } from '@netgongbu/llm';
import { AiHub } from '@netgongbu/llm/node';
import { createApp } from '../src/app';
import { memorySecrets } from '../src/hub';
import { dataDir, fakeModel, goodDraft, textReply } from './fakes';

function app(model: ScenarioModel | null) {
  let n = 0;
  const scenarios = new ScenarioService({
    topologies: new TopologyLibrary(dataDir),
    store: new ScenarioStore(mkdtempSync(join(tmpdir(), 'scenarios-'))),
    model: () => model,
    maxAttempts: 2,
    maxQuestionLength: 500,
    noCredentialsMessage: 'no key',
    newId: () => `ask-${String(++n)}`,
  });
  return createApp({ scenarios });
}

function ask(target: ReturnType<typeof app>, body: unknown) {
  return target.request('/api/scenarios', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('scenario API', () => {
  it('reports whether AI generation is available', async () => {
    expect(await (await app(null).request('/api/health')).json()).toEqual({ ok: true, ai: false });
  });

  it('refuses questions without credentials, with a reason the viewer can show', async () => {
    const res = await ask(app(null), { topologyId: 'home-to-web', question: 'ping은?' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'no-credentials' });
  });

  it('rejects malformed questions and unknown topologies', async () => {
    const target = app(fakeModel());
    expect((await ask(target, { topologyId: 'home-to-web', question: 'a' })).status).toBe(400);
    expect((await ask(target, { question: 'missing topology' })).status).toBe(400);
    expect((await ask(target, { topologyId: '../etc', question: 'ping은 어떻게?' })).status).toBe(
      404,
    );
  });

  it('generates, stores and lists a scenario', async () => {
    const target = app(fakeModel(textReply(JSON.stringify(goodDraft()))));
    const res = await ask(target, { topologyId: 'home-to-web', question: '  ping은 어떻게?  ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      entry: { id: 'ask-1', topologyId: 'home-to-web', question: 'ping은 어떻게?' },
      scenario: { id: 'ask-1', title: 'ping 8.8.8.8' },
      attempts: 1,
    });

    const stored = await target.request('/api/scenarios/ask-1');
    expect(await stored.json()).toMatchObject({ id: 'ask-1', beats: [{}, {}] });
    const catalog = (await (await target.request('/api/catalog')).json()) as {
      scenarios: { id: string }[];
    };
    expect(catalog.scenarios.map((s) => s.id)).toEqual(['ask-1']);
  });

  it('returns 422 with the problems when no playable scenario came back', async () => {
    const broken = goodDraft();
    broken.beats[0]!.hops[0]!.path = ['laptop', 'dns'];
    const answer = JSON.stringify(broken);
    const res = await ask(app(fakeModel(textReply(answer), textReply(answer))), {
      topologyId: 'home-to-web',
      question: 'DNS는 어떻게?',
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: 'invalid',
      issues: [
        { message: expect.stringContaining('no link between "laptop" and "dns"') as string },
      ],
    });
  });

  it('answers 404 for unknown or malformed scenario ids', async () => {
    const target = app(null);
    expect((await target.request('/api/scenarios/ask-404')).status).toBe(404);
    expect((await target.request('/api/scenarios/..%2Fsecret')).status).toBe(404);
  });
});

/** A local OpenAI-compatible server: one model, an answer in two pieces. */
const localFetch = ((url: string) =>
  Promise.resolve(
    url.endsWith('/models')
      ? Response.json({ data: [{ id: 'gemma3' }] })
      : new Response(
          'data: {"choices":[{"delta":{"content":"TTL은 "}}]}\n\ndata: {"choices":[{"delta":{"content":"줄어듭니다."}}]}\n\ndata: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        ),
  )) as typeof fetch;

function aiApp() {
  let prefs: AiPrefs | null = null;
  const hub = new AiHub({
    prefs: { read: () => prefs, write: (p) => (prefs = p) },
    secrets: memorySecrets({}),
    workDir: mkdtempSync(join(tmpdir(), 'netgongbu-ai-')),
    log: () => undefined,
    openExternal: () => undefined,
    fetchImpl: localFetch,
  });
  const scenarios = new ScenarioService({
    topologies: new TopologyLibrary(dataDir),
    store: new ScenarioStore(mkdtempSync(join(tmpdir(), 'scenarios-'))),
    model: () => null,
    maxAttempts: 1,
    maxQuestionLength: 500,
    noCredentialsMessage: () => hub.status().notReady ?? '',
  });
  return createApp({ scenarios, hub });
}

const post = (target: ReturnType<typeof aiApp>, path: string, body: unknown, headers = {}) =>
  target.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('AI connection API', () => {
  it('answers this computer only, and no other site’s page', async () => {
    const target = aiApp();
    expect((await target.request('http://192.168.0.5:8787/api/ai/status')).status).toBe(403);
    expect((await target.request('http://evil.example/api/ai/status')).status).toBe(403);
    const cross = await post(
      target,
      '/api/ai/key',
      { provider: 'openai', key: 'sk-12345678' },
      {
        'sec-fetch-site': 'cross-site',
      },
    );
    expect(cross.status).toBe(403);
    const form = await target.request('/api/ai/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"provider":"openai"}',
    });
    expect(form.status).toBe(415);
  });

  it('connects a local model and streams its answer as server-sent events', async () => {
    const target = aiApp();
    const status = (await (await target.request('/api/ai/status')).json()) as { ready: boolean };
    expect(status.ready).toBe(false);
    const changed = await post(target, '/api/ai/change', {
      provider: 'local',
      baseUrl: 'http://127.0.0.1:11434/v1',
      activate: true,
    });
    expect(await changed.json()).toMatchObject({ prefs: { provider: 'local' } });
    const models: unknown = await (await target.request('/api/ai/models?provider=local')).json();
    expect(models).toEqual({ ok: true, models: [{ id: 'gemma3', label: 'gemma3', efforts: [] }] });

    const res = await post(target, '/api/ai/chat', {
      id: 'q1',
      messages: [
        { role: 'system', content: '튜터' },
        { role: 'user', content: 'TTL?' },
      ],
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = (await res.text())
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => JSON.parse(l.slice(5)) as { type: string; text?: string });
    expect(events).toEqual([
      { id: 'q1', type: 'delta', text: 'TTL은 ' },
      { id: 'q1', type: 'delta', text: '줄어듭니다.' },
      { id: 'q1', type: 'done', model: null },
    ]);
  });

  it('refuses a CLI path that is not the CLI', async () => {
    const res = await post(aiApp(), '/api/ai/change', { provider: 'openai', cliPath: '/bin/sh' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('codex') as string });
  });
});
