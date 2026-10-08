import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TopologySchema, type Topology } from '@netgongbu/schema';
import {
  foldedClusters,
  foldedNodes,
  groupFolds,
  shouldJoin,
  zoneState,
  CLOSE_PIXELS,
  OPEN_PIXELS,
} from '../src/engine/clusters';
import { makeWorld } from '../src/store/viewer';

const data = join(import.meta.dirname, '..', 'public', 'data');
const read = (path: string): unknown => JSON.parse(readFileSync(join(data, path), 'utf8'));
const demo: Topology = TopologySchema.parse(read('topologies/trace-demo.json'));
const plan: Topology = TopologySchema.parse(read('topologies/home-to-web.json'));

describe('zone clusters', () => {
  it('folds the computer and the home on the globe and the map, not on a floor plan', () => {
    const globe = makeWorld(demo, 'globe');
    expect(globe.clusters.map((c) => [c.zoneId, c.members.length, c.type, c.standIn])).toEqual([
      ['z-device', 6, 'client', 'd-browser'],
      ['z-home', 2, 'router', 'h-router'],
    ]);
    expect(makeWorld(demo, 'flat').clusters).toHaveLength(2);
    expect(makeWorld(plan, 'globe').clusters).toEqual([]);
  });

  it('stays folded until opened, and folds again only once small after growing', () => {
    expect(zoneState(OPEN_PIXELS * 10, false, false)).toBe('folded');
    // Just opened from far away: the flight in must not fold it again.
    expect(zoneState(10, true, false)).toBe('open');
    const between = (OPEN_PIXELS + CLOSE_PIXELS) / 2;
    expect(zoneState(between, true, true)).toBe('open');
    expect(zoneState(CLOSE_PIXELS - 1, true, true)).toBe('refold');
    expect(shouldJoin(100, true)).toBe(true);
    expect(shouldJoin(100, false)).toBe(false);
  });

  it('joins chains of close zones into one, keeping their order', () => {
    const near = new Set(['0-1', '1-2']);
    const folds = groupFolds(['a', 'b', 'c', 'd'], (i, j) => near.has(`${i}-${j}`));
    expect(folds.map((f) => f.key)).toEqual(['a+b+c', 'd']);
  });

  it('draws joined zones as one marker holding all their nodes', () => {
    const { clusters } = makeWorld(demo, 'globe');
    const [joined] = foldedClusters(clusters, [
      { key: 'z-device+z-home', zoneIds: ['z-device', 'z-home'] },
    ]);
    expect(joined?.label).toBe('노트북 내부 · 집');
    expect(joined?.members).toHaveLength(8);
    expect(joined?.standIn).toBe('d-browser');
    expect(joined?.openRadius).toBe(Math.min(...clusters.map((c) => c.radius)));
    expect(foldedNodes(joined ? [joined] : []).get('h-router')?.key).toBe('z-device+z-home');
  });
});
