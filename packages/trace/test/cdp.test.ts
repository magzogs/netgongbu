import { describe, expect, it } from 'vitest';
import { collectRequests, type CdpEvent } from '../src';

/** ResourceTiming with Chromium's "-1 = did not happen" convention. */
function timing(overrides: Record<string, number> = {}) {
  return {
    requestTime: 1000,
    proxyStart: -1,
    proxyEnd: -1,
    dnsStart: -1,
    dnsEnd: -1,
    connectStart: -1,
    connectEnd: -1,
    sslStart: -1,
    sslEnd: -1,
    workerStart: -1,
    workerReady: -1,
    workerFetchStart: -1,
    workerRespondWithSettled: -1,
    sendStart: 0,
    sendEnd: 0.5,
    pushStart: 0,
    pushEnd: 0,
    receiveHeadersStart: 30,
    receiveHeadersEnd: 31,
    ...overrides,
  };
}

const security = {
  protocol: 'TLS 1.3',
  keyExchange: '',
  keyExchangeGroup: 'X25519MLKEM768',
  cipher: 'AES_128_GCM',
  certificateId: 0,
  subjectName: 'example.com',
  sanList: ['example.com', 'www.example.com'],
  issuer: 'Example CA',
  validFrom: 1_700_000_000,
  validTo: 1_800_000_000,
  signedCertificateTimestampList: [],
  certificateTransparencyCompliance: 'compliant',
  encryptedClientHello: false,
};

const response = (url: string, extra: Record<string, unknown>) => ({
  url,
  status: 200,
  statusText: '',
  headers: { 'content-type': 'text/html' },
  mimeType: 'text/html',
  charset: '',
  connectionReused: false,
  connectionId: 7,
  remoteIPAddress: '172.66.147.243',
  remotePort: 443,
  fromDiskCache: false,
  encodedDataLength: 400,
  securityState: 'secure',
  ...extra,
});

// http://example.com → HSTS internal redirect → https://example.com/ (h2), then an image on
// the same connection. Extra-info events arrive in Chromium's usual interleaved order.
const events = [
  {
    method: 'Network.requestWillBeSent',
    params: {
      requestId: 'R1',
      loaderId: 'L1',
      documentURL: 'http://example.com/',
      request: { url: 'http://example.com/', method: 'GET', headers: { 'User-Agent': 'UA' } },
      timestamp: 999,
      wallTime: 0,
      initiator: { type: 'other' },
      type: 'Document',
      frameId: 'F1',
    },
  },
  {
    method: 'Network.requestWillBeSent',
    params: {
      requestId: 'R1',
      loaderId: 'L1',
      documentURL: 'https://example.com/',
      request: { url: 'https://example.com/', method: 'GET', headers: { 'User-Agent': 'UA' } },
      redirectResponse: response('http://example.com/', {
        status: 307,
        statusText: 'Internal Redirect',
        headers: { Location: 'https://example.com/', 'Non-Authoritative-Reason': 'HSTS' },
        remoteIPAddress: undefined,
        connectionId: 0,
      }),
      timestamp: 999.1,
      wallTime: 0,
      initiator: { type: 'other' },
      type: 'Document',
      frameId: 'F1',
    },
  },
  {
    method: 'Network.requestWillBeSentExtraInfo',
    params: {
      requestId: 'R1',
      associatedCookies: [],
      headers: { ':authority': 'example.com', ':method': 'GET', cookie: 'session=abc123' },
      connectTiming: { requestTime: 1000 },
    },
  },
  {
    method: 'Network.responseReceivedExtraInfo',
    params: {
      requestId: 'R1',
      blockedCookies: [],
      headers: { ':status': '200', 'content-type': 'text/html', 'set-cookie': 'a=1' },
      resourceIPAddressSpace: 'Public',
      statusCode: 200,
    },
  },
  {
    method: 'Network.responseReceived',
    params: {
      requestId: 'R1',
      loaderId: 'L1',
      timestamp: 1000.05,
      type: 'Document',
      frameId: 'F1',
      hasExtraInfo: true,
      response: response('https://example.com/', {
        protocol: 'h2',
        securityDetails: security,
        timing: timing({
          dnsStart: 0,
          dnsEnd: 12.4,
          connectStart: 12.4,
          connectEnd: 40,
          sslStart: 20,
          sslEnd: 40,
          sendStart: 40.2,
          sendEnd: 40.5,
          receiveHeadersEnd: 70.5,
        }),
      }),
    },
  },
  {
    method: 'Network.loadingFinished',
    params: { requestId: 'R1', timestamp: 1000.0805, encodedDataLength: 1256 },
  },
  {
    method: 'Network.requestWillBeSent',
    params: {
      requestId: 'R2',
      loaderId: 'L1',
      documentURL: 'https://example.com/',
      request: { url: 'https://example.com/logo.png', method: 'GET', headers: {} },
      timestamp: 1000.1,
      wallTime: 0,
      initiator: { type: 'parser' },
      type: 'Image',
      frameId: 'F1',
    },
  },
  {
    method: 'Network.responseReceived',
    params: {
      requestId: 'R2',
      loaderId: 'L1',
      timestamp: 1000.12,
      type: 'Image',
      frameId: 'F1',
      hasExtraInfo: false,
      response: response('https://example.com/logo.png', {
        protocol: 'h2',
        connectionReused: true,
        timing: timing(),
      }),
    },
  },
] as unknown as CdpEvent[];

describe('collectRequests', () => {
  const { requests, documentChain } = collectRequests(events);

  it('splits a redirect into its own leg and records where it went', () => {
    expect(requests.map((r) => r.id)).toEqual(['R1', 'R1:1', 'R2']);
    expect(documentChain).toEqual(['R1', 'R1:1']);
    expect(requests[0]).toMatchObject({
      url: 'http://example.com/',
      status: 307,
      statusText: 'Internal Redirect',
      redirectedTo: 'https://example.com/',
      responseHeaders: { 'Non-Authoritative-Reason': 'HSTS' },
    });
  });

  it('keeps protocol, server address, TLS details and phase timings of the document', () => {
    expect(requests[1]).toMatchObject({
      url: 'https://example.com/',
      status: 200,
      protocol: 'h2',
      remoteIp: '172.66.147.243',
      remotePort: 443,
      connectionReused: false,
      encodedBytes: 1256,
      security: {
        protocol: 'TLS 1.3',
        keyExchange: 'X25519MLKEM768',
        cipher: 'AES_128_GCM',
        subject: 'example.com',
      },
      timing: { dnsMs: 12.4, connectMs: 7.6, tlsMs: 20, sendMs: 0.3, waitMs: 30, receiveMs: 10 },
    });
  });

  it('uses the headers really sent (HTTP/2 pseudo headers) and hides cookies', () => {
    expect(requests[1]?.requestHeaders).toEqual({
      ':authority': 'example.com',
      ':method': 'GET',
      cookie: '(가려짐, 14자)',
    });
    expect(requests[1]?.responseHeaders['set-cookie']).toBe('(가려짐, 3자)');
  });

  it('marks reused connections', () => {
    expect(requests[2]).toMatchObject({ resourceType: 'Image', connectionReused: true });
  });
});
