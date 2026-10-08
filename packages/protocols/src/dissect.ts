import type { Layer, Packet } from '@netgongbu/schema';
import { concat } from './bits';
import { dns } from './layers/dns';
import { http1, http2 } from './layers/http';
import { ethernet, wifi } from './layers/link';
import { arp, icmp, ipv4 } from './layers/network';
import { quic, tls } from './layers/tls';
import { tcp, udp } from './layers/transport';
import type { Encoded, EncodeContext, Encoder } from './layers/types';
import type { DissectedLayer, Dissection, Field, LayerKind } from './model';
import { ipv4Of, Values } from './values';

interface Slot {
  kind: LayerKind;
  layer: Layer | undefined;
}

/** Which protocol a scenario layer is, from the names scenarios use. LOCAL calls have none. */
function kindOf(layer: Layer): LayerKind | 'local' | null {
  const n = layer.name.toLowerCase();
  if (n.includes('802.11') || n.includes('wi-fi')) return 'wifi';
  if (n === 'ethernet' || n.startsWith('l2')) return 'ethernet';
  if (n === 'ip' || n === 'ipv4') return 'ipv4';
  if (n === 'arp') return 'arp';
  if (n.startsWith('icmp')) return 'icmp';
  if (n === 'tcp') return 'tcp';
  if (n === 'udp') return 'udp';
  if (n === 'quic') return 'quic';
  if (n === 'dns') return 'dns';
  if (n === 'tls') return 'tls';
  if (n === 'http') return 'http1';
  if (['함수 호출', '함수 결과', '시스템 호출', '조회'].includes(layer.name)) return 'local';
  return null;
}

const ORDER: Record<LayerKind, number> = {
  ethernet: 0,
  wifi: 0,
  arp: 1,
  ipv4: 1,
  icmp: 2,
  udp: 2,
  tcp: 2,
  quic: 3,
  tls: 4,
  dns: 5,
  http1: 5,
  http2: 5,
};

const ENCODERS: Record<LayerKind, Encoder> = {
  ethernet,
  wifi,
  arp: (v) => arp(v),
  ipv4,
  icmp: (v, p) => icmp(v, p),
  udp,
  tcp,
  quic: (v, p) => quic(v, p),
  dns,
  tls,
  http1,
  http2,
};

const LAYER_NAMES: Record<LayerKind, string> = {
  ethernet: 'Ethernet',
  wifi: '802.11',
  arp: 'ARP',
  ipv4: 'IPv4',
  icmp: 'ICMP',
  udp: 'UDP',
  tcp: 'TCP',
  quic: 'QUIC',
  dns: 'DNS',
  tls: 'TLS',
  http1: 'HTTP',
  http2: 'HTTP/2',
};

/** Whether HTTP here is HTTP/2 (binary frames) rather than HTTP/1.1 text. */
function speaksH2(packet: Packet): boolean {
  return packet.layers.some(
    (l) =>
      Object.keys(l.fields).some((k) => k.startsWith(':')) ||
      Object.values(l.fields).some((v) => /\bh2\b|HTTP\/2|HEADERS 프레임/.test(v)),
  );
}

/**
 * Builds the bytes of a scenario packet as it would cross the first link, layer by layer, and
 * describes every field. Returns null for calls inside one computer (no packet on a wire).
 */
export function dissect(packet: Packet, hint: { host?: string } = {}): Dissection | null {
  const given: Slot[] = [];
  for (const layer of packet.layers) {
    const kind = kindOf(layer);
    if (kind && kind !== 'local') given.push({ kind, layer });
  }
  // Calls inside one computer (getaddrinfo, connect) and unknown layers put nothing on a wire.
  if (given.length === 0) return null;

  const h2 = speaksH2(packet);
  for (const slot of given) if (slot.kind === 'http1' && h2) slot.kind = 'http2';
  const has = (k: LayerKind): boolean => given.some((s) => s.kind === k);
  const completed: string[] = [];
  const add = (kind: LayerKind): void => {
    given.push({ kind, layer: undefined });
    completed.push(LAYER_NAMES[kind]);
  };

  // A real packet has every layer below the ones the scenario showed.
  if (has('dns') && !has('udp') && !has('tcp')) add('udp');
  if ((has('tls') || has('http1') || has('http2')) && !has('tcp') && !has('quic')) add('tcp');
  if (has('quic') && !has('udp')) add('udp');
  if ((has('tcp') || has('udp') || has('icmp')) && !has('ipv4')) add('ipv4');
  if (!has('ethernet') && !has('wifi')) add('ethernet');
  given.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

  const ipLayer = new Values(given.find((s) => s.kind === 'ipv4')?.layer);
  const transport = given.find(
    (s) => s.kind === 'tcp' || s.kind === 'udp' || s.kind === 'icmp',
  )?.kind;
  const tlsLayer = new Values(given.find((s) => s.kind === 'tls')?.layer);
  const ctx: EncodeContext = {
    srcIp: ipv4Of(ipLayer.get('src'))?.ip ?? '192.168.0.10',
    dstIp: ipv4Of(ipLayer.get('dst'))?.ip ?? '93.184.216.34',
    ipProtocol: transport === 'udp' ? 17 : transport === 'icmp' ? 1 : 6,
    etherType: has('arp') ? 0x0806 : 0x0800,
    host: tlsLayer.get('SNI', 'sni')?.text ?? hint.host ?? null,
    http: has('quic') ? 'h3' : h2 ? 'h2' : 'http/1.1',
  };

  // Encode innermost first: lengths and checksums need what is inside.
  const encoded: Part[] = [];
  let payload: Uint8Array = new Uint8Array(0);
  let inner: { bytes: Uint8Array; parts: Part[] } | null = null;
  for (let i = given.length - 1; i >= 0; i--) {
    const slot = given[i];
    if (!slot) continue;
    const enc = ENCODERS[slot.kind](new Values(slot.layer), payload, ctx);
    const header = enc.header.toBytes();
    const trailer = enc.trailer?.toBytes() ?? new Uint8Array(0);
    if (enc.ciphertext) {
      // What was encoded so far is the plaintext inside; on the wire it is ciphertext.
      inner = { bytes: payload, parts: [...encoded] };
      encoded.length = 0;
      payload = enc.ciphertext;
    }
    const trailerAt = header.length + payload.length;
    payload = concat(header, payload, trailer);
    encoded.unshift({ ...enc, size: header.length, trailerAt, trailerSize: trailer.length });
  }

  return {
    frame: payload,
    layers: place(encoded, false),
    inner: inner ? { bytes: inner.bytes, layers: place(inner.parts, true) } : null,
    completed,
  };
}

/** An encoded layer with where its header ends and its trailer starts (relative to it). */
type Part = Encoded & { size: number; trailerAt: number; trailerSize: number };

function shifted(f: Field, bits: number): Field {
  return {
    ...f,
    bitOffset: f.bitOffset + bits,
    ...(f.children && { children: f.children.map((c) => shifted(c, bits)) }),
  };
}

/** Gives layers their byte ranges (outermost first) and makes field offsets absolute. */
function place(parts: readonly Part[], encrypted: boolean): DissectedLayer[] {
  let offset = 0;
  return parts.map((p) => {
    const start = offset;
    offset += p.size;
    const trailerStart = start + p.trailerAt;
    return {
      kind: p.kind,
      title: p.title,
      standard: p.standard,
      start,
      length: p.size,
      ...(p.trailerSize > 0 && { trailer: { start: trailerStart, length: p.trailerSize } }),
      fields: [
        ...p.header.fields.map((f) => shifted(f, start * 8)),
        ...(p.trailer?.fields ?? []).map((f) => shifted(f, trailerStart * 8)),
      ],
      encrypted,
      ...(p.note && { note: p.note }),
    };
  });
}
