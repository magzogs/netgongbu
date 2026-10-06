import type { ByteSource, Field } from './model';

export interface FieldInfo {
  key: string;
  name: string;
  value: string;
  meaning: string;
  source: ByteSource;
  children?: Field[];
}

/**
 * Writes big-endian (network order) bits and remembers which field each run of bits belongs
 * to, with offsets relative to the start of this writer.
 */
export class BitWriter {
  private readonly out: number[] = [];
  private bits = 0;
  readonly fields: Field[] = [];

  /** Bits written so far. */
  get bitLength(): number {
    return this.bits;
  }

  get byteLength(): number {
    return Math.ceil(this.bits / 8);
  }

  private pushBit(bit: number): void {
    const byte = this.bits >> 3;
    if (byte >= this.out.length) this.out.push(0);
    if (bit) this.out[byte] = (this.out[byte] ?? 0) | (0x80 >> (this.bits & 7));
    this.bits += 1;
  }

  /** Writes `length` bits of `value`; records a field when `info` is given. */
  uint(value: number | bigint, length: number, info?: FieldInfo): Field | undefined {
    const start = this.bits;
    const v = BigInt(value);
    for (let i = length - 1; i >= 0; i--) this.pushBit(Number((v >> BigInt(i)) & 1n));
    return info ? this.record(info, start) : undefined;
  }

  bytes(data: Uint8Array, info?: FieldInfo): Field | undefined {
    const start = this.bits;
    for (const b of data) this.uint(b, 8);
    return info ? this.record(info, start) : undefined;
  }

  /** Records a field over bits written since `start` (for composite fields). */
  record(info: FieldInfo, start: number): Field {
    const field: Field = { ...info, bitOffset: start, bitLength: this.bits - start };
    this.fields.push(field);
    return field;
  }

  /** Turns the fields written since `start` into the children of one new field. */
  group(info: FieldInfo, start: number): Field {
    const inside = this.fields.filter((f) => f.bitOffset >= start);
    this.fields.splice(this.fields.length - inside.length, inside.length);
    return this.record({ ...info, children: inside }, start);
  }

  /** Overwrites bytes at an offset (lengths and checksums filled in after the fact). */
  patch8(byteOffset: number, value: number): void {
    this.out[byteOffset] = value & 0xff;
  }

  patch16(byteOffset: number, value: number): void {
    this.out[byteOffset] = (value >> 8) & 0xff;
    this.out[byteOffset + 1] = value & 0xff;
  }

  patch24(byteOffset: number, value: number): void {
    this.out[byteOffset] = (value >> 16) & 0xff;
    this.patch16(byteOffset + 1, value & 0xffff);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

/** Internet checksum (RFC 1071): one's complement of the one's complement sum of 16-bit words. */
export function internetChecksum(...parts: Uint8Array[]): number {
  let sum = 0;
  let carry: number | null = null;
  for (const part of parts) {
    for (const byte of part) {
      if (carry === null) {
        carry = byte;
      } else {
        sum += (carry << 8) | byte;
        carry = null;
      }
    }
  }
  if (carry !== null) sum += carry << 8;
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return ~sum & 0xffff;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

export function hex(value: number, digits: number): string {
  return `0x${value.toString(16).padStart(digits, '0')}`;
}

/** Deterministic stand-in bytes (random-looking, the same every time) for keys and ciphertext. */
export function filler(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}
