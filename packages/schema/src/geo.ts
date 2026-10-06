import type { Globe, Vec3 } from './topology';

// Placing latitude/longitude on the globe of a topology. Shared by the trace builder (node
// positions) and the viewer (country borders), so both use exactly the same transform.

type V = [number, number, number];

const RAD = Math.PI / 180;

function unit(lat: number, lon: number): V {
  const la = lat * RAD;
  const lo = lon * RAD;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

function cross(a: V, b: V): V {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: V, b: V): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(a: V): V {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Rodrigues rotation of v around unit axis k by angle a. */
function rotate(v: V, k: V, a: number): V {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kxv = cross(k, v);
  const kdv = dot(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ];
}

export interface GlobeTransform {
  /** Unit direction from the globe centre, after turning `focus` to the top (+y, north to -z). */
  direction: (lat: number, lon: number) => V;
}

/** Turns the focus point to +y and the local north at the focus to -z (up on screen). */
export function globeTransform(focus: { lat: number; lon: number }): GlobeTransform {
  const up: V = [0, 1, 0];
  const f = unit(focus.lat, focus.lon);
  const axisRaw = cross(f, up);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(f, up))));
  const axis: V = Math.hypot(...axisRaw) < 1e-9 ? [1, 0, 0] : normalize(axisRaw);
  const first = (v: V): V => (angle < 1e-9 ? v : rotate(v, axis, angle));

  // Where local north ends up after the first rotation, projected on the horizontal plane.
  const northward = first(unit(Math.min(focus.lat + 1, 89.999), focus.lon));
  const heading = Math.atan2(northward[0], -northward[2]);
  const spin = (v: V): V => rotate(v, up, heading);

  return { direction: (lat, lon) => spin(first(unit(lat, lon))) };
}

/** Position of a lat/lon on the globe surface, `lift` units above it. */
export function geoToPosition(globe: Globe, lat: number, lon: number, lift = 0): Vec3 {
  const d = globeTransform(globe.focus).direction(lat, lon);
  const r = globe.radius + lift;
  return [globe.center[0] + d[0] * r, globe.center[1] + d[1] * r, globe.center[2] + d[2] * r];
}

/**
 * A small map laid onto the globe around a place: `place(x, z)` takes x east and z south of it
 * (in globe units, as on a flat floor) and wraps the point onto the surface, `lift` above it.
 * Used for things with no real location of their own, such as the inside of the computer.
 */
export function surfacePatch(
  globe: Globe,
  anchor: { lat: number; lon: number },
  lift = 0,
): { place: (x: number, z: number, height?: number) => Vec3; up: V } {
  const t = globeTransform(globe.focus);
  const up = t.direction(anchor.lat, anchor.lon);
  // Local north: towards a slightly higher latitude, made perpendicular to up.
  const ahead = t.direction(Math.min(anchor.lat + 0.01, 89.999), anchor.lon);
  const toward: V = [ahead[0] - up[0], ahead[1] - up[1], ahead[2] - up[2]];
  const along = dot(toward, up);
  const north = normalize([
    toward[0] - up[0] * along,
    toward[1] - up[1] * along,
    toward[2] - up[2] * along,
  ]);
  const east = cross(north, up);
  const [cx, cy, cz] = globe.center;
  return {
    up,
    place: (x, z, height = 0) => {
      const r = globe.radius;
      const d = normalize([
        up[0] * r + east[0] * x - north[0] * z,
        up[1] * r + east[1] * x - north[1] * z,
        up[2] * r + east[2] * x - north[2] * z,
      ]);
      const h = r + lift + height;
      return [cx + d[0] * h, cy + d[1] * h, cz + d[2] * h];
    },
  };
}

/** The place `units` (globe units along the surface) due south of `from`. */
export function southOf(
  globe: Globe,
  from: { lat: number; lon: number },
  units: number,
): { lat: number; lon: number } {
  const lat = from.lat - (units / globe.radius) * (180 / Math.PI);
  // Past the South Pole the route continues up the other side of the Earth.
  return lat >= -90 ? { lat, lon: from.lon } : { lat: -180 - lat, lon: from.lon + 180 };
}

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const cos = dot(unit(a.lat, a.lon), unit(b.lat, b.lon));
  return 6371 * Math.acos(Math.min(1, Math.max(-1, cos)));
}
