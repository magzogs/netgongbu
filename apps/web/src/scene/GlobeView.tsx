import { useEffect, useMemo, type ReactElement } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { mesh } from 'topojson-client';
import type { GeometryCollection, Topology as TopoJson } from 'topojson-specification';
import countries from 'world-atlas/countries-110m.json';
import { globeTransform, type Globe } from '@magvirtualedu/schema';

// Natural Earth 1:110m country borders and coastlines (public domain) via world-atlas.
const world = countries as unknown as TopoJson<{ countries: GeometryCollection }>;

/** Border and coastline segments on the globe surface, slightly above it to avoid z-fighting. */
function bordersGeometry(globe: Globe): BufferGeometry {
  const { direction } = globeTransform(globe.focus);
  const lines = mesh(world, world.objects.countries).coordinates;
  const r = globe.radius * 1.002;
  const [cx, cy, cz] = globe.center;
  const point = (lon: number, lat: number): number[] => {
    const d = direction(lat, lon);
    return [cx + d[0] * r, cy + d[1] * r, cz + d[2] * r];
  };
  const positions: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (!a || !b) continue;
      positions.push(...point(a[0] ?? 0, a[1] ?? 0), ...point(b[0] ?? 0, b[1] ?? 0));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

export function GlobeView({ globe }: { globe: Globe }): ReactElement {
  const borders = useMemo(() => bordersGeometry(globe), [globe]);
  useEffect(
    () => () => {
      borders.dispose();
    },
    [borders],
  );
  return (
    <group>
      <mesh position={globe.center}>
        <sphereGeometry args={[globe.radius, 96, 64]} />
        <meshStandardMaterial color="#2a1c12" roughness={0.95} metalness={0} />
      </mesh>
      <lineSegments geometry={borders}>
        <lineBasicMaterial color="#a8703d" transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}
