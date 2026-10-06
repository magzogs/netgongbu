import { Box3, PerspectiveCamera, Vector3 } from 'three';
import type { Globe, Topology } from '@magvirtualedu/schema';
import { anchorOf } from './curves';

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
}

/** Keep a little air between the outermost points and the edge of the free area. */
const MARGIN = 0.9;
/** Portrait screens are taller than this aspect ratio (width / height). */
const PORTRAIT_ASPECT = 0.85;

/** Points that must be visible: every node from its base to just above its label, and zones. */
export function framingPoints(topology: Topology): Vector3[] {
  const points: Vector3[] = [];
  for (const node of topology.nodes) {
    points.push(new Vector3(...node.pos), anchorOf(node.pos).setY(node.pos[1] + 2.5));
  }
  for (const zone of topology.zones ?? []) {
    const [minX, minZ, maxX, maxZ] = zone.bounds;
    const y = zone.elevation ?? 0;
    points.push(
      new Vector3(minX, y, minZ),
      new Vector3(maxX, y, minZ),
      new Vector3(minX, y, maxZ),
      new Vector3(maxX, y, maxZ),
    );
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
    focalOffset: {
      x: -x.centre * halfHeightAtTarget * aspect,
      y: y.centre * halfHeightAtTarget,
    },
  };
}

/**
 * Where to look at a globe from at first: high above the learner's place (on top), north up, so
 * the story starts with the computer, the home and the first routers in view. A route to the far
 * side of the world cannot be seen whole from any one side; following the packet carries the
 * camera round the globe (see globeFollowEye).
 */
export function globeDirection(topology: Topology): Vector3 | undefined {
  return topology.globe ? new Vector3(0, 1, 0.45).normalize() : undefined;
}

/**
 * Camera position for following a packet over a globe: above the point, out along the surface
 * normal with a little extra height, at `distance`. Points well above the surface (the computer
 * and home floating over the learner's place) are looked at from above the learner's place.
 */
export function globeFollowEye(point: Vector3, globe: Globe, distance: number): Vector3 {
  const center = new Vector3(...globe.center);
  const out = point.clone().sub(center);
  const aboveSurface = out.length() > globe.radius + 2;
  const normal = aboveSurface ? new Vector3(0, 1, 0.45) : out.normalize();
  const direction = normal
    .normalize()
    .add(new Vector3(0, 0.25, 0))
    .normalize();
  return point.clone().addScaledVector(direction, distance);
}
