import { tr } from '@netgongbu/schema';
import { ascii, BitWriter, filler, hex } from '../bits';
import type { ByteSource } from '../model';
import type { Values } from '../values';
import type { Encoded, EncodeContext } from './types';

/** TLS 1.3 cipher suites (RFC 8446 Appendix B.4) by the names Chromium reports. */
const SUITES: Record<string, number> = {
  AES_128_GCM: 0x1301,
  AES_256_GCM: 0x1302,
  CHACHA20_POLY1305: 0x1303,
};
const CLIENT_SUITES = [0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f, 0xc02c, 0xc030, 0xcca9, 0xcca8];

/** Named groups (RFC 8446 §4.2.7, plus the hybrid post-quantum group browsers send now). */
interface Group {
  id: number;
  name: string;
  clientKey: number;
  serverKey: number;
}
const MLKEM: Group = { id: 0x11ec, name: 'X25519MLKEM768', clientKey: 1216, serverKey: 1120 };
const X25519: Group = { id: 0x001d, name: 'x25519', clientKey: 32, serverKey: 32 };

function groupOf(values: Values): { group: Group; source: ByteSource } {
  const given = values.get('키 교환 그룹', 'key exchange group', 'keyShare', 'keyExchange');
  if (given && /mlkem/i.test(given.text)) return { group: MLKEM, source: given.source };
  return { group: X25519, source: given?.source ?? 'typical' };
}

/** Writes `body` behind a length field of `bits` bits and fills the length in afterwards. */
function withLength(
  w: BitWriter,
  bits: 8 | 16 | 24,
  info: { key: string; name: string; meaning: string },
  body: () => void,
): void {
  const at = w.byteLength;
  const start = w.bitLength;
  w.uint(0, bits);
  body();
  const length = w.byteLength - at - bits / 8;
  if (bits === 24) w.patch24(at, length);
  else if (bits === 16) w.patch16(at, length);
  else w.patch8(at, length);
  w.group(
    {
      key: info.key,
      name: info.name,
      value: tr(`${String(length)}바이트`, `${String(length)} bytes`),
      meaning: info.meaning,
      source: 'derived',
    },
    start,
  );
}

function recordHeader(
  w: BitWriter,
  type: number,
  typeName: string,
  version: number,
  length: number,
): void {
  w.uint(type, 8, {
    key: 'rec-type',
    name: 'Content Type',
    value: `${String(type)} (${typeName})`,
    meaning: tr(
      '22 핸드셰이크, 23 암호화된 데이터, 20 ChangeCipherSpec',
      '22 handshake, 23 encrypted data, 20 ChangeCipherSpec',
    ),
    source: 'spec',
  });
  w.uint(version, 16, {
    key: 'rec-version',
    name: 'Legacy Version',
    value: hex(version, 4),
    meaning: tr(
      '옛 장비와의 호환을 위한 고정값 (실제 버전은 확장에서 협상)',
      'Fixed value for compatibility with old devices (the real version is negotiated in an extension)',
    ),
    source: 'spec',
  });
  w.uint(length, 16, {
    key: 'rec-length',
    name: 'Length',
    value: tr(`${String(length)}바이트`, `${String(length)} bytes`),
    meaning: tr('레코드 내용 길이', 'Length of the record content'),
    source: 'derived',
  });
}

function extension(
  w: BitWriter,
  type: number,
  name: string,
  meaning: string,
  source: ByteSource,
  body: () => void,
): void {
  const start = w.bitLength;
  w.uint(type, 16);
  const at = w.byteLength;
  w.uint(0, 16);
  body();
  w.patch16(at, w.byteLength - at - 2);
  w.group(
    {
      key: `ext-${String(type)}`,
      name,
      value: tr(
        `${hex(type, 4)} · ${String(w.byteLength - at - 2)}바이트`,
        `${hex(type, 4)} · ${String(w.byteLength - at - 2)} bytes`,
      ),
      meaning,
      source,
    },
    start,
  );
}

function clientHello(values: Values, ctx: EncodeContext): BitWriter {
  const host = values.get('SNI', 'sni')?.text ?? ctx.host ?? 'example.com';
  const sniSource: ByteSource = values.get('SNI', 'sni')?.source ?? 'typical';
  const { group, source: groupSource } = groupOf(values);
  const alpn = ctx.http === 'h2' || ctx.http === 'h3' ? ['h2', 'http/1.1'] : ['http/1.1'];
  const b = new BitWriter();
  b.uint(1, 8, {
    key: 'hs-type',
    name: 'Handshake Type',
    value: '1 (ClientHello)',
    meaning: tr('클라이언트의 첫 인사', "The client's opening hello"),
    source: 'spec',
  });
  withLength(
    b,
    24,
    {
      key: 'hs-body',
      name: 'ClientHello',
      meaning: tr(
        '지원하는 버전·암호·확장을 서버에 알림',
        'Tells the server the versions, ciphers and extensions it supports',
      ),
    },
    () => {
      b.uint(0x0303, 16, {
        key: 'legacy-version',
        name: 'Legacy Version',
        value: tr('0x0303 (TLS 1.2로 표시)', '0x0303 (labeled TLS 1.2)'),
        meaning: tr(
          'TLS 1.3은 호환을 위해 1.2라고 적고, 실제 버전은 supported_versions 확장으로 알림',
          'TLS 1.3 writes 1.2 here for compatibility and announces the real version in the supported_versions extension',
        ),
        source: 'spec',
      });
      b.bytes(filler(32, 11), {
        key: 'random',
        name: 'Random',
        value: tr('32바이트 무작위 값', '32 random bytes'),
        meaning: tr('세션 키 계산에 쓰이는 난수', 'Random value used to compute the session keys'),
        source: 'typical',
      });
      b.uint(32, 8);
      b.bytes(filler(32, 12), {
        key: 'session-id',
        name: 'Legacy Session ID',
        value: tr('32바이트', '32 bytes'),
        meaning: tr('중간 장비 호환을 위한 값', 'Value for compatibility with middleboxes'),
        source: 'typical',
      });
      b.uint(CLIENT_SUITES.length * 2, 16);
      const suites = Uint8Array.from(CLIENT_SUITES.flatMap((s) => [s >> 8, s & 0xff]));
      b.bytes(suites, {
        key: 'suites',
        name: 'Cipher Suites',
        value: tr(
          `${String(CLIENT_SUITES.length)}개 (TLS_AES_128_GCM_SHA256 …)`,
          `${String(CLIENT_SUITES.length)} (TLS_AES_128_GCM_SHA256 …)`,
        ),
        meaning: tr(
          '쓸 수 있는 암호 방식 목록(선호 순)',
          'Cipher suites it can use (in order of preference)',
        ),
        source: 'typical',
      });
      b.uint(1, 8);
      b.uint(0, 8, {
        key: 'compression',
        name: 'Compression',
        value: tr('0 (없음)', '0 (none)'),
        meaning: tr('TLS 1.3에서는 압축을 쓰지 않음', 'TLS 1.3 does not use compression'),
        source: 'spec',
      });
      withLength(
        b,
        16,
        {
          key: 'extensions',
          name: 'Extensions',
          meaning: tr(
            '확장: 이름, 버전, 프로토콜, 키 등',
            'Extensions: name, version, protocol, key, etc.',
          ),
        },
        () => {
          extension(
            b,
            0x0000,
            `server_name (SNI): ${host}`,
            tr(
              '접속하려는 사이트 이름. 암호화 전이라 경로의 장비가 볼 수 있습니다',
              'Name of the site being visited. Sent before encryption, so devices on the path can see it',
            ),
            sniSource,
            () => {
              const name = ascii(host);
              b.uint(name.length + 3, 16);
              b.uint(0, 8);
              b.uint(name.length, 16);
              b.bytes(name);
            },
          );
          extension(
            b,
            0x000a,
            `supported_groups: ${group.name}, x25519, secp256r1`,
            tr('키 교환에 쓸 수 있는 방식', 'Methods it can use for key exchange'),
            'typical',
            () => {
              const ids = [group.id, 0x001d, 0x0017].filter((v, i, all) => all.indexOf(v) === i);
              b.uint(ids.length * 2, 16);
              for (const id of ids) b.uint(id, 16);
            },
          );
          extension(
            b,
            0x0010,
            `ALPN: ${alpn.join(', ')}`,
            tr(
              'TLS 위에서 쓸 프로토콜 제안 (h2 = HTTP/2)',
              'Proposes the protocol to use over TLS (h2 = HTTP/2)',
            ),
            'typical',
            () => {
              const list = alpn.flatMap((p) => [p.length, ...ascii(p)]);
              b.uint(list.length, 16);
              b.bytes(Uint8Array.from(list));
            },
          );
          extension(
            b,
            0x002b,
            'supported_versions: TLS 1.3, TLS 1.2',
            tr('실제로 지원하는 버전', 'Versions it actually supports'),
            'typical',
            () => {
              b.uint(4, 8);
              b.uint(0x0304, 16);
              b.uint(0x0303, 16);
            },
          );
          extension(
            b,
            0x000d,
            'signature_algorithms',
            tr('인증서 서명 검증 방식', 'Methods for verifying certificate signatures'),
            'typical',
            () => {
              const algs = [0x0403, 0x0804, 0x0401, 0x0503, 0x0805, 0x0501, 0x0806, 0x0601];
              b.uint(algs.length * 2, 16);
              for (const a of algs) b.uint(a, 16);
            },
          );
          extension(
            b,
            0x0033,
            tr(
              `key_share: ${group.name} (${String(group.clientKey)}바이트)`,
              `key_share: ${group.name} (${String(group.clientKey)} bytes)`,
            ),
            tr(
              '키 교환용 공개키. 양자 내성 혼합 방식(ML-KEM)은 키가 커서 ClientHello가 1,500바이트를 넘기도 합니다',
              'Public key for the key exchange. Post-quantum hybrid schemes (ML-KEM) have large keys, so the ClientHello can exceed 1,500 bytes',
            ),
            groupSource,
            () => {
              b.uint(group.clientKey + 4, 16);
              b.uint(group.id, 16);
              b.uint(group.clientKey, 16);
              b.bytes(filler(group.clientKey, 13));
            },
          );
        },
      );
    },
  );
  return b;
}

function serverHello(values: Values): BitWriter {
  const cipherGiven = values.get('암호', 'cipher');
  const suite =
    Object.entries(SUITES).find(([name]) => cipherGiven?.text.includes(name))?.[1] ?? 0x1301;
  const { group, source: groupSource } = groupOf(values);
  const b = new BitWriter();
  b.uint(2, 8, {
    key: 'hs-type',
    name: 'Handshake Type',
    value: '2 (ServerHello)',
    meaning: tr('서버의 응답 인사', "The server's reply hello"),
    source: 'spec',
  });
  withLength(
    b,
    24,
    {
      key: 'hs-body',
      name: 'ServerHello',
      meaning: tr(
        '고른 버전·암호와 서버의 키',
        "The chosen version and cipher, and the server's key",
      ),
    },
    () => {
      b.uint(0x0303, 16, {
        key: 'legacy-version',
        name: 'Legacy Version',
        value: '0x0303',
        meaning: tr('호환용 고정값', 'Fixed value for compatibility'),
        source: 'spec',
      });
      b.bytes(filler(32, 21), {
        key: 'random',
        name: 'Random',
        value: tr('32바이트 무작위 값', '32 random bytes'),
        meaning: tr('서버 난수', "The server's random value"),
        source: 'typical',
      });
      b.uint(32, 8);
      b.bytes(filler(32, 12), {
        key: 'session-id',
        name: 'Legacy Session ID Echo',
        value: tr('클라이언트 값 그대로', "Same as the client's"),
        meaning: tr('받은 값을 그대로 돌려줌', 'Echoes back the received value'),
        source: 'typical',
      });
      b.uint(suite, 16, {
        key: 'suite',
        name: 'Cipher Suite',
        value: `${hex(suite, 4)} (${cipherGiven?.text ?? 'AES_128_GCM'})`,
        meaning: tr('서버가 고른 암호 방식', 'Cipher suite the server chose'),
        source: cipherGiven?.source ?? 'typical',
      });
      b.uint(0, 8, {
        key: 'compression',
        name: 'Compression',
        value: '0',
        meaning: tr('없음', 'None'),
        source: 'spec',
      });
      withLength(
        b,
        16,
        {
          key: 'extensions',
          name: 'Extensions',
          meaning: tr('고른 버전과 서버의 키', "The chosen version and the server's key"),
        },
        () => {
          extension(
            b,
            0x002b,
            'supported_versions: TLS 1.3',
            tr('실제로 고른 버전', 'The version actually chosen'),
            values.get('버전', 'version')?.source ?? 'typical',
            () => {
              b.uint(0x0304, 16);
            },
          );
          extension(
            b,
            0x0033,
            tr(
              `key_share: ${group.name} (${String(group.serverKey)}바이트)`,
              `key_share: ${group.name} (${String(group.serverKey)} bytes)`,
            ),
            tr(
              '서버의 키. 이것으로 양쪽이 같은 세션 키를 계산합니다',
              "The server's key. With it, both sides compute the same session keys",
            ),
            groupSource,
            () => {
              b.uint(group.id, 16);
              b.uint(group.serverKey, 16);
              b.bytes(filler(group.serverKey, 23));
            },
          );
        },
      );
    },
  );
  return b;
}

/**
 * TLS 1.3 (RFC 8446) records. ClientHello and ServerHello travel in plaintext; everything after
 * (certificate included) is encrypted. Application data (e.g. HTTP) becomes an encrypted record
 * whose plaintext is shown separately.
 */
export function tls(values: Values, payload: Uint8Array, ctx: EncodeContext): Encoded {
  const message = values.get('메시지', 'message', 'type', '레코드', 'record')?.text ?? '';
  const w = new BitWriter();
  if (/ClientHello/i.test(message)) {
    const hello = clientHello(values, ctx);
    recordHeader(w, 22, 'Handshake', 0x0301, hello.byteLength);
    const start = w.bitLength;
    w.bytes(hello.toBytes());
    shiftInto(w, hello, start);
    return {
      kind: 'tls',
      title: 'TLS 1.3 ClientHello',
      standard: 'RFC 8446',
      header: w,
      note: tr(
        '암호화되기 전이라 접속할 사이트 이름(SNI)과 제안한 암호 방식을 경로의 장비가 볼 수 있습니다(ECH를 쓰면 SNI도 가려짐).',
        'This is before encryption, so devices on the path can see the site name (SNI) and the proposed ciphers (ECH hides the SNI too).',
      ),
    };
  }
  if (/ServerHello/i.test(message)) {
    const hello = serverHello(values);
    recordHeader(w, 22, 'Handshake', 0x0303, hello.byteLength);
    const start = w.bitLength;
    w.bytes(hello.toBytes());
    shiftInto(w, hello, start);
    w.bytes(Uint8Array.from([20, 0x03, 0x03, 0, 1, 1]), {
      key: 'ccs',
      name: tr('ChangeCipherSpec 레코드', 'ChangeCipherSpec record'),
      value: tr('6바이트', '6 bytes'),
      meaning: tr(
        'TLS 1.3에서는 의미 없는 호환용 레코드',
        'A compatibility record with no meaning in TLS 1.3',
      ),
      source: 'spec',
    });
    const cert = values.get('인증서', 'certificate');
    const issuer = values.get('발급자', 'issuer');
    const encrypted = 1100;
    const encStart = w.bitLength;
    w.uint(23, 8);
    w.uint(0x0303, 16);
    w.uint(encrypted, 16);
    w.bytes(filler(encrypted, 31));
    w.record(
      {
        key: 'encrypted-hs',
        name: tr('암호화된 핸드셰이크', 'Encrypted handshake'),
        value: tr(
          `${String(encrypted + 5)}바이트 (EncryptedExtensions, Certificate, CertificateVerify, Finished)`,
          `${String(encrypted + 5)} bytes (EncryptedExtensions, Certificate, CertificateVerify, Finished)`,
        ),
        meaning: tr(
          `TLS 1.3에서는 인증서도 암호화되어 경로의 장비가 볼 수 없습니다.${cert ? ` 브라우저가 풀어 본 인증서: ${cert.text}${issuer ? `, 발급자 ${issuer.text}` : ''}.` : ''} 길이는 대표값입니다.`,
          `In TLS 1.3 even the certificate is encrypted, so devices on the path cannot see it.${cert ? ` Certificate the browser decrypted: ${cert.text}${issuer ? `, issued by ${issuer.text}` : ''}.` : ''} The length is a typical value.`,
        ),
        source: cert?.source ?? 'typical',
      },
      encStart,
    );
    return {
      kind: 'tls',
      title: tr(
        'TLS 1.3 ServerHello + 암호화된 핸드셰이크',
        'TLS 1.3 ServerHello + encrypted handshake',
      ),
      standard: 'RFC 8446',
      header: w,
    };
  }
  // Application data: the payload (inner plaintext) is replaced on the wire by ciphertext.
  const ciphertext = filler(payload.length + 1 + 16, 41);
  recordHeader(w, 23, 'Application Data', 0x0303, ciphertext.length);
  return {
    kind: 'tls',
    title: 'TLS 1.3 Application Data',
    standard: 'RFC 8446',
    header: w,
    ciphertext,
    note: tr(
      `안쪽 내용 ${String(payload.length)}바이트가 암호화되고, 내용 종류 1바이트와 인증 태그 16바이트가 붙습니다. 경로의 장비는 길이 말고는 아무것도 알 수 없습니다.`,
      `The ${String(payload.length)} bytes inside are encrypted, plus a 1-byte content type and a 16-byte authentication tag. Devices on the path learn nothing but the length.`,
    ),
  };
}

/** Moves fields recorded in `inner` into `w`, shifted to where its bytes were written. */
function shiftInto(w: BitWriter, inner: BitWriter, start: number): void {
  const shift = (f: (typeof inner.fields)[number]): (typeof inner.fields)[number] => ({
    ...f,
    bitOffset: f.bitOffset + start,
    ...(f.children && { children: f.children.map(shift) }),
  });
  for (const f of inner.fields) w.fields.push(shift(f));
}

/** QUIC (RFC 9000): an Initial packet with the long header, or a 1-RTT packet with the short one. */
export function quic(values: Values, payload: Uint8Array): Encoded {
  const w = new BitWriter();
  const initial = /initial/i.test(values.get('패킷', 'packet')?.text ?? '');
  const dcid = filler(8, 51);
  if (initial) {
    const body = Math.max(1200 - 40, payload.length + 16);
    w.uint(1, 1, {
      key: 'form',
      name: 'Header Form',
      value: '1 (long)',
      meaning: tr(
        '긴 헤더: 연결을 여는 동안 씀',
        'Long header: used while the connection is being set up',
      ),
      source: 'spec',
    });
    w.uint(1, 1, {
      key: 'fixed',
      name: 'Fixed Bit',
      value: '1',
      meaning: tr('항상 1', 'Always 1'),
      source: 'spec',
    });
    w.uint(0, 2, {
      key: 'ptype',
      name: 'Long Packet Type',
      value: '0 (Initial)',
      meaning: tr('첫 패킷', 'First packet'),
      source: 'derived',
    });
    w.uint(0, 4, {
      key: 'reserved',
      name: 'Reserved / PN Length',
      value: '0',
      meaning: tr('헤더 보호로 가려지는 비트', 'Bits hidden by header protection'),
      source: 'typical',
    });
    w.uint(1, 32, {
      key: 'version',
      name: 'Version',
      value: '0x00000001 (QUIC v1)',
      meaning: tr('QUIC 버전', 'QUIC version'),
      source: 'spec',
    });
    w.uint(8, 8, {
      key: 'dcil',
      name: 'DCID Length',
      value: '8',
      meaning: tr('연결 ID 길이', 'Connection ID length'),
      source: 'typical',
    });
    w.bytes(dcid, {
      key: 'dcid',
      name: 'Destination Connection ID',
      value: tr('8바이트', '8 bytes'),
      meaning: tr(
        'IP·포트가 바뀌어도 연결을 이어 주는 번호',
        'Number that keeps the connection going even if the IP or port changes',
      ),
      source: 'typical',
    });
    w.uint(0, 8, { key: 'scil', name: 'SCID Length', value: '0', meaning: '', source: 'typical' });
    w.uint(0, 8, {
      key: 'token',
      name: 'Token Length',
      value: '0',
      meaning: tr('재시도 토큰 없음', 'No retry token'),
      source: 'typical',
    });
    w.uint(0x4000 | (body + 1), 16, {
      key: 'length',
      name: 'Length (varint)',
      value: tr(`${String(body + 1)}바이트`, `${String(body + 1)} bytes`),
      meaning: tr(
        '패킷 번호와 암호화된 내용의 길이',
        'Length of the packet number and encrypted content',
      ),
      source: 'derived',
    });
    w.uint(0, 8, {
      key: 'pn',
      name: 'Packet Number',
      value: '0',
      meaning: tr('패킷 번호(헤더 보호로 가려짐)', 'Packet number (hidden by header protection)'),
      source: 'typical',
    });
    w.bytes(filler(body, 61), {
      key: 'payload',
      name: tr('암호화된 내용', 'Encrypted content'),
      value: tr(`${String(body)}바이트`, `${String(body)} bytes`),
      meaning: tr(
        'CRYPTO 프레임에 TLS ClientHello가 들어 있고, Initial 키로 암호화됩니다. 첫 패킷은 1200바이트 이상으로 채웁니다',
        'A CRYPTO frame carries the TLS ClientHello, encrypted with the Initial keys. The first packet is padded to at least 1200 bytes',
      ),
      source: 'typical',
    });
    return {
      kind: 'quic',
      title: 'QUIC Initial',
      standard: 'RFC 9000 · RFC 9001',
      header: w,
      note: tr(
        'QUIC은 TCP 대신 UDP 위에서 연결·암호화·재전송을 모두 맡습니다. TLS 1.3 핸드셰이크가 QUIC 안에 들어갑니다.',
        'QUIC runs over UDP instead of TCP and handles connections, encryption and retransmission itself. The TLS 1.3 handshake goes inside QUIC.',
      ),
    };
  }
  w.uint(0, 1, {
    key: 'form',
    name: 'Header Form',
    value: '0 (short)',
    meaning: tr('짧은 헤더: 연결이 열린 뒤', 'Short header: after the connection is open'),
    source: 'spec',
  });
  w.uint(1, 1, {
    key: 'fixed',
    name: 'Fixed Bit',
    value: '1',
    meaning: tr('항상 1', 'Always 1'),
    source: 'spec',
  });
  w.uint(0, 6, {
    key: 'bits',
    name: 'Spin / Key Phase / PN Length',
    value: '',
    meaning: tr('헤더 보호로 가려지는 비트', 'Bits hidden by header protection'),
    source: 'typical',
  });
  w.bytes(dcid, {
    key: 'dcid',
    name: 'Destination Connection ID',
    value: tr('8바이트', '8 bytes'),
    meaning: tr('연결 ID', 'Connection ID'),
    source: 'typical',
  });
  w.uint(7, 8, {
    key: 'pn',
    name: 'Packet Number',
    value: '7',
    meaning: tr('패킷 번호', 'Packet number'),
    source: 'typical',
  });
  return {
    kind: 'quic',
    title: 'QUIC 1-RTT',
    standard: 'RFC 9000',
    header: w,
    ciphertext: filler(payload.length + 16, 71),
    note: tr(
      'HTTP/3 요청은 QUIC 스트림에 실려 암호화됩니다. 헤더는 QPACK(RFC 9204)으로 압축됩니다.',
      'HTTP/3 requests travel encrypted in QUIC streams. Headers are compressed with QPACK (RFC 9204).',
    ),
  };
}
