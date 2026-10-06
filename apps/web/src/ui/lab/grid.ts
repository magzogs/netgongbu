import type { Field } from '@magvirtualedu/protocols';

// Laying out a header as the 32-bit-wide diagrams of the RFCs: one row per 4 bytes, each field
// a cell spanning its bits, long fields folded so a 1 KB key does not take 300 rows.

export const ROW_BITS = 32;
/** Rows inside one field beyond which the middle rows fold into one. */
const FOLD_AFTER = 2;

export type Radix = 'hex' | 'bin';

/** An innermost field (a cell of the diagram) with the group it belongs to. */
export interface Leaf {
  field: Field;
  parent: Field | null;
}

/** A field's identity across renders (keys repeat, e.g. HPACK headers in different frames). */
export const fieldId = (f: Field): string => `${f.key}@${String(f.bitOffset)}`;

/** Innermost fields in bit order, each with its immediate group. */
export function leaves(fields: readonly Field[], parent: Field | null = null): Leaf[] {
  const out: Leaf[] = [];
  for (const f of fields) {
    if (f.children?.length) out.push(...leaves(f.children, f));
    else out.push({ field: f, parent });
  }
  return out.sort((a, b) => a.field.bitOffset - b.field.bitOffset);
}

/** Leaves of [from, from + length) bits, with uncovered bits as unnamed cells. */
export function cover(all: readonly Leaf[], from: number, length: number): Leaf[] {
  const out: Leaf[] = [];
  let at = from;
  const gap = (to: number): void => {
    out.push({
      field: {
        key: 'gap',
        name: '',
        value: '',
        meaning: '',
        source: 'derived',
        bitOffset: at,
        bitLength: to - at,
      },
      parent: null,
    });
  };
  for (const leaf of all) {
    const f = leaf.field;
    if (f.bitOffset < at || f.bitOffset >= from + length) continue;
    if (f.bitOffset > at) gap(f.bitOffset);
    out.push(leaf);
    at = f.bitOffset + f.bitLength;
  }
  if (at < from + length) gap(from + length);
  return out;
}

export interface Segment {
  leaf: Leaf;
  /** Column (bit within the row) and width in bits. */
  col: number;
  span: number;
  /** Absolute bits this cell shows. */
  from: number;
  length: number;
  /** The cell where the field starts (its name goes there). */
  first: boolean;
}

export interface Band {
  group: Field;
  col: number;
  span: number;
}

export type GridRow =
  | { kind: 'bits'; offset: number; segments: Segment[]; bands: Band[] }
  | { kind: 'fold'; leaf: Leaf; bytes: number };

/**
 * Rows of 32 bits over [from, from + length). Rows wholly inside one field fold into a single
 * "… n bytes" row when there are more than two of them, unless that field is in `expanded`.
 */
export function layoutGrid(
  cells: readonly Leaf[],
  from: number,
  length: number,
  expanded: ReadonlySet<string> = new Set(),
): GridRow[] {
  const rowCount = Math.ceil(length / ROW_BITS);
  const rows: Segment[][] = Array.from({ length: rowCount }, () => []);
  for (const leaf of cells) {
    const f = leaf.field;
    let at = f.bitOffset;
    const end = f.bitOffset + f.bitLength;
    while (at < end) {
      const rel = at - from;
      const row = Math.floor(rel / ROW_BITS);
      const col = rel % ROW_BITS;
      const span = Math.min(ROW_BITS - col, end - at);
      rows[row]?.push({ leaf, col, span, from: at, length: span, first: at === f.bitOffset });
      at += span;
    }
  }

  const out: GridRow[] = [];
  for (let r = 0; r < rowCount; r++) {
    const segments = rows[r] ?? [];
    const only = segments.length === 1 ? segments[0] : undefined;
    if (only?.span === ROW_BITS && !only.first && !expanded.has(fieldId(only.leaf.field))) {
      // Middle rows of one field: fold them unless there are only a few.
      let last = r;
      while (last + 1 < rowCount) {
        const next = rows[last + 1] ?? [];
        const n = next.length === 1 ? next[0] : undefined;
        const fieldEnd = only.leaf.field.bitOffset + only.leaf.field.bitLength;
        // Keep the field's own last row visible.
        if (n?.leaf !== only.leaf || n.span !== ROW_BITS || n.from + ROW_BITS >= fieldEnd) break;
        last += 1;
      }
      const count = last - r + 1;
      if (count > FOLD_AFTER) {
        out.push({ kind: 'fold', leaf: only.leaf, bytes: (count * ROW_BITS) / 8 });
        r = last;
        continue;
      }
    }
    out.push({ kind: 'bits', offset: (r * ROW_BITS) / 8, segments, bands: bandsOf(segments) });
  }
  return out;
}

/** Groups (e.g. IPv4 Flags over Reserved/DF/MF) drawn as a band over their cells in a row. */
function bandsOf(segments: readonly Segment[]): Band[] {
  const bands: Band[] = [];
  for (const s of segments) {
    const group = s.leaf.parent;
    if (!group || (group.children?.length ?? 0) < 2) continue;
    const prev = bands.at(-1);
    if (prev?.group === group && prev.col + prev.span === s.col) prev.span += s.span;
    else bands.push({ group, col: s.col, span: s.span });
  }
  return bands;
}

/** The bits [from, from + length) of `bytes` as 0s and 1s. */
export function bitString(bytes: Uint8Array, from: number, length: number): string {
  let out = '';
  for (let i = from; i < from + length; i++) {
    const byte = bytes[i >> 3] ?? 0;
    out += (byte >> (7 - (i & 7))) & 1 ? '1' : '0';
  }
  return out;
}

/**
 * The raw value of some bits: whole bytes as hex pairs ("c0 a8 00 0a") or bits split at byte
 * boundaries; a run of bits that is not whole bytes (IHL, a flag) as one number.
 */
export function formatBits(bytes: Uint8Array, from: number, length: number, radix: Radix): string {
  const bits = bitString(bytes, from, length);
  if (radix === 'bin') {
    let out = '';
    for (let i = 0; i < bits.length; i++) {
      if (i > 0 && (from + i) % 8 === 0) out += ' ';
      out += bits[i] ?? '';
    }
    return out;
  }
  if (from % 8 === 0 && length % 8 === 0) {
    const parts: string[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      parts.push(
        parseInt(bits.slice(i, i + 8), 2)
          .toString(16)
          .padStart(2, '0'),
      );
    }
    return parts.join(' ');
  }
  return BigInt(`0b${bits || '0'}`)
    .toString(16)
    .padStart(Math.ceil(length / 4), '0');
}

/** The raw value as a decimal number, for fields of up to 48 bits. */
export function decimalOf(bytes: Uint8Array, from: number, length: number): string | null {
  if (length > 48) return null;
  return String(parseInt(bitString(bytes, from, length) || '0', 2));
}

/**
 * A name short enough for a narrow cell: the part before " (" ("SYN (Synchronize)" → "SYN"),
 * or the initials of a longer name ("Don't Fragment" → "DF").
 */
export function shortName(name: string): string {
  const head = name.split(' (')[0] ?? name;
  if (head.length <= 4) return head;
  const words = head.split(/[\s/_-]+/).filter(Boolean);
  if (words.length === 1) return head.slice(0, 3);
  return words.map((w) => w[0]?.toUpperCase() ?? '').join('');
}
