import { indexTopology, type TopologyIndex } from './graph';
import type { Hop, Scenario } from './scenario';
import type { Topology } from './topology';

/**
 * One problem found in a topology or scenario. `message` is a full sentence so it can be shown to
 * a person or sent back to the AI as-is when asking it to fix a scenario.
 */
export interface ValidationIssue {
  where: string;
  message: string;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup];
}

/** Structural checks the zod schema cannot express: unique ids and references that resolve. */
export function validateTopology(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(topology.nodes.map((n) => n.id));
  const zoneIds = new Set((topology.zones ?? []).map((z) => z.id));

  for (const id of duplicates(topology.nodes.map((n) => n.id))) {
    issues.push({ where: `node ${id}`, message: `Node id "${id}" is used more than once.` });
  }
  for (const id of duplicates(topology.links.map((l) => l.id))) {
    issues.push({ where: `link ${id}`, message: `Link id "${id}" is used more than once.` });
  }
  for (const link of topology.links) {
    for (const end of [link.a, link.b]) {
      if (!nodeIds.has(end)) {
        issues.push({
          where: `link ${link.id}`,
          message: `Link "${link.id}" ends at unknown node "${end}".`,
        });
      }
    }
    if (link.a === link.b) {
      issues.push({
        where: `link ${link.id}`,
        message: `Link "${link.id}" connects "${link.a}" to itself.`,
      });
    }
  }
  for (const node of topology.nodes) {
    if (node.zone !== undefined && !zoneIds.has(node.zone)) {
      issues.push({
        where: `node ${node.id}`,
        message: `Node "${node.id}" is in unknown zone "${node.zone}".`,
      });
    }
  }
  return issues;
}

function describeNeighbors(index: TopologyIndex, nodeId: string): string {
  const names = index.neighbors(nodeId).map((n) => n.node.id);
  return names.length > 0 ? names.join(', ') : 'nothing';
}

function validateHop(index: TopologyIndex, hop: Hop, where: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const unknown = hop.path.filter((id) => !index.nodes.has(id));
  for (const id of new Set(unknown)) {
    issues.push({ where, message: `Node "${id}" does not exist in this topology.` });
  }
  if (unknown.length > 0) return issues;

  for (let i = 1; i < hop.path.length; i++) {
    const from = hop.path[i - 1] ?? '';
    const to = hop.path[i] ?? '';
    if (from === to) {
      issues.push({ where, message: `Path repeats "${from}" twice in a row.` });
    } else if (!index.linkBetween(from, to)) {
      issues.push({
        where,
        message:
          `There is no link between "${from}" and "${to}". ` +
          `"${from}" is linked to: ${describeNeighbors(index, from)}.`,
      });
    }
  }
  return issues;
}

/** Checks that a scenario only uses nodes and links that exist in the given topology. */
export function validateScenario(topology: Topology, scenario: Scenario): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (scenario.topologyId !== topology.id) {
    issues.push({
      where: 'scenario',
      message: `Scenario is written for topology "${scenario.topologyId}", not "${topology.id}".`,
    });
    return issues;
  }

  const index = indexTopology(topology);
  for (const id of duplicates(scenario.beats.map((b) => b.id))) {
    issues.push({ where: `beat ${id}`, message: `Beat id "${id}" is used more than once.` });
  }
  for (const beat of scenario.beats) {
    beat.hops.forEach((hop, i) => {
      issues.push(...validateHop(index, hop, `beat ${beat.id}, hop ${i + 1}`));
    });
    for (const action of beat.nodeActions ?? []) {
      if (!index.nodes.has(action.node)) {
        issues.push({
          where: `beat ${beat.id}`,
          message: `Node action refers to "${action.node}", which does not exist in this topology.`,
        });
      }
    }
  }
  return issues;
}
