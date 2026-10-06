import { QuadraticBezierCurve3, Vector3 } from 'three';
import type { NetLink, Topology, Vec3 } from '@magvirtualedu/schema';

/** Height above a node's base where links attach and packets travel. */
export const ANCHOR_HEIGHT = 0.5;

export interface LinkCurve {
  link: NetLink;
  /** Runs from link.a to link.b. */
  curve: QuadraticBezierCurve3;
  length: number;
}

export function anchorOf(pos: Vec3): Vector3 {
  return new Vector3(pos[0], pos[1] + ANCHOR_HEIGHT, pos[2]);
}

/** A gentle arc between two nodes; longer links arc higher so crossings stay readable. */
export function arcBetween(from: Vector3, to: Vector3): QuadraticBezierCurve3 {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  mid.y += from.distanceTo(to) * 0.12 + 0.3;
  return new QuadraticBezierCurve3(from, mid, to);
}

export function buildLinkCurves(topology: Topology): Map<string, LinkCurve> {
  const positions = new Map(topology.nodes.map((n) => [n.id, n.pos]));
  const curves = new Map<string, LinkCurve>();
  for (const link of topology.links) {
    const a = positions.get(link.a);
    const b = positions.get(link.b);
    if (!a || !b) continue;
    const curve = arcBetween(anchorOf(a), anchorOf(b));
    curves.set(link.id, { link, curve, length: curve.getLength() });
  }
  return curves;
}
