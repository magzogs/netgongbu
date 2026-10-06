import { useEffect, useMemo, type ReactElement } from 'react';
import { CameraControls, type CameraControlsImpl } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { showAll } from '../commands';
import { useViewer } from '../store/viewer';
import { approach, followPoint, registerControls, setPanEnabled, trackPoint } from './camera';

/**
 * Orbit (left drag / one finger), pan (right drag / two fingers) and zoom (wheel / pinch).
 * Frames the whole topology when it opens; in follow mode keeps the current packet centred.
 */
export function CameraRig(): ReactElement {
  const timeline = useViewer((s) => s.timeline);
  const cameraMode = useViewer((s) => s.cameraMode);
  // A globe can be looked at from any side; a floor plan only from above.
  const onGlobe = useViewer((s) => s.world?.topology.globe !== undefined);
  const scratch = useMemo(() => new Vector3(), []);

  // Frame a newly opened scenario once the player card is on screen, so its height is known.
  useEffect(() => {
    if (!timeline) return;
    const frameId = requestAnimationFrame(() => {
      showAll(false);
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [timeline]);

  useEffect(() => {
    const following = cameraMode === 'follow';
    setPanEnabled(!following);
    if (following) approach();
  }, [cameraMode]);

  useFrame(() => {
    const state = useViewer.getState();
    if (state.cameraMode !== 'follow') return;
    const point = followPoint(state, scratch);
    if (point) trackPoint(point, state.world?.topology.globe);
  });

  return (
    <CameraControls
      ref={(instance: CameraControlsImpl | null) => {
        registerControls(instance);
      }}
      makeDefault
      minDistance={3}
      maxDistance={onGlobe ? 600 : 220}
      maxPolarAngle={onGlobe ? Math.PI : Math.PI * 0.48}
      dollyToCursor
    />
  );
}
