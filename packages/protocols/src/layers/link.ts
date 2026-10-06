import { BitWriter, hex } from '../bits';
import type { ByteSource } from '../model';
import { macBytes, macOf, type Values } from '../values';
import type { Encoded, EncodeContext } from './types';

const ETHERTYPES: Record<number, string> = { 0x0800: 'IPv4', 0x0806: 'ARP', 0x86dd: 'IPv6' };
const PLACEHOLDER_SRC = '02:00:00:00:00:01';
const PLACEHOLDER_DST = '02:00:00:00:00:02';

function mac(
  values: Values,
  names: string[],
  fallback: string,
): { mac: string; source: ByteSource } {
  return macOf(values.get(...names)) ?? { mac: fallback, source: 'typical' };
}

/** Ethernet II (IEEE 802.3): the frame on a cable or after the access point. */
export function ethernet(values: Values, _payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const dst = mac(values, ['dst', '목적지 MAC'], PLACEHOLDER_DST);
  const src = mac(values, ['src', '출발 MAC'], PLACEHOLDER_SRC);
  w.bytes(macBytes(dst.mac), {
    key: 'dst',
    name: 'Destination MAC',
    value: dst.mac,
    meaning:
      '이 구간에서 프레임을 받을 장비의 MAC 주소. IP 주소가 최종 목적지라면 MAC은 바로 다음 장비입니다.',
    source: dst.source,
  });
  w.bytes(macBytes(src.mac), {
    key: 'src',
    name: 'Source MAC',
    value: src.mac,
    meaning: '이 구간에서 프레임을 보낸 장비의 MAC 주소. 라우터를 지날 때마다 새로 쓰입니다.',
    source: src.source,
  });
  w.uint(ctx.etherType, 16, {
    key: 'type',
    name: 'EtherType',
    value: `${hex(ctx.etherType, 4)} (${ETHERTYPES[ctx.etherType] ?? '?'})`,
    meaning: '안에 무엇이 들어 있는지: 0x0800이면 IPv4 패킷입니다.',
    source: 'derived',
  });
  const wan = Object.keys(values.all).length === 0 || values.get('MAC 주소') !== undefined;
  return {
    kind: 'ethernet',
    title: 'Ethernet II',
    standard: 'IEEE 802.3',
    header: w,
    note: wan
      ? '통신사 구간의 실제 2계층(광 회선의 GPON, PPPoE 등)은 측정할 수 없어 이더넷으로 보여 줍니다. MAC 주소는 라우터마다 새로 씁니다.'
      : '맨 끝의 FCS(4바이트 오류 검사 값)는 랜카드가 붙이고 떼므로 여기에는 없습니다.',
  };
}

/** IEEE 802.11 data frame from a station to the access point, with the LLC/SNAP header. */
export function wifi(values: Values, _payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const start = w.bitLength;
  w.uint(0, 4, {
    key: 'subtype',
    name: 'Subtype',
    value: '0 (Data)',
    meaning: '데이터 프레임의 세부 종류',
    source: 'typical',
  });
  w.uint(2, 2, {
    key: 'ftype',
    name: 'Type',
    value: '2 (Data)',
    meaning: '0 관리, 1 제어, 2 데이터 프레임',
    source: 'spec',
  });
  w.uint(0, 2, {
    key: 'version',
    name: 'Protocol Version',
    value: '0',
    meaning: '항상 0',
    source: 'spec',
  });
  const flagsStart = w.bitLength;
  const flags: [string, string, number, string][] = [
    ['order', 'Order', 0, ''],
    [
      'protected',
      'Protected Frame',
      0,
      '1이면 WPA2/WPA3로 암호화된 프레임(실제 무선 랜에서는 보통 1)',
    ],
    ['moredata', 'More Data', 0, ''],
    ['pwrmgt', 'Power Management', 0, ''],
    ['retry', 'Retry', 0, '재전송한 프레임이면 1'],
    ['morefrag', 'More Fragments', 0, ''],
    ['fromds', 'From DS', 0, '분배 시스템(유선 쪽)에서 오는 프레임이면 1'],
    ['tods', 'To DS', 1, 'AP를 거쳐 유선 쪽으로 가는 프레임이면 1'],
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
      meaning: '프레임 방향과 상태 비트',
      source: 'derived',
    },
    flagsStart,
  );
  w.group(
    {
      key: 'fc',
      name: 'Frame Control',
      value: '0x0801',
      meaning: '프레임 종류와 방향',
      source: 'derived',
    },
    start,
  );
  // 802.11 integers are little-endian.
  w.bytes(Uint8Array.from([0x2c, 0x00]), {
    key: 'duration',
    name: 'Duration/ID',
    value: '44 µs',
    meaning: '이 교환이 끝날 때까지 다른 장비가 전송을 미룰 시간',
    source: 'typical',
  });
  const a1 = mac(values, ['주소1 (AP)', 'bssid'], '02:00:00:00:00:0a');
  const a2 = mac(values, ['주소2 (보낸 쪽)', 'src'], PLACEHOLDER_SRC);
  const a3 = mac(values, ['주소3 (목적지)', 'dst'], PLACEHOLDER_DST);
  w.bytes(macBytes(a1.mac), {
    key: 'addr1',
    name: 'Address 1 (Receiver / BSSID)',
    value: a1.mac,
    meaning: '전파를 받을 AP의 무선 MAC(BSSID)',
    source: a1.source,
  });
  w.bytes(macBytes(a2.mac), {
    key: 'addr2',
    name: 'Address 2 (Transmitter)',
    value: a2.mac,
    meaning: '보낸 장비(노트북)의 MAC',
    source: a2.source,
  });
  w.bytes(macBytes(a3.mac), {
    key: 'addr3',
    name: 'Address 3 (Destination)',
    value: a3.mac,
    meaning: 'AP 너머 최종 목적지 MAC(여기서는 공유기의 유선 쪽)',
    source: a3.source,
  });
  w.bytes(Uint8Array.from([0x10, 0x00]), {
    key: 'seq',
    name: 'Sequence Control',
    value: 'seq 1, frag 0',
    meaning: '중복 프레임을 걸러 내는 번호',
    source: 'typical',
  });
  const llcStart = w.bitLength;
  w.bytes(Uint8Array.from([0xaa, 0xaa, 0x03, 0x00, 0x00, 0x00]), {
    key: 'llc',
    name: 'LLC/SNAP',
    value: 'AA AA 03 00 00 00',
    meaning: '802.11 위에 이더넷 형식의 데이터를 싣는다는 표시',
    source: 'spec',
  });
  w.uint(ctx.etherType, 16, {
    key: 'type',
    name: 'EtherType',
    value: `${hex(ctx.etherType, 4)} (${ETHERTYPES[ctx.etherType] ?? '?'})`,
    meaning: '안에 들어 있는 프로토콜',
    source: 'derived',
  });
  w.group(
    {
      key: 'snap',
      name: 'LLC/SNAP 헤더',
      value: '8바이트',
      meaning: '이더넷 프레임을 무선 프레임에 싣는 부분',
      source: 'spec',
    },
    llcStart,
  );
  return {
    kind: 'wifi',
    title: '802.11 (Wi-Fi)',
    standard: 'IEEE 802.11',
    header: w,
    note: '실제 무선 구간은 WPA2/WPA3로 암호화되어 CCMP 헤더(8바이트)와 MIC(8바이트)가 더 붙고, 그 안의 내용은 전파를 엿들어도 보이지 않습니다. 여기서는 구조를 보이려고 생략했습니다.',
  };
}
