import { z } from 'zod';
import { NodeActionKindSchema, ProtocolSchema, type Scenario } from './scenario';

/**
 * The shape the AI writes (structured output). It differs from Scenario where structured outputs
 * cannot express the stored form: header fields are a list of name/value pairs instead of a
 * record, optional values are explicit nulls, and beat ids are assigned by the server.
 */

export const DraftFieldSchema = z.object({
  name: z.string().describe('Header field name, e.g. "src", "ttl", "flags"'),
  value: z.string().describe('Field value as the learner should see it'),
});

export const DraftLayerSchema = z.object({
  name: z.string().describe('Header name: Ethernet, IP, TCP, UDP, TLS, DNS, HTTP, ARP, ICMP, …'),
  fields: z.array(DraftFieldSchema),
});

export const DraftPacketSchema = z.object({
  protocol: ProtocolSchema.describe('Protocol that decides the packet colour'),
  summary: z
    .string()
    .describe(
      'Short label next to the packet, e.g. "SYN". Keep it identical on every leg of one packet.',
    ),
  layers: z
    .array(DraftLayerSchema)
    .describe('Headers from the outermost (L2) to the innermost layer'),
});

export const DraftHopSchema = z.object({
  path: z
    .array(z.string())
    .describe('Node ids in travel order; every consecutive pair must be joined by a link'),
  packet: DraftPacketSchema,
});

export const DraftNodeActionSchema = z.object({
  node: z.string().describe('Id of the node that acts'),
  text: z.string().describe('What it does, e.g. "NAT: 192.168.0.10:52011 → 211.234.10.5:40001"'),
  kind: NodeActionKindSchema.nullable(),
});

export const DraftBeatSchema = z.object({
  narration: z.string().describe('One or two sentences for the learner'),
  hops: z
    .array(DraftHopSchema)
    .describe('Packets moving at the same time (usually one, may be none)'),
  nodeActions: z.array(DraftNodeActionSchema),
});

export const ScenarioDraftSchema = z.object({
  title: z.string().describe('Short title of the scenario'),
  beats: z.array(DraftBeatSchema),
  unsupported: z
    .string()
    .nullable()
    .describe('What the question asks that this topology cannot show, or null'),
});
export type ScenarioDraft = z.infer<typeof ScenarioDraftSchema>;

export interface DraftMeta {
  id: string;
  topologyId: string;
  question: string;
}

/** Turns the AI's draft into a stored scenario (beat ids step-1, step-2, …). */
export function draftToScenario(draft: ScenarioDraft, meta: DraftMeta): Scenario {
  return {
    id: meta.id,
    topologyId: meta.topologyId,
    title: draft.title,
    question: meta.question,
    beats: draft.beats.map((beat, i) => ({
      id: `step-${i + 1}`,
      narration: beat.narration,
      hops: beat.hops.map((hop) => ({
        path: hop.path,
        packet: {
          protocol: hop.packet.protocol,
          summary: hop.packet.summary,
          layers: hop.packet.layers.map((layer) => ({
            name: layer.name,
            fields: Object.fromEntries(layer.fields.map((f) => [f.name, f.value])),
          })),
        },
      })),
      ...(beat.nodeActions.length > 0 && {
        nodeActions: beat.nodeActions.map((a) => ({
          node: a.node,
          text: a.text,
          ...(a.kind !== null && { kind: a.kind }),
        })),
      }),
    })),
    ...(draft.unsupported !== null &&
      draft.unsupported.trim() !== '' && {
        unsupported: draft.unsupported,
      }),
  };
}

/** The reverse, used to show the AI a hand-written scenario as an example of the draft form. */
export function scenarioToDraft(scenario: Scenario): ScenarioDraft {
  return {
    title: scenario.title,
    beats: scenario.beats.map((beat) => ({
      narration: beat.narration,
      hops: beat.hops.map((hop) => ({
        path: hop.path,
        packet: {
          protocol: hop.packet.protocol,
          summary: hop.packet.summary,
          layers: hop.packet.layers.map((layer) => ({
            name: layer.name,
            fields: Object.entries(layer.fields).map(([name, value]) => ({ name, value })),
          })),
        },
      })),
      nodeActions: (beat.nodeActions ?? []).map((a) => ({
        node: a.node,
        text: a.text,
        kind: a.kind ?? null,
      })),
    })),
    unsupported: scenario.unsupported ?? null,
  };
}
