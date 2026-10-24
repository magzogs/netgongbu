import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { tr } from '@netgongbu/schema';
import { lab } from '../data/backend';
import { useViewer } from '../store/viewer';

/**
 * The laptop's web browser. The page area is a real Chromium view that the
 * main process places exactly over the `.browser__page` box; typing an address and pressing Enter
 * loads it while every request is recorded, then the path to the server is traced.
 */
export function LaptopBrowser(): ReactElement | null {
  const open = useViewer((s) => s.browserOpen);
  const run = useViewer((s) => s.traceRun);
  const fresh = useViewer((s) => s.freshLoad);
  const geoInstalled = useViewer((s) => s.geoDownload.kind === 'done');
  const { setBrowserOpen, startTrace, cancelTrace, setFreshLoad, setSettingsOpen } =
    useViewer.getState();
  const [address, setAddress] = useState(() => (run.kind !== 'idle' ? run.input : 'example.com'));
  const page = useRef<HTMLDivElement>(null);
  const running = run.kind === 'running';
  // The native view shows only while a page is being loaded or measured.
  const showPage = running;

  useLayoutEffect(() => {
    const el = page.current;
    if (!open || !el || !showPage) return;
    const place = (): void => {
      const r = el.getBoundingClientRect();
      lab.browser.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      lab.browser.setBounds(null);
    };
  }, [open, showPage]);

  if (!open) return null;

  const go = (): void => {
    if (address.trim() && !running) void startTrace(address.trim());
  };

  return (
    <section className="browser panel" aria-label={tr('노트북의 브라우저', 'Laptop browser')}>
      <header className="browser__bar">
        <span className="browser__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <form
          className="browser__address"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
            }}
            disabled={running}
            spellCheck={false}
            autoComplete="off"
            aria-label={tr('주소', 'Address')}
            placeholder={tr('주소를 입력하고 Enter', 'Type an address and press Enter')}
          />
        </form>
        {running ? (
          <button type="button" className="text-button" onClick={cancelTrace}>
            {tr('중지', 'Stop')}
          </button>
        ) : (
          <button type="button" className="primary-button browser__go" onClick={go}>
            {tr('이동', 'Go')}
          </button>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setBrowserOpen(false);
          }}
        >
          {tr('닫기', 'Close')}
        </button>
      </header>

      <div className="browser__body">
        <div ref={page} className="browser__page">
          {!showPage && (
            <div className="browser__intro">
              <strong>{tr('노트북의 브라우저', 'Laptop browser')}</strong>
              <p>
                {tr(
                  '주소를 입력하고 Enter를 누르면 이 컴퓨터에서 실제로 페이지를 엽니다. 그동안 브라우저가 보낸 요청을 모두 기록하고, 서버까지의 경로를 traceroute로 추적해 그 결과로 지도와 시나리오를 새로 만듭니다.',
                  'Type an address and press Enter to actually open the page on this computer. Meanwhile every request the browser sends is recorded, and the route to the server is traced with traceroute; the results become a new map and scenario.',
                )}
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={fresh}
                  onChange={(e) => {
                    setFreshLoad(e.target.checked);
                  }}
                />
                {tr(
                  '캐시를 비우고 처음 방문처럼 측정 (DNS·TCP·TLS가 모두 보이도록)',
                  'Clear the cache and measure as a first visit (so DNS, TCP and TLS all show)',
                )}
              </label>
              {!geoInstalled && (
                <p className="muted">
                  {tr(
                    '위치 데이터베이스가 없으면 경로가 지구본 대신 평면으로 그려집니다.',
                    'Without the location database, the route is drawn flat instead of on the globe.',
                  )}{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setSettingsOpen(true);
                    }}
                  >
                    {tr('설정에서 내려받기', 'Download it in Settings')}
                  </button>
                </p>
              )}
              {run.kind === 'error' && <p className="ask__unavailable">{run.message}</p>}
            </div>
          )}
        </div>
        {running && (
          <aside className="browser__log" aria-live="polite">
            <p className="browser__phase">
              <span className="spinner" aria-hidden="true" /> {run.message}
            </p>
            {run.page && <p className="muted">{run.page.title || run.page.url}</p>}
            <ol className="hops">
              {run.hops.map((h) => (
                <li key={h.ttl}>
                  <span className="hops__ttl">{h.ttl}</span>
                  <span className="hops__ip">{h.ip ?? '*'}</span>
                  <span className="muted">
                    {[
                      h.asn?.name.split(/[\s,]/)[0],
                      h.geo?.place,
                      h.rttMs !== null ? `${h.rttMs.toFixed(1)} ms` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </section>
  );
}

/** Opens the laptop's browser. */
export function BrowserButton(): ReactElement {
  const open = useViewer((s) => s.browserOpen);
  const setOpen = useViewer((s) => s.setBrowserOpen);
  return (
    <button
      type="button"
      className="pill-button browser-button"
      aria-expanded={open}
      onClick={() => {
        setOpen(!open);
      }}
    >
      {tr('노트북 브라우저', 'Laptop browser')}
    </button>
  );
}
