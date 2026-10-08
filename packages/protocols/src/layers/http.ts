import { tr } from '@netgongbu/schema';
import { ascii, BitWriter } from '../bits';
import type { ByteSource } from '../model';
import type { Given, Values } from '../values';
import { hpackEncode, type HeaderLine } from './hpack';
import type { Encoded, EncodeContext } from './types';

/** Scenario keys that describe the message rather than being header lines. */
const META = new Set([
  '요청 줄',
  '상태',
  '(그 밖의 헤더)',
  'request line',
  '(other headers)',
  'method',
  'path',
  'status',
  'note',
  '참고',
]);

interface Message {
  request: boolean;
  method: string;
  path: string;
  status: string;
  authority: string | null;
  headers: HeaderLine[];
  sources: { line: ByteSource };
}

/** Reads method/path/status and headers from the many shapes scenarios use. */
function readMessage(values: Values, ctx: EncodeContext): Message {
  const line = values.get('요청 줄', 'request line');
  const status = values.get('상태', ':status', 'status');
  const method = values.get(':method', 'method');
  const path = values.get(':path', 'path');
  const request = !status;
  const fromLine = line ? /^([A-Z]+)\s+(\S+)/.exec(line.text) : null;
  const headers: HeaderLine[] = [];
  for (const [key, given] of values.all) {
    if (META.has(key) || key.startsWith(':')) continue;
    headers.push({ name: key.toLowerCase(), value: given.text, source: given.source });
  }
  const authority = values.get(':authority', 'host')?.text ?? ctx.host;
  const statusText = status ? (/(\d{3}.*)/.exec(status.text)?.[1] ?? status.text) : '';
  const source = (line ?? status ?? method ?? ({ source: 'typical' } as Given)).source;
  return {
    request,
    method: method?.text ?? fromLine?.[1] ?? 'GET',
    path: path?.text ?? fromLine?.[2] ?? '/',
    status: statusText || '200 OK',
    authority,
    headers,
    sources: { line: source },
  };
}

/** HTTP/1.1 (RFC 9112): a text start line and header lines ending in CRLF. */
export function http1(values: Values, _payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const m = readMessage(values, ctx);
  const line = (text: string, name: string, meaning: string, source: ByteSource): void => {
    w.bytes(ascii(`${text}\r\n`), { key: `line-${name}`, name, value: text, meaning, source });
  };
  if (m.request) {
    line(
      `${m.method} ${m.path} HTTP/1.1`,
      'Request Line',
      tr('메서드, 경로, 버전', 'Method, path, version'),
      m.sources.line,
    );
    if (m.authority && !m.headers.some((h) => h.name === 'host')) {
      line(
        `Host: ${m.authority}`,
        'Host',
        tr(
          '어느 사이트에 대한 요청인지 (HTTP/1.1에서 필수)',
          'Which site the request is for (required in HTTP/1.1)',
        ),
        'derived',
      );
    }
  } else {
    line(
      `HTTP/1.1 ${m.status}`,
      'Status Line',
      tr('버전, 상태 코드, 이유 문구', 'Version, status code, reason phrase'),
      m.sources.line,
    );
  }
  for (const h of m.headers) line(`${h.name}: ${h.value}`, h.name, tr('헤더', 'Header'), h.source);
  line(
    '',
    tr('빈 줄', 'Empty line'),
    tr('헤더의 끝 (CRLF만 있는 줄)', 'End of headers (a line with only CRLF)'),
    'spec',
  );
  return {
    kind: 'http1',
    title: 'HTTP/1.1',
    standard: 'RFC 9112',
    header: w,
    note: m.request
      ? undefined
      : tr(
          '본문(HTML 등)은 헤더 다음에 이어지지만 여기서는 생략했습니다.',
          'The body (HTML, etc.) follows the headers but is left out here.',
        ),
  };
}

const FRAME_TYPES = 'HEADERS';

/** HTTP/2 (RFC 9113): a binary HEADERS frame on stream 1 whose header block is HPACK. */
export function http2(values: Values, _payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const m = readMessage(values, ctx);
  const pseudo: HeaderLine[] = m.request
    ? [
        { name: ':method', value: m.method, source: m.sources.line },
        {
          name: ':authority',
          value: m.authority ?? 'example.com',
          source: m.authority ? m.sources.line : 'typical',
        },
        { name: ':scheme', value: 'https', source: 'derived' },
        { name: ':path', value: m.path, source: m.sources.line },
      ]
    : [{ name: ':status', value: /^\d{3}/.exec(m.status)?.[0] ?? '200', source: m.sources.line }];
  const block = hpackEncode([...pseudo, ...m.headers.filter((h) => h.name !== 'host')]);
  const endStream = m.request && m.method === 'GET';
  const flags = (endStream ? 0x01 : 0) | 0x04;

  w.uint(block.bytes.length, 24, {
    key: 'length',
    name: 'Length',
    value: tr(`${String(block.bytes.length)}바이트`, `${String(block.bytes.length)} bytes`),
    meaning: tr(
      '프레임 헤더(9바이트)를 뺀 내용 길이',
      'Length of the content, not counting the 9-byte frame header',
    ),
    source: 'derived',
  });
  w.uint(0x01, 8, {
    key: 'type',
    name: 'Type',
    value: `0x1 (${FRAME_TYPES})`,
    meaning: tr('헤더를 담는 프레임 (DATA는 0x0)', 'Frame that carries headers (DATA is 0x0)'),
    source: 'spec',
  });
  w.uint(flags, 8, {
    key: 'flags',
    name: 'Flags',
    value: [endStream ? 'END_STREAM' : '', 'END_HEADERS'].filter(Boolean).join(' | '),
    meaning: tr(
      'END_HEADERS: 헤더가 이 프레임에서 끝남, END_STREAM: 이 요청에 본문이 없음',
      'END_HEADERS: the headers end in this frame, END_STREAM: this request has no body',
    ),
    source: 'derived',
  });
  w.uint(0, 1, {
    key: 'r',
    name: 'R',
    value: '0',
    meaning: tr('예약 비트', 'Reserved bit'),
    source: 'spec',
  });
  w.uint(1, 31, {
    key: 'stream',
    name: 'Stream Identifier',
    value: '1',
    meaning: tr(
      '한 연결 안의 요청 번호. 브라우저가 연 요청은 홀수(1, 3, 5…)',
      'Request number within one connection. Requests the browser opens are odd (1, 3, 5…)',
    ),
    source: 'typical',
  });
  const blockStart = w.bitLength;
  w.bytes(block.bytes, {
    key: 'hpack',
    name: 'Header Block (HPACK)',
    value: tr(
      `헤더 ${String(block.fields.length)}개 → ${String(block.bytes.length)}바이트`,
      `${String(block.fields.length)} headers → ${String(block.bytes.length)} bytes`,
    ),
    meaning: tr(
      '헤더를 정적·동적 테이블 번호와 글자로 압축한 것',
      'Headers compressed into static/dynamic table indexes and literal text',
    ),
    source: 'derived',
    children: block.fields.map((f) => ({ ...f, bitOffset: f.bitOffset + blockStart })),
  });
  return {
    kind: 'http2',
    title: m.request
      ? tr('HTTP/2 HEADERS (요청)', 'HTTP/2 HEADERS (request)')
      : tr('HTTP/2 HEADERS (응답)', 'HTTP/2 HEADERS (response)'),
    standard: 'RFC 9113 · RFC 7541',
    header: w,
    note:
      tr(
        'HTTP/2는 연결을 연 뒤 먼저 연결 서문(PRI * HTTP/2.0…)과 SETTINGS 프레임을 주고받습니다. 실제 브라우저는 헤더 글자를 허프만 부호로 더 줄이지만, 여기서는 읽을 수 있게 허프만 없이 보여 줍니다.',
        'After opening the connection, HTTP/2 first exchanges a connection preface (PRI * HTTP/2.0…) and SETTINGS frames. Real browsers shrink header text further with Huffman coding; it is shown without Huffman here so it stays readable.',
      ) +
      (m.request
        ? ''
        : tr(
            ' 본문은 뒤따르는 DATA 프레임에 실립니다.',
            ' The body is carried in the DATA frames that follow.',
          )),
  };
}
