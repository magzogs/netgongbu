import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

/**
 * A panel inside the app that can be moved (drag anything marked `data-drag-handle`, such as its
 * header), resized from any edge or corner, and maximised (double-click the handle). Where it was
 * is remembered per `storageKey`.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Room kept clear for the top bar, and around the edges of the window. */
const TOP = 64;
const GUTTER = 16;
/** Part of the panel that must stay on screen so it can always be dragged back. */
const KEEP = 80;

function viewport(): { w: number; h: number } {
  return { w: window.innerWidth || 1024, h: window.innerHeight || 768 };
}

/** The whole free area under the top bar. */
export function fullRect(): Rect {
  const { w, h } = viewport();
  return {
    x: GUTTER,
    y: TOP,
    w: Math.max(200, w - 2 * GUTTER),
    h: Math.max(160, h - TOP - GUTTER),
  };
}

function clampRect(r: Rect, min: { w: number; h: number }): Rect {
  const { w: vw, h: vh } = viewport();
  const w = Math.min(Math.max(r.w, Math.min(min.w, vw)), vw);
  const h = Math.min(Math.max(r.h, Math.min(min.h, vh - TOP)), vh);
  const x = Math.min(Math.max(r.x, KEEP - w), vw - KEEP);
  const y = Math.min(Math.max(r.y, 0), vh - 40);
  return { x, y, w, h };
}

function saved(key: string): Rect | null {
  try {
    const raw = localStorage.getItem(key);
    const r = raw ? (JSON.parse(raw) as Partial<Rect>) : null;
    if (r && [r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return r as Rect;
    }
  } catch {
    // Start from the default.
  }
  return null;
}

function remember(key: string, r: Rect): void {
  try {
    localStorage.setItem(key, JSON.stringify(r));
  } catch {
    // Not remembered; the panel still stays where it is now.
  }
}

interface Props {
  storageKey: string;
  min: { w: number; h: number };
  /** Where it opens the first time. */
  initial: () => Rect;
  maximized: boolean;
  onMaximized: (maximized: boolean) => void;
  className?: string;
  children: ReactNode;
}

export function FloatingWindow({
  storageKey,
  min,
  initial,
  maximized,
  onMaximized,
  className,
  children,
}: Props): ReactElement {
  const [rect, setRect] = useState<Rect>(() => clampRect(saved(storageKey) ?? initial(), min));
  const [, setViewportSize] = useState(viewport);
  const gesture = useRef<{ start: Rect; x: number; y: number; edge: Edge | 'move' } | null>(null);

  // Keep it reachable when the window gets smaller.
  useEffect(() => {
    const onResize = (): void => {
      setViewportSize(viewport());
      setRect((r) => clampRect(r, min));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [min]);

  const begin = useCallback(
    (e: ReactPointerEvent<HTMLElement>, edge: Edge | 'move') => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      // Dragging a maximised panel puts it back to its own size first.
      if (maximized) onMaximized(false);
      gesture.current = { start: rect, x: e.clientX, y: e.clientY, edge };
    },
    [rect, maximized, onMaximized],
  );

  const move = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      const s = g.start;
      if (g.edge === 'move') {
        setRect(clampRect({ ...s, x: s.x + dx, y: s.y + dy }, min));
        return;
      }
      let { x, y, w, h } = s;
      if (g.edge.includes('e')) w = Math.max(min.w, s.w + dx);
      if (g.edge.includes('s')) h = Math.max(min.h, s.h + dy);
      if (g.edge.includes('w')) {
        w = Math.max(min.w, s.w - dx);
        x = s.x + s.w - w;
      }
      if (g.edge.includes('n')) {
        h = Math.max(min.h, s.h - dy);
        y = Math.max(0, s.y + s.h - h);
        h = s.y + s.h - y;
      }
      setRect(clampRect({ x, y, w, h }, min));
    },
    [min],
  );

  // Moves and the end of a resize bubble up here from the captured edge.
  const end = useCallback(() => {
    if (!gesture.current) return;
    gesture.current = null;
    remember(storageKey, rect);
  }, [storageKey, rect]);

  /** Drags start on the handle, but not on the buttons and fields inside it. */
  const fromHandle = (e: { target: EventTarget }): boolean => {
    const target = e.target as Element;
    return (
      target.closest('[data-drag-handle]') !== null &&
      target.closest('button, input, select, textarea, a, label') === null
    );
  };

  const shown = maximized ? fullRect() : rect;
  return (
    <div
      className={`floating${maximized ? ' is-maximized' : ''}${className ? ` ${className}` : ''}`}
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h }}
      onPointerDown={(e) => {
        if (fromHandle(e)) begin(e, 'move');
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={(e) => {
        if (fromHandle(e)) onMaximized(!maximized);
      }}
    >
      {children}
      {!maximized &&
        EDGES.map((edge) => (
          <div
            key={edge}
            className={`floating__edge floating__edge--${edge}`}
            aria-hidden="true"
            onPointerDown={(e) => {
              e.stopPropagation();
              begin(e, edge);
            }}
          />
        ))}
    </div>
  );
}
