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
import { tr } from '@netgongbu/schema';
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
  tr(
    '지금 단계에서 무슨 일이 일어나는지 쉽게 설명해 줘',
    'Explain simply what happens in this step',
  ),
  tr(
    '움직이는 패킷의 헤더를 계층별로 하나씩 설명해 줘',
    "Walk me through the moving packet's headers, layer by layer",
  ),
  tr(
    '선택한 장비는 이 과정에서 무슨 일을 해?',
    'What does the selected device do in this process?',
  ),
  tr('패킷이 왜 이 경로로 가는지 알려 줘', 'Why does the packet take this path?'),
];

const SCENARIO_SUGGESTIONS = [
  tr(
    'ping 8.8.8.8을 실행하면 어떤 패킷이 오가나요?',
    'What packets go back and forth when I run ping 8.8.8.8?',
  ),
  tr(
    '웹 서버 1이 응답하지 않으면 로드밸런서는 어떻게 하나요?',
    "What does the load balancer do if web server 1 doesn't respond?",
  ),
  tr(
    '노트북의 DNS 캐시에 이미 주소가 있으면 무엇이 달라지나요?',
    "What changes if the address is already in the laptop's DNS cache?",
  ),
  tr(
    'HTTPS 없이 http://example.com에 접속하면 중간 장비가 무엇을 볼 수 있나요?',
    'What can devices along the way see if I open http://example.com without HTTPS?',
  ),
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
        <strong>
          {tr(`시나리오를 만드는 중… ${seconds}초`, `Building the scenario… ${seconds}s`)}
        </strong>
        <br />
        <span className="muted">
          {tr(
            '보통 30초에서 2분 걸립니다. 경로가 지도와 맞지 않으면 AI가 스스로 고쳐서 다시 답합니다.',
            "This usually takes 30 seconds to 2 minutes. If the path doesn't fit the map, the AI fixes it and answers again.",
          )}
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
        <span>{tr('모델', 'Model')}</span>
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
          {options.length === 0 && <option value="">{tr('모델 없음', 'No models')}</option>}
          {options.map((m) => (
            <option key={m.id} value={m.id} title={m.description}>
              {m.label}
              {m.recommended ? tr(' · 추천', ' · recommended') : ''}
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
              {tr('기본값', 'Default')}
              {model.defaultEffort ? ` · ${effortLabel(model.defaultEffort)}` : ''}
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
          <span className="spinner spinner--accent spinner--tiny" aria-hidden="true" />{' '}
          {tr('모델 목록', 'Model list')}
        </span>
      )}
      {list?.kind === 'error' && (
        <span className="assistant__bar-note conn__warn" title={list.message}>
          {tr('목록을 못 가져옴', "Couldn't load the list")}{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              void loadModels(provider, true);
            }}
          >
            {tr('다시', 'Retry')}
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
        {message.kind === 'scenario' && (
          <span className="assistant__kind">{tr('▶ 시나리오로 보기', '▶ Show as scenario')}</span>
        )}
        <p>{message.text}</p>
        {(message.chips?.length ?? 0) > 0 && (
          <div
            className="assistant__chips"
            aria-label={tr('함께 보낸 화면 정보', 'Screen info sent along')}
          >
            {message.chips?.map((c) => (
              <span key={c} className="assistant__chip">
                {c}
              </span>
            ))}
            {message.withImage && (
              <span className="assistant__chip">{tr('🖼 3D 화면', '🖼 3D view')}</span>
            )}
          </div>
        )}
        {message.kind === 'question' && (
          <button
            type="button"
            className="text-button assistant__again"
            disabled={making || !scenarioReady || message.text.length < 3}
            title={tr(
              '이 질문의 답을 3D 시나리오로 만들어 재생합니다',
              'Builds the answer to this question as a 3D scenario and plays it',
            )}
            onClick={() => {
              void makeScenario(message.text);
            }}
          >
            {tr('▶ 시나리오로 보기', '▶ Show as scenario')}
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
                {tr('다시 열기', 'Open again')}
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
          {thinking
            ? tr('생각하는 중…', 'Thinking…')
            : tr('답을 기다리는 중…', 'Waiting for the answer…')}
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
        ? tr('AI 상태를 확인하는 중입니다…', 'Checking the AI status…')
        : aiStatus === 'offline'
          ? tr('AI 서버가 실행 중이 아닙니다.', 'The AI server is not running.')
          : (connection?.notReady ?? tr('AI를 먼저 연결하세요.', 'Connect an AI first.'));

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
      : tr('연결 안 됨', 'Not connected');

  return (
    <FloatingWindow
      storageKey={RECT_KEY}
      min={MIN_SIZE}
      initial={initialRect}
      maximized={maximized}
      onMaximized={setMaximized}
      className="assistant-frame"
    >
      <section className="assistant panel" aria-label={tr('AI에게 질문', 'Ask AI')}>
        <header className="assistant__header" data-drag-handle>
          <h2 className="assistant__title">{tr('AI에게 질문', 'Ask AI')}</h2>
          <button
            type="button"
            className={`assistant__conn ${ready ? 'is-ready' : ''}`}
            aria-expanded={settingsShown}
            title={tr('AI 연결 설정', 'AI connection settings')}
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
                {tr('지우기', 'Clear')}
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setOpen(false);
              }}
            >
              {tr('닫기', 'Close')}
            </button>
          </span>
        </header>
        {settingsShown && <ConnectionSettings />}
        <ModelBar />
        <div className="assistant__log" ref={log}>
          {messages.length === 0 ? (
            <div className="assistant__empty">
              <p className="muted">
                {tr('지금 화면의 단계, 패킷, 장비, 헤더 필드에 대해 ', 'Use ')}
                <strong>{tr('묻기', 'Ask')}</strong>
                {tr(
                  '로 물어보거나, 화면에 없는 과정을 ',
                  ' for questions about the step, packets, devices and header fields on screen, or use ',
                )}
                <strong>{tr('시나리오로 보기', 'Show as scenario')}</strong>
                {tr(
                  `로 지금 지도(${topologyTitle ?? '…'})의 3D 시나리오로 만들어 재생할 수 있습니다.`,
                  ` to build a process that isn't on screen as a 3D scenario on this map (${topologyTitle ?? '…'}) and play it.`,
                )}
              </p>
              <h3 className="section-title">{tr('화면에 대해 묻기', 'Ask about the screen')}</h3>
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
              <h3 className="section-title">{tr('시나리오로 보기', 'Show as scenario')}</h3>
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
          <div
            className="assistant__chips"
            aria-label={tr('질문과 함께 보낼 화면 정보', 'Screen info to send with the question')}
          >
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
            placeholder={tr(
              '예: 여기서 TTL이 왜 64인가요? / ping 8.8.8.8은 어떻게 동작하나요?',
              'e.g. Why is the TTL 64 here? / How does ping 8.8.8.8 work?',
            )}
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
                  ? tr('이 모델은 그림을 볼 수 없습니다', "This model can't see images")
                  : tr(
                      '그림을 볼 수 있는 모델에만 보냅니다',
                      'Sent only to models that can see images',
                    )
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
              {tr('3D 화면 그림도 보내기', 'Also send a picture of the 3D view')}
            </label>
            <span className="assistant__buttons">
              <button
                type="button"
                className="chip-button assistant__scenario"
                disabled={question.trim().length < 3 || making || scenarioBlocked !== null}
                title={
                  scenarioBlocked ??
                  tr(
                    '이 질문의 답을 3D 시나리오로 만들어 재생합니다',
                    'Builds the answer to this question as a 3D scenario and plays it',
                  )
                }
                onClick={scenario}
              >
                {making && (
                  <span className="spinner spinner--accent spinner--tiny" aria-hidden="true" />
                )}
                {tr('▶ 시나리오로 보기', '▶ Show as scenario')}
              </button>
              {answering ? (
                <button type="button" className="primary-button" onClick={stopAnswer}>
                  {tr('멈추기', 'Stop')}
                </button>
              ) : (
                <button
                  type="submit"
                  className="primary-button"
                  disabled={!question.trim() || !ready}
                  title={
                    ready
                      ? tr('지금 화면에 대해 묻습니다', 'Asks about the current screen')
                      : (connection?.notReady ?? undefined)
                  }
                >
                  {tr('묻기', 'Ask')}
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
      title={tr(
        '지금 화면에 대해 묻거나, 새 시나리오를 만듭니다',
        'Ask about the current screen, or build a new scenario',
      )}
      onClick={() => {
        setOpen(!open);
      }}
    >
      {busy && <span className="spinner spinner--small" aria-hidden="true" />}
      {tr('AI에게 질문', 'Ask AI')}
    </button>
  );
}
