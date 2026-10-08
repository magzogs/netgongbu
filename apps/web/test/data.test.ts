import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CatalogSchema,
  ScenarioSchema,
  TopologySchema,
  validateScenario,
  validateTopology,
} from '@netgongbu/schema';

// Every JSON file shipped under public/data must parse and validate, so a broken path in a
// hand-written (or later AI-written) scenario fails here instead of in the 3D view.

const dataDir = join(import.meta.dirname, '..', 'public', 'data');

function readJson(...parts: string[]): unknown {
  return JSON.parse(readFileSync(join(dataDir, ...parts), 'utf8'));
}

function idsIn(folder: string): string[] {
  return readdirSync(join(dataDir, folder))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

const catalog = CatalogSchema.parse(readJson('catalog.json'));
const topologies = new Map(
  idsIn('topologies').map((id) => [id, TopologySchema.parse(readJson('topologies', `${id}.json`))]),
);

describe('sample data', () => {
  it.each([...topologies])('topology %s is consistent and named after its file', (id, topology) => {
    expect(topology.id).toBe(id);
    expect(validateTopology(topology)).toEqual([]);
  });

  it('lists every scenario file in the catalog exactly once', () => {
    expect(catalog.scenarios.map((s) => s.id).sort()).toEqual(idsIn('scenarios'));
  });

  it.each(catalog.scenarios)('scenario $id only uses nodes and links of its topology', (entry) => {
    const scenario = ScenarioSchema.parse(readJson('scenarios', `${entry.id}.json`));
    const topology = topologies.get(entry.topologyId);
    expect(topology, `topology ${entry.topologyId}`).toBeDefined();
    expect(scenario.id).toBe(entry.id);
    expect(scenario.title).toBe(entry.title);
    expect(validateScenario(topology!, scenario)).toEqual([]);
  });
});
