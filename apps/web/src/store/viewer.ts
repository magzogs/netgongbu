import { create } from 'zustand';
import {
  indexTopology,
  type CatalogEntry,
  type Scenario,
  type Topology,
  type TopologyIndex,
  type ValidationIssue,
} from '@magvirtualedu/schema';
import { buildLinkCurves, type LinkCurve } from '../engine/curves';
import { fetchCatalog, fetchScenario, ScenarioLoadError } from '../data/load';

/** Topology plus everything derived from it once, shared by the scene and the engine. */
export interface World {
  topology: Topology;
  index: TopologyIndex;
  curves: ReadonlyMap<string, LinkCurve>;
}

export type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string; issues: readonly ValidationIssue[] };

export interface Selection {
  kind: 'node';
  id: string;
}

export interface ViewerState {
  catalog: readonly CatalogEntry[];
  entryId: string | null;
  status: Status;
  world: World | null;
  scenario: Scenario | null;
  selection: Selection | null;
  init: () => Promise<void>;
  open: (entryId: string) => Promise<void>;
  select: (selection: Selection | null) => void;
}

const SCENARIO_PARAM = 's';

function errorStatus(err: unknown): Status {
  if (err instanceof ScenarioLoadError) {
    return { kind: 'error', message: err.message, issues: err.issues };
  }
  return { kind: 'error', message: err instanceof Error ? err.message : String(err), issues: [] };
}

function rememberInUrl(entryId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(SCENARIO_PARAM, entryId);
  window.history.replaceState(null, '', url);
}

let openToken = 0;

export const useViewer = create<ViewerState>()((set, get) => ({
  catalog: [],
  entryId: null,
  status: { kind: 'loading' },
  world: null,
  scenario: null,
  selection: null,

  async init() {
    try {
      const catalog = await fetchCatalog();
      set({ catalog: catalog.scenarios });
      const wanted = new URL(window.location.href).searchParams.get(SCENARIO_PARAM);
      const first = catalog.scenarios.find((s) => s.id === wanted) ?? catalog.scenarios[0];
      if (first) await get().open(first.id);
      else set({ status: { kind: 'error', message: '시나리오가 없습니다.', issues: [] } });
    } catch (err) {
      set({ status: errorStatus(err) });
    }
  },

  async open(entryId) {
    const entry = get().catalog.find((s) => s.id === entryId);
    if (!entry) return;
    const token = ++openToken;
    set({ entryId, status: { kind: 'loading' } });
    try {
      const { topology, scenario } = await fetchScenario(entry);
      if (token !== openToken) return;
      const world: World = {
        topology,
        index: indexTopology(topology),
        curves: buildLinkCurves(topology),
      };
      set({ world, scenario, selection: null, status: { kind: 'ready' } });
      rememberInUrl(entryId);
    } catch (err) {
      if (token === openToken) set({ status: errorStatus(err) });
    }
  },

  select(selection) {
    set({ selection });
  },
}));
