import type { ReactElement } from 'react';
import { showAll, toggleFollow } from '../commands';
import { PROTOCOL_COLORS } from '../scene/theme';
import { SPEEDS } from '../store/playback';
import { useViewer } from '../store/viewer';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, ReplayIcon } from './icons';
import { Scrubber } from './Scrubber';

function Narration(): ReactElement | null {
  const timeline = useViewer((s) => s.timeline);
  const beatIndex = useViewer((s) => s.beatIndex);
  const entry = timeline?.beats[beatIndex];
  if (!timeline || !entry) return null;
  const protocols = [...new Set(entry.beat.hops.map((h) => h.packet.protocol))];
  return (
    <div className="narration" aria-live="polite">
      <div className="narration__meta">
        <span className="narration__step">
          {beatIndex + 1} / {timeline.beats.length}
        </span>
        {protocols.map((p) => (
          <span key={p} className="chip" style={{ borderColor: PROTOCOL_COLORS[p] }}>
            {p}
          </span>
        ))}
      </div>
      <p className="narration__text">{entry.beat.narration}</p>
    </div>
  );
}

/** The question an AI scenario answers, and what the topology could not show. */
function ScenarioNote(): ReactElement | null {
  const scenario = useViewer((s) => s.scenario);
  if (!scenario?.question && !scenario?.unsupported) return null;
  return (
    <div className="scenario-note">
      {scenario.question && (
        <p className="scenario-note__question" title={scenario.question}>
          질문 · {scenario.question}
        </p>
      )}
      {scenario.unsupported && (
        <details className="scenario-note__gap">
          <summary>이 지도로 보여 줄 수 없는 부분</summary>
          <p>{scenario.unsupported}</p>
        </details>
      )}
    </div>
  );
}

function Controls(): ReactElement {
  const playing = useViewer((s) => s.playing);
  const atEnd = useViewer(
    (s) => s.timeline !== null && s.beatIndex === s.timeline.beats.length - 1 && s.progress >= 1,
  );
  const speed = useViewer((s) => s.speed);
  const pauseBetweenBeats = useViewer((s) => s.pauseBetweenBeats);
  const following = useViewer((s) => s.cameraMode === 'follow');
  const { togglePlay, prev, next, setSpeed, setPauseBetweenBeats } = useViewer.getState();

  let playLabel = '재생 (Space)';
  let PlayGlyph = PlayIcon;
  if (playing) {
    playLabel = '일시정지 (Space)';
    PlayGlyph = PauseIcon;
  } else if (atEnd) {
    playLabel = '처음부터 다시 (Space)';
    PlayGlyph = ReplayIcon;
  }

  return (
    <div className="controls">
      <button type="button" className="icon-button" onClick={prev} title="이전 단계 (←)">
        <PrevIcon />
        <span className="visually-hidden">이전 단계</span>
      </button>
      <button
        type="button"
        className="icon-button icon-button--primary"
        onClick={togglePlay}
        title={playLabel}
      >
        <PlayGlyph />
        <span className="visually-hidden">{playLabel}</span>
      </button>
      <button type="button" className="icon-button" onClick={next} title="다음 단계 (→)">
        <NextIcon />
        <span className="visually-hidden">다음 단계</span>
      </button>
      <div className="controls__divider" />
      <button
        type="button"
        className="pill-button"
        aria-pressed={following}
        onClick={toggleFollow}
        title="카메라가 움직이는 패킷을 따라갑니다 (F)"
      >
        따라가기
      </button>
      <button
        type="button"
        className="pill-button"
        onClick={() => {
          showAll();
        }}
        title="전체 보기 (R)"
      >
        전체 보기
      </button>
      <div className="controls__spacer" />
      <label className="toggle" title="각 단계가 끝나면 멈춰서 설명을 읽을 수 있게 합니다">
        <input
          type="checkbox"
          checked={pauseBetweenBeats}
          onChange={(e) => {
            setPauseBetweenBeats(e.target.checked);
          }}
        />
        단계마다 멈춤
      </label>
      <label className="speed">
        <span className="visually-hidden">재생 속도</span>
        <select
          value={speed}
          onChange={(e) => {
            setSpeed(Number(e.target.value));
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Bottom card: what is happening in this step, the playback controls and the timeline. */
export function Player(): ReactElement | null {
  const timeline = useViewer((s) => s.timeline);
  if (!timeline) return null;
  return (
    <section className="player panel" aria-label="재생">
      <ScenarioNote />
      <Narration />
      <Scrubber timeline={timeline} />
      <Controls />
    </section>
  );
}
