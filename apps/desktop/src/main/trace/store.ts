import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TraceEntry } from '@netgongbu/bridge';
import { mainRequest, TraceReportSchema, type TraceReport } from '@netgongbu/trace';

const ID = /^trace-[a-z0-9-]+$/;

export function newTraceId(now = Date.now()): string {
  return `trace-${now.toString(36)}-${randomBytes(3).toString('hex')}`;
}

function entryOf(id: string, report: TraceReport): TraceEntry {
  const main = mainRequest(report);
  return {
    id,
    input: report.input,
    host: main ? new URL(main.url).hostname : report.input,
    startedAt: report.startedAt,
  };
}

/** Measured page loads, one JSON report per id, kept in the app's data folder. */
export class TraceStore {
  constructor(private readonly dir: string) {}

  async save(id: string, report: TraceReport): Promise<TraceEntry> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${id}.json`), JSON.stringify(report, null, 2));
    return entryOf(id, report);
  }

  async get(id: string): Promise<TraceReport | null> {
    if (!ID.test(id)) return null;
    try {
      const parsed = TraceReportSchema.safeParse(
        JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8')),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** Newest first. */
  async list(): Promise<TraceEntry[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }
    const entries = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const id = f.slice(0, -5);
          const report = await this.get(id);
          return report ? entryOf(id, report) : null;
        }),
    );
    return entries
      .filter((e): e is TraceEntry => e !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}
