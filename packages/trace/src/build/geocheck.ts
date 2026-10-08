import { distanceKm, type Geo } from '@netgongbu/schema';

/** Light in optical fibre travels about 200 km per millisecond. */
export const FIBER_KM_PER_MS = 200;
/** Slack for the learner's own location being approximate. */
const TOLERANCE_KM = 150;

export interface GeoVerdict {
  plausible: boolean;
  /** How far away a reply after `rttMs` can physically come from. */
  maxKm: number | null;
  distanceKm: number | null;
}

/**
 * Whether a router really can be where the location database puts it: a reply that came back
 * after `rttMs` cannot have travelled further than light in fibre in half that time. Anycast
 * addresses (one IP served from many places, as CDNs and public DNS do) and stale database
 * entries fail this test — a lesson in itself.
 */
export function checkGeo(origin: Geo | null, geo: Geo, rttMs: number | null): GeoVerdict {
  if (!origin || rttMs === null) return { plausible: true, maxKm: null, distanceKm: null };
  const maxKm = (rttMs / 2) * FIBER_KM_PER_MS;
  const distance = distanceKm(origin, geo);
  return { plausible: distance <= maxKm + TOLERANCE_KM, maxKm, distanceKm: distance };
}

export function implausibleNote(geo: Geo, rttMs: number, verdict: GeoVerdict): string {
  const place = geo.place ?? `${geo.lat.toFixed(1)}, ${geo.lon.toFixed(1)}`;
  return (
    `위치 데이터베이스에는 ${place}(약 ${String(Math.round(verdict.distanceKm ?? 0))} km 떨어진 곳)로 나오지만, ` +
    `왕복 ${rttMs.toFixed(1)} ms 안에 빛이 광섬유로 다녀올 수 있는 거리는 최대 약 ${String(Math.round(verdict.maxKm ?? 0))} km입니다. ` +
    '같은 IP 주소를 여러 지역에서 함께 쓰는 애니캐스트이거나 데이터베이스가 틀린 것으로, 실제로는 훨씬 가까운 곳에서 응답했습니다.'
  );
}
