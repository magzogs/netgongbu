import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Shows its children in a separate window (a browser popup, or a window of its own in the
 * desktop app) that can be moved to another screen and sized freely. The children stay part of
 * this React tree, so they share the app's state; the window gets copies of the app's styles.
 */

/** Window name the desktop app recognises (and allows) for pop-out windows. */
export const POPOUT_NAME = 'magve-popout';

export interface Popout {
  win: Window;
  root: HTMLElement;
}

function copyStyles(from: Document, to: Document): void {
  for (const node of from.querySelectorAll('style, link[rel="stylesheet"]')) {
    const copy = to.importNode(node, true);
    // Relative stylesheet links would resolve against about:blank.
    if (node instanceof HTMLLinkElement) copy.setAttribute('href', node.href);
    to.head.appendChild(copy);
  }
}

/**
 * Opens the pop-out window with the app's styles, from a click (browsers block popups opened
 * any other way). Null when the browser refused.
 */
export function openPopout(width = 1200, height = 820): Popout | null {
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + 60;
  const win = window.open(
    '',
    POPOUT_NAME,
    `popup,width=${String(width)},height=${String(height)},left=${String(left)},top=${String(top)}`,
  );
  if (!win) return null;
  const doc = win.document;
  // A window left over from before (same name) is emptied and reused.
  doc.head.replaceChildren();
  doc.body.replaceChildren();
  doc.documentElement.lang = document.documentElement.lang || 'ko';
  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  doc.head.appendChild(charset);
  copyStyles(document, doc);
  doc.body.className = 'popout';
  const root = doc.createElement('div');
  root.className = 'popout__root';
  doc.body.appendChild(root);
  win.focus();
  return { win, root };
}

function retitle({ win }: Popout, title: string): void {
  win.document.title = title;
}

interface Props {
  popout: Popout;
  title: string;
  /** The user closed the window (not called when this component closes it). */
  onClose: () => void;
  /** Key presses in the window, so shortcuts work there too. */
  onKeyDown?: (e: KeyboardEvent) => void;
  children: ReactNode;
}

/** Renders into an open pop-out window, and closes it when unmounted. */
export function PopoutWindow({ popout, title, onClose, onKeyDown, children }: Props): ReactElement {
  // The latest callbacks, without re-subscribing when they change.
  const handlers = useRef({ onClose, onKeyDown });
  useEffect(() => {
    handlers.current = { onClose, onKeyDown };
  });

  useEffect(() => {
    const { win } = popout;
    const closed = (): void => {
      handlers.current.onClose();
    };
    const key = (e: KeyboardEvent): void => {
      handlers.current.onKeyDown?.(e);
    };
    // The main window going away takes the pop-out with it.
    const closeWithApp = (): void => {
      win.close();
    };
    win.addEventListener('pagehide', closed);
    win.addEventListener('keydown', key);
    window.addEventListener('pagehide', closeWithApp);
    return () => {
      window.removeEventListener('pagehide', closeWithApp);
      win.removeEventListener('pagehide', closed);
      win.removeEventListener('keydown', key);
      win.close();
    };
  }, [popout]);

  useEffect(() => {
    retitle(popout, title);
  }, [popout, title]);

  return createPortal(children, popout.root);
}
