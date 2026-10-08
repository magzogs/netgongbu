import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { indexTopology, type Scenario, type Topology } from '@netgongbu/schema';
import { anchorOf, buildLinkCurves, foldLinkCurves } from '../src/engine/curves';
import {
  beatAt,
  buildTimeline,
  defaultDuration,
  ease,
  pointOnRoute,
  routeOf,
  STILL_BEAT_SECONDS,
} from '../src/engine/timeline';

// b is the corner: a —l1→ b ←l2— c, so travelling b → c runs against l2's curve direction.
const topology: Topology = {
  id: 'corner',
  title: 'Corner',
  nodes: [
    { id: 'a', type: 'client', label: 'A', pos: [0, 0, 0] },
    { id: 'b', type: 'router', label: 'B', pos: [10, 0, 0] },
    { id: 'c', type: 'server', label: 'C', pos: [10, 0, 10] },
  ],
  links: [
    { id: 'l1', a: 'a', b: 'b', medium: 'ethernet' },
    { id: 'l2', a: 'c', b: 'b', medium: 'ethernet' },
  ],
};
const world = { index: indexTopology(topology), curves: buildLinkCurves(topology) };
const packet = { protocol: 'TCP' as const, summary: 'SYN', layers: [{ name: 'TCP', fields: {} }] };

function expectNear(actual: Vector3, expected: Vector3): void {
  expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
}

describe('routeOf', () => {
  it('orients each segment in the direction of travel', () => {
    const route = routeOf(world, ['a', 'b', 'c']);
    expect(route.segments.map((s) => [s.linkId, s.reversed])).toEqual([
      ['l1', false],
      ['l2', true],
    ]);
    expect(route.segments[1]!.offset).toBeCloseTo(route.segments[0]!.length);
    expect(route.length).toBeCloseTo(route.segments[0]!.length + route.segments[1]!.length);
  });

  it('throws when two consecutive nodes are not linked', () => {
    expect(() => routeOf(world, ['a', 'c'])).toThrow('No link between a and c');
  });
});

describe('pointOnRoute', () => {
  const route = routeOf(world, ['a', 'b', 'c']);
  const out = new Vector3();

  it('starts at the first node, ends at the last and passes the corner in between', () => {
    expect(pointOnRoute(route, 0, out)?.linkId).toBe('l1');
    expectNear(out, anchorOf([0, 0, 0]));
    pointOnRoute(route, route.segments[0]!.length / route.length, out);
    expectNear(out, anchorOf([10, 0, 0]));
    expect(pointOnRoute(route, 1, out)?.linkId).toBe('l2');
    expectNear(out, anchorOf([10, 0, 10]));
  });

  it('clamps progress outside 0..1', () => {
    pointOnRoute(route, -1, out);
    expectNear(out, anchorOf([0, 0, 0]));
    pointOnRoute(route, 2, out);
    expectNear(out, anchorOf([10, 0, 10]));
  });

  it('runs a reversed segment backwards along its curve', () => {
    const back = routeOf(world, ['c', 'b', 'a']);
    pointOnRoute(back, 0, out);
    expectNear(out, anchorOf([10, 0, 10]));
    pointOnRoute(back, 1, out);
    expectNear(out, anchorOf([0, 0, 0]));
  });
});

describe('buildTimeline', () => {
  const scenario: Scenario = {
    id: 's',
    topologyId: 'corner',
    title: 'S',
    beats: [
      { id: 'go', narration: 'go', hops: [{ path: ['a', 'b', 'c'], packet }] },
      { id: 'think', narration: 'think', hops: [] },
      { id: 'fixed', narration: 'fixed', hops: [{ path: ['c', 'b'], packet }], durationSec: 7 },
    ],
  };

  it('lays beats end to end with path-based, still and explicit durations', () => {
    const timeline = buildTimeline(world, scenario);
    const [go, think, fixed] = timeline.beats;
    expect(go!.duration).toBe(defaultDuration(go!.routes));
    expect(think!.duration).toBe(STILL_BEAT_SECONDS);
    expect(fixed!.duration).toBe(7);
    expect(think!.start).toBeCloseTo(go!.duration);
    expect(fixed!.start).toBeCloseTo(go!.duration + STILL_BEAT_SECONDS);
    expect(timeline.total).toBeCloseTo(fixed!.start + 7);
  });

  it('keeps default durations between 1.4 and 6 seconds', () => {
    const short = routeOf(world, ['a', 'b']);
    expect(defaultDuration([short])).toBeGreaterThanOrEqual(1.4);
    expect(defaultDuration([{ segments: [], length: 10_000 }])).toBe(6);
  });
});

describe('ease', () => {
  it('maps 0 → 0, 0.5 → 0.5, 1 → 1 and clamps', () => {
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(1.5)).toBe(1);
  });
});

describe('beatAt', () => {
  const beats = [1, 3, 1].map((duration, i, all) => ({
    beat: { id: `b${i}`, narration: 'x', hops: [] },
    routes: [],
    duration,
    start: all.slice(0, i).reduce((a, b) => a + b, 0),
  }));
  const timeline = { beats, total: 5 };

  it('maps a fraction of total playing time to a beat and progress within it', () => {
    expect(beatAt(timeline, 0)).toEqual({ beatIndex: 0, progress: 0 });
    expect(beatAt(timeline, 0.1)).toEqual({ beatIndex: 0, progress: 0.5 });
    expect(beatAt(timeline, 0.5)).toEqual({ beatIndex: 1, progress: 0.5 });
    expect(beatAt(timeline, 1)).toEqual({ beatIndex: 2, progress: 1 });
    expect(beatAt(timeline, 7)).toEqual({ beatIndex: 2, progress: 1 });
  });
});

describe('foldLinkCurves', () => {
  // a and b folded into one marker at m: l1 shrinks under it, l2 runs from c to the marker.
  const m = new Vector3(5, 0, 0);
  const folded = (id: string): Vector3 | undefined => (id === 'a' || id === 'b' ? m : undefined);
  const drawn = foldLinkCurves(world.curves, topology, 0.5, folded);

  it('moves ends in a folded zone to its marker', () => {
    const l2 = drawn.get('l2');
    expect(l2?.curve.getPointAt(0).distanceTo(anchorOf([10, 0, 10]))).toBeLessThan(1e-9);
    expect(l2?.curve.getPointAt(1).distanceTo(new Vector3(5, 0.5, 0))).toBeLessThan(1e-9);
  });

  it('shrinks a link inside one marker to a point', () => {
    expect(drawn.get('l1')?.length).toBe(0);
  });

  it('lets packets follow the drawn links, keeping the timing', () => {
    const route = routeOf(world, ['c', 'b']);
    const out = new Vector3();
    pointOnRoute(route, 1, out, drawn);
    expect(out.distanceTo(new Vector3(5, 0.5, 0))).toBeLessThan(1e-9);
  });

  it('keeps links with no folded end', () => {
    const none = foldLinkCurves(world.curves, topology, 0.5, () => undefined);
    expect(none.get('l1')).toBe(world.curves.get('l1'));
  });
});
