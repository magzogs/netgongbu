import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { frame, viewDirection } from '../src/engine/framing';

// A long, thin layout like the sample topology: 60 wide (x), 10 deep (z).
const points = [
  new Vector3(0, 0, 0),
  new Vector3(60, 0, 0),
  new Vector3(0, 3, 10),
  new Vector3(60, 3, 10),
];

function project(f: ReturnType<typeof frame>, aspect: number, p: Vector3): Vector3 {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 5000);
  camera.position.copy(f.eye);
  camera.lookAt(f.target);
  camera.updateMatrixWorld();
  return p.clone().project(camera);
}

describe('viewDirection', () => {
  it('looks from the front on landscape screens', () => {
    expect(viewDirection(points, 1.6).x).toBe(0);
  });

  it('looks along the long axis on portrait screens so the layout runs up the screen', () => {
    const d = viewDirection(points, 0.46);
    expect(Math.abs(d.x)).toBeGreaterThan(Math.abs(d.z));
  });
});

describe('frame', () => {
  it.each([
    ['landscape', 1.6],
    ['portrait', 0.46],
  ])('keeps every point on screen (%s)', (_name, aspect) => {
    const f = frame(points, 45, aspect, { top: 0, bottom: 0, left: 0, right: 0 });
    for (const p of points) {
      const ndc = project(f, aspect, p);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.91);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(0.91);
    }
  });

  it('centres the view in the uncovered area', () => {
    const none = frame(points, 45, 1.6, { top: 0, bottom: 0, left: 0, right: 0 });
    expect(none.focalOffset.x).toBeCloseTo(0);
    expect(none.focalOffset.y).toBeCloseTo(0);
    // Player at the bottom, inspector on the right: the scene moves up and to the left.
    const covered = frame(points, 45, 1.6, { top: 0.05, bottom: 0.3, left: 0, right: 0.25 });
    expect(covered.focalOffset.y).toBeGreaterThan(0);
    expect(covered.focalOffset.x).toBeGreaterThan(0);
    expect(covered.eye.distanceTo(covered.target)).toBeGreaterThan(
      none.eye.distanceTo(none.target),
    );
  });
});
