import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useCursor } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Quaternion, Vector3, type Camera, type Group } from 'three';
import type { Globe } from '@netgongbu/schema';
import {
  foldedClusters,
  OPEN_PIXELS,
  groupFolds,
  sameFolds,
  shouldJoin,
  zoneState,
  type FoldedCluster,
} from '../engine/clusters';
import { upAt } from '../engine/curves';
import { openZone, selectZone } from '../commands';
import { useViewer, type World } from '../store/viewer';
import { MARKER_MAX, nodeScale, worldPerPixel } from './markers';
import { NODE_HEIGHT, NodeShape } from './NodeShape';
import { ACCENT, BUSY, NODE_COLORS } from './theme';

/** A folded zone's marker is this much larger than a node's, so it reads as a group. */
export const CLUSTER_SCALE = 1.25;
const LABEL_GAP = 0.35;

/** The world's zones as now folded, for drawing. */
export function useFoldedClusters(): FoldedCluster[] {
  const clusters = useViewer((s) => s.world?.clusters);
  const folds = useViewer((s) => s.folds);
  return useMemo(() => foldedClusters(clusters ?? [], folds), [clusters, folds]);
}

/**
 * Measures each zone on screen every frame: keeps the zones the learner has not opened folded,
 * folds an open one again once it gets small, and joins folded zones that come close on screen
 * (engine/clusters.ts). The store changes only when the folds do, so React renders nothing while
 * the camera simply moves.
 */
export function ClusterTracker({ world }: { world: World }): null {
  const scratch = useMemo(() => new Vector3(), []);
  /** Open zones that have been drawn wide enough since they were opened. */
  const grown = useMemo(() => new Set<string>(), []);
  useFrame(({ camera, size }) => {
    if (world.clusters.length === 0) return;
    const { folds, setFolds, openZones, setZonesOpen } = useViewer.getState();
    const foldOf = new Map<string, string>();
    for (const f of folds) for (const id of f.zoneIds) foldOf.set(id, f.key);
    const refold: string[] = [];
    const shut = world.clusters.filter((c) => {
      const opened = openZones.has(c.zoneId);
      if (!opened) grown.delete(c.zoneId);
      const pixels = (2 * c.radius) / worldPerPixel(c.center, camera, size.height);
      if (opened && pixels >= OPEN_PIXELS) grown.add(c.zoneId);
      const state = zoneState(pixels, opened, grown.has(c.zoneId));
      if (state === 'refold') refold.push(c.zoneId);
      return state !== 'open';
    });
    if (refold.length > 0) setZonesOpen(refold, false);
    const onScreen = shut.map((c) => {
      scratch.copy(c.center).project(camera);
      return { x: ((scratch.x + 1) / 2) * size.width, y: ((1 - scratch.y) / 2) * size.height };
    });
    const next = groupFolds(
      shut.map((c) => c.zoneId),
      (i, j) => {
        const a = onScreen[i];
        const b = onScreen[j];
        const fa = foldOf.get(shut[i]?.zoneId ?? '');
        const joined = fa !== undefined && fa === foldOf.get(shut[j]?.zoneId ?? '');
        return !!a && !!b && shouldJoin(Math.hypot(a.x - b.x, a.y - b.y), joined);
      },
    );
    if (!sameFolds(folds, next)) setFolds(next);
  });
  return null;
}

/** Where a folded zone's label sits: just above its marker, which grows and shrinks with zoom. */
export function clusterTopSource(
  cluster: FoldedCluster,
  globe: Globe | undefined,
): (camera: Camera, viewportHeight: number) => Vector3 {
  const up = upAt(cluster.center.toArray(), globe);
  const height = NODE_HEIGHT[cluster.type] + LABEL_GAP;
  const out = new Vector3();
  return (camera, viewportHeight) =>
    out
      .copy(cluster.center)
      .addScaledVector(
        up,
        height * CLUSTER_SCALE * nodeScale(cluster.center, camera, viewportHeight, MARKER_MAX),
      );
}

interface Props {
  cluster: FoldedCluster;
  globe: Globe | undefined;
  selected: boolean;
  busy: boolean;
}

/** One marker for a folded zone: a click selects it, a double-click opens it into its nodes. */
export function ClusterMesh({ cluster, globe, selected, busy }: Props): ReactElement {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const tilt = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        upAt(cluster.center.toArray(), globe),
      ),
    [cluster, globe],
  );
  const group = useRef<Group>(null);
  useFrame(({ camera, size }) => {
    group.current?.scale.setScalar(
      CLUSTER_SCALE * nodeScale(cluster.center, camera, size.height, MARKER_MAX),
    );
  });
  const pick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    selectZone(cluster.key);
  };
  const open = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    openZone(cluster.key);
  };
  return (
    <group ref={group} position={cluster.center} quaternion={tilt}>
      <group
        scale={hovered ? 1.06 : 1}
        onClick={pick}
        onDoubleClick={open}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => {
          setHovered(false);
        }}
      >
        <NodeShape type={cluster.type} color={NODE_COLORS[cluster.type]} />
      </group>
      {/* A second ring marks it as a group of nodes. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[1.05, 1.13, 48]} />
        <meshBasicMaterial color={NODE_COLORS[cluster.type]} transparent opacity={0.7} />
      </mesh>
      {busy && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.5, 1.62, 48]} />
          <meshBasicMaterial color={BUSY} transparent opacity={0.85} />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[1.25, 1.4, 48]} />
          <meshBasicMaterial color={ACCENT} />
        </mesh>
      )}
    </group>
  );
}
