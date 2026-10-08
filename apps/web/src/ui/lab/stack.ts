import type { DissectedLayer, Dissection, LayerKind } from '@netgongbu/protocols';

// The encapsulation picture: each layer's unit (message, segment, packet, frame) as its own
// header in front of everything the layer above handed down, application on top.

/** A layer of the dissection: on the wire, or inside encryption. */
export interface LayerRef {
  part: 'wire' | 'inner';
  index: number;
}

export const sameRef = (a: LayerRef | null, b: LayerRef | null): boolean =>
  a !== null && b !== null && a.part === b.part && a.index === b.index;

/** Where each protocol sits in the TCP/IP model, and what its unit is called. */
export const MODEL: Record<LayerKind, { level: string; unit: string; short: string }> = {
  ethernet: { level: '데이터 링크', unit: '프레임', short: 'Ethernet' },
  wifi: { level: '데이터 링크', unit: '프레임', short: '802.11' },
  arp: { level: '네트워크', unit: 'ARP 메시지', short: 'ARP' },
  ipv4: { level: '네트워크', unit: '패킷 (데이터그램)', short: 'IP' },
  icmp: { level: '네트워크', unit: 'ICMP 메시지', short: 'ICMP' },
  udp: { level: '전송', unit: '데이터그램', short: 'UDP' },
  tcp: { level: '전송', unit: '세그먼트', short: 'TCP' },
  quic: { level: '전송', unit: 'QUIC 패킷', short: 'QUIC' },
  tls: { level: '응용 (보안)', unit: 'TLS 레코드', short: 'TLS' },
  dns: { level: '응용', unit: 'DNS 메시지', short: 'DNS' },
  http1: { level: '응용', unit: 'HTTP 메시지', short: 'HTTP' },
  http2: { level: '응용', unit: 'HTTP/2 프레임', short: 'HTTP/2' },
};

export type BoxKind = LayerKind | 'data' | 'cipher' | 'preamble' | 'gap';

export interface StackBox {
  key: string;
  kind: BoxKind;
  label: string;
  /** Null where the size is not a byte count (the Wi-Fi PHY preamble is a time). */
  bytes: number | null;
  /** The row's own header or trailer (drawn solid); the rest is what it carries. */
  own: boolean;
}

/** Boxes in grid columns shared by all rows, so each header lines up with itself below. */
export interface StackCell {
  col: number;
  span: number;
  boxes: StackBox[];
}

export interface StackRow {
  /** Null for the physical layer, which adds signals rather than bytes. */
  ref: LayerRef | null;
  level: string;
  title: string;
  unit: string;
  cells: StackCell[];
  bytes: number;
}

export interface Stack {
  rows: StackRow[];
  /**
   * Column layout: the physical preamble, one column per wire header, the carried data, one
   * per wire trailer, the gap between frames.
   */
  columns: { headers: number; trailers: number };
}

const headerBox = (l: DissectedLayer, own: boolean): StackBox => ({
  key: `h-${l.kind}-${String(l.start)}`,
  kind: l.kind,
  label: MODEL[l.kind].short,
  bytes: l.length,
  own,
});

const trailerBox = (l: DissectedLayer, own: boolean): StackBox => ({
  key: `t-${l.kind}`,
  kind: l.kind,
  label: (l.trailer?.length ?? 0) > 4 ? '패딩 + FCS' : 'FCS',
  bytes: l.trailer?.length ?? 0,
  own,
});

const sizeOf = (layers: readonly DissectedLayer[]): number =>
  layers.reduce((n, l) => n + l.length + (l.trailer?.length ?? 0), 0);

const rowOf = (
  part: LayerRef['part'],
  index: number,
  layer: DissectedLayer,
  cells: StackCell[],
) => ({
  ref: { part, index },
  level: MODEL[layer.kind].level,
  title: layer.title,
  unit: MODEL[layer.kind].unit,
  cells,
  bytes: cells.flatMap((c) => c.boxes).reduce((n, b) => n + (b.bytes ?? 0), 0),
});

/** The encapsulation rows, application on top, then the physical layer at the bottom. */
export function stackRows(d: Dissection): Stack {
  const wire = d.layers;
  const n = wire.length;
  const withTrailer = wire.filter((l) => l.trailer);
  const center = 1 + n;
  const ifg = center + 1 + withTrailer.length;
  const rows: StackRow[] = [];

  // Inside encryption: all of it travels in the data column of the layers below.
  const inner = d.inner;
  if (inner) {
    const rest = inner.bytes.length - sizeOf(inner.layers);
    inner.layers.forEach((layer, index) => {
      const boxes = inner.layers.slice(index).map((l, k) => headerBox(l, k === 0));
      if (rest > 0)
        boxes.push({ key: 'data-inner', kind: 'data', label: '데이터', bytes: rest, own: false });
      rows.push(rowOf('inner', index, layer, [{ col: center, span: 1, boxes }]));
    });
    rows.reverse();
  }

  const rest = d.frame.length - sizeOf(wire);
  const restBox: StackBox | null =
    rest > 0
      ? inner
        ? { key: 'cipher', kind: 'cipher', label: '🔒 암호문', bytes: rest, own: false }
        : { key: 'data', kind: 'data', label: '데이터', bytes: rest, own: false }
      : null;
  const wireRows: StackRow[] = wire.map((layer, index) => {
    const cells: StackCell[] = [];
    for (let k = index; k < n; k++) {
      const l = wire[k];
      if (l) cells.push({ col: 1 + k, span: 1, boxes: [headerBox(l, k === index)] });
    }
    if (restBox) cells.push({ col: center, span: 1, boxes: [restBox] });
    // Trailers close from the inside out: the innermost one comes first.
    withTrailer.forEach((l, t) => {
      const k = wire.indexOf(l);
      if (k >= index) {
        cells.push({
          col: center + withTrailer.length - t,
          span: 1,
          boxes: [trailerBox(l, k === index)],
        });
      }
    });
    return rowOf('wire', index, layer, cells);
  });
  rows.push(...wireRows.reverse());

  const link = wire[0];
  if (link && (link.kind === 'ethernet' || link.kind === 'wifi')) {
    const ethernet = link.kind === 'ethernet';
    const cells: StackCell[] = [
      {
        col: 0,
        span: 1,
        boxes: [
          {
            key: 'preamble',
            kind: 'preamble',
            label: ethernet ? '프리앰블 + SFD' : 'PHY 프리앰블',
            bytes: ethernet ? 8 : null,
            own: true,
          },
        ],
      },
      {
        col: 1,
        span: ifg - 1,
        boxes: [
          { key: 'frame', kind: link.kind, label: '프레임', bytes: d.frame.length, own: false },
        ],
      },
    ];
    if (ethernet) {
      cells.push({
        col: ifg,
        span: 1,
        boxes: [{ key: 'ifg', kind: 'gap', label: '프레임 간격', bytes: 12, own: true }],
      });
    }
    rows.push({
      ref: null,
      level: '물리',
      title: ethernet ? '이더넷 PHY' : 'Wi-Fi PHY',
      unit: ethernet ? '비트 → 전기 신호' : '비트 → 전파',
      cells,
      bytes: d.frame.length + (ethernet ? 20 : 0),
    });
  }
  return { rows, columns: { headers: n, trailers: withTrailer.length } };
}

/** The layer a reference points at. */
export function layerAt(d: Dissection, ref: LayerRef | null): DissectedLayer | null {
  if (!ref) return null;
  const list = ref.part === 'wire' ? d.layers : (d.inner?.layers ?? []);
  return list[ref.index] ?? null;
}

/** The bytes a layer's offsets refer to: the frame, or the plaintext inside encryption. */
export function bytesOf(d: Dissection, ref: LayerRef | null): Uint8Array {
  return ref?.part === 'inner' ? (d.inner?.bytes ?? new Uint8Array()) : d.frame;
}

/** What a layer carries after its header, up to its trailer (or the end of its bytes). */
export function payloadOf(d: Dissection, ref: LayerRef): { start: number; length: number } {
  const layer = layerAt(d, ref);
  const bytes = bytesOf(d, ref);
  if (!layer) return { start: 0, length: 0 };
  const start = layer.start + layer.length;
  const outer = (ref.part === 'wire' ? d.layers : (d.inner?.layers ?? [])).slice(0, ref.index + 1);
  const trailers = outer.reduce((n, l) => n + (l.trailer?.length ?? 0), 0);
  return { start, length: Math.max(0, bytes.length - start - trailers) };
}
