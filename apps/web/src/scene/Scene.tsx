import { useMemo, useRef, type ReactElement } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Vector3, type DirectionalLight } from 'three';
import type { Globe, Vec3 } from '@netgongbu/schema';
import { useViewer, type World } from '../store/viewer';
import { focusNode, selectNode } from '../commands';
import { foldedNodes } from '../engine/clusters';
import { CameraRig } from './CameraRig';
import { ClusterMesh, ClusterTracker, useFoldedClusters } from './Clusters';
import { SceneCapture } from './capture';
import { GlobeView } from './GlobeView';
import { Ground } from './Ground';
import { LabelProjector } from './LabelProjector';
import { LinkMesh, type LinkEmphasis } from './LinkMesh';
import { markerMax } from './markers';
import { NodeMesh } from './NodeMesh';
import { Packets } from './Packets';
import { PlaybackTicker } from './PlaybackTicker';
import { SCENE_BACKGROUND } from './theme';

function TopologyView({ world }: { world: World }): ReactElement {
  const selection = useViewer((s) => s.selection);
  const beat = useViewer((s) => s.timeline?.beats[s.beatIndex]);
  const activeLinks = useMemo(
    () => new Set(beat?.routes.flatMap((r) => r.segments.map((seg) => seg.linkId))),
    [beat],
  );
  const busyNodes = useMemo(() => new Set(beat?.beat.nodeActions?.map((a) => a.node)), [beat]);
  const clusters = useFoldedClusters();
  const drawnCurves = useViewer((s) => s.drawnCurves);
  const folded = useMemo(() => foldedNodes(clusters), [clusters]);
  const selectedNode = selection?.kind === 'node' ? selection.id : null;
  const emphasisOf = (linkId: string): LinkEmphasis => {
    if (activeLinks.size === 0) return 'idle';
    return activeLinks.has(linkId) ? 'active' : 'dim';
  };
  return (
    <group>
      {/* Links into a folded zone end at its marker (see foldLinkCurves). */}
      {[...drawnCurves.values()]
        // A link inside a folded zone would be a dot under its marker.
        .filter((lc) => {
          const zone = folded.get(lc.link.a);
          return !zone || zone !== folded.get(lc.link.b);
        })
        .map((lc) => (
          <LinkMesh
            key={lc.link.id}
            linkCurve={lc}
            emphasis={emphasisOf(lc.link.id)}
            thin={world.markers}
          />
        ))}
      {clusters.map((c) => (
        <ClusterMesh
          key={c.key}
          cluster={c}
          globe={world.topology.globe}
          selected={selectedNode !== null && c.members.includes(selectedNode)}
          busy={c.members.some((id) => busyNodes.has(id))}
        />
      ))}
      {world.topology.nodes
        .filter((node) => !folded.has(node.id))
        .map((node) => (
          <NodeMesh
            key={node.id}
            node={node}
            globe={world.topology.globe}
            markerMax={markerMax(world, node)}
            selected={selection?.kind === 'node' && selection.id === node.id}
            busy={busyNodes.has(node.id)}
            onSelect={selectNode}
            onFocus={focusNode}
          />
        ))}
      <Packets markers={world.markers} />
      <ClusterTracker world={world} />
    </group>
  );
}

const SUN: Vec3 = [30, 50, 25];
const scratch = new Vector3();

/**
 * A sun fixed over a floor or map. A globe is turned every way, so there the light comes from
 * the camera (a little from the upper left, for some shading) and whatever side faces the viewer
 * is lit.
 */
function Lights({ globe }: { globe: Globe | undefined }): ReactElement {
  const light = useRef<DirectionalLight>(null);
  useFrame(({ camera }) => {
    const sun = light.current;
    if (!sun) return;
    if (!globe) {
      sun.position.set(...SUN);
      sun.target.position.set(0, 0, 0);
    } else {
      const reach = camera.position.distanceTo(sun.target.position) * 0.35;
      sun.target.position.set(...globe.center);
      sun.position
        .copy(camera.position)
        .addScaledVector(scratch.set(0, 1, 0).applyQuaternion(camera.quaternion), reach)
        .addScaledVector(scratch.set(-1, 0, 0).applyQuaternion(camera.quaternion), reach * 0.6);
    }
    sun.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={['#dbeafe', '#0f172a', globe ? 0.55 : 0.9]} />
      <directionalLight ref={light} position={SUN} intensity={globe ? 1.9 : 1.4} />
    </>
  );
}

export function Scene(): ReactElement {
  const world = useViewer((s) => s.world);
  // Fog starts well beyond the topology so large (globe, world map) scenes are not washed out.
  const radius = world?.source.globe?.radius;
  const fogNear = radius ? radius * 6 : 120;
  const select = useViewer((s) => s.select);
  const folds = useViewer((s) => s.folds);
  // A folded zone is one marker: its area would only mark where its parts are hidden.
  const zones = useMemo(() => {
    const folded = new Set(folds.flatMap((f) => f.zoneIds));
    return (world?.topology.zones ?? []).filter((z) => !folded.has(z.id));
  }, [world, folds]);
  return (
    <Canvas
      className="scene"
      camera={{ fov: 45, near: 0.1, far: 900, position: [25, 40, 60] }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        select(null);
      }}
    >
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <fog attach="fog" args={[SCENE_BACKGROUND, fogNear, fogNear * 2.2]} />
      <Lights globe={world?.topology.globe} />
      <Ground zones={zones} globe={world?.topology.globe} flatMap={world?.flatMap ?? null} />
      {world?.topology.globe && <GlobeView globe={world.topology.globe} />}
      {world && <TopologyView world={world} />}
      <CameraRig />
      <PlaybackTicker />
      <LabelProjector />
      <SceneCapture />
    </Canvas>
  );
}
