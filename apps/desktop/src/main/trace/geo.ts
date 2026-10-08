import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import maxmind, { type CityResponse, type Reader } from 'maxmind';
import type { Geo } from '@netgongbu/schema';

export const GEO_ATTRIBUTION = 'IP Geolocation by DB-IP (db-ip.com), CC BY 4.0';
const FILE = 'dbip-city-lite.mmdb';

/** "2026-10" for the given date (DB-IP publishes the Lite database monthly). */
export function monthOf(date: Date): string {
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function downloadUrl(month: string): string {
  return `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
}

/** Place of an IP from a City database record; null without coordinates. */
export function geoFromRecord(record: CityResponse | null): Geo | null {
  const loc = record?.location;
  if (!loc) return null;
  const city = record.city?.names.en;
  const country = record.country?.iso_code;
  const place = [city, country].filter(Boolean).join(', ');
  return {
    lat: loc.latitude,
    lon: loc.longitude,
    accuracyKm: loc.accuracy_radius,
    ...(place && { place }),
  };
}

/**
 * Offline IP → location lookups with DB-IP's free City Lite database, downloaded into the app's
 * data folder only when the learner asks for it. Nothing about the hops is sent to a web service.
 */
export class GeoIpDb {
  private reader: Reader<CityResponse> | null = null;
  private version: string | null = null;

  constructor(private readonly dir: string) {}

  get file(): string {
    return join(this.dir, FILE);
  }

  async open(): Promise<void> {
    try {
      this.reader = await maxmind.open<CityResponse>(this.file);
      this.version = (await readFile(join(this.dir, 'version.txt'), 'utf8')).trim();
    } catch {
      this.reader = null;
    }
  }

  status(): { installed: boolean; version: string | null; attribution: string } {
    return { installed: this.reader !== null, version: this.version, attribution: GEO_ATTRIBUTION };
  }

  lookup(ip: string): Geo | null {
    try {
      return geoFromRecord(this.reader?.get(ip) ?? null);
    } catch {
      return null;
    }
  }

  /** Downloads this month's database (or last month's, early in a month) and opens it. */
  async download(
    onProgress: (received: number, total: number | null) => void,
    now = new Date(),
  ): Promise<string> {
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    let lastError = '';
    for (const month of [monthOf(now), monthOf(previous)]) {
      const res = await fetch(downloadUrl(month));
      if (!res.ok || !res.body) {
        lastError = `HTTP ${String(res.status)}`;
        continue;
      }
      const total = Number(res.headers.get('content-length')) || null;
      let received = 0;
      // Count bytes inside the pipeline: a 'data' listener on the body would start it flowing
      // before gunzip is attached, and the gzip header would be lost.
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          received += chunk.length;
          onProgress(received, total);
          done(null, chunk);
        },
      });
      const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
      await mkdir(this.dir, { recursive: true });
      const partial = `${this.file}.partial`;
      try {
        await pipeline(body, counter, createGunzip(), createWriteStream(partial));
        await rename(partial, this.file);
      } catch (err) {
        await rm(partial, { force: true });
        throw err;
      }
      await writeFile(join(dirname(this.file), 'version.txt'), month);
      await this.open();
      return month;
    }
    throw new Error(`위치 데이터베이스를 내려받지 못했습니다 (${lastError}).`);
  }
}
