import { ascii, BitWriter, hex } from '../bits';
import type { ByteSource, Field } from '../model';
import { ipBytes, IPV4, type Values } from '../values';
import type { Encoded, EncodeContext } from './types';

const HOST = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i;

/** The host a DNS layer asks about: "example.com A" → example.com. */
function questionHost(values: Values, ctx: EncodeContext): { host: string; source: ByteSource } {
  const given = values.get('질문', 'question');
  const m = given ? HOST.exec(given.text) : null;
  if (m?.[1] && given) return { host: m[1].toLowerCase(), source: given.source };
  const answer = values.get('답', 'answer');
  const a = answer ? HOST.exec(answer.text) : null;
  if (a?.[1] && answer) return { host: a[1].toLowerCase(), source: answer.source };
  return { host: ctx.host ?? 'example.com', source: 'typical' };
}

function addresses(values: Values): { ips: string[]; source: ByteSource } {
  const given = values.get('답', 'answer');
  if (!given) return { ips: [], source: 'typical' };
  const ips = [...given.text.matchAll(new RegExp(IPV4.source, 'g'))]
    .map((m) => m[1] ?? '')
    .filter(Boolean);
  return { ips, source: given.source };
}

function ttlOf(values: Values): number {
  const t = values.get('TTL', 'ttl');
  const n = t ? /(\d+)/.exec(t.text)?.[1] : undefined;
  return n ? Number(n) : 300;
}

/** A DNS query or response for an A record (RFC 1035), names written label by label. */
export function dns(values: Values, _payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const { host, source: hostSource } = questionHost(values, ctx);
  const { ips, source: answerSource } = addresses(values);
  const response = ips.length > 0;
  const idText = values.get('id')?.text;
  const id = idText && /^0x[0-9a-f]+$/i.test(idText) ? parseInt(idText, 16) : 0x1a2b;

  w.uint(id, 16, {
    key: 'id',
    name: 'Transaction ID',
    value: hex(id, 4),
    meaning: '질문과 답을 짝짓는 번호. 답은 같은 번호로 돌아옵니다',
    source: idText ? 'observed' : 'typical',
  });
  const flagStart = w.bitLength;
  const flag = (key: string, name: string, bits: number, value: number, meaning: string): void => {
    w.uint(value, bits, {
      key,
      name,
      value: String(value),
      meaning,
      source: key === 'qr' ? 'derived' : 'typical',
    });
  };
  flag('qr', 'QR', 1, response ? 1 : 0, '0이면 질문, 1이면 답');
  flag('opcode', 'Opcode', 4, 0, '0: 일반 질의');
  flag('aa', 'AA', 1, 0, '권한 있는 서버의 답이면 1 (리졸버의 캐시 답은 0)');
  flag('tc', 'TC', 1, 0, '512바이트를 넘어 잘렸으면 1');
  flag('rd', 'RD', 1, 1, '재귀 질의 요청: 리졸버가 끝까지 찾아 달라는 뜻');
  flag('ra', 'RA', 1, response ? 1 : 0, '서버가 재귀 질의를 해 줄 수 있으면 1');
  flag('z', 'Z', 3, 0, '예약');
  flag('rcode', 'RCODE', 4, 0, '0: 오류 없음, 3: 그런 이름 없음(NXDOMAIN)');
  w.group(
    {
      key: 'flags',
      name: 'Flags',
      value: response ? hex(0x8180, 4) : hex(0x0100, 4),
      meaning: '질문인지 답인지, 재귀 요청 여부 등',
      source: 'derived',
    },
    flagStart,
  );
  w.uint(1, 16, {
    key: 'qdcount',
    name: 'Questions',
    value: '1',
    meaning: '질문 수',
    source: 'derived',
  });
  w.uint(ips.length, 16, {
    key: 'ancount',
    name: 'Answer RRs',
    value: String(ips.length),
    meaning: '답 레코드 수',
    source: 'derived',
  });
  w.uint(0, 16, {
    key: 'nscount',
    name: 'Authority RRs',
    value: '0',
    meaning: '권한 서버 레코드 수',
    source: 'typical',
  });
  w.uint(0, 16, {
    key: 'arcount',
    name: 'Additional RRs',
    value: '0',
    meaning: '추가 레코드 수',
    source: 'typical',
  });

  const nameStart = w.bitLength;
  const labels: Field[] = [];
  for (const label of host.split('.')) {
    const s = w.bitLength;
    w.uint(label.length, 8);
    w.bytes(ascii(label));
    labels.push({
      key: `label-${label}`,
      name: `Label "${label}"`,
      value: `${String(label.length)} + "${label}"`,
      meaning: '길이 1바이트 + 글자',
      source: hostSource,
      bitOffset: s,
      bitLength: w.bitLength - s,
    });
  }
  w.uint(0, 8);
  w.record(
    {
      key: 'qname',
      name: 'QNAME',
      value: host,
      meaning: '점 대신 각 부분 앞에 길이를 적고 0으로 끝냅니다',
      source: hostSource,
      children: labels,
    },
    nameStart,
  );
  w.uint(1, 16, {
    key: 'qtype',
    name: 'QTYPE',
    value: '1 (A)',
    meaning: 'A = IPv4 주소를 묻는 질문 (AAAA는 28)',
    source: 'typical',
  });
  w.uint(1, 16, {
    key: 'qclass',
    name: 'QCLASS',
    value: '1 (IN)',
    meaning: '인터넷 클래스',
    source: 'spec',
  });

  const ttl = ttlOf(values);
  ips.forEach((ip, i) => {
    const s = w.bitLength;
    w.uint(0xc00c, 16, {
      key: `an${String(i)}-name`,
      name: 'Name (pointer)',
      value: '0xc00c → 12번째 바이트의 QNAME',
      meaning: '같은 이름을 다시 쓰지 않고 앞의 위치를 가리킵니다(압축)',
      source: 'spec',
    });
    w.uint(1, 16, {
      key: `an${String(i)}-type`,
      name: 'Type',
      value: '1 (A)',
      meaning: 'IPv4 주소 레코드',
      source: 'derived',
    });
    w.uint(1, 16, {
      key: `an${String(i)}-class`,
      name: 'Class',
      value: '1 (IN)',
      meaning: '인터넷',
      source: 'spec',
    });
    w.uint(ttl, 32, {
      key: `an${String(i)}-ttl`,
      name: 'TTL',
      value: `${String(ttl)}초`,
      meaning: '이 답을 캐시에 둘 수 있는 시간',
      source: values.get('TTL', 'ttl')?.source ?? 'typical',
    });
    w.uint(4, 16, {
      key: `an${String(i)}-len`,
      name: 'RDLENGTH',
      value: '4',
      meaning: '주소 길이',
      source: 'derived',
    });
    w.bytes(ipBytes(ip), {
      key: `an${String(i)}-addr`,
      name: 'Address',
      value: ip,
      meaning: '답: 이 이름의 IPv4 주소',
      source: answerSource,
    });
    w.group(
      {
        key: `an${String(i)}`,
        name: `Answer ${String(i + 1)}`,
        value: `${host} A ${ip}`,
        meaning: '답 레코드',
        source: answerSource,
      },
      s,
    );
  });

  return {
    kind: 'dns',
    title: response ? 'DNS (응답)' : 'DNS (질문)',
    standard: 'RFC 1035',
    header: w,
    note: '일반 DNS는 암호화되지 않아 경로의 장비가 어떤 이름을 찾는지 볼 수 있습니다(DNS over HTTPS는 예외).',
  };
}
