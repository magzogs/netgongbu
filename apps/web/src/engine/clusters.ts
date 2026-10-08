import { Vector3 } from 'three';
import type { Globe, NodeType, Topology } from '@netgongbu/schema';
import { zonePlacer } from './zones';

/**
 * On the globe and the world map the parts of the computer and the home sit a few tens of
 * kilometres apart, far too close to tell apart from high above. Like markers on a web map, such
 * a zone is drawn as one node with the number of nodes it holds while it is small on screen, and
 * opens into its nodes as the camera comes closer. Folded zones that come close on screen (the
 * computer and the home, from farther away) are drawn as one.
 */
export interface ZoneCluster {
  zoneId: string;
  label: string;
  /** Nodes in the zone, in the topology's order. */
  members: readonly string[];
  /** The middle of the zone, on its floor. */
  center: Vector3;
  /** Half the zone's diagonal, in world units. */
  radius: number;
  /** The shape that stands for the whole zone. */
  type: NodeType;
}

/** Which shape stands for a zone: the computer itself, else the home's router, else the first. */
const STAND_IN: readonly NodeType[] = ['client', 'browser', 'router', 'modem', 'switch'];

/** Zones with two or more nodes, in a world drawn with markers (globe or world map). */
export function zoneClusters(topology: Topology, globe: Globe | undefined): ZoneCluster[] {
  const clusters: ZoneCluster[] = [];
  for (const zone of topology.zones ?? []) {
    const nodes = topology.nodes.filter((n) => n.zone === zone.id);
    const first = nodes[0];
    if (!first || nodes.length < 2) continue;
    const [minX, minZ, maxX, maxZ] = zone.bounds;
    const at = zonePlacer(zone, globe);
    const center = at((minX + maxX) / 2, (minZ + maxZ) / 2);
    const radius = at(minX, minZ).distanceTo(at(maxX, maxZ)) / 2;
    const types = new Set(nodes.map((n) => n.type));
    const type = STAND_IN.find((t) => types.has(t)) ?? first.type;
    clusters.push({
      zoneId: zone.id,
      label: zone.label,
      members: nodes.map((n) => n.id),
      center,
      radius,
      type: type === 'browser' ? 'client' : type,
    });
  }
  return clusters;
}

/** Zones drawn as one marker: one zone, or several close together on screen. */
export interface Fold {
  /** The zone ids joined with '+'. */
  key: string;
  zoneIds: readonly string[];
}

/** A fold with what is needed to draw it. */
export interface FoldedCluster extends Fold {
  label: string;
  members: readonly string[];
  center: Vector3;
  type: NodeType;
  /** The smallest zone's radius: flying in until it is wide enough opens them all. */
  openRadius: number;
}

/**
 * A zone opens when it is this many CSS pixels across on screen, and closes again below the
 * second number (apart, so it does not flicker at the edge). At the first size its nodes, drawn
 * at most INSET_MARKER_MAX large, are about one marker apart.
 */
export const OPEN_PIXELS = 170;
export const CLOSE_PIXELS = 135;
/** Folded zones whose middles are closer than this on screen join; they part again beyond the second. */
export const JOIN_PIXELS = 90;
export const PART_PIXELS = 120;

/** Whether a zone should be folded, given its size on screen and whether it is now. */
export function shouldCollapse(pixels: number, collapsed: boolean): boolean {
  return collapsed ? pixels < OPEN_PIXELS : pixels < CLOSE_PIXELS;
}

/** Whether two folded zones should be drawn as one, given how far apart they are on screen. */
export function shouldJoin(pixelsApart: number, joined: boolean): boolean {
  return joined ? pixelsApart < PART_PIXELS : pixelsApart < JOIN_PIXELS;
}

/**
 * Groups the folded zones: `near(i, j)` says whether the i-th and j-th belong together, and
 * groups are closed under it (a chain of near zones is one group). Keeps the zones' order.
 */
export function groupFolds(
  zoneIds: readonly string[],
  near: (i: number, j: number) => boolean,
): Fold[] {
  const parent = zoneIds.map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] ?? i;
    return i;
  };
  for (let i = 0; i < zoneIds.length; i++) {
    for (let j = i + 1; j < zoneIds.length; j++) {
      if (near(i, j)) parent[root(j)] = root(i);
    }
  }
  const groups = new Map<number, string[]>();
  zoneIds.forEach((id, i) => {
    const r = root(i);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  });
  return [...groups.values()].map((ids) => ({ key: ids.join('+'), zoneIds: ids }));
}

/** Same folds, so the store only changes when the picture does. */
export function sameFolds(a: readonly Fold[], b: readonly Fold[]): boolean {
  return a.length === b.length && a.every((f, i) => f.key === b[i]?.key);
}

/** The folds with their names, nodes, places and stand-in shapes. */
export function foldedClusters(
  clusters: readonly ZoneCluster[],
  folds: readonly Fold[],
): FoldedCluster[] {
  const byZone = new Map(clusters.map((c) => [c.zoneId, c]));
  return folds.flatMap((fold) => {
    const parts = fold.zoneIds.flatMap((id) => byZone.get(id) ?? []);
    const first = parts[0];
    if (!first) return [];
    const center = new Vector3();
    for (const p of parts) center.add(p.center);
    center.divideScalar(parts.length);
    return [
      {
        ...fold,
        label: parts.map((p) => p.label).join(' · '),
        members: parts.flatMap((p) => p.members),
        center,
        type: first.type,
        openRadius: Math.min(...parts.map((p) => p.radius)),
      },
    ];
  });
}

/** Map from node id to the folded cluster it is drawn in. */
export function foldedNodes(folded: readonly FoldedCluster[]): Map<string, FoldedCluster> {
  const out = new Map<string, FoldedCluster>();
  for (const f of folded) for (const id of f.members) out.set(id, f);
  return out;
}
