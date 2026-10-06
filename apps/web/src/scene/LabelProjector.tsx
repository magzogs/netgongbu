import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { projectLabels } from './labels';

/** Runs inside the canvas and moves the DOM labels after the camera has updated. */
export function LabelProjector(): null {
  const scratch = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    projectLabels(camera, size.width, size.height, scratch);
  });
  return null;
}
