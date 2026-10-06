import { create } from 'zustand';
import {
  indexTopology,
  type Scenario,
  type Topology,
  type TopologyIndex,
  type ValidationIssue,
} from '@magvirtualedu/schema';
import { buildLinkCurves, type LinkCurve } from '../engine/curves';
import { buildTimeline } from '../engine/timeline';
import { backend } from '../data/backend';
import { fetchCatalog, fetchScenario, ScenarioLoadError, type ViewerEntry } from '../data/load';
import { createAskSlice, type AskSlice } from './ask';
import { createDesktopSlice, type DesktopSlice } from './desktop';
import { createPlaybackSlice, type PlaybackSlice } from './playback';

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

/** A node, or one of the current beat's packets (by hop index). */
export type Selection = { kind: 'node'; id: string } | { kind: 'packet'; hopIndex: number };

/** orbit: the learner moves the camera freely; follow: it stays on the moving packet. */
export type CameraMode = 'orbit' | 'follow';

export interface ViewerState extends PlaybackSlice, AskSlice, DesktopSlice {
  /** Hand-written examples, then AI scenarios newest first. */
  catalog: readonly ViewerEntry[];
  entryId: string | null;
  status: Status;
  world: World | null;
  scenario: Scenario | null;
  selection: Selection | null;
  cameraMode: CameraMode;
  inspectorOpen: boolean;
  /** The packet shown in the anatomy view (beat and hop of the current scenario). */
  packetLab: { beatIndex: number; hopIndex: number } | null;
  init: () => Promise<void>;
  open: (entryId: string) => Promise<void>;
  select: (selection: Selection | null) => void;
  setCameraMode: (mode: CameraMode) => void;
  setInspectorOpen: (open: boolean) => void;
  /** Opens the anatomy view on a packet of the current beat (pausing playback), or closes it. */
  openPacketLab: (hopIndex: number | null) => void;
}

const SCENARIO_PARAM = 's';

/** Phones start with side panels folded so the 3D view and the player have room. */
export const NARROW_QUERY = '(max-width: 720px)';

function isNarrow(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches;
}

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

export const useViewer = create<ViewerState>()((set, get, api) => ({
  ...createPlaybackSlice(set, get, api),
  ...createAskSlice(set, get, api),
  ...createDesktopSlice(set, get, api),
  catalog: [],
  entryId: null,
  status: { kind: 'loading' },
  world: null,
  scenario: null,
  selection: null,
  cameraMode: 'orbit',
  inspectorOpen: !isNarrow(),
  packetLab: null,

  async init() {
    void get().checkAi();
    try {
      const [examples, generated] = await Promise.all([fetchCatalog(), backend.aiCatalog()]);
      const catalog: ViewerEntry[] = [
        ...examples.scenarios.map((e) => ({ ...e, source: 'example' as const })),
        ...generated.map((e) => ({ ...e, source: 'ai' as const })),
      ];
      set({ catalog });
      // Desktop app: measured page loads join the list before the URL's scenario is looked up.
      await get().connectDesktop();
      const all = get().catalog;
      const wanted = new URL(window.location.href).searchParams.get(SCENARIO_PARAM);
      const first = all.find((s) => s.id === wanted) ?? all[0];
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
      // Keep the scene (and camera) when the new scenario uses the same topology.
      const current = get().world;
      const world: World =
        current?.topology.id === topology.id
          ? current
          : { topology, index: indexTopology(topology), curves: buildLinkCurves(topology) };
      set({ world, scenario, selection: null, packetLab: null, status: { kind: 'ready' } });
      get().loadTimeline(buildTimeline(world, scenario));
      rememberInUrl(entryId);
    } catch (err) {
      if (token === openToken) set({ status: errorStatus(err) });
    }
  },

  select(selection) {
    // Picking something opens the inspector so its details are visible, also on phones.
    set(selection ? { selection, inspectorOpen: true } : { selection });
  },

  setCameraMode(cameraMode) {
    set({ cameraMode });
  },

  setInspectorOpen(inspectorOpen) {
    set({ inspectorOpen });
  },

  openPacketLab(hopIndex) {
    if (hopIndex === null) {
      set({ packetLab: null });
      return;
    }
    set({ packetLab: { beatIndex: get().beatIndex, hopIndex }, playing: false });
  },
}));
