import { useState, type ReactElement } from 'react';
import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { NetNode } from '@magvirtualedu/schema';
import { NodeShape } from './NodeShape';
import { ACCENT, BUSY, NODE_COLORS } from './theme';

interface Props {
  node: NetNode;
  selected: boolean;
  /** The node does something in the current beat (NAT, lookup, …). */
  busy: boolean;
  onSelect: (id: string) => void;
  /** Double-click: fly the camera to the node. */
  onFocus: (id: string) => void;
}

export function NodeMesh({ node, selected, busy, onSelect, onFocus }: Props): ReactElement {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    onSelect(node.id);
  };

  return (
    <group position={node.pos}>
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
