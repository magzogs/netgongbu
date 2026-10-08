import { Vector3 } from 'three';
import { surfacePatch, type Globe, type Zone } from '@netgongbu/schema';

export type ZonePlacer = (x: number, z: number, height?: number) => Vector3;

/**
 * Points of a zone's floor from coordinates in its bounds, `height` above it: on the plane
 * y = elevation, or wrapped onto the globe around the zone's anchor.
 */
export function zonePlacer(zone: Zone, globe?: Globe): ZonePlacer {
  if (zone.anchor && globe) {
    const { place } = surfacePatch(globe, zone.anchor, zone.elevation ?? 0);
    return (x, z, height = 0) => new Vector3(...place(x, z, height));
  }
  const y = zone.elevation ?? 0;
  return (x, z, height = 0) => new Vector3(x, y + height, z);
}
