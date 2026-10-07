import { useCallback, type RefCallback } from 'react';
import type { Camera, Vector3 } from 'three';

/**
 * DOM labels that follow points in the 3D scene.
 *
 * Labels are ordinary react-dom elements in one overlay above the canvas; LabelProjector moves
 * them every frame. This avoids drei <Html>, which creates and synchronously unmounts a React root
 * per label (noisy and racy when labels come and go every beat).
 *
 * Node labels take part in decluttering: where labels would cover each other, the first (by
 * priority) keeps its full label and the others shrink to their number badge, lined up beside it.
 */

/** A fixed point, or a getter for a moving one (or one that depends on the camera). */
export type AnchorSource = Vector3 | ((camera: Camera, viewportHeight: number) => Vector3 | null);

interface Anchor {
  el: HTMLElement;
  source: AnchorSource;
  /** Declutter priority (lower wins); undefined: always shown in full. */
  priority: number | undefined;
  /** Size of the full label, measured by a ResizeObserver. */
  size: { w: number; h: number } | null;
  compact: boolean;
}

const anchors = new Map<string, Anchor>();
const byElement = new WeakMap<Element, Anchor>();

const observer =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => {
        for (const entry of entries) {
          const anchor = entry.target.parentElement && byElement.get(entry.target.parentElement);
          const { width, height } = entry.contentRect;
          // A compact label hides its full form (size 0): keep the last real size.
          if (anchor && width > 0 && height > 0) anchor.size = { w: width, h: height };
        }
      });

/**
 * Ref for a label element that should sit on `source` (a fixed point or a moving getter).
 * With a `priority` it is decluttered: its first child is the full label, and an element with
 * the class `label-badge` is shown instead when it would cover another label.
 */
export function useLabelAnchor(
  id: string,
  source: AnchorSource,
  priority?: number,
): RefCallback<HTMLElement> {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) {
        el.style.visibility = 'hidden';
        const anchor: Anchor = { el, source, priority, size: null, compact: false };
        anchors.set(id, anchor);
        byElement.set(el, anchor);
        const full = el.firstElementChild;
        if (priority !== undefined && full) observer?.observe(full);
      } else {
        const old = anchors.get(id);
        const full = old?.el.firstElementChild;
        if (full) observer?.unobserve(full);
        anchors.delete(id);
      }
    },
    [id, source, priority],
  );
}

/** A sphere that hides what is behind it (the globe). */
export interface Occluder {
  center: Vector3;
  radius: number;
}

/** Whether the line of sight from `eye` to `point` passes through the sphere first. */
export function hiddenBehind(eye: Vector3, point: Vector3, sphere: Occluder): boolean {
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return false;
  const [ux, uy, uz] = [dx / length, dy / length, dz / length];
  const ox = eye.x - sphere.center.x;
  const oy = eye.y - sphere.center.y;
  const oz = eye.z - sphere.center.z;
  const b = ox * ux + oy * uy + oz * uz;
  const c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
  const disc = b * b - c;
  if (disc <= 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < length - 0.01;
}

/** Size used until a label has been measured. */
const GUESS = { w: 96, h: 30 };
/** Badge width plus the gap after it, and the gap before the first badge. */
const BADGE_STEP = 24;
const BADGE_GAP = 4;
/** Labels closer than this (CSS pixels) also count as covering each other. */
const MARGIN = 2;

interface Leader {
  x: number;
  y: number;
  w: number;
  h: number;
  members: number;
}

function setCompact(anchor: Anchor, compact: boolean): void {
  if (anchor.compact === compact) return;
  anchor.compact = compact;
  if (compact) anchor.el.dataset.compact = '';
  else delete anchor.el.dataset.compact;
}

function place(el: HTMLElement, x: number, y: number): void {
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  el.style.visibility = 'visible';
}

/**
 * Places every label at its projected screen position; hides labels behind the camera and,
 * with an occluder, those on the far side of the globe. Node labels that would cover a label
 * placed before them become number badges in a row beside it.
 */
export function projectLabels(
  camera: Camera,
  width: number,
  height: number,
  scratch: Vector3,
  occluder?: Occluder,
): void {
  const ranked: { anchor: Anchor; x: number; y: number }[] = [];
  for (const anchor of anchors.values()) {
    const { el, source } = anchor;
    const point = typeof source === 'function' ? source(camera, height) : source;
    if (!point || (occluder && hiddenBehind(camera.position, point, occluder))) {
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
    if (anchor.priority === undefined) place(el, x, y);
    else ranked.push({ anchor, x, y });
  }

  ranked.sort((a, b) => (a.anchor.priority ?? 0) - (b.anchor.priority ?? 0));
  const leaders: Leader[] = [];
  for (const { anchor, x, y } of ranked) {
    const { w, h } = anchor.size ?? GUESS;
    // Labels sit above their point: compare the boxes' centres.
    const covered = leaders.find(
      (l) =>
        Math.abs(x - l.x) < (w + l.w) / 2 + MARGIN &&
        Math.abs(y - h / 2 - (l.y - l.h / 2)) < (h + l.h) / 2 + MARGIN,
    );
    if (covered) {
      setCompact(anchor, true);
      place(
        anchor.el,
        covered.x + covered.w / 2 + BADGE_GAP + covered.members * BADGE_STEP,
        covered.y,
      );
      covered.members += 1;
    } else {
      setCompact(anchor, false);
      place(anchor.el, x, y);
      leaders.push({ x, y, w, h, members: 0 });
    }
  }
}
