import type { NetLink, NetNode, Topology } from './topology';

export interface Neighbor {
  link: NetLink;
  node: NetNode;
}

/** Lookup tables over a topology. Links are undirected, so neighbours are listed on both ends. */
export interface TopologyIndex {
  nodes: ReadonlyMap<string, NetNode>;
  links: ReadonlyMap<string, NetLink>;
  neighbors(nodeId: string): readonly Neighbor[];
  linkBetween(a: string, b: string): NetLink | undefined;
}

export function indexTopology(topology: Topology): TopologyIndex {
  const nodes = new Map(topology.nodes.map((n) => [n.id, n]));
  const links = new Map(topology.links.map((l) => [l.id, l]));
  const adjacency = new Map<string, Neighbor[]>();

  const connect = (from: string, link: NetLink, toId: string): void => {
    const to = nodes.get(toId);
    if (!to) return;
    const list = adjacency.get(from) ?? [];
    list.push({ link, node: to });
    adjacency.set(from, list);
  };
  for (const link of topology.links) {
    connect(link.a, link, link.b);
    connect(link.b, link, link.a);
  }

  return {
    nodes,
    links,
    neighbors: (nodeId) => adjacency.get(nodeId) ?? [],
    linkBetween: (a, b) => adjacency.get(a)?.find((n) => n.node.id === b)?.link,
  };
}
