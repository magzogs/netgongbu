import type { Hop, NetNode } from '@netgongbu/schema';
import { tr } from '@netgongbu/schema';
import type { ViewerState } from '../store/viewer';
import { ACTION_NAMES, NODE_TYPE_NAMES } from '../ui/names';

/**
 * What the learner is looking at, written out for a language model: the scenario and its current
 * step (narration, the packets moving with their headers, what devices do), what is selected,
 * the packet anatomy view's layer and field, and the numbered devices on the map. Kept short,
 * since small local models have small context windows.
 */

export interface ScreenContext {
  text: string;
  /** Short labels of what is included, shown with the question. */
  chips: string[];
}

/** The anatomy view's current layer and field (kept in the store while it is open). */
export interface LabFocus {
  layer: string;
  standard: string;
  field: { name: string; value: string; meaning: string; position: string } | null;
}

const VIEW_NAMES = {
  floor: tr('평면도(3D)', 'floor plan (3D)'),
  globe: tr('지구본(3D, 실제 위치)', 'globe (3D, real locations)'),
  map: tr('평면 세계 지도(3D, 실제 위치)', 'flat world map (3D, real locations)'),
} as const;

const VIEW_CHIPS = {
  floor: tr('평면도', 'Floor plan'),
  globe: tr('지구본', 'Globe'),
  map: tr('평면 지도', 'Flat map'),
} as const;

/** Devices listed at most; the rest are summarised. */
const MAX_NODES = 40;
/** Header fields per layer at most. */
const MAX_FIELDS = 14;

export function screenContext(s: ViewerState): ScreenContext {
  const lines: string[] = [];
  const world = s.world;
  const numberOf = (id: string): string => {
    const n = s.nodeNumbers.get(id);
    return n === undefined ? '' : tr(`${String(n)}번 `, `#${String(n)} `);
  };
  const nameOf = (id: string): string =>
    `${numberOf(id)}${world?.index.nodes.get(id)?.label ?? id}`;

  if (world) {
    lines.push(
      tr(
        `지도: ${world.topology.title} · 보기: ${VIEW_NAMES[world.view]}`,
        `Map: ${world.topology.title} · view: ${VIEW_NAMES[world.view]}`,
      ),
    );
  }
  const scenario = s.scenario;
  if (scenario) {
    lines.push(tr(`시나리오: ${scenario.title}`, `Scenario: ${scenario.title}`));
    if (scenario.question)
      lines.push(
        tr(
          `이 시나리오가 답하는 질문: ${scenario.question}`,
          `Question this scenario answers: ${scenario.question}`,
        ),
      );
    if (scenario.unsupported)
      lines.push(
        tr(
          `이 지도로 보여 줄 수 없는 부분: ${scenario.unsupported}`,
          `What this map can't show: ${scenario.unsupported}`,
        ),
      );
  }

  const timeline = s.timeline;
  const entry = timeline?.beats[s.beatIndex];
  if (timeline && entry) {
    const total = timeline.beats.length;
    lines.push(
      '',
      tr(
        `[지금 단계 ${String(s.beatIndex + 1)}/${String(total)}]`,
        `[Current step ${String(s.beatIndex + 1)}/${String(total)}]`,
      ),
      entry.beat.narration,
    );
    const before = timeline.beats[s.beatIndex - 1];
    const after = timeline.beats[s.beatIndex + 1];
    if (before)
      lines.push(
        tr(`(이전 단계: ${before.beat.narration})`, `(Previous step: ${before.beat.narration})`),
      );
    if (after)
      lines.push(
        tr(`(다음 단계: ${after.beat.narration})`, `(Next step: ${after.beat.narration})`),
      );
    entry.beat.hops.forEach((hop, i) => {
      lines.push(...hopLines(hop, i, entry.beat.hops.length, nameOf));
    });
    for (const action of entry.beat.nodeActions ?? []) {
      const kind = action.kind ? ` (${ACTION_NAMES[action.kind]})` : '';
      lines.push(
        tr(
          `- 장비 동작: ${nameOf(action.node)}${kind}: ${action.text}`,
          `- Device action: ${nameOf(action.node)}${kind}: ${action.text}`,
        ),
      );
    }
  }

  const selection = s.selection;
  if (selection?.kind === 'node') {
    const node = world?.index.nodes.get(selection.id);
    if (node && world) {
      lines.push(
        '',
        tr('[학습자가 고른 장비]', '[Device the learner selected]'),
        ...nodeLines(node, nameOf, world.index.neighbors(node.id)),
      );
    }
  } else if (selection?.kind === 'packet') {
    const hop = entry?.beat.hops[selection.hopIndex];
    if (hop) {
      lines.push(
        '',
        tr(
          `[학습자가 고른 패킷] ${hop.packet.protocol} "${hop.packet.summary}"`,
          `[Packet the learner selected] ${hop.packet.protocol} "${hop.packet.summary}"`,
        ),
      );
    }
  }

  const lab = s.packetLab;
  const labHop = lab ? timeline?.beats[lab.beatIndex]?.beat.hops[lab.hopIndex] : undefined;
  if (labHop) {
    lines.push(
      '',
      tr(
        `[열려 있는 패킷 해부 창] ${labHop.packet.protocol} "${labHop.packet.summary}"`,
        `[Open packet anatomy window] ${labHop.packet.protocol} "${labHop.packet.summary}"`,
      ),
    );
    const focus = s.labFocus;
    if (focus) {
      lines.push(
        tr(
          `보고 있는 계층: ${focus.layer} 헤더 (${focus.standard})`,
          `Layer being viewed: ${focus.layer} header (${focus.standard})`,
        ),
      );
      if (focus.field) {
        const f = focus.field;
        lines.push(
          tr(
            `가리킨 필드: ${f.name} = ${f.value || '—'} · ${f.position}`,
            `Field pointed at: ${f.name} = ${f.value || '—'} · ${f.position}`,
          ),
          tr(`필드 뜻: ${f.meaning}`, `Field meaning: ${f.meaning}`),
        );
      }
    }
  }

  if (world) {
    const nodes = [...world.topology.nodes].sort(
      (a, b) => (s.nodeNumbers.get(a.id) ?? 999) - (s.nodeNumbers.get(b.id) ?? 999),
    );
    lines.push(
      '',
      tr(
        '[지도의 장비 (번호는 화면의 번호 배지)]',
        '[Devices on the map (numbers match the number badges on screen)]',
      ),
    );
    for (const node of nodes.slice(0, MAX_NODES)) {
      const ip = node.interfaces?.find((i) => i.ip)?.ip;
      const place = node.geo?.place ? ` @${node.geo.place}` : '';
      lines.push(
        `${nameOf(node.id)} (${NODE_TYPE_NAMES[node.type]}${ip ? `, ${ip}` : ''}${place})`,
      );
    }
    if (nodes.length > MAX_NODES)
      lines.push(
        tr(
          `… 외 ${String(nodes.length - MAX_NODES)}개`,
          `… and ${String(nodes.length - MAX_NODES)} more`,
        ),
      );
  }
  return { text: lines.join('\n'), chips: contextChips(s) };
}

/** Short labels of what a question would be sent with (cheap: no text is built). */
export function contextChips(s: ViewerState): string[] {
  const chips: string[] = [];
  const world = s.world;
  if (world) chips.push(VIEW_CHIPS[world.view]);
  const total = s.timeline?.beats.length ?? 0;
  if (total > 0)
    chips.push(
      tr(
        `단계 ${String(s.beatIndex + 1)}/${String(total)}`,
        `Step ${String(s.beatIndex + 1)}/${String(total)}`,
      ),
    );
  const selection = s.selection;
  if (selection?.kind === 'node') {
    const node = world?.index.nodes.get(selection.id);
    const n = s.nodeNumbers.get(selection.id);
    if (node) {
      const num = n === undefined ? '' : tr(`${String(n)}번 `, `#${String(n)} `);
      chips.push(tr(`선택: ${num}${node.label}`, `Selected: ${num}${node.label}`));
    }
  } else if (selection?.kind === 'packet') {
    const hop = s.timeline?.beats[s.beatIndex]?.beat.hops[selection.hopIndex];
    if (hop) {
      chips.push(tr(`선택: 패킷 ${hop.packet.summary}`, `Selected: packet ${hop.packet.summary}`));
    }
  }
  if (s.packetLab) {
    const focus = s.labFocus;
    chips.push(
      focus
        ? tr(
            `패킷 해부: ${focus.layer}${focus.field ? ` · ${focus.field.name}` : ''}`,
            `Packet anatomy: ${focus.layer}${focus.field ? ` · ${focus.field.name}` : ''}`,
          )
        : tr('패킷 해부', 'Packet anatomy'),
    );
  }
  return chips;
}

function hopLines(
  hop: Hop,
  index: number,
  count: number,
  nameOf: (id: string) => string,
): string[] {
  const label =
    count > 1
      ? tr(`패킷 ${String(index + 1)}`, `Packet ${String(index + 1)}`)
      : tr('움직이는 패킷', 'Moving packet');
  const out = [
    tr(
      `- ${label}: ${hop.packet.protocol} "${hop.packet.summary}" · 경로: ${hop.path.map(nameOf).join(' → ')}`,
      `- ${label}: ${hop.packet.protocol} "${hop.packet.summary}" · path: ${hop.path.map(nameOf).join(' → ')}`,
    ),
  ];
  for (const layer of hop.packet.layers) {
    const fields = Object.entries(layer.fields);
    const shown = fields
      .slice(0, MAX_FIELDS)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const extra = String(fields.length - MAX_FIELDS);
    const more = fields.length > MAX_FIELDS ? tr(` …(${extra}개 더)`, ` …(${extra} more)`) : '';
    out.push(`  · ${layer.name}: ${shown}${more}`);
  }
  return out;
}

function nodeLines(
  node: NetNode,
  nameOf: (id: string) => string,
  neighbors: readonly { node: NetNode }[],
): string[] {
  const out = [
    tr(
      `${nameOf(node.id)} — 종류: ${NODE_TYPE_NAMES[node.type]}`,
      `${nameOf(node.id)} — type: ${NODE_TYPE_NAMES[node.type]}`,
    ),
  ];
  for (const i of node.interfaces ?? []) {
    const addrs = [i.ip, i.mac].filter(Boolean).join(' / ') || '—';
    out.push(tr(`인터페이스 ${i.name}: ${addrs}`, `Interface ${i.name}: ${addrs}`));
  }
  if (node.hostname)
    out.push(tr(`이름(역방향 DNS): ${node.hostname}`, `Name (reverse DNS): ${node.hostname}`));
  if (node.asn)
    out.push(
      tr(
        `네트워크: AS${String(node.asn.number)} ${node.asn.name}`,
        `Network: AS${String(node.asn.number)} ${node.asn.name}`,
      ),
    );
  if (node.geo) {
    const where = node.geo.place ?? `${node.geo.lat.toFixed(2)}, ${node.geo.lon.toFixed(2)}`;
    const accuracy =
      node.geo.accuracyKm === undefined
        ? ''
        : tr(
            ` (반경 ${String(node.geo.accuracyKm)} km)`,
            ` (within ${String(node.geo.accuracyKm)} km)`,
          );
    out.push(tr(`위치(추정): ${where}${accuracy}`, `Location (estimated): ${where}${accuracy}`));
  }
  if (node.rttMs !== undefined)
    out.push(
      tr(`왕복 시간: ${node.rttMs.toFixed(1)} ms`, `Round-trip time: ${node.rttMs.toFixed(1)} ms`),
    );
  if (node.source === 'typical')
    out.push(
      tr(
        '측정으로 보이지 않아 일반적인 구성을 가정한 장비',
        'Not visible to measurement, so a typical setup is assumed for this device',
      ),
    );
  if (node.description)
    out.push(tr(`설명: ${node.description}`, `Description: ${node.description}`));
  if (neighbors.length > 0) {
    const linked = neighbors.map((n) => nameOf(n.node.id)).join(', ');
    out.push(tr(`연결된 장비: ${linked}`, `Connected devices: ${linked}`));
  }
  return out;
}
