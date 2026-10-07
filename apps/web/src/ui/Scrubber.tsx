import { useRef, type PointerEvent, type ReactElement } from 'react';
import type { Timeline } from '../engine/timeline';
import { PROTOCOL_COLORS } from '../scene/theme';
import { useViewer } from '../store/viewer';

const STILL_COLOR = '#64748b';

/** The beat under a pointer (in a gap, the nearest one) and how far into it, as drawn. */
function beatUnder(track: HTMLElement, x: number): { beatIndex: number; progress: number } {
  const rects = Array.from(track.querySelectorAll('.scrubber__beat'), (el) =>
    el.getBoundingClientRect(),
  );
  let beatIndex = 0;
  let nearest = Infinity;
  rects.forEach((r, i) => {
    const distance = Math.max(r.left - x, x - r.right, 0);
    if (distance < nearest) {
      nearest = distance;
      beatIndex = i;
    }
  });
  const r = rects[beatIndex];
  return { beatIndex, progress: r && r.width > 0 ? (x - r.left) / r.width : 0 };
}

/**
 * One segment per beat, as wide as the beat is long and coloured by its protocol. Click or drag
 * to jump anywhere in the scenario.
 */
export function Scrubber({ timeline }: { timeline: Timeline }): ReactElement {
  const beatIndex = useViewer((s) => s.beatIndex);
  const progress = useViewer((s) => s.progress);
  const seek = useViewer((s) => s.seek);
  const track = useRef<HTMLDivElement>(null);

  const seekToPointer = (e: PointerEvent): void => {
    if (!track.current) return;
    const { beatIndex: index, progress: p } = beatUnder(track.current, e.clientX);
    seek(index, p);
  };

  const current = timeline.beats[beatIndex];
  const elapsed = current ? current.start + current.duration * progress : 0;
  // Segments share the track minus the gaps between them, and each sits one gap further right
  // than the last: the head goes where the current segment's fill ends.
  const share = elapsed / Math.max(timeline.total, 0.001);
  const gaps = timeline.beats.length - 1;

  return (
    <div
      ref={track}
      className="scrubber"
      role="slider"
      tabIndex={-1}
      aria-label="재생 위치"
      aria-valuemin={1}
      aria-valuemax={timeline.beats.length}
      aria-valuenow={beatIndex + 1}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekToPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekToPointer(e);
      }}
    >
      {timeline.beats.map((b, i) => {
        const protocol = b.beat.hops[0]?.packet.protocol;
        const color = protocol ? PROTOCOL_COLORS[protocol] : STILL_COLOR;
        const fill = i < beatIndex ? 1 : i === beatIndex ? progress : 0;
        return (
          <div
            key={b.beat.id}
            className={`scrubber__beat${i === beatIndex ? ' is-current' : ''}`}
            style={{ flexGrow: b.duration, ['--beat-color' as string]: color }}
            title={`${i + 1}. ${b.beat.narration}`}
          >
            <div className="scrubber__fill" style={{ transform: `scaleX(${fill})` }} />
          </div>
        );
      })}
      <div
        className="scrubber__head"
        style={{
          left: `calc(${share} * (100% - ${gaps} * var(--beat-gap)) + ${beatIndex} * var(--beat-gap))`,
        }}
      />
    </div>
  );
}
