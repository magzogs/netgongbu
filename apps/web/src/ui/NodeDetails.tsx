import type { ReactElement } from 'react';
import { tr } from '@netgongbu/schema';
import { useViewer } from '../store/viewer';
import { closeZone, focusNode, openZone } from '../commands';
import { MEDIUM_NAMES, NODE_TYPE_NAMES } from './names';
import { NodeNumber } from './SceneLabels';

/**
 * The zone a node belongs to on the globe or the map (the computer, the home): while it is
 * folded into one node, a button opens it into its nodes; once open, one folds it again.
 */
function ZoneBox({ id }: { id: string }): ReactElement | null {
  const zone = useViewer((s) => s.world?.clusters.find((c) => c.members.includes(id)));
  const fold = useViewer((s) =>
    zone ? s.folds.find((f) => f.zoneIds.includes(zone.zoneId)) : undefined,
  );
  const label = useViewer((s) =>
    fold
      ? fold.zoneIds
          .map((z) => s.world?.clusters.find((c) => c.zoneId === z)?.label ?? z)
          .join(' · ')
      : zone?.label,
  );
  const count = useViewer((s) =>
    fold
      ? (s.world?.clusters ?? [])
          .filter((c) => fold.zoneIds.includes(c.zoneId))
          .reduce((n, c) => n + c.members.length, 0)
      : (zone?.members.length ?? 0),
  );
  if (!zone) return null;
  return (
    <div className="zone-box">
      <span>
        <strong>{label}</strong>{' '}
        <span className="muted">{tr(`장비 ${String(count)}개`, `${String(count)} devices`)}</span>
      </span>
      {fold ? (
        <button
          type="button"
          className="text-button"
          title={tr(
            '안에 있는 장비를 하나씩 펼쳐 봅니다 (마커를 두 번 눌러도 됩니다)',
            'Expand the devices inside one by one (or double-click the marker)',
          )}
          onClick={() => {
            openZone(fold.key);
          }}
        >
          {tr('자세히 보기', 'Show details')}
        </button>
      ) : (
        <button
          type="button"
          className="text-button"
          title={tr('안의 장비를 다시 하나로 접습니다', 'Fold the devices inside back into one')}
          onClick={() => {
            closeZone(zone.zoneId);
          }}
        >
          {tr('하나로 접기', 'Fold into one')}
        </button>
      )}
    </div>
  );
}

/** What a node is, its interfaces and what it connects to. */
export function NodeDetails({ id }: { id: string }): ReactElement | null {
  const world = useViewer((s) => s.world);
  const select = useViewer((s) => s.select);
  const number = useViewer((s) => s.nodeNumbers.get(id));
  const ask = useViewer((s) => s.ask);
  const node = world?.index.nodes.get(id);
  if (!world || !node) return null;
  const neighbors = world.index.neighbors(id);
  const numberPrefix =
    number === undefined ? '' : tr(`${String(number)}번 `, `#${String(number)} `);
  const name = `${numberPrefix}${node.label}`;

  return (
    <div className="node-details">
      <ZoneBox id={id} />
      <div className="node-details__title">
        <NodeNumber id={node.id} />
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
        {tr('이 장비로 이동', 'Go to this device')}
      </button>
      <button
        type="button"
        className="text-button node-details__focus"
        title={tr('AI에게 이 장비에 대해 묻습니다', 'Ask the AI about this device')}
        onClick={() => {
          void ask(
            tr(
              `${name}은(는) 어떤 장비이고, 이 과정에서 무슨 일을 하나요?`,
              `What kind of device is ${name}, and what does it do in this process?`,
            ),
          );
        }}
      >
        {tr('AI에게 묻기', 'Ask the AI')}
      </button>
      {node.source === 'typical' && (
        <p className="node-details__typical">
          {tr(
            '측정으로 보이지 않아 일반적인 구성을 가정해 그린 장비입니다.',
            'This device was not visible to measurement, so it is drawn assuming a typical setup.',
          )}
        </p>
      )}
      {node.description && <p className="node-details__desc">{node.description}</p>}
      {(node.hostname ?? node.asn ?? node.geo ?? node.rttMs) !== undefined && (
        <dl className="facts">
          {node.hostname && (
            <div>
              <dt>{tr('이름', 'Name')}</dt>
              <dd>{node.hostname}</dd>
            </div>
          )}
          {node.asn && (
            <div>
              <dt>{tr('네트워크', 'Network')}</dt>
              <dd>
                AS{node.asn.number} {node.asn.name}
              </dd>
            </div>
          )}
          {node.geo && (
            <div>
              <dt>{tr('위치(추정)', 'Location (estimated)')}</dt>
              <dd>
                {node.geo.place ?? `${node.geo.lat.toFixed(2)}, ${node.geo.lon.toFixed(2)}`}
                {node.geo.accuracyKm !== undefined &&
                  tr(
                    ` · 반경 ${String(node.geo.accuracyKm)} km`,
                    ` · within ${String(node.geo.accuracyKm)} km`,
                  )}
              </dd>
            </div>
          )}
          {node.rttMs !== undefined && (
            <div>
              <dt>{tr('왕복 시간', 'Round-trip time')}</dt>
              <dd>{node.rttMs.toFixed(1)} ms</dd>
            </div>
          )}
        </dl>
      )}
      {node.interfaces && node.interfaces.length > 0 && (
        <table className="kv-table">
          <thead>
            <tr>
              <th>{tr('인터페이스', 'Interface')}</th>
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
          <h3 className="section-title">{tr('연결된 장비', 'Connected devices')}</h3>
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
