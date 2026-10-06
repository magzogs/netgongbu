import { useEffect, useRef, type ReactElement } from 'react';
import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { boundsOf } from '../engine/curves';
import { useViewer } from '../store/viewer';

/** Direction the camera looks from when a topology opens: above and in front. */
const VIEW_DIRECTION = new Vector3(0, 0.8, 1).normalize();

/** Distance at which a sphere of `radius` fits both the vertical and horizontal field of view. */
function fitDistance(camera: PerspectiveCamera, radius: number): number {
  const vHalf = (camera.fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  return radius / Math.sin(Math.min(vHalf, hHalf));
}

/**
 * Orbit (left drag / one finger), pan (right drag / two fingers) and zoom (wheel / pinch).
 * Frames the whole topology whenever a new one opens.
 */
export function CameraRig(): ReactElement {
  const controls = useRef<CameraControls>(null);
  const world = useViewer((s) => s.world);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const ctl = controls.current;
    if (!world || !ctl || !(camera instanceof PerspectiveCamera)) return;
    const box = boundsOf(world.topology);
    const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    const eye = center.clone().addScaledVector(VIEW_DIRECTION, fitDistance(camera, radius));
    void ctl.setLookAt(eye.x, eye.y, eye.z, center.x, center.y, center.z, false);
  }, [world, camera]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={3}
      maxDistance={220}
      maxPolarAngle={Math.PI * 0.48}
      dollyToCursor
    />
  );
}
