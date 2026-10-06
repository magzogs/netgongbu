import type { Hop, Layer } from '@magvirtualedu/schema';
import type { Timeline } from './timeline';

/**
 * The same packet one step earlier: a hop in the previous beat with the same protocol and summary
 * that ended where this hop starts. That is how a hop split at a router (MAC rewrite, NAT) is
 * told apart from an unrelated packet leaving the same node, such as a health check.
 */
export function previousLeg(
  timeline: Timeline,
  beatIndex: number,
  hopIndex: number,
): Hop | undefined {
  const hop = timeline.beats[beatIndex]?.beat.hops[hopIndex];
  const before = timeline.beats[beatIndex - 1]?.beat.hops;
  if (!hop || !before) return undefined;
  return before.find(
    (h) =>
      h.packet.protocol === hop.packet.protocol &&
      h.packet.summary === hop.packet.summary &&
      h.path.at(-1) === hop.path[0],
  );
}

/** `Layer.field` → the value it had before, for every field whose value changed. */
export type FieldChanges = ReadonlyMap<string, string>;

export function fieldKey(layer: string, field: string): string {
  return `${layer}.${field}`;
}

/** Fields present in both versions of a layer whose values differ. */
export function changedFields(before: readonly Layer[], after: readonly Layer[]): FieldChanges {
  const changes = new Map<string, string>();
  for (const layer of after) {
    const old = before.find((l) => l.name === layer.name);
    if (!old) continue;
    for (const [field, value] of Object.entries(layer.fields)) {
      const was = old.fields[field];
      if (was !== undefined && was !== value) changes.set(fieldKey(layer.name, field), was);
    }
  }
  return changes;
}
