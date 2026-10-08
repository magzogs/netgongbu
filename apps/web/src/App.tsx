import { useEffect, type ReactElement } from 'react';
import { Scene } from './scene/Scene';
import { useViewer } from './store/viewer';
import { Inspector } from './ui/Inspector';
import { BrowserButton, LaptopBrowser } from './ui/LaptopBrowser';
import { Legend } from './ui/Legend';
import { PacketLab } from './ui/lab/PacketLab';
import { Player } from './ui/Player';
import { ScenarioPicker } from './ui/ScenarioPicker';
import { SceneLabels } from './ui/SceneLabels';
import { SettingsButton, SettingsPanel } from './ui/SettingsPanel';
import { StatusOverlay } from './ui/StatusOverlay';
import { AssistantButton, AssistantPanel } from './ui/assistant/AssistantPanel';
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
        <img className="topbar__logo" src="/logo.svg" alt="" width={28} height={28} />
        <h1 className="topbar__title">Net Gongbu</h1>
        <ScenarioPicker />
        <AssistantButton />
        <BrowserButton />
        <SettingsButton />
      </header>
      <Legend />
      <Inspector />
      <Player />
      <LaptopBrowser />
      <SettingsPanel />
      <PacketLab />
      <AssistantPanel />
      <StatusOverlay />
    </div>
  );
}
