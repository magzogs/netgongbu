import type { ReactElement } from 'react';
import { useViewer } from '../store/viewer';

export function StatusOverlay(): ReactElement | null {
  const status = useViewer((s) => s.status);
  if (status.kind === 'ready') return null;
  if (status.kind === 'loading') {
    return <div className="status status--loading">불러오는 중…</div>;
  }
  return (
    <div className="status status--error" role="alert">
      <strong>{status.message}</strong>
      {status.issues.length > 0 && (
        <ul>
          {status.issues.map((issue, i) => (
            <li key={i}>
              <code>{issue.where}</code> {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
