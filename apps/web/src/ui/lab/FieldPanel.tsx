import type { ReactElement } from 'react';
import type { ByteSource, DissectedLayer, Field } from '@netgongbu/protocols';
import { tr } from '@netgongbu/schema';
import { decimalOf, formatBits, type Radix } from './grid';
import { SOURCE_HINTS, SOURCE_LABELS } from './theme';

/** Bytes of a long field shown in the detail card; the rest is summarised. */
const DETAIL_BYTES = { hex: 48, bin: 12 } as const;

export function SourceBadge({ source }: { source: ByteSource }): ReactElement {
  return (
    <span className={`source source--${source}`} title={SOURCE_HINTS[source]}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

function Raw({ field, bytes, radix }: { field: Field; bytes: Uint8Array; radix: Radix }) {
  const limit = DETAIL_BYTES[radix] * 8;
  const shown = Math.min(field.bitLength, limit);
  const text = formatBits(bytes, field.bitOffset, shown, radix);
  return (
    <dd className="fdetail__raw">
      {text}
      {shown < field.bitLength && (
        <span className="muted">
          {tr(
            ` … (전체 ${String(Math.ceil(field.bitLength / 8))}바이트)`,
            ` … (${String(Math.ceil(field.bitLength / 8))} bytes in total)`,
          )}
        </span>
      )}
    </dd>
  );
}

/** Where a field sits: bits from the start of its layer's header (or trailer). */
export function fieldPosition(field: Field, layer: DissectedLayer): string {
  const inTrailer = layer.trailer !== undefined && field.bitOffset >= layer.trailer.start * 8;
  const base = (inTrailer && layer.trailer ? layer.trailer.start : layer.start) * 8;
  const rel = field.bitOffset - base;
  const end = rel + field.bitLength - 1;
  const where = inTrailer ? tr('트레일러', 'trailer') : tr('헤더', 'header');
  const byte = Math.floor(rel / 8);
  const bit = rel % 8;
  const bits =
    field.bitLength % 8 === 0
      ? tr(`${String(field.bitLength / 8)}바이트`, `${String(field.bitLength / 8)} bytes`)
      : tr(`${String(field.bitLength)}비트`, `${String(field.bitLength)} bits`);
  return tr(
    `${where}의 비트 ${String(rel)}–${String(end)} (바이트 ${String(byte)}${bit ? `의 ${String(bit)}번째 비트부터` : ''}) · ${bits}`,
    `Bits ${String(rel)}–${String(end)} of the ${where} (byte ${String(byte)}${bit ? `, from bit ${String(bit)}` : ''}) · ${bits}`,
  );
}

interface DetailProps {
  field: Field | null;
  layer: DissectedLayer;
  bytes: Uint8Array;
  pinned: boolean;
  /** Ask the local LLM about the (pinned) field. */
  onAsk?: (field: Field) => void;
}

/**
 * One field in full: where it is, its raw bits both ways, what it means, where it came from.
 * The card keeps one height whatever it shows (it scrolls inside), so hovering never moves the
 * list below it.
 */
export function FieldDetail({ field, layer, bytes, pinned, onAsk }: DetailProps): ReactElement {
  if (!field) {
    return (
      <div className="fdetail fdetail--empty">
        <p>
          {tr(
            '구조도의 칸이나 아래 목록에 마우스를 올리면 그 필드가 몇 번째 비트부터 몇 비트인지, 실제 값과 뜻이 여기에 나옵니다. 누르면 고정되고, 고정한 필드는 AI에게 물어볼 수 있습니다.',
            'Hover over a cell in the diagram or the list below to see where that field starts, how many bits it takes, its actual value, and what it means. Click to pin it; you can ask the AI about a pinned field.',
          )}
        </p>
      </div>
    );
  }
  const decimal = decimalOf(bytes, field.bitOffset, field.bitLength);
  return (
    <div className="fdetail">
      <div className="fdetail__head">
        <strong>{field.name}</strong>
        <SourceBadge source={field.source} />
        {pinned && <span className="fdetail__pin">{tr('📌 고정됨', '📌 Pinned')}</span>}
        {pinned && onAsk && (
          <button
            type="button"
            className="text-button fdetail__ask"
            title={tr('AI에게 이 필드에 대해 묻습니다', 'Ask the AI about this field')}
            onClick={() => {
              onAsk(field);
            }}
          >
            {tr('AI에게 묻기', 'Ask AI')}
          </button>
        )}
      </div>
      <dl>
        <dt>{tr('위치', 'Position')}</dt>
        <dd>{fieldPosition(field, layer)}</dd>
        <dt>{tr('값', 'Value')}</dt>
        <dd>{field.value || '—'}</dd>
        <dt>{tr('16진수', 'Hex')}</dt>
        <Raw field={field} bytes={bytes} radix="hex" />
        <dt>{tr('2진수', 'Binary')}</dt>
        <Raw field={field} bytes={bytes} radix="bin" />
        {decimal !== null && field.bitLength > 1 && (
          <>
            <dt>{tr('10진수', 'Decimal')}</dt>
            <dd className="fdetail__raw">{decimal}</dd>
          </>
        )}
      </dl>
      <p className="fdetail__meaning">{field.meaning}</p>
      <p className="fdetail__source muted">{SOURCE_HINTS[field.source]}</p>
    </div>
  );
}

interface ListProps {
  fields: readonly Field[];
  focus: Field | null;
  depth?: number;
  onHover: (f: Field | null) => void;
  onPin: (f: Field) => void;
}

/**
 * Every field of the layer at a glance, groups with their parts indented. Hover ends when the
 * pointer leaves the whole list, not between two rows, so the detail card does not flash empty.
 */
export function FieldList({ fields, focus, depth = 0, onHover, onPin }: ListProps): ReactElement {
  return (
    <ul
      className={depth === 0 ? 'flist' : 'flist flist--nested'}
      onMouseLeave={
        depth === 0
          ? () => {
              onHover(null);
            }
          : undefined
      }
    >
      {fields.map((f) => (
        <li key={`${f.key}-${String(f.bitOffset)}`}>
          <button
            type="button"
            className={`flist__item${focus === f ? ' is-focused' : ''}`}
            title={f.meaning}
            onMouseEnter={() => {
              onHover(f);
            }}
            onClick={() => {
              onPin(f);
            }}
          >
            <span className="flist__name">{f.name}</span>
            <span className="flist__value">{f.value}</span>
            <SourceBadge source={f.source} />
          </button>
          {f.children && (
            <FieldList
              fields={f.children}
              focus={focus}
              depth={depth + 1}
              onHover={onHover}
              onPin={onPin}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
