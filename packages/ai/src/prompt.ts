import type Anthropic from '@anthropic-ai/sdk';
import {
  scenarioToDraft,
  type Scenario,
  type Topology,
  type ValidationIssue,
} from '@netgongbu/schema';

// The system prompt is two blocks: instructions that never change, then the topology and an
// example for it. Both are stable per topology, so the cache breakpoint sits at the end of the
// second block and only the question varies between requests.

const INSTRUCTIONS = `You write step-by-step scenarios for a 3D network teaching tool. A learner asks a question; you answer it by describing, beat by beat, which packets move between the nodes of the topology below and what each node does. The viewer animates your answer, so it has to match the topology exactly.

How the viewer reads a scenario
- A beat is one step the learner reads before moving on. Its narration (one or two sentences) says what happens and why.
- hops are the packets moving during the beat. Most beats have one; use several only for things that really happen at the same time, such as a load balancer fanning out or a broadcast. A beat may have none when a node only looks something up or decides.
- path lists node ids in travel order. Every consecutive pair must be directly linked in the topology, in either direction; a packet cannot skip a node.
- When a node rewrites headers (NAT, a router rewriting MAC addresses, a proxy or load balancer re-originating a request), end the hop at that node and continue in the next beat with the rewritten headers. Keep the packet's summary identical on both legs so the viewer can highlight what changed. Where nothing is rewritten, one hop may cross several nodes.
- layers are the headers from the outermost (Ethernet) to the innermost (application). Use values consistent with the interfaces in the topology (IP and MAC addresses) and with earlier beats (ports, sequence numbers, NAT mappings, TTL going down at each router). Include the fields a learner needs to understand the step rather than every field of the protocol.
- nodeActions say what a node does in that beat: lookup (routing table, ARP cache, DNS cache), rewrite (NAT, MAC rewrite), drop (firewall, TTL expired) or process (application work, TLS termination).

Scope
- Show the real sequence, including steps learners tend to miss: ARP before the first frame, DNS before connecting, handshakes, and the responses coming back. Most answers need 6 to 20 beats; a short exchange may need fewer.
- Only use nodes and links in the topology. If the question needs something the topology lacks (another device, a CDN, a failure the topology cannot show), show the closest faithful version and explain the gap in unsupported; otherwise set unsupported to null.
- If the question is not about how data moves through a network, answer with one beat without hops whose narration says what kind of questions this tool can show, and explain why in unsupported.
- Write title, narration, node action text and unsupported in Korean. Header names, field names and protocol values keep their usual technical spelling.`;

export function systemPrompt(
  topology: Topology,
  example: Scenario | undefined,
): Anthropic.Beta.BetaTextBlockParam[] {
  const exampleText = example
    ? `\n\nAn example answer for this topology, to a different question, in the output format:\n${JSON.stringify(scenarioToDraft(example))}`
    : '';
  return [
    { type: 'text', text: INSTRUCTIONS },
    {
      type: 'text',
      text: `Topology "${topology.id}":\n${JSON.stringify(topology)}${exampleText}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

export function questionMessage(question: string): string {
  return `Question from the learner:\n${question}`;
}

/** Sent after an answer the viewer cannot play, asking for a complete corrected scenario. */
export function correctionMessage(problems: readonly ValidationIssue[] | string): string {
  const list =
    typeof problems === 'string'
      ? `- ${problems}`
      : problems
          .map((p) => `- ${p.where.replace(/step-(\d+)/, 'beat $1')}: ${p.message}`)
          .join('\n');
  return `The viewer cannot play that scenario:\n${list}\n\nReturn the complete corrected scenario. Beats are numbered from 1 in the order you wrote them.`;
}
