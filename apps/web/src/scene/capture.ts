import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * A picture of the 3D view for a model that can see. The canvas is drawn again and read in the
 * same task, so the drawing buffer need not be preserved between frames (which costs speed).
 * The DOM labels over the canvas are not in it.
 */

let grab: ((maxWidth: number) => string | null) | null = null;

/** JPEG data URL of the 3D view, at most `maxWidth` pixels wide; null before the scene is up. */
export function captureScene(maxWidth = 1024): string | null {
  return grab?.(maxWidth) ?? null;
}

/** Inside the canvas: lets captureScene draw it. */
export function SceneCapture(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    grab = (maxWidth) => {
      gl.render(scene, camera);
      const source = gl.domElement;
      const scale = Math.min(1, maxWidth / Math.max(1, source.width));
      const out = document.createElement('canvas');
      out.width = Math.round(source.width * scale);
      out.height = Math.round(source.height * scale);
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.82);
    };
    return () => {
      grab = null;
    };
  }, [gl, scene, camera]);
  return null;
}
