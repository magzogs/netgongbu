import type { StateCreator } from 'zustand';
import type { ViewerState } from './viewer';

/** UI state for features that exist only in the desktop app. */
export interface DesktopSlice {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const createDesktopSlice: StateCreator<ViewerState, [], [], DesktopSlice> = (set) => ({
  settingsOpen: false,
  setSettingsOpen(settingsOpen) {
    set({ settingsOpen });
  },
});
