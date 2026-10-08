import { CameraControlsImpl } from '@react-three/drei';
import { PerspectiveCamera, Raycaster, Sphere, Spherical, Vector2, Vector3 } from 'three';
import { northAxis, type NetNode } from '@netgongbu/schema';
import { anchorOf } from '../engine/curves';
import {
  focalOffsetFor,
  frame,
  frameGlobe,
  framingPoints,
  globeEye,
  type Insets,
} from '../engine/framing';
import { ease, pointOnRoute, type TimelineBeat } from '../engine/timeline';
import type { ViewerState, World } from '../store/viewer';

/**
 * Imperative camera moves (frame everything, fly to a node, follow a packet) for UI code outside
 * the canvas. CameraRig registers the live controls here.
 *
 * Each view has its own handling:
 * - floor: orbit around a point on the plan (drag), pan (right drag), zoom (wheel).
 * - globe: the camera orbits the globe's centre with north up, so dragging turns the Earth
 *   east–west and north–south the way a hand would; the wheel moves closer to the surface and
 *   keeps the place under the cursor there (see zoomGlobe).
 * - map: like a web map, dragging moves the map, right drag tilts and turns it.
 */

const { ACTION } = CameraControlsImpl;

/** Camera distance when flying to a node or starting to follow a packet (floor plans). */
export const CLOSE_DISTANCE = 16;
/**
 * Height above the surface (globe) or distance (world map) when flying to a node with a real
 * place, and to a part of the computer or the home, which are drawn a few tens of km across.
 */
const MARKER_CLOSE = 8;
const INSET_CLOSE = 2.4;
/**
 * Following a packet over the globe or the map, the camera is this many times as high as the
 * step's route is wide, within limits: a step inside the computer is seen up close, a step across
 * an ocean from high above.
 */
const FOLLOW_SPAN = 2.6;
const FOLLOW_MIN = 2.2;
const FOLLOW_MAX = 45;
/** Never closer to the globe's surface than this. */
const GLOBE_MIN_ALTITUDE = 0.2;
/** Keeps the camera off the poles, where east and west stop meaning anything. */
const POLE_MARGIN = 0.03;
/** On a plan or map, the camera stays above the horizon. */
const FLAT_MAX_POLAR = Math.PI * 0.48;

let controls: CameraControlsImpl | null = null;
const goal = new Spherical();
/** Centre of the part of the screen the panels leave free (normalised device coordinates). */
let shift = { x: 0, y: 0 };
/**
 * Following over the globe or the map: the learner's zoom (a factor on the height each step
 * asks for), and the distance set last frame, to tell such a zoom apart from the camera's own.
 */
let followZoom = 1;
let lastFollow: number | null = null;
const spans = new WeakMap<TimelineBeat, number>();

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function registerControls(instance: CameraControlsImpl | null): void {
  controls = instance;
}

/**
 * Sets mouse and touch handling, limits and the camera's up direction for the world's view.
 */
export function configureControls(world: World | null): void {
  const ctl = controls;
  if (!ctl) return;
  const view = world?.view ?? 'floor';
  const globe = world?.topology.globe;
  const up = view === 'globe' && globe ? new Vector3(...northAxis(globe)) : new Vector3(0, 1, 0);
  if (ctl.camera.up.distanceToSquared(up) > 1e-9) {
    ctl.camera.up.copy(up);
    ctl.updateCameraUp();
  }
  ctl.azimuthRotateSpeed = 1;
  ctl.polarRotateSpeed = 1;
  ctl.dollySpeed = 1;
  if (view === 'globe' && globe) {
    ctl.mouseButtons.left = ACTION.ROTATE;
    ctl.mouseButtons.right = ACTION.ROTATE;
    ctl.touches.one = ACTION.TOUCH_ROTATE;
    ctl.touches.two = ACTION.TOUCH_DOLLY;
    // Zooming towards the cursor would move the orbit off the centre; CameraRig handles the
    // wheel with zoomGlobe instead.
    ctl.mouseButtons.wheel = ACTION.NONE;
    ctl.dollyToCursor = false;
    ctl.minDistance = globe.radius + GLOBE_MIN_ALTITUDE;
    ctl.maxDistance = globe.radius * 8;
    ctl.minPolarAngle = POLE_MARGIN;
    ctl.maxPolarAngle = Math.PI - POLE_MARGIN;
    return;
  }
  ctl.mouseButtons.wheel = ACTION.DOLLY;
  ctl.dollyToCursor = true;
  ctl.minPolarAngle = 0;
  ctl.maxPolarAngle = FLAT_MAX_POLAR;
  // The map and floor plans: the left button pans (also while following; a pan ends following,
  // see isPanning), the right button turns the view.
  ctl.mouseButtons.left = ACTION.SCREEN_PAN;
  ctl.mouseButtons.right = ACTION.ROTATE;
  ctl.touches.one = ACTION.TOUCH_SCREEN_PAN;
  ctl.touches.two = ACTION.TOUCH_DOLLY_ROTATE;
  if (view === 'map' && world?.flatMap) {
    ctl.minDistance = 1.5;
    ctl.maxDistance = world.flatMap.width * 1.1;
    return;
  }
  ctl.minDistance = 3;
  ctl.maxDistance = 220;
}

/** Whether the drag in progress pans the camera (the left button or one finger off the globe). */
export function isPanning(): boolean {
  const action = controls?.currentAction ?? ACTION.NONE;
  return (action & (ACTION.SCREEN_PAN | ACTION.TOUCH_SCREEN_PAN)) !== 0;
}

/**
 * Over the globe a drag should move the surface under the cursor about as far as the cursor
 * moves, at any zoom: slow when close, faster when far, and faster east–west away from the
 * equator, where a degree of longitude is shorter. Each wheel step changes the height above the
 * surface (not the distance to the centre) by the same fraction. Called every frame.
 */
export function tuneGlobeControls(world: World): void {
  const ctl = controls;
  const globe = world.topology.globe;
  if (!ctl || !globe || !(ctl.camera instanceof PerspectiveCamera)) return;
  const altitude = Math.max(0.2, ctl.distance - globe.radius);
  const speed = (altitude * Math.tan((ctl.camera.fov * Math.PI) / 360)) / (Math.PI * globe.radius);
  const polar = Math.min(1, Math.max(0.01, speed));
  ctl.polarRotateSpeed = polar;
  ctl.azimuthRotateSpeed = Math.min(2, polar / Math.max(0.25, Math.sin(ctl.polarAngle)));
  ctl.dollySpeed = Math.min(1, Math.max(0.03, altitude / ctl.distance));
}

/** Wheel units as camera-controls counts them (see its onMouseWheel). */
const WHEEL_UNIT = navigator.platform.includes('Mac') ? -1 : -3;
const raycaster = new Raycaster();

/**
 * One wheel event over the globe. The height above the surface changes as camera-controls' own
 * wheel would change it, and the globe turns so that the place under the cursor stays under the
 * cursor: zooming in on a city keeps it in view instead of zooming into the middle of the screen.
 * While following, only the height changes (the follow camera keeps that as the learner's zoom).
 */
export function zoomGlobe(event: WheelEvent, world: World, keepCursor: boolean): void {
  const ctl = controls;
  const globe = world.topology.globe;
  if (!ctl || !globe || !(ctl.camera instanceof PerspectiveCamera)) return;
  const units =
    event.deltaMode === 1 && !event.ctrlKey
      ? event.deltaY / WHEEL_UNIT
      : event.deltaY / (WHEEL_UNIT * 10);
  const center = new Vector3(...globe.center);
  const from = ctl.getPosition(new Vector3(), true).sub(center);
  const distance = from.length();
  const next = clamp(
    distance * Math.pow(0.95, units * ctl.dollySpeed),
    ctl.minDistance,
    ctl.maxDistance,
  );
  if (!keepCursor || Math.abs(next - distance) < 1e-6) {
    void ctl.dollyTo(next, true);
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const pointer = new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, ctl.camera);
  const hit = raycaster.ray.intersectSphere(new Sphere(center, globe.radius), new Vector3());
  const up = from.normalize();
  const toward = hit?.sub(center).normalize();
  const angle = toward ? up.angleTo(toward) : 0;
  if (!toward || angle < 1e-6) {
    void ctl.dollyTo(next, true);
    return;
  }
  // Seen from straight above, a place `angle` away from the point below the camera sits on
  // screen about in proportion to angle / height: to keep it there, shrink the angle with the
  // height. Zooming out never turns the place past the edge of the visible half.
  const kept = Math.min(Math.PI / 2, (angle * (next - globe.radius)) / (distance - globe.radius));
  const axis = up.clone().cross(toward).normalize();
  const eye = up
    .applyAxisAngle(axis, angle - kept)
    .multiplyScalar(next)
    .add(center);
  void ctl.setLookAt(eye.x, eye.y, eye.z, center.x, center.y, center.z, true);
}

/**
 * Shows the whole topology in the part of the screen not covered by `insets`. The focal offset
 * stays, so later focus and follow moves also centre on that free area.
 */
export function frameTopology(world: World, insets: Insets, animate: boolean): void {
  const ctl = controls;
  if (!ctl || !(ctl.camera instanceof PerspectiveCamera)) return;
  const { topology } = world;
  const points = framingPoints(topology);
  const { fov, aspect } = ctl.camera;
  const framing =
    world.view === 'globe' && topology.globe
      ? frameGlobe(points, topology.globe, ctl.camera.up.clone(), fov, aspect, insets)
      : frame(
          points,
          fov,
          aspect,
          insets,
          // A world map reads best from high above, slightly from the south.
          world.view === 'map' ? new Vector3(0, 2, 1).normalize() : undefined,
        );
  const { eye, target, focalOffset } = framing;
  shift = framing.shift;
  void ctl.setFocalOffset(focalOffset.x, focalOffset.y, 0, animate);
  void ctl.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, animate);
}

/**
 * Keeps what the camera looks at in the middle of the free part of the screen at any zoom: the
 * focal offset is a distance in the scene, so it shrinks as the camera comes closer. Over a
 * globe what is looked at is the surface, not the centre the camera turns around.
 */
export function keepFocalShift(world: World): void {
  const ctl = controls;
  if (!ctl || !(ctl.camera instanceof PerspectiveCamera)) return;
  const globe = world.topology.globe;
  const depth = world.view === 'globe' && globe ? ctl.distance - globe.radius : ctl.distance;
  const halfHeight = Math.max(0, depth) * Math.tan((ctl.camera.fov * Math.PI) / 360);
  const offset = focalOffsetFor(shift, halfHeight, ctl.camera.aspect);
  void ctl.setFocalOffset(offset.x, offset.y, 0, false);
}

/** Flies to a node: on a globe straight above it, elsewhere keeping the current viewing angle. */
export function focusOn(world: World, node: NetNode): void {
  const ctl = controls;
  if (!ctl) return;
  const globe = world.topology.globe;
  const target = anchorOf(node.pos, globe, world.lift);
  const close = node.zone ? INSET_CLOSE : MARKER_CLOSE;
  if (world.view === 'globe' && globe) {
    const eye = globeEye(target, globe, close);
    const [cx, cy, cz] = globe.center;
    void ctl.setLookAt(eye.x, eye.y, eye.z, cx, cy, cz, true);
    return;
  }
  const distance = world.markers ? close * 1.6 : CLOSE_DISTANCE;
  const direction = ctl.getPosition(new Vector3()).sub(ctl.getTarget(new Vector3())).normalize();
  const eye = target.clone().addScaledVector(direction, distance);
  void ctl.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, true);
}

/**
 * Flies in until a folded zone (see engine/clusters.ts) is `pixels` wide on screen, so it opens
 * into its nodes: on a globe straight above it, elsewhere keeping the viewing angle.
 */
export function zoomToZone(world: World, center: Vector3, radius: number, pixels: number): void {
  const ctl = controls;
  if (!ctl || !(ctl.camera instanceof PerspectiveCamera)) return;
  // The canvas fills the window.
  const perPixel = (2 * radius) / pixels;
  const distance =
    (perPixel * window.innerHeight) / (2 * Math.tan((ctl.camera.fov * Math.PI) / 360));
  const globe = world.topology.globe;
  if (world.view === 'globe' && globe) {
    const eye = globeEye(center, globe, Math.max(GLOBE_MIN_ALTITUDE * 1.05, distance));
    const [cx, cy, cz] = globe.center;
    void ctl.setLookAt(eye.x, eye.y, eye.z, cx, cy, cz, true);
    return;
  }
  const direction = ctl.getPosition(new Vector3()).sub(ctl.getTarget(new Vector3())).normalize();
  const eye = center.clone().addScaledVector(direction, Math.max(ctl.minDistance, distance));
  void ctl.setLookAt(eye.x, eye.y, eye.z, center.x, center.y, center.z, true);
}

/**
 * Starts following: on a floor plan the camera moves closer when far away; over the globe and
 * the map the follow camera picks its height for each step (see followHeight).
 */
export function approach(world: World | null): void {
  const ctl = controls;
  if (!ctl || !world) return;
  if (world.view === 'floor') {
    if (ctl.distance > CLOSE_DISTANCE) void ctl.dollyTo(CLOSE_DISTANCE, true);
    return;
  }
  followZoom = 1;
  lastFollow = null;
}

/** How far a step's packets go: the radius around the middle of their routes' ends. */
function routeSpan(entry: TimelineBeat): number {
  const known = spans.get(entry);
  if (known !== undefined) return known;
  const ends = entry.routes.flatMap((r) => r.segments.flatMap((s) => [s.curve.v0, s.curve.v2]));
  const middle = new Vector3();
  for (const p of ends) middle.add(p);
  if (ends.length > 0) middle.divideScalar(ends.length);
  const span = Math.max(0, ...ends.map((p) => p.distanceTo(middle)));
  spans.set(entry, span);
  return span;
}

/**
 * How high (globe) or far (map) the follow camera wants to be for the current step, before the
 * learner's own zoom: close for a step inside the computer, far for one across an ocean.
 */
export function followHeight(state: ViewerState): number {
  const entry = state.timeline?.beats[state.beatIndex];
  const world = state.world;
  if (!entry || !world) return MARKER_CLOSE;
  if (entry.routes.length === 0) {
    const actor = entry.beat.nodeActions?.[0]?.node;
    return actor && world.index.nodes.get(actor)?.zone ? INSET_CLOSE : MARKER_CLOSE;
  }
  return clamp(routeSpan(entry) * FOLLOW_SPAN, FOLLOW_MIN, FOLLOW_MAX);
}

/**
 * What the follow camera looks at: the selected (or first) packet of the current beat, or the
 * first node acting in a beat without packets.
 */
export function followPoint(state: ViewerState, out: Vector3): Vector3 | null {
  const entry = state.timeline?.beats[state.beatIndex];
  if (!entry) return null;
  const wanted = state.selection?.kind === 'packet' ? state.selection.hopIndex : 0;
  const route = entry.routes[wanted] ?? entry.routes[0];
  if (route) {
    pointOnRoute(route, ease(state.progress), out, state.drawnCurves);
    return out;
  }
  const actor = entry.beat.nodeActions?.[0]?.node;
  const world = state.world;
  const node = actor ? world?.index.nodes.get(actor) : undefined;
  return node && world ? out.copy(anchorOf(node.pos, world.topology.globe, world.lift)) : null;
}

/** Called every frame while following; `height` from followHeight. */
export function trackPoint(point: Vector3, world: World, height: number): void {
  const ctl = controls;
  if (!ctl) return;
  if (world.view === 'floor') {
    void ctl.moveTo(point.x, point.y, point.z, true);
    return;
  }
  const globe = world.view === 'globe' ? world.topology.globe : undefined;
  const base = globe?.radius ?? 0;
  // A different distance than the one set last frame means the learner zoomed: keep that zoom.
  const current = ctl.getSpherical(goal, true).radius;
  if (lastFollow !== null && Math.abs(current - lastFollow) > 1e-3) {
    followZoom = clamp((followZoom * (current - base)) / Math.max(1e-3, lastFollow - base), 0.2, 8);
  }
  const limit = globe ? globe.radius * 6 : (world.flatMap?.width ?? 200);
  const wanted = clamp(height * followZoom, (globe ? GLOBE_MIN_ALTITUDE : 1.5) * 1.05, limit);
  if (!globe) {
    // World map: the same viewing angle, at the step's distance from the packet.
    const direction = ctl.getPosition(new Vector3()).sub(ctl.getTarget(new Vector3())).normalize();
    const eye = point.clone().addScaledVector(direction, wanted);
    lastFollow = wanted;
    void ctl.setLookAt(eye.x, eye.y, eye.z, point.x, point.y, point.z, true);
    return;
  }
  // Over a globe, fly round it looking straight down at the packet; rise over a packet arcing
  // high across an ocean, and come back down after.
  const [cx, cy, cz] = globe.center;
  const above = Math.hypot(point.x - cx, point.y - cy, point.z - cz);
  const eyeRadius = Math.max(globe.radius + wanted, above + wanted * 0.5);
  lastFollow = eyeRadius;
  const eye = globeEye(point, globe, eyeRadius - above);
  void ctl.setLookAt(eye.x, eye.y, eye.z, cx, cy, cz, true);
}
