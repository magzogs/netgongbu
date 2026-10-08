import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CatalogSchema,
  ScenarioSchema,
  TopologySchema,
  validateTopology,
  type Scenario,
  type Topology,
  getLocale,
} from '@netgongbu/schema';

const ID = /^[a-z0-9][a-z0-9-]*$/;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

/** Topologies and hand-written example scenarios from the viewer's data folder. */
export class TopologyLibrary {
  private readonly cache = new Map<string, Topology>();

  constructor(private readonly dataDir: string) {}

  /** A data file in the current language: English ones sit in en/, falling back to Korean. */
  private async read(...path: string[]): Promise<unknown> {
    if (getLocale() === 'en') {
      try {
        return await readJson(join(this.dataDir, 'en', ...path));
      } catch {
        // Not translated: the Korean file.
      }
    }
    return readJson(join(this.dataDir, ...path));
  }

  /** The topology with this id, or undefined when there is none (or the id is malformed). */
  async get(id: string): Promise<Topology | undefined> {
    if (!ID.test(id)) return undefined;
    const key = `${getLocale()}:${id}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    let raw: unknown;
    try {
      raw = await this.read('topologies', `${id}.json`);
    } catch {
      return undefined;
    }
    const topology = TopologySchema.parse(raw);
    const issues = validateTopology(topology);
    if (issues.length > 0)
      throw new Error(`Topology ${id} is invalid: ${issues[0]?.message ?? ''}`);
    this.cache.set(key, topology);
    return topology;
  }

  /** The first hand-written scenario for this topology, shown to the AI as an example. */
  async exampleFor(topologyId: string): Promise<Scenario | undefined> {
    const catalog = CatalogSchema.parse(await this.read('catalog.json'));
    const entry =
      catalog.scenarios.find((s) => s.topologyId === topologyId) ?? catalog.scenarios[0];
    if (!entry) return undefined;
    return ScenarioSchema.parse(await this.read('scenarios', `${entry.id}.json`));
  }
}
