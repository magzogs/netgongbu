import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useViewer } from '../store/viewer';
import { projectLabels, type Occluder } from './labels';

/** Runs inside the canvas and moves the DOM labels after the camera has updated. */
export function LabelProjector(): null {
  const scratch = useMemo(() => new Vector3(), []);
  const globe = useViewer((s) => s.world?.topology.globe);
  // Slightly inside the surface, so labels of nodes standing on it stay visible.
  const occluder = useMemo<Occluder | undefined>(
    () =>
      globe ? { center: new Vector3(...globe.center), radius: globe.radius * 0.985 } : undefined,
    [globe],
  );
  useFrame(({ camera, size }) => {
    projectLabels(camera, size.width, size.height, scratch, occluder);
  });
  return null;
}
