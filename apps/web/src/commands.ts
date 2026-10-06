import { focusOn, frameTopology } from './scene/camera';
import type { Insets } from './engine/framing';
import { NARROW_QUERY, useViewer } from './store/viewer';

// User commands shared by buttons, double-clicks and keyboard shortcuts.

/** Select a node and fly to it; leaves follow mode so the camera stays there. */
export function focusNode(id: string): void {
  const viewer = useViewer.getState();
  const node = viewer.world?.index.nodes.get(id);
  if (!node) return;
  viewer.setCameraMode('orbit');
  viewer.select({ kind: 'node', id });
  focusOn(node.pos);
}

/**
 * Screen fractions covered by the top bar, the player card and the inspector (a column on the
 * right on wide screens, a bar under the top bar on phones), so framing keeps the topology in
 * the part of the screen that stays visible.
 */
export function measureInsets(): Insets {
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  const rect = (selector: string): DOMRect | undefined =>
    document.querySelector(selector)?.getBoundingClientRect();
  const narrow = window.matchMedia(NARROW_QUERY).matches;
  const inspector = rect('.inspector');
  const top = Math.max(rect('.topbar')?.bottom ?? 0, narrow ? (inspector?.bottom ?? 0) : 0);
  const playerTop = rect('.player')?.top ?? height;
  const right = !narrow && inspector ? width - inspector.left : 0;
  return {
    top: top / height,
    bottom: Math.max(0, height - playerTop) / height,
    left: 0,
    right: right / width,
  };
}

/** Back to the overview of the whole topology. */
export function showAll(animate = true): void {
  const viewer = useViewer.getState();
  if (!viewer.world) return;
  viewer.setCameraMode('orbit');
  frameTopology(viewer.world.topology, measureInsets(), animate);
}

export function toggleFollow(): void {
  const viewer = useViewer.getState();
  viewer.setCameraMode(viewer.cameraMode === 'follow' ? 'orbit' : 'follow');
}
