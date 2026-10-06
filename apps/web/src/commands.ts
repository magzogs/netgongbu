import { focusOn, frameTopology } from './scene/camera';
import { useViewer } from './store/viewer';

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

/** Back to the overview of the whole topology. */
export function showAll(): void {
  const viewer = useViewer.getState();
  if (!viewer.world) return;
  viewer.setCameraMode('orbit');
  frameTopology(viewer.world.topology, true);
}

export function toggleFollow(): void {
  const viewer = useViewer.getState();
  viewer.setCameraMode(viewer.cameraMode === 'follow' ? 'orbit' : 'follow');
}
