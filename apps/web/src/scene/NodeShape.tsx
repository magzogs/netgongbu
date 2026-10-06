import type { ReactElement } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { NodeType } from '@magvirtualedu/schema';

/** Height of each shape, so labels and bubbles sit just above it. */
export const NODE_HEIGHT: Record<NodeType, number> = {
  client: 1,
  router: 0.95,
  switch: 0.35,
  firewall: 1.1,
  dns: 1.55,
  server: 1.8,
  loadbalancer: 0.6,
  cdn: 1.6,
  cloud: 1.5,
  service: 0.9,
  queue: 0.7,
  database: 1.2,
};

interface Props {
  type: NodeType;
  color: string;
}

/** Simple, recognisable stand-ins for each node type, built from primitives (no model files). */
export function NodeShape({ type, color }: Props): ReactElement {
  const material = <meshStandardMaterial color={color} roughness={0.45} metalness={0.15} />;
  switch (type) {
    case 'client':
      return (
        <group>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[1.4, 0.12, 1]} />
            {material}
          </mesh>
          <mesh position={[0, 0.55, -0.48]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[1.4, 0.9, 0.06]} />
            {material}
          </mesh>
        </group>
      );
    case 'router':
      return (
        <group>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.8, 0.8, 0.5, 32]} />
            {material}
          </mesh>
          {[-0.4, 0.4].map((x) => (
            <mesh key={x} position={[x, 0.7, -0.4]}>
              <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
              {material}
            </mesh>
          ))}
        </group>
      );
    case 'switch':
      return (
        <mesh position={[0, 0.175, 0]}>
          <boxGeometry args={[1.8, 0.35, 1]} />
          {material}
        </mesh>
      );
    case 'firewall':
      return (
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[1.6, 1.1, 0.5]} />
          {material}
        </mesh>
      );
    case 'dns':
      return (
        <mesh position={[0, 0.8, 0]}>
          <octahedronGeometry args={[0.75]} />
          {material}
        </mesh>
      );
    case 'server':
      return (
        <group>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[1, 1.8, 1]} />
            {material}
          </mesh>
          {[0.45, 0.9, 1.35].map((y) => (
            <mesh key={y} position={[0, y, 0.505]}>
              <planeGeometry args={[0.8, 0.06]} />
              <meshBasicMaterial color="#1e293b" />
            </mesh>
          ))}
        </group>
      );
    case 'loadbalancer':
      return (
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.9, 0.9, 0.6, 6]} />
          {material}
        </mesh>
      );
    case 'cdn':
      return (
        <mesh position={[0, 0.8, 0]}>
          <icosahedronGeometry args={[0.8]} />
          {material}
        </mesh>
      );
    case 'cloud':
      return (
        <group>
          <mesh position={[0, 0.75, 0]}>
            <sphereGeometry args={[0.75, 24, 16]} />
            {material}
          </mesh>
          <mesh position={[-0.75, 0.55, 0.1]}>
            <sphereGeometry args={[0.55, 24, 16]} />
            {material}
          </mesh>
          <mesh position={[0.75, 0.55, -0.1]}>
            <sphereGeometry args={[0.6, 24, 16]} />
            {material}
          </mesh>
        </group>
      );
    case 'service':
      return (
        <RoundedBox args={[1.2, 0.9, 1.2]} radius={0.15} position={[0, 0.45, 0]}>
          {material}
        </RoundedBox>
      );
    case 'queue':
      return (
        <mesh position={[0, 0.35, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 1.8, 24]} />
          {material}
        </mesh>
      );
    case 'database':
      return (
        <group>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.65, 0.65, 1.2, 32]} />
            {material}
          </mesh>
          {[0.4, 0.8].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.66, 0.02, 8, 48]} />
              <meshBasicMaterial color="#1e293b" />
            </mesh>
          ))}
        </group>
      );
  }
}
