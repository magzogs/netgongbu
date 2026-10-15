// A stand-in for the desktop app's preload (window.lab): the viewer runs as in the desktop app,
// on its built-in examples only — no AI connected, no saved measurements, the location DB present.
(() => {
  const never = () => new Promise(() => {});
  const off = () => () => {};
  window.lab = {
    ai: { status: async () => ({ ready: false, fake: false }), catalog: async () => [], scenario: async () => null, ask: never },
    settings: { get: async () => ({ geo: { installed: true, version: '2026-10', attribution: 'IP Geolocation by DB-IP' }, platform: 'darwin' }), setLocale: async () => {} },
    trace: { start: never, cancel: async () => {}, list: async () => [], get: async () => null, onEvent: off },
    browser: { setBounds: () => {} },
    geo: { download: never, onEvent: off },
    connection: { status: never, change: never, setKey: never, models: never, signIn: never, stopSignIn: never, signOut: never, onStatus: off },
    chat: { ask: never, cancel: async () => {}, onEvent: off },
  };
})();
