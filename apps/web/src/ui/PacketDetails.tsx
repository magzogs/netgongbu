import { useMemo, type ReactElement } from 'react';
import { tr, type Layer } from '@netgongbu/schema';
import { changedFields, fieldKey, previousLeg, type FieldChanges } from '../engine/packetDiff';
import { PROTOCOL_COLORS } from '../scene/theme';
import { useViewer } from '../store/viewer';
import { SOURCE_HINTS, SOURCE_NAMES } from './names';

interface LayersProps {
  layers: readonly Layer[];
  depth: number;
  changes: FieldChanges;
}

/** Headers drawn as nested boxes: each layer wraps the ones it carries. */
function Layers({ layers, depth, changes }: LayersProps): ReactElement | null {
  const layer = layers[depth];
  if (!layer) return null;
  const fields = Object.entries(layer.fields);
  return (
    <div className="layer">
      <div className="layer__name">{layer.name}</div>
      {fields.length > 0 && (
        <dl className="layer__fields">
          {fields.map(([field, value]) => {
            const was = changes.get(fieldKey(layer.name, field));
            const source = layer.sources?.[field];
            return (
              <div key={field} className={`field${was === undefined ? '' : ' is-changed'}`}>
                <dt>{field}</dt>
                <dd>
                  {value}
                  {source && (
                    <span className={`source source--${source}`} title={SOURCE_HINTS[source]}>
                      {SOURCE_NAMES[source]}
                    </span>
                  )}
                  {was !== undefined && (
                    <span className="field__was">{tr(`이전 ${was}`, `was ${was}`)}</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <Layers layers={layers} depth={depth + 1} changes={changes} />
    </div>
  );
}

/** Headers of the current beat's packet, with what changed since the previous leg. */
export function PacketDetails(): ReactElement {
  const timeline = useViewer((s) => s.timeline);
  const beatIndex = useViewer((s) => s.beatIndex);
  const world = useViewer((s) => s.world);
  const selection = useViewer((s) => s.selection);
  const select = useViewer((s) => s.select);
  const openPacketLab = useViewer((s) => s.openPacketLab);

  const entry = timeline?.beats[beatIndex];
  const hops = entry?.beat.hops ?? [];
  const wanted = selection?.kind === 'packet' ? selection.hopIndex : 0;
  const hopIndex = Math.min(wanted, Math.max(0, hops.length - 1));
  const hop = hops[hopIndex];

  const previous = useMemo(
    () => (timeline && hop ? previousLeg(timeline, beatIndex, hopIndex) : undefined),
    [timeline, beatIndex, hopIndex, hop],
  );
  const changes = useMemo(
    () => (previous && hop ? changedFields(previous.packet.layers, hop.packet.layers) : new Map()),
    [previous, hop],
  );

  if (!hop)
    return (
      <p className="muted">
        {tr('이 단계에서는 이동하는 패킷이 없습니다.', 'No packet is moving at this step.')}
      </p>
    );

  const labelOf = (id: string): string => world?.index.nodes.get(id)?.label ?? id;
  const changedAt = previous?.path.at(-1);

  return (
    <div className="packet-details">
      {hops.length > 1 && (
        <div className="tabs" role="tablist">
          {hops.map((h, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === hopIndex}
              className="tab"
              onClick={() => {
                select({ kind: 'packet', hopIndex: i });
              }}
            >
              {h.packet.summary}
            </button>
          ))}
        </div>
      )}
      <div className="packet-details__title">
        <span className="chip" style={{ borderColor: PROTOCOL_COLORS[hop.packet.protocol] }}>
          {hop.packet.protocol}
        </span>
        <strong>{hop.packet.summary}</strong>
        <button
          type="button"
          className="text-button packet-details__lab"
          title={tr(
            '모든 계층을 실제 바이트와 비트 단위 필드로 보기 (P)',
            'See every layer as real bytes and bit-level fields (P)',
          )}
          onClick={() => {
            openPacketLab(hopIndex);
          }}
        >
          {tr('패킷 해부 ▸', 'Packet anatomy ▸')}
        </button>
      </div>
      <p className="packet-details__path">{hop.path.map(labelOf).join(' → ')}</p>
      {changes.size > 0 && changedAt && (
        <p className="packet-details__hint">
          <span className="swatch" />{' '}
          {tr(
            `${labelOf(changedAt)} 통과 후 바뀐 값`,
            `Values changed after passing ${labelOf(changedAt)}`,
          )}
        </p>
      )}
      <Layers layers={hop.packet.layers} depth={0} changes={changes} />
    </div>
  );
}
