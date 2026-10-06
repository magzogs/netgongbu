import { useEffect, useState, type ReactElement } from 'react';
import type { Settings } from '@magvirtualedu/bridge';
import { lab } from '../data/backend';
import { useViewer } from '../store/viewer';

const SOURCE_TEXT: Record<NonNullable<Settings['apiKeySource']>, string> = {
  saved: '이 앱에 저장된 키를 사용 중 (OS 키체인으로 암호화)',
  environment: '환경변수 ANTHROPIC_API_KEY를 사용 중',
};

/** Desktop app settings: the Anthropic API key, stored encrypted by the OS keychain. */
export function SettingsPanel(): ReactElement | null {
  const open = useViewer((s) => s.settingsOpen);
  const setOpen = useViewer((s) => s.setSettingsOpen);
  const checkAi = useViewer((s) => s.checkAi);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !lab) return;
    void lab.settings.get().then(setSettings);
  }, [open]);

  if (!open || !lab) return null;
  const api = lab;

  const save = async (value: string | null): Promise<void> => {
    setError(null);
    try {
      setSettings(await api.settings.setApiKey(value));
      setKey('');
      await checkAi();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^Error invoking remote method '[^']+': /, '')
          : String(err),
      );
    }
  };

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

      <h3 className="section-title">Claude API 키</h3>
      <p className="muted settings__status">
        {settings === null
          ? '불러오는 중…'
          : settings.apiKeySource
            ? SOURCE_TEXT[settings.apiKeySource]
            : '키가 없습니다. AI 질문을 쓰려면 키를 입력하세요.'}
      </p>
      <form
        className="settings__row"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) void save(key.trim());
        }}
      >
        <input
          className="ask__input settings__key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
          }}
          aria-label="Anthropic API 키"
        />
        <button
          type="submit"
          className="primary-button"
          disabled={!key.trim() || settings?.canSaveKey === false}
        >
          저장
        </button>
      </form>
      {settings?.apiKeySource === 'saved' && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void save(null);
          }}
        >
          저장된 키 지우기
        </button>
      )}
      {settings?.canSaveKey === false && (
        <p className="ask__unavailable">
          이 컴퓨터의 키체인을 쓸 수 없어 키를 저장하지 않습니다. 환경변수 ANTHROPIC_API_KEY로
          실행해 주세요.
        </p>
      )}
      {error && <p className="ask__unavailable">{error}</p>}
      <p className="muted settings__note">
        키는 이 컴퓨터에만 저장되고, 질문할 때 Anthropic API로만 전송됩니다. 모델:{' '}
        {settings?.model ?? '…'}
      </p>
    </section>
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
