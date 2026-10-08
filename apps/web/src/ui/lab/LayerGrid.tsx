import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import type { DissectedLayer, Field } from '@netgongbu/protocols';
import {
  cover,
  fieldId,
  formatBits,
  layoutGrid,
  leaves,
  ROW_BITS,
  shortName,
  type GridRow,
  type Radix,
  type Segment,
} from './grid';
import { tr } from '@netgongbu/schema';
import { LAYER_COLORS } from './theme';

/** Characters of a name that fit per bit of cell width. */
const CHARS_PER_BIT = 2.4;

function cellName(name: string, span: number): string {
  if (span > 2 && name.length <= span * CHARS_PER_BIT) return name;
  const short = shortName(name);
  return short.length <= Math.max(span * CHARS_PER_BIT, 4) ? short : '';
}

interface CellProps {
  segment: Segment;
  row: number;
  bytes: Uint8Array;
  radix: Radix;
  focused: boolean;
  onHover: (f: Field | null) => void;
  onPin: (f: Field) => void;
}

function Cell({ segment, row, bytes, radix, focused, onHover, onPin }: CellProps): ReactElement {
  const f = segment.leaf.field;
  const gap = f.key === 'gap';
  // A field that runs on from the row above keeps its name, greyed (CSS shortens it to fit).
  const name = segment.first
    ? cellName(f.name, segment.span)
    : segment.span >= 16
      ? tr(`${f.name} (이어서)`, `${f.name} (cont.)`)
      : segment.span >= 6
        ? f.name
        : '';
  const classes = ['lcell'];
  if (focused) classes.push('is-focused');
  if (segment.span <= 2) classes.push('lcell--narrow');
  if (!segment.first) classes.push('lcell--cont');
  if (gap) classes.push('lcell--gap');
  return (
    <div
      className={classes.join(' ')}
      data-source={gap ? undefined : f.source}
      style={{
        gridColumn: `${String(segment.col + 1)} / span ${String(segment.span)}`,
        gridRow: row,
      }}
      title={gap ? undefined : `${f.name} = ${f.value}\n${f.meaning}`}
      onMouseEnter={() => {
        onHover(gap ? null : f);
      }}
      onClick={() => {
        if (!gap) onPin(f);
      }}
    >
      {name && <span className="lcell__name">{name}</span>}
      <span className="lcell__raw">{formatBits(bytes, segment.from, segment.length, radix)}</span>
      {segment.first && segment.span >= 16 && f.value && (
        <span className="lcell__value">{f.value}</span>
      )}
    </div>
  );
}

function Ruler(): ReactElement {
  return (
    <div className="lgrid__row lgrid__row--ruler" aria-hidden="true">
      <span className="lgrid__offset">{tr('바이트', 'Byte')}</span>
      <div className="lgrid__cells">
        {Array.from({ length: ROW_BITS }, (_, i) => (
          <span key={i} className={`lgrid__tick${i % 8 === 0 ? ' is-major' : ''}`}>
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

interface RowsProps {
  rows: GridRow[];
  bytes: Uint8Array;
  radix: Radix;
  focus: Field | null;
  base: number;
  onHover: (f: Field | null) => void;
  onPin: (f: Field) => void;
  onExpand: (id: string) => void;
}

function Rows({ rows, bytes, radix, focus, base, onHover, onPin, onExpand }: RowsProps) {
  return rows.map((row, i) => {
    if (row.kind === 'fold') {
      const f = row.leaf.field;
      return (
        <div key={`fold-${String(i)}`} className="lgrid__row">
          <span className="lgrid__offset">⋮</span>
          <button
            type="button"
            className={`lgrid__fold${focus === f ? ' is-focused' : ''}`}
            onMouseEnter={() => {
              onHover(f);
            }}
            onClick={() => {
              onExpand(fieldId(f));
            }}
          >
            {tr(
              `⋮ ${f.name} 이어서 ${String(row.bytes)}바이트 (${String(row.bytes / 4)}줄 접음 · 눌러서 펼치기)`,
              `⋮ ${f.name} continues for ${String(row.bytes)} bytes (${String(row.bytes / 4)} rows folded · click to expand)`,
            )}
          </button>
        </div>
      );
    }
    const banded = row.bands.length > 0;
    return (
      <div key={`r-${String(row.offset)}`} className="lgrid__row">
        <span className="lgrid__offset">{base + row.offset}</span>
        <div className="lgrid__cells">
          {row.bands.map((band) => (
            <div
              key={`${band.group.key}-${String(band.col)}`}
              className={`lgrid__band${focus === band.group ? ' is-focused' : ''}`}
              style={{ gridColumn: `${String(band.col + 1)} / span ${String(band.span)}` }}
              title={`${band.group.name} = ${band.group.value}\n${band.group.meaning}`}
              onMouseEnter={() => {
                onHover(band.group);
              }}
              onClick={() => {
                onPin(band.group);
              }}
            >
              {cellName(band.group.name, band.span)}
            </div>
          ))}
          {row.segments.map((segment) => (
            <Cell
              key={`${segment.leaf.field.key}-${String(segment.from)}`}
              segment={segment}
              row={banded ? 2 : 1}
              bytes={bytes}
              radix={radix}
              focused={
                focus !== null && (focus === segment.leaf.field || focus === segment.leaf.parent)
              }
              onHover={onHover}
              onPin={onPin}
            />
          ))}
        </div>
      </div>
    );
  });
}

interface Props {
  layer: DissectedLayer;
  bytes: Uint8Array;
  radix: Radix;
  focus: Field | null;
  onHover: (f: Field | null) => void;
  onPin: (f: Field) => void;
  /** What the layer carries after its header, and how to open it. */
  payload: { length: number; label: string; onOpen: (() => void) | null };
}

/**
 * A layer's header drawn like the diagrams in its standard: 32 bits a row, every field a cell
 * over its bits with the raw value in hex or binary, groups (flags) as bands above their bits.
 */
export function LayerGrid({ layer, bytes, radix, focus, onHover, onPin, payload }: Props) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const all = useMemo(() => leaves(layer.fields), [layer]);
  const header = useMemo(() => {
    const from = layer.start * 8;
    const length = layer.length * 8;
    return layoutGrid(cover(all, from, length), from, length, expanded);
  }, [all, layer, expanded]);
  const trailer = useMemo(() => {
    if (!layer.trailer) return null;
    const from = layer.trailer.start * 8;
    const length = layer.trailer.length * 8;
    return layoutGrid(cover(all, from, length), from, length, expanded);
  }, [all, layer, expanded]);
  const expand = (id: string): void => {
    setExpanded((prev) => new Set(prev).add(id));
  };
  const rows = { bytes, radix, focus, onHover, onPin, onExpand: expand };

  return (
    <div
      className="lgrid"
      style={{ '--layer': LAYER_COLORS[layer.kind] } as CSSProperties}
      onMouseLeave={() => {
        onHover(null);
      }}
    >
      <Ruler />
      <Rows rows={header} base={0} {...rows} />
      {payload.length > 0 && (
        <div className="lgrid__row">
          <span className="lgrid__offset">{layer.length}</span>
          <button
            type="button"
            className="lgrid__data"
            disabled={!payload.onOpen}
            onClick={payload.onOpen ?? undefined}
          >
            <strong>Data</strong>{' '}
            {tr(`${String(payload.length)}바이트`, `${String(payload.length)} bytes`)} —{' '}
            {payload.label}
            {payload.onOpen && (
              <span className="lgrid__open">{tr('구조 보기 ▸', 'View structure ▸')}</span>
            )}
          </button>
        </div>
      )}
      {trailer && layer.trailer && (
        <>
          <p className="lgrid__caption">
            {tr('트레일러: 데이터 뒤에 붙는 부분', 'Trailer: the part added after the data')}
          </p>
          <Rows rows={trailer} base={layer.trailer.start - layer.start} {...rows} />
        </>
      )}
    </div>
  );
}
