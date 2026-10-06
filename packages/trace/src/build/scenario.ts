import {
  distanceKm,
  type Beat,
  type Hop as ScenarioHop,
  type Layer,
  type Protocol,
  type Scenario,
} from '@magvirtualedu/schema';
import { mainRequest, type CapturedRequest, type TraceReport } from '../report';
import { bytes, derived, layer, ms, observed, observedOr, typical } from './packets';
import { FIBER_KM_PER_MS } from './geocheck';
import { detectCdn, type BuiltTopology } from './topology';

/** Headers worth showing a learner (in this order); the rest are counted. */
const REQUEST_HEADERS = [
  ':method',
  ':path',
  ':authority',
  ':scheme',
  'host',
  'user-agent',
  'accept',
  'accept-language',
  'accept-encoding',
  'cookie',
];
const RESPONSE_HEADERS = [
  ':status',
  'content-type',
  'content-length',
  'content-encoding',
  'server',
  'cache-control',
  'age',
  'alt-svc',
  'strict-transport-security',
  'cf-cache-status',
  'x-cache',
  'set-cookie',
];
const INITIAL_TTL = 64;

function pick(headers: Record<string, string>, names: readonly string[]): Record<string, string> {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = lower.get(name);
    if (v !== undefined) out[name] = v.length > 80 ? `${v.slice(0, 77)}…` : v;
  }
  const rest = lower.size - Object.keys(out).length;
  if (rest > 0) out['(그 밖의 헤더)'] = `${String(rest)}개`;
  return out;
}

function httpLayer(
  fields: Record<string, string>,
  extra: Record<string, readonly [string, 'observed' | 'derived' | 'typical']> = {},
): Layer {
  const all: Record<string, readonly [string, 'observed' | 'derived' | 'typical']> = { ...extra };
  for (const [k, v] of Object.entries(fields)) all[k] = observed(v);
  return layer('HTTP', all);
}

interface Group {
  ids: string[];
  name: string | null;
}

/**
 * Internet hops grouped by operator (ASN). Hops without one (silent, or the ISP's internal
 * carrier-grade NAT addresses) join the group around them.
 */
function operatorGroups(built: BuiltTopology): Group[] {
  const groups: Group[] = [];
  for (const id of built.roles.internet) {
    const name = built.roles.hops.get(id)?.asn?.name ?? null;
    const last = groups.at(-1);
    if (last && (name === null || last.name === name || last.name === null)) {
      last.ids.push(id);
      last.name ??= name;
    } else {
      groups.push({ ids: [id], name });
    }
  }
  return groups;
}

export function buildScenario(report: TraceReport, built: BuiltTopology, id: string): Scenario {
  const r = built.roles;
  const local = report.local;
  const main = mainRequest(report);
  const beats: Beat[] = [];
  let n = 0;
  const beat = (
    narration: string,
    hops: ScenarioHop[] = [],
    nodeActions: Beat['nodeActions'] = [],
  ): void => {
    n += 1;
    beats.push({
      id: `b-${String(n)}`,
      narration,
      hops,
      ...(nodeActions.length > 0 && { nodeActions }),
    });
  };
  const hop = (
    path: string[],
    protocol: Protocol,
    summary: string,
    layers: Layer[],
  ): ScenarioHop => ({
    path,
    packet: { protocol, summary, layers },
  });

  if (!main) {
    beat(
      `${report.input}을(를) 불러오지 못했습니다. 브라우저가 서버에서 응답을 받지 못해 측정할 요청이 없습니다.`,
    );
    return {
      id,
      topologyId: built.topology.id,
      title: `${report.input} 접속 실패`,
      question: report.input,
      beats,
    };
  }

  const url = new URL(main.url);
  const host = url.hostname;
  const https = url.protocol === 'https:';
  const port = String(main.remotePort ?? (https ? 443 : 80));
  const serverIp = main.remoteIp ?? report.path.target ?? '서버 IP';
  const protocol = main.protocol ?? 'http/1.1';
  const quic = protocol === 'h3';
  const t = main.timing;
  const localIp = local.interface?.ipv4 ?? null;
  const localMac = local.interface?.mac ?? null;
  const gwIp = local.gateway?.ip ?? null;
  const gwMac = local.gateway?.mac ?? null;
  const wifi = local.interface?.kind === 'wifi';
  const dnsServer = report.dns?.server ?? local.dnsServers[0] ?? null;

  const internet = r.internet;
  const toServer = [r.stack, r.nic, r.router, r.modem, ...internet, r.server];
  const fromServer = [...toServer].reverse();

  const lanOut = (): Layer =>
    wifi
      ? layer('802.11 (Wi-Fi)', {
          '주소1 (AP)': typical('공유기의 무선 MAC'),
          '주소2 (보낸 쪽)': observedOr(localMac, '노트북 MAC'),
          '주소3 (목적지)': observedOr(gwMac, '공유기 MAC'),
        })
      : layer('Ethernet', {
          src: observedOr(localMac, '노트북 MAC'),
          dst: observedOr(gwMac, '공유기 MAC'),
          type: typical('IPv4 (0x0800)'),
        });
  const wan = (): Layer =>
    layer('L2 (통신사 구간)', { 'MAC 주소': typical('라우터를 지날 때마다 새로 씀') });
  const ipv4 = (
    src: readonly [string, 'observed' | 'derived' | 'typical'],
    dst: string,
    ttl: readonly [string, 'observed' | 'derived' | 'typical'],
  ): Layer =>
    layer('IPv4', {
      src,
      dst: observed(dst),
      ttl,
      protocol: typical(quic ? 'UDP (17)' : 'TCP (6)'),
    });
  const localSrc = observedOr(localIp, '노트북 사설 IP');
  const publicSrc = typical('공인 IP (NAT 후)');
  const tcp = (
    flags: string,
    extra: Record<string, readonly [string, 'observed' | 'derived' | 'typical']> = {},
  ): Layer =>
    layer('TCP', {
      srcPort: typical('임시 포트 (49152~65535)'),
      dstPort: observed(port),
      flags: observed(flags),
      ...extra,
    });

  // 1. Enter
  beat(
    `주소창에 "${report.input}"을(를) 입력하고 Enter를 눌렀습니다. 브라우저는 먼저 주소를 해석해 프로토콜(${url.protocol.replace(':', '')}), 호스트(${host}), 포트(${port}), 경로(${url.pathname})로 나눕니다.`,
    [],
    [
      {
        node: r.browser,
        text: `URL 해석: ${url.protocol}//${host}:${port}${url.pathname}`,
        kind: 'process',
      },
    ],
  );

  // 2. Redirects that happened before the final document.
  const chain = report.documentChain
    .map((cid) => report.requests.find((q) => q.id === cid))
    .filter((q): q is CapturedRequest => q !== undefined);
  for (const leg of chain) {
    if (!leg.redirectedTo) continue;
    if (leg.statusText === 'Internal Redirect') {
      const hsts = Object.entries(leg.responseHeaders).some(
        ([k, v]) => k.toLowerCase() === 'non-authoritative-reason' && v === 'HSTS',
      );
      beat(
        hsts
          ? `이 사이트는 HSTS(항상 HTTPS로만 접속하라는 약속)가 등록되어 있어서, 브라우저가 서버에 묻지도 않고 ${leg.url}을(를) ${leg.redirectedTo}(으)로 바꿉니다. 암호화되지 않은 요청은 아예 나가지 않습니다.`
          : `브라우저 내부 규칙에 따라 ${leg.url}이(가) ${leg.redirectedTo}(으)로 바뀝니다(네트워크로 나가지 않는 내부 리다이렉트).`,
        [],
        [
          {
            node: r.browser,
            text: hsts ? `HSTS: http → https (실측)` : `내부 리다이렉트 → ${leg.redirectedTo}`,
            kind: 'rewrite',
          },
        ],
      );
    } else {
      beat(
        `서버가 ${String(leg.status)} 응답으로 "${leg.redirectedTo}"(으)로 가라고 알려 줍니다(리다이렉트). 아래 과정은 최종 주소 ${main.url}에 대한 것입니다.`,
        [],
        [
          {
            node: r.browser,
            text: `${String(leg.status)} 리다이렉트 → ${leg.redirectedTo}`,
            kind: 'rewrite',
          },
        ],
      );
    }
  }

  // 3. Cache and connection reuse.
  if (main.fromCache) {
    beat(
      '이 페이지는 브라우저의 HTTP 캐시에 저장되어 있어서 네트워크로 요청하지 않고 바로 보여 줍니다.',
      [],
      [{ node: r.browser, text: 'HTTP 캐시 적중 (실측)', kind: 'lookup' }],
    );
    return finish();
  }
  if (main.connectionReused) {
    beat(
      `이 서버(${serverIp})와 이미 열려 있는 연결이 있어서 DNS 조회, TCP 연결, TLS 핸드셰이크를 모두 건너뛰고 바로 요청을 보냅니다.`,
      [],
      [
        {
          node: r.browser,
          text: `연결 재사용 #${String(main.connectionId ?? '')} (실측)`,
          kind: 'lookup',
        },
      ],
    );
  } else {
    dnsBeats();
    connectBeats();
    if (https && !quic) tlsBeats();
  }
  httpBeats();
  return finish();

  function dnsBeats(): void {
    const answer = report.dns;
    const addresses = answer?.addresses.map((a) => a.address) ?? [serverIp];
    if (t?.dnsMs === null || t?.dnsMs === undefined) {
      beat(
        `${host}의 IP 주소는 이미 캐시에 있어서 DNS 질의 없이 ${serverIp}을(를) 바로 씁니다(브라우저가 DNS 단계를 건너뜀 — 실측).`,
        [],
        [{ node: r.resolver, text: `DNS 캐시 적중: ${host} → ${serverIp}`, kind: 'lookup' }],
      );
      return;
    }
    beat(
      `브라우저가 운영체제에 "${host}의 IP 주소가 뭐지?"라고 묻습니다. 이름을 주소로 바꾸는 일은 OS의 DNS 리졸버가 맡습니다.`,
      [
        hop([r.browser, r.resolver], 'LOCAL', `getaddrinfo(${host})`, [
          layer('함수 호출', {
            함수: typical('getaddrinfo'),
            이름: observed(host),
            요청: typical('IPv4·IPv6 주소'),
          }),
        ]),
      ],
      [{ node: r.resolver, text: 'OS DNS 캐시 확인 → 없음, DNS 서버에 질의', kind: 'lookup' }],
    );
    const dnsTarget = dnsServer ?? 'DNS 서버';
    beat(
      `리졸버가 DNS 서버 ${dnsTarget}에 UDP 53번 포트로 질의를 보냅니다. 목적지 IP는 DNS 서버지만, 첫 구간의 목적지 MAC은 공유기입니다.`,
      [
        hop(r.dnsPath, 'DNS', `${host} A?`, [
          lanOut(),
          ipv4(localSrc, dnsTarget, typical(String(INITIAL_TTL))),
          layer('UDP', { srcPort: typical('임시 포트'), dstPort: typical('53') }),
          layer('DNS', { 질문: observed(`${host} A`), id: typical('임의의 16비트 값') }),
        ]),
      ],
      r.dnsPath.includes('n-dns')
        ? []
        : [
            {
              node: r.router,
              text: '공유기의 DNS 전달 기능이 통신사 DNS에 대신 물어봄',
              kind: 'process',
            },
          ],
    );
    const answerFields: Record<string, readonly [string, 'observed' | 'derived' | 'typical']> = {
      답: observed(addresses.join(', ')),
    };
    const ttl = answer?.addresses[0]?.ttl;
    if (ttl !== null && ttl !== undefined)
      answerFields.TTL = observed(`${String(ttl)}초 동안 캐시 가능`);
    if (answer && answer.cnames.length > 0)
      answerFields.CNAME = observed(answer.cnames.join(' → '));
    beat(
      `DNS 서버가 ${host} = ${addresses.join(', ')}이라고 답합니다. 브라우저가 실제로 기다린 DNS 시간은 ${ms(t.dnsMs)}입니다.`,
      [
        hop([...r.dnsPath].reverse(), 'DNS', `${host} = ${addresses[0] ?? serverIp}`, [
          layer('UDP', { srcPort: typical('53'), dstPort: typical('임시 포트') }),
          layer('DNS', answerFields),
        ]),
      ],
    );
    beat(
      `리졸버가 주소 목록을 브라우저에 돌려줍니다. 브라우저는 ${serverIp}에 연결하기로 합니다.`,
      [
        hop([r.resolver, r.browser], 'LOCAL', '주소 목록', [
          layer('함수 결과', { 주소: observed(addresses.join(', ')), 선택: observed(serverIp) }),
        ]),
      ],
    );
  }

  function connectBeats(): void {
    beat(
      `브라우저가 운영체제에 소켓을 열어 ${serverIp}:${port}에 연결해 달라고 요청합니다(${quic ? 'UDP 소켓, QUIC' : 'connect() 시스템 호출'}). 이제부터는 커널의 TCP/IP 스택이 패킷을 만듭니다.`,
      [
        hop(
          [r.browser, r.stack],
          'LOCAL',
          quic ? `sendto(${serverIp}:${port})` : `connect(${serverIp}:${port})`,
          [
            layer('시스템 호출', {
              호출: typical(quic ? 'sendto' : 'connect'),
              목적지: observed(`${serverIp}:${port}`),
            }),
          ],
        ),
      ],
    );
    beat(
      `커널은 목적지로 가는 길을 라우팅 테이블에서 찾고(기본 경로 → 게이트웨이 ${gwIp ?? '?'}), 게이트웨이의 MAC 주소를 ARP 캐시에서 찾습니다. 둘 다 이 컴퓨터에서 실제로 읽은 값입니다.`,
      [
        hop([r.stack, r.route], 'LOCAL', '경로 조회', [
          layer('조회', {
            목적지: observed(serverIp),
            결과: observedOr(local.defaultRoute, '기본 경로'),
          }),
        ]),
        hop([r.stack, r.arp], 'LOCAL', 'MAC 조회', [
          layer('조회', {
            IP: observedOr(gwIp, '게이트웨이'),
            MAC: observedOr(gwMac, '알 수 없음'),
          }),
        ]),
      ],
      [
        { node: r.route, text: local.defaultRoute ?? '기본 경로', kind: 'lookup' },
        { node: r.arp, text: `${gwIp ?? '?'} → ${gwMac ?? '?'}`, kind: 'lookup' },
      ],
    );

    const summary = quic ? 'QUIC Initial' : 'SYN';
    const transport = (
      ttl: readonly [string, 'observed' | 'derived' | 'typical'],
      src: readonly [string, 'observed' | 'derived' | 'typical'],
    ): Layer[] =>
      quic
        ? [
            ipv4(src, serverIp, ttl),
            layer('UDP', { srcPort: typical('임시 포트'), dstPort: observed(port) }),
            layer('QUIC', { 패킷: typical('Initial (ClientHello 포함)') }),
          ]
        : [ipv4(src, serverIp, ttl), tcp('SYN', { seq: typical('임의의 초기값') })];

    beat(
      quic
        ? `이 사이트는 HTTP/3를 써서 TCP 대신 UDP 위의 QUIC으로 연결합니다(실측 프로토콜 h3). 첫 패킷(Initial)에 TLS ClientHello까지 함께 담아 보냅니다.`
        : `TCP 연결의 첫 단계 SYN을 보냅니다. ${wifi ? 'Wi-Fi 프레임(802.11)은 주소 칸이 셋이라 AP·보낸 쪽·목적지를 따로 적습니다.' : '이더넷 프레임에 노트북과 공유기의 MAC 주소가 들어갑니다.'}`,
      [
        hop([r.stack, r.nic, r.router], quic ? 'QUIC' : 'TCP', summary, [
          lanOut(),
          ...transport(typical(String(INITIAL_TTL)), localSrc),
        ]),
      ],
    );

    // Across the internet, one beat per operator.
    let from = r.router;
    // The home router is the first to lower the TTL; then every internet router on the way.
    let passed = 1;
    const groups = operatorGroups(built);
    const segments: { path: string[]; name: string; last: string }[] = [];
    groups.forEach((g, i) => {
      const path = i === 0 ? [from, r.modem, ...g.ids] : [from, ...g.ids];
      segments.push({ path, name: g.name ?? '통신사', last: g.ids.at(-1) ?? from });
      from = g.ids.at(-1) ?? from;
    });
    segments.push({
      path: groups.length === 0 ? [r.router, r.modem, r.server] : [from, r.server],
      name: '목적지',
      last: r.server,
    });

    segments.forEach((seg, i) => {
      const lastHop = built.roles.hops.get(seg.last);
      passed += seg.path.slice(1).filter((nid) => internet.includes(nid)).length;
      const ttlLeft = derived(
        `${String(INITIAL_TTL)} − ${String(passed)} = ${String(INITIAL_TTL - passed)}`,
      );
      const where = lastHop?.geo?.place ? ` (${lastHop.geo.place})` : '';
      const rtt =
        lastHop?.rttMs !== null && lastHop?.rttMs !== undefined
          ? ` 여기까지 왕복 ${ms(lastHop.rttMs)}(traceroute 실측).`
          : '';
      // Distance of this segment: from where the previous one ended (or the learner's place).
      const prevGeo =
        i > 0
          ? built.roles.hops.get(segments[i - 1]?.last ?? '')?.geo
          : (report.origin ?? undefined);
      const km = prevGeo && lastHop?.geo ? distanceKm(prevGeo, lastHop.geo) : 0;
      const far =
        km > 1500
          ? ` 이 구간은 약 ${String(Math.round(km))} km라 빛이 광섬유로 가는 데만 편도 ${String(Math.round(km / FIBER_KM_PER_MS))} ms 이상 걸립니다.`
          : '';
      const anycast = built.roles.geoNotes.has(seg.last)
        ? ' 위치 데이터베이스가 말하는 곳은 측정한 왕복 시간으로 보면 불가능하게 멉니다 — 같은 주소를 여러 곳에서 쓰는 애니캐스트라 가까운 곳에서 응답했습니다.'
        : '';
      const actions: NonNullable<Beat['nodeActions']> = [];
      if (i === 0) {
        actions.push({
          node: r.router,
          text: `NAT: ${localIp ?? '사설 IP'} → 공인 IP`,
          kind: 'rewrite',
        });
        actions.push({ node: r.modem, text: '전기 신호 ↔ 광 신호 변환', kind: 'process' });
      }
      const text =
        seg.name === '목적지'
          ? `마지막 구간을 지나 ${host} 서버(${serverIp})${where}에 도착합니다.${rtt}${far}${anycast}`
          : i === 0
            ? `공유기가 NAT로 출발지를 공인 IP로 바꾸고, 모뎀을 거쳐 ${seg.name} 망으로 들어갑니다. 라우터 ${String(seg.path.length - 2)}개를 지납니다${where}.${rtt}${far}${anycast}`
            : `${seg.name} 망을 지납니다(라우터 ${String(seg.path.length - 1)}개)${where}.${rtt}${far}${anycast}`;
      beat(
        text,
        [hop(seg.path, quic ? 'QUIC' : 'TCP', summary, [wan(), ...transport(ttlLeft, publicSrc)])],
        actions,
      );
    });

    if (!quic) {
      beat(
        `서버가 SYN-ACK으로 답하고, 패킷은 같은 길을 거꾸로 돌아옵니다. 공유기는 NAT 표를 보고 노트북으로 되돌려 보냅니다.`,
        [
          hop(fromServer, 'TCP', 'SYN-ACK', [
            ipv4(observed(serverIp), localIp ?? '노트북', typical('서버가 정함')),
            tcp('SYN, ACK'),
          ]),
        ],
        [{ node: r.router, text: 'NAT 역변환: 공인 IP → 노트북', kind: 'rewrite' }],
      );
      beat(
        `노트북이 ACK을 보내면 TCP 3-way handshake가 끝납니다. 측정한 TCP 연결 시간은 ${ms(t?.connectMs)}입니다(왕복 1회).`,
        [
          hop(toServer, 'TCP', 'ACK', [
            ipv4(localSrc, serverIp, typical(String(INITIAL_TTL))),
            tcp('ACK'),
          ]),
        ],
      );
    } else {
      beat(
        `서버가 QUIC Handshake 패킷으로 ServerHello와 인증서를 돌려줍니다. QUIC은 연결과 암호화 협상을 한 번의 왕복에 끝냅니다.`,
        [
          hop(fromServer, 'QUIC', 'Handshake', [
            layer('QUIC', { 패킷: typical('Handshake (ServerHello, 인증서)') }),
            securityLayer('서버'),
          ]),
        ],
      );
    }
  }

  function securityLayer(side: '클라이언트' | '서버'): Layer {
    const s = main?.security;
    if (side === '클라이언트') {
      return layer('TLS', {
        메시지: typical('ClientHello'),
        SNI: observed(host),
        ALPN: typical('h2, http/1.1'),
        '키 교환 그룹': s ? observed(s.keyExchange || '알 수 없음') : typical('X25519'),
      });
    }
    return layer('TLS', {
      메시지: typical('ServerHello, Certificate, Finished'),
      버전: s ? observed(s.protocol) : typical('TLS 1.3'),
      암호: s ? observed(s.cipher) : typical('AES_128_GCM'),
      인증서: s ? observed(s.subject) : typical(host),
      발급자: s ? observed(s.issuer) : typical('인증기관'),
      ...(s?.validTo && { 만료: observed(s.validTo.slice(0, 10)) }),
    });
  }

  function tlsBeats(): void {
    beat(
      `이제 암호화 채널을 만듭니다. 브라우저가 ClientHello에 접속할 이름(SNI: ${host})과 지원하는 암호 방식, 키 교환 값을 담아 보냅니다.`,
      [
        hop(toServer, 'TLS', 'ClientHello', [
          ipv4(localSrc, serverIp, typical(String(INITIAL_TTL))),
          tcp('PSH, ACK'),
          securityLayer('클라이언트'),
        ]),
      ],
    );
    const s = main?.security;
    beat(
      s
        ? `서버가 ${s.protocol}로 응답하고 인증서(${s.subject}, 발급자 ${s.issuer})를 보냅니다. 브라우저가 인증서를 확인하고 세션 키를 계산합니다. TLS에 걸린 시간 ${ms(t?.tlsMs)}(실측).`
        : `서버가 ServerHello와 인증서를 보냅니다. 브라우저가 인증서를 확인하고 세션 키를 계산합니다.`,
      [
        hop(fromServer, 'TLS', 'ServerHello', [
          ipv4(observed(serverIp), localIp ?? '노트북', typical('서버가 정함')),
          tcp('ACK'),
          securityLayer('서버'),
        ]),
      ],
      [
        {
          node: r.browser,
          text: s ? `인증서 확인: ${s.subject} ← ${s.issuer}` : '인증서 확인',
          kind: 'process',
        },
      ],
    );
  }

  function httpBeats(): void {
    if (!main) return;
    const h2 = protocol === 'h2' || protocol === 'h3';
    const reqHeaders = pick(main.requestHeaders, REQUEST_HEADERS);
    const requestLine = h2
      ? `${main.method} ${url.pathname}${url.search} (${protocol} HEADERS 프레임)`
      : `${main.method} ${url.pathname}${url.search} HTTP/1.1`;
    beat(
      h2
        ? `브라우저가 HTTP 요청을 보냅니다. ${protocol === 'h3' ? 'HTTP/3' : 'HTTP/2'}에서는 요청이 이진 프레임(HEADERS)으로 바뀌고 헤더는 압축(${protocol === 'h3' ? 'QPACK' : 'HPACK'})되어 ${https ? '암호화된 TLS 안에' : ''} 담깁니다. 중간 라우터는 IP·포트만 볼 수 있습니다.`
        : `브라우저가 HTTP/1.1 요청을 텍스트로 보냅니다.${https ? ' TLS로 암호화되어 중간 라우터는 내용을 볼 수 없습니다.' : ' 암호화되지 않아 중간 장비도 내용을 볼 수 있습니다.'}`,
      [
        hop([r.browser, ...toServer], 'HTTP', `${main.method} ${url.pathname}`, [
          ipv4(localSrc, serverIp, typical(String(INITIAL_TTL))),
          ...(quic
            ? [
                layer('UDP', { dstPort: observed(port) }),
                layer('QUIC', { 스트림: typical('양방향 스트림 0') }),
              ]
            : [tcp('PSH, ACK')]),
          ...(https
            ? [
                layer('TLS', {
                  레코드: typical('Application Data'),
                  참고: typical('아래 내용은 암호화되어 있음'),
                }),
              ]
            : []),
          httpLayer(reqHeaders, { '요청 줄': observed(requestLine) }),
        ]),
      ],
    );
    const cdn = detectCdn(main.responseHeaders);
    beat(
      `서버가 요청을 처리합니다. 요청을 보낸 뒤 첫 응답 바이트가 올 때까지 ${ms(t?.waitMs)}(실측) 걸렸습니다.${cdn ? ` 응답 헤더로 보아 ${cdn}의 서버가 답했습니다.` : ''}`,
      [],
      [{ node: r.server, text: `응답 준비 (대기 ${ms(t?.waitMs)})`, kind: 'process' }],
    );
    const resHeaders = pick(main.responseHeaders, RESPONSE_HEADERS);
    beat(
      `응답 ${String(main.status ?? '')} ${main.statusText}이(가) 돌아옵니다. 압축된 크기 ${bytes(main.encodedBytes)}${t?.receiveMs !== null && t?.receiveMs !== undefined ? `, 받는 데 ${ms(t.receiveMs)}` : ''}.`,
      [
        hop(
          [...fromServer, r.browser],
          'HTTP',
          `${String(main.status ?? '')} ${main.statusText || 'OK'}`.trim(),
          [
            ipv4(observed(serverIp), localIp ?? '노트북', typical('서버가 정함')),
            ...(https ? [layer('TLS', { 레코드: typical('Application Data') })] : []),
            httpLayer(resHeaders, {
              상태: observed(`${String(main.status ?? '')} ${main.statusText}`.trim()),
            }),
          ],
        ),
      ],
    );
  }

  function finish(): Scenario {
    const sub = report.requests.filter((q) => !report.documentChain.includes(q.id));
    if (sub.length > 0 && main) {
      const reused = sub.filter((q) => q.connectionReused).length;
      const hosts = new Set(sub.map((q) => new URL(q.url).hostname));
      const types = new Map<string, number>();
      for (const q of sub) types.set(q.resourceType, (types.get(q.resourceType) ?? 0) + 1);
      const kinds = [...types].map(([k, v]) => `${k} ${String(v)}`).join(', ');
      beat(
        `브라우저가 HTML을 읽으며 필요한 파일을 추가로 요청합니다: ${String(sub.length)}개(${kinds}). 그중 ${String(reused)}개는 이미 열린 연결을 다시 썼고, 다른 서버는 ${String(hosts.size)}곳입니다.`,
        [],
        [
          {
            node: r.browser,
            text: `추가 요청 ${String(sub.length)}개 · 연결 재사용 ${String(reused)}개 (실측)`,
            kind: 'process',
          },
        ],
      );
    }
    beat(
      '브라우저가 받은 내용을 화면에 그립니다. 여기까지가 Enter를 누른 순간부터 페이지가 보이기까지 네트워크에서 일어난 일입니다.',
      [],
      [{ node: r.browser, text: '렌더링', kind: 'process' }],
    );
    const date = report.startedAt.slice(0, 16).replace('T', ' ');
    return {
      id,
      topologyId: built.topology.id,
      title: `${host} 접속 실측 (${date})`,
      question: report.input,
      beats,
    };
  }
}
