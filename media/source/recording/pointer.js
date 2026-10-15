// Headless capture shows no pointer, so this draws one where the real mouse events land: an arrow
// that follows pointermove, and a ring at each press. pointer-events: none, so it never gets in the way.
(() => {
  const css = `
  #rec-pointer { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 30px; height: 40px; transform-origin: 3px 3px; transition: scale .12s; will-change: transform; }
  #rec-pointer.down { scale: .86; }
  #rec-pointer svg { display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); }
  .rec-ring { position: fixed; z-index: 2147483646; pointer-events: none; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
    border: 3px solid #FFB33C; box-shadow: 0 0 0 2px rgba(255,255,255,.55), 0 0 18px rgba(255,170,40,.6); animation: rec-ring .55s cubic-bezier(.2,.7,.3,1) forwards; }
  @keyframes rec-ring { from { transform: scale(.25); opacity: 1; } to { transform: scale(1); opacity: 0; } }`;
  const add = () => {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const p = document.createElement('div'); p.id = 'rec-pointer';
    p.innerHTML = '<svg viewBox="0 0 17 23" width="30" height="40"><path d="M1.5 1.5 V18 L5.8 14 L9 21.2 L12 19.9 L8.9 12.9 H14.8 Z" fill="#fff" stroke="#15100C" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    p.style.transform = 'translate(-60px, -60px)';
    document.body.appendChild(p);
    addEventListener('pointermove', (e) => { p.style.transform = `translate(${e.clientX - 2.6}px, ${e.clientY - 2.6}px)`; }, { capture: true, passive: true });
    addEventListener('pointerdown', (e) => {
      p.classList.add('down');
      const r = document.createElement('div'); r.className = 'rec-ring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); r.addEventListener('animationend', () => r.remove());
    }, { capture: true, passive: true });
    addEventListener('pointerup', () => p.classList.remove('down'), { capture: true, passive: true });
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();
