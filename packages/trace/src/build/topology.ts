import {
  geoToPosition,
  type Geo,
  type Globe,
  type NetLink,
  type NetNode,
  type Topology,
  type Vec3,
  type Zone,
} from '@magvirtualedu/schema';
import { isNonPublic } from '../ip';
import { mainRequest, type Hop, type TraceReport } from '../report';

/** Node ids the scenario builder needs, in travel order where it matters. */
export interface Roles {
  browser: string;
  resolver: string;
  stack: string;
  route: string;
  arp: string;
  nic: string;
  router: string;
  modem: string;
  /** Internet nodes between the modem and the server, in path order. */
  internet: string[];
  server: string;
  /** Node the DNS question ends at, and the path to it from the resolver. */
  dnsPath: string[];
  /** Hops by node id (for RTT, ASN and place in narration). */
  hops: ReadonlyMap<string, Hop>;
}

export interface BuiltTopology {
  topology: Topology;
  roles: Roles;
}

const GLOBE_RADIUS = 40;
// On a globe the computer and the home float above the globe, in front of (south of) the
// learner's place so they do not hide the hops there when seen from above.
const DEVICE_ELEVATION = 14;
const DEVICE_SOUTH = 18;
const HOME_ELEVATION = 7;
const HOME_SOUTH = 9;

/** Well-known response headers that reveal a CDN in front of the origin. */
const CDN_MARKERS: readonly [header: string, name: string][] = [
  ['cf-ray', 'Cloudflare'],
  ['x-amz-cf-id', 'Amazon CloudFront'],
  ['x-served-by', 'Fastly'],
  ['x-akamai-transformed', 'Akamai'],
  ['x-azure-ref', 'Azure Front Door'],
];

export function detectCdn(headers: Record<string, string>): string | null {
  const names = new Set(Object.keys(headers).map((h) => h.toLowerCase()));
  for (const [header, name] of CDN_MARKERS) if (names.has(header)) return name;
  const server = Object.entries(headers).find(([h]) => h.toLowerCase() === 'server')?.[1] ?? '';
  if (/cloudflare/i.test(server)) return 'Cloudflare';
  if (/akamai/i.test(server)) return 'Akamai';
  return null;
}

interface PathEntry {
  id: string;
  hop: Hop | null;
  label: string;
  silentCount: number;
}

/** Internet hops after the home router; runs of silent hops become one entry. */
function internetPath(
  report: TraceReport,
  gatewayIp: string | null,
  target: string | null,
): {
  entries: PathEntry[];
  serverHop: Hop | null;
} {
  const hops = [...report.path.hops].sort((a, b) => a.ttl - b.ttl);
  const entries: PathEntry[] = [];
  let serverHop: Hop | null = null;
  for (const hop of hops) {
    if (hop.ttl === 1 && hop.ip !== null && hop.ip === gatewayIp) continue;
    if (hop.ip !== null && hop.ip === target) {
      serverHop = hop;
      break;
    }
    const last = entries.at(-1);
    if (hop.ip === null && last?.hop === null) {
      last.silentCount += 1;
      last.label = `응답 없음 #${String(Number(last.id.split('-').pop()))}–${String(hop.ttl)}`;
      continue;
    }
    const asnName = hop.asn?.name.split(/[\s-]/)[0];
    entries.push({
      id: `n-hop-${String(hop.ttl)}`,
      hop: hop.ip === null ? null : hop,
      label:
        hop.ip === null
          ? `응답 없음 #${String(hop.ttl)}`
          : `${asnName ?? '라우터'} #${String(hop.ttl)}`,
      silentCount: hop.ip === null ? 1 : 0,
    });
  }
  return { entries, serverHop };
}

function hopDescription(entry: PathEntry): string {
  if (!entry.hop) {
    return entry.silentCount > 1
      ? `라우터 ${String(entry.silentCount)}개가 traceroute에 응답하지 않았습니다(ICMP 응답을 막거나 줄이는 설정). 패킷 자체는 정상적으로 지나갑니다.`
      : '이 라우터는 traceroute에 응답하지 않았습니다(ICMP 응답을 막거나 줄이는 설정). 패킷 자체는 정상적으로 지나갑니다.';
  }
  const parts = [`traceroute ${String(entry.hop.ttl)}번째 홉`];
  if (entry.hop.ip && isNonPublic(entry.hop.ip)) {
    parts.push('통신사 내부 주소(공인 IP가 아님)라 위치와 소유자를 알 수 없습니다');
  }
  return `${parts.join('. ')}.`;
}

/** Spreads nodes that would sit on top of each other (same city) around their spot. */
function spread(positions: Map<string, Vec3>, order: readonly string[], globe: Globe | null): void {
  const placed: Vec3[] = [];
  for (const id of order) {
    const p = positions.get(id);
    if (!p) continue;
    let k = 0;
    let candidate = p;
    while (
      placed.some(
        (q) => Math.hypot(q[0] - candidate[0], q[1] - candidate[1], q[2] - candidate[2]) < 1.8,
      )
    ) {
      k += 1;
      const angle = (k * Math.PI) / 3;
      const ring = 2 * Math.ceil(k / 6);
      candidate = [p[0] + Math.cos(angle) * ring, p[1], p[2] + Math.sin(angle) * ring];
      if (globe) {
        // Back onto the globe surface.
        const c = globe.center;
        const v: Vec3 = [candidate[0] - c[0], candidate[1] - c[1], candidate[2] - c[2]];
        const len = Math.hypot(...v) || 1;
        const r = globe.radius + 0.3;
        candidate = [c[0] + (v[0] / len) * r, c[1] + (v[1] / len) * r, c[2] + (v[2] / len) * r];
      }
    }
    positions.set(id, candidate);
    placed.push(candidate);
  }
}

/** Positions for internet nodes without a location: between their located neighbours. */
function fillGaps(
  positions: Map<string, Vec3>,
  order: readonly string[],
  anchor: Vec3,
  globe: Globe | null,
): void {
  for (let i = 0; i < order.length; i++) {
    const id = order[i] ?? '';
    if (positions.has(id)) continue;
    let prev = anchor;
    for (let j = i - 1; j >= 0; j--) {
      const p = positions.get(order[j] ?? '');
      if (p) {
        prev = p;
        break;
      }
    }
    let next: Vec3 | undefined;
    let steps = 1;
    for (let j = i + 1; j < order.length; j++, steps++) {
      const p = positions.get(order[j] ?? '');
      if (p) {
        next = p;
        break;
      }
    }
    const t = next ? 1 / (steps + 1) : 0;
    const target = next ?? prev;
    let p: Vec3 = [
      prev[0] + (target[0] - prev[0]) * t,
      prev[1] + (target[1] - prev[1]) * t,
      prev[2] + (target[2] - prev[2]) * t,
    ];
    if (globe) {
      const c = globe.center;
      const v: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      const len = Math.hypot(...v) || 1;
      const r = globe.radius + 0.3;
      p = [c[0] + (v[0] / len) * r, c[1] + (v[1] / len) * r, c[2] + (v[2] / len) * r];
    }
    positions.set(id, p);
  }
}

export function buildTopology(report: TraceReport, id: string): BuiltTopology {
  const local = report.local;
  const main = mainRequest(report);
  const gatewayIp = local.gateway?.ip ?? null;
  const target = main?.remoteIp ?? report.path.target;
  const { entries, serverHop } = internetPath(report, gatewayIp, target);
  const host = main ? new URL(main.url).hostname : report.input;
  const cdn = main ? detectCdn(main.responseHeaders) : null;
  const wifi = local.interface?.kind === 'wifi';

  // Where things are on Earth decides between a globe and a flat layout.
  const geoOf = new Map<string, Geo>();
  for (const e of entries) if (e.hop?.geo) geoOf.set(e.id, e.hop.geo);
  if (serverHop?.geo) geoOf.set('n-server', serverHop.geo);
  const focus = report.origin ?? [...geoOf.values()][0] ?? null;
  const globe: Globe | null =
    focus && geoOf.size > 0
      ? {
          center: [0, -GLOBE_RADIUS, 0],
          radius: GLOBE_RADIUS,
          focus: { lat: focus.lat, lon: focus.lon },
        }
      : null;

  const dnsServer = report.dns?.server ?? local.dnsServers[0] ?? null;
  const dnsIsRouter = dnsServer !== null && dnsServer === gatewayIp;
  const dnsIsLocalStub = dnsServer !== null && /^(127\.|::1$)/.test(dnsServer);

  const nodes: NetNode[] = [];
  const links: NetLink[] = [];
  const link = (a: string, b: string, medium: NetLink['medium']): void => {
    links.push({ id: `l-${a}--${b}`, a, b, medium });
  };

  // Inside the computer (positions relative to the cluster; placed below).
  const device: [string, NetNode['type'], string, [number, number], string][] = [
    ['d-browser', 'browser', '브라우저', [-7, 0], report.userAgent],
    [
      'd-resolver',
      'os',
      'OS DNS 리졸버',
      [-4, -3.5],
      `운영체제가 이름을 주소로 바꾸는 부분. 설정된 DNS 서버: ${local.dnsServers.join(', ') || '알 수 없음'}`,
    ],
    [
      'd-stack',
      'os',
      'TCP/IP 스택',
      [-1.5, 0],
      '커널 안의 네트워크 구현: 소켓, 포트 할당, TCP 세그먼트와 IP 패킷 조립',
    ],
    [
      'd-route',
      'os',
      '라우팅 테이블',
      [1.5, -3.5],
      local.defaultRoute ?? '기본 경로를 읽지 못했습니다',
    ],
    [
      'd-arp',
      'os',
      'ARP 캐시',
      [1.5, 3.5],
      local.gateway?.mac
        ? `${local.gateway.ip} → ${local.gateway.mac}`
        : '게이트웨이의 MAC 주소를 읽지 못했습니다',
    ],
    [
      'd-nic',
      'nic',
      wifi ? `Wi-Fi (${local.interface?.name ?? '?'})` : `이더넷 (${local.interface?.name ?? '?'})`,
      [4.5, 0],
      wifi
        ? '무선 랜카드: 프레임을 802.11 형식으로 전파에 실어 보냅니다'
        : '유선 랜카드: 이더넷 프레임을 케이블로 보냅니다',
    ],
  ];
  const dx = globe ? 0 : -22;
  const dz = globe ? DEVICE_SOUTH : 0;
  const deviceY = globe ? DEVICE_ELEVATION : 0;
  for (const [nid, type, label, [x, z], description] of device) {
    nodes.push({
      id: nid,
      type,
      label,
      pos: [x + dx, deviceY, z + dz],
      zone: 'z-device',
      description,
    });
  }
  const nic = nodes.find((n) => n.id === 'd-nic');
  if (nic && local.interface) {
    nic.interfaces = [
      {
        name: local.interface.name,
        ...(local.interface.ipv4 && { ip: local.interface.ipv4 }),
        ...(local.interface.mac && { mac: local.interface.mac }),
      },
    ];
  }
  link('d-browser', 'd-resolver', 'virtual');
  link('d-browser', 'd-stack', 'virtual');
  link('d-resolver', 'd-stack', 'virtual');
  link('d-stack', 'd-route', 'virtual');
  link('d-stack', 'd-arp', 'virtual');
  link('d-stack', 'd-nic', 'virtual');

  // Home: router (observed gateway) and the modem traceroute cannot see.
  const homeY = globe ? HOME_ELEVATION : 0;
  const hx = globe ? 0 : -8;
  const hz = globe ? HOME_SOUTH : 0;
  nodes.push(
    {
      id: 'h-router',
      type: 'router',
      label: '공유기',
      pos: [hx + 2.5, homeY, hz],
      zone: 'z-home',
      description: '기본 게이트웨이. 집 안의 사설 IP를 공인 IP로 바꾸는 NAT도 합니다.',
      ...(local.gateway && {
        interfaces: [
          {
            name: 'lan',
            ip: local.gateway.ip,
            ...(local.gateway.mac && { mac: local.gateway.mac }),
          },
        ],
      }),
    },
    {
      id: 'h-modem',
      type: 'modem',
      label: '모뎀 / ONT',
      pos: [hx - 2.5, homeY, hz],
      zone: 'z-home',
      source: 'typical',
      description:
        '통신사 회선(광케이블·동축)의 신호를 이더넷으로 바꾸는 장비. IP 라우터가 아니라서 traceroute에 나타나지 않습니다. 공유기와 한 기기인 경우도 많습니다.',
    },
  );
  link('d-nic', 'h-router', wifi ? 'wifi' : 'ethernet');
  link('h-router', 'h-modem', 'ethernet');

  // Internet: hops, then the server.
  const hops = new Map<string, Hop>();
  const internetIds = entries.map((e) => e.id);
  for (const e of entries) {
    if (e.hop) hops.set(e.id, e.hop);
    nodes.push({
      id: e.id,
      type: 'hop',
      label: e.label,
      pos: [0, 0, 0],
      description: hopDescription(e),
      ...(e.hop?.ip && { interfaces: [{ name: 'ip', ip: e.hop.ip }] }),
      ...(e.hop?.hostname && { hostname: e.hop.hostname }),
      ...(e.hop?.asn && { asn: { number: e.hop.asn.number, name: e.hop.asn.name } }),
      ...(e.hop?.geo && { geo: e.hop.geo }),
      ...(e.hop?.rttMs !== null && e.hop?.rttMs !== undefined && { rttMs: e.hop.rttMs }),
    });
  }
  if (serverHop) hops.set('n-server', serverHop);
  nodes.push({
    id: 'n-server',
    type: cdn ? 'cdn' : 'server',
    label: cdn ? `${host} (${cdn})` : host,
    pos: [0, 0, 0],
    description: [
      `페이지를 보낸 서버${target ? ` ${target}` : ''}.`,
      main?.protocol ? `프로토콜 ${main.protocol}.` : '',
      cdn ? `응답 헤더로 보아 ${cdn} CDN의 서버입니다.` : '',
      report.path.complete ? '' : 'traceroute가 이 서버까지 닿지 못해 마지막 구간은 추정입니다.',
    ]
      .filter(Boolean)
      .join(' '),
    ...(target && { interfaces: [{ name: 'ip', ip: target }] }),
    ...(serverHop?.geo && { geo: serverHop.geo }),
    ...(serverHop?.rttMs !== null && serverHop?.rttMs !== undefined && { rttMs: serverHop.rttMs }),
    ...(serverHop?.asn && { asn: { number: serverHop.asn.number, name: serverHop.asn.name } }),
    ...(serverHop?.hostname && { hostname: serverHop.hostname }),
  });
  const chain = ['h-modem', ...internetIds, 'n-server'];
  for (let i = 1; i < chain.length; i++) {
    link(chain[i - 1] ?? '', chain[i] ?? '', i === 1 ? 'fiber' : 'internet');
  }

  // DNS: the router (a forwarder), a separate server in the LAN, or one on the internet.
  let dnsPath: string[];
  if (dnsIsRouter) {
    dnsPath = ['d-resolver', 'd-stack', 'd-nic', 'h-router'];
  } else {
    const inLan = dnsServer !== null && !dnsIsLocalStub && isNonPublic(dnsServer);
    const attach = inLan ? 'h-router' : (internetIds[0] ?? 'h-modem');
    nodes.push({
      id: 'n-dns',
      type: 'dns',
      label: dnsIsLocalStub || !dnsServer ? 'DNS 서버 (추정)' : `DNS ${dnsServer}`,
      pos: [0, 0, 0],
      description: dnsIsLocalStub
        ? `운영체제의 로컬 DNS 중계(${dnsServer})가 실제로 묻는 상위 DNS 서버. 주소는 측정하지 못했습니다.`
        : `노트북에 설정된 DNS 서버${dnsServer ? ` ${dnsServer}` : ''}.`,
      ...(dnsServer && !dnsIsLocalStub && { interfaces: [{ name: 'ip', ip: dnsServer }] }),
      ...((dnsIsLocalStub || !dnsServer) && { source: 'typical' as const }),
    });
    link(attach, 'n-dns', inLan ? 'ethernet' : 'internet');
    const base = ['d-resolver', 'd-stack', 'd-nic', 'h-router'];
    if (inLan) dnsPath = [...base, 'n-dns'];
    else if (attach === 'h-modem') dnsPath = [...base, 'h-modem', 'n-dns'];
    else dnsPath = [...base, 'h-modem', attach, 'n-dns'];
  }

  // Positions of internet nodes.
  const order = [
    ...internetIds,
    'n-server',
    ...(nodes.some((n) => n.id === 'n-dns') ? ['n-dns'] : []),
  ];
  const positions = new Map<string, Vec3>();
  let zones: Zone[];
  if (globe) {
    for (const nid of order) {
      const g = geoOf.get(nid);
      if (g) positions.set(nid, geoToPosition(globe, g.lat, g.lon, 0.3));
    }
    fillGaps(positions, order, geoToPosition(globe, globe.focus.lat, globe.focus.lon, 0.3), globe);
    spread(positions, order, globe);
    zones = [
      {
        id: 'z-device',
        label: '노트북 내부',
        color: '#2563eb',
        bounds: [-9, DEVICE_SOUTH - 5.5, 6.5, DEVICE_SOUTH + 5.5],
        elevation: DEVICE_ELEVATION,
      },
      {
        id: 'z-home',
        label: '집',
        color: '#2f6f4f',
        bounds: [-4.5, HOME_SOUTH - 2.5, 4.5, HOME_SOUTH + 2.5],
        elevation: HOME_ELEVATION,
      },
    ];
  } else {
    order.forEach((nid, i) => {
      positions.set(nid, nid === 'n-dns' ? [4, 0, -8] : [4 + i * 5, 0, 0]);
    });
    zones = [
      { id: 'z-device', label: '노트북 내부', color: '#2563eb', bounds: [-31, -5.5, -15.5, 5.5] },
      { id: 'z-home', label: '집', color: '#2f6f4f', bounds: [-13, -2.5, -3.5, 2.5] },
      {
        id: 'z-internet',
        label: '인터넷 (위치 정보 없음)',
        color: '#5c5470',
        bounds: [1, -10.5, 7 + (order.length - 1) * 5, 3],
      },
    ];
    for (const n of nodes) if (order.includes(n.id)) n.zone = 'z-internet';
  }
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (p) n.pos = p;
  }

  const topology: Topology = {
    id,
    title: `${host} 가는 길 (실측)`,
    description: `${report.input}을(를) 열 때 이 컴퓨터에서 측정한 경로`,
    ...(globe && { globe }),
    zones,
    nodes,
    links,
  };
  return {
    topology,
    roles: {
      browser: 'd-browser',
      resolver: 'd-resolver',
      stack: 'd-stack',
      route: 'd-route',
      arp: 'd-arp',
      nic: 'd-nic',
      router: 'h-router',
      modem: 'h-modem',
      internet: internetIds,
      server: 'n-server',
      dnsPath,
      hops,
    },
  };
}
