import { create } from 'zustand';
import {
  indexTopology,
  type Scenario,
  type Topology,
  type TopologyIndex,
  type ValidationIssue,
} from '@magvirtualedu/schema';
import {
  ANCHOR_HEIGHT,
  buildLinkCurves,
  MARKER_ANCHOR_HEIGHT,
  type LinkCurve,
} from '../engine/curves';
import { flattenTopology, type FlatMap } from '../engine/flatMap';
import { nodeNumbers } from '../engine/order';
import { buildTimeline } from '../engine/timeline';
import { backend } from '../data/backend';
import { fetchCatalog, fetchScenario, ScenarioLoadError, type ViewerEntry } from '../data/load';
import { createAskSlice, type AskSlice } from './ask';
import { createDesktopSlice, type DesktopSlice } from './desktop';
import { createPlaybackSlice, type PlaybackSlice } from './playback';
import { createTutorSlice, type TutorSlice } from './tutor';

/** How a topology with a globe is shown: on the globe, or on a flat world map. */
export type MapView = 'globe' | 'flat';

/**
 * Topology plus everything derived from it once, shared by the scene and the engine.
 *
 * view: floor (a plan without a globe), globe, or map (the globe's topology on a flat world map).
 * On the globe and the map, nodes are small markers that keep their size on screen.
 */
export interface World {
  /** What is drawn: the loaded topology, or its flattened copy on the map. */
  topology: Topology;
  /** The topology as loaded. */
  source: Topology;
  view: 'floor' | 'globe' | 'map';
  flatMap: FlatMap | null;
  markers: boolean;
  /** Height above a node's base where its links attach and packets travel. */
  lift: number;
  index: TopologyIndex;
  curves: ReadonlyMap<string, LinkCurve>;
}

export function makeWorld(source: Topology, mapView: MapView): World {
  const flat = mapView === 'flat' ? flattenTopology(source) : null;
  const topology = flat?.topology ?? source;
  const view = flat ? 'map' : source.globe ? 'globe' : 'floor';
  const markers = view !== 'floor';
  const lift = markers ? MARKER_ANCHOR_HEIGHT : ANCHOR_HEIGHT;
  return {
    topology,
    source,
    view,
    flatMap: flat?.map ?? null,
    markers,
    lift,
    index: indexTopology(topology),
    curves: buildLinkCurves(topology, lift),
  };
}

export type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string; issues: readonly ValidationIssue[] };

/** A node, or one of the current beat's packets (by hop index). */
export type Selection = { kind: 'node'; id: string } | { kind: 'packet'; hopIndex: number };

/** orbit: the learner moves the camera freely; follow: it stays on the moving packet. */
export type CameraMode = 'orbit' | 'follow';

export interface ViewerState extends PlaybackSlice, AskSlice, DesktopSlice, TutorSlice {
  /** Hand-written examples, then AI scenarios newest first. */
  catalog: readonly ViewerEntry[];
  entryId: string | null;
  status: Status;
  world: World | null;
  scenario: Scenario | null;
  /** Each node's number, in the order the scenario reaches it (1-based). */
  nodeNumbers: ReadonlyMap<string, number>;
  /** Globe or flat world map, for topologies that have a globe. */
  mapView: MapView;
  selection: Selection | null;
  cameraMode: CameraMode;
  inspectorOpen: boolean;
  /** The packet shown in the anatomy view (beat and hop of the current scenario). */
  packetLab: { beatIndex: number; hopIndex: number } | null;
  init: () => Promise<void>;
  open: (entryId: string) => Promise<void>;
  select: (selection: Selection | null) => void;
  /** Redraws the current topology on the globe or the flat map, keeping playback where it is. */
  setMapView: (view: MapView) => void;
  setCameraMode: (mode: CameraMode) => void;
  setInspectorOpen: (open: boolean) => void;
  /** Opens the anatomy view on a packet of the current beat (pausing playback), or closes it. */
  openPacketLab: (hopIndex: number | null) => void;
}

const SCENARIO_PARAM = 's';
const MAP_VIEW_KEY = 'magve.mapView';

function savedMapView(): MapView {
  try {
    return localStorage.getItem(MAP_VIEW_KEY) === 'flat' ? 'flat' : 'globe';
  } catch {
    return 'globe';
  }
}

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
  ...createTutorSlice(set, get, api),
  catalog: [],
  entryId: null,
  status: { kind: 'loading' },
  world: null,
  scenario: null,
  nodeNumbers: new Map(),
  mapView: savedMapView(),
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
      const world =
        current?.source.id === topology.id ? current : makeWorld(topology, get().mapView);
      set({
        world,
        scenario,
        nodeNumbers: nodeNumbers(world.topology, scenario),
        selection: null,
        packetLab: null,
        labFocus: null,
        status: { kind: 'ready' },
      });
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

  setMapView(mapView) {
    try {
      localStorage.setItem(MAP_VIEW_KEY, mapView);
    } catch {
      // Not remembered; the choice still applies now.
    }
    const { world, scenario } = get();
    if (!world?.source.globe || mapView === get().mapView) {
      set({ mapView });
      return;
    }
    const next = makeWorld(world.source, mapView);
    // Same scenario and step, new routes: only where the curves are has changed.
    set({ mapView, world: next, ...(scenario && { timeline: buildTimeline(next, scenario) }) });
  },

  setCameraMode(cameraMode) {
    set({ cameraMode });
  },

  setInspectorOpen(inspectorOpen) {
    set({ inspectorOpen });
  },

  openPacketLab(hopIndex) {
    if (hopIndex === null) {
      set({ packetLab: null, labFocus: null });
      return;
    }
    set({ packetLab: { beatIndex: get().beatIndex, hopIndex }, playing: false });
  },
}));
