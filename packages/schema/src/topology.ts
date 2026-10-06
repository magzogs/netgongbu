import { z } from 'zod';

/** Short, stable identifier such as `pc1` or `r-home`. Scenarios refer to nodes by it. */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes, e.g. "r-home"');

export const NODE_TYPES = [
  'client',
  'router',
  'switch',
  'firewall',
  'dns',
  'server',
  'loadbalancer',
  'cdn',
  'cloud',
  'service',
  'queue',
  'database',
] as const;
export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

export const NetInterfaceSchema = z.object({
  name: z.string().min(1),
  ip: z.string().optional(),
  mac: z.string().optional(),
});
export type NetInterface = z.infer<typeof NetInterfaceSchema>;

export const NetNodeSchema = z.object({
  id: IdSchema,
  type: NodeTypeSchema,
  label: z.string().min(1),
  /** World position (x, y, z); y is up. */
  pos: Vec3Schema,
  interfaces: z.array(NetInterfaceSchema).optional(),
  zone: IdSchema.optional(),
  description: z.string().optional(),
});
export type NetNode = z.infer<typeof NetNodeSchema>;

export const LINK_MEDIA = ['ethernet', 'wifi', 'fiber', 'internet', 'virtual'] as const;
export const LinkMediumSchema = z.enum(LINK_MEDIA);
export type LinkMedium = z.infer<typeof LinkMediumSchema>;

/** Links are undirected: a packet may travel a → b or b → a. */
export const NetLinkSchema = z.object({
  id: IdSchema,
  a: IdSchema,
  b: IdSchema,
  medium: LinkMediumSchema,
  latencyMs: z.number().positive().optional(),
});
export type NetLink = z.infer<typeof NetLinkSchema>;

/** A labelled floor area such as "Home" or "Data center". bounds = [minX, minZ, maxX, maxZ]. */
export const ZoneSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  color: z.string().min(1),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export type Zone = z.infer<typeof ZoneSchema>;

export const TopologySchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  zones: z.array(ZoneSchema).optional(),
  nodes: z.array(NetNodeSchema).min(1),
  links: z.array(NetLinkSchema),
});
export type Topology = z.infer<typeof TopologySchema>;
