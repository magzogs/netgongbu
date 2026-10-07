import { Box3, PerspectiveCamera, Vector3 } from 'three';
import type { Globe, Topology } from '@magvirtualedu/schema';
import { above } from './curves';
import { zonePlacer } from './zones';

/** Fractions of the screen covered by overlays: top/bottom of the height, left/right of the width. */
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Framing {
  target: Vector3;
  eye: Vector3;
  /**
   * camera-controls focal offset (world units) that centres the view in the uncovered area.
   * A positive x moves the camera right (the scene appears further left); a positive y moves it
   * down (the scene appears higher).
   */
  focalOffset: { x: number; y: number };
  /**
   * The centre of the uncovered area in normalised device coordinates (-1..1), from which the
   * focal offset is worked out again whenever the camera's distance changes.
   */
  shift: { x: number; y: number };
}

/** Keep a little air between the outermost points and the edge of the free area. */
const MARGIN = 0.9;
/** Portrait screens are taller than this aspect ratio (width / height). */
const PORTRAIT_ASPECT = 0.85;

/** Points that must be visible: every node from its base to just above its label, and zones. */
export function framingPoints(topology: Topology): Vector3[] {
  const points: Vector3[] = [];
  for (const node of topology.nodes) {
    points.push(new Vector3(...node.pos), above(node.pos, 2.5, topology.globe));
  }
  for (const zone of topology.zones ?? []) {
    const [minX, minZ, maxX, maxZ] = zone.bounds;
    const at = zonePlacer(zone, topology.globe);
    const corners: [number, number][] = [
      [minX, minZ],
      [maxX, minZ],
      [minX, maxZ],
      [maxX, maxZ],
    ];
    points.push(...corners.map(([x, z]) => at(x, z)));
  }
  return points;
}

/**
 * Where to look from. Landscape screens see the topology from the front; on portrait screens the
 * camera looks along the topology's longer horizontal axis so it runs up the screen.
 */
export function viewDirection(points: readonly Vector3[], aspect: number): Vector3 {
  if (aspect >= PORTRAIT_ASPECT) return new Vector3(0, 0.8, 1).normalize();
  const size = new Box3().setFromPoints([...points]).getSize(new Vector3());
  return size.x >= size.z
    ? new Vector3(-0.55, 1, 0.1).normalize()
    : new Vector3(0.1, 1, 0.55).normalize();
}

interface Band {
  centre: number;
  half: number;
}

/** The uncovered stretch of one screen axis in normalised device coordinates (-1..1). */
function band(low: number, high: number): Band {
  const from = -1 + 2 * low;
  const to = 1 - 2 * high;
  return { centre: (from + to) / 2, half: Math.max(0.2, (to - from) / 2) };
}

function fits(camera: PerspectiveCamera, points: readonly Vector3[], x: Band, y: Band): boolean {
  const ndc = new Vector3();
  return points.every((p) => {
    ndc.copy(p).project(camera);
    return ndc.z < 1 && Math.abs(ndc.x) <= x.half * MARGIN && Math.abs(ndc.y) <= y.half * MARGIN;
  });
}

/**
 * camera-controls focal offset that moves what is `halfHeight / tan(fov / 2)` from the camera to
 * the screen position `shift` (normalised device coordinates).
 */
export function focalOffsetFor(
  shift: { x: number; y: number },
  halfHeight: number,
  aspect: number,
): { x: number; y: number } {
  return { x: -shift.x * halfHeight * aspect, y: shift.y * halfHeight };
}

/**
 * Closest camera position, looking at the centre of the points, at which every point fits the
 * part of the screen the overlays leave free.
 */
export function frame(
  points: readonly Vector3[],
  fov: number,
  aspect: number,
  insets: Insets,
  /** Look from this direction instead of the default for the screen shape. */
  preferred?: Vector3,
): Framing {
  const target = new Box3().setFromPoints([...points]).getCenter(new Vector3());

  const direction = preferred ?? viewDirection(points, aspect);
  const x = band(insets.left, insets.right);
  const y = band(insets.bottom, insets.top);

  const camera = new PerspectiveCamera(fov, aspect, 0.1, 5000);
  const place = (distance: number): void => {
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  let lo = 1;
  let hi = 2000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    place(mid);
    if (fits(camera, points, x, y)) hi = mid;
    else lo = mid;
  }

  const halfHeightAtTarget = hi * Math.tan((fov * Math.PI) / 360);
  return {
    target,
    eye: target.clone().addScaledVector(direction, hi),
    focalOffset: focalOffsetFor({ x: x.centre, y: y.centre }, halfHeightAtTarget, aspect),
    shift: { x: x.centre, y: y.centre },
  };
}

/**
 * Framing for a globe. The camera orbits the globe's centre with north up (so a drag turns the
 * Earth east–west or north–south), looking straight down at the middle of the points, as far out
 * as needed for all of them to fit the free part of the screen. Points on the far side of the
 * Earth cannot be seen from any one side; following the packet carries the camera round.
 */
export function frameGlobe(
  points: readonly Vector3[],
  globe: Globe,
  north: Vector3,
  fov: number,
  aspect: number,
  insets: Insets,
): Framing {
  const target = new Vector3(...globe.center);
  const mean = new Vector3();
  for (const p of points) mean.add(p.clone().sub(target).normalize());
  // Points all round the globe have no middle: start above the learner (the top), north up.
  const direction =
    points.length > 0 && mean.length() / points.length > 0.3
      ? mean.normalize()
      : new Vector3(0, 1, 0.45).normalize();

  const x = band(insets.left, insets.right);
  const y = band(insets.bottom, insets.top);
  const camera = new PerspectiveCamera(fov, aspect, 0.1, 5000);
  camera.up.copy(north);
  let lo = globe.radius * 1.02;
  let hi = globe.radius * 12;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    camera.position.copy(target).addScaledVector(direction, mid);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    if (fits(camera, points, x, y)) hi = mid;
    else lo = mid;
  }
  // The offset moves what is on the surface (not the far centre) into the free area.
  const halfHeight = (hi - globe.radius) * Math.tan((fov * Math.PI) / 360);
  return {
    target,
    eye: target.clone().addScaledVector(direction, hi),
    focalOffset: focalOffsetFor({ x: x.centre, y: y.centre }, halfHeight, aspect),
    shift: { x: x.centre, y: y.centre },
  };
}

/**
 * Camera position over a globe that looks straight down at `point` from `altitude` above it (the
 * camera always looks at the globe's centre).
 */
export function globeEye(point: Vector3, globe: Globe, altitude: number): Vector3 {
  const center = new Vector3(...globe.center);
  const out = point.clone().sub(center);
  const length = out.length();
  if (length === 0) return center.add(new Vector3(0, globe.radius + altitude, 0));
  return center.addScaledVector(out.normalize(), length + altitude);
}
