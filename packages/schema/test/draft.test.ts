import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  draftToScenario,
  scenarioToDraft,
  ScenarioDraftSchema,
  ScenarioSchema,
  type Scenario,
} from '../src';

const scenario: Scenario = {
  id: 'ask-1',
  topologyId: 'mini',
  title: 'Ping',
  question: 'How does ping work?',
  beats: [
    {
      id: 'step-1',
      narration: 'Echo request',
      hops: [
        {
          path: ['pc1', 'r-home'],
          packet: {
            protocol: 'ICMP',
            summary: 'echo request',
            layers: [
              { name: 'IP', fields: { src: '192.168.0.10', dst: '8.8.8.8' } },
              { name: 'ICMP', fields: { type: '8' } },
            ],
          },
        },
      ],
      nodeActions: [{ node: 'r-home', text: 'NAT', kind: 'rewrite' }],
    },
    { id: 'step-2', narration: 'Thinking', hops: [] },
  ],
};

describe('draft form', () => {
  it('round-trips a scenario through the draft the AI writes', () => {
    const draft = scenarioToDraft(scenario);
    expect(ScenarioDraftSchema.parse(draft)).toEqual(draft);
    const back = draftToScenario(draft, {
      id: 'ask-1',
      topologyId: 'mini',
      question: 'How does ping work?',
    });
    expect(back).toEqual(scenario);
    expect(ScenarioSchema.parse(back)).toEqual(scenario);
  });

  it('keeps the last value when the AI repeats a header field and drops blank unsupported notes', () => {
    const draft = scenarioToDraft(scenario);
    draft.beats[0]!.hops[0]!.packet.layers[0]!.fields.push({ name: 'src', value: '10.0.0.1' });
    draft.unsupported = '  ';
    const back = draftToScenario(draft, { id: 'x', topologyId: 'mini', question: 'q' });
    expect(back.beats[0]!.hops[0]!.packet.layers[0]!.fields.src).toBe('10.0.0.1');
    expect(back.unsupported).toBeUndefined();
  });

  it('only uses JSON Schema that structured outputs accept (closed objects, no records)', () => {
    const schema = z.toJSONSchema(ScenarioDraftSchema);
    const open: string[] = [];
    const visit = (node: unknown, path: string): void => {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if (obj.type === 'object' && obj.additionalProperties !== false) open.push(path);
      for (const [key, value] of Object.entries(obj)) visit(value, `${path}/${key}`);
    };
    visit(schema, '#');
    expect(open).toEqual([]);
  });
});
