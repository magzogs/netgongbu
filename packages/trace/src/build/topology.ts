import {
  geoToPosition,
  surfacePatch,
  type Geo,
  type Globe,
  type NetLink,
  type NetNode,
  type Topology,
  type Vec3,
  type Zone,
} from '@netgongbu/schema';
import { isNonPublic } from '../ip';
import { checkGeo, implausibleNote } from './geocheck';
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
  /** Hops by node id (for RTT, ASN and place in narration); implausible places removed. */
  hops: ReadonlyMap<string, Hop>;
  /** Why a hop's database location was not used (node id → explanation). */
  geoNotes: ReadonlyMap<string, string>;
}

export interface BuiltTopology {
  topology: Topology;
  roles: Roles;
}

const GLOBE_RADIUS = 40;
/** Spacing of the parts inside the computer, so their labels do not overlap (flat layout). */
const DEVICE_SPREAD = 1.4;
/** Flat layout: internet hops snake in rows of this many. */
const ROW = 5;
const COL_GAP = 8;
const ROW_GAP = 9;
// On a globe the home lies on the learner's place and the computer right next to it (to the
// south, the bottom of the screen from above), both drawn small: a few tens of kilometres across,
// so they stay inside the learner's region. Lengths are along the surface, east (x) and south
// (z) of the learner's place, in globe units (about 160 km each).
/** Globe units per unit of the computer's own layout. */
const DEVICE_SCALE_GLOBE = 0.04;
/** The computer's layout area (its own units) and where its middle goes on a globe. */
const DEVICE_LAYOUT: Zone['bounds'] = [-7.5, -4.5, 5.5, 4.5];
const DEVICE_AT: readonly [number, number] = [-0.12, 0.38];
/** The home on a globe: router to the west and modem to the east of the learner's place. */
const HOME_BOUNDS_GLOBE: Zone['bounds'] = [-0.2, -0.1, 0.2, 0.1];
const HOME_NODE_X = 0.1;
/** Height of nodes and zones above the globe surface: just clear of it. */
const SURFACE_LIFT = 0.03;
/**
 * Nodes in one city are fanned out on rings this far apart (globe units, about 160 km each), so
 * they stay inside their region; the viewer draws them as small markers that separate as the
 * camera comes closer.
 */
const SAME_PLACE_RING = 0.3;
/** Internet nodes keep at least this far from the home and the computer (about 20 km). */
const INSET_CLEARANCE = 0.12;

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
    // "MERCURYNZ-AS-AP - Mercury NZ Limited" → "MERCURYNZ", "IP-Max - IP-Max SA" → "IP-Max".
    const asnName = hop.asn?.name.split(/\s/)[0]?.replace(/(-(AS|AP|ASN|NET))+$/, '');
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

/**
 * Two directions along the floor at `p`: the plane x/z, or on a globe the plane touching the
 * surface there (so a ring stays round wherever on the Earth it is).
 */
function floorAxes(p: Vec3, globe: Globe | null): [Vec3, Vec3] {
  if (!globe)
    return [
      [1, 0, 0],
      [0, 0, 1],
    ];
  const c = globe.center;
  const l = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) || 1;
  const up: Vec3 = [(p[0] - c[0]) / l, (p[1] - c[1]) / l, (p[2] - c[2]) / l];
  const ref: Vec3 = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const a: Vec3 = [
    ref[1] * up[2] - ref[2] * up[1],
    ref[2] * up[0] - ref[0] * up[2],
    ref[0] * up[1] - ref[1] * up[0],
  ];
  const la = Math.hypot(...a) || 1;
  const u: Vec3 = [a[0] / la, a[1] / la, a[2] / la];
  const v: Vec3 = [
    up[1] * u[2] - up[2] * u[1],
    up[2] * u[0] - up[0] * u[2],
    up[0] * u[1] - up[1] * u[0],
  ];
  return [u, v];
}

/** Places on rings round a spot (east, north offsets): 6 on the first ring, 12 on the next … */
function* ringSpots(): Generator<[number, number]> {
  for (let ring = 1; ring <= 12; ring++) {
    const count = 6 * ring;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      yield [Math.cos(angle) * ring * SAME_PLACE_RING, Math.sin(angle) * ring * SAME_PLACE_RING];
    }
  }
}

/**
 * Spreads nodes that would sit on top of each other (same city) on rings around their spot,
 * clear of `keepOut` (points covering the home and the computer).
 */
function spread(
  positions: Map<string, Vec3>,
  order: readonly string[],
  globe: Globe | null,
  keepOut: readonly Vec3[] = [],
): void {
  const placed: Vec3[] = [];
  const near = SAME_PLACE_RING * 0.8;
  const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const free = (c: Vec3): boolean =>
    !placed.some((q) => distance(q, c) < near) &&
    !keepOut.some((q) => distance(q, c) < INSET_CLEARANCE);
  for (const id of order) {
    const p = positions.get(id);
    if (!p) continue;
    const [u, v] = floorAxes(p, globe);
    let candidate = p;
    if (!free(candidate)) {
      for (const [du, dv] of ringSpots()) {
        candidate = [
          p[0] + u[0] * du + v[0] * dv,
          p[1] + u[1] * du + v[1] * dv,
          p[2] + u[2] * du + v[2] * dv,
        ];
        if (globe) {
          // Back onto the globe surface.
          const c = globe.center;
          const w: Vec3 = [candidate[0] - c[0], candidate[1] - c[1], candidate[2] - c[2]];
          const len = Math.hypot(...w) || 1;
          const r = globe.radius + SURFACE_LIFT;
          candidate = [c[0] + (w[0] / len) * r, c[1] + (w[1] / len) * r, c[2] + (w[2] / len) * r];
        }
        if (free(candidate)) break;
      }
    }
    positions.set(id, candidate);
    placed.push(candidate);
  }
}

/** Points every `step` over a zone's area, wrapped onto the globe by `place`. */
function areaPoints(
  place: (x: number, z: number) => Vec3,
  [minX, minZ, maxX, maxZ]: Zone['bounds'],
  step = 0.05,
): Vec3[] {
  const points: Vec3[] = [];
  for (let x = minX; x <= maxX + 1e-9; x += step) {
    for (let z = minZ; z <= maxZ + 1e-9; z += step) points.push(place(x, z));
  }
  return points;
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
      const r = globe.radius + SURFACE_LIFT;
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

  // Locations the measured round-trip time makes impossible (anycast, stale database) are not
  // used for placement; the node explains why instead.
  const geoNotes = new Map<string, string>();
  const vetted = (id: string, hop: Hop | null): Hop | null => {
    if (!hop?.geo) return hop;
    const verdict = checkGeo(report.origin, hop.geo, hop.rttMs);
    if (verdict.plausible || hop.rttMs === null) return hop;
    geoNotes.set(id, implausibleNote(hop.geo, hop.rttMs, verdict));
    return { ...hop, geo: null };
  };
  for (const e of entries) e.hop = vetted(e.id, e.hop);
  const serverHopVetted = vetted('n-server', serverHop);

  // Where things are on Earth decides between a globe and a flat layout.
  const geoOf = new Map<string, Geo>();
  for (const e of entries) if (e.hop?.geo) geoOf.set(e.id, e.hop.geo);
  if (serverHopVetted?.geo) geoOf.set('n-server', serverHopVetted.geo);
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
  // On a globe the home and the computer are small maps laid onto the surface at the learner's
  // place (both zones are anchored there; their bounds say where around it each one lies).
  const onPlace = globe ? surfacePatch(globe, globe.focus, SURFACE_LIFT).place : null;
  const [deviceX, deviceZ] = DEVICE_AT;
  const deviceBounds: Zone['bounds'] = [
    deviceX + DEVICE_LAYOUT[0] * DEVICE_SCALE_GLOBE,
    deviceZ + DEVICE_LAYOUT[1] * DEVICE_SCALE_GLOBE,
    deviceX + DEVICE_LAYOUT[2] * DEVICE_SCALE_GLOBE,
    deviceZ + DEVICE_LAYOUT[3] * DEVICE_SCALE_GLOBE,
  ];
  for (const [nid, type, label, [x, z], description] of device) {
    nodes.push({
      id: nid,
      type,
      label,
      pos: onPlace
        ? onPlace(deviceX + x * DEVICE_SCALE_GLOBE, deviceZ + z * DEVICE_SCALE_GLOBE)
        : [x * DEVICE_SPREAD - 30, 0, z * DEVICE_SPREAD],
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
  // Router towards the computer, modem towards the internet, so the chain does not fold back.
  const homeAt = (side: -1 | 1): Vec3 =>
    onPlace ? onPlace(side * HOME_NODE_X, 0) : [side * 2.5 - 12, 0, 0];
  nodes.push(
    {
      id: 'h-router',
      type: 'router',
      label: '공유기',
      pos: homeAt(-1),
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
      pos: homeAt(1),
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
      description: [hopDescription(e), geoNotes.get(e.id)].filter(Boolean).join(' '),
      ...(e.hop?.ip && { interfaces: [{ name: 'ip', ip: e.hop.ip }] }),
      ...(e.hop?.hostname && { hostname: e.hop.hostname }),
      ...(e.hop?.asn && { asn: { number: e.hop.asn.number, name: e.hop.asn.name } }),
      ...(e.hop?.geo && { geo: e.hop.geo }),
      ...(e.hop?.rttMs !== null && e.hop?.rttMs !== undefined && { rttMs: e.hop.rttMs }),
    });
  }
  if (serverHopVetted) hops.set('n-server', serverHopVetted);
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
      geoNotes.get('n-server') ?? '',
    ]
      .filter(Boolean)
      .join(' '),
    ...(target && { interfaces: [{ name: 'ip', ip: target }] }),
    ...(serverHopVetted?.geo && { geo: serverHopVetted.geo }),
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
      if (g) positions.set(nid, geoToPosition(globe, g.lat, g.lon, SURFACE_LIFT));
    }
    fillGaps(
      positions,
      order,
      geoToPosition(globe, globe.focus.lat, globe.focus.lon, SURFACE_LIFT),
      globe,
    );
    // Routers in the learner's own city make way for the home and the computer.
    const keepOut = onPlace
      ? [...areaPoints(onPlace, deviceBounds), ...areaPoints(onPlace, HOME_BOUNDS_GLOBE)]
      : [];
    spread(positions, order, globe, keepOut);
    const anchor = { lat: globe.focus.lat, lon: globe.focus.lon };
    zones = [
      {
        id: 'z-device',
        label: '노트북 내부',
        color: '#c2410c',
        bounds: deviceBounds,
        elevation: SURFACE_LIFT,
        anchor,
      },
      {
        id: 'z-home',
        label: '집',
        color: '#2f6f4f',
        bounds: HOME_BOUNDS_GLOBE,
        elevation: SURFACE_LIFT,
        anchor,
      },
    ];
  } else {
    // Rows of ROW hops, alternating direction, so long paths stay compact.
    const chainOrder = order.filter((nid) => nid !== 'n-dns');
    chainOrder.forEach((nid, i) => {
      const row = Math.floor(i / ROW);
      const col = i % ROW;
      positions.set(nid, [(row % 2 === 0 ? col : ROW - 1 - col) * COL_GAP, 0, row * ROW_GAP]);
    });
    const hasDns = order.includes('n-dns');
    if (hasDns) positions.set('n-dns', [0, 0, -ROW_GAP]);
    const rows = Math.ceil(chainOrder.length / ROW);
    const width = (Math.min(chainOrder.length, ROW) - 1) * COL_GAP;
    zones = [
      { id: 'z-device', label: '노트북 내부', color: '#c2410c', bounds: [-42, -7, -21.5, 7] },
      { id: 'z-home', label: '집', color: '#2f6f4f', bounds: [-17.5, -2.5, -6.5, 2.5] },
      {
        id: 'z-internet',
        label: '인터넷 (위치 정보 없음)',
        color: '#5c5470',
        bounds: [-3, hasDns ? -ROW_GAP - 3 : -3.5, width + 3, (rows - 1) * ROW_GAP + 3.5],
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
      geoNotes,
    },
  };
}
