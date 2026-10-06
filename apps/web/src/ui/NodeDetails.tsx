import type { ReactElement } from 'react';
import { useViewer } from '../store/viewer';
import { focusNode } from '../commands';
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
      <button
        type="button"
        className="text-button node-details__focus"
        onClick={() => {
          focusNode(node.id);
        }}
      >
        이 장비로 이동
      </button>
      {node.source === 'typical' && (
        <p className="node-details__typical">
          측정으로 보이지 않아 일반적인 구성을 가정해 그린 장비입니다.
        </p>
      )}
      {node.description && <p className="node-details__desc">{node.description}</p>}
      {(node.hostname ?? node.asn ?? node.geo ?? node.rttMs) !== undefined && (
        <dl className="facts">
          {node.hostname && (
            <div>
              <dt>이름</dt>
              <dd>{node.hostname}</dd>
            </div>
          )}
          {node.asn && (
            <div>
              <dt>네트워크</dt>
              <dd>
                AS{node.asn.number} {node.asn.name}
              </dd>
            </div>
          )}
          {node.geo && (
            <div>
              <dt>위치(추정)</dt>
              <dd>
                {node.geo.place ?? `${node.geo.lat.toFixed(2)}, ${node.geo.lon.toFixed(2)}`}
                {node.geo.accuracyKm !== undefined && ` · 반경 ${String(node.geo.accuracyKm)} km`}
              </dd>
            </div>
          )}
          {node.rttMs !== undefined && (
            <div>
              <dt>왕복 시간</dt>
              <dd>{node.rttMs.toFixed(1)} ms</dd>
            </div>
          )}
        </dl>
      )}
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
