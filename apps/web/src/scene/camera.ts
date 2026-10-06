import { CameraControlsImpl } from '@react-three/drei';
import { PerspectiveCamera, Vector3 } from 'three';
import type { Topology, Vec3 } from '@magvirtualedu/schema';
import { anchorOf, boundsOf } from '../engine/curves';
import { ease, pointOnRoute } from '../engine/timeline';
import type { ViewerState } from '../store/viewer';

/**
 * Imperative camera moves (frame everything, fly to a node, follow a packet) for UI code outside
 * the canvas. CameraRig registers the live controls here.
 */

const { ACTION } = CameraControlsImpl;

/** Direction the camera looks from when framing a topology: above and in front. */
const VIEW_DIRECTION = new Vector3(0, 0.8, 1).normalize();
/** Camera distance when flying to a node or starting to follow a packet. */
export const CLOSE_DISTANCE = 16;

let controls: CameraControlsImpl | null = null;

export function registerControls(instance: CameraControlsImpl | null): void {
  controls = instance;
}

/** Distance at which a sphere of `radius` fits both the vertical and horizontal field of view. */
function fitDistance(camera: PerspectiveCamera, radius: number): number {
  const vHalf = (camera.fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  return radius / Math.sin(Math.min(vHalf, hHalf));
}

/** Shows the whole topology from the default angle. */
export function frameTopology(topology: Topology, animate: boolean): void {
  const ctl = controls;
  if (!ctl || !(ctl.camera instanceof PerspectiveCamera)) return;
  const box = boundsOf(topology);
  const center = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const eye = center.clone().addScaledVector(VIEW_DIRECTION, fitDistance(ctl.camera, radius));
  void ctl.setLookAt(eye.x, eye.y, eye.z, center.x, center.y, center.z, animate);
}

/** Flies to a node, keeping the current viewing angle. */
export function focusOn(pos: Vec3, distance = CLOSE_DISTANCE): void {
  const ctl = controls;
  if (!ctl) return;
  const target = anchorOf(pos);
  const direction = ctl.getPosition(new Vector3()).sub(ctl.getTarget(new Vector3())).normalize();
  const eye = target.clone().addScaledVector(direction, distance);
  void ctl.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, true);
}

/** Moves closer when far away, so following a packet starts at a readable distance. */
export function approach(distance = CLOSE_DISTANCE): void {
  if (controls && controls.distance > distance) void controls.dollyTo(distance, true);
}

/** While following, panning would fight the camera; rotate and zoom keep working. */
export function setPanEnabled(enabled: boolean): void {
  if (!controls) return;
  controls.mouseButtons.right = enabled ? ACTION.TRUCK : ACTION.NONE;
  controls.touches.two = enabled ? ACTION.TOUCH_DOLLY_TRUCK : ACTION.TOUCH_DOLLY;
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
    pointOnRoute(route, ease(state.progress), out);
    return out;
  }
  const actor = entry.beat.nodeActions?.[0]?.node;
  const node = actor ? state.world?.index.nodes.get(actor) : undefined;
  return node ? out.copy(anchorOf(node.pos)) : null;
}

/** Called every frame while following. */
export function trackPoint(point: Vector3): void {
  void controls?.moveTo(point.x, point.y, point.z, true);
}
