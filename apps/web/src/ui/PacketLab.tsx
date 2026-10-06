import { memo, useMemo, useState, type ReactElement } from 'react';
import type { Hop } from '@magvirtualedu/schema';
import {
  dissect,
  type ByteSource,
  type DissectedLayer,
  type Field,
  type LayerKind,
} from '@magvirtualedu/protocols';
import { PROTOCOL_COLORS } from '../scene/theme';
import { useViewer } from '../store/viewer';

const LAYER_COLORS: Record<LayerKind, string> = {
  ethernet: '#94a3b8',
  wifi: '#7dd3fc',
  arp: '#fb923c',
  ipv4: '#3b82f6',
  icmp: '#fb923c',
  udp: '#22d3ee',
  tcp: '#60a5fa',
  quic: '#a3e635',
  dns: '#facc15',
  tls: '#c084fc',
  http1: '#4ade80',
  http2: '#4ade80',
};

const SOURCE_LABELS: Record<ByteSource, string> = {
  observed: '관측',
  derived: '계산',
  typical: '전형값',
  spec: '규격',
};

const SOURCE_HINTS: Record<ByteSource, string> = {
  observed: '이 컴퓨터에서 실제로 측정한 값',
  derived: '다른 값(길이, 체크섬 등)에서 계산한 값',
  typical: '실제 값을 볼 수 없어 넣은 일반적인 값',
  spec: '프로토콜 규격이 정한 고정값',
};

interface Range {
  from: number;
  to: number;
}

const byteRange = (f: Field): Range => ({
  from: Math.floor(f.bitOffset / 8),
  to: Math.ceil((f.bitOffset + f.bitLength) / 8) - 1,
});

function position(f: Field): string {
  const byte = Math.floor(f.bitOffset / 8);
  const bit = f.bitOffset % 8;
  return bit === 0 ? String(byte) : `${String(byte)}.${String(bit)}`;
}

function size(f: Field): string {
  return f.bitLength % 8 === 0 ? `${String(f.bitLength / 8)}B` : `${String(f.bitLength)}b`;
}

/** Which layer each byte belongs to, for colouring the hex dump. */
function layerOfByte(layers: readonly DissectedLayer[], length: number): (DissectedLayer | null)[] {
  const out: (DissectedLayer | null)[] = Array.from({ length }, () => null);
  for (const l of layers)
    for (let i = l.start; i < l.start + l.length && i < length; i++) out[i] = l;
  return out;
}

/** The deepest field covering each byte, so hovering a byte finds its field. */
function fieldOfByte(layers: readonly DissectedLayer[], length: number): (Field | null)[] {
  const out: (Field | null)[] = Array.from({ length }, () => null);
  const visit = (f: Field): void => {
    const r = byteRange(f);
    for (let i = r.from; i <= r.to && i < length; i++) out[i] = f;
    f.children?.forEach(visit);
  };
  for (const l of layers) l.fields.forEach(visit);
  return out;
}

interface FieldRowsProps {
  fields: readonly Field[];
  depth: number;
  hovered: Field | null;
  onHover: (f: Field | null) => void;
}

function FieldRows({ fields, depth, hovered, onHover }: FieldRowsProps): ReactElement {
  return (
    <>
      {fields.map((f) => (
        <div key={`${f.key}-${String(f.bitOffset)}`}>
          <div
            className={`lab-field${hovered === f ? ' is-hovered' : ''}`}
            style={{ paddingLeft: `${String(8 + depth * 16)}px` }}
            onMouseEnter={() => {
              onHover(f);
            }}
            onMouseLeave={() => {
              onHover(null);
            }}
          >
            <span className="lab-field__pos" title="바이트(.비트) 위치">
              {position(f)}
            </span>
            <span className="lab-field__size">{size(f)}</span>
            <span className="lab-field__name">{f.name}</span>
            <span className="lab-field__value">
              {f.value}
              <span
                className={`source source--${f.source === 'spec' ? 'derived' : f.source} lab-source--${f.source}`}
                title={SOURCE_HINTS[f.source]}
              >
                {SOURCE_LABELS[f.source]}
              </span>
            </span>
            <span className="lab-field__meaning">{f.meaning}</span>
          </div>
          {f.children && (
            <FieldRows fields={f.children} depth={depth + 1} hovered={hovered} onHover={onHover} />
          )}
        </div>
      ))}
    </>
  );
}

interface HexProps {
  bytes: Uint8Array;
  layers: readonly DissectedLayer[];
  highlight: Range | null;
  onHover: (f: Field | null) => void;
}

const HexDump = memo(function HexDump({
  bytes,
  layers,
  highlight,
  onHover,
}: HexProps): ReactElement {
  const owners = useMemo(() => layerOfByte(layers, bytes.length), [layers, bytes.length]);
  const fields = useMemo(() => fieldOfByte(layers, bytes.length), [layers, bytes.length]);
  const rows = Math.ceil(bytes.length / 16);
  return (
    <div
      className="hex"
      onMouseLeave={() => {
        onHover(null);
      }}
    >
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="hex__row">
          <span className="hex__offset">{(r * 16).toString(16).padStart(4, '0')}</span>
          <span className="hex__bytes">
            {Array.from({ length: 16 }, (_, c) => {
              const i = r * 16 + c;
              if (i >= bytes.length) return <span key={c} className="hex__byte is-empty" />;
              const lit = highlight !== null && i >= highlight.from && i <= highlight.to;
              const owner = owners[i];
              return (
                <span
                  key={c}
                  className={`hex__byte${lit ? ' is-lit' : ''}`}
                  style={{
                    ['--layer' as string]: owner ? LAYER_COLORS[owner.kind] : 'transparent',
                  }}
                  onMouseEnter={() => {
                    onHover(fields[i] ?? null);
                  }}
                >
                  {(bytes[i] ?? 0).toString(16).padStart(2, '0')}
                </span>
              );
            })}
          </span>
          <span className="hex__ascii">
            {Array.from(bytes.slice(r * 16, r * 16 + 16), (b, c) => {
              const i = r * 16 + c;
              const lit = highlight !== null && i >= highlight.from && i <= highlight.to;
              return (
                <span key={c} className={lit ? 'is-lit' : undefined}>
                  {b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·'}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
});

/** Frame size per layer as one bar: how much of the packet is headers and how much is content. */
function Overview({
  bytes,
  layers,
  inner,
}: {
  bytes: Uint8Array;
  layers: readonly DissectedLayer[];
  inner: number | null;
}): ReactElement {
  const headers = layers.reduce((n, l) => n + l.length, 0);
  const content = bytes.length - headers;
  return (
    <div className="lab-overview">
      <div className="lab-overview__bar">
        {layers.map((l) => (
          <span
            key={l.start}
            style={{ flexGrow: l.length, background: LAYER_COLORS[l.kind] }}
            title={`${l.title} ${String(l.length)}바이트`}
          >
            {l.length >= bytes.length * 0.08 ? l.title.split(' ')[0] : ''}
          </span>
        ))}
        {content > 0 && (
          <span
            className="lab-overview__content"
            style={{ flexGrow: content }}
            title={`내용 ${String(content)}바이트`}
          >
            {inner !== null ? '🔒 암호문' : '내용'}
          </span>
        )}
      </div>
      <p className="muted lab-overview__text">
        전체 {bytes.length}바이트 · 헤더 {headers}바이트 (
        {Math.round((headers / Math.max(bytes.length, 1)) * 100)}%)
        {content > 0 && ` · 내용 ${String(content)}바이트`}
        {inner !== null && ` · 암호화 전 내용 ${String(inner)}바이트`}
      </p>
    </div>
  );
}

/**
 * The packet anatomy view: every layer of the current packet as real bytes, field by field,
 * with where each value comes from.
 */
export function PacketLab(): ReactElement | null {
  const lab = useViewer((s) => s.packetLab);
  const hop = useViewer((s) =>
    lab ? s.timeline?.beats[lab.beatIndex]?.beat.hops[lab.hopIndex] : undefined,
  );
  if (!lab || !hop) return null;
  // Keyed by packet so the tab and hover state start fresh for each one.
  return <PacketLabView key={`${String(lab.beatIndex)}-${String(lab.hopIndex)}`} hop={hop} />;
}

function PacketLabView({ hop }: { hop: Hop }): ReactElement {
  const world = useViewer((s) => s.world);
  const close = useViewer((s) => s.openPacketLab);
  const [view, setView] = useState<'wire' | 'inner'>('wire');
  const [hovered, setHovered] = useState<Field | null>(null);
  const host = world?.index.nodes.get(hop.path.at(-1) ?? '')?.label;
  const dissection = useMemo(() => dissect(hop.packet, host ? { host } : {}), [hop, host]);

  const labelOf = (id: string): string => world?.index.nodes.get(id)?.label ?? id;
  const inner = view === 'inner' ? dissection?.inner : undefined;
  const layers = inner?.layers ?? dissection?.layers ?? [];
  const bytes = inner?.bytes ?? dissection?.frame ?? new Uint8Array();
  const highlight = hovered ? byteRange(hovered) : null;

  return (
    <section className="lab panel" role="dialog" aria-label="패킷 해부">
      <header className="lab__header">
        <span className="chip" style={{ borderColor: PROTOCOL_COLORS[hop.packet.protocol] }}>
          {hop.packet.protocol}
        </span>
        <h2 className="lab__title">{hop.packet.summary}</h2>
        <span className="muted lab__path">
          {labelOf(hop.path[0] ?? '')} → {labelOf(hop.path.at(-1) ?? '')}
        </span>
        <button
          type="button"
          className="text-button lab__close"
          onClick={() => {
            close(null);
          }}
        >
          닫기 (Esc)
        </button>
      </header>

      {!dissection ? (
        <div className="lab__empty">
          <p>
            이 단계의 메시지는 네트워크로 나가는 패킷이 아니라 <strong>한 컴퓨터 안의 호출</strong>
            (함수 호출이나 시스템 호출)입니다. 바이트로 된 헤더가 없어 해부할 수 없습니다.
          </p>
          <ul>
            {hop.packet.layers.flatMap((l) =>
              Object.entries(l.fields).map(([k, v]) => (
                <li key={`${l.name}-${k}`}>{`${l.name} · ${k}: ${v}`}</li>
              )),
            )}
          </ul>
        </div>
      ) : (
        <>
          <div className="lab__tabs">
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className="tab"
                aria-selected={view === 'wire'}
                onClick={() => {
                  setView('wire');
                }}
              >
                선로 위 ({dissection.frame.length}바이트)
              </button>
              {dissection.inner && (
                <button
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={view === 'inner'}
                  onClick={() => {
                    setView('inner');
                  }}
                >
                  🔒 암호화 전 내용 ({dissection.inner.bytes.length}바이트)
                </button>
              )}
            </div>
            {dissection.completed.length > 0 && (
              <span className="muted lab__completed">
                이 단계에 없던 {dissection.completed.join(', ')} 계층은 일반적인 값으로 채웠습니다.
              </span>
            )}
          </div>
          <Overview
            bytes={bytes}
            layers={layers}
            inner={view === 'wire' ? (dissection.inner?.bytes.length ?? null) : null}
          />
          <div className="lab__body">
            <div className="lab__fields">
              {layers.map((l) => (
                <section
                  key={`${l.kind}-${String(l.start)}`}
                  className="lab-layer"
                  style={{ ['--layer' as string]: LAYER_COLORS[l.kind] }}
                >
                  <header className="lab-layer__header">
                    <strong>{l.title}</strong>
                    <span className="muted">
                      {l.standard} · {l.start}–{l.start + l.length - 1} ({l.length}바이트)
                    </span>
                  </header>
                  {l.note && <p className="lab-layer__note">{l.note}</p>}
                  <FieldRows fields={l.fields} depth={0} hovered={hovered} onHover={setHovered} />
                </section>
              ))}
            </div>
            <HexDump bytes={bytes} layers={layers} highlight={highlight} onHover={setHovered} />
          </div>
        </>
      )}
    </section>
  );
}
