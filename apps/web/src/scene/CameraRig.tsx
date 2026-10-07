import { useEffect, useMemo, type ReactElement } from 'react';
import { CameraControls, type CameraControlsImpl } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { showAll } from '../commands';
import { useViewer } from '../store/viewer';
import {
  approach,
  configureControls,
  followHeight,
  followPoint,
  keepFocalShift,
  registerControls,
  trackPoint,
  tuneGlobeControls,
} from './camera';

/**
 * Camera handling for each view (see camera.ts). Frames the whole topology when it opens; in
 * follow mode keeps the current packet centred.
 */
export function CameraRig(): ReactElement {
  const timeline = useViewer((s) => s.timeline);
  const world = useViewer((s) => s.world);
  const cameraMode = useViewer((s) => s.cameraMode);
  const scratch = useMemo(() => new Vector3(), []);

  // Before framing: the globe turns the camera's up to the Earth's axis.
  useEffect(() => {
    const following = cameraMode === 'follow';
    configureControls(world, following);
    if (following) approach(world);
  }, [world, cameraMode]);

  // Frame a newly opened scenario (or view) once the player card is on screen, so its height
  // is known. While following, keep following instead.
  useEffect(() => {
    if (!timeline) return;
    const frameId = requestAnimationFrame(() => {
      const state = useViewer.getState();
      if (state.cameraMode === 'follow') approach(state.world);
      else showAll(false);
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [timeline]);

  useFrame(() => {
    const state = useViewer.getState();
    const current = state.world;
    if (!current) return;
    if (current.view === 'globe') tuneGlobeControls(current);
    keepFocalShift(current);
    if (state.cameraMode !== 'follow') return;
    const point = followPoint(state, scratch);
    if (point) trackPoint(point, current, followHeight(state));
  });

  return (
    <CameraControls
      ref={(instance: CameraControlsImpl | null) => {
        registerControls(instance);
        configureControls(useViewer.getState().world, useViewer.getState().cameraMode === 'follow');
      }}
      makeDefault
    />
  );
}
