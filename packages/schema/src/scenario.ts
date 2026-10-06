import { z } from 'zod';
import { IdSchema } from './topology';

// Field descriptions are written for the AI as well as for people: in MVP-2 this schema becomes
// the input_schema of the `create_scenario` tool via z.toJSONSchema().

export const PROTOCOLS = ['ARP', 'DNS', 'TCP', 'UDP', 'TLS', 'HTTP', 'ICMP', 'OTHER'] as const;
export const ProtocolSchema = z.enum(PROTOCOLS);
export type Protocol = z.infer<typeof ProtocolSchema>;

export const LayerSchema = z.object({
  name: z.string().min(1).describe('Header name such as Ethernet, IP, TCP, UDP, TLS, DNS, HTTP'),
  fields: z
    .record(z.string(), z.string())
    .describe('Header fields shown to the learner, e.g. { "src": "192.168.0.10", "ttl": "64" }'),
});
export type Layer = z.infer<typeof LayerSchema>;

export const PacketSchema = z.object({
  protocol: ProtocolSchema.describe('Protocol that decides the packet colour'),
  summary: z.string().min(1).describe('Short label shown next to the packet, e.g. "SYN"'),
  layers: z
    .array(LayerSchema)
    .min(1)
    .describe('Headers from the outermost (L2) to the innermost (application) layer'),
});
export type Packet = z.infer<typeof PacketSchema>;

export const HopSchema = z.object({
  path: z
    .array(IdSchema)
    .min(2)
    .describe(
      'Node ids the packet travels through, in order. Every consecutive pair must be joined by a ' +
        'link. Split the hop at a node that rewrites headers (MAC rewrite, NAT) so the change shows.',
    ),
  packet: PacketSchema,
});
export type Hop = z.infer<typeof HopSchema>;

export const NODE_ACTION_KINDS = ['lookup', 'rewrite', 'drop', 'process'] as const;
export const NodeActionKindSchema = z.enum(NODE_ACTION_KINDS);
export type NodeActionKind = z.infer<typeof NodeActionKindSchema>;

export const NodeActionSchema = z.object({
  node: IdSchema,
  text: z.string().min(1).describe('What the node does, e.g. "NAT: 192.168.0.10:52011 → ..."'),
  kind: NodeActionKindSchema.optional(),
});
export type NodeAction = z.infer<typeof NodeActionSchema>;

export const BeatSchema = z.object({
  id: IdSchema,
  narration: z.string().min(1).describe('One or two sentences explaining this step to a learner'),
  hops: z
    .array(HopSchema)
    .describe('Packets moving at the same time during this step (usually one, may be none)'),
  nodeActions: z.array(NodeActionSchema).optional(),
  durationSec: z
    .number()
    .positive()
    .max(30)
    .optional()
    .describe('Playback length at 1× speed; omitted means it follows the path length'),
});
export type Beat = z.infer<typeof BeatSchema>;

export const ScenarioSchema = z.object({
  id: IdSchema,
  topologyId: IdSchema,
  title: z.string().min(1),
  question: z.string().optional().describe('The question this scenario answers'),
  beats: z.array(BeatSchema).min(1),
  unsupported: z
    .string()
    .optional()
    .describe('Parts of the question this topology cannot show, explained to the learner'),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
