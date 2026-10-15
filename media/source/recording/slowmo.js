// Runs the page in slow motion so stepped screenshots can keep up: every clock the viewer reads
// (performance.now, Date.now, requestAnimationFrame's time, timer delays) goes 1/K as fast as real
// time. take.mjs slows CSS animations by the same factor (Animation.setPlaybackRate) and counts
// the time of each frame the same way, so the take plays back at normal speed.
(() => {
  const K = Number(window.__SLOWMO__ ?? 1);
  if (K === 1) return;
  const realNow = performance.now.bind(performance);
  const r0 = realNow();
  performance.now = () => r0 + (realNow() - r0) / K;
  const realDate = Date.now;
  const d0 = realDate();
  Date.now = () => d0 + (realDate() - d0) / K;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => cb(r0 + (ts - r0) / K));
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
  window.setTimeout = (f, ms = 0, ...a) => st(f, ms * K, ...a);
  window.setInterval = (f, ms = 0, ...a) => si(f, ms * K, ...a);
})();
