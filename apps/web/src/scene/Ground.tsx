import { useMemo, type ReactElement } from 'react';
import { Grid, Line } from '@react-three/drei';
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import type { Globe, Zone } from '@magvirtualedu/schema';
import { zonePlacer, type ZonePlacer } from '../engine/zones';

/** Cells per side: enough for a floor wrapped onto the globe to follow its curve. */
const SEGMENTS = 12;

function floorGeometry(at: ZonePlacer, [minX, minZ, maxX, maxZ]: Zone['bounds']): BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= SEGMENTS; j++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = at(
        minX + ((maxX - minX) * i) / SEGMENTS,
        minZ + ((maxZ - minZ) * j) / SEGMENTS,
        0.01,
      );
      positions.push(p.x, p.y, p.z);
    }
  }
  const row = SEGMENTS + 1;
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

function outlinePoints(
  at: ZonePlacer,
  [minX, minZ, maxX, maxZ]: Zone['bounds'],
): [number, number, number][] {
  const corners: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
    [minX, minZ],
  ];
  const points: [number, number, number][] = [];
  corners.forEach(([x, z], k) => {
    const next = corners[k + 1];
    if (!next) {
      points.push(at(x, z, 0.02).toArray());
      return;
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const t = s / SEGMENTS;
      points.push(at(x + (next[0] - x) * t, z + (next[1] - z) * t, 0.02).toArray());
    }
  });
  return points;
}

function ZoneArea({ zone, globe }: { zone: Zone; globe?: Globe | undefined }): ReactElement {
  const { geometry, outline } = useMemo(() => {
    const at = zonePlacer(zone, globe);
    return { geometry: floorGeometry(at, zone.bounds), outline: outlinePoints(at, zone.bounds) };
  }, [zone, globe]);
  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={zone.color}
          transparent
          opacity={0.18}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <Line points={outline} color={zone.color} lineWidth={1.5} transparent opacity={0.8} />
    </group>
  );
}

/**
 * Floor grid (left out when the topology sits on a globe) and zone areas, flat or wrapped onto
 * the globe.
 */
export function Ground({
  zones,
  globe,
}: {
  zones: readonly Zone[];
  globe?: Globe | undefined;
}): ReactElement {
  return (
    <group>
      {!globe && (
        <Grid
          infiniteGrid
          position={[0, -0.01, 0]}
          cellSize={1}
          sectionSize={5}
          cellColor="#2e2118"
          sectionColor="#4a3424"
          fadeDistance={160}
          fadeStrength={1.5}
        />
      )}
      {zones.map((zone) => (
        <ZoneArea key={zone.id} zone={zone} globe={globe} />
      ))}
    </group>
  );
}
