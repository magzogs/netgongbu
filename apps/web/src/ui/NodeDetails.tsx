import type { ReactElement } from 'react';
import { useViewer } from '../store/viewer';
import { MEDIUM_NAMES, NODE_TYPE_NAMES } from './names';

/** What a node is, its interfaces and what it connects to. */
export function NodeDetails({ id }: { id: string }): ReactElement | null {
  const world = useViewer((s) => s.world);
  const select = useViewer((s) => s.select);
  const node = world?.index.nodes.get(id);
  if (!world || !node) return null;
  const neighbors = world.index.neighbors(id);

  return (
    <div className="node-details">
      <div className="node-details__title">
        <strong>{node.label}</strong>
        {NODE_TYPE_NAMES[node.type] !== node.label && (
          <span className="muted">{NODE_TYPE_NAMES[node.type]}</span>
        )}
      </div>
      {node.description && <p className="node-details__desc">{node.description}</p>}
      {node.interfaces && node.interfaces.length > 0 && (
        <table className="kv-table">
          <thead>
            <tr>
              <th>인터페이스</th>
              <th>IP</th>
              <th>MAC</th>
            </tr>
          </thead>
          <tbody>
            {node.interfaces.map((i) => (
              <tr key={i.name}>
                <td>{i.name}</td>
                <td>{i.ip ?? '—'}</td>
                <td>{i.mac ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {neighbors.length > 0 && (
        <>
          <h3 className="section-title">연결된 장비</h3>
          <ul className="neighbors">
            {neighbors.map(({ node: other, link }) => (
              <li key={link.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    select({ kind: 'node', id: other.id });
                  }}
                >
                  {other.label}
                </button>
                <span className="muted">{MEDIUM_NAMES[link.medium]}</span>
                {link.latencyMs !== undefined && <span className="muted">{link.latencyMs} ms</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
