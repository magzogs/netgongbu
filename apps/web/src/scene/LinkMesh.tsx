import { useEffect, useMemo, type ReactElement } from 'react';
import { TubeGeometry } from 'three';
import type { LinkCurve } from '../engine/curves';
import { MEDIUM_COLORS } from './theme';

/** active: on the current beat's path; dim: another link while a beat has packets moving. */
export type LinkEmphasis = 'active' | 'idle' | 'dim';

const LOOK: Record<LinkEmphasis, { radius: number; opacity: number; glow: number }> = {
  active: { radius: 0.09, opacity: 1, glow: 0.9 },
  idle: { radius: 0.05, opacity: 0.6, glow: 0.25 },
  dim: { radius: 0.05, opacity: 0.25, glow: 0.1 },
};

interface Props {
  linkCurve: LinkCurve;
  emphasis: LinkEmphasis;
}

export function LinkMesh({ linkCurve, emphasis }: Props): ReactElement {
  const { curve, link } = linkCurve;
  const look = LOOK[emphasis];
  const geometry = useMemo(
    () => new TubeGeometry(curve, 48, look.radius, 8, false),
    [curve, look.radius],
  );
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
        emissiveIntensity={look.glow}
        transparent
        opacity={look.opacity}
      />
    </mesh>
  );
}
