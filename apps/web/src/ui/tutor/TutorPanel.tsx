import { useEffect, useRef, useState, type ReactElement, type SyntheticEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LLM_PRESETS, splitThinking } from '@magvirtualedu/llm';
import { CONNECT_HINT } from '../../data/llm';
import { contextChips } from '../../engine/screenContext';
import { useViewer } from '../../store/viewer';
import type { TutorMessage } from '../../store/tutor';
import { FloatingWindow, type Rect } from '../FloatingWindow';
import { Markdown } from './Markdown';

/**
 * Questions about what is on screen, answered by a local LLM. Every question goes with a written
 * description of the screen at that moment: the step and its packets, the selected device, the
 * header and field open in the packet anatomy view.
 */

const SUGGESTIONS = [
  '지금 단계에서 무슨 일이 일어나는지 쉽게 설명해 줘',
  '움직이는 패킷의 헤더를 계층별로 하나씩 설명해 줘',
  '선택한 장비는 이 과정에서 무슨 일을 해?',
  '패킷이 왜 이 경로로 가는지 알려 줘',
];

const RECT_KEY = 'magve.tutor.rect';
const MIN_SIZE = { w: 320, h: 320 };

function initialRect(): Rect {
  const h = window.innerHeight || 768;
  return { x: 16, y: 64, w: 400, h: Math.max(360, h - 64 - 260) };
}

/** Server, model and key; `onConnected` once the server has answered with its models. */
function Settings({ onConnected }: { onConnected: () => void }): ReactElement {
  const config = useViewer((s) => s.llmConfig);
  const models = useViewer((s) => s.llmModels);
  const setConfig = useViewer((s) => s.setLlmConfig);
  const refresh = useViewer((s) => s.refreshModels);
  const [url, setUrl] = useState(config.baseUrl);
  const [key, setKey] = useState(config.apiKey ?? '');

  const save = (baseUrl: string): void => {
    const apiKey = key.trim();
    setConfig({ baseUrl: baseUrl.trim(), model: config.model, ...(apiKey && { apiKey }) });
    void refresh().then(() => {
      const after = useViewer.getState().llmModels;
      if (after.kind === 'ready' && after.models.length > 0) onConnected();
    });
  };
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    save(url);
  };

  return (
    <form className="tutor__settings" onSubmit={submit}>
      <div className="tutor__presets" role="group" aria-label="자주 쓰는 서버">
        {LLM_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip-button"
            aria-pressed={config.baseUrl === p.baseUrl}
            onClick={() => {
              setUrl(p.baseUrl);
              save(p.baseUrl);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="tutor__field">
        <span>서버 주소 (OpenAI 호환 API)</span>
        <input
          className="ask__input"
          value={url}
          spellCheck={false}
          placeholder="http://localhost:11434/v1"
          onChange={(e) => {
            setUrl(e.target.value);
          }}
        />
      </label>
      <label className="tutor__field">
        <span>모델</span>
        {models.kind === 'ready' && models.models.length > 0 ? (
          <select
            value={config.model}
            onChange={(e) => {
              setConfig({ ...config, model: e.target.value });
            }}
          >
            {models.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="ask__input"
            value={config.model}
            spellCheck={false}
            placeholder="예: qwen2.5:7b"
            onChange={(e) => {
              setConfig({ ...config, model: e.target.value });
            }}
          />
        )}
      </label>
      <label className="tutor__field">
        <span>API 키 (필요한 서버만)</span>
        <input
          className="ask__input"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
          }}
        />
      </label>
      <div className="tutor__settings-actions">
        <p className="tutor__status" role="status">
          {models.kind === 'loading' && '서버에 연결하는 중…'}
          {models.kind === 'ready' &&
            (models.models.length > 0
              ? `연결됨 · 모델 ${String(models.models.length)}개`
              : '연결됨 · 설치된 모델이 없습니다 (예: ollama pull qwen2.5:7b)')}
          {models.kind === 'error' && (
            <span className="tutor__error">
              {models.message} {CONNECT_HINT}
            </span>
          )}
        </p>
        <button type="submit" className="primary-button">
          연결
        </button>
      </div>
      <p className="muted tutor__note">
        질문과 화면 설명은 이 서버로만 보냅니다. 설정은 이 기기에만 저장됩니다.
      </p>
    </form>
  );
}

function Message({ message }: { message: TutorMessage }): ReactElement {
  if (message.role === 'user') {
    return (
      <div className="tutor__msg tutor__msg--user">
        <p>{message.text}</p>
        {message.chips && message.chips.length > 0 && (
          <div className="tutor__chips" aria-label="함께 보낸 화면 정보">
            {message.chips.map((c) => (
              <span key={c} className="tutor__chip">
                {c}
              </span>
            ))}
            {message.withImage && <span className="tutor__chip">🖼 3D 화면</span>}
          </div>
        )}
      </div>
    );
  }
  const { answer, thinking } = splitThinking(message.text);
  return (
    <div className="tutor__msg tutor__msg--assistant" aria-live="polite">
      {answer && <Markdown text={answer} />}
      {message.pending && !answer && (
        <p className="muted tutor__thinking">
          <span className="spinner spinner--small" aria-hidden="true" />{' '}
          {thinking ? '생각하는 중…' : '답을 기다리는 중…'}
        </p>
      )}
      {message.error && (
        <p className="tutor__error">
          {message.error} {message.error.includes('연결하지 못') ? CONNECT_HINT : ''}
        </p>
      )}
    </div>
  );
}

export function TutorPanel(): ReactElement | null {
  const open = useViewer((s) => s.tutorOpen);
  const setOpen = useViewer((s) => s.setTutorOpen);
  const messages = useViewer((s) => s.tutorMessages);
  const busy = useViewer((s) => s.tutorBusy);
  const withImage = useViewer((s) => s.tutorWithImage);
  const setWithImage = useViewer((s) => s.setTutorWithImage);
  const models = useViewer((s) => s.llmModels);
  const model = useViewer((s) => s.llmConfig.model);
  const { askTutor, stopTutor, clearTutor } = useViewer.getState();
  const chips = useViewer(useShallow(contextChips));
  const [question, setQuestion] = useState('');
  const [maximized, setMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  // Follow the answer as it is written.
  const last = messages.at(-1);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text]);

  if (!open) return null;
  const notConnected = models.kind === 'error' || (models.kind === 'ready' && !model);
  const settingsShown = showSettings || notConnected;

  const submit = (e?: SyntheticEvent): void => {
    e?.preventDefault();
    if (!question.trim() || busy) return;
    void askTutor(question);
    setQuestion('');
  };

  return (
    <FloatingWindow
      storageKey={RECT_KEY}
      min={MIN_SIZE}
      initial={initialRect}
      maximized={maximized}
      onMaximized={setMaximized}
      className="tutor-frame"
    >
      <section className="tutor panel" aria-label="화면에 대해 묻기">
        <header className="tutor__header" data-drag-handle>
          <h2 className="tutor__title">화면에 대해 묻기</h2>
          <span className="muted tutor__model" title="로컬 LLM 모델">
            {model || '모델 없음'}
          </span>
          <span className="tutor__actions">
            <button
              type="button"
              className="text-button"
              aria-expanded={settingsShown}
              onClick={() => {
                setShowSettings(!showSettings);
              }}
            >
              연결 설정
            </button>
            {messages.length > 0 && (
              <button type="button" className="text-button" onClick={clearTutor}>
                지우기
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setOpen(false);
              }}
            >
              닫기
            </button>
          </span>
        </header>
        {settingsShown && (
          <Settings
            onConnected={() => {
              setShowSettings(false);
            }}
          />
        )}
        <div className="tutor__log" ref={log}>
          {messages.length === 0 ? (
            <div className="tutor__empty">
              <p className="muted">
                내 컴퓨터에서 실행 중인 LLM(Ollama, LM Studio 등)에게 지금 화면에 보이는 단계, 패킷,
                장비, 헤더 필드에 대해 물어볼 수 있습니다. 질문할 때의 화면 정보가 함께 전달됩니다.
              </p>
              <div className="ask__examples">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip-button"
                    disabled={busy}
                    onClick={() => {
                      void askTutor(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Message key={m.id} message={m} />)
          )}
        </div>
        <form className="tutor__form" onSubmit={submit}>
          <div className="tutor__chips" aria-label="질문과 함께 보낼 화면 정보">
            {chips.map((c) => (
              <span key={c} className="tutor__chip">
                {c}
              </span>
            ))}
          </div>
          <textarea
            className="ask__input tutor__input"
            rows={2}
            maxLength={1000}
            placeholder="예: 여기서 TTL이 왜 64인가요?"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
            }}
          />
          <div className="tutor__send">
            <label
              className="toggle"
              title="그림을 볼 수 있는 모델(llava, qwen2.5-vl, gemma3 등)에만"
            >
              <input
                type="checkbox"
                checked={withImage}
                onChange={(e) => {
                  setWithImage(e.target.checked);
                }}
              />
              3D 화면 그림도 보내기
            </label>
            {busy ? (
              <button type="button" className="primary-button" onClick={stopTutor}>
                멈추기
              </button>
            ) : (
              <button type="submit" className="primary-button" disabled={!question.trim()}>
                묻기
              </button>
            )}
          </div>
        </form>
      </section>
    </FloatingWindow>
  );
}

/** Top bar button that opens the panel. */
export function TutorButton(): ReactElement {
  const open = useViewer((s) => s.tutorOpen);
  const setOpen = useViewer((s) => s.setTutorOpen);
  return (
    <button
      type="button"
      className="tutor-button"
      aria-expanded={open}
      title="지금 화면에 대해 로컬 LLM에게 묻습니다"
      onClick={() => {
        setOpen(!open);
      }}
    >
      화면 질문
    </button>
  );
}
