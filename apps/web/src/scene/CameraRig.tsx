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
  isPanning,
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
    configureControls(world);
    if (cameraMode === 'follow') approach(world);
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
        configureControls(useViewer.getState().world);
      }}
      makeDefault
      onControlStart={() => {
        // Over the globe the follow camera turns round the centre to stay above the packet, and
        // would undo any drag: a drag there ends following (the wheel still zooms while following).
        // Elsewhere the follow camera would undo a pan the same way, so a pan ends following too.
        const state = useViewer.getState();
        if (state.cameraMode === 'follow' && (state.world?.view === 'globe' || isPanning())) {
          state.setCameraMode('orbit');
        }
      }}
    />
  );
}
