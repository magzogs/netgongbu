import { QuadraticBezierCurve3, Vector3 } from 'three';
import type { Globe, NetLink, Topology, Vec3 } from '@magvirtualedu/schema';

/** Height above a node's base where links attach and packets travel. */
export const ANCHOR_HEIGHT = 0.5;

export interface LinkCurve {
  link: NetLink;
  /** Runs from link.a to link.b. */
  curve: QuadraticBezierCurve3;
  length: number;
}

/** Which way is up at a node: away from the globe's centre on a globe, else +y. */
export function upAt(pos: Vec3, globe?: Globe): Vector3 {
  if (!globe) return new Vector3(0, 1, 0);
  const v = new Vector3(...pos).sub(new Vector3(...globe.center));
  return v.lengthSq() > 0 ? v.normalize() : new Vector3(0, 1, 0);
}

/** A point `height` above a node's base, along its up. */
export function above(pos: Vec3, height: number, globe?: Globe): Vector3 {
  return new Vector3(...pos).addScaledVector(upAt(pos, globe), height);
}

export function anchorOf(pos: Vec3, globe?: Globe): Vector3 {
  return above(pos, ANCHOR_HEIGHT, globe);
}

/** A gentle arc between two nodes; longer links arc higher so crossings stay readable. */
export function arcBetween(from: Vector3, to: Vector3): QuadraticBezierCurve3 {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  mid.y += from.distanceTo(to) * 0.12 + 0.3;
  return new QuadraticBezierCurve3(from, mid, to);
}

/**
 * An arc over the globe between two places on it: the control point lies outward from the
 * centre, far enough that long (ocean-crossing) links clear the surface.
 */
export function arcOverGlobe(from: Vector3, to: Vector3, globe: Globe): QuadraticBezierCurve3 {
  const center = new Vector3(...globe.center);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const out = mid.clone().sub(center).normalize();
  const control = center.addScaledVector(out, globe.radius + from.distanceTo(to) * 0.35 + 0.5);
  return new QuadraticBezierCurve3(from, control, to);
}

export function buildLinkCurves(topology: Topology): Map<string, LinkCurve> {
  const nodes = new Map(topology.nodes.map((n) => [n.id, n]));
  const curves = new Map<string, LinkCurve>();
  for (const link of topology.links) {
    const a = nodes.get(link.a);
    const b = nodes.get(link.b);
    if (!a || !b) continue;
    // On a globe everything lies on its surface, so every link arcs over it.
    const globe = topology.globe;
    const curve = globe
      ? arcOverGlobe(anchorOf(a.pos, globe), anchorOf(b.pos, globe), globe)
      : arcBetween(anchorOf(a.pos), anchorOf(b.pos));
    curves.set(link.id, { link, curve, length: curve.getLength() });
  }
  return curves;
}
