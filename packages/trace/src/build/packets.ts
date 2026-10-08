import type { FieldSource, Layer } from '@netgongbu/schema';

// Helpers for header layers whose every field says where its value comes from.

export type SourcedValue = readonly [value: string, source: FieldSource];

export const observed = (value: string): SourcedValue => [value, 'observed'];
export const derived = (value: string): SourcedValue => [value, 'derived'];
export const typical = (value: string): SourcedValue => [value, 'typical'];

/** A value that was measured when known, otherwise a usual stand-in. */
export function observedOr(value: string | null | undefined, fallback: string): SourcedValue {
  return value ? observed(value) : typical(fallback);
}

export function layer(name: string, fields: Record<string, SourcedValue>): Layer {
  const values: Record<string, string> = {};
  const sources: Record<string, FieldSource> = {};
  for (const [key, [value, source]] of Object.entries(fields)) {
    values[key] = value;
    sources[key] = source;
  }
  return { name, fields: values, sources };
}

export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return '알 수 없음';
  return value >= 100 ? `${String(Math.round(value))} ms` : `${value.toFixed(1)} ms`;
}

export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '알 수 없음';
  if (value < 1024) return `${String(value)} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}
