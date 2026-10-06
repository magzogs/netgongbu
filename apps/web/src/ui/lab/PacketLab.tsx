import { useCallback, useMemo, useState, type ReactElement } from 'react';
import type { Hop } from '@magvirtualedu/schema';
import {
  dissect,
  type DissectedLayer,
  type Dissection,
  type Field,
} from '@magvirtualedu/protocols';
import { PROTOCOL_COLORS } from '../../scene/theme';
import { useViewer } from '../../store/viewer';
import { Encapsulation, type Selection } from './Encapsulation';
import { FieldDetail, FieldList } from './FieldPanel';
import type { Radix } from './grid';
import { LayerGrid } from './LayerGrid';
import { PhysicalView } from './PhysicalView';
import { RawDump, type Range } from './RawDump';
import { bytesOf, layerAt, MODEL, payloadOf, stackRows, type LayerRef } from './stack';
import { SOURCE_HINTS, SOURCE_LABELS } from './theme';

const RADIX_KEY = 'magve.lab.radix';

function savedRadix(): Radix {
  try {
    return localStorage.getItem(RADIX_KEY) === 'bin' ? 'bin' : 'hex';
  } catch {
    return 'hex';
  }
}

/**
 * The packet anatomy view: the packet's layers as nested units (which header wraps which), the
 * selected layer's header as a 32-bit diagram like in its standard, and every byte in hex or
 * binary, with where each value comes from.
 */
export function PacketLab(): ReactElement | null {
  const lab = useViewer((s) => s.packetLab);
  const hop = useViewer((s) =>
    lab ? s.timeline?.beats[lab.beatIndex]?.beat.hops[lab.hopIndex] : undefined,
  );
  const [radix, setRadix] = useState<Radix>(savedRadix);
  const changeRadix = useCallback((r: Radix) => {
    setRadix(r);
    try {
      localStorage.setItem(RADIX_KEY, r);
    } catch {
      // Not remembered; the choice still applies now.
    }
  }, []);
  if (!lab || !hop) return null;
  // Keyed by packet so selection and hover start fresh for each one.
  return (
    <PacketLabView
      key={`${String(lab.beatIndex)}-${String(lab.hopIndex)}`}
      hop={hop}
      radix={radix}
      onRadix={changeRadix}
    />
  );
}

/** The network layer if there is one: the layer the structure diagrams are best known for. */
function firstSelection(d: Dissection | null): Selection {
  const ip = d?.layers.findIndex((l) => l.kind === 'ipv4') ?? -1;
  return { part: 'wire', index: Math.max(ip, 0) };
}

/** The layer inside this one (the next header, or the plaintext inside encryption). */
function innerOf(d: Dissection, ref: LayerRef): LayerRef | null {
  const list = ref.part === 'wire' ? d.layers : (d.inner?.layers ?? []);
  if (ref.index + 1 < list.length) return { part: ref.part, index: ref.index + 1 };
  if (ref.part === 'wire' && d.inner?.layers.length) return { part: 'inner', index: 0 };
  return null;
}

function payloadLabel(d: Dissection, ref: LayerRef, next: LayerRef | null): string {
  const inner = next ? layerAt(d, next) : null;
  if (next?.part === 'inner' && ref.part === 'wire') {
    return `🔒 암호문 (풀면 ${inner ? MODEL[inner.kind].short : '내용'})`;
  }
  return inner ? `${MODEL[inner.kind].short} ${MODEL[inner.kind].unit}` : '내용';
}

const rangeOf = (f: Field): Range => ({
  from: Math.floor(f.bitOffset / 8),
  to: Math.ceil((f.bitOffset + f.bitLength) / 8) - 1,
});

function PacketLabView({
  hop,
  radix,
  onRadix,
}: {
  hop: Hop;
  radix: Radix;
  onRadix: (r: Radix) => void;
}): ReactElement {
  const world = useViewer((s) => s.world);
  const close = useViewer((s) => s.openPacketLab);
  const host = world?.index.nodes.get(hop.path.at(-1) ?? '')?.label;
  const dissection = useMemo(() => dissect(hop.packet, host ? { host } : {}), [hop, host]);
  const stack = useMemo(() => (dissection ? stackRows(dissection) : null), [dissection]);
  const [selected, setSelected] = useState<Selection>(() => firstSelection(dissection));
  const [hovered, setHovered] = useState<Field | null>(null);
  const [pinned, setPinned] = useState<Field | null>(null);

  const select = useCallback((next: Selection) => {
    setSelected(next);
    setHovered(null);
    setPinned(null);
  }, []);
  const pin = useCallback((f: Field) => {
    setPinned((prev) => (prev === f ? null : f));
  }, []);

  const ref = selected === 'phy' ? null : selected;
  const layer = dissection ? layerAt(dissection, ref) : null;
  const bytes = dissection ? bytesOf(dissection, ref) : new Uint8Array();
  const partLayers = useMemo(
    () => (ref?.part === 'inner' ? (dissection?.inner?.layers ?? []) : (dissection?.layers ?? [])),
    [dissection, ref?.part],
  );
  const pick = useCallback(
    (owner: DissectedLayer, f: Field | null) => {
      const part = ref?.part ?? 'wire';
      const index = partLayers.indexOf(owner);
      if (index < 0) return;
      setSelected({ part, index });
      setHovered(null);
      setPinned(f);
    },
    [partLayers, ref?.part],
  );
  const focus = hovered ?? pinned;
  const labelOf = (id: string): string => world?.index.nodes.get(id)?.label ?? id;

  let payload = { length: 0, label: '', onOpen: null as (() => void) | null };
  let unit: Range | null = null;
  if (dissection && ref && layer) {
    const p = payloadOf(dissection, ref);
    const next = innerOf(dissection, ref);
    payload = {
      length: p.length,
      label: payloadLabel(dissection, ref, next),
      onOpen: next
        ? () => {
            select(next);
          }
        : null,
    };
    unit = { from: layer.start, to: p.start + p.length + (layer.trailer?.length ?? 0) - 1 };
  }

  return (
    <section className="lab panel" role="dialog" aria-label="패킷 해부">
      <header className="lab__header">
        <span className="chip" style={{ borderColor: PROTOCOL_COLORS[hop.packet.protocol] }}>
          {hop.packet.protocol}
        </span>
        <h2 className="lab__title">{hop.packet.summary}</h2>
        <span className="muted lab__path">
          {labelOf(hop.path[0] ?? '')} → {labelOf(hop.path.at(-1) ?? '')}
        </span>
        <button
          type="button"
          className="text-button lab__close"
          onClick={() => {
            close(null);
          }}
        >
          닫기 (Esc)
        </button>
      </header>

      {!dissection || !stack ? (
        <div className="lab__empty">
          <p>
            이 단계의 메시지는 네트워크로 나가는 패킷이 아니라 <strong>한 컴퓨터 안의 호출</strong>
            (함수 호출이나 시스템 호출)입니다. 바이트로 된 헤더가 없어 해부할 수 없습니다.
          </p>
          <ul>
            {hop.packet.layers.flatMap((l) =>
              Object.entries(l.fields).map(([k, v]) => (
                <li key={`${l.name}-${k}`}>{`${l.name} · ${k}: ${v}`}</li>
              )),
            )}
          </ul>
        </div>
      ) : (
        <>
          <div className="lab__toolbar">
            <div className="segmented" role="radiogroup" aria-label="값 표시">
              {(['hex', 'bin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={radix === r}
                  onClick={() => {
                    onRadix(r);
                  }}
                >
                  {r === 'hex' ? 'HEX 16진수' : 'BIN 2진수'}
                </button>
              ))}
            </div>
            <span className="lab__legend">
              {(['observed', 'derived', 'typical', 'spec'] as const).map((s) => (
                <span key={s} className="lab__legend-item" title={SOURCE_HINTS[s]}>
                  <i className={`dot dot--${s}`} />
                  {SOURCE_LABELS[s]}
                </span>
              ))}
            </span>
            {dissection.completed.length > 0 && (
              <span className="muted lab__completed">
                이 단계에 없던 {dissection.completed.join(', ')} 계층은 일반적인 값으로 채웠습니다.
              </span>
            )}
          </div>

          <div className="lab__scroll">
            <h3 className="lab__h">
              캡슐화{' '}
              <span className="muted">위 계층의 데이터가 아래 계층의 헤더에 싸여 내려갑니다</span>
            </h3>
            <Encapsulation stack={stack} selected={selected} onSelect={select} />

            {layer ? (
              <div className="lab__main">
                <div className="lab__structure">
                  <h3 className="lab__h">
                    {layer.title} 헤더 구조{' '}
                    <span className="muted">
                      {layer.standard} · 헤더 {layer.length}바이트
                      {layer.trailer && ` · 트레일러 ${String(layer.trailer.length)}바이트`}
                    </span>
                  </h3>
                  {layer.encrypted && (
                    <p className="lab__note">
                      🔒 선로 위에서는 암호문입니다. 아래는 보내는 쪽이 암호화하기 전의 내용입니다.
                    </p>
                  )}
                  {layer.note && <p className="lab__note">{layer.note}</p>}
                  <LayerGrid
                    key={`${ref?.part ?? ''}-${String(ref?.index ?? 0)}`}
                    layer={layer}
                    bytes={bytes}
                    radix={radix}
                    focus={focus}
                    onHover={setHovered}
                    onPin={pin}
                    payload={payload}
                  />
                </div>
                <aside className="lab__side">
                  <FieldDetail
                    field={focus}
                    layer={layer}
                    bytes={bytes}
                    pinned={focus !== null && focus === pinned}
                  />
                  <FieldList fields={layer.fields} focus={focus} onHover={setHovered} onPin={pin} />
                </aside>
              </div>
            ) : (
              <PhysicalView d={dissection} radix={radix} />
            )}

            <h3 className="lab__h">
              실제 데이터{' '}
              <span className="muted">
                {ref?.part === 'inner' ? '🔒 암호화 전 내용' : '선로 위 프레임'} {bytes.length}
                바이트 · {radix === 'hex' ? '16진수' : '2진수'} · 바이트를 누르면 그 계층을 엽니다
              </span>
            </h3>
            <RawDump
              bytes={bytes}
              layers={partLayers}
              radix={radix}
              highlight={focus ? rangeOf(focus) : null}
              unit={unit}
              onHover={setHovered}
              onPick={pick}
            />
          </div>
        </>
      )}
    </section>
  );
}
