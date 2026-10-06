import { describe, expect, it } from 'vitest';
import {
  ScenarioSchema,
  TopologySchema,
  validateScenario,
  validateTopology,
  type Beat,
  type Scenario,
  type Topology,
} from '../src';

const topology: Topology = {
  id: 'mini',
  title: 'Mini',
  zones: [{ id: 'home', label: 'Home', color: '#334', bounds: [-1, -1, 6, 1] }],
  nodes: [
    { id: 'pc1', type: 'client', label: 'Laptop', pos: [0, 0, 0], zone: 'home' },
    { id: 'r-home', type: 'router', label: 'Router', pos: [5, 0, 0], zone: 'home' },
    { id: 'web', type: 'server', label: 'Web', pos: [10, 0, 0] },
  ],
  links: [
    { id: 'l1', a: 'pc1', b: 'r-home', medium: 'wifi' },
    { id: 'l2', a: 'r-home', b: 'web', medium: 'internet' },
  ],
};

const packet = { protocol: 'TCP' as const, summary: 'SYN', layers: [{ name: 'TCP', fields: {} }] };

function scenarioWith(beats: Beat[]): Scenario {
  return { id: 's1', topologyId: 'mini', title: 'Test', beats };
}

describe('validateTopology', () => {
  it('accepts a consistent topology', () => {
    expect(validateTopology(topology)).toEqual([]);
  });

  it('reports links to unknown nodes, self links, duplicate ids and unknown zones', () => {
    const broken: Topology = {
      ...topology,
      nodes: [
        ...topology.nodes,
        { id: 'web', type: 'server', label: 'Dup', pos: [0, 0, 0], zone: 'dc' },
      ],
      links: [
        ...topology.links,
        { id: 'l3', a: 'web', b: 'ghost', medium: 'fiber' },
        { id: 'l4', a: 'pc1', b: 'pc1', medium: 'virtual' },
      ],
    };
    const messages = validateTopology(broken).map((i) => i.message);
    expect(messages).toContain('Node id "web" is used more than once.');
    expect(messages).toContain('Link "l3" ends at unknown node "ghost".');
    expect(messages).toContain('Link "l4" connects "pc1" to itself.');
    expect(messages).toContain('Node "web" is in unknown zone "dc".');
  });
});

describe('validateScenario', () => {
  it('accepts paths that follow links in either direction', () => {
    const scenario = scenarioWith([
      { id: 'out', narration: 'out', hops: [{ path: ['pc1', 'r-home', 'web'], packet }] },
      { id: 'back', narration: 'back', hops: [{ path: ['web', 'r-home', 'pc1'], packet }] },
    ]);
    expect(validateScenario(topology, scenario)).toEqual([]);
  });

  it('explains a missing link and lists where the packet could go instead', () => {
    const scenario = scenarioWith([
      { id: 'jump', narration: 'x', hops: [{ path: ['pc1', 'web'], packet }] },
    ]);
    expect(validateScenario(topology, scenario)).toEqual([
      {
        where: 'beat jump, hop 1',
        message: 'There is no link between "pc1" and "web". "pc1" is linked to: r-home.',
      },
    ]);
  });

  it('reports unknown nodes in paths and node actions', () => {
    const scenario = scenarioWith([
      {
        id: 'ghost',
        narration: 'x',
        hops: [{ path: ['pc1', 'dns'], packet }],
        nodeActions: [{ node: 'fw', text: 'drop' }],
      },
    ]);
    expect(validateScenario(topology, scenario).map((i) => i.message)).toEqual([
      'Node "dns" does not exist in this topology.',
      'Node action refers to "fw", which does not exist in this topology.',
    ]);
  });

  it('reports repeated nodes, duplicate beat ids and the wrong topology', () => {
    const scenario = scenarioWith([
      { id: 'a', narration: 'x', hops: [{ path: ['pc1', 'pc1', 'r-home'], packet }] },
      { id: 'a', narration: 'y', hops: [] },
    ]);
    expect(validateScenario(topology, scenario).map((i) => i.message)).toEqual([
      'Beat id "a" is used more than once.',
      'Path repeats "pc1" twice in a row.',
    ]);
    expect(validateScenario(topology, { ...scenario, topologyId: 'other' })[0]?.message).toBe(
      'Scenario is written for topology "other", not "mini".',
    );
  });
});

describe('schemas', () => {
  it('rejects a hop with a single node and ids with spaces', () => {
    const bad = scenarioWith([{ id: 'x', narration: 'x', hops: [{ path: ['pc1'], packet }] }]);
    expect(ScenarioSchema.safeParse(bad).success).toBe(false);
    expect(TopologySchema.safeParse({ ...topology, id: 'Mini Topology' }).success).toBe(false);
  });

  it('converts the scenario schema to JSON Schema for the AI tool definition', () => {
    const json = JSON.stringify(ScenarioSchema.toJSONSchema());
    expect(json).toContain('Every consecutive pair must be joined by a link');
  });
});
