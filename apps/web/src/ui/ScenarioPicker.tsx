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
  return (
    <label className="picker">
      <span className="visually-hidden">시나리오</span>
      <select
        value={entryId ?? ''}
        onChange={(e) => {
          void open(e.target.value);
        }}
      >
        {generated.length > 0 ? (
          <>
            <optgroup label="예제">
              <Options entries={examples} />
            </optgroup>
            <optgroup label="AI가 만든 시나리오">
              <Options entries={generated} />
            </optgroup>
          </>
        ) : (
          <Options entries={examples} />
        )}
      </select>
    </label>
  );
}

/** Opens the question panel; shows progress while a scenario is being generated. */
export function AskButton(): ReactElement {
  const pending = useViewer((s) => s.ask.kind === 'pending');
  const open = useViewer((s) => s.askOpen);
  const setAskOpen = useViewer((s) => s.setAskOpen);
  return (
    <button
      type="button"
      className="ask-button"
      aria-expanded={open}
      onClick={() => {
        setAskOpen(!open);
      }}
    >
      {pending && <span className="spinner spinner--small" aria-hidden="true" />}
      AI에게 질문
    </button>
  );
}
