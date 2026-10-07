import type { Scenario, Topology } from '@magvirtualedu/schema';

/**
 * Numbers every node 1, 2, 3, … in the order the scenario first reaches it (the nodes acting in
 * a step, then those its packets pass), so labels, the inspector and questions can say "node 5".
 * Nodes the scenario never visits follow, in the topology's order.
 */
export function nodeNumbers(topology: Topology, scenario: Scenario | null): Map<string, number> {
  const known = new Set(topology.nodes.map((n) => n.id));
  const numbers = new Map<string, number>();
  const visit = (id: string): void => {
    if (known.has(id) && !numbers.has(id)) numbers.set(id, numbers.size + 1);
  };
  for (const beat of scenario?.beats ?? []) {
    for (const action of beat.nodeActions ?? []) visit(action.node);
    for (const hop of beat.hops) hop.path.forEach(visit);
  }
  for (const node of topology.nodes) visit(node.id);
  return numbers;
}
