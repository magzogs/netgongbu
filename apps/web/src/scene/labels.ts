import { useCallback, type RefCallback } from 'react';
import type { Camera, Vector3 } from 'three';

/**
 * DOM labels that follow points in the 3D scene.
 *
 * Labels are ordinary react-dom elements in one overlay above the canvas; LabelProjector moves
 * them every frame. This avoids drei <Html>, which creates and synchronously unmounts a React root
 * per label (noisy and racy when labels come and go every beat).
 */

export type AnchorSource = Vector3 | (() => Vector3 | null);

interface Anchor {
  el: HTMLElement;
  source: AnchorSource;
}

const anchors = new Map<string, Anchor>();

/** Ref for a label element that should sit on `source` (a fixed point or a moving getter). */
export function useLabelAnchor(id: string, source: AnchorSource): RefCallback<HTMLElement> {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) {
        el.style.visibility = 'hidden';
        anchors.set(id, { el, source });
      } else {
        anchors.delete(id);
      }
    },
    [id, source],
  );
}

/** Places every label at its projected screen position; hides labels behind the camera. */
export function projectLabels(
  camera: Camera,
  width: number,
  height: number,
  scratch: Vector3,
): void {
  for (const { el, source } of anchors.values()) {
    const point = typeof source === 'function' ? source() : source;
    if (!point) {
      el.style.visibility = 'hidden';
      continue;
    }
    scratch.copy(point).project(camera);
    if (scratch.z > 1) {
      el.style.visibility = 'hidden';
      continue;
    }
    const x = ((scratch.x + 1) / 2) * width;
    const y = ((1 - scratch.y) / 2) * height;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.style.visibility = 'visible';
  }
}
