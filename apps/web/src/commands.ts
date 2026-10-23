import { focusOn, frameTopology, zoomToZone } from './scene/camera';
import { foldedClusters, OPEN_PIXELS } from './engine/clusters';
import type { Insets } from './engine/framing';
import { NARROW_QUERY, useViewer } from './store/viewer';

// User commands shared by buttons, double-clicks and keyboard shortcuts.

/**
 * Select a node and fly to it, opening the zone it is folded into; leaves follow mode so the
 * camera stays there.
 */
export function focusNode(id: string): void {
  const viewer = useViewer.getState();
  const world = viewer.world;
  const node = world?.index.nodes.get(id);
  if (!world || !node) return;
  const zone = world.clusters.find((c) => c.members.includes(id));
  if (zone) viewer.setZonesOpen([zone.zoneId], true);
  viewer.setCameraMode('orbit');
  viewer.select({ kind: 'node', id });
  focusOn(world, node);
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
  frameTopology(viewer.world, measureInsets(), animate);
}

/** Globe ↔ flat world map, for topologies that have a globe. */
export function toggleMapView(): void {
  const viewer = useViewer.getState();
  if (!viewer.world?.source.globe) return;
  viewer.setMapView(viewer.mapView === 'globe' ? 'flat' : 'globe');
}

export function toggleFollow(): void {
  const viewer = useViewer.getState();
  viewer.setCameraMode(viewer.cameraMode === 'follow' ? 'orbit' : 'follow');
}

/**
 * Selects a node; in the desktop app the laptop (or its browser) also opens the laptop's real
 * web browser.
 */
export function selectNode(id: string): void {
  const viewer = useViewer.getState();
  viewer.select({ kind: 'node', id });
  const type = viewer.world?.index.nodes.get(id)?.type;
  if (type === 'client' || type === 'browser') viewer.setBrowserOpen(true);
}

function foldOf(key: string) {
  const viewer = useViewer.getState();
  const world = viewer.world;
  const fold = world && foldedClusters(world.clusters, viewer.folds).find((f) => f.key === key);
  return world && fold ? { world, fold } : null;
}

/** Selects a folded zone (engine/clusters.ts, by fold key): the node its marker stands for. */
export function selectZone(key: string): void {
  const found = foldOf(key);
  if (found) useViewer.getState().select({ kind: 'node', id: found.fold.standIn });
}

/**
 * Opens folded zones (by fold key) into their nodes, and flies in close enough to tell them
 * apart.
 */
export function openZone(key: string): void {
  const found = foldOf(key);
  if (!found) return;
  const { world, fold } = found;
  const viewer = useViewer.getState();
  viewer.setZonesOpen(fold.zoneIds, true);
  viewer.setCameraMode('orbit');
  zoomToZone(world, fold.center, fold.openRadius, OPEN_PIXELS * 1.3);
}

/** Folds an opened zone (by zone id) into one node again. */
export function closeZone(zoneId: string): void {
  useViewer.getState().setZonesOpen([zoneId], false);
}
