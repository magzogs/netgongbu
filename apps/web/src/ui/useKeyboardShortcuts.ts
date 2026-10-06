import { useEffect } from 'react';
import { useViewer } from '../store/viewer';
import { showAll, toggleFollow } from '../commands';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

/**
 * Space play/pause, ← → previous/next step, Home back to the first step,
 * F follow the packet, R show the whole topology, Esc close the question panel.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const viewer = useViewer.getState();
      if (e.key === 'Escape' && viewer.askOpen) {
        viewer.setAskOpen(false);
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
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
