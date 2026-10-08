import type { ReactElement } from 'react';
import { tr } from '@netgongbu/schema';
import { useViewer } from '../store/viewer';
import { NodeDetails } from './NodeDetails';
import { PacketDetails } from './PacketDetails';

/** Right-hand panel: the selected node, or else the headers of the packet now moving. */
export function Inspector(): ReactElement | null {
  const open = useViewer((s) => s.inspectorOpen);
  const setOpen = useViewer((s) => s.setInspectorOpen);
  const selection = useViewer((s) => s.selection);
  const select = useViewer((s) => s.select);
  const ready = useViewer((s) => s.timeline !== null);
  const hops = useViewer((s) => s.timeline?.beats[s.beatIndex]?.beat.hops.length ?? 0);
  const labOpen = useViewer((s) => s.packetLab !== null);
  const openPacketLab = useViewer((s) => s.openPacketLab);
  if (!ready) return null;

  const showingNode = selection?.kind === 'node';
  const title = showingNode ? tr('장비 정보', 'Device info') : tr('패킷 헤더', 'Packet headers');

  return (
    <aside className={`inspector panel${open ? '' : ' is-collapsed'}`} aria-label={title}>
      <header className="inspector__header">
        <h2 className="inspector__title">{title}</h2>
        {showingNode && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              select(null);
            }}
          >
            {tr('패킷 보기', 'Show packet')}
          </button>
        )}
        <button
          type="button"
          className="text-button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? tr('접기', 'Collapse') : tr('펼치기', 'Expand')}
        </button>
      </header>
      {open && (
        <div className="inspector__body">
          {showingNode ? <NodeDetails id={selection.id} /> : <PacketDetails />}
        </div>
      )}
      <footer className="inspector__footer">
        <button
          type="button"
          className="inspector__lab"
          disabled={hops === 0}
          aria-pressed={labOpen}
          title={
            hops === 0
              ? tr('이 단계에서는 이동하는 패킷이 없습니다', 'No packets move in this step')
              : tr(
                  '모든 계층을 실제 바이트와 비트 단위 필드로 보기 (P)',
                  'See every layer as real bytes and bit-level fields (P)',
                )
          }
          onClick={() => {
            const wanted = selection?.kind === 'packet' ? selection.hopIndex : 0;
            openPacketLab(labOpen ? null : Math.min(wanted, hops - 1));
          }}
        >
          <span>{tr('패킷 해부', 'Packet anatomy')}</span>
          <span className="inspector__lab-hint">{labOpen ? tr('닫기', 'Close') : 'P ▸'}</span>
        </button>
      </footer>
    </aside>
  );
}
