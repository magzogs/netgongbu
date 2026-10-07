import { PerspectiveCamera, Vector3, type Camera } from 'three';
import type { Globe, NetNode } from '@magvirtualedu/schema';
import { above } from '../engine/curves';
import type { World } from '../store/viewer';
import { NODE_HEIGHT } from './NodeShape';

/**
 * On the globe and the world map nodes are markers, like pins on a web map: about the same size
 * on screen at any zoom, but never larger than `max` times their full size. Their real places
 * (cities, tens of kilometres apart) separate as the camera comes closer, instead of the shapes
 * spilling over into the next country.
 */

/** Width of a node's footprint at scale 1, in world units. */
const NODE_FOOTPRINT = 1.5;
/** Width of a marker on screen, in CSS pixels. */
const NODE_PIXELS = 26;
/** A node with a real place: at most 0.45 × 1.5 ≈ 0.7 units (about 110 km on the globe). */
export const MARKER_MAX = 0.45;
/**
 * Parts of the computer and the home sit a few tens of kilometres apart: at most
 * 0.1 × 1.5 = 0.15 units (about 25 km), so they do not cover each other however far away.
 */
export const INSET_MARKER_MAX = 0.1;

/** World units one CSS pixel covers at `point`. */
export function worldPerPixel(point: Vector3, camera: Camera, viewportHeight: number): number {
  if (!(camera instanceof PerspectiveCamera)) return 0.05;
  const distance = camera.position.distanceTo(point);
  return (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);
}

/** Scale that makes something `size` units wide look `pixels` wide, at most `max`. */
export function screenScale(
  point: Vector3,
  camera: Camera,
  viewportHeight: number,
  size: number,
  pixels: number,
  max: number,
): number {
  return Math.min(max, (pixels * worldPerPixel(point, camera, viewportHeight)) / size);
}

/** The largest scale of a node in this world, or null when nodes keep their full size. */
export function markerMax(world: World | null, node: NetNode): number | null {
  if (!world?.markers) return null;
  return node.zone ? INSET_MARKER_MAX : MARKER_MAX;
}

export function nodeScale(
  base: Vector3,
  camera: Camera,
  viewportHeight: number,
  max: number,
): number {
  return screenScale(base, camera, viewportHeight, NODE_FOOTPRINT, NODE_PIXELS, max);
}

/** Room left between a node's top and its label. */
const LABEL_GAP = 0.35;

/**
 * Where a node's label and action bubbles sit: just above its shape. For a marker this follows
 * its current (zoom-dependent) size, so it is a function of the camera.
 */
export function nodeTopSource(
  node: NetNode,
  globe: Globe | undefined,
  max: number | null,
): Vector3 | ((camera: Camera, viewportHeight: number) => Vector3) {
  const height = NODE_HEIGHT[node.type] + LABEL_GAP;
  if (max === null) return above(node.pos, height, globe);
  const base = new Vector3(...node.pos);
  const up = above(node.pos, 1, globe).sub(base);
  const out = new Vector3();
  return (camera, viewportHeight) =>
    out.copy(base).addScaledVector(up, height * nodeScale(base, camera, viewportHeight, max));
}
