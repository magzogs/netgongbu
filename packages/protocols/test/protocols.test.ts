import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenarioSchema, type Packet } from '@netgongbu/schema';
import {
  dissect,
  hpackEncode,
  hpackInteger,
  internetChecksum,
  crc32,
  type Dissection,
  type Field,
} from '../src';

const data = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'apps',
  'web',
  'public',
  'data',
  'scenarios',
);
const scenario = (name: string) =>
  ScenarioSchema.parse(JSON.parse(readFileSync(join(data, `${name}.json`), 'utf8')));
const example = scenario('visit-example-com');
const demo = scenario('trace-demo');

function packetOf(s: typeof example, beatId: string, hop = 0): Packet {
  const p = s.beats.find((b) => b.id === beatId)?.hops[hop]?.packet;
  if (!p) throw new Error(`no packet in ${beatId}`);
  return p;
}
function packetWhere(s: typeof demo, summary: string): Packet {
  const p = s.beats.flatMap((b) => b.hops).find((h) => h.packet.summary === summary)?.packet;
  if (!p) throw new Error(`no packet ${summary}`);
  return p;
}
const hexOf = (bytes: Uint8Array, from: number, to: number): string =>
  [...bytes.slice(from, to)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
const layer = (d: Dissection, kind: string) => d.layers.find((l) => l.kind === kind);
const field = (fields: Field[], key: string): Field | undefined =>
  fields.find((f) => f.key === key);

describe('building blocks', () => {
  it('computes the Internet checksum of the RFC 1071 style IPv4 example', () => {
    const header = Uint8Array.from([
      0x45, 0x00, 0x00, 0x73, 0x00, 0x00, 0x40, 0x00, 0x40, 0x11, 0x00, 0x00, 0xc0, 0xa8, 0x00,
      0x01, 0xc0, 0xa8, 0x00, 0xc7,
    ]);
    expect(internetChecksum(header)).toBe(0xb861);
  });

  it('encodes HPACK integers and the RFC 7541 C.3.1 request exactly', () => {
    expect(hpackInteger(10, 5, 0)).toEqual([10]);
    expect(hpackInteger(1337, 5, 0)).toEqual([31, 154, 10]);
    const { bytes, fields } = hpackEncode([
      { name: ':method', value: 'GET', source: 'typical' },
      { name: ':scheme', value: 'http', source: 'typical' },
      { name: ':path', value: '/', source: 'typical' },
      { name: ':authority', value: 'www.example.com', source: 'typical' },
    ]);
    expect(hexOf(bytes, 0, bytes.length)).toBe(
      '82 86 84 41 0f 77 77 77 2e 65 78 61 6d 70 6c 65 2e 63 6f 6d',
    );
    expect(fields[0]?.meaning).toContain('정적 테이블 2번');
  });
});

describe('frame trailer', () => {
  it('computes the CRC-32 check value and an FCS the receiver verifies', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const d = dissect(packetOf(example, 'dns-query-lan'))!;
    // The CRC over a frame that ends with its own FCS is the fixed residue 0x2144df1c.
    expect(crc32(d.frame)).toBe(0x2144df1c);
  });

  it('pads a short frame to the 64-byte minimum', () => {
    const arp = [...example.beats, ...demo.beats]
      .flatMap((b) => b.hops)
      .find((h) => h.packet.protocol === 'ARP')?.packet;
    const d = dissect(arp!)!;
    expect(d.frame.length).toBe(64);
    const eth = d.layers[0]!;
    expect(eth.trailer).toEqual({ start: 42, length: 22 });
    expect(eth.fields.map((f) => f.key).slice(-2)).toEqual(['padding', 'fcs']);
    expect(crc32(d.frame)).toBe(0x2144df1c);
  });
});

describe('dissect', () => {
  it('builds a DNS query frame: Ethernet + IPv4 + UDP + DNS with correct lengths and checksums', () => {
    const d = dissect(packetOf(example, 'dns-query-lan'));
    expect(d?.layers.map((l) => [l.kind, l.start, l.length])).toEqual([
      ['ethernet', 0, 14],
      ['ipv4', 14, 20],
      ['udp', 34, 8],
      ['dns', 42, 29],
    ]);
    const frame = d?.frame ?? new Uint8Array();
    // 71 bytes of headers and question, then the Ethernet FCS (no padding: already over 60).
    expect(frame.length).toBe(75);
    expect(d?.layers[0]?.trailer).toEqual({ start: 71, length: 4 });
    expect(hexOf(frame, 12, 14)).toBe('08 00');
    // IPv4: total length 57, protocol 17, and the header checksum verifies to zero.
    expect(hexOf(frame, 16, 18)).toBe('00 39');
    expect(frame[23]).toBe(17);
    expect(internetChecksum(frame.slice(14, 34))).toBe(0);
    // DNS: id 0x1a2b, standard query with RD, one question for example.com A IN.
    expect(hexOf(frame, 42, 54)).toBe('1a 2b 01 00 00 01 00 00 00 00 00 00');
    expect(hexOf(frame, 54, 71)).toBe('07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01');
    expect(d?.completed).toEqual([]);
  });

  it('answers with a compressed name pointer and the TTL', () => {
    const d = dissect(packetOf(example, 'dns-response-lan'));
    const dns = layer(d!, 'dns');
    const answer = field(dns?.fields ?? [], 'an0');
    expect(answer?.children?.map((c) => c.key)).toEqual([
      'an0-name',
      'an0-type',
      'an0-class',
      'an0-ttl',
      'an0-len',
      'an0-addr',
    ]);
    expect(field(answer?.children ?? [], 'an0-addr')?.value).toBe('93.184.216.34');
  });

  it('builds a measured SYN over Wi-Fi with options, real flags and a checksum that verifies', () => {
    const syn = demo.beats.find(
      (b) => b.hops[0]?.packet.summary === 'SYN' && b.hops[0].path.includes('d-nic'),
    )?.hops[0]?.packet;
    const d = dissect(syn!)!;
    expect(d.layers.map((l) => l.kind)).toEqual(['wifi', 'ipv4', 'tcp']);
    const tcp = layer(d, 'tcp')!;
    expect(tcp.length).toBe(44);
    const frame = d.frame;
    expect(frame[tcp.start + 13]).toBe(0x02);
    const ip = layer(d, 'ipv4')!;
    const pseudo = Uint8Array.from([...frame.slice(ip.start + 12, ip.start + 20), 0, 6, 0, 44]);
    expect(internetChecksum(pseudo, frame.slice(tcp.start, tcp.start + 44))).toBe(0);
    // Measured addresses keep their source; constants are marked as fixed by the standard.
    expect(field(ip.fields, 'src')).toMatchObject({ value: '192.168.4.23', source: 'observed' });
    expect(field(ip.fields, 'version')?.source).toBe('spec');
    expect(field(layer(d, 'wifi')!.fields, 'addr2')).toMatchObject({
      value: '02:00:5e:10:00:02',
      source: 'observed',
    });
  });

  it('keeps HTTP/2 inside TLS: ciphertext on the wire, HPACK plaintext shown separately', () => {
    const d = dissect(packetWhere(demo, 'GET /'))!;
    expect(d.layers.map((l) => l.kind)).toEqual(['ethernet', 'ipv4', 'tcp', 'tls']);
    expect(d.completed).toEqual(['Ethernet']);
    expect(d.inner?.layers.map((l) => l.kind)).toEqual(['http2']);
    const tls = layer(d, 'tls')!;
    // Record length = plaintext + content type byte + 16-byte tag.
    const recordLength = (d.frame[tls.start + 3]! << 8) | d.frame[tls.start + 4]!;
    expect(recordLength).toBe((d.inner?.bytes.length ?? 0) + 17);
    expect(d.frame.length).toBe(tls.start + 5 + recordLength + 4);
    const h2 = d.inner!.layers[0]!;
    const block = field(h2.fields, 'hpack');
    expect(block?.children?.[0]?.name).toBe(':method: GET');
    expect(d.inner!.bytes[3]).toBe(0x01);
  });

  it('writes HTTP/1.1 as text lines for a scenario without HTTP/2', () => {
    const d = dissect(packetOf(example, 'http-get'))!;
    expect(d.inner?.layers[0]?.kind).toBe('http1');
    const text = new TextDecoder().decode(d.inner!.bytes);
    expect(text.startsWith('GET / HTTP/1.1\r\n')).toBe(true);
    expect(text).toContain('host: example.com\r\n');
    expect(text.endsWith('\r\n\r\n')).toBe(true);
  });

  it('puts ARP straight into an Ethernet frame', () => {
    const d = dissect(packetOf(example, 'arp-request'))!;
    expect(d.layers.map((l) => l.kind)).toEqual(['ethernet', 'arp']);
    expect(hexOf(d.frame, 12, 14)).toBe('08 06');
    expect(hexOf(d.frame, 20, 22)).toBe('00 01');
  });

  it('builds a TLS 1.3 ClientHello with SNI and the measured key exchange group', () => {
    const d = dissect(packetWhere(demo, 'ClientHello'))!;
    const tls = layer(d, 'tls')!;
    expect(d.frame[tls.start]).toBe(22);
    const names = JSON.stringify(tls.fields);
    expect(names).toContain('server_name (SNI): example.org');
    expect(names).toContain('X25519MLKEM768');
    expect(tls.length).toBeGreaterThan(1300);
  });

  it('marks values of hand-written scenarios as typical, not measured', () => {
    const d = dissect(packetOf(example, 'dns-query-lan'))!;
    expect(field(layer(d, 'ipv4')!.fields, 'src')?.source).toBe('typical');
  });

  it('returns nothing for a call inside the computer', () => {
    const local = demo.beats
      .flatMap((b) => b.hops)
      .find((h) => h.packet.protocol === 'LOCAL')?.packet;
    expect(dissect(local!)).toBeNull();
  });

  it('keeps every field inside its layer and top-level fields from overlapping', () => {
    const packets = [...example.beats, ...demo.beats].flatMap((b) => b.hops.map((h) => h.packet));
    for (const packet of packets) {
      const d = dissect(packet);
      if (!d) continue;
      for (const l of [...d.layers, ...(d.inner?.layers ?? [])]) {
        let end = l.start * 8;
        const trailer = l.trailer ? l.trailer.start * 8 : Infinity;
        for (const f of l.fields) {
          expect(f.bitOffset, `${l.title} ${f.name}`).toBeGreaterThanOrEqual(end);
          end = f.bitOffset + f.bitLength;
          if (f.bitOffset < trailer) expect(end).toBeLessThanOrEqual((l.start + l.length) * 8);
          else
            expect(end).toBeLessThanOrEqual(
              ((l.trailer?.start ?? 0) + (l.trailer?.length ?? 0)) * 8,
            );
        }
      }
    }
  });
});
