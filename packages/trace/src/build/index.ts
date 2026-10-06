import type { Scenario, Topology } from '@magvirtualedu/schema';
import type { TraceReport } from '../report';
import { buildScenario } from './scenario';
import { buildTopology } from './topology';

export { detectCdn } from './topology';
export { checkGeo, FIBER_KM_PER_MS } from './geocheck';

export interface BuiltTrace {
  topology: Topology;
  scenario: Scenario;
}

/** A topology and a playable scenario from one measured page load, with the same id. */
export function buildFromReport(report: TraceReport, id: string): BuiltTrace {
  const built = buildTopology(report, id);
  return { topology: built.topology, scenario: buildScenario(report, built, id) };
}
