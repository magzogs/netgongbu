import { useFrame } from '@react-three/fiber';
import { useViewer } from '../store/viewer';

/** Longest step per frame, so returning to a background tab does not skip whole beats. */
const MAX_FRAME_SECONDS = 0.1;

/** Advances playback from the render loop. */
export function PlaybackTicker(): null {
  useFrame((_, delta) => {
    useViewer.getState().advance(Math.min(delta, MAX_FRAME_SECONDS));
  });
  return null;
}
