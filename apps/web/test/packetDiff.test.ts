import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { indexTopology, ScenarioSchema, TopologySchema } from '@magvirtualedu/schema';
import { buildLinkCurves } from '../src/engine/curves';
import { changedFields, fieldKey, previousLeg } from '../src/engine/packetDiff';
import { buildTimeline } from '../src/engine/timeline';

const data = join(import.meta.dirname, '..', 'public', 'data');
const read = (path: string): unknown => JSON.parse(readFileSync(join(data, path), 'utf8'));
const topology = TopologySchema.parse(read('topologies/home-to-web.json'));
const scenario = ScenarioSchema.parse(read('scenarios/visit-example-com.json'));
const timeline = buildTimeline(
  { index: indexTopology(topology), curves: buildLinkCurves(topology) },
  scenario,
);
const indexOf = (id: string): number => scenario.beats.findIndex((b) => b.id === id);

describe('previousLeg', () => {
  it('finds the same DNS query on the LAN side of the home router', () => {
    const wan = indexOf('dns-query-wan');
    expect(previousLeg(timeline, wan, 0)?.path).toEqual(['laptop', 'r-home']);
  });

  it('follows the request the load balancer forwards, not the health check sent alongside', () => {
    const forward = indexOf('lb-forward');
    expect(previousLeg(timeline, forward, 0)?.packet.summary).toBe('GET /');
    expect(previousLeg(timeline, forward, 1)).toBeUndefined();
  });

  it('ignores a previous beat with another protocol or that ended elsewhere', () => {
    expect(previousLeg(timeline, indexOf('dns-query-lan'), 0)).toBeUndefined();
    expect(previousLeg(timeline, indexOf('tcp-syn'), 0)).toBeUndefined();
    expect(previousLeg(timeline, 0, 0)).toBeUndefined();
  });
});

describe('changedFields', () => {
  it('shows the MAC rewrite, NAT and TTL change at the home router', () => {
    const wan = indexOf('dns-query-wan');
    const before = previousLeg(timeline, wan, 0)!.packet.layers;
    const after = scenario.beats[wan]!.hops[0]!.packet.layers;
    const changes = changedFields(before, after);
    expect(Object.fromEntries(changes)).toEqual({
      [fieldKey('Ethernet', 'src')]: '3c:22:fb:10:00:10',
      [fieldKey('Ethernet', 'dst')]: '58:86:94:00:00:01',
      [fieldKey('IP', 'src')]: '192.168.0.10',
      [fieldKey('IP', 'ttl')]: '64',
      [fieldKey('UDP', 'srcPort')]: '52011',
    });
    expect(changes.has(fieldKey('IP', 'dst'))).toBe(false);
  });

  it('skips layers and fields that exist on only one side', () => {
    const changes = changedFields(
      [{ name: 'IP', fields: { src: 'a' } }],
      [
        { name: 'IP', fields: { src: 'a', ttl: '9' } },
        { name: 'TCP', fields: { flags: 'SYN' } },
      ],
    );
    expect(changes.size).toBe(0);
  });
});
