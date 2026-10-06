import type { LinkMedium, NodeType, Protocol } from '@magvirtualedu/schema';

// Colours used inside the WebGL scene, where CSS custom properties do not reach.

export const SCENE_BACKGROUND = '#0b0f17';
export const ACCENT = '#5eead4';
/** Ring around a node that acts in the current beat; matches the bubble colour. */
export const BUSY = '#fbbf24';

export const NODE_COLORS: Record<NodeType, string> = {
  client: '#93c5fd',
  router: '#5eead4',
  switch: '#67e8f9',
  firewall: '#f87171',
  dns: '#fcd34d',
  server: '#c4b5fd',
  loadbalancer: '#f9a8d4',
  cdn: '#fdba74',
  cloud: '#cbd5e1',
  service: '#a7f3d0',
  queue: '#fde68a',
  database: '#a5b4fc',
};

export const MEDIUM_COLORS: Record<LinkMedium, string> = {
  ethernet: '#94a3b8',
  wifi: '#7dd3fc',
  fiber: '#fbbf24',
  internet: '#a78bfa',
  virtual: '#64748b',
};

export const PROTOCOL_COLORS: Record<Protocol, string> = {
  ARP: '#cbd5e1',
  DNS: '#facc15',
  TCP: '#60a5fa',
  UDP: '#22d3ee',
  TLS: '#c084fc',
  HTTP: '#4ade80',
  ICMP: '#fb923c',
  OTHER: '#f472b6',
};
