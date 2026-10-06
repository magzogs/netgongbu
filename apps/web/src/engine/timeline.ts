import type { Beat, Scenario, TopologyIndex } from '@magvirtualedu/schema';
import type { Vector3 } from 'three';
import type { LinkCurve } from './curves';

/** One link of a hop's path, oriented in the direction the packet travels. */
export interface RouteSegment {
  linkId: string;
  curve: LinkCurve['curve'];
  /** true when the packet travels link.b → link.a, i.e. against the curve direction. */
  reversed: boolean;
  /** Distance from the start of the route to the start of this segment. */
  offset: number;
  length: number;
}

export interface Route {
  segments: RouteSegment[];
  length: number;
}

export interface TimelineBeat {
  beat: Beat;
  routes: Route[];
  /** Seconds at 1× speed. */
  duration: number;
  /** Seconds from the start of the scenario at 1× speed. */
  start: number;
}

export interface Timeline {
  beats: TimelineBeat[];
  total: number;
}

export interface RouteWorld {
  index: TopologyIndex;
  curves: ReadonlyMap<string, LinkCurve>;
}

/** Seconds for a beat without packets (narration and node actions only). */
export const STILL_BEAT_SECONDS = 2.5;

/** Turns a node path into curve segments. Paths must already be validated against the topology. */
export function routeOf(world: RouteWorld, path: readonly string[]): Route {
  const segments: RouteSegment[] = [];
  let offset = 0;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1] ?? '';
    const to = path[i] ?? '';
    const link = world.index.linkBetween(from, to);
    const lc = link ? world.curves.get(link.id) : undefined;
    if (!link || !lc) throw new Error(`No link between ${from} and ${to}`);
    segments.push({
      linkId: link.id,
      curve: lc.curve,
      reversed: link.a !== from,
      offset,
      length: lc.length,
    });
    offset += lc.length;
  }
  return { segments, length: offset };
}

/** Longer journeys take longer, within limits that keep every beat watchable. */
export function defaultDuration(routes: readonly Route[]): number {
  if (routes.length === 0) return STILL_BEAT_SECONDS;
  const longest = Math.max(...routes.map((r) => r.length));
  return Math.min(6, Math.max(1.4, 0.8 + longest / 12));
}

export function buildTimeline(world: RouteWorld, scenario: Scenario): Timeline {
  let start = 0;
  const beats = scenario.beats.map((beat) => {
    const routes = beat.hops.map((hop) => routeOf(world, hop.path));
    const duration = beat.durationSec ?? defaultDuration(routes);
    const entry: TimelineBeat = { beat, routes, duration, start };
    start += duration;
    return entry;
  });
  return { beats, total: start };
}

/** Eases in and out so packets leave and arrive gently. */
export function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Writes the point at fraction `t` (0..1, by distance) of a route into `out` and returns the
 * segment the packet is on.
 */
export function pointOnRoute(route: Route, t: number, out: Vector3): RouteSegment | undefined {
  const distance = Math.min(1, Math.max(0, t)) * route.length;
  const segment =
    route.segments.find((s) => distance <= s.offset + s.length) ?? route.segments.at(-1);
  if (!segment) return undefined;
  const local = segment.length > 0 ? (distance - segment.offset) / segment.length : 0;
  const u = Math.min(1, Math.max(0, local));
  segment.curve.getPointAt(segment.reversed ? 1 - u : u, out);
  return segment;
}
