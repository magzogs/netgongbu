import type { ReactElement } from 'react';
import type { ViewerEntry } from '../data/load';
import { useViewer } from '../store/viewer';

function Options({ entries }: { entries: readonly ViewerEntry[] }): ReactElement {
  return (
    <>
      {entries.map((entry) => (
        <option key={entry.id} value={entry.id} title={entry.question}>
          {entry.title}
        </option>
      ))}
    </>
  );
}

export function ScenarioPicker(): ReactElement {
  const catalog = useViewer((s) => s.catalog);
  const entryId = useViewer((s) => s.entryId);
  const open = useViewer((s) => s.open);
  const examples = catalog.filter((e) => e.source === 'example');
  const generated = catalog.filter((e) => e.source === 'ai');
  const traces = catalog.filter((e) => e.source === 'trace');
  return (
    <label className="picker">
      <span className="visually-hidden">시나리오</span>
      <select
        value={entryId ?? ''}
        onChange={(e) => {
          void open(e.target.value);
        }}
      >
        {generated.length + traces.length > 0 ? (
          <>
            <optgroup label="예제">
              <Options entries={examples} />
            </optgroup>
            {traces.length > 0 && (
              <optgroup label="내 컴퓨터에서 실측">
                <Options entries={traces} />
              </optgroup>
            )}
            {generated.length > 0 && (
              <optgroup label="AI가 만든 시나리오">
                <Options entries={generated} />
              </optgroup>
            )}
          </>
        ) : (
          <Options entries={examples} />
        )}
      </select>
    </label>
  );
}
