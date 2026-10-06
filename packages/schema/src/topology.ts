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
  // Inside a computer and at the edge of the home network (scenarios built from a real trace).
  'browser',
  'os',
  'nic',
  'modem',
  /** A router on the internet path seen by traceroute (or one that did not answer). */
  'hop',
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

/**
 * Where a value comes from. observed: measured on this computer; derived: computed from measured
 * values; typical: a usual value shown because the real one cannot be seen.
 */
export const FIELD_SOURCES = ['observed', 'derived', 'typical'] as const;
export const FieldSourceSchema = z.enum(FIELD_SOURCES);
export type FieldSource = z.infer<typeof FieldSourceSchema>;

export const GeoSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  /** Radius within which the real location probably lies. */
  accuracyKm: z.number().optional(),
  /** Human-readable place, e.g. "Seoul, KR". */
  place: z.string().optional(),
});
export type Geo = z.infer<typeof GeoSchema>;

export const NetNodeSchema = z.object({
  id: IdSchema,
  type: NodeTypeSchema,
  label: z.string().min(1),
  /** World position (x, y, z); y is up. */
  pos: Vec3Schema,
  interfaces: z.array(NetInterfaceSchema).optional(),
  zone: IdSchema.optional(),
  description: z.string().optional(),
  geo: GeoSchema.optional(),
  asn: z.object({ number: z.number(), name: z.string() }).optional(),
  /** Reverse-DNS name of the node's address. */
  hostname: z.string().optional(),
  /** Round-trip time measured from the learner's computer. */
  rttMs: z.number().optional(),
  /** typical: the device is assumed (e.g. a modem traceroute cannot see). */
  source: FieldSourceSchema.optional(),
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

/**
 * A labelled floor area such as "Home" or "Data center". bounds = [minX, minZ, maxX, maxZ] on the
 * plane y = elevation (default 0).
 */
export const ZoneSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  color: z.string().min(1),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  elevation: z.number().optional(),
});
export type Zone = z.infer<typeof ZoneSchema>;

/**
 * A globe the internet part of the topology is drawn on. Nodes with `geo` sit on its surface;
 * `focus` is the place turned to the top (the learner's location).
 */
export const GlobeSchema = z.object({
  center: Vec3Schema,
  radius: z.number().positive(),
  focus: z.object({ lat: z.number(), lon: z.number() }),
});
export type Globe = z.infer<typeof GlobeSchema>;

export const TopologySchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  globe: GlobeSchema.optional(),
  zones: z.array(ZoneSchema).optional(),
  nodes: z.array(NetNodeSchema).min(1),
  links: z.array(NetLinkSchema),
});
export type Topology = z.infer<typeof TopologySchema>;
