import type { TraceEvent } from '@netgongbu/bridge';
import {
  TraceReportSchema,
  type CapturedRequest,
  type DnsLookup,
  type Hop,
  type LocalNetwork,
  type TraceReport,
  type TracerouteLine,
} from '@netgongbu/trace';
import { enrichHop, type HopLookups } from './enrich';
import type { TracerouteResult } from './traceroute';

/** What the laptop's browser saw while loading the page (DevTools Network events, collected). */
export interface PageCapture {
  requests: CapturedRequest[];
  documentChain: string[];
  userAgent: string;
  title: string;
  finalUrl: string;
}

export interface TraceRunDeps {
  capture: (input: string, signal: AbortSignal) => Promise<PageCapture>;
  local: () => Promise<LocalNetwork>;
  dns: (host: string, servers: readonly string[]) => Promise<DnsLookup | null>;
  traceroute: (
    target: string,
    onHop: (line: TracerouteLine) => void,
    signal: AbortSignal,
  ) => Promise<TracerouteResult>;
  lookups: HopLookups;
  /** Attribution of the location database, or null when none is installed. */
  geoSource: () => string | null;
  emit: (event: TraceEvent) => void;
  now?: () => Date;
}

function stopIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('측정을 취소했습니다.');
}

/**
 * One measurement: load the page in the laptop's browser, read this computer's network setup,
 * resolve the host, trace the path to the server that answered (each hop named, owned and placed
 * as soon as it arrives) and assemble the report.
 */
export async function runTrace(
  input: string,
  deps: TraceRunDeps,
  signal: AbortSignal,
): Promise<TraceReport> {
  const startedAt = (deps.now?.() ?? new Date()).toISOString();
  deps.emit({ type: 'phase', phase: 'browser', message: `${input}을(를) 여는 중…` });
  const localPromise = deps.local();
  const page = await deps.capture(input, signal);
  stopIfCancelled(signal);
  deps.emit({ type: 'page', url: page.finalUrl, title: page.title });

  deps.emit({ type: 'phase', phase: 'local', message: '이 컴퓨터의 네트워크 설정을 읽는 중…' });
  const local = await localPromise;

  const mainId = page.documentChain.at(-1);
  const main = page.requests.find((r) => r.id === mainId);
  let dns: DnsLookup | null = null;
  let target: string | null = null;
  if (main) {
    const host = new URL(main.url).hostname;
    deps.emit({ type: 'phase', phase: 'dns', message: `${host}의 주소를 확인하는 중…` });
    dns = await deps.dns(host, local.dnsServers);
    target = main.remoteIp ?? dns?.addresses[0]?.address ?? null;
  }
  stopIfCancelled(signal);

  const hops: Hop[] = [];
  let enriching = Promise.resolve();
  let path: TraceReport['path'] = {
    target,
    hops,
    complete: false,
    error: '서버 주소를 알 수 없습니다.',
  };
  if (target) {
    deps.emit({ type: 'phase', phase: 'path', message: `${target}까지 경로를 추적하는 중…` });
    const result = await deps.traceroute(
      target,
      (line) => {
        // Keep hop order while lookups for each hop run as soon as it arrives.
        enriching = enriching.then(async () => {
          const hop = await enrichHop(line, deps.lookups);
          hops.push(hop);
          deps.emit({ type: 'hop', hop });
        });
      },
      signal,
    );
    deps.emit({ type: 'phase', phase: 'enrich', message: '라우터 이름과 위치를 정리하는 중…' });
    await enriching;
    path = { target, hops, complete: result.complete, error: result.error };
  }
  stopIfCancelled(signal);

  return TraceReportSchema.parse({
    version: 1,
    input,
    startedAt,
    userAgent: page.userAgent,
    local,
    requests: page.requests,
    documentChain: page.documentChain,
    dns,
    path,
    origin: hops.find((h) => h.geo)?.geo ?? null,
    geoSource: hops.some((h) => h.geo) ? deps.geoSource() : null,
  });
}
