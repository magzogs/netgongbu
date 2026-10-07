import { useEffect } from 'react';
import { useViewer } from '../store/viewer';
import { showAll, toggleFollow, toggleMapView } from '../commands';

function isTyping(target: EventTarget | null): boolean {
  // Not `instanceof HTMLElement`: in a pop-out window elements belong to that window.
  const el = target as Partial<HTMLElement> | null;
  return (
    typeof el?.tagName === 'string' &&
    (el.isContentEditable === true || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))
  );
}

/**
 * Space play/pause, ← → previous/next step, Home back to the first step,
 * F follow the packet, R show the whole topology, G globe or flat map, P open the packet anatomy,
 * Esc close panels. Also used by pop-out windows.
 */
export function handleShortcut(e: KeyboardEvent): void {
  const viewer = useViewer.getState();
  if (e.key === 'Escape' && viewer.packetLab) {
    viewer.openPacketLab(null);
    return;
  }
  if (
    e.key === 'Escape' &&
    (viewer.askOpen || viewer.settingsOpen || viewer.browserOpen || viewer.tutorOpen)
  ) {
    viewer.setAskOpen(false);
    viewer.setSettingsOpen(false);
    viewer.setTutorOpen(false);
    if (viewer.traceRun.kind !== 'running') viewer.setBrowserOpen(false);
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
  switch (e.key) {
    case ' ':
      viewer.togglePlay();
      break;
    case 'ArrowRight':
      viewer.next();
      break;
    case 'ArrowLeft':
      viewer.prev();
      break;
    case 'Home':
      viewer.seek(0, 0);
      break;
    case 'f':
    case 'F':
      toggleFollow();
      break;
    case 'r':
    case 'R':
      showAll();
      break;
    case 'g':
    case 'G':
      toggleMapView();
      break;
    case 'p':
    case 'P': {
      const hops = viewer.timeline?.beats[viewer.beatIndex]?.beat.hops.length ?? 0;
      const selected = viewer.selection?.kind === 'packet' ? viewer.selection.hopIndex : 0;
      if (hops > 0) viewer.openPacketLab(viewer.packetLab ? null : Math.min(selected, hops - 1));
      break;
    }
    default:
      return;
  }
  e.preventDefault();
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', handleShortcut);
    return () => {
      window.removeEventListener('keydown', handleShortcut);
    };
  }, []);
}
