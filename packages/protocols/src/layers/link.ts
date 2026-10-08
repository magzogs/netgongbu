import { tr } from '@netgongbu/schema';
import { BitWriter, crc32, hex } from '../bits';
import type { ByteSource } from '../model';
import { macBytes, macOf, type Values } from '../values';
import type { Encoded, EncodeContext } from './types';

const ETHERTYPES: Record<number, string> = { 0x0800: 'IPv4', 0x0806: 'ARP', 0x86dd: 'IPv6' };
const PLACEHOLDER_SRC = '02:00:00:00:00:01';
const PLACEHOLDER_DST = '02:00:00:00:00:02';
/** Shortest Ethernet frame without its FCS: shorter content is padded. */
const MIN_FRAME = 60;

/**
 * The frame check sequence: CRC-32 over everything before it, sent lowest byte first so the
 * receiver's CRC over the whole frame comes out at a fixed value.
 */
function fcs(trailer: BitWriter, ...covered: Uint8Array[]): void {
  const crc = crc32(...covered);
  trailer.bytes(Uint8Array.from([crc, crc >>> 8, crc >>> 16, crc >>> 24]), {
    key: 'fcs',
    name: 'Frame Check Sequence',
    value: hex(crc, 8),
    meaning: tr(
      '앞의 프레임 전체로 계산한 CRC-32. 받는 쪽 랜카드가 다시 계산해 다르면 프레임을 버립니다. 랜카드가 붙이고 떼므로 패킷 캡처에는 보통 보이지 않습니다.',
      "A CRC-32 computed over the whole frame before it. The receiving network card recomputes it and drops the frame if it differs. The card adds and strips it, so packet captures usually don't show it.",
    ),
    source: 'derived',
  });
}

function mac(
  values: Values,
  names: string[],
  fallback: string,
): { mac: string; source: ByteSource } {
  return macOf(values.get(...names)) ?? { mac: fallback, source: 'typical' };
}

/** Ethernet II (IEEE 802.3): the frame on a cable or after the access point. */
export function ethernet(values: Values, payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const dst = mac(values, ['dst', '목적지 MAC', 'destination MAC'], PLACEHOLDER_DST);
  const src = mac(values, ['src', '출발 MAC', 'source MAC'], PLACEHOLDER_SRC);
  w.bytes(macBytes(dst.mac), {
    key: 'dst',
    name: 'Destination MAC',
    value: dst.mac,
    meaning: tr(
      '이 구간에서 프레임을 받을 장비의 MAC 주소. IP 주소가 최종 목적지라면 MAC은 바로 다음 장비입니다.',
      'MAC address of the device that receives the frame on this link. The IP address is the final destination; the MAC is just the next device.',
    ),
    source: dst.source,
  });
  w.bytes(macBytes(src.mac), {
    key: 'src',
    name: 'Source MAC',
    value: src.mac,
    meaning: tr(
      '이 구간에서 프레임을 보낸 장비의 MAC 주소. 라우터를 지날 때마다 새로 쓰입니다.',
      'MAC address of the device that sent the frame on this link. It is rewritten at every router.',
    ),
    source: src.source,
  });
  w.uint(ctx.etherType, 16, {
    key: 'type',
    name: 'EtherType',
    value: `${hex(ctx.etherType, 4)} (${ETHERTYPES[ctx.etherType] ?? '?'})`,
    meaning: tr(
      '안에 무엇이 들어 있는지: 0x0800이면 IPv4 패킷입니다.',
      'What is inside: 0x0800 means an IPv4 packet.',
    ),
    source: 'derived',
  });
  const trailer = new BitWriter();
  const short = MIN_FRAME - w.byteLength - payload.length;
  const padding = new Uint8Array(Math.max(0, short));
  if (short > 0) {
    trailer.bytes(padding, {
      key: 'padding',
      name: 'Padding',
      value: tr(`${String(short)}바이트 (0)`, `${String(short)} bytes (0)`),
      meaning: tr(
        '이더넷 프레임은 FCS까지 최소 64바이트라야 해서, 내용이 짧으면 뒤를 0으로 채웁니다.',
        'An Ethernet frame must be at least 64 bytes including the FCS, so short content is padded with zeros.',
      ),
      source: 'spec',
    });
  }
  fcs(trailer, w.toBytes(), payload, padding);
  // Scenarios describe the provider's side of the link by the MAC the router uses there.
  const wan = values.get('MAC 주소', 'MAC address') !== undefined;
  return {
    kind: 'ethernet',
    title: 'Ethernet II',
    standard: 'IEEE 802.3',
    header: w,
    trailer,
    note: wan
      ? tr(
          '통신사 구간의 실제 2계층(광 회선의 GPON, PPPoE 등)은 측정할 수 없어 이더넷으로 보여 줍니다. MAC 주소는 라우터마다 새로 씁니다.',
          "The real layer 2 on the provider's link (GPON on fiber, PPPoE, etc.) can't be measured, so it is shown as Ethernet. Each router writes new MAC addresses.",
        )
      : tr(
          '선로에서는 이 프레임 앞에 프리앰블(7바이트)과 SFD(1바이트)가 붙습니다(물리 계층).',
          'On the wire, a preamble (7 bytes) and an SFD (1 byte) go in front of this frame (physical layer).',
        ),
  };
}

/** IEEE 802.11 data frame from a station to the access point, with the LLC/SNAP header. */
export function wifi(values: Values, payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const start = w.bitLength;
  w.uint(0, 4, {
    key: 'subtype',
    name: 'Subtype',
    value: '0 (Data)',
    meaning: tr('데이터 프레임의 세부 종류', 'Kind of data frame'),
    source: 'typical',
  });
  w.uint(2, 2, {
    key: 'ftype',
    name: 'Type',
    value: '2 (Data)',
    meaning: tr('0 관리, 1 제어, 2 데이터 프레임', '0 management, 1 control, 2 data frame'),
    source: 'spec',
  });
  w.uint(0, 2, {
    key: 'version',
    name: 'Protocol Version',
    value: '0',
    meaning: tr('항상 0', 'Always 0'),
    source: 'spec',
  });
  const flagsStart = w.bitLength;
  const flags: [string, string, number, string][] = [
    ['order', 'Order', 0, ''],
    [
      'protected',
      'Protected Frame',
      0,
      tr(
        '1이면 WPA2/WPA3로 암호화된 프레임(실제 무선 랜에서는 보통 1)',
        '1 if the frame is encrypted with WPA2/WPA3 (usually 1 on a real Wi-Fi network)',
      ),
    ],
    ['moredata', 'More Data', 0, ''],
    ['pwrmgt', 'Power Management', 0, ''],
    ['retry', 'Retry', 0, tr('재전송한 프레임이면 1', '1 if the frame is a retransmission')],
    ['morefrag', 'More Fragments', 0, ''],
    [
      'fromds',
      'From DS',
      0,
      tr(
        '분배 시스템(유선 쪽)에서 오는 프레임이면 1',
        '1 if the frame comes from the distribution system (the wired side)',
      ),
    ],
    [
      'tods',
      'To DS',
      1,
      tr(
        'AP를 거쳐 유선 쪽으로 가는 프레임이면 1',
        '1 if the frame goes through the AP to the wired side',
      ),
    ],
  ];
  for (const [key, name, value, meaning] of flags) {
    w.uint(value, 1, {
      key,
      name,
      value: String(value),
      meaning: meaning || name,
      source: key === 'tods' ? 'derived' : 'typical',
    });
  }
  w.group(
    {
      key: 'fc-flags',
      name: 'Flags',
      value: '0x01 (To DS)',
      meaning: tr('프레임 방향과 상태 비트', 'Frame direction and status bits'),
      source: 'derived',
    },
    flagsStart,
  );
  w.group(
    {
      key: 'fc',
      name: 'Frame Control',
      value: '0x0801',
      meaning: tr('프레임 종류와 방향', 'Frame type and direction'),
      source: 'derived',
    },
    start,
  );
  // 802.11 integers are little-endian.
  w.bytes(Uint8Array.from([0x2c, 0x00]), {
    key: 'duration',
    name: 'Duration/ID',
    value: '44 µs',
    meaning: tr(
      '이 교환이 끝날 때까지 다른 장비가 전송을 미룰 시간',
      'How long other devices hold off sending until this exchange ends',
    ),
    source: 'typical',
  });
  const a1 = mac(values, ['주소1 (AP)', 'Address 1 (AP)', 'bssid'], '02:00:00:00:00:0a');
  const a2 = mac(values, ['주소2 (보낸 쪽)', 'Address 2 (sender)', 'src'], PLACEHOLDER_SRC);
  const a3 = mac(values, ['주소3 (목적지)', 'Address 3 (destination)', 'dst'], PLACEHOLDER_DST);
  w.bytes(macBytes(a1.mac), {
    key: 'addr1',
    name: 'Address 1 (Receiver / BSSID)',
    value: a1.mac,
    meaning: tr(
      '전파를 받을 AP의 무선 MAC(BSSID)',
      'Wireless MAC (BSSID) of the AP receiving the signal',
    ),
    source: a1.source,
  });
  w.bytes(macBytes(a2.mac), {
    key: 'addr2',
    name: 'Address 2 (Transmitter)',
    value: a2.mac,
    meaning: tr('보낸 장비(노트북)의 MAC', 'MAC of the sending device (the laptop)'),
    source: a2.source,
  });
  w.bytes(macBytes(a3.mac), {
    key: 'addr3',
    name: 'Address 3 (Destination)',
    value: a3.mac,
    meaning: tr(
      'AP 너머 최종 목적지 MAC(여기서는 공유기의 유선 쪽)',
      "Final destination MAC beyond the AP (here, the router's wired side)",
    ),
    source: a3.source,
  });
  w.bytes(Uint8Array.from([0x10, 0x00]), {
    key: 'seq',
    name: 'Sequence Control',
    value: 'seq 1, frag 0',
    meaning: tr('중복 프레임을 걸러 내는 번호', 'Number used to filter out duplicate frames'),
    source: 'typical',
  });
  const llcStart = w.bitLength;
  w.bytes(Uint8Array.from([0xaa, 0xaa, 0x03, 0x00, 0x00, 0x00]), {
    key: 'llc',
    name: 'LLC/SNAP',
    value: 'AA AA 03 00 00 00',
    meaning: tr(
      '802.11 위에 이더넷 형식의 데이터를 싣는다는 표시',
      'Marks that Ethernet-style data is carried over 802.11',
    ),
    source: 'spec',
  });
  w.uint(ctx.etherType, 16, {
    key: 'type',
    name: 'EtherType',
    value: `${hex(ctx.etherType, 4)} (${ETHERTYPES[ctx.etherType] ?? '?'})`,
    meaning: tr('안에 들어 있는 프로토콜', 'Protocol carried inside'),
    source: 'derived',
  });
  w.group(
    {
      key: 'snap',
      name: tr('LLC/SNAP 헤더', 'LLC/SNAP header'),
      value: tr('8바이트', '8 bytes'),
      meaning: tr(
        '이더넷 프레임을 무선 프레임에 싣는 부분',
        'The part that carries an Ethernet frame inside a wireless frame',
      ),
      source: 'spec',
    },
    llcStart,
  );
  const trailer = new BitWriter();
  fcs(trailer, w.toBytes(), payload);
  return {
    kind: 'wifi',
    title: '802.11 (Wi-Fi)',
    standard: 'IEEE 802.11',
    header: w,
    trailer,
    note: tr(
      '실제 무선 구간은 WPA2/WPA3로 암호화되어 CCMP 헤더(8바이트)와 MIC(8바이트)가 더 붙고, 그 안의 내용은 전파를 엿들어도 보이지 않습니다. 여기서는 구조를 보이려고 생략했습니다.',
      'A real wireless link is encrypted with WPA2/WPA3, which adds a CCMP header (8 bytes) and a MIC (8 bytes), and the content cannot be read by eavesdropping on the radio. They are left out here to show the structure.',
    ),
  };
}
