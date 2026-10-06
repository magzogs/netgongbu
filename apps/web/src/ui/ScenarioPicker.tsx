import type { ReactElement } from 'react';
import { useViewer } from '../store/viewer';

export function ScenarioPicker(): ReactElement {
  const catalog = useViewer((s) => s.catalog);
  const entryId = useViewer((s) => s.entryId);
  const open = useViewer((s) => s.open);
  return (
    <label className="picker">
      <span className="visually-hidden">시나리오</span>
      <select
        value={entryId ?? ''}
        onChange={(e) => {
          void open(e.target.value);
        }}
      >
        {catalog.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.title}
          </option>
        ))}
      </select>
    </label>
  );
}
