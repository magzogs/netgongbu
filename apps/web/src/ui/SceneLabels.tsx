import { useMemo, type ReactElement } from 'react';
import { Vector3 } from 'three';
import type { Hop, NetNode, NodeAction, Zone } from '@magvirtualedu/schema';
import type { Route } from '../engine/timeline';
import { currentPoint } from '../scene/Packets';
import { PROTOCOL_COLORS } from '../scene/theme';
import { NODE_HEIGHT } from '../scene/NodeShape';
import { useLabelAnchor } from '../scene/labels';
import { useViewer } from '../store/viewer';
import { ACTION_NAMES } from './names';

/** Just above a node's shape, where its label and action bubbles sit. */
function nodeTop(node: NetNode): Vector3 {
  return new Vector3(node.pos[0], node.pos[1] + NODE_HEIGHT[node.type] + 0.35, node.pos[2]);
}

function NodeLabel({ node, selected }: { node: NetNode; selected: boolean }): ReactElement {
  const point = useMemo(() => nodeTop(node), [node]);
  const ref = useLabelAnchor(`node:${node.id}`, point);
  const ip = node.interfaces?.find((i) => i.ip)?.ip;
  return (
    <div ref={ref} className="anchor anchor--above">
      <div className={`node-label${selected ? ' is-selected' : ''}`}>
        <span className="node-label__name">{node.label}</span>
        {ip && <span className="node-label__ip">{ip}</span>}
      </div>
    </div>
  );
}

function ZoneLabel({ zone }: { zone: Zone }): ReactElement {
  const [minX, , , maxZ] = zone.bounds;
  const y = zone.elevation ?? 0;
  const point = useMemo(() => new Vector3(minX + 0.3, y, maxZ - 0.3), [minX, y, maxZ]);
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
  const point = useMemo(() => nodeTop(node), [node]);
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

function PacketLabel({ id, route, hop }: { id: string; route: Route; hop: Hop }): ReactElement {
  const source = useMemo(() => {
    const point = new Vector3();
    return () => {
      currentPoint(route, point).y += PACKET_LABEL_LIFT;
      return point;
    };
  }, [route]);
  const ref = useLabelAnchor(`packet:${id}`, source);
  return (
    <div ref={ref} className="anchor anchor--above">
      <div className="packet-label" style={{ borderColor: PROTOCOL_COLORS[hop.packet.protocol] }}>
        <span className="packet-label__protocol">{hop.packet.protocol}</span>
        {hop.packet.summary}
      </div>
    </div>
  );
}

function PacketLabels(): ReactElement | null {
  const entry = useViewer((s) => s.timeline?.beats[s.beatIndex]);
  if (!entry) return null;
  return (
    <>
      {entry.routes.map((route, i) => {
        const hop = entry.beat.hops[i];
        const id = `${entry.beat.id}:${i}`;
        return hop ? <PacketLabel key={id} id={id} route={route} hop={hop} /> : null;
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
