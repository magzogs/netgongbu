import { useEffect, useMemo, type ReactElement } from 'react';
import { TubeGeometry } from 'three';
import type { LinkCurve } from '../engine/curves';
import { MEDIUM_COLORS } from './theme';

interface Props {
  linkCurve: LinkCurve;
}

export function LinkMesh({ linkCurve }: Props): ReactElement {
  const { curve, link } = linkCurve;
  const geometry = useMemo(() => new TubeGeometry(curve, 48, 0.05, 8, false), [curve]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={MEDIUM_COLORS[link.medium]}
        emissive={MEDIUM_COLORS[link.medium]}
        emissiveIntensity={0.25}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}
