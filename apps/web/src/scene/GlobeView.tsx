import { useEffect, useMemo, type ReactElement } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { globeTransform, type Globe } from '@netgongbu/schema';
import { BORDER } from './theme';
import { bordersGeometry, worldTexture } from './worldMap';

/** Borders sit just above the sphere (whose flat facets dip up to ~0.01 below its radius). */
const BORDER_LIFT = 1.0015;

/**
 * The turn that takes the standard Earth (lat/lon as in `unit`, which is how three.js wraps a
 * picture round a sphere) to this globe, where the focus is at the top.
 */
function globeTurn(globe: Globe): Quaternion {
  const { direction } = globeTransform(globe.focus);
  const basis = new Matrix4().makeBasis(
    new Vector3(...direction(0, 0)),
    new Vector3(...direction(90, 0)),
    new Vector3(...direction(0, -90)),
  );
  return new Quaternion().setFromRotationMatrix(basis);
}

/** The Earth: sea and land in different colours, country borders and coastlines as lines. */
export function GlobeView({ globe }: { globe: Globe }): ReactElement {
  const borders = useMemo(() => {
    const { direction } = globeTransform(globe.focus);
    const r = globe.radius * BORDER_LIFT;
    const [cx, cy, cz] = globe.center;
    return bordersGeometry((lon, lat) => {
      const d = direction(lat, lon);
      return [cx + d[0] * r, cy + d[1] * r, cz + d[2] * r];
    });
  }, [globe]);
  const texture = useMemo(() => worldTexture(), []);
  const turn = useMemo(() => globeTurn(globe), [globe]);
  useEffect(
    () => () => {
      borders.dispose();
    },
    [borders],
  );
  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );
  return (
    <group>
      <mesh position={globe.center} quaternion={turn}>
        <sphereGeometry args={[globe.radius, 128, 96]} />
        <meshStandardMaterial map={texture} roughness={1} metalness={0} />
      </mesh>
      <lineSegments geometry={borders}>
        <lineBasicMaterial color={BORDER} transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}
