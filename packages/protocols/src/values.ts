import type { Layer } from '@magvirtualedu/schema';
import type { ByteSource } from './model';

/** A value the scenario gave for a header field, with where it came from. */
export interface Given {
  text: string;
  source: ByteSource;
}

/** Field lookup over a scenario layer, tolerant to the names hand-written scenarios use. */
export class Values {
  constructor(private readonly layer: Layer | undefined) {}

  get(...names: string[]): Given | undefined {
    if (!this.layer) return undefined;
    const entries = Object.entries(this.layer.fields);
    for (const name of names) {
      const found = entries.find(([k]) => k.toLowerCase() === name.toLowerCase());
      if (found) return { text: found[1], source: this.sourceOf(found[0]) };
    }
    return undefined;
  }

  /**
   * Only scenarios built from a measurement say where values come from; values in hand-written
   * or AI scenarios are illustrative, so they count as typical.
   */
  private sourceOf(key: string): ByteSource {
    return this.layer?.sources?.[key] ?? 'typical';
  }

  get all(): [string, Given][] {
    if (!this.layer) return [];
    return Object.entries(this.layer.fields).map(([k, v]) => [
      k,
      { text: v, source: this.sourceOf(k) },
    ]);
  }
}

export const IPV4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
export const MAC = /\b([0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5})\b/i;

/** First IPv4 address in a value ("192.168.0.10 (공유기 통과 후 …)" → 192.168.0.10). */
export function ipv4Of(given: Given | undefined): { ip: string; source: ByteSource } | null {
  const m = given ? IPV4.exec(given.text) : null;
  if (!m?.[1] || !given) return null;
  return m[1].split('.').every((o) => Number(o) <= 255) ? { ip: m[1], source: given.source } : null;
}

export function macOf(given: Given | undefined): { mac: string; source: ByteSource } | null {
  const m = given ? MAC.exec(given.text) : null;
  if (!m?.[1] || !given) return null;
  const mac = m[1]
    .split(':')
    .map((p) => p.padStart(2, '0'))
    .join(':')
    .toLowerCase();
  return { mac, source: given.source };
}

/**
 * A number from a value: the result after "=" ("64 − 9 = 55" → 55), else the first number
 * ("443", "40002 → 52012" → 40002). Ranges and words ("임시 포트 (49152~65535)") give null.
 */
export function numberOf(given: Given | undefined): { n: number; source: ByteSource } | null {
  if (!given) return null;
  const text = given.text;
  if (text.includes('~')) return null;
  const after = /=\s*(\d+)\s*$/.exec(text);
  const m = after ?? /^\s*(\d+)/.exec(text);
  return m?.[1] ? { n: Number(m[1]), source: given.source } : null;
}

export function ipBytes(ip: string): Uint8Array {
  return Uint8Array.from(ip.split('.').map(Number));
}

export function macBytes(mac: string): Uint8Array {
  return Uint8Array.from(mac.split(':').map((h) => parseInt(h, 16)));
}
