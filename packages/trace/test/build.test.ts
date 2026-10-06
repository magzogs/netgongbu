import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ScenarioSchema,
  TopologySchema,
  validateScenario,
  validateTopology,
  type Scenario,
  type Topology,
} from '@magvirtualedu/schema';
import { buildFromReport, TraceReportSchema, type TraceReport } from '../src';

function demo(): TraceReport {
  return TraceReportSchema.parse(
    JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'demo-report.json'), 'utf8')),
  );
}

function expectPlayable(topology: Topology, scenario: Scenario): void {
  expect(TopologySchema.parse(topology)).toEqual(topology);
  expect(ScenarioSchema.parse(scenario)).toEqual(scenario);
  expect(validateTopology(topology)).toEqual([]);
  expect(validateScenario(topology, scenario)).toEqual([]);
}

const allText = (s: Scenario): string => s.beats.map((b) => b.narration).join('\n');

describe('buildFromReport on a located trace', () => {
  const { topology, scenario } = buildFromReport(demo(), 'trace-demo');
  const node = (id: string) => topology.nodes.find((n) => n.id === id);

  it('builds a playable topology and scenario', () => {
    expectPlayable(topology, scenario);
    expect(scenario.question).toBe('example.org');
  });

  it('puts the internet on a globe turned to the learner, with the computer and home above', () => {
    expect(topology.globe?.focus).toEqual({ lat: 37.57, lon: 126.98 });
    expect(topology.zones?.map((z) => [z.id, z.elevation])).toEqual([
      ['z-device', 14],
      ['z-home', 7],
    ]);
    const center = topology.globe?.center ?? [0, 0, 0];
    for (const id of ['n-hop-2', 'n-hop-3', 'n-hop-4', 'n-hop-8', 'n-server']) {
      const p = node(id)?.pos ?? [0, 0, 0];
      expect(Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])).toBeCloseTo(40.3, 5);
    }
  });

  it('turns hops into nodes: the router is not repeated, silent hops stay, the target is the server', () => {
    const ids = topology.nodes.map((n) => n.id);
    expect(ids).not.toContain('n-hop-1');
    expect(ids).not.toContain('n-hop-10');
    expect(node('n-hop-4')?.label).toBe('응답 없음 #4');
    expect(node('n-hop-2')?.geo).toBeUndefined();
    expect(node('n-hop-6')).toMatchObject({
      label: 'DEMO-TRANSIT #6',
      hostname: 'ae-1.r01.tokyo.demo-transit.example',
      asn: { number: 64501, name: 'DEMO-TRANSIT' },
      rttMs: 35.2,
    });
    expect(node('n-server')).toMatchObject({ type: 'server', label: 'example.org', rttMs: 139.5 });
    expect(node('h-modem')?.source).toBe('typical');
  });

  it('keeps nodes in the same city apart', () => {
    const a = node('n-hop-3')?.pos ?? [0, 0, 0];
    const b = node('n-hop-5')?.pos ?? [0, 0, 0];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(1.7);
  });

  it('tells the story from Enter: HSTS, DNS via the router, routing and ARP, then the internet', () => {
    const text = allText(scenario);
    expect(text).toContain('HSTS');
    expect(text).toContain('DNS 서버 192.168.4.1');
    expect(text).toContain('18.2 ms');
    expect(text).toContain('기본 경로 → 게이트웨이 192.168.4.1');
    expect(text).toContain('DEMO-TRANSIT 망');
    expect(text).toMatch(/약 \d+ km/);
    expect(text).toContain('TLS 1.3');
    expect(text).toContain('HTTP/2');
    expect(text).toContain('추가로 요청');
  });

  it('marks every header value with where it came from', () => {
    for (const beat of scenario.beats) {
      for (const hop of beat.hops) {
        for (const layer of hop.packet.layers) {
          expect(Object.keys(layer.sources ?? {}).sort()).toEqual(Object.keys(layer.fields).sort());
        }
      }
    }
    const route = scenario.beats.find((b) => b.hops.some((h) => h.path.includes('d-route')));
    expect(route?.hops[0]?.packet.layers[0]).toMatchObject({
      fields: { 결과: 'default → 192.168.4.1 (en1)' },
      sources: { 결과: 'observed' },
    });
  });

  it('lowers the TTL by one for every router on the way to the server', () => {
    const arrival = scenario.beats.find((b) => b.narration.startsWith('마지막 구간'));
    const ip = arrival?.hops[0]?.packet.layers.find((l) => l.name === 'IPv4');
    // Home router + 8 internet routers (hops 2–9) before the server at hop 10.
    expect(ip?.fields.ttl).toBe('64 − 9 = 55');
    expect(ip?.sources?.ttl).toBe('derived');
  });

  it('shows the Wi-Fi frame with its three addresses', () => {
    const syn = scenario.beats.find((b) => b.hops[0]?.packet.summary === 'SYN');
    expect(syn?.hops[0]?.packet.layers[0]).toMatchObject({
      name: '802.11 (Wi-Fi)',
      fields: { '주소2 (보낸 쪽)': '02:00:5e:10:00:02', '주소3 (목적지)': '02:4c:a0:3d:05:0e' },
      sources: { '주소1 (AP)': 'typical', '주소2 (보낸 쪽)': 'observed' },
    });
  });
});

describe('buildFromReport in other situations', () => {
  it('lays the path out flat when no location is known', () => {
    const report = demo();
    report.origin = null;
    for (const hop of report.path.hops) hop.geo = null;
    const { topology, scenario } = buildFromReport(report, 'trace-flat');
    expectPlayable(topology, scenario);
    expect(topology.globe).toBeUndefined();
    expect(topology.zones?.map((z) => z.id)).toContain('z-internet');
  });

  it('goes straight to the request when the connection was reused', () => {
    const report = demo();
    const main = report.requests[1];
    if (main) main.connectionReused = true;
    const { topology, scenario } = buildFromReport(report, 'trace-reused');
    expectPlayable(topology, scenario);
    expect(allText(scenario)).toContain('이미 열려 있는 연결');
    expect(scenario.beats.some((b) => b.hops[0]?.packet.summary === 'SYN')).toBe(false);
  });

  it('works with a public DNS server and without traceroute hops', () => {
    const report = demo();
    report.local.dnsServers = ['8.8.8.8'];
    if (report.dns) report.dns.server = '8.8.8.8';
    report.path = { target: '192.0.2.10', hops: [], complete: false, error: 'traceroute 없음' };
    report.origin = null;
    const { topology, scenario } = buildFromReport(report, 'trace-nohops');
    expectPlayable(topology, scenario);
    expect(topology.nodes.find((n) => n.id === 'n-dns')?.label).toBe('DNS 8.8.8.8');
  });

  it('uses QUIC instead of TCP and TLS for HTTP/3', () => {
    const report = demo();
    const main = report.requests[1];
    if (main) main.protocol = 'h3';
    const { topology, scenario } = buildFromReport(report, 'trace-h3');
    expectPlayable(topology, scenario);
    const summaries = scenario.beats.flatMap((b) => b.hops.map((h) => h.packet.summary));
    expect(summaries).toContain('QUIC Initial');
    expect(summaries).not.toContain('SYN');
    expect(summaries).not.toContain('ClientHello');
  });

  it('does not trust a location the round-trip time makes impossible (anycast)', () => {
    const report = demo();
    const last = report.path.hops.at(-1);
    // A CDN address the database puts in New York answering within 3 ms of Seoul.
    if (last) {
      last.rttMs = 3;
      last.geo = { lat: 40.7, lon: -74, place: 'New York, US' };
    }
    const { topology, scenario } = buildFromReport(report, 'trace-anycast');
    expectPlayable(topology, scenario);
    const server = topology.nodes.find((n) => n.id === 'n-server');
    expect(server?.geo).toBeUndefined();
    expect(server?.description).toContain('애니캐스트');
    expect(server?.description).toContain('최대 약 300 km');
    expect(allText(scenario)).toContain('애니캐스트');
  });

  it('explains a page that did not load', () => {
    const report = demo();
    report.documentChain = [];
    const { scenario } = buildFromReport(report, 'trace-failed');
    expect(scenario.beats).toHaveLength(1);
    expect(scenario.title).toContain('실패');
  });
});
