import type { LinkMedium, NodeType } from '@magvirtualedu/schema';

// Colours used inside the WebGL scene, where CSS custom properties do not reach.

export const SCENE_BACKGROUND = '#0b0f17';
export const ACCENT = '#5eead4';

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
