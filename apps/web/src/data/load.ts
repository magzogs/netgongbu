import {
  CatalogSchema,
  ScenarioSchema,
  TopologySchema,
  validateScenario,
  validateTopology,
  type Catalog,
  type CatalogEntry,
  type Scenario,
  type Topology,
  type ValidationIssue,
} from '@magvirtualedu/schema';
import { fetchAiScenario } from './aiApi';

/** A scenario in the picker: hand-written example data, or one the AI generated earlier. */
export type ViewerEntry = CatalogEntry & { source: 'example' | 'ai'; question?: string };

export class ScenarioLoadError extends Error {
  constructor(
    message: string,
    readonly issues: readonly ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ScenarioLoadError';
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok)
    throw new ScenarioLoadError(`${path}을(를) 불러오지 못했습니다 (HTTP ${res.status}).`);
  return res.json();
}

export async function fetchCatalog(): Promise<Catalog> {
  return CatalogSchema.parse(await fetchJson('catalog.json'));
}

export interface LoadedScenario {
  topology: Topology;
  scenario: Scenario;
}

/** Loads a scenario and its topology and refuses one that uses nodes or links that do not exist. */
export async function fetchScenario(entry: ViewerEntry): Promise<LoadedScenario> {
  const [rawTopology, rawScenario] = await Promise.all([
    fetchJson(`topologies/${entry.topologyId}.json`),
    entry.source === 'ai' ? fetchAiScenario(entry.id) : fetchJson(`scenarios/${entry.id}.json`),
  ]);
  const topology = TopologySchema.parse(rawTopology);
  const scenario = ScenarioSchema.parse(rawScenario);
  const issues = [...validateTopology(topology), ...validateScenario(topology, scenario)];
  if (issues.length > 0) {
    throw new ScenarioLoadError(`"${entry.title}" 시나리오에 문제가 있습니다.`, issues);
  }
  return { topology, scenario };
}
