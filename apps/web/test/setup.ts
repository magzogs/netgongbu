import type { LabApi } from '@netgongbu/bridge';

// The viewer runs inside the desktop app, whose preload script provides window.lab. The tests load
// the viewer's modules without that app, so they get a main process that only takes the language.
const lab: Pick<LabApi, 'settings'> = {
  settings: {
    get: () => Promise.reject(new Error('No desktop main process in the tests')),
    setLocale: () => Promise.resolve(),
  },
};
Object.assign(globalThis, { lab });
