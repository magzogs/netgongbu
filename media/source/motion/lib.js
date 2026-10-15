// Shared by every project's motion page (<id>.html). A page draws its clips as pure functions of the
// time t, so any frame can be drawn alone, and hands them to startClips; render.mjs then calls
// window.renderAt(t) frame by frame. ?clip=<features|how|stack>&lang=<ko|en> picks what to show.

// ---- time helpers: everything is a pure function of t, so any frame can be drawn alone ----
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const E = {
  lin: (u) => u,
  io: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out: (u) => 1 - Math.pow(1 - u, 3),
  in: (u) => u * u * u,
  back: (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
  spring: (u) => (u >= 1 ? 1 : 1 - Math.exp(-6.5 * u) * Math.cos(10.5 * u)),
};
const prog = (t, t0, t1, e = E.io) => e(clamp((t - t0) / (t1 - t0)));
const mix = (a, b, u) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], u)) : lerp(a, b, u));
/** keyframes [[t, value, ease?], ...]; the ease belongs to the segment that ends at that key */
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return mix(v0, v1, (e || E.io)(clamp((t - t0) / (t1 - t0)))); }
  }
  return keys[keys.length - 1][1];
}
/** pop in at t0, pop out at t1 (scale, opacity) */
function pop(t, t0, t1 = 1e9, din = 0.5, dout = 0.22) {
  if (t < t0 || t > t1 + dout) return [0, 0];
  if (t > t1) { const u = prog(t, t1, t1 + dout, E.in); return [1 - u * 0.6, 1 - u]; }
  const u = clamp((t - t0) / din);
  return [E.spring(u), clamp(u * 4)];
}

const P = new URLSearchParams(location.search);
const LANG = P.get('lang') || 'ko';
const CLIP = P.get('clip');

const stage = document.getElementById('stage');
function el(cls, parent = stage, html = '') { const d = document.createElement('div'); d.className = 'a ' + cls; d.innerHTML = html; parent.appendChild(d); return d; }
function place(d, x, y, { w, h, s = 1, sx, sy, r = 0, o = 1 } = {}) {
  if (w != null) d.style.width = w + 'px';
  if (h != null) d.style.height = h + 'px';
  d.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${sx ?? s}, ${sy ?? s})`;
  d.style.opacity = o;
  d.style.visibility = o <= 0.001 || (sx ?? s) <= 0.001 ? 'hidden' : 'visible';
}
const CURSOR = '<svg viewBox="0 0 17 23" width="34" height="46"><path d="M1.5 1.5 V18 L5.8 14 L9 21.2 L12 19.9 L8.9 12.9 H14.8 Z" fill="#1D1B19" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

function bubble(text, size) {
  const b = el('bub'); b.textContent = text; b.style.fontSize = size + 'px';
  b.style.padding = `0 ${size * 0.9}px`; b.style.height = size * 2.15 + 'px';
  return b;
}
function ring() { return el('ring'); }
function drawRing(r, t, at, x, y) { // click ripple at time `at`
  const u = (t - at) / 0.45;
  if (u < 0 || u > 1) { r.style.visibility = 'hidden'; return; }
  const d = lerp(18, 76, E.out(u)); r.style.visibility = 'visible';
  r.style.width = r.style.height = d + 'px'; r.style.opacity = 1 - u; r.style.borderWidth = lerp(6, 2, u) + 'px';
  r.style.transform = `translate(${x - d / 2}px, ${y - d / 2}px)`;
}
function blobs(n, seed, W, H) {
  const list = []; let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) { const b = el('blob' + (i % 3 === 0 ? ' sq' : '')); const size = 80 + rnd() * 160; list.push({ b, x: rnd() * W, y: rnd() * H, size, ph: rnd() * 6.28, amp: 10 + rnd() * 18 }); }
  return (t, period) => list.forEach((o) => { const a = (t / period) * 6.283 + o.ph; place(o.b, o.x - o.size / 2 + Math.cos(a) * o.amp, o.y - o.size / 2 + Math.sin(a) * o.amp, { w: o.size, h: o.size, r: Math.sin(a) * 8, o: 0.55 }); });
}

/** Shows the clip ?clip= names (the first one if none), sized by the clip: { W, H, D (seconds), poster (the
 *  time of the frame that stands for it), render(t) }.
 *  `fonts` are document.fonts.load() arguments to wait for, so the first frame is not drawn in a fallback. */
function startClips(clips, fonts = []) {
  const clip = (clips[CLIP] ?? Object.values(clips)[0])();
  stage.style.width = clip.W + 'px'; stage.style.height = clip.H + 'px';
  window.CLIP_INFO = { w: clip.W, h: clip.H, duration: clip.D, poster: clip.poster ?? clip.D / 2 };
  window.renderAt = (t) => clip.render(t);
  window.ready = (async () => { await document.fonts.ready; for (const f of fonts) await document.fonts.load(...f); clip.render(0); return true; })();
}
