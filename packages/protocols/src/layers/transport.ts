import { tr } from '@netgongbu/schema';
import { BitWriter, concat, hex, internetChecksum } from '../bits';
import type { ByteSource } from '../model';
import { ipBytes, numberOf, type Values } from '../values';
import type { Encoded, EncodeContext } from './types';

/** A port picked by the OS from the ephemeral range when the scenario only says "temporary". */
const EPHEMERAL = 51515;

function port(
  values: Values,
  names: string[],
  fallback: number,
): { n: number; source: ByteSource } {
  return numberOf(values.get(...names)) ?? { n: fallback, source: 'typical' };
}

/** IPv4 pseudo-header that TCP and UDP checksums cover (source, destination, protocol, length). */
function pseudoHeader(ctx: EncodeContext, protocol: number, length: number): Uint8Array {
  return concat(
    ipBytes(ctx.srcIp),
    ipBytes(ctx.dstIp),
    Uint8Array.from([0, protocol, length >> 8, length & 0xff]),
  );
}

function fillChecksum(
  w: BitWriter,
  at: number,
  ctx: EncodeContext,
  protocol: number,
  payload: Uint8Array,
): void {
  const segment = concat(w.toBytes(), payload);
  const sum = internetChecksum(pseudoHeader(ctx, protocol, segment.length), segment);
  w.patch16(at, sum);
  const field = w.fields.find((f) => f.key === 'checksum');
  if (field) field.value = hex(sum, 4);
}

/** UDP header (RFC 768). */
export function udp(values: Values, payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const src = port(values, ['srcPort', 'src'], EPHEMERAL);
  const dst = port(values, ['dstPort', 'dst'], 53);
  w.uint(src.n, 16, {
    key: 'srcPort',
    name: 'Source Port',
    value: String(src.n),
    meaning: tr('보낸 프로그램을 가리키는 번호', 'Number identifying the sending program'),
    source: src.source,
  });
  w.uint(dst.n, 16, {
    key: 'dstPort',
    name: 'Destination Port',
    value: String(dst.n),
    meaning: tr(
      '받을 프로그램(서비스)의 번호: DNS는 53, QUIC은 443',
      'Number of the receiving program (service): 53 for DNS, 443 for QUIC',
    ),
    source: dst.source,
  });
  w.uint(8 + payload.length, 16, {
    key: 'length',
    name: 'Length',
    value: tr(`${String(8 + payload.length)}바이트`, `${String(8 + payload.length)} bytes`),
    meaning: tr(
      'UDP 헤더(8바이트)와 내용의 길이',
      'Length of the UDP header (8 bytes) plus content',
    ),
    source: 'derived',
  });
  const at = w.byteLength;
  w.uint(0, 16, {
    key: 'checksum',
    name: 'Checksum',
    value: '',
    meaning: tr(
      'IP 주소까지 포함한 의사 헤더와 내용 전체의 오류 검사 값',
      'Error check over a pseudo-header (including the IP addresses) and the whole content',
    ),
    source: 'derived',
  });
  fillChecksum(w, at, ctx, 17, payload);
  return {
    kind: 'udp',
    title: 'UDP',
    standard: 'RFC 768',
    header: w,
    note: tr(
      'UDP는 연결 없이 보내기만 합니다. 순서와 재전송은 위 계층(DNS, QUIC)이 책임집니다.',
      'UDP just sends, without a connection. Ordering and retransmission are up to the layer above (DNS, QUIC).',
    ),
  };
}

/** The eight TCP flag bits: letter, name, what it means (in the viewer's language). */
const flagBits = (): [string, string, string][] => [
  [
    'CWR',
    'Congestion Window Reduced',
    tr('혼잡 제어 창을 줄였음', 'The congestion window was reduced'),
  ],
  ['ECE', 'ECN-Echo', tr('혼잡 알림을 받았음', 'A congestion notification was received')],
  ['URG', 'Urgent', tr('긴급 데이터(거의 안 씀)', 'Urgent data (rarely used)')],
  [
    'ACK',
    'Acknowledgment',
    tr(
      'ack 번호가 유효함: 첫 SYN을 뺀 모든 세그먼트에 켜짐',
      'The ack number is valid: set on every segment except the first SYN',
    ),
  ],
  [
    'PSH',
    'Push',
    tr('받는 쪽이 바로 위 계층에 넘기도록', 'Asks the receiver to pass data up right away'),
  ],
  ['RST', 'Reset', tr('연결을 강제로 끊음', 'Aborts the connection')],
  [
    'SYN',
    'Synchronize',
    tr('연결 시작: 순서 번호를 맞춤', 'Starts a connection: syncs sequence numbers'),
  ],
  ['FIN', 'Finish', tr('보낼 데이터가 끝남', 'No more data to send')],
];

/** TCP header (RFC 9293), with the usual SYN options and a real checksum. */
export function tcp(values: Values, payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const src = port(values, ['srcPort', 'src'], EPHEMERAL);
  const dst = port(values, ['dstPort', 'dst'], 443);
  const flagText = (values.get('flags')?.text ?? 'ACK').toUpperCase();
  const flagSource: ByteSource = values.get('flags')?.source ?? 'typical';
  const on = new Set(
    flagBits()
      .map(([f]) => f)
      .filter((f) => new RegExp(`\\b${f}\\b`).test(flagText)),
  );
  const syn = on.has('SYN');
  const seq = numberOf(values.get('seq')) ?? { n: 0x6f2a1c04, source: 'typical' as const };
  const ack = numberOf(values.get('ack')) ?? {
    n: on.has('ACK') ? 0x3b9ac9ff : 0,
    source: 'typical' as const,
  };
  const options = syn ? synOptions() : null;
  const headerLength = 20 + (options?.byteLength ?? 0);

  w.uint(src.n, 16, {
    key: 'srcPort',
    name: 'Source Port',
    value: String(src.n),
    meaning: tr(
      '보낸 쪽 프로그램의 포트. 브라우저 쪽은 OS가 임시 포트를 골라 줍니다',
      "Port of the sending program. On the browser's side, the OS picks an ephemeral port",
    ),
    source: src.source,
  });
  w.uint(dst.n, 16, {
    key: 'dstPort',
    name: 'Destination Port',
    value: String(dst.n),
    meaning: tr(
      '받을 서비스의 포트: HTTPS는 443, HTTP는 80',
      'Port of the receiving service: 443 for HTTPS, 80 for HTTP',
    ),
    source: dst.source,
  });
  w.uint(seq.n >>> 0, 32, {
    key: 'seq',
    name: 'Sequence Number',
    value: String(seq.n >>> 0),
    meaning: tr(
      '이 세그먼트의 첫 바이트 번호. 연결마다 무작위로 시작합니다',
      "Number of this segment's first byte. Starts at a random value for each connection",
    ),
    source: seq.source,
  });
  w.uint(ack.n >>> 0, 32, {
    key: 'ack',
    name: 'Acknowledgment Number',
    value: String(ack.n >>> 0),
    meaning: tr(
      '다음에 받기를 기대하는 바이트 번호(= 받은 것 + 1)',
      'Number of the next byte expected (= last received + 1)',
    ),
    source: ack.source,
  });
  w.uint(headerLength / 4, 4, {
    key: 'offset',
    name: 'Data Offset',
    value: tr(
      `${String(headerLength / 4)} (${String(headerLength)}바이트)`,
      `${String(headerLength / 4)} (${String(headerLength)} bytes)`,
    ),
    meaning: tr(
      'TCP 헤더 길이(4바이트 단위). 옵션이 있으면 길어집니다',
      'TCP header length in 4-byte units. Longer when there are options',
    ),
    source: 'derived',
  });
  w.uint(0, 4, {
    key: 'reserved',
    name: 'Reserved',
    value: '0',
    meaning: tr('예약', 'Reserved'),
    source: 'spec',
  });
  const flagStart = w.bitLength;
  for (const [flag, name, meaning] of flagBits()) {
    w.uint(on.has(flag) ? 1 : 0, 1, {
      key: `flag-${flag}`,
      name: `${flag} (${name})`,
      value: on.has(flag) ? '1' : '0',
      meaning,
      source: flagSource,
    });
  }
  w.group(
    {
      key: 'flags',
      name: 'Flags',
      value: [...on].join(', ') || tr('없음', 'none'),
      meaning: tr('세그먼트의 역할을 나타내는 8개의 비트', "8 bits that tell the segment's role"),
      source: flagSource,
    },
    flagStart,
  );
  w.uint(syn ? 65535 : 2048, 16, {
    key: 'window',
    name: 'Window',
    value: syn ? '65535' : '2048',
    meaning: tr(
      '지금 더 받을 수 있는 바이트 수(흐름 제어). 창 크기 배율 옵션과 곱해 씁니다',
      'How many more bytes can be received now (flow control). Multiplied by the window scale option',
    ),
    source: 'typical',
  });
  const at = w.byteLength;
  w.uint(0, 16, {
    key: 'checksum',
    name: 'Checksum',
    value: '',
    meaning: tr(
      'IP 주소까지 포함한 의사 헤더와 세그먼트 전체의 오류 검사 값',
      'Error check over a pseudo-header (including the IP addresses) and the whole segment',
    ),
    source: 'derived',
  });
  w.uint(0, 16, {
    key: 'urgent',
    name: 'Urgent Pointer',
    value: '0',
    meaning: tr('URG가 켜졌을 때만 의미가 있음', 'Only meaningful when URG is set'),
    source: 'spec',
  });
  if (options) {
    const optionsStart = w.bitLength;
    w.bytes(options.toBytes(), {
      key: 'options',
      name: 'Options',
      value: tr(
        'MSS 1460, 창 배율 6, 타임스탬프, SACK 허용',
        'MSS 1460, window scale 6, timestamps, SACK permitted',
      ),
      meaning: tr(
        '연결을 시작할 때 서로의 능력을 알려 주는 선택 항목',
        'Optional items each side uses to announce its capabilities when the connection starts',
      ),
      source: 'typical',
      children: options.fields.map((f) => ({ ...f, bitOffset: f.bitOffset + optionsStart })),
    });
  }
  fillChecksum(w, at, ctx, 6, payload);
  return {
    kind: 'tcp',
    title: 'TCP',
    standard: 'RFC 9293',
    header: w,
    note: syn
      ? tr(
          'SYN에는 데이터가 없고, 연결 조건(최대 세그먼트 크기 등)을 옵션으로 주고받습니다.',
          'A SYN carries no data; the two sides exchange connection settings (maximum segment size, etc.) as options.',
        )
      : undefined,
  };
}

/** The options a desktop OS typically puts in a SYN: MSS, window scale, timestamps, SACK. */
function synOptions(): BitWriter {
  const o = new BitWriter();
  const opt = (key: string, name: string, bytes: number[], meaning: string): void => {
    o.bytes(Uint8Array.from(bytes), {
      key,
      name,
      value: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
      meaning,
      source: 'typical',
    });
  };
  opt(
    'mss',
    'MSS = 1460',
    [2, 4, 0x05, 0xb4],
    tr(
      '한 세그먼트에 담을 수 있는 최대 데이터(이더넷 1500 − IP 20 − TCP 20)',
      'Most data one segment can carry (Ethernet 1500 − IP 20 − TCP 20)',
    ),
  );
  opt('nop1', 'NOP', [1], tr('정렬을 위한 빈 칸', 'Padding for alignment'));
  opt(
    'wscale',
    'Window Scale = 6',
    [3, 3, 6],
    tr(
      '창 크기에 2⁶을 곱해 큰 창을 쓸 수 있게',
      'Multiplies the window by 2⁶ to allow a large window',
    ),
  );
  opt('nop2', 'NOP', [1], tr('정렬', 'Alignment'));
  opt('nop3', 'NOP', [1], tr('정렬', 'Alignment'));
  opt(
    'ts',
    'Timestamps',
    [8, 10, 0x1d, 0x4c, 0x7a, 0x31, 0, 0, 0, 0],
    tr(
      '왕복 시간 측정과 오래된 세그먼트 구분',
      'Measures round-trip time and tells old segments apart',
    ),
  );
  opt(
    'sack',
    'SACK Permitted',
    [4, 2],
    tr(
      '빠진 부분만 골라서 다시 받을 수 있음',
      'Lets the receiver get just the missing parts again',
    ),
  );
  opt(
    'eol',
    'End of Options',
    [0, 0],
    tr('옵션 끝과 4바이트 정렬', 'End of options and 4-byte alignment'),
  );
  return o;
}
