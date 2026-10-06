import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenarioSchema, type Packet } from '@magvirtualedu/schema';
import { dissect, type Dissection } from '@magvirtualedu/protocols';
import { cover, formatBits, layoutGrid, leaves, shortName, type GridRow } from '../src/ui/lab/grid';
import { payloadOf, stackRows } from '../src/ui/lab/stack';

const scenario = (name: string) =>
  ScenarioSchema.parse(
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', 'public', 'data', 'scenarios', `${name}.json`),
        'utf8',
      ),
    ),
  );
const packets = (name: string): Packet[] =>
  scenario(name).beats.flatMap((b) => b.hops.map((h) => h.packet));

function dissected(name: string, summary: string): Dissection {
  const packet = packets(name).find((p) => p.summary === summary);
  const d = packet ? dissect(packet) : null;
  if (!d) throw new Error(`no packet ${summary}`);
  return d;
}

const cellsOf = (rows: GridRow[]) =>
  rows.map((r) =>
    r.kind === 'bits'
      ? r.segments.map((s) => [s.leaf.field.name, s.col, s.span])
      : ['fold', r.leaf.field.name, r.bytes],
  );

describe('the 32-bit header diagram', () => {
  const d = dissected('trace-demo', 'GET /');
  const ip = d.layers.find((l) => l.kind === 'ipv4');

  it('draws IPv4 as in RFC 791: Version 0–3, IHL 4–7, flags under one band', () => {
    if (!ip) throw new Error('no IPv4');
    const rows = layoutGrid(
      cover(leaves(ip.fields), ip.start * 8, ip.length * 8),
      ip.start * 8,
      ip.length * 8,
    );
    expect(cellsOf(rows)).toEqual([
      [
        ['Version', 0, 4],
        ['IHL', 4, 4],
        ['DSCP', 8, 6],
        ['ECN', 14, 2],
        ['Total Length', 16, 16],
      ],
      [
        ['Identification', 0, 16],
        ['Reserved', 16, 1],
        ["Don't Fragment", 17, 1],
        ['More Fragments', 18, 1],
        ['Fragment Offset', 19, 13],
      ],
      [
        ['Time To Live', 0, 8],
        ['Protocol', 8, 8],
        ['Header Checksum', 16, 16],
      ],
      [['Source Address', 0, 32]],
      [['Destination Address', 0, 32]],
    ]);
    const second = rows[1];
    expect(
      second?.kind === 'bits' && second.bands.map((b) => [b.group.name, b.col, b.span]),
    ).toEqual([['Flags', 16, 3]]);
  });

  it('folds the middle of a long field and unfolds it on request', () => {
    const hello = dissected('trace-demo', 'ClientHello');
    const tls = hello.layers.find((l) => l.kind === 'tls');
    if (!tls) throw new Error('no TLS');
    const cells = cover(leaves(tls.fields), tls.start * 8, tls.length * 8);
    const folded = layoutGrid(cells, tls.start * 8, tls.length * 8);
    const biggest = Math.max(...folded.map((r) => (r.kind === 'fold' ? r.bytes : 0)));
    // The ML-KEM key share (over 1 KB) becomes one row.
    expect(biggest).toBeGreaterThan(1000);
    expect(folded.length).toBeLessThan(120);
    const all = new Set(cells.map((c) => `${c.field.key}@${String(c.field.bitOffset)}`));
    const open = layoutGrid(cells, tls.start * 8, tls.length * 8, all);
    expect(open.every((r) => r.kind === 'bits')).toBe(true);
    expect(open.length).toBe(Math.ceil(tls.length / 4));
  });

  it('shows raw bits in hex or binary', () => {
    const bytes = Uint8Array.from([0x45, 0x00, 0xc0, 0xa8]);
    expect(formatBits(bytes, 0, 4, 'hex')).toBe('4');
    expect(formatBits(bytes, 4, 4, 'bin')).toBe('0101');
    expect(formatBits(bytes, 16, 16, 'hex')).toBe('c0 a8');
    expect(formatBits(bytes, 12, 12, 'bin')).toBe('0000 11000000');
    expect(formatBits(bytes, 17, 1, 'hex')).toBe('1');
    expect(shortName("Don't Fragment")).toBe('DF');
    expect(shortName('SYN (Synchronize)')).toBe('SYN');
  });
});

describe('the encapsulation picture', () => {
  it('stacks HTTP/2 inside TLS inside TCP, IP and Ethernet, with the FCS and the physical layer', () => {
    const d = dissected('trace-demo', 'GET /');
    const { rows, columns } = stackRows(d);
    expect(rows.map((r) => r.level)).toEqual([
      '응용',
      '응용 (보안)',
      '전송',
      '네트워크',
      '데이터 링크',
      '물리',
    ]);
    expect(columns).toEqual({ headers: 4, trailers: 1 });
    const link = rows[4];
    expect(link?.bytes).toBe(d.frame.length);
    expect(link?.cells.flatMap((c) => c.boxes.map((b) => [b.label, b.own]))).toEqual([
      ['Ethernet', true],
      ['IP', false],
      ['TCP', false],
      ['TLS', false],
      ['🔒 암호문', false],
      ['FCS', true],
    ]);
    // Each layer's unit is its header plus everything it carries.
    const tcp = rows[2];
    const tcpLayer = d.layers[2];
    expect(tcp?.bytes).toBe(d.frame.length - (tcpLayer?.start ?? 0) - 4);
    expect(payloadOf(d, { part: 'wire', index: 2 }).length).toBe(
      d.frame.length - (tcpLayer?.start ?? 0) - (tcpLayer?.length ?? 0) - 4,
    );
  });
});
