import { useEffect } from 'react';
import { useViewer } from '../store/viewer';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

/** Space play/pause, ← → previous/next step, Home back to the first step. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const viewer = useViewer.getState();
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
