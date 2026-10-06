import { describe, expect, it } from 'vitest';
import { useViewer } from '../src/store/viewer';

describe('selection', () => {
  it('opens a folded inspector when something is picked, and leaves it as is when cleared', () => {
    const { select, setInspectorOpen } = useViewer.getState();
    setInspectorOpen(false);
    select({ kind: 'node', id: 'r-home' });
    expect(useViewer.getState().inspectorOpen).toBe(true);
    setInspectorOpen(false);
    select(null);
    expect(useViewer.getState().inspectorOpen).toBe(false);
    select({ kind: 'packet', hopIndex: 1 });
    expect(useViewer.getState().inspectorOpen).toBe(true);
  });
});
