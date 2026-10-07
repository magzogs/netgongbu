import type { ReactElement } from 'react';
import { lab } from '../data/backend';
import { useViewer } from '../store/viewer';

/** Desktop app settings: the IP location database. (AI connection: in the AI panel.) */
export function SettingsPanel(): ReactElement | null {
  const open = useViewer((s) => s.settingsOpen);
  const setOpen = useViewer((s) => s.setSettingsOpen);
  const setAssistantOpen = useViewer((s) => s.setAssistantOpen);

  if (!open || !lab) return null;

  return (
    <section className="ask panel settings" aria-label="설정">
      <header className="ask__header">
        <h2 className="ask__title">설정</h2>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setOpen(false);
          }}
        >
          닫기
        </button>
      </header>

      <h3 className="section-title">AI 연결</h3>
      <p className="muted settings__status">
        ChatGPT·Claude 연결(계정 로그인, API 키, CLI)과 모델·Effort는 AI에게 질문 창에서 고릅니다.{' '}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setOpen(false);
            setAssistantOpen(true);
          }}
        >
          열기
        </button>
      </p>
      <GeoSection />
    </section>
  );
}

function GeoSection(): ReactElement {
  const geo = useViewer((s) => s.geoDownload);
  const download = useViewer((s) => s.downloadGeo);
  const mb = (n: number): string => `${(n / 1_000_000).toFixed(1)} MB`;
  return (
    <>
      <h3 className="section-title">위치 데이터베이스</h3>
      <p className="muted settings__status">
        경로의 라우터를 지구본 위에 놓으려면 IP 위치 데이터베이스(DB-IP City Lite, 약 60 MB)가
        필요합니다. 이 컴퓨터에 저장하고 오프라인으로 찾아보므로 라우터 주소를 외부 서비스에 보내지
        않습니다.
      </p>
      {geo.kind === 'done' ? (
        <p className="settings__status">
          설치됨 ({geo.version}) · IP Geolocation by DB-IP (CC BY 4.0)
        </p>
      ) : geo.kind === 'running' ? (
        <p className="settings__status" role="status">
          내려받는 중… {mb(geo.received)}
          {geo.total ? ` / ${mb(geo.total)}` : ''}
        </p>
      ) : (
        <button type="button" className="primary-button" onClick={download}>
          내려받기 (db-ip.com)
        </button>
      )}
      {geo.kind === 'error' && <p className="ask__unavailable">{geo.message}</p>}
    </>
  );
}

export function SettingsButton(): ReactElement | null {
  const open = useViewer((s) => s.settingsOpen);
  const setOpen = useViewer((s) => s.setSettingsOpen);
  if (!lab) return null;
  return (
    <button
      type="button"
      className="icon-button settings-button"
      aria-expanded={open}
      title="설정"
      onClick={() => {
        setOpen(!open);
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
      <span className="visually-hidden">설정</span>
    </button>
  );
}
