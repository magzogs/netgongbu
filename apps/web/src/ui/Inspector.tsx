import type { ReactElement } from 'react';
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
  if (!ready) return null;

  const showingNode = selection?.kind === 'node';
  const title = showingNode ? '장비 정보' : '패킷 헤더';

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
            패킷 보기
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
          {open ? '접기' : '펼치기'}
        </button>
      </header>
      {open && (
        <div className="inspector__body">
          {showingNode ? <NodeDetails id={selection.id} /> : <PacketDetails />}
        </div>
      )}
    </aside>
  );
}
