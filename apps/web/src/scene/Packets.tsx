import { useMemo, useRef, type ReactElement } from 'react';
import { Trail } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Mesh } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Protocol } from '@magvirtualedu/schema';
import { ease, pointOnRoute, type Route } from '../engine/timeline';
import { useViewer } from '../store/viewer';
import { screenScale, worldPerPixel } from './markers';
import { PROTOCOL_COLORS } from './theme';

/** Full width of a packet (its halo) and of its trail, in world units. */
const PACKET_SIZE = 1;
const TRAIL_WIDTH = 1.1;
/** On the globe and the world map a packet looks about this wide (CSS pixels), at most full size. */
const PACKET_PIXELS = 18;
const TRAIL_PIXELS = 7;

interface PacketProps {
  route: Route;
  protocol: Protocol;
  hopIndex: number;
  /** Small, fixed on-screen size (globe and world map). */
  marker: boolean;
}

/** Where a packet on `route` is right now, from the live playback progress. */
export function currentPoint(route: Route, out: Vector3): Vector3 {
  pointOnRoute(route, ease(useViewer.getState().progress), out);
  return out;
}

function Packet({ route, protocol, hopIndex, marker }: PacketProps): ReactElement {
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
  const camera = useThree((s) => s.camera);
  const viewportHeight = useThree((s) => s.size.height);
  // The trail's width is fixed when it is made: size it for the zoom at the start of the step.
  const trailWidth = useMemo(
    () =>
      marker
        ? Math.min(TRAIL_WIDTH, 10 * TRAIL_PIXELS * worldPerPixel(start, camera, viewportHeight))
        : TRAIL_WIDTH,
    [marker, start, camera, viewportHeight],
  );

  useFrame(({ camera: eye, size }) => {
    const m = mesh.current;
    if (!m) return;
    currentPoint(route, m.position);
    if (marker) {
      m.scale.setScalar(screenScale(m.position, eye, size.height, PACKET_SIZE, PACKET_PIXELS, 1));
    }
  });

  return (
    <Trail width={trailWidth} length={5} color={color} attenuation={(w) => w * w}>
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
export function Packets({ markers }: { markers: boolean }): ReactElement | null {
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
            marker={markers}
          />
        );
      })}
    </group>
  );
}
