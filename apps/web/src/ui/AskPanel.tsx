import { useEffect, useState, type ReactElement, type SyntheticEvent } from 'react';
import type { AiStatus } from '../data/aiApi';
import { useViewer } from '../store/viewer';

const EXAMPLES = [
  'ping 8.8.8.8을 실행하면 어떤 패킷이 오가나요?',
  '웹 서버 1이 응답하지 않으면 로드밸런서는 어떻게 하나요?',
  '노트북의 DNS 캐시에 이미 주소가 있으면 무엇이 달라지나요?',
  'HTTPS 없이 http://example.com에 접속하면 중간 장비가 무엇을 볼 수 있나요?',
];

const UNAVAILABLE: Partial<Record<AiStatus, string>> = {
  checking: 'AI 서버 상태를 확인하는 중입니다…',
  offline: 'AI 서버가 실행 중이 아닙니다. 저장소 루트에서 pnpm dev로 함께 실행하세요.',
  'no-key': 'AI 서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.',
};

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

function Pending({ question, startedAt }: { question: string; startedAt: number }): ReactElement {
  const seconds = useElapsed(startedAt);
  return (
    <div className="ask__status" role="status">
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>AI가 시나리오를 만드는 중… {seconds}초</strong>
        <p className="muted">
          “{question}” — 보통 30초에서 2분 걸립니다. 경로가 맞지 않으면 AI가 스스로 고쳐서 다시
          답합니다.
        </p>
      </div>
    </div>
  );
}

/** Question box: asks the server for a new scenario on the current topology. */
export function AskPanel(): ReactElement | null {
  const open = useViewer((s) => s.askOpen);
  const ask = useViewer((s) => s.ask);
  const aiStatus = useViewer((s) => s.aiStatus);
  const topologyTitle = useViewer((s) => s.world?.topology.title);
  const { submitQuestion, setAskOpen, checkAi } = useViewer.getState();
  const [question, setQuestion] = useState('');

  if (!open) return null;
  const unavailable = UNAVAILABLE[aiStatus];
  const pending = ask.kind === 'pending';
  const canSubmit = !unavailable && !pending && question.trim().length >= 3;

  const submit = (e?: SyntheticEvent): void => {
    e?.preventDefault();
    if (canSubmit) void submitQuestion(question.trim());
  };

  return (
    <section className="ask panel" aria-label="AI에게 질문">
      <header className="ask__header">
        <h2 className="ask__title">AI에게 질문</h2>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setAskOpen(false);
          }}
        >
          닫기
        </button>
      </header>
      <p className="muted ask__hint">
        지금 지도({topologyTitle ?? '…'})의 장비만으로 메시지가 오가는 과정을 만들어 재생합니다.
      </p>
      <form onSubmit={submit}>
        <textarea
          className="ask__input"
          rows={3}
          maxLength={500}
          placeholder="예: 브라우저가 이미 연결된 사이트에 다시 접속하면 무엇을 생략하나요?"
          value={question}
          disabled={pending}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
        />
        <div className="ask__examples">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="chip-button"
              disabled={pending}
              onClick={() => {
                setQuestion(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="ask__actions">
          {unavailable && (
            <p className="ask__unavailable">
              {unavailable}{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  void checkAi();
                }}
              >
                다시 확인
              </button>
            </p>
          )}
          <button type="submit" className="primary-button" disabled={!canSubmit}>
            시나리오 만들기
          </button>
        </div>
      </form>
      {ask.kind === 'pending' && <Pending question={ask.question} startedAt={ask.startedAt} />}
      {ask.kind === 'error' && (
        <div className="ask__error" role="alert">
          <strong>{ask.message}</strong>
          {ask.issues.length > 0 && (
            <ul>
              {ask.issues.slice(0, 5).map((issue, i) => (
                <li key={i}>
                  <code>{issue.where}</code> {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
