import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  asnQueryName,
  interfaceKind,
  isCgnatIPv4,
  isNonPublic,
  lineSplitter,
  normalizeMac,
  originQueryName,
  parseArp,
  parseAsnTxt,
  parseHardwarePorts,
  parseIpNeigh,
  parseIpRouteDefault,
  parseOriginTxt,
  parseResolvConf,
  parseRouteGetDefault,
  parseScutilDns,
  parseTracerouteLine,
} from '../src';

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

describe('macOS', () => {
  it('reads the default route', () => {
    expect(parseRouteGetDefault(fixture('darwin-route-get-default.txt'))).toEqual({
      gateway: '192.168.4.1',
      interface: 'en0',
    });
    expect(parseRouteGetDefault('route: writing to routing socket: not in table')).toBeNull();
  });

  it('reads the gateway MAC for the right interface and pads its bytes', () => {
    expect(parseArp(fixture('darwin-arp.txt'), 'en0')).toBe('02:4c:a0:3d:05:0e');
    expect(parseArp('192.168.4.1 (192.168.4.1) -- no entry')).toBeNull();
  });

  it('tells Wi-Fi from Ethernet', () => {
    const ports = parseHardwarePorts(fixture('darwin-hardware-ports.txt'));
    expect(interfaceKind(ports.get('en0'))).toBe('ethernet');
    expect(interfaceKind(ports.get('en1'))).toBe('wifi');
    expect(interfaceKind(ports.get('bridge0'))).toBe('ethernet');
    expect(interfaceKind(ports.get('utun7'))).toBe('other');
  });

  it('keeps only general resolvers, not VPN search domains or scoped ones', () => {
    expect(parseScutilDns(fixture('darwin-scutil-dns.txt'))).toEqual(['192.168.4.1']);
  });
});

describe('Linux', () => {
  it('reads route, neighbour and resolv.conf', () => {
    expect(parseIpRouteDefault(fixture('linux-ip-route.txt'))).toEqual({
      gateway: '192.168.1.1',
      interface: 'wlp2s0',
    });
    expect(parseIpNeigh(fixture('linux-ip-neigh.txt'))).toBe('02:00:5e:aa:bb:cc');
    expect(parseResolvConf(fixture('linux-resolv.conf'))).toEqual(['127.0.0.53']);
  });
});

describe('traceroute', () => {
  it('parses answered, silent and annotated hops and skips the header', () => {
    const hops = fixture('traceroute-darwin.txt')
      .split('\n')
      .map(parseTracerouteLine)
      .filter((h) => h !== null);
    expect(hops).toHaveLength(11);
    expect(hops[0]).toEqual({ ttl: 1, ip: '192.168.4.1', rttMs: 0.962 });
    expect(hops[3]).toEqual({ ttl: 4, ip: null, rttMs: null });
    expect(hops[7]).toEqual({ ttl: 8, ip: '203.0.113.20', rttMs: 3.455 });
    expect(hops.at(-1)?.ip).toBe('172.66.147.243');
  });

  it('reassembles lines split across stdout chunks', () => {
    const lines: string[] = [];
    const feed = lineSplitter((l) => lines.push(l));
    feed(' 1  192.168.4.1  0.9');
    feed('62 ms\n 2  *\n 3');
    expect(lines).toEqual([' 1  192.168.4.1  0.962 ms', ' 2  *']);
  });
});

describe('Team Cymru ASN lookup', () => {
  it('builds query names and parses answers', () => {
    expect(originQueryName('104.20.23.154')).toBe('154.23.20.104.origin.asn.cymru.com');
    expect(asnQueryName(13335)).toBe('AS13335.asn.cymru.com');
    expect(parseOriginTxt('13335 | 104.20.0.0/14 | US | arin | 2014-03-28')).toEqual({
      asn: 13335,
      country: 'US',
    });
    expect(parseOriginTxt('4766 9318 | 1.2.0.0/16 | KR | apnic |')?.asn).toBe(4766);
    expect(parseAsnTxt('13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US')).toBe('CLOUDFLARENET');
  });
});

describe('addresses', () => {
  it('classifies private, CGNAT and public addresses', () => {
    expect(isNonPublic('192.168.4.1')).toBe(true);
    expect(isCgnatIPv4('100.112.0.1')).toBe(true);
    expect(isNonPublic('100.112.0.1')).toBe(true);
    expect(isNonPublic('100.128.0.1')).toBe(false);
    expect(isNonPublic('203.0.113.5')).toBe(false);
    expect(normalizeMac('7c:49:cf:3d:3:d')).toBe('7c:49:cf:3d:03:0d');
    expect(normalizeMac('not a mac')).toBeNull();
  });
});
