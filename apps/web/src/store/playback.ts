import type { StateCreator } from 'zustand';
import type { Timeline } from '../engine/timeline';
import type { ViewerState } from './viewer';

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

/** Going back within this much of a beat restarts the beat instead of jumping to the previous one. */
const RESTART_THRESHOLD = 0.2;

export interface PlaybackSlice {
  timeline: Timeline | null;
  beatIndex: number;
  /** Progress through the current beat, 0..1. */
  progress: number;
  playing: boolean;
  speed: number;
  /** Stop at the end of every beat so the learner can read before moving on. */
  pauseBetweenBeats: boolean;
  loadTimeline: (timeline: Timeline | null) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  /** Go to the next beat and play it. */
  next: () => void;
  /** Restart the current beat, or go to the previous one when near its start, and play it. */
  prev: () => void;
  seek: (beatIndex: number, progress?: number) => void;
  setSpeed: (speed: number) => void;
  setPauseBetweenBeats: (pause: boolean) => void;
  /** Moves playback forward by `dt` wall-clock seconds; called every frame. */
  advance: (dt: number) => void;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export const createPlaybackSlice: StateCreator<ViewerState, [], [], PlaybackSlice> = (
  set,
  get,
) => ({
  timeline: null,
  beatIndex: 0,
  progress: 0,
  playing: false,
  speed: 1,
  pauseBetweenBeats: true,

  loadTimeline(timeline) {
    set({ timeline, beatIndex: 0, progress: 0, playing: false });
  },

  play() {
    const { timeline, beatIndex, progress } = get();
    if (!timeline) return;
    if (progress < 1) {
      set({ playing: true });
    } else if (beatIndex < timeline.beats.length - 1) {
      set({ beatIndex: beatIndex + 1, progress: 0, playing: true });
    } else {
      set({ beatIndex: 0, progress: 0, playing: true });
    }
  },

  pause() {
    set({ playing: false });
  },

  togglePlay() {
    if (get().playing) get().pause();
    else get().play();
  },

  next() {
    const { timeline, beatIndex } = get();
    if (!timeline) return;
    if (beatIndex < timeline.beats.length - 1) {
      set({ beatIndex: beatIndex + 1, progress: 0, playing: true });
    } else {
      set({ progress: 1, playing: false });
    }
  },

  prev() {
    const { timeline, beatIndex, progress } = get();
    if (!timeline) return;
    const target = progress > RESTART_THRESHOLD ? beatIndex : Math.max(0, beatIndex - 1);
    set({ beatIndex: target, progress: 0, playing: true });
  },

  seek(beatIndex, progress = 0) {
    const { timeline } = get();
    if (!timeline) return;
    const index = Math.min(timeline.beats.length - 1, Math.max(0, Math.round(beatIndex)));
    set({ beatIndex: index, progress: clamp01(progress) });
  },

  setSpeed(speed) {
    set({ speed });
  },

  setPauseBetweenBeats(pause) {
    set({ pauseBetweenBeats: pause });
  },

  advance(dt) {
    const { timeline, beatIndex, progress, playing, speed, pauseBetweenBeats } = get();
    const entry = timeline?.beats[beatIndex];
    if (!playing || !timeline || !entry) return;
    const nextProgress = progress + (dt * speed) / entry.duration;
    if (nextProgress < 1) {
      set({ progress: nextProgress });
    } else if (pauseBetweenBeats || beatIndex === timeline.beats.length - 1) {
      set({ progress: 1, playing: false });
    } else {
      set({ beatIndex: beatIndex + 1, progress: 0 });
    }
  },
});
