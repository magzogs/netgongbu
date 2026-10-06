import type { ReactElement } from 'react';
import { Canvas } from '@react-three/fiber';
import { useViewer, type World } from '../store/viewer';
import { CameraRig } from './CameraRig';
import { Ground } from './Ground';
import { LabelProjector } from './LabelProjector';
import { LinkMesh } from './LinkMesh';
import { NodeMesh } from './NodeMesh';
import { SCENE_BACKGROUND } from './theme';

function TopologyView({ world }: { world: World }): ReactElement {
  const selection = useViewer((s) => s.selection);
  const select = useViewer((s) => s.select);
  return (
    <group>
      {[...world.curves.values()].map((lc) => (
        <LinkMesh key={lc.link.id} linkCurve={lc} />
      ))}
      {world.topology.nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          selected={selection?.kind === 'node' && selection.id === node.id}
          onSelect={(id) => {
            select({ kind: 'node', id });
          }}
        />
      ))}
    </group>
  );
}

export function Scene(): ReactElement {
  const world = useViewer((s) => s.world);
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
      <fog attach="fog" args={[SCENE_BACKGROUND, 120, 260]} />
      <hemisphereLight args={['#dbeafe', '#0f172a', 0.9]} />
      <directionalLight position={[30, 50, 25]} intensity={1.4} />
      <Ground zones={world?.topology.zones ?? []} />
      {world && <TopologyView world={world} />}
      <CameraRig />
      <LabelProjector />
    </Canvas>
  );
}
