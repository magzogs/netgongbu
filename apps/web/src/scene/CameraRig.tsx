import { useEffect, useMemo, type ReactElement } from 'react';
import { CameraControls, type CameraControlsImpl } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
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
  panGlobe,
  registerControls,
  trackPoint,
  tuneGlobeControls,
  zoomGlobe,
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
  const canvas = useThree((s) => s.gl.domElement);
  const eventSource = useThree((s) => s.events.connected as HTMLElement | undefined);

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

  // Over the globe the wheel zooms towards the cursor (camera-controls' wheel is off there).
  useEffect(() => {
    const element = eventSource ?? canvas;
    const onWheel = (event: WheelEvent) => {
      const state = useViewer.getState();
      if (state.world?.view !== 'globe') return;
      event.preventDefault();
      zoomGlobe(event, state.world, state.cameraMode !== 'follow');
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [canvas, eventSource]);

  // Over the globe the left button moves the globe across the screen, as on the map (its
  // camera-controls action is off there). Following goes on: the shift only moves the view.
  useEffect(() => {
    const element = eventSource ?? canvas;
    let last: { x: number; y: number; id: number } | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType !== 'mouse') return;
      if (useViewer.getState().world?.view !== 'globe') return;
      last = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const onMove = (event: PointerEvent) => {
      if (!last || event.pointerId !== last.id) return;
      const rect = canvas.getBoundingClientRect();
      panGlobe(event.clientX - last.x, event.clientY - last.y, rect.width, rect.height);
      last = { ...last, x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      if (last && event.pointerId === last.id) last = null;
    };
    element.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [canvas, eventSource]);

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
        // would undo any turn: a right drag there ends following (the wheel still zooms while following).
        // Elsewhere the follow camera would undo a pan the same way, so a pan ends following too.
        const state = useViewer.getState();
        if (state.cameraMode === 'follow' && (state.world?.view === 'globe' || isPanning())) {
          state.setCameraMode('orbit');
        }
      }}
    />
  );
}
