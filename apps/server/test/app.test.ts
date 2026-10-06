import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { ScenarioModel } from '@magvirtualedu/ai';
import { ScenarioStore } from '../src/store';
import { TopologyLibrary } from '../src/topologies';
import { dataDir, fakeModel, goodDraft, textReply } from './fakes';

const config = { model: 'claude-opus-5-5', maxAttempts: 2, maxQuestionLength: 500 };

function app(model: ScenarioModel | null) {
  let n = 0;
  return createApp({
    topologies: new TopologyLibrary(dataDir),
    store: new ScenarioStore(mkdtempSync(join(tmpdir(), 'scenarios-'))),
    model,
    config,
    newId: () => `ask-${String(++n)}`,
  });
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
    expect(await (await app(null).request('/api/health')).json()).toEqual({
      ok: true,
      ai: false,
      model: 'claude-opus-5-5',
    });
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
