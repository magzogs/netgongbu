import type { ReactElement } from 'react';
import { Grid, Line } from '@react-three/drei';
import type { Zone } from '@magvirtualedu/schema';

function ZoneArea({ zone }: { zone: Zone }): ReactElement {
  const [minX, minZ, maxX, maxZ] = zone.bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const y = 0.01;
  const outline: [number, number, number][] = [
    [minX, y, minZ],
    [maxX, y, minZ],
    [maxX, y, maxZ],
    [minX, y, maxZ],
    [minX, y, minZ],
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[minX + width / 2, y, minZ + depth / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color={zone.color} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <Line points={outline} color={zone.color} lineWidth={1.5} transparent opacity={0.8} />
    </group>
  );
}

export function Ground({ zones }: { zones: readonly Zone[] }): ReactElement {
  return (
    <group>
      <Grid
        infiniteGrid
        position={[0, -0.01, 0]}
        cellSize={1}
        sectionSize={5}
        cellColor="#1c2433"
        sectionColor="#2a3550"
        fadeDistance={160}
        fadeStrength={1.5}
      />
      {zones.map((zone) => (
        <ZoneArea key={zone.id} zone={zone} />
      ))}
    </group>
  );
}
