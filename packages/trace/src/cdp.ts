import { tr } from '@netgongbu/schema';
import type { Protocol } from 'devtools-protocol';
import type { CapturedRequest, Security, Timing } from './report';

/**
 * Chromium DevTools "Network" events of one page load, recorded in the order they arrived
 * (the desktop app attaches to its browser view and pushes every Network.* event here).
 */
export type CdpEvent =
  | { method: 'Network.requestWillBeSent'; params: Protocol.Network.RequestWillBeSentEvent }
  | {
      method: 'Network.requestWillBeSentExtraInfo';
      params: Protocol.Network.RequestWillBeSentExtraInfoEvent;
    }
  | { method: 'Network.responseReceived'; params: Protocol.Network.ResponseReceivedEvent }
  | {
      method: 'Network.responseReceivedExtraInfo';
      params: Protocol.Network.ResponseReceivedExtraInfoEvent;
    }
  | { method: 'Network.loadingFinished'; params: Protocol.Network.LoadingFinishedEvent }
  | { method: 'Network.loadingFailed'; params: Protocol.Network.LoadingFailedEvent };

/** Header values never kept in a report: they identify the learner on that site. */
const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization']);

function cleanHeaders(headers: Protocol.Network.Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    out[name] = SECRET_HEADERS.has(name.toLowerCase())
      ? tr(`(가려짐, ${String(value.length)}자)`, `(hidden, ${String(value.length)} characters)`)
      : value;
  }
  return out;
}

const span = (start: number, end: number): number | null =>
  start >= 0 && end >= start ? Math.round((end - start) * 10) / 10 : null;

function timingOf(
  t: Protocol.Network.ResourceTiming | undefined,
  finishedAt: number | undefined,
): Timing | null {
  if (!t) return null;
  const receiveEndMs = finishedAt === undefined ? -1 : (finishedAt - t.requestTime) * 1000;
  return {
    dnsMs: span(t.dnsStart, t.dnsEnd),
    // Chromium's connect phase includes TLS; keep TCP alone so the phases add up.
    connectMs: span(t.connectStart, t.sslStart >= 0 ? t.sslStart : t.connectEnd),
    tlsMs: span(t.sslStart, t.sslEnd),
    sendMs: span(t.sendStart, t.sendEnd),
    waitMs: span(t.sendEnd, t.receiveHeadersEnd),
    receiveMs: span(t.receiveHeadersEnd, receiveEndMs),
  };
}

function securityOf(d: Protocol.Network.SecurityDetails | undefined): Security | null {
  if (!d) return null;
  return {
    protocol: d.protocol,
    keyExchange: d.keyExchangeGroup
      ? `${d.keyExchange} ${d.keyExchangeGroup}`.trim()
      : d.keyExchange,
    cipher: d.cipher,
    subject: d.subjectName,
    issuer: d.issuer,
    validTo: Number.isFinite(d.validTo) ? new Date(d.validTo * 1000).toISOString() : null,
    san: d.sanList.slice(0, 10),
  };
}

interface Leg {
  request: CapturedRequest;
  requestId: string;
  frameId: string | undefined;
  timing: Protocol.Network.ResourceTiming | undefined;
}

export interface CollectedLoad {
  requests: CapturedRequest[];
  documentChain: string[];
}

/**
 * Turns Network events into one CapturedRequest per HTTP exchange. A redirect keeps Chromium's
 * requestId, so each redirect leg becomes its own entry ("<requestId>:<n>"). Extra-info events
 * carry the headers really sent and received (including HTTP/2 pseudo headers).
 */
export function collectRequests(events: readonly CdpEvent[]): CollectedLoad {
  const legs: Leg[] = [];
  const current = new Map<string, Leg>();
  const sentExtra = new Map<string, Protocol.Network.Headers[]>();
  const receivedExtra = new Map<string, Protocol.Network.Headers[]>();
  let mainFrame: string | undefined;

  const push = (
    store: Map<string, Protocol.Network.Headers[]>,
    id: string,
    headers: Protocol.Network.Headers,
  ): void => {
    store.set(id, [...(store.get(id) ?? []), headers]);
  };

  const applyResponse = (leg: Leg, response: Protocol.Network.Response): void => {
    const r = leg.request;
    r.status = response.status;
    r.statusText = response.statusText;
    r.protocol = response.protocol ?? null;
    r.remoteIp = response.remoteIPAddress ?? null;
    r.remotePort = response.remotePort ?? null;
    r.connectionId = response.connectionId;
    r.connectionReused = response.connectionReused;
    r.fromCache = Boolean(response.fromDiskCache ?? response.fromPrefetchCache);
    r.responseHeaders = cleanHeaders(response.headers);
    r.security = securityOf(response.securityDetails);
    r.encodedBytes = response.encodedDataLength;
    leg.timing = response.timing;
    r.timing = timingOf(response.timing, undefined);
  };

  for (const event of events) {
    switch (event.method) {
      case 'Network.requestWillBeSent': {
        const p = event.params;
        const previous = current.get(p.requestId);
        if (previous && p.redirectResponse) {
          applyResponse(previous, p.redirectResponse);
          previous.request.redirectedTo = p.request.url;
        }
        if (p.type === 'Document' && mainFrame === undefined) mainFrame = p.frameId;
        const n = legs.filter((l) => l.requestId === p.requestId).length;
        const leg: Leg = {
          requestId: p.requestId,
          frameId: p.frameId,
          timing: undefined,
          request: {
            id: n === 0 ? p.requestId : `${p.requestId}:${String(n)}`,
            url: p.request.url,
            method: p.request.method,
            resourceType: p.type ?? 'Other',
            status: null,
            statusText: '',
            protocol: null,
            remoteIp: null,
            remotePort: null,
            connectionId: null,
            connectionReused: false,
            fromCache: false,
            requestHeaders: cleanHeaders(p.request.headers),
            responseHeaders: {},
            timing: null,
            security: null,
            encodedBytes: null,
            redirectedTo: null,
          },
        };
        legs.push(leg);
        current.set(p.requestId, leg);
        break;
      }
      case 'Network.requestWillBeSentExtraInfo':
        push(sentExtra, event.params.requestId, event.params.headers);
        break;
      case 'Network.responseReceivedExtraInfo':
        push(receivedExtra, event.params.requestId, event.params.headers);
        break;
      case 'Network.responseReceived': {
        const leg = current.get(event.params.requestId);
        if (leg) applyResponse(leg, event.params.response);
        break;
      }
      case 'Network.loadingFinished': {
        const leg = current.get(event.params.requestId);
        if (leg) {
          leg.request.encodedBytes = event.params.encodedDataLength;
          leg.request.timing = timingOf(leg.timing, event.params.timestamp);
        }
        break;
      }
      case 'Network.loadingFailed': {
        const leg = current.get(event.params.requestId);
        if (leg?.request.status === null) leg.request.statusText = event.params.errorText;
        break;
      }
    }
  }

  // Extra-info events hold the headers really exchanged, one per leg that went over the network
  // (an internal redirect such as HSTS, or a cache hit, has none). The k-th one of a request id
  // belongs to its k-th network leg, whichever order the events arrived in.
  const networkIndex = new Map<string, number>();
  for (const leg of legs) {
    const r = leg.request;
    if (r.statusText === 'Internal Redirect' || r.fromCache) continue;
    const k = networkIndex.get(leg.requestId) ?? 0;
    networkIndex.set(leg.requestId, k + 1);
    const sent = sentExtra.get(leg.requestId)?.[k];
    const received = receivedExtra.get(leg.requestId)?.[k];
    if (sent) r.requestHeaders = cleanHeaders(sent);
    if (received) r.responseHeaders = cleanHeaders(received);
  }

  const documentChain = legs
    .filter((l) => l.request.resourceType === 'Document' && l.frameId === mainFrame)
    .map((l) => l.request.id);
  return { requests: legs.map((l) => l.request), documentChain };
}
