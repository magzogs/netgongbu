import { Vector3 } from 'three';
import type { Globe, NodeType, Topology } from '@netgongbu/schema';
import { zonePlacer } from './zones';

/**
 * On the globe and the world map the parts of the computer and the home sit a few tens of
 * kilometres apart, far too close to tell apart from high above. As on a floor plan, where the
 * laptop and the home are one node each, such a zone is drawn as one node with the number of
 * nodes it holds, until the learner opens it (a double-click, or "자세히 보기"). An open zone
 * folds again when the camera goes far enough out that its nodes would pile up. Folded zones
 * that come close on screen (the computer and the home, from farther away) are drawn as one.
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
  /** The node that shape stands in for: picking the folded zone selects it. */
  standIn: string;
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
    const standIn = nodes.find((n) => n.type === type) ?? first;
    clusters.push({
      zoneId: zone.id,
      label: zone.label,
      members: nodes.map((n) => n.id),
      center,
      radius,
      type: type === 'browser' ? 'client' : type,
      standIn: standIn.id,
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
  /** The node picked when the fold is: the first zone's stand-in. */
  standIn: string;
  /** The smallest zone's radius: flying in until it is wide enough opens them all. */
  openRadius: number;
}

/**
 * An opened zone is drawn at least this many CSS pixels across once the camera has come close
 * (opening one flies in until it is a little wider); going out until it is less than the second
 * number folds it again. At the first size its nodes, drawn at most INSET_MARKER_MAX large, are
 * about one marker apart.
 */
export const OPEN_PIXELS = 170;
export const CLOSE_PIXELS = 135;
/** Folded zones whose middles are closer than this on screen join; they part again beyond the second. */
export const JOIN_PIXELS = 90;
export const PART_PIXELS = 120;

/**
 * What a zone is now, given its size on screen: folded (not opened by the learner), open, or
 * open but now so small that it folds again. `grown` says whether it has been drawn at least
 * OPEN_PIXELS wide since it was opened, so the flight in after opening does not fold it at once.
 */
export function zoneState(
  pixels: number,
  opened: boolean,
  grown: boolean,
): 'folded' | 'open' | 'refold' {
  if (!opened) return 'folded';
  return grown && pixels < CLOSE_PIXELS ? 'refold' : 'open';
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
        standIn: first.standIn,
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
