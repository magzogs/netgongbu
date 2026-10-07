import { useState, type ReactElement, type SyntheticEvent } from 'react';
import {
  LOCAL_PRESETS,
  METHOD_LABELS,
  PROVIDER_IDS,
  PROVIDERS,
  prefsFor,
  type AiStatus,
  type CliProvider,
  type Method,
  type ProviderId,
} from '@magvirtualedu/llm';
import { useViewer } from '../../store/viewer';

/**
 * Which AI answers and how the app reaches it: ChatGPT or Claude by account sign-in (OAuth, run
 * by the official CLI), API key or the CLI as it is set up; or a local model server. Choosing a
 * provider or a method applies at once.
 */

const METHOD_HINTS: Record<Method, string> = {
  oauth: '구독 중인 계정으로 로그인합니다. 로그인은 공식 CLI가 처리하고 토큰도 CLI가 보관합니다.',
  api: '사용한 만큼 요금이 청구되는 API 키로 연결합니다.',
  cli: '이 컴퓨터에 설치된 CLI를 설정된 그대로(로그인 또는 키) 사용합니다.',
};

const OAUTH_NOTES: Record<CliProvider, string> = {
  openai:
    'ChatGPT 로그인은 OpenAI의 Codex CLI가 브라우저에서 진행하며, 이 앱은 토큰을 읽거나 저장하지 않습니다.',
  anthropic:
    'Anthropic은 Claude 구독 계정의 로그인을 Claude Code와 Claude.ai에서만 쓰도록 하고 있어, 로그인과 질문 모두 Claude Code가 처리합니다. 이 앱은 토큰을 읽거나 저장하지 않습니다.',
};

const LOGIN_COMMANDS: Record<CliProvider, string> = {
  openai: 'codex login',
  anthropic: 'claude auth login',
};

function CliLine({ provider, status }: { provider: CliProvider; status: AiStatus }): ReactElement {
  const loadConnection = useViewer((s) => s.loadConnection);
  const info = PROVIDERS[provider].cli;
  const cli = status.cli[provider];
  return (
    <div className="conn__row">
      {cli.path ? (
        <p className="conn__line">
          <span className="conn__ok">✓</span> {info?.name}{' '}
          {/\d+\.\d+[\w.-]*/.exec(cli.version ?? '')?.[0] ?? cli.version}
          <code className="conn__path" title={cli.path}>
            {cli.path}
          </code>
        </p>
      ) : (
        <div className="conn__line">
          <p className="conn__warn">{cli.error ?? `${info?.name ?? 'CLI'}를 찾지 못했습니다.`}</p>
          <p className="muted">
            설치: <code>{info?.install}</code>
            {provider === 'openai' && ' (ChatGPT 데스크톱 앱에 들어 있는 것도 찾습니다)'}
          </p>
        </div>
      )}
      <button
        type="button"
        className="text-button"
        onClick={() => {
          void loadConnection(true);
        }}
      >
        다시 찾기
      </button>
    </div>
  );
}

function AccountLine({
  provider,
  status,
}: {
  provider: CliProvider;
  status: AiStatus;
}): ReactElement | null {
  const account = status.accounts[provider];
  switch (account.state) {
    case 'checking':
      return <p className="muted conn__line">로그인 상태를 확인하는 중…</p>;
    case 'signed-in':
      return (
        <p className="conn__line">
          <span className="conn__ok">✓</span> {account.label}
          {account.kind === 'apiKey' && <span className="muted"> (CLI가 API 키를 사용 중)</span>}
        </p>
      );
    case 'signed-out':
      return <p className="conn__warn conn__line">로그인되어 있지 않습니다.</p>;
    case 'error':
      return <p className="conn__warn conn__line">{account.message}</p>;
    default:
      return null;
  }
}

function SignIn({ provider, status }: { provider: CliProvider; status: AiStatus }): ReactElement {
  const { signIn, stopSignIn, signOut } = useViewer.getState();
  const label = PROVIDERS[provider].label;
  const login = status.login?.provider === provider ? status.login : null;
  const account = status.accounts[provider];
  if (!status.cli[provider].path) return <CliLine provider={provider} status={status} />;
  return (
    <>
      <CliLine provider={provider} status={status} />
      <AccountLine provider={provider} status={status} />
      {login?.running ? (
        <div className="conn__login" role="status">
          <span className="spinner spinner--accent" aria-hidden="true" />
          <p>
            브라우저에서 {label} 계정으로 로그인하세요.
            {login.url && (
              <>
                {' '}
                창이 열리지 않았다면{' '}
                <a href={login.url} target="_blank" rel="noreferrer">
                  로그인 페이지 열기
                </a>
              </>
            )}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              void stopSignIn();
            }}
          >
            취소
          </button>
        </div>
      ) : account.state === 'signed-in' ? (
        <div className="conn__actions">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              void signOut(provider);
            }}
          >
            로그아웃
          </button>
        </div>
      ) : (
        <div className="conn__actions">
          <button
            type="button"
            className="primary-button"
            disabled={account.state === 'checking'}
            onClick={() => {
              void signIn(provider);
            }}
          >
            {label} 계정으로 로그인
          </button>
        </div>
      )}
      {login?.error && (
        <p className="conn__warn">
          {login.error} 터미널에서 <code>{LOGIN_COMMANDS[provider]}</code>로 로그인한 뒤 다시 찾기를
          눌러도 됩니다.
        </p>
      )}
      <p className="muted conn__note">{OAUTH_NOTES[provider]}</p>
    </>
  );
}

function CliSettings({
  provider,
  status,
}: {
  provider: CliProvider;
  status: AiStatus;
}): ReactElement {
  const changeConnection = useViewer((s) => s.changeConnection);
  const cli = status.cli[provider];
  const command = PROVIDERS[provider].cli?.command ?? '';
  const [path, setPath] = useState(cli.custom ? (cli.path ?? '') : '');
  const submit = (e: SyntheticEvent): void => {
    e.preventDefault();
    void changeConnection({ provider, cliPath: path.trim() || null });
  };
  return (
    <>
      <CliLine provider={provider} status={status} />
      {cli.path && <AccountLine provider={provider} status={status} />}
      <form className="conn__form" onSubmit={submit}>
        <label className="conn__field">
          <span>실행 파일 경로 (비우면 자동으로 찾기)</span>
          <input
            className="ask__input"
            value={path}
            spellCheck={false}
            placeholder={`/usr/local/bin/${command}`}
            onChange={(e) => {
              setPath(e.target.value);
            }}
          />
        </label>
        <button type="submit" className="chip-button">
          적용
        </button>
      </form>
      <p className="muted conn__note">
        터미널에서 <code>{LOGIN_COMMANDS[provider]}</code>로 로그인했거나 API 키를 설정해 둔 CLI를
        그대로 씁니다. 질문마다 도구 없이, 빈 폴더에서 실행합니다.
      </p>
    </>
  );
}

function KeySettings({
  provider,
  status,
}: {
  provider: ProviderId;
  status: AiStatus;
}): ReactElement {
  const setApiKey = useViewer((s) => s.setApiKey);
  const [key, setKey] = useState('');
  const source = status.keys[provider];
  const env = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const blocked = status.keyStorage === 'unavailable';
  return (
    <>
      <p className="conn__line">
        {source === 'saved' ? (
          <>
            <span className="conn__ok">✓</span>{' '}
            {status.keyStorage === 'keychain'
              ? '저장된 키를 사용 중 (OS 키체인으로 암호화)'
              : '입력한 키를 사용 중 (서버 메모리에만 있음)'}
          </>
        ) : source === 'environment' ? (
          <>
            <span className="conn__ok">✓</span> 환경변수 {env}를 사용 중
          </>
        ) : (
          <span className="conn__warn">키가 없습니다.</span>
        )}
      </p>
      <form
        className="conn__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!key.trim()) return;
          void setApiKey(provider, key.trim()).then(() => {
            setKey('');
          });
        }}
      >
        <input
          className="ask__input conn__key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={PROVIDERS[provider].keyHint}
          aria-label={`${PROVIDERS[provider].vendor} API 키`}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
          }}
        />
        <button type="submit" className="primary-button" disabled={!key.trim() || blocked}>
          저장
        </button>
      </form>
      {source === 'saved' && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void setApiKey(provider, null);
          }}
        >
          저장된 키 지우기
        </button>
      )}
      <p className="muted conn__note">
        {blocked
          ? `이 컴퓨터의 키체인을 쓸 수 없어 키를 저장하지 않습니다. 환경변수 ${env}로 실행해 주세요.`
          : status.keyStorage === 'memory'
            ? '웹에서는 키를 로컬 서버의 메모리에만 두고 디스크에 쓰지 않습니다(서버를 다시 켜면 다시 입력).'
            : `키는 이 컴퓨터에만 암호화해 저장되고, 질문할 때 ${PROVIDERS[provider].vendor} API로만 전송됩니다.`}
      </p>
    </>
  );
}

function LocalSettings({ status }: { status: AiStatus }): ReactElement {
  const changeConnection = useViewer((s) => s.changeConnection);
  const setApiKey = useViewer((s) => s.setApiKey);
  const current = prefsFor(status.prefs, 'local').baseUrl ?? '';
  const [url, setUrl] = useState(current);
  const [key, setKey] = useState('');
  const save = (baseUrl: string): void => {
    void changeConnection({ provider: 'local', baseUrl: baseUrl.trim() }).then(() =>
      key.trim() ? setApiKey('local', key.trim()) : undefined,
    );
  };
  return (
    <form
      className="conn__local"
      onSubmit={(e) => {
        e.preventDefault();
        save(url);
      }}
    >
      <div className="conn__presets" role="group" aria-label="자주 쓰는 서버">
        {LOCAL_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip-button"
            aria-pressed={current === p.baseUrl}
            onClick={() => {
              setUrl(p.baseUrl);
              save(p.baseUrl);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="conn__field">
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
      <label className="conn__field">
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
      <div className="conn__actions">
        <button type="submit" className="primary-button">
          연결
        </button>
      </div>
      <p className="muted conn__note">
        Ollama, LM Studio, llama.cpp처럼 OpenAI 호환 API를 여는 서버면 됩니다. 질문과 화면 설명은 이
        서버로만 보냅니다.
      </p>
    </form>
  );
}

/** Whether the model list came (the first sign that a key or sign-in really works). */
function ModelsLine({ provider }: { provider: ProviderId }): ReactElement | null {
  const list = useViewer((s) => s.models[provider]);
  const loadModels = useViewer((s) => s.loadModels);
  if (!list) return null;
  return (
    <div className="conn__row">
      <p className={`conn__line ${list.kind === 'error' ? 'conn__warn' : ''}`}>
        {list.kind === 'loading' && '모델 목록을 가져오는 중…'}
        {list.kind === 'ready' && `모델 ${String(list.models.length)}개를 가져왔습니다.`}
        {list.kind === 'error' && `모델 목록을 가져오지 못했습니다: ${list.message}`}
      </p>
      {list.kind !== 'loading' && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void loadModels(provider, true);
          }}
        >
          다시 가져오기
        </button>
      )}
    </div>
  );
}

export function ConnectionSettings(): ReactElement {
  const status = useViewer((s) => s.connection);
  const error = useViewer((s) => s.connectionError);
  const models = useViewer((s) => s.models);
  const changeConnection = useViewer((s) => s.changeConnection);
  if (!status) {
    return (
      <div className="conn">
        <p className={error ? 'conn__warn' : 'muted'}>{error ?? 'AI 연결 정보를 읽는 중…'}</p>
      </div>
    );
  }
  const active = status.prefs.provider;
  const prefs = active ? prefsFor(status.prefs, active) : null;
  const info = active ? PROVIDERS[active] : null;
  const working = status.ready && (!active || models[active]?.kind !== 'error');

  return (
    <div className="conn">
      <div className="conn__tabs" role="group" aria-label="AI">
        {PROVIDER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="conn__tab"
            aria-pressed={active === id}
            onClick={() => {
              void changeConnection({ provider: id, activate: true });
            }}
          >
            {PROVIDERS[id].label}
            <span className="conn__vendor">{PROVIDERS[id].vendor}</span>
          </button>
        ))}
      </div>
      {active && prefs && info && (
        <>
          {info.methods.length > 1 && (
            <div className="conn__methods" role="group" aria-label="연결 방식">
              {info.methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip-button"
                  aria-pressed={prefs.method === m}
                  title={METHOD_HINTS[m]}
                  onClick={() => {
                    void changeConnection({ provider: active, method: m });
                  }}
                >
                  {m === 'oauth' ? `${info.label} ${METHOD_LABELS[m]}` : METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          )}
          {info.methods.length > 1 && (
            <p className="muted conn__hint">{METHOD_HINTS[prefs.method]}</p>
          )}
          <div className="conn__body" key={`${active}:${prefs.method}`}>
            {active === 'local' ? (
              <LocalSettings status={status} />
            ) : prefs.method === 'oauth' ? (
              <SignIn provider={active} status={status} />
            ) : prefs.method === 'cli' ? (
              <CliSettings provider={active} status={status} />
            ) : (
              <KeySettings provider={active} status={status} />
            )}
          </div>
        </>
      )}
      {active && status.ready && <ModelsLine provider={active} />}
      {error && <p className="conn__warn">{error}</p>}
      <p className={`conn__status ${working ? 'is-ready' : ''}`} role="status">
        {working
          ? '연결됨 · 아래에서 모델과 Effort를 고르세요.'
          : status.ready
            ? '연결을 확인하세요: 모델 목록을 가져오지 못했습니다.'
            : status.notReady}
      </p>
    </div>
  );
}
