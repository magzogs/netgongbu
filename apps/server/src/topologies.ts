import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CatalogSchema,
  ScenarioSchema,
  TopologySchema,
  validateTopology,
  type Scenario,
  type Topology,
} from '@magvirtualedu/schema';

const ID = /^[a-z0-9][a-z0-9-]*$/;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

/** Topologies and hand-written example scenarios from the viewer's data folder. */
export class TopologyLibrary {
  private readonly cache = new Map<string, Topology>();

  constructor(private readonly dataDir: string) {}

  /** The topology with this id, or undefined when there is none (or the id is malformed). */
  async get(id: string): Promise<Topology | undefined> {
    if (!ID.test(id)) return undefined;
    const cached = this.cache.get(id);
    if (cached) return cached;
    let raw: unknown;
    try {
      raw = await readJson(join(this.dataDir, 'topologies', `${id}.json`));
    } catch {
      return undefined;
    }
    const topology = TopologySchema.parse(raw);
    const issues = validateTopology(topology);
    if (issues.length > 0)
      throw new Error(`Topology ${id} is invalid: ${issues[0]?.message ?? ''}`);
    this.cache.set(id, topology);
    return topology;
  }

  /** The first hand-written scenario for this topology, shown to the AI as an example. */
  async exampleFor(topologyId: string): Promise<Scenario | undefined> {
    const catalog = CatalogSchema.parse(await readJson(join(this.dataDir, 'catalog.json')));
    const entry =
      catalog.scenarios.find((s) => s.topologyId === topologyId) ?? catalog.scenarios[0];
    if (!entry) return undefined;
    return ScenarioSchema.parse(
      await readJson(join(this.dataDir, 'scenarios', `${entry.id}.json`)),
    );
  }
}
