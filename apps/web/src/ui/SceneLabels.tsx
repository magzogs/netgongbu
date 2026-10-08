import { useMemo, type ReactElement } from 'react';
import { Vector3 } from 'three';
import type { Hop, NetNode, NodeAction, Zone } from '@netgongbu/schema';
import { zonePlacer } from '../engine/zones';
import type { Route } from '../engine/timeline';
import { currentPoint } from '../scene/Packets';
import { PROTOCOL_COLORS } from '../scene/theme';
import { useLabelAnchor } from '../scene/labels';
import { markerMax, nodeTopSource } from '../scene/markers';
import { useViewer } from '../store/viewer';
import { ACTION_NAMES } from './names';

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
  return (
    <div ref={ref} className="anchor anchor--above">
      <div className={`node-label${selected ? ' is-selected' : ''}`}>
        <span className="node-label__name">
          <NodeNumber id={node.id} />
          {node.label}
        </span>
        {ip && <span className="node-label__ip">{ip}</span>}
      </div>
      <span className={`label-badge${selected ? ' is-selected' : ''}`}>{number}</span>
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

function ActionBubble({ node, action }: { node: NetNode; action: NodeAction }): ReactElement {
  const point = useNodeTop(node);
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
  if (!actions || !world) return null;
  return (
    <>
      {actions.map((action) => {
        const node = world.index.nodes.get(action.node);
        return node ? (
          <ActionBubble key={`${action.node}:${action.text}`} node={node} action={action} />
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

/** HTML labels drawn over the canvas and positioned by LabelProjector. */
export function SceneLabels(): ReactElement | null {
  const world = useViewer((s) => s.world);
  const selection = useViewer((s) => s.selection);
  if (!world) return null;
  return (
    <div className="label-layer" aria-hidden="true">
      {(world.topology.zones ?? []).map((zone) => (
        <ZoneLabel key={zone.id} zone={zone} />
      ))}
      {world.topology.nodes.map((node) => (
        <NodeLabel
          key={node.id}
          node={node}
          selected={selection?.kind === 'node' && selection.id === node.id}
        />
      ))}
      <PacketLabels />
      <ActionBubbles />
    </div>
  );
}
