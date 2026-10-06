import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ScenarioSchema, type Scenario } from '@magvirtualedu/schema';

const ID = /^[a-z0-9][a-z0-9-]*$/;

const StoredSchema = z.object({
  createdAt: z.string(),
  model: z.string(),
  scenario: ScenarioSchema,
});
type Stored = z.infer<typeof StoredSchema>;

export interface StoredEntry {
  id: string;
  topologyId: string;
  title: string;
  question: string;
  createdAt: string;
}

/** New ids sort by creation time: ask-<time>-<random>. */
export function newScenarioId(now = Date.now()): string {
  return `ask-${now.toString(36)}-${randomBytes(3).toString('hex')}`;
}

/** Generated scenarios as JSON files, one per id. */
export class ScenarioStore {
  constructor(private readonly dir: string) {}

  async save(scenario: Scenario, model: string): Promise<StoredEntry> {
    await mkdir(this.dir, { recursive: true });
    const stored: Stored = { createdAt: new Date().toISOString(), model, scenario };
    await writeFile(join(this.dir, `${scenario.id}.json`), JSON.stringify(stored, null, 2));
    return entryOf(stored);
  }

  async get(id: string): Promise<Scenario | undefined> {
    return (await this.read(id))?.scenario;
  }

  /** Newest first. */
  async list(): Promise<StoredEntry[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }
    const stored = await Promise.all(
      files.filter((f) => f.endsWith('.json')).map((f) => this.read(f.slice(0, -5))),
    );
    return stored
      .filter((s): s is Stored => s !== undefined)
      .map(entryOf)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async read(id: string): Promise<Stored | undefined> {
    if (!ID.test(id)) return undefined;
    try {
      const raw: unknown = JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8'));
      const parsed = StoredSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }
}

function entryOf(stored: Stored): StoredEntry {
  const { scenario } = stored;
  return {
    id: scenario.id,
    topologyId: scenario.topologyId,
    title: scenario.title,
    question: scenario.question ?? '',
    createdAt: stored.createdAt,
  };
}
