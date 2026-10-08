import { tr } from '@netgongbu/schema';
import { ascii, BitWriter } from '../bits';
import type { ByteSource, Field } from '../model';

/** HPACK static table (RFC 7541 Appendix A), index 1–61. */
export const STATIC_TABLE: readonly (readonly [string, string])[] = [
  [':authority', ''],
  [':method', 'GET'],
  [':method', 'POST'],
  [':path', '/'],
  [':path', '/index.html'],
  [':scheme', 'http'],
  [':scheme', 'https'],
  [':status', '200'],
  [':status', '204'],
  [':status', '206'],
  [':status', '304'],
  [':status', '400'],
  [':status', '404'],
  [':status', '500'],
  ['accept-charset', ''],
  ['accept-encoding', 'gzip, deflate'],
  ['accept-language', ''],
  ['accept-ranges', ''],
  ['accept', ''],
  ['access-control-allow-origin', ''],
  ['age', ''],
  ['allow', ''],
  ['authorization', ''],
  ['cache-control', ''],
  ['content-disposition', ''],
  ['content-encoding', ''],
  ['content-language', ''],
  ['content-length', ''],
  ['content-location', ''],
  ['content-range', ''],
  ['content-type', ''],
  ['cookie', ''],
  ['date', ''],
  ['etag', ''],
  ['expect', ''],
  ['expires', ''],
  ['from', ''],
  ['host', ''],
  ['if-match', ''],
  ['if-modified-since', ''],
  ['if-none-match', ''],
  ['if-range', ''],
  ['if-unmodified-since', ''],
  ['last-modified', ''],
  ['link', ''],
  ['location', ''],
  ['max-forwards', ''],
  ['proxy-authenticate', ''],
  ['proxy-authorization', ''],
  ['range', ''],
  ['referer', ''],
  ['refresh', ''],
  ['retry-after', ''],
  ['server', ''],
  ['set-cookie', ''],
  ['strict-transport-security', ''],
  ['transfer-encoding', ''],
  ['user-agent', ''],
  ['vary', ''],
  ['via', ''],
  ['www-authenticate', ''],
];

/** HPACK integer with an N-bit prefix (RFC 7541 §5.1), returned as bytes. */
export function hpackInteger(value: number, prefixBits: number, firstByteHigh: number): number[] {
  const max = (1 << prefixBits) - 1;
  if (value < max) return [firstByteHigh | value];
  const out = [firstByteHigh | max];
  let rest = value - max;
  while (rest >= 128) {
    out.push((rest % 128) + 128);
    rest = Math.floor(rest / 128);
  }
  out.push(rest);
  return out;
}

/** String literal without Huffman coding (H = 0): length with a 7-bit prefix, then the bytes. */
function hpackString(text: string): number[] {
  const bytes = [...ascii(text)];
  return [...hpackInteger(bytes.length, 7, 0x00), ...bytes];
}

export interface HeaderLine {
  name: string;
  value: string;
  source: ByteSource;
}

/**
 * Encodes a header list as HPACK (RFC 7541) with an empty dynamic table: a full match in the
 * static table becomes one byte; otherwise "literal with incremental indexing" using the
 * static table's name when it has one. Huffman coding is left out so the bytes stay readable.
 */
export function hpackEncode(headers: readonly HeaderLine[]): {
  bytes: Uint8Array;
  fields: Field[];
} {
  const w = new BitWriter();
  for (const h of headers) {
    const name = h.name.toLowerCase();
    const full = STATIC_TABLE.findIndex(([n, v]) => n === name && v === h.value);
    const named = STATIC_TABLE.findIndex(([n]) => n === name);
    let bytes: number[];
    let how: string;
    if (full >= 0) {
      bytes = hpackInteger(full + 1, 7, 0x80);
      how = tr(
        `정적 테이블 ${String(full + 1)}번을 그대로 가리킴 (1바이트)`,
        `Points straight to static table entry ${String(full + 1)} (1 byte)`,
      );
    } else if (named >= 0) {
      bytes = [...hpackInteger(named + 1, 6, 0x40), ...hpackString(h.value)];
      how = tr(
        `이름은 정적 테이블 ${String(named + 1)}번, 값은 글자 그대로 (동적 테이블에 추가)`,
        `Name from static table entry ${String(named + 1)}, value as literal text (added to the dynamic table)`,
      );
    } else {
      bytes = [0x40, ...hpackString(name), ...hpackString(h.value)];
      how = tr(
        '이름과 값 모두 글자 그대로 (동적 테이블에 추가)',
        'Name and value both as literal text (added to the dynamic table)',
      );
    }
    w.bytes(Uint8Array.from(bytes), {
      key: `h-${name}`,
      name: `${name}: ${h.value.length > 40 ? `${h.value.slice(0, 37)}…` : h.value}`,
      value: tr(`${String(bytes.length)}바이트`, `${String(bytes.length)} bytes`),
      meaning: how,
      source: h.source,
    });
  }
  return { bytes: w.toBytes(), fields: w.fields };
}
