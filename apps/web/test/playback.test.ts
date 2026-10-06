import { beforeEach, describe, expect, it } from 'vitest';
import type { Timeline, TimelineBeat } from '../src/engine/timeline';
import { useViewer } from '../src/store/viewer';

function beat(id: string, duration: number, start: number): TimelineBeat {
  return { beat: { id, narration: id, hops: [] }, routes: [], duration, start };
}

// Three beats of 1 s, 2 s and 1 s.
const timeline: Timeline = {
  beats: [beat('one', 1, 0), beat('two', 2, 1), beat('three', 1, 3)],
  total: 4,
};

const state = () => useViewer.getState();
const position = () => [state().beatIndex, Number(state().progress.toFixed(3)), state().playing];

beforeEach(() => {
  state().loadTimeline(timeline);
  useViewer.setState({ speed: 1, pauseBetweenBeats: true });
});

describe('playback', () => {
  it('does not move until played', () => {
    state().advance(0.5);
    expect(position()).toEqual([0, 0, false]);
  });

  it('advances by wall-clock time divided by beat duration and speed', () => {
    state().play();
    state().advance(0.25);
    expect(position()).toEqual([0, 0.25, true]);
    state().setSpeed(2);
    state().advance(0.25);
    expect(position()).toEqual([0, 0.75, true]);
  });

  it('stops at the end of a beat, then play moves on to the next one', () => {
    state().play();
    state().advance(1.5);
    expect(position()).toEqual([0, 1, false]);
    state().play();
    expect(position()).toEqual([1, 0, true]);
  });

  it('runs straight through when pausing between beats is off, stopping after the last', () => {
    state().setPauseBetweenBeats(false);
    state().play();
    state().advance(1);
    expect(position()).toEqual([1, 0, true]);
    state().advance(1);
    expect(position()).toEqual([1, 0.5, true]);
    state().seek(2, 0.9);
    state().advance(1);
    expect(position()).toEqual([2, 1, false]);
  });

  it('plays from the beginning again after the last beat', () => {
    state().seek(2, 1);
    state().play();
    expect(position()).toEqual([0, 0, true]);
  });

  it('next plays the following beat; at the last beat it jumps to the end', () => {
    state().next();
    expect(position()).toEqual([1, 0, true]);
    state().next();
    state().next();
    expect(position()).toEqual([2, 1, false]);
  });

  it('prev restarts the current beat once into it, otherwise goes one back', () => {
    state().seek(1, 0.6);
    state().prev();
    expect(position()).toEqual([1, 0, true]);
    state().prev();
    expect(position()).toEqual([0, 0, true]);
    state().prev();
    expect(position()).toEqual([0, 0, true]);
  });

  it('seek clamps the beat index and progress', () => {
    state().seek(10, 3);
    expect(position()).toEqual([2, 1, false]);
    state().seek(-4, -1);
    expect(position()).toEqual([0, 0, false]);
  });

  it('togglePlay switches between playing and paused', () => {
    state().togglePlay();
    expect(state().playing).toBe(true);
    state().togglePlay();
    expect(state().playing).toBe(false);
  });
});
