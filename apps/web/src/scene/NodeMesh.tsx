import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useCursor } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Quaternion, Vector3, type Group } from 'three';
import type { Globe, NetNode } from '@magvirtualedu/schema';
import { upAt } from '../engine/curves';
import { nodeScale } from './markers';
import { NodeShape } from './NodeShape';
import { ACCENT, BUSY, NODE_COLORS } from './theme';

interface Props {
  node: NetNode;
  /** On a globe a node stands on its surface, pointing away from the centre. */
  globe?: Globe | undefined;
  /** A map marker: about the same size on screen at any zoom, at most this scale. */
  markerMax: number | null;
  selected: boolean;
  /** The node does something in the current beat (NAT, lookup, …). */
  busy: boolean;
  onSelect: (id: string) => void;
  /** Double-click: fly the camera to the node. */
  onFocus: (id: string) => void;
}

export function NodeMesh({
  node,
  globe,
  markerMax,
  selected,
  busy,
  onSelect,
  onFocus,
}: Props): ReactElement {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const tilt = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), upAt(node.pos, globe)),
    [node.pos, globe],
  );
  const base = useMemo(() => new Vector3(...node.pos), [node.pos]);
  const group = useRef<Group>(null);
  useFrame(({ camera, size }) => {
    if (markerMax !== null && group.current) {
      group.current.scale.setScalar(nodeScale(base, camera, size.height, markerMax));
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    onSelect(node.id);
  };

  return (
    <group ref={group} position={node.pos} quaternion={tilt}>
      <group
        scale={hovered ? 1.06 : 1}
        onClick={handleClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onFocus(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => {
          setHovered(false);
        }}
      >
        <NodeShape type={node.type} color={NODE_COLORS[node.type]} />
      </group>
      {busy && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.5, 1.62, 48]} />
          <meshBasicMaterial color={BUSY} transparent opacity={0.85} />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[1.15, 1.35, 48]} />
          <meshBasicMaterial color={ACCENT} />
        </mesh>
      )}
    </group>
  );
}
