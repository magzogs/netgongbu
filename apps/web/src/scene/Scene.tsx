import { useMemo, type ReactElement } from 'react';
import { Canvas } from '@react-three/fiber';
import { useViewer, type World } from '../store/viewer';
import { focusNode, selectNode } from '../commands';
import { CameraRig } from './CameraRig';
import { GlobeView } from './GlobeView';
import { Ground } from './Ground';
import { LabelProjector } from './LabelProjector';
import { LinkMesh, type LinkEmphasis } from './LinkMesh';
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
  const emphasisOf = (linkId: string): LinkEmphasis => {
    if (activeLinks.size === 0) return 'idle';
    return activeLinks.has(linkId) ? 'active' : 'dim';
  };
  return (
    <group>
      {[...world.curves.values()].map((lc) => (
        <LinkMesh key={lc.link.id} linkCurve={lc} emphasis={emphasisOf(lc.link.id)} />
      ))}
      {world.topology.nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          globe={world.topology.globe}
          selected={selection?.kind === 'node' && selection.id === node.id}
          busy={busyNodes.has(node.id)}
          onSelect={selectNode}
          onFocus={focusNode}
        />
      ))}
      <Packets />
    </group>
  );
}

export function Scene(): ReactElement {
  const world = useViewer((s) => s.world);
  // Fog starts well beyond the topology so large (globe) scenes are not washed out.
  const fogNear = world?.topology.globe ? world.topology.globe.radius * 6 : 120;
  const select = useViewer((s) => s.select);
  return (
    <Canvas
      className="scene"
      camera={{ fov: 45, near: 0.1, far: 600, position: [25, 40, 60] }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        select(null);
      }}
    >
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <fog attach="fog" args={[SCENE_BACKGROUND, fogNear, fogNear * 2.2]} />
      <hemisphereLight args={['#dbeafe', '#0f172a', 0.9]} />
      <directionalLight position={[30, 50, 25]} intensity={1.4} />
      <Ground zones={world?.topology.zones ?? []} globe={world?.topology.globe} />
      {world?.topology.globe && <GlobeView globe={world.topology.globe} />}
      {world && <TopologyView world={world} />}
      <CameraRig />
      <PlaybackTicker />
      <LabelProjector />
    </Canvas>
  );
}
