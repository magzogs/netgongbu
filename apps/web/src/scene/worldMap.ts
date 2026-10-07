import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology as TopoJson } from 'topojson-specification';
import countries from 'world-atlas/countries-110m.json';
import { GRATICULE, LAND, OCEAN } from './theme';

// Natural Earth 1:110m countries (public domain) via world-atlas: land and sea as a picture of
// the whole world (longitude and latitude as x and y), shared by the globe and the flat map, and
// the borders as lines.

const world = countries as unknown as TopoJson<{ countries: GeometryCollection }>;

type Ring = [number, number][];

/** 2048 × 1024: about 20 km a pixel, enough under the border lines drawn on top. */
const WIDTH = 2048;
const HEIGHT = 1024;

/**
 * A ring with continuous longitudes: steps over the ±180° line become steps past it. A ring that
 * goes all the way round (Antarctica) is closed along the pole it surrounds.
 */
function unwrap(ring: readonly number[][]): Ring {
  const out: Ring = [];
  let shift = 0;
  let previous: number | null = null;
  for (const [lon = 0, lat = 0] of ring) {
    if (previous !== null) {
      if (lon - previous > 180) shift -= 360;
      else if (lon - previous < -180) shift += 360;
    }
    previous = lon;
    out.push([lon + shift, lat]);
  }
  const first = out[0];
  const last = out.at(-1);
  if (first && last && Math.abs(last[0] - first[0]) > 180) {
    const pole = out.reduce((sum, [, lat]) => sum + lat, 0) < 0 ? -90 : 90;
    out.push([last[0], pole], [first[0], pole]);
  }
  return out;
}

function polygonsOf(): Ring[][] {
  const land = feature(world, world.objects.countries);
  const polygons: Ring[][] = [];
  for (const f of land.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') polygons.push(g.coordinates.map(unwrap));
    else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates.map((p) => p.map(unwrap)));
  }
  return polygons;
}

function drawWorld(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Every 30° of latitude and longitude, faint, so turning the globe has something to follow.
  ctx.strokeStyle = GRATICULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * WIDTH;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * HEIGHT;
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
  }
  ctx.stroke();

  ctx.fillStyle = LAND;
  for (const polygon of polygonsOf()) {
    // Drawn three times over, so parts unwrapped past ±180° land on the other edge.
    for (const offset of [-360, 0, 360]) {
      ctx.beginPath();
      for (const ring of polygon) {
        ring.forEach(([lon, lat], i) => {
          const x = ((lon + offset + 180) / 360) * WIDTH;
          const y = ((90 - lat) / 180) * HEIGHT;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
  }
  return canvas;
}

let canvas: HTMLCanvasElement | null = null;

/**
 * The world as a texture: longitude -180..180 left to right, latitude 90..-90 top to bottom,
 * which is how three.js wraps a picture round a sphere. `shiftLon` rolls it sideways so that
 * longitude is at the left edge instead (for a flat map centred elsewhere).
 */
export function worldTexture(shiftLon = -180): CanvasTexture {
  canvas ??= drawWorld();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.offset.x = (shiftLon + 180) / 360;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Border and coastline segments as line pieces, each end placed by `point` (lon, lat).
 * Segments `point` cannot draw in one piece (it returns null) are left out.
 */
export function bordersGeometry(
  point: (lon: number, lat: number) => [number, number, number],
  skip?: (a: [number, number, number], b: [number, number, number]) => boolean,
): BufferGeometry {
  const lines = mesh(world, world.objects.countries).coordinates;
  const positions: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if (!a || !b) continue;
      const pa = point(a[0] ?? 0, a[1] ?? 0);
      const pb = point(b[0] ?? 0, b[1] ?? 0);
      if (skip?.(pa, pb)) continue;
      positions.push(...pa, ...pb);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}
