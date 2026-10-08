import type { ByteSource, LayerKind } from '@netgongbu/protocols';
import { tr } from '@netgongbu/schema';
import type { BoxKind } from './stack';

export const LAYER_COLORS: Record<LayerKind, string> = {
  ethernet: '#a78bfa',
  wifi: '#7dd3fc',
  arp: '#fb923c',
  ipv4: '#86efac',
  icmp: '#fb923c',
  udp: '#fdba74',
  tcp: '#fdba74',
  quic: '#a3e635',
  dns: '#facc15',
  tls: '#c084fc',
  http1: '#67e8f9',
  http2: '#67e8f9',
};

export const BOX_COLORS: Record<BoxKind, string> = {
  ...LAYER_COLORS,
  data: '#67e8f9',
  cipher: '#64748b',
  preamble: '#f472b6',
  gap: '#475569',
};

export const SOURCE_LABELS: Record<ByteSource, string> = {
  observed: tr('관측', 'Observed'),
  derived: tr('계산', 'Derived'),
  typical: tr('전형값', 'Typical'),
  spec: tr('규격', 'Spec'),
};

export const SOURCE_HINTS: Record<ByteSource, string> = {
  observed: tr('이 컴퓨터에서 실제로 측정한 값', 'Actually measured on this computer'),
  derived: tr(
    '다른 값(길이, 체크섬 등)에서 계산한 값',
    'Calculated from other values (lengths, checksums, etc.)',
  ),
  typical: tr(
    '실제 값을 볼 수 없어 넣은 일반적인 값',
    'A typical value, used because the real one cannot be seen',
  ),
  spec: tr('프로토콜 규격이 정한 고정값', 'A fixed value set by the protocol specification'),
};
