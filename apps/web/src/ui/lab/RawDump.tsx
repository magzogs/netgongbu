import { memo, useMemo, type CSSProperties, type ReactElement } from 'react';
import type { DissectedLayer, Field } from '@netgongbu/protocols';
import type { Radix } from './grid';
import { LAYER_COLORS } from './theme';

export interface Range {
  from: number;
  to: number;
}

const PER_ROW: Record<Radix, number> = { hex: 16, bin: 8 };

/** Which layer each byte belongs to (header or trailer), for colouring. */
function ownersOf(layers: readonly DissectedLayer[], length: number): (DissectedLayer | null)[] {
  const out: (DissectedLayer | null)[] = Array.from({ length }, () => null);
  for (const l of layers) {
    for (let i = l.start; i < l.start + l.length && i < length; i++) out[i] = l;
    if (l.trailer) {
      for (let i = l.trailer.start; i < l.trailer.start + l.trailer.length && i < length; i++) {
        out[i] = l;
      }
    }
  }
  return out;
}

/** The deepest field covering each byte, so hovering a byte finds its field. */
function fieldsOf(layers: readonly DissectedLayer[], length: number): (Field | null)[] {
  const out: (Field | null)[] = Array.from({ length }, () => null);
  const visit = (f: Field): void => {
    const from = Math.floor(f.bitOffset / 8);
    const to = Math.ceil((f.bitOffset + f.bitLength) / 8);
    for (let i = from; i < to && i < length; i++) out[i] = f;
    f.children?.forEach(visit);
  };
  for (const l of layers) l.fields.forEach(visit);
  return out;
}

interface Props {
  bytes: Uint8Array;
  layers: readonly DissectedLayer[];
  radix: Radix;
  /** Bytes of the focused field. */
  highlight: Range | null;
  /** The selected layer's unit (header, what it carries, trailer); the rest is dimmed. */
  unit: Range | null;
  onHover: (f: Field | null) => void;
  /** A byte was clicked: open the layer it belongs to, with its field pinned. */
  onPick: (layer: DissectedLayer, f: Field | null) => void;
}

/** Every byte of the frame (or of the plaintext inside encryption) in hex or binary. */
export const RawDump = memo(function RawDump({
  bytes,
  layers,
  radix,
  highlight,
  unit,
  onHover,
  onPick,
}: Props): ReactElement {
  const owners = useMemo(() => ownersOf(layers, bytes.length), [layers, bytes.length]);
  const fields = useMemo(() => fieldsOf(layers, bytes.length), [layers, bytes.length]);
  const perRow = PER_ROW[radix];
  const rows = Math.ceil(bytes.length / perRow);
  const lit = (i: number): boolean =>
    highlight !== null && i >= highlight.from && i <= highlight.to;
  return (
    <div
      className={`hex hex--${radix}`}
      style={{ '--per-row': perRow } as CSSProperties}
      onMouseLeave={() => {
        onHover(null);
      }}
    >
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="hex__row">
          <span className="hex__offset">{(r * perRow).toString(16).padStart(4, '0')}</span>
          <span className="hex__bytes">
            {Array.from({ length: perRow }, (_, c) => {
              const i = r * perRow + c;
              if (i >= bytes.length) return <span key={c} className="hex__byte is-empty" />;
              const owner = owners[i];
              const outside = unit !== null && (i < unit.from || i > unit.to);
              const b = bytes[i] ?? 0;
              return (
                <span
                  key={c}
                  className={`hex__byte${lit(i) ? ' is-lit' : ''}${outside ? ' is-outside' : ''}`}
                  style={
                    { '--layer': owner ? LAYER_COLORS[owner.kind] : 'transparent' } as CSSProperties
                  }
                  onMouseEnter={() => {
                    onHover(fields[i] ?? null);
                  }}
                  onClick={() => {
                    if (owner) onPick(owner, fields[i] ?? null);
                  }}
                >
                  {radix === 'hex'
                    ? b.toString(16).padStart(2, '0')
                    : b.toString(2).padStart(8, '0')}
                </span>
              );
            })}
          </span>
          <span className="hex__ascii">
            {Array.from(bytes.slice(r * perRow, r * perRow + perRow), (b, c) => (
              <span key={c} className={lit(r * perRow + c) ? 'is-lit' : undefined}>
                {b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·'}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
});
