import { useMemo, type HTMLAttributes, type ReactElement } from 'react';
import { Vector3 } from 'three';
import type { Hop, NetNode, NodeAction, Zone } from '@netgongbu/schema';
import { foldedNodes, type FoldedCluster } from '../engine/clusters';
import { zonePlacer } from '../engine/zones';
import { clusterTopSource, useFoldedClusters } from '../scene/Clusters';
import type { Route } from '../engine/timeline';
import { currentPoint } from '../scene/Packets';
import { PROTOCOL_COLORS } from '../scene/theme';
import { useLabelAnchor } from '../scene/labels';
import { markerMax, nodeTopSource } from '../scene/markers';
import { useViewer } from '../store/viewer';
import { focusNode, openZone, selectNode } from '../commands';
import { ACTION_NAMES } from './names';

/** A press that moves farther than this (CSS pixels) is a drag of the view, not a click. */
const CLICK_SLOP = 5;
let pressedAt: { x: number; y: number } | null = null;

function canvasOf(el: Element): HTMLCanvasElement | null {
  return el.closest('.app')?.querySelector('canvas.scene, .scene canvas') ?? null;
}

/**
 * Pointer handling for things drawn over the scene that stand for something in it (a node's
 * label, a cluster's badge): a click acts on it, while a drag or the wheel started there still
 * turns and zooms the view, as on the canvas below.
 */
export function overlayHandlers(
  onClick: () => void,
  onDoubleClick?: () => void,
): HTMLAttributes<HTMLElement> {
  return {
    onPointerDown(e) {
      pressedAt = { x: e.clientX, y: e.clientY };
      canvasOf(e.currentTarget)?.dispatchEvent(new PointerEvent('pointerdown', e.nativeEvent));
    },
    onWheel(e) {
      canvasOf(e.currentTarget)?.dispatchEvent(new WheelEvent('wheel', e.nativeEvent));
    },
    onContextMenu(e) {
      e.preventDefault();
    },
    onClick(e) {
      const moved = pressedAt && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y);
      pressedAt = null;
      if (moved !== null && moved > CLICK_SLOP) return;
      onClick();
    },
    ...(onDoubleClick && {
      onDoubleClick() {
        onDoubleClick();
      },
    }),
  };
}

/** Just above a node's shape (which on a map shrinks and grows with the zoom). */
function useNodeTop(node: NetNode) {
  const world = useViewer((s) => s.world);
  return useMemo(
    () => nodeTopSource(node, world?.topology.globe, markerMax(world, node)),
    [node, world],
  );
}

/** The node's number in the scenario: on its label, and alone when labels crowd together. */
export function NodeNumber({ id }: { id: string }): ReactElement | null {
  const n = useViewer((s) => s.nodeNumbers.get(id));
  return n === undefined ? null : <span className="node-number">{n}</span>;
}

function NodeLabel({ node, selected }: { node: NetNode; selected: boolean }): ReactElement {
  const number = useViewer((s) => s.nodeNumbers.get(node.id));
  const point = useNodeTop(node);
  // The selected node keeps its full label; the others give way in the order they are reached.
  const ref = useLabelAnchor(`node:${node.id}`, point, selected ? 0 : (number ?? 999));
  const ip = node.interfaces?.find((i) => i.ip)?.ip;
  const handlers = useMemo(
    () =>
      overlayHandlers(
        () => {
          selectNode(node.id);
        },
        () => {
          focusNode(node.id);
        },
      ),
    [node.id],
  );
  return (
    <div ref={ref} className="anchor anchor--above">
      <div className={`node-label${selected ? ' is-selected' : ''}`} {...handlers}>
        <span className="node-label__name">
          <NodeNumber id={node.id} />
          {node.label}
        </span>
        {ip && <span className="node-label__ip">{ip}</span>}
      </div>
      <span className={`label-badge${selected ? ' is-selected' : ''}`} {...handlers}>
        {number}
      </span>
    </div>
  );
}

/** A folded zone: its name and how many nodes it holds; a click opens it. */
function ClusterLabel({
  cluster,
  selected,
}: {
  cluster: FoldedCluster;
  selected: boolean;
}): ReactElement {
  const globe = useViewer((s) => s.world?.topology.globe);
  const point = useMemo(() => clusterTopSource(cluster, globe), [cluster, globe]);
  // Before the nodes reached later, as it stands for the first of them.
  const first = useViewer((s) =>
    Math.min(...cluster.members.map((id) => s.nodeNumbers.get(id) ?? 999)),
  );
  const ref = useLabelAnchor(`cluster:${cluster.key}`, point, selected ? 0 : first);
  const handlers = useMemo(
    () =>
      overlayHandlers(() => {
        openZone(cluster.key);
      }),
    [cluster.key],
  );
  const count = cluster.members.length;
  return (
    <div ref={ref} className="anchor anchor--above">
      <div
        className={`node-label cluster-label${selected ? ' is-selected' : ''}`}
        title={`눌러서 ${cluster.label}의 장비 ${count}개 펼치기`}
        {...handlers}
      >
        <span className="node-label__name">
          {cluster.label}
          <span className="cluster-label__count">{count}</span>
        </span>
      </div>
      <span className={`label-badge${selected ? ' is-selected' : ''}`} {...handlers}>
        {count}
      </span>
    </div>
  );
}

function ZoneLabel({ zone }: { zone: Zone }): ReactElement {
  const globe = useViewer((s) => s.world?.topology.globe);
  const point = useMemo(() => {
    const [minX, minZ, maxX, maxZ] = zone.bounds;
    // In from the corner, by less for a small zone (the computer on a globe is ~0.5 units wide).
    const inset = Math.min(0.3, (maxX - minX) * 0.05, (maxZ - minZ) * 0.05);
    return zonePlacer(zone, globe)(minX + inset, maxZ - inset);
  }, [zone, globe]);
  const ref = useLabelAnchor(`zone:${zone.id}`, point);
  return (
    <div ref={ref} className="anchor anchor--corner">
      <div className="zone-label" style={{ borderColor: zone.color }}>
        {zone.label}
      </div>
    </div>
  );
}

function ActionBubble({
  node,
  action,
  cluster,
}: {
  node: NetNode;
  action: NodeAction;
  /** The folded zone the node is in, whose marker the bubble then points at. */
  cluster: FoldedCluster | undefined;
}): ReactElement {
  const nodeTop = useNodeTop(node);
  const globe = useViewer((s) => s.world?.topology.globe);
  const point = useMemo(
    () => (cluster ? clusterTopSource(cluster, globe) : nodeTop),
    [cluster, globe, nodeTop],
  );
  const ref = useLabelAnchor(`action:${node.id}:${action.text}`, point);
  return (
    <div ref={ref} className="anchor anchor--above">
      <div className="bubble">
        {action.kind && <span className="bubble__kind">{ACTION_NAMES[action.kind]}</span>}
        {action.text}
      </div>
    </div>
  );
}

function ActionBubbles(): ReactElement | null {
  const actions = useViewer((s) => s.timeline?.beats[s.beatIndex]?.beat.nodeActions);
  const world = useViewer((s) => s.world);
  const folded = useFolded();
  if (!actions || !world) return null;
  return (
    <>
      {actions.map((action) => {
        const node = world.index.nodes.get(action.node);
        return node ? (
          <ActionBubble
            key={`${action.node}:${action.text}`}
            node={node}
            action={action}
            cluster={folded.get(node.id)}
          />
        ) : null;
      })}
    </>
  );
}

const PACKET_LABEL_LIFT = 0.65;

interface PacketLabelProps {
  id: string;
  route: Route;
  hop: Hop;
  /** On the globe and the map packets are small: the label keeps a fixed gap on screen. */
  marker: boolean;
}

function PacketLabel({ id, route, hop, marker }: PacketLabelProps): ReactElement {
  const source = useMemo(() => {
    const point = new Vector3();
    const lift = marker ? 0 : PACKET_LABEL_LIFT;
    return () => {
      currentPoint(route, point).y += lift;
      return point;
    };
  }, [route, marker]);
  const ref = useLabelAnchor(`packet:${id}`, source);
  return (
    <div ref={ref} className="anchor anchor--above">
      <div
        className={`packet-label${marker ? ' packet-label--marker' : ''}`}
        style={{ borderColor: PROTOCOL_COLORS[hop.packet.protocol] }}
      >
        <span className="packet-label__protocol">{hop.packet.protocol}</span>
        {hop.packet.summary}
      </div>
    </div>
  );
}

function PacketLabels(): ReactElement | null {
  const entry = useViewer((s) => s.timeline?.beats[s.beatIndex]);
  const marker = useViewer((s) => s.world?.markers ?? false);
  if (!entry) return null;
  return (
    <>
      {entry.routes.map((route, i) => {
        const hop = entry.beat.hops[i];
        const id = `${entry.beat.id}:${i}`;
        return hop ? (
          <PacketLabel key={id} id={id} route={route} hop={hop} marker={marker} />
        ) : null;
      })}
    </>
  );
}

/** Nodes now folded into a zone's marker, by id. */
function useFolded(): Map<string, FoldedCluster> {
  const clusters = useFoldedClusters();
  return useMemo(() => foldedNodes(clusters), [clusters]);
}

/** HTML labels drawn over the canvas and positioned by LabelProjector. */
export function SceneLabels(): ReactElement | null {
  const world = useViewer((s) => s.world);
  const selection = useViewer((s) => s.selection);
  const clusters = useFoldedClusters();
  const folded = useMemo(() => foldedNodes(clusters), [clusters]);
  if (!world) return null;
  const selectedNode = selection?.kind === 'node' ? selection.id : null;
  return (
    <div className="label-layer" aria-hidden="true">
      {(world.topology.zones ?? [])
        // A folded zone's name is on its marker.
        .filter((zone) => !clusters.some((c) => c.zoneIds.includes(zone.id)))
        .map((zone) => (
          <ZoneLabel key={zone.id} zone={zone} />
        ))}
      {clusters.map((c) => (
        <ClusterLabel
          key={c.key}
          cluster={c}
          selected={selectedNode !== null && c.members.includes(selectedNode)}
        />
      ))}
      {world.topology.nodes
        .filter((node) => !folded.has(node.id))
        .map((node) => (
          <NodeLabel key={node.id} node={node} selected={selectedNode === node.id} />
        ))}
      <PacketLabels />
      <ActionBubbles />
    </div>
  );
}
