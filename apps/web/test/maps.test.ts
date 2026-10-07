import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ScenarioSchema,
  TopologySchema,
  geoToPosition,
  type Globe,
  type Scenario,
  type Topology,
} from '@magvirtualedu/schema';
import { flattenTopology, projectGeo, wrapLon } from '../src/engine/flatMap';
import { nodeNumbers } from '../src/engine/order';
import { contextChips, screenContext } from '../src/engine/screenContext';
import { buildTimeline } from '../src/engine/timeline';
import { makeWorld, useViewer } from '../src/store/viewer';

const data = join(import.meta.dirname, '..', 'public', 'data');
const read = (path: string): unknown => JSON.parse(readFileSync(join(data, path), 'utf8'));
const demoTopology: Topology = TopologySchema.parse(read('topologies/trace-demo.json'));
const demoScenario: Scenario = ScenarioSchema.parse(read('scenarios/trace-demo.json'));

const seoul = { lat: 37.57, lon: 126.98 };
const globe: Globe = { center: [0, -40, 0], radius: 40, focus: seoul };

describe('flat world map', () => {
  it('puts the focus at the origin, east to +x and north to -z', () => {
    const [x, , z] = projectGeo(flattenTopology(demoTopology)?.map ?? fail(), seoul.lat, seoul.lon);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(0);
    const map = { globe, width: 0, height: 0, equatorZ: 0 };
    const tokyo = projectGeo(map, 35.68, 139.69);
    expect(tokyo[0]).toBeGreaterThan(0);
    const beijing = projectGeo(map, 39.9, 116.4);
    expect(beijing[2]).toBeLessThan(0);
  });

  it('wraps longitudes so the Pacific is crossed, not the whole map', () => {
    expect(wrapLon(-118 - 127)).toBeCloseTo(115);
    expect(wrapLon(190)).toBeCloseTo(-170);
    const map = { globe, width: 0, height: 0, equatorZ: 0 };
    // Los Angeles lies east of Seoul across the Pacific (about 115° of longitude).
    const la = projectGeo(map, 34.05, -118.24);
    expect(la[0]).toBeGreaterThan(0);
    expect(la[0]).toBeCloseTo((40 * 114.78 * Math.PI) / 180, 1);
  });

  it('moves every node from the globe to the same place on the map, height kept', () => {
    const flat = flattenTopology(demoTopology);
    if (!flat) throw new Error('the demo has a globe');
    expect(flat.topology.globe).toBeUndefined();
    const g = demoTopology.globe;
    if (!g) throw new Error('the demo has a globe');
    for (const node of demoTopology.nodes.filter((n) => n.geo)) {
      const moved = flat.topology.nodes.find((n) => n.id === node.id);
      const geo = node.geo ?? fail();
      const expected = projectGeo(flat.map, geo.lat, geo.lon, 0.03);
      // Same place up to the few tens of kilometres nodes in one city are fanned out by.
      expect(
        Math.hypot((moved?.pos[0] ?? 0) - expected[0], (moved?.pos[2] ?? 0) - expected[2]),
      ).toBeLessThan(1);
      expect(moved?.pos[1]).toBeCloseTo(0.03, 5);
    }
    // Zones lose their anchor and become boxes around their flattened outline.
    for (const zone of flat.topology.zones ?? []) {
      expect(zone.anchor).toBeUndefined();
      const inside = flat.topology.nodes.filter((n) => n.zone === zone.id);
      for (const n of inside) {
        expect(n.pos[0]).toBeGreaterThanOrEqual(zone.bounds[0]);
        expect(n.pos[0]).toBeLessThanOrEqual(zone.bounds[2]);
        expect(n.pos[2]).toBeGreaterThanOrEqual(zone.bounds[1]);
        expect(n.pos[2]).toBeLessThanOrEqual(zone.bounds[3]);
      }
    }
  });

  it('builds playable routes on the map as on the globe', () => {
    const world = makeWorld(demoTopology, 'flat');
    expect(world.view).toBe('map');
    expect(world.markers).toBe(true);
    const timeline = buildTimeline(world, demoScenario);
    expect(timeline.beats.length).toBe(demoScenario.beats.length);
    expect(makeWorld(demoTopology, 'globe').view).toBe('globe');
  });

  it('keeps the globe for topologies without one', () => {
    const floor: Topology = {
      id: 'f',
      title: 'f',
      nodes: [{ id: 'a', type: 'client', label: 'A', pos: geoToPosition(globe, 0, 0) }],
      links: [],
    };
    expect(flattenTopology(floor)).toBeNull();
    expect(makeWorld(floor, 'flat').view).toBe('floor');
  });
});

function fail(): never {
  throw new Error('missing');
}

describe('node numbers', () => {
  it('counts nodes in the order the scenario reaches them, then the rest', () => {
    const numbers = nodeNumbers(demoTopology, demoScenario);
    expect(numbers.get('d-browser')).toBe(1);
    expect(numbers.size).toBe(demoTopology.nodes.length);
    expect(new Set(numbers.values()).size).toBe(numbers.size);
    // The server comes after every router on the way to it.
    const server = numbers.get('n-server') ?? 0;
    for (const id of ['h-router', 'h-modem', 'n-hop-2']) {
      expect(numbers.get(id) ?? 99).toBeLessThan(server);
    }
  });

  it('numbers in topology order without a scenario', () => {
    expect([...nodeNumbers(demoTopology, null).keys()]).toEqual(
      demoTopology.nodes.map((n) => n.id),
    );
  });
});

describe('screen context for the local LLM', () => {
  it('describes the step, its packets with their headers, the selection and the numbered devices', async () => {
    useViewer.setState({
      catalog: [{ id: 'trace-demo', topologyId: 'trace-demo', title: 't', source: 'example' }],
    });
    const world = makeWorld(demoTopology, 'globe');
    const timeline = buildTimeline(world, demoScenario);
    const beatIndex = demoScenario.beats.findIndex((b) =>
      b.hops.some((h) => h.packet.protocol === 'DNS'),
    );
    useViewer.setState({
      world,
      scenario: demoScenario,
      timeline,
      beatIndex,
      nodeNumbers: nodeNumbers(world.topology, demoScenario),
      selection: { kind: 'node', id: 'h-router' },
      packetLab: { beatIndex, hopIndex: 0 },
      labFocus: {
        layer: 'IPv4',
        standard: 'RFC 791',
        field: { name: 'Time To Live', value: '64', meaning: '…', position: '헤더의 비트 64–71' },
      },
    });
    const { text, chips } = screenContext(useViewer.getState());
    expect(text).toContain(
      `[지금 단계 ${String(beatIndex + 1)}/${String(demoScenario.beats.length)}]`,
    );
    expect(text).toContain('DNS');
    expect(text).toMatch(/· IPv4: .*192\.168\.4\.23/);
    expect(text).toContain('[학습자가 고른 장비]');
    expect(text).toContain('3번 공유기');
    expect(text).toContain('가리킨 필드: Time To Live = 64');
    expect(text).toContain('17번 example.org');
    expect(chips).toEqual([
      '지구본',
      `단계 ${String(beatIndex + 1)}/${String(demoScenario.beats.length)}`,
      '선택: 3번 공유기',
      '패킷 해부: IPv4 · Time To Live',
    ]);
    expect(contextChips(useViewer.getState())).toEqual(chips);
    await Promise.resolve();
  });
});
