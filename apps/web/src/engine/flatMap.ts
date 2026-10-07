import {
  positionToGeo,
  type Globe,
  type NetNode,
  type Topology,
  type Vec3,
  type Zone,
} from '@magvirtualedu/schema';
import { zonePlacer } from './zones';

const RAD = Math.PI / 180;

/**
 * A flat world map (equirectangular: longitude and latitude as x and z) standing in for a
 * topology's globe. It keeps the globe's scale (its radius in units per radian) and puts the
 * globe's focus at the origin, east towards +x and north towards -z, as seen from above on the
 * globe; longitudes wrap so the focus is in the middle of the map.
 */
export interface FlatMap {
  globe: Globe;
  /** 360° of longitude. */
  width: number;
  /** 180° of latitude. */
  height: number;
  /** z of the equator. */
  equatorZ: number;
}

export function flatMapOf(globe: Globe): FlatMap {
  const r = globe.radius;
  return {
    globe,
    width: 2 * Math.PI * r,
    height: Math.PI * r,
    equatorZ: r * globe.focus.lat * RAD,
  };
}

/** Longitude difference in -180..180. */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Where a place is on the map, `height` above it. */
export function projectGeo(map: FlatMap, lat: number, lon: number, height = 0): Vec3 {
  const { radius, focus } = map.globe;
  return [radius * wrapLon(lon - focus.lon) * RAD, height, -radius * (lat - focus.lat) * RAD];
}

/** A position on (or above) the globe moved to the same place on the map. */
export function flattenPosition(map: FlatMap, pos: Vec3): Vec3 {
  const { lat, lon, height } = positionToGeo(map.globe, pos);
  return projectGeo(map, lat, lon, height);
}

/** Samples along each side of a zone, enough to bound it once it is flattened. */
const EDGE_SAMPLES = 4;

/** A zone laid onto the globe becomes the box around its flattened outline. */
function flattenZone(map: FlatMap, zone: Zone): Zone {
  if (!zone.anchor) return zone;
  const at = zonePlacer(zone, map.globe);
  const [minX, minZ, maxX, maxZ] = zone.bounds;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const t = i / EDGE_SAMPLES;
    const x = minX + (maxX - minX) * t;
    const z = minZ + (maxZ - minZ) * t;
    for (const [px, pz] of [
      [x, minZ],
      [x, maxZ],
      [minX, z],
      [maxX, z],
    ] as const) {
      const p = flattenPosition(map, at(px, pz).toArray());
      xs.push(p[0]);
      zs.push(p[2]);
    }
  }
  const flat: Zone = {
    ...zone,
    bounds: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
    elevation: zone.elevation ?? 0,
  };
  delete flat.anchor;
  return flat;
}

/**
 * The same topology on a flat world map: every node and zone moved from the globe to the same
 * place on the map. Null when the topology has no globe.
 */
export function flattenTopology(source: Topology): { topology: Topology; map: FlatMap } | null {
  const { globe, ...rest } = source;
  if (!globe) return null;
  const map = flatMapOf(globe);
  const nodes: NetNode[] = source.nodes.map((n) => ({ ...n, pos: flattenPosition(map, n.pos) }));
  const topology: Topology = {
    ...rest,
    nodes,
    ...(source.zones && { zones: source.zones.map((z) => flattenZone(map, z)) }),
  };
  return { topology, map };
}
