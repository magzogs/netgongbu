import { useMemo, useRef, type ReactElement } from 'react';
import { Trail } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Mesh } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Protocol } from '@magvirtualedu/schema';
import { ease, pointOnRoute, type Route } from '../engine/timeline';
import { useViewer } from '../store/viewer';
import { PROTOCOL_COLORS } from './theme';

interface PacketProps {
  route: Route;
  protocol: Protocol;
  hopIndex: number;
}

/** Where a packet on `route` is right now, from the live playback progress. */
export function currentPoint(route: Route, out: Vector3): Vector3 {
  pointOnRoute(route, ease(useViewer.getState().progress), out);
  return out;
}

function Packet({ route, protocol, hopIndex }: PacketProps): ReactElement {
  const mesh = useRef<Mesh>(null);
  const color = PROTOCOL_COLORS[protocol];
  const select = useViewer((s) => s.select);
  const openPacketLab = useViewer((s) => s.openPacketLab);
  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    select({ kind: 'packet', hopIndex });
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    openPacketLab(hopIndex);
  };
  // Start where playback currently is, so the trail does not streak in from the origin.
  const start = useMemo(() => currentPoint(route, new Vector3()), [route]);

  useFrame(() => {
    if (mesh.current) currentPoint(route, mesh.current.position);
  });

  return (
    <Trail width={1.1} length={5} color={color} attenuation={(w) => w * w}>
      <mesh ref={mesh} position={start} onClick={onClick} onDoubleClick={onDoubleClick}>
        <sphereGeometry args={[0.28, 24, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
        <mesh>
          <sphereGeometry args={[0.5, 24, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      </mesh>
    </Trail>
  );
}

/** The packets of the current beat, moving along their routes as playback progresses. */
export function Packets(): ReactElement | null {
  const entry = useViewer((s) => s.timeline?.beats[s.beatIndex]);
  if (!entry) return null;
  return (
    <group>
      {entry.routes.map((route, i) => {
        const hop = entry.beat.hops[i];
        if (!hop) return null;
        return (
          <Packet
            key={`${entry.beat.id}:${i}`}
            route={route}
            protocol={hop.packet.protocol}
            hopIndex={i}
          />
        );
      })}
    </group>
  );
}
