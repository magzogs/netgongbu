import { useEffect, type ReactElement } from 'react';
import { Scene } from './scene/Scene';
import { useViewer } from './store/viewer';
import { ScenarioPicker } from './ui/ScenarioPicker';
import { SceneLabels } from './ui/SceneLabels';
import { StatusOverlay } from './ui/StatusOverlay';

export function App(): ReactElement {
  const init = useViewer((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app">
      <Scene />
      <SceneLabels />
      <header className="topbar">
        <h1 className="topbar__title">Network in 3D</h1>
        <ScenarioPicker />
      </header>
      <StatusOverlay />
    </div>
  );
}
