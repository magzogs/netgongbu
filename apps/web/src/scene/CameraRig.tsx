import { useEffect, useMemo, type ReactElement } from 'react';
import { CameraControls, type CameraControlsImpl } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useViewer } from '../store/viewer';
import {
  approach,
  followPoint,
  frameTopology,
  registerControls,
  setPanEnabled,
  trackPoint,
} from './camera';

/**
 * Orbit (left drag / one finger), pan (right drag / two fingers) and zoom (wheel / pinch).
 * Frames the whole topology when it opens; in follow mode keeps the current packet centred.
 */
export function CameraRig(): ReactElement {
  const world = useViewer((s) => s.world);
  const cameraMode = useViewer((s) => s.cameraMode);
  const scratch = useMemo(() => new Vector3(), []);

  useEffect(() => {
    if (world) frameTopology(world.topology, false);
  }, [world]);

  useEffect(() => {
    const following = cameraMode === 'follow';
    setPanEnabled(!following);
    if (following) approach();
  }, [cameraMode]);

  useFrame(() => {
    const state = useViewer.getState();
    if (state.cameraMode !== 'follow') return;
    const point = followPoint(state, scratch);
    if (point) trackPoint(point);
  });

  return (
    <CameraControls
      ref={(instance: CameraControlsImpl | null) => {
        registerControls(instance);
      }}
      makeDefault
      minDistance={3}
      maxDistance={220}
      maxPolarAngle={Math.PI * 0.48}
      dollyToCursor
    />
  );
}
