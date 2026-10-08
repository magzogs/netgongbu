import { tr } from '@netgongbu/schema';
import { BitWriter, filler, hex, internetChecksum } from '../bits';
import { ipBytes, ipv4Of, macBytes, macOf, numberOf, type Values } from '../values';
import type { Encoded, EncodeContext } from './types';

const PROTOCOL_NAMES: Record<number, string> = { 1: 'ICMP', 6: 'TCP', 17: 'UDP' };

/** IPv4 header (RFC 791) with its real header checksum. */
export function ipv4(values: Values, payload: Uint8Array, ctx: EncodeContext): Encoded {
  const w = new BitWriter();
  const ttl = numberOf(values.get('ttl')) ?? { n: 64, source: 'typical' as const };
  const src = ipv4Of(values.get('src')) ?? { ip: ctx.srcIp, source: 'typical' as const };
  const dst = ipv4Of(values.get('dst')) ?? { ip: ctx.dstIp, source: 'typical' as const };
  const total = 20 + payload.length;

  w.uint(4, 4, {
    key: 'version',
    name: 'Version',
    value: '4',
    meaning: tr('IP 버전', 'IP version'),
    source: 'spec',
  });
  w.uint(5, 4, {
    key: 'ihl',
    name: 'IHL',
    value: tr('5 (20바이트)', '5 (20 bytes)'),
    meaning: tr(
      '헤더 길이(4바이트 단위). 옵션이 없으면 5',
      'Header length in 4-byte units. 5 when there are no options',
    ),
    source: 'derived',
  });
  w.uint(0, 6, {
    key: 'dscp',
    name: 'DSCP',
    value: '0',
    meaning: tr('서비스 품질 등급(보통 0)', 'Quality of service class (usually 0)'),
    source: 'typical',
  });
  w.uint(0, 2, {
    key: 'ecn',
    name: 'ECN',
    value: '0',
    meaning: tr('혼잡 알림', 'Congestion notification'),
    source: 'typical',
  });
  w.uint(total, 16, {
    key: 'length',
    name: 'Total Length',
    value: tr(`${String(total)}바이트`, `${String(total)} bytes`),
    meaning: tr('IP 헤더와 그 안의 내용을 합친 길이', 'Length of the IP header plus its content'),
    source: 'derived',
  });
  w.uint(0x1c46, 16, {
    key: 'id',
    name: 'Identification',
    value: hex(0x1c46, 4),
    meaning: tr(
      '조각난 패킷을 다시 맞출 때 쓰는 번호',
      'Number used to reassemble fragmented packets',
    ),
    source: 'typical',
  });
  const flagStart = w.bitLength;
  w.uint(0, 1, {
    key: 'reserved',
    name: 'Reserved',
    value: '0',
    meaning: tr('항상 0', 'Always 0'),
    source: 'spec',
  });
  w.uint(1, 1, {
    key: 'df',
    name: "Don't Fragment",
    value: '1',
    meaning: tr(
      '중간에서 쪼개지 말 것(경로 MTU 탐색)',
      'Do not split along the way (path MTU discovery)',
    ),
    source: 'typical',
  });
  w.uint(0, 1, {
    key: 'mf',
    name: 'More Fragments',
    value: '0',
    meaning: tr('뒤에 조각이 더 있으면 1', '1 if more fragments follow'),
    source: 'typical',
  });
  w.group(
    {
      key: 'flags',
      name: 'Flags',
      value: 'DF',
      meaning: tr('조각화 관련 비트', 'Fragmentation bits'),
      source: 'typical',
    },
    flagStart,
  );
  w.uint(0, 13, {
    key: 'frag',
    name: 'Fragment Offset',
    value: '0',
    meaning: tr('조각의 위치', 'Position of the fragment'),
    source: 'typical',
  });
  w.uint(ttl.n, 8, {
    key: 'ttl',
    name: 'Time To Live',
    value: String(ttl.n),
    meaning: tr(
      '라우터를 지날 때마다 1씩 줄고, 0이 되면 버려집니다(traceroute가 이 성질을 씁니다)',
      'Decreases by 1 at every router; the packet is dropped at 0 (traceroute relies on this)',
    ),
    source: ttl.source,
  });
  w.uint(ctx.ipProtocol, 8, {
    key: 'protocol',
    name: 'Protocol',
    value: `${String(ctx.ipProtocol)} (${PROTOCOL_NAMES[ctx.ipProtocol] ?? '?'})`,
    meaning: tr('안에 실린 프로토콜 번호', 'Number of the protocol carried inside'),
    source: 'derived',
  });
  const checksumAt = w.byteLength;
  w.uint(0, 16, {
    key: 'checksum',
    name: 'Header Checksum',
    value: '',
    meaning: tr(
      'IP 헤더가 깨지지 않았는지 확인하는 값. TTL이 바뀌므로 라우터마다 다시 계산합니다',
      'Checks that the IP header is not corrupted. Recomputed at every router because the TTL changes',
    ),
    source: 'derived',
  });
  w.bytes(ipBytes(src.ip), {
    key: 'src',
    name: 'Source Address',
    value: src.ip,
    meaning: tr('보낸 쪽 IP', "Sender's IP"),
    source: src.source,
  });
  w.bytes(ipBytes(dst.ip), {
    key: 'dst',
    name: 'Destination Address',
    value: dst.ip,
    meaning: tr(
      '최종 목적지 IP. 구간이 바뀌어도 그대로입니다(NAT를 빼면)',
      'Final destination IP. Stays the same on every link (except through NAT)',
    ),
    source: dst.source,
  });

  const checksum = internetChecksum(w.toBytes());
  w.patch16(checksumAt, checksum);
  const field = w.fields.find((f) => f.key === 'checksum');
  if (field) field.value = hex(checksum, 4);
  return { kind: 'ipv4', title: 'IPv4', standard: 'RFC 791', header: w };
}

/** ARP request or reply (RFC 826) for IPv4 over Ethernet. */
export function arp(values: Values): Encoded {
  const w = new BitWriter();
  const reply = /reply|응답/i.test(values.get('op')?.text ?? '');
  const senderIp = ipv4Of(values.get('sender')) ?? {
    ip: '192.168.0.10',
    source: 'typical' as const,
  };
  const targetIp = ipv4Of(values.get('target')) ?? {
    ip: '192.168.0.1',
    source: 'typical' as const,
  };
  const senderMac = macOf(values.get('sender')) ?? {
    mac: '02:00:00:00:00:01',
    source: 'typical' as const,
  };
  w.uint(1, 16, {
    key: 'htype',
    name: 'Hardware Type',
    value: '1 (Ethernet)',
    meaning: tr('링크 종류', 'Link type'),
    source: 'spec',
  });
  w.uint(0x0800, 16, {
    key: 'ptype',
    name: 'Protocol Type',
    value: '0x0800 (IPv4)',
    meaning: tr('찾는 주소의 종류', 'Type of address being resolved'),
    source: 'spec',
  });
  w.uint(6, 8, {
    key: 'hlen',
    name: 'Hardware Length',
    value: '6',
    meaning: tr('MAC 주소 길이', 'MAC address length'),
    source: 'spec',
  });
  w.uint(4, 8, {
    key: 'plen',
    name: 'Protocol Length',
    value: '4',
    meaning: tr('IPv4 주소 길이', 'IPv4 address length'),
    source: 'spec',
  });
  w.uint(reply ? 2 : 1, 16, {
    key: 'oper',
    name: 'Operation',
    value: reply ? '2 (reply)' : '1 (request)',
    meaning: tr('1 질문, 2 대답', '1 request, 2 reply'),
    source: 'observed',
  });
  w.bytes(macBytes(senderMac.mac), {
    key: 'sha',
    name: 'Sender MAC',
    value: senderMac.mac,
    meaning: tr('보낸 쪽 MAC', "Sender's MAC"),
    source: senderMac.source,
  });
  w.bytes(ipBytes(senderIp.ip), {
    key: 'spa',
    name: 'Sender IP',
    value: senderIp.ip,
    meaning: tr('보낸 쪽 IP', "Sender's IP"),
    source: senderIp.source,
  });
  w.bytes(new Uint8Array(6), {
    key: 'tha',
    name: 'Target MAC',
    value: reply ? tr('(요청자의 MAC)', "(requester's MAC)") : '00:00:00:00:00:00',
    meaning: tr('질문할 때는 모르므로 0으로 채움', 'Unknown when asking, so filled with zeros'),
    source: 'spec',
  });
  w.bytes(ipBytes(targetIp.ip), {
    key: 'tpa',
    name: 'Target IP',
    value: targetIp.ip,
    meaning: tr('MAC 주소를 알고 싶은 IP', 'The IP whose MAC address is wanted'),
    source: targetIp.source,
  });
  return {
    kind: 'arp',
    title: 'ARP',
    standard: 'RFC 826',
    header: w,
    note: tr(
      'ARP는 IP 패킷이 아니라 이더넷 프레임에 바로 실립니다(EtherType 0x0806).',
      'ARP is carried directly in an Ethernet frame, not in an IP packet (EtherType 0x0806).',
    ),
  };
}

/** ICMP echo request/reply (RFC 792) with its checksum. */
export function icmp(values: Values, payload: Uint8Array): Encoded {
  const w = new BitWriter();
  const reply = /reply|응답|^0\b/.test(values.get('type')?.text ?? '');
  const data = payload.length > 0 ? payload : filler(32, 7);
  w.uint(reply ? 0 : 8, 8, {
    key: 'type',
    name: 'Type',
    value: reply ? '0 (echo reply)' : '8 (echo request)',
    meaning: tr('ping 요청은 8, 응답은 0', '8 for a ping request, 0 for a reply'),
    source: 'observed',
  });
  w.uint(0, 8, {
    key: 'code',
    name: 'Code',
    value: '0',
    meaning: tr('세부 코드', 'Subcode'),
    source: 'spec',
  });
  const at = w.byteLength;
  w.uint(0, 16, {
    key: 'checksum',
    name: 'Checksum',
    value: '',
    meaning: tr('ICMP 메시지 전체의 오류 검사 값', 'Error check over the whole ICMP message'),
    source: 'derived',
  });
  w.uint(0x4d2, 16, {
    key: 'id',
    name: 'Identifier',
    value: '1234',
    meaning: tr('어느 ping 프로그램의 요청인지', 'Which ping program sent the request'),
    source: 'typical',
  });
  w.uint(1, 16, {
    key: 'seq',
    name: 'Sequence Number',
    value: '1',
    meaning: tr('몇 번째 요청인지', 'Which request in the sequence this is'),
    source: 'typical',
  });
  w.bytes(data, {
    key: 'data',
    name: 'Data',
    value: tr(`${String(data.length)}바이트`, `${String(data.length)} bytes`),
    meaning: tr('응답에 그대로 돌아오는 내용', 'Content echoed back unchanged in the reply'),
    source: 'typical',
  });
  const sum = internetChecksum(w.toBytes());
  w.patch16(at, sum);
  const field = w.fields.find((f) => f.key === 'checksum');
  if (field) field.value = hex(sum, 4);
  return { kind: 'icmp', title: 'ICMP', standard: 'RFC 792', header: w };
}
