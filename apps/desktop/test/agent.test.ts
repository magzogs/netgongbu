import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { TraceEvent } from '@magvirtualedu/bridge';
import { validateScenario } from '@magvirtualedu/schema';
import { buildFromReport, type CapturedRequest, type TraceReport } from '@magvirtualedu/trace';
import { enrichHop, type HopLookups } from '../src/main/trace/enrich';
import { downloadUrl, geoFromRecord, monthOf } from '../src/main/trace/geo';
import { snapshotLocal, type LocalDeps } from '../src/main/trace/local';
import { runTrace, type TraceRunDeps } from '../src/main/trace/run';
import { runTraceroute } from '../src/main/trace/traceroute';

const fixtures = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'trace',
  'test',
  'fixtures',
);
const fixture = (name: string): string => readFileSync(join(fixtures, name), 'utf8');

const interfaces = () => ({
  en0: [
    {
      address: '192.168.4.23',
      netmask: '255.255.255.0',
      family: 'IPv4' as const,
      mac: '02:00:5e:10:00:01',
      internal: false,
      cidr: null,
    },
  ],
});

describe('snapshotLocal', () => {
  it('reads interface, gateway, route and DNS on macOS', async () => {
    const outputs: Record<string, string> = {
      '/sbin/route': fixture('darwin-route-get-default.txt'),
      '/usr/sbin/networksetup': fixture('darwin-hardware-ports.txt'),
      '/usr/sbin/scutil': fixture('darwin-scutil-dns.txt'),
      '/usr/sbin/arp': fixture('darwin-arp.txt'),
    };
    const deps: LocalDeps = {
      platform: 'darwin',
      exec: (file) => Promise.resolve(outputs[file] ?? null),
      interfaces,
      readFile: () => Promise.resolve(null),
      exists: () => false,
    };
    expect(await snapshotLocal(deps)).toEqual({
      platform: 'darwin',
      interface: {
        name: 'en0',
        kind: 'ethernet',
        ipv4: '192.168.4.23',
        mac: '02:00:5e:10:00:01',
        netmask: '255.255.255.0',
      },
      gateway: { ip: '192.168.4.1', mac: '02:4c:a0:3d:05:0e' },
      defaultRoute: 'default → 192.168.4.1 (en0)',
      dnsServers: ['192.168.4.1'],
    });
  });

  it('reads Linux tools and tells Wi-Fi from /sys', async () => {
    const deps: LocalDeps = {
      platform: 'linux',
      exec: (_file, args) =>
        Promise.resolve(
          args[0] === 'route' ? fixture('linux-ip-route.txt') : fixture('linux-ip-neigh.txt'),
        ),
      interfaces: () => ({}),
      readFile: () => Promise.resolve(fixture('linux-resolv.conf')),
      exists: (p) => p === '/sys/class/net/wlp2s0/wireless',
    };
    const local = await snapshotLocal(deps);
    expect(local.interface?.kind).toBe('wifi');
    expect(local.gateway).toEqual({ ip: '192.168.1.1', mac: '02:00:5e:aa:bb:cc' });
    expect(local.dnsServers).toEqual(['127.0.0.53']);
  });

  it('degrades to unknown when the tools are missing', async () => {
    const local = await snapshotLocal({
      platform: 'darwin',
      exec: () => Promise.resolve(null),
      interfaces: () => ({}),
      readFile: () => Promise.resolve(null),
      exists: () => false,
    });
    expect(local).toMatchObject({ interface: null, gateway: null, dnsServers: [] });
  });
});

/** A fake child process that prints `lines` (one per tick) and exits. */
function fakeSpawn(lines: string[], opts: { error?: NodeJS.ErrnoException } = {}) {
  const calls: string[][] = [];
  const spawn = ((file: string, args: string[]) => {
    calls.push([file, ...args]);
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      killed: boolean;
      exitCode: number | null;
      kill: () => boolean;
    };
    child.stdout = new PassThrough();
    child.killed = false;
    child.exitCode = null;
    child.kill = () => {
      child.killed = true;
      return true;
    };
    setImmediate(() => {
      if (opts.error) {
        child.emit('error', opts.error);
        return;
      }
      for (const line of lines) child.stdout.write(`${line}\n`);
      child.exitCode = 0;
      child.emit('close', 0);
    });
    return child;
  }) as unknown as NonNullable<Parameters<typeof runTraceroute>[2]['spawn']>;
  return { spawn, calls };
}

describe('runTraceroute', () => {
  it('reports hops as they come and knows when the target answered', async () => {
    const { spawn, calls } = fakeSpawn(fixture('traceroute-darwin.txt').split('\n'));
    const seen: (string | null)[] = [];
    const result = await runTraceroute('172.66.147.243', (h) => seen.push(h.ip), {
      platform: 'darwin',
      spawn,
    });
    expect(calls[0]).toEqual([
      '/usr/sbin/traceroute',
      '-n',
      '-q',
      '1',
      '-w',
      '1',
      '-m',
      '30',
      '172.66.147.243',
    ]);
    expect(seen).toHaveLength(11);
    expect(result).toMatchObject({ complete: true, error: null });
  });

  it('stops after a run of silent hops past the last answer', async () => {
    const lines = [
      ' 1  192.168.4.1  1.0 ms',
      ' 2  203.0.113.1  3.0 ms',
      ...[3, 4, 5, 6, 7, 8, 9].map((n) => ` ${String(n)}  *`),
    ];
    const { spawn } = fakeSpawn(lines);
    const result = await runTraceroute('198.51.100.9', () => undefined, {
      platform: 'linux',
      spawn,
      maxSilentRun: 3,
    });
    expect(result.lines).toHaveLength(5);
    expect(result.complete).toBe(false);
  });

  it('explains a missing traceroute', async () => {
    const error = Object.assign(new Error('spawn traceroute ENOENT'), { code: 'ENOENT' });
    const { spawn } = fakeSpawn([], { error });
    const result = await runTraceroute('198.51.100.9', () => undefined, {
      platform: 'linux',
      spawn,
    });
    expect(result.error).toContain('traceroute가 설치되어 있지 않습니다');
  });
});

const lookups: HopLookups = {
  reverse: (ip) => Promise.resolve(ip === '198.51.100.7' ? 'ae-1.r01.tokyo.example' : null),
  asn: (ip) =>
    Promise.resolve(
      ip.startsWith('198.51') ? { number: 64501, name: 'DEMO-TRANSIT', country: 'JP' } : null,
    ),
  geo: (ip) => (ip.startsWith('198.51') ? { lat: 35.68, lon: 139.69, place: 'Tokyo, JP' } : null),
};

describe('enrichHop', () => {
  it('names, owns and places public hops but not private or carrier-NAT ones', async () => {
    expect(await enrichHop({ ttl: 6, ip: '198.51.100.7', rttMs: 35 }, lookups)).toEqual({
      ttl: 6,
      ip: '198.51.100.7',
      rttMs: 35,
      hostname: 'ae-1.r01.tokyo.example',
      asn: { number: 64501, name: 'DEMO-TRANSIT', country: 'JP' },
      geo: { lat: 35.68, lon: 139.69, place: 'Tokyo, JP' },
    });
    expect((await enrichHop({ ttl: 2, ip: '100.112.0.1', rttMs: 3 }, lookups)).asn).toBeNull();
    expect((await enrichHop({ ttl: 4, ip: null, rttMs: null }, lookups)).hostname).toBeNull();
  });
});

describe('geo database helpers', () => {
  it('builds the monthly DB-IP URL and reads a City record', () => {
    expect(monthOf(new Date('2026-10-07T00:00:00Z'))).toBe('2026-10');
    expect(downloadUrl('2026-10')).toBe(
      'https://download.db-ip.com/free/dbip-city-lite-2026-10.mmdb.gz',
    );
    expect(
      geoFromRecord({
        location: { latitude: 37.5, longitude: 127, accuracy_radius: 50, time_zone: 'Asia/Seoul' },
        city: { names: { en: 'Seoul' }, geoname_id: 1 },
        country: { iso_code: 'KR', names: { en: 'South Korea' }, geoname_id: 2 },
      }),
    ).toEqual({ lat: 37.5, lon: 127, accuracyKm: 50, place: 'Seoul, KR' });
    expect(geoFromRecord(null)).toBeNull();
  });
});

describe('runTrace', () => {
  const doc: CapturedRequest = {
    id: 'R1',
    url: 'https://example.org/',
    method: 'GET',
    resourceType: 'Document',
    status: 200,
    statusText: '',
    protocol: 'h2',
    remoteIp: '198.51.100.9',
    remotePort: 443,
    connectionId: 1,
    connectionReused: false,
    fromCache: false,
    requestHeaders: {},
    responseHeaders: {},
    timing: { dnsMs: 10, connectMs: 30, tlsMs: 30, sendMs: 0.1, waitMs: 40, receiveMs: 1 },
    security: null,
    encodedBytes: 1000,
    redirectedTo: null,
  };

  it('captures, measures and traces in order, emitting each enriched hop live', async () => {
    const events: TraceEvent[] = [];
    const deps: TraceRunDeps = {
      capture: () =>
        Promise.resolve({
          requests: [doc],
          documentChain: ['R1'],
          userAgent: 'UA',
          title: 'Example',
          finalUrl: doc.url,
        }),
      local: () =>
        Promise.resolve({
          platform: 'darwin',
          interface: {
            name: 'en0',
            kind: 'wifi',
            ipv4: '192.168.4.23',
            mac: '02:00:5e:10:00:01',
            netmask: null,
          },
          gateway: { ip: '192.168.4.1', mac: '02:4c:a0:3d:05:0e' },
          defaultRoute: 'default → 192.168.4.1 (en0)',
          dnsServers: ['192.168.4.1'],
        }),
      dns: (host) =>
        Promise.resolve({
          host,
          cnames: [],
          addresses: [{ address: '198.51.100.9', family: 4, ttl: 60 }],
          server: '192.168.4.1',
        }),
      traceroute: (_target, onHop) => {
        onHop({ ttl: 1, ip: '192.168.4.1', rttMs: 1 });
        onHop({ ttl: 2, ip: '198.51.100.7', rttMs: 35 });
        onHop({ ttl: 3, ip: '198.51.100.9', rttMs: 36 });
        return Promise.resolve({ lines: [], complete: true, error: null });
      },
      lookups,
      geoSource: () => 'DB-IP',
      emit: (e) => events.push(e),
      now: () => new Date('2026-10-07T10:00:00Z'),
    };
    const report: TraceReport = await runTrace('example.org', deps, new AbortController().signal);

    const phases = events.flatMap((e) => (e.type === 'phase' ? [e.phase] : []));
    expect(phases).toEqual(['browser', 'local', 'dns', 'path', 'enrich']);
    expect(events[1]?.type).toBe('page');
    expect(events.filter((e) => e.type === 'hop')).toHaveLength(3);
    expect(report.path.hops.map((h) => h.ttl)).toEqual([1, 2, 3]);
    expect(report.origin).toEqual({ lat: 35.68, lon: 139.69, place: 'Tokyo, JP' });
    expect(report.geoSource).toBe('DB-IP');

    const { topology, scenario } = buildFromReport(report, 'trace-test');
    expect(validateScenario(topology, scenario)).toEqual([]);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = {
      capture: () =>
        Promise.resolve({
          requests: [],
          documentChain: [],
          userAgent: '',
          title: '',
          finalUrl: '',
        }),
      local: () =>
        Promise.resolve({
          platform: 'other',
          interface: null,
          gateway: null,
          defaultRoute: null,
          dnsServers: [],
        }),
      emit: () => undefined,
    } as unknown as TraceRunDeps;
    await expect(runTrace('x', deps, controller.signal)).rejects.toThrow('취소');
  });
});
