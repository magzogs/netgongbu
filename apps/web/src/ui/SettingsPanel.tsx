import type { ReactElement } from 'react';
import { LOCALE_NAMES, LOCALES, tr } from '@netgongbu/schema';
import { lab } from '../data/backend';
import { changeLocale, locale } from '../i18n';
import { useViewer } from '../store/viewer';

/**
 * Settings: the language, and in the desktop app the IP location database.
 * (AI connection: in the AI panel.)
 */
export function SettingsPanel(): ReactElement | null {
  const open = useViewer((s) => s.settingsOpen);
  const setOpen = useViewer((s) => s.setSettingsOpen);
  const setAssistantOpen = useViewer((s) => s.setAssistantOpen);

  if (!open) return null;

  return (
    <section className="ask panel settings" aria-label={tr('설정', 'Settings')}>
      <header className="ask__header">
        <h2 className="ask__title">{tr('설정', 'Settings')}</h2>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setOpen(false);
          }}
        >
          {tr('닫기', 'Close')}
        </button>
      </header>

      <LanguageSection />
      {lab && (
        <>
          <h3 className="section-title">{tr('AI 연결', 'AI connection')}</h3>
          <p className="muted settings__status">
            {tr(
              'ChatGPT·Claude 연결(계정 로그인, API 키, CLI)과 모델·Effort는 AI에게 질문 창에서 고릅니다.',
              'The ChatGPT or Claude connection (account sign-in, API key, CLI), the model and the effort are chosen in the Ask AI panel.',
            )}{' '}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setOpen(false);
                setAssistantOpen(true);
              }}
            >
              {tr('열기', 'Open')}
            </button>
          </p>
          <GeoSection />
        </>
      )}
    </section>
  );
}

function LanguageSection(): ReactElement {
  return (
    <>
      <h3 className="section-title">{tr('언어', 'Language')}</h3>
      <div
        className="segmented settings__language"
        role="radiogroup"
        aria-label={tr('언어', 'Language')}
      >
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            lang={l}
            aria-checked={locale === l}
            onClick={() => {
              changeLocale(l);
            }}
          >
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
      <p className="muted settings__status">
        {tr(
          '바꾸면 화면을 다시 불러와 설명과 시나리오, AI의 답이 모두 그 언어로 바뀝니다.',
          'Changing it reloads the viewer; labels, scenarios and the AI’s answers all switch to that language.',
        )}
      </p>
    </>
  );
}

function GeoSection(): ReactElement {
  const geo = useViewer((s) => s.geoDownload);
  const download = useViewer((s) => s.downloadGeo);
  const mb = (n: number): string => `${(n / 1_000_000).toFixed(1)} MB`;
  return (
    <>
      <h3 className="section-title">{tr('위치 데이터베이스', 'Location database')}</h3>
      <p className="muted settings__status">
        {tr(
          '경로의 라우터를 지구본 위에 놓으려면 IP 위치 데이터베이스(DB-IP City Lite, 약 60 MB)가 필요합니다. 이 컴퓨터에 저장하고 오프라인으로 찾아보므로 라우터 주소를 외부 서비스에 보내지 않습니다.',
          'Placing the routers of a path on the globe needs an IP location database (DB-IP City Lite, about 60 MB). It is stored on this computer and looked up offline, so router addresses are never sent to an outside service.',
        )}
      </p>
      {geo.kind === 'done' ? (
        <p className="settings__status">
          {tr('설치됨', 'Installed')} ({geo.version}) · IP Geolocation by DB-IP (CC BY 4.0)
        </p>
      ) : geo.kind === 'running' ? (
        <p className="settings__status" role="status">
          {tr('내려받는 중…', 'Downloading…')} {mb(geo.received)}
          {geo.total ? ` / ${mb(geo.total)}` : ''}
        </p>
      ) : (
        <button type="button" className="primary-button" onClick={download}>
          {tr('내려받기', 'Download')} (db-ip.com)
        </button>
      )}
      {geo.kind === 'error' && <p className="ask__unavailable">{geo.message}</p>}
    </>
  );
}

export function SettingsButton(): ReactElement | null {
  const open = useViewer((s) => s.settingsOpen);
  const setOpen = useViewer((s) => s.setSettingsOpen);
  return (
    <button
      type="button"
      className="icon-button settings-button"
      aria-expanded={open}
      title={tr('설정', 'Settings')}
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
      <span className="visually-hidden">{tr('설정', 'Settings')}</span>
    </button>
  );
}
