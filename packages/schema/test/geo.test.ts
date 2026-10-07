import { describe, expect, it } from 'vitest';
import {
  distanceKm,
  geoToPosition,
  globeTransform,
  northAxis,
  positionToGeo,
  type Globe,
} from '../src';

const seoul = { lat: 37.57, lon: 126.98 };
const globe: Globe = { center: [0, -50, 0], radius: 50, focus: seoul };

describe('globe transform', () => {
  it('puts the focus at the top of the globe', () => {
    const [x, y, z] = geoToPosition(globe, seoul.lat, seoul.lon);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('turns north towards -z, east towards +x', () => {
    const north = globeTransform(seoul).direction(seoul.lat + 5, seoul.lon);
    const east = globeTransform(seoul).direction(seoul.lat, seoul.lon + 5);
    expect(north[2]).toBeLessThan(-0.05);
    expect(Math.abs(north[0])).toBeLessThan(1e-6);
    expect(east[0]).toBeGreaterThan(0.05);
  });

  it('keeps every point on the sphere and lifts above it', () => {
    const p = geoToPosition(globe, 34.05, -118.24, 2);
    expect(Math.hypot(p[0], p[1] + 50, p[2])).toBeCloseTo(52, 6);
  });

  it('measures great-circle distances', () => {
    expect(distanceKm(seoul, { lat: 34.05, lon: -118.24 })).toBeGreaterThan(9500);
    expect(distanceKm(seoul, { lat: 34.05, lon: -118.24 })).toBeLessThan(9700);
  });

  it('finds the place and height of a position (the inverse)', () => {
    for (const [lat, lon] of [
      [34.05, -118.24],
      [-33.87, 151.21],
      [64.15, -21.94],
      [0, 179.9],
    ] as const) {
      const back = positionToGeo(globe, geoToPosition(globe, lat, lon, 0.3));
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lon).toBeCloseTo(lon, 6);
      expect(back.height).toBeCloseTo(0.3, 6);
    }
  });

  it('points the axis at the North Pole', () => {
    const [x, y, z] = northAxis(globe);
    const pole = geoToPosition(globe, 90, 0);
    expect(x * globe.radius).toBeCloseTo(pole[0] - globe.center[0], 6);
    expect(y * globe.radius).toBeCloseTo(pole[1] - globe.center[1], 6);
    expect(z * globe.radius).toBeCloseTo(pole[2] - globe.center[2], 6);
    // Seoul is in the northern hemisphere: the pole leans towards the top of the globe.
    expect(y).toBeGreaterThan(0.5);
  });
});
