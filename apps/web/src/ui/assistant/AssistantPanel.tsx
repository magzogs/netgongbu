import { useEffect, useRef, useState, type ReactElement, type SyntheticEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  METHOD_LABELS,
  PROVIDERS,
  effortLabel,
  prefsFor,
  splitThinking,
  type ModelOption,
} from '@netgongbu/llm';
import { contextChips } from '../../engine/screenContext';
import type { AssistantMessage } from '../../store/assistant';
import { useViewer } from '../../store/viewer';
import { FloatingWindow, type Rect } from '../FloatingWindow';
import { ConnectionSettings } from './ConnectionSettings';
import { Markdown } from './Markdown';

/**
 * Questions to AI in one window: "묻기" answers about what is on screen (the step and its
 * packets, the selected device, the header and field open in the packet anatomy view), and
 * "시나리오로 보기" makes a new scenario on this map that shows the answer, then plays it.
 */

const SCREEN_SUGGESTIONS = [
  '지금 단계에서 무슨 일이 일어나는지 쉽게 설명해 줘',
  '움직이는 패킷의 헤더를 계층별로 하나씩 설명해 줘',
  '선택한 장비는 이 과정에서 무슨 일을 해?',
  '패킷이 왜 이 경로로 가는지 알려 줘',
];

const SCENARIO_SUGGESTIONS = [
  'ping 8.8.8.8을 실행하면 어떤 패킷이 오가나요?',
  '웹 서버 1이 응답하지 않으면 로드밸런서는 어떻게 하나요?',
  '노트북의 DNS 캐시에 이미 주소가 있으면 무엇이 달라지나요?',
  'HTTPS 없이 http://example.com에 접속하면 중간 장비가 무엇을 볼 수 있나요?',
];

const RECT_KEY = 'netgongbu.assistant.rect';
const MIN_SIZE = { w: 340, h: 360 };

function initialRect(): Rect {
  const h = window.innerHeight || 768;
  return { x: 16, y: 64, w: 440, h: Math.max(420, h - 64 - 240) };
}

/** Seconds since `startedAt`, updated every second while mounted. */
function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

function Making({ startedAt }: { startedAt: number }): ReactElement {
  const seconds = useElapsed(startedAt);
  return (
    <div className="assistant__making" role="status">
      <span className="spinner spinner--accent" aria-hidden="true" />
      <p>
        <strong>시나리오를 만드는 중… {seconds}초</strong>
        <br />
        <span className="muted">
          보통 30초에서 2분 걸립니다. 경로가 지도와 맞지 않으면 AI가 스스로 고쳐서 다시 답합니다.
        </span>
      </p>
    </div>
  );
}

/** The model and effort the next question goes to. */
function ModelBar(): ReactElement | null {
  const connection = useViewer((s) => s.connection);
  const models = useViewer((s) => s.models);
  const changeConnection = useViewer((s) => s.changeConnection);
  const loadModels = useViewer((s) => s.loadModels);
  const provider = connection?.prefs.provider;
  if (!connection?.ready || !provider) return null;
  const prefs = prefsFor(connection.prefs, provider);
  const list = models[provider];
  const options: ModelOption[] =
    list?.kind === 'ready' && list.models.length > 0
      ? list.models
      : prefs.model
        ? [{ id: prefs.model, label: prefs.model, efforts: prefs.effort ? [prefs.effort] : [] }]
        : [];
  const model = options.find((m) => m.id === prefs.model);

  return (
    <div className="assistant__bar">
      <label className="assistant__pick">
        <span>모델</span>
        <select
          value={prefs.model}
          disabled={options.length === 0}
          title={model?.description}
          onChange={(e) => {
            const next = options.find((m) => m.id === e.target.value);
            const effort =
              prefs.effort && next?.efforts.includes(prefs.effort) ? prefs.effort : null;
            void changeConnection({ provider, model: e.target.value, effort });
          }}
        >
          {options.length === 0 && <option value="">모델 없음</option>}
          {options.map((m) => (
            <option key={m.id} value={m.id} title={m.description}>
              {m.label}
              {m.recommended ? ' · 추천' : ''}
            </option>
          ))}
        </select>
      </label>
      {model && model.efforts.length > 0 && (
        <label className="assistant__pick">
          <span>Effort</span>
          <select
            value={prefs.effort ?? ''}
            onChange={(e) => {
              void changeConnection({ provider, effort: e.target.value || null });
            }}
          >
            <option value="">
              기본값{model.defaultEffort ? ` · ${effortLabel(model.defaultEffort)}` : ''}
            </option>
            {model.efforts.map((effort) => (
              <option key={effort} value={effort}>
                {effortLabel(effort)}
              </option>
            ))}
          </select>
        </label>
      )}
      {list?.kind === 'loading' && (
        <span className="muted assistant__bar-note">
          <span className="spinner spinner--accent spinner--tiny" aria-hidden="true" /> 모델 목록
        </span>
      )}
      {list?.kind === 'error' && (
        <span className="assistant__bar-note conn__warn" title={list.message}>
          목록을 못 가져옴{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              void loadModels(provider, true);
            }}
          >
            다시
          </button>
        </span>
      )}
    </div>
  );
}

function Message({ message }: { message: AssistantMessage }): ReactElement {
  const makeScenario = useViewer((s) => s.makeScenario);
  const making = useViewer((s) => s.making);
  const scenarioReady = useViewer((s) => s.aiStatus === 'ready');
  const open = useViewer((s) => s.open);

  if (message.role === 'user') {
    return (
      <div className="assistant__msg assistant__msg--user">
        {message.kind === 'scenario' && <span className="assistant__kind">▶ 시나리오로 보기</span>}
        <p>{message.text}</p>
        {(message.chips?.length ?? 0) > 0 && (
          <div className="assistant__chips" aria-label="함께 보낸 화면 정보">
            {message.chips?.map((c) => (
              <span key={c} className="assistant__chip">
                {c}
              </span>
            ))}
            {message.withImage && <span className="assistant__chip">🖼 3D 화면</span>}
          </div>
        )}
        {message.kind === 'question' && (
          <button
            type="button"
            className="text-button assistant__again"
            disabled={making || !scenarioReady || message.text.length < 3}
            title="이 질문의 답을 3D 시나리오로 만들어 재생합니다"
            onClick={() => {
              void makeScenario(message.text);
            }}
          >
            ▶ 시나리오로 보기
          </button>
        )}
      </div>
    );
  }

  if (message.kind === 'scenario') {
    return (
      <div className="assistant__msg assistant__msg--assistant" aria-live="polite">
        {message.pending && message.startedAt !== undefined && (
          <Making startedAt={message.startedAt} />
        )}
        {message.text && (
          <p className="assistant__made">
            {message.text}{' '}
            {message.scenarioId && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (message.scenarioId) void open(message.scenarioId);
                }}
              >
                다시 열기
              </button>
            )}
          </p>
        )}
        {message.error && (
          <div className="ask__error" role="alert">
            <strong>{message.error}</strong>
            {(message.issues?.length ?? 0) > 0 && (
              <ul>
                {message.issues?.slice(0, 5).map((issue, i) => (
                  <li key={i}>
                    <code>{issue.where}</code> {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  const { answer, thinking } = splitThinking(message.text);
  return (
    <div className="assistant__msg assistant__msg--assistant" aria-live="polite">
      {answer && <Markdown text={answer} />}
      {message.pending && !answer && (
        <p className="muted assistant__thinking">
          <span className="spinner spinner--accent spinner--tiny" aria-hidden="true" />{' '}
          {thinking ? '생각하는 중…' : '답을 기다리는 중…'}
        </p>
      )}
      {message.error && <p className="conn__warn">{message.error}</p>}
    </div>
  );
}

export function AssistantPanel(): ReactElement | null {
  const open = useViewer((s) => s.assistantOpen);
  const setOpen = useViewer((s) => s.setAssistantOpen);
  const messages = useViewer((s) => s.messages);
  const answering = useViewer((s) => s.answering);
  const making = useViewer((s) => s.making);
  const aiStatus = useViewer((s) => s.aiStatus);
  const withImage = useViewer((s) => s.withImage);
  const setWithImage = useViewer((s) => s.setWithImage);
  const connection = useViewer((s) => s.connection);
  const connectionError = useViewer((s) => s.connectionError);
  const models = useViewer((s) => s.models);
  const topologyTitle = useViewer((s) => s.world?.topology.title);
  const { ask, makeScenario, stopAnswer, clearConversation, loadModels } = useViewer.getState();
  const chips = useViewer(useShallow(contextChips));
  const [question, setQuestion] = useState('');
  const [maximized, setMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  const provider = connection?.prefs.provider ?? null;
  const prefs = provider && connection ? prefsFor(connection.prefs, provider) : null;
  const ready = connection?.ready === true;

  // The model list of the connection in use, once it is ready, and again whenever what it
  // depends on changes: method, server address, CLI, key, signed-in account.
  const account =
    provider && provider !== 'local' && connection ? connection.accounts[provider] : null;
  const listKey =
    ready && provider && prefs
      ? [
          provider,
          prefs.method,
          prefs.baseUrl,
          provider === 'local' ? '' : connection.cli[provider].path,
          connection.keys[provider],
          account?.state === 'signed-in' ? account.label : '',
        ].join('|')
      : null;
  useEffect(() => {
    if (open && listKey && provider) void loadModels(provider);
  }, [open, listKey, provider, loadModels]);

  // Follow the answer as it is written.
  const last = messages.at(-1);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text, last?.pending]);

  if (!open) return null;
  const list = provider ? models[provider] : undefined;
  // Open while something needs doing: not connected, or the key or sign-in did not work.
  const settingsShown =
    showSettings ||
    (connection !== null && !ready) ||
    connectionError !== null ||
    list?.kind === 'error';
  const model = list?.kind === 'ready' ? list.models.find((m) => m.id === prefs?.model) : undefined;
  const scenarioBlocked =
    aiStatus === 'ready'
      ? null
      : aiStatus === 'checking'
        ? 'AI 상태를 확인하는 중입니다…'
        : aiStatus === 'offline'
          ? 'AI 서버가 실행 중이 아닙니다.'
          : (connection?.notReady ?? 'AI를 먼저 연결하세요.');

  const submit = (e?: SyntheticEvent): void => {
    e?.preventDefault();
    if (!question.trim() || answering || !ready) return;
    void ask(question);
    setQuestion('');
  };
  const scenario = (): void => {
    if (question.trim().length < 3 || making || scenarioBlocked) return;
    void makeScenario(question);
    setQuestion('');
  };
  const connectionLabel =
    provider && prefs
      ? provider === 'local'
        ? PROVIDERS[provider].label
        : `${PROVIDERS[provider].label} · ${METHOD_LABELS[prefs.method]}`
      : '연결 안 됨';

  return (
    <FloatingWindow
      storageKey={RECT_KEY}
      min={MIN_SIZE}
      initial={initialRect}
      maximized={maximized}
      onMaximized={setMaximized}
      className="assistant-frame"
    >
      <section className="assistant panel" aria-label="AI에게 질문">
        <header className="assistant__header" data-drag-handle>
          <h2 className="assistant__title">AI에게 질문</h2>
          <button
            type="button"
            className={`assistant__conn ${ready ? 'is-ready' : ''}`}
            aria-expanded={settingsShown}
            title="AI 연결 설정"
            onClick={() => {
              setShowSettings(!showSettings);
            }}
          >
            <span className="assistant__dot" aria-hidden="true" />
            {connectionLabel}
          </button>
          <span className="assistant__actions">
            {messages.length > 0 && (
              <button type="button" className="text-button" onClick={clearConversation}>
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
        {settingsShown && <ConnectionSettings />}
        <ModelBar />
        <div className="assistant__log" ref={log}>
          {messages.length === 0 ? (
            <div className="assistant__empty">
              <p className="muted">
                지금 화면의 단계, 패킷, 장비, 헤더 필드에 대해 <strong>묻기</strong>로 물어보거나,
                화면에 없는 과정을 <strong>시나리오로 보기</strong>로 지금 지도(
                {topologyTitle ?? '…'})의 3D 시나리오로 만들어 재생할 수 있습니다.
              </p>
              <h3 className="section-title">화면에 대해 묻기</h3>
              <div className="ask__examples">
                {SCREEN_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip-button"
                    disabled={answering || !ready}
                    onClick={() => {
                      void ask(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <h3 className="section-title">시나리오로 보기</h3>
              <div className="ask__examples">
                {SCENARIO_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip-button"
                    disabled={making || scenarioBlocked !== null}
                    title={scenarioBlocked ?? undefined}
                    onClick={() => {
                      void makeScenario(s);
                    }}
                  >
                    ▶ {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Message key={m.id} message={m} />)
          )}
        </div>
        <form className="assistant__form" onSubmit={submit}>
          <div className="assistant__chips" aria-label="질문과 함께 보낼 화면 정보">
            {chips.map((c) => (
              <span key={c} className="assistant__chip">
                {c}
              </span>
            ))}
          </div>
          <textarea
            className="ask__input assistant__input"
            rows={2}
            maxLength={500}
            placeholder="예: 여기서 TTL이 왜 64인가요? / ping 8.8.8.8은 어떻게 동작하나요?"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
            }}
          />
          <div className="assistant__send">
            <label
              className="toggle"
              title={
                model?.vision === false
                  ? '이 모델은 그림을 볼 수 없습니다'
                  : '그림을 볼 수 있는 모델에만 보냅니다'
              }
            >
              <input
                type="checkbox"
                checked={withImage}
                disabled={model?.vision === false}
                onChange={(e) => {
                  setWithImage(e.target.checked);
                }}
              />
              3D 화면 그림도 보내기
            </label>
            <span className="assistant__buttons">
              <button
                type="button"
                className="chip-button assistant__scenario"
                disabled={question.trim().length < 3 || making || scenarioBlocked !== null}
                title={scenarioBlocked ?? '이 질문의 답을 3D 시나리오로 만들어 재생합니다'}
                onClick={scenario}
              >
                {making && (
                  <span className="spinner spinner--accent spinner--tiny" aria-hidden="true" />
                )}
                ▶ 시나리오로 보기
              </button>
              {answering ? (
                <button type="button" className="primary-button" onClick={stopAnswer}>
                  멈추기
                </button>
              ) : (
                <button
                  type="submit"
                  className="primary-button"
                  disabled={!question.trim() || !ready}
                  title={ready ? '지금 화면에 대해 묻습니다' : (connection?.notReady ?? undefined)}
                >
                  묻기
                </button>
              )}
            </span>
          </div>
        </form>
      </section>
    </FloatingWindow>
  );
}

/** Top bar button that opens the panel; spins while a scenario is being made. */
export function AssistantButton(): ReactElement {
  const open = useViewer((s) => s.assistantOpen);
  const busy = useViewer((s) => s.making || s.answering);
  const setOpen = useViewer((s) => s.setAssistantOpen);
  return (
    <button
      type="button"
      className="assistant-button"
      aria-expanded={open}
      title="지금 화면에 대해 묻거나, 새 시나리오를 만듭니다"
      onClick={() => {
        setOpen(!open);
      }}
    >
      {busy && <span className="spinner spinner--small" aria-hidden="true" />}
      AI에게 질문
    </button>
  );
}
