import { useEffect, type ReactElement } from 'react';
import { Scene } from './scene/Scene';
import { useViewer } from './store/viewer';
import { AskPanel } from './ui/AskPanel';
import { Inspector } from './ui/Inspector';
import { BrowserButton, LaptopBrowser } from './ui/LaptopBrowser';
import { Legend } from './ui/Legend';
import { Player } from './ui/Player';
import { AskButton, ScenarioPicker } from './ui/ScenarioPicker';
import { SceneLabels } from './ui/SceneLabels';
import { SettingsButton, SettingsPanel } from './ui/SettingsPanel';
import { StatusOverlay } from './ui/StatusOverlay';
import { useKeyboardShortcuts } from './ui/useKeyboardShortcuts';

export function App(): ReactElement {
  const init = useViewer((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  useKeyboardShortcuts();

  return (
    <div className="app">
      <Scene />
      <SceneLabels />
      <header className="topbar">
        <h1 className="topbar__title">Network in 3D</h1>
        <ScenarioPicker />
        <AskButton />
        <BrowserButton />
        <SettingsButton />
      </header>
      <Legend />
      <Inspector />
      <Player />
      <AskPanel />
      <LaptopBrowser />
      <SettingsPanel />
      <StatusOverlay />
    </div>
  );
}
