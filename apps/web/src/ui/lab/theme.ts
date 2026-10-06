import type { ByteSource, LayerKind } from '@magvirtualedu/protocols';
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
  observed: '관측',
  derived: '계산',
  typical: '전형값',
  spec: '규격',
};

export const SOURCE_HINTS: Record<ByteSource, string> = {
  observed: '이 컴퓨터에서 실제로 측정한 값',
  derived: '다른 값(길이, 체크섬 등)에서 계산한 값',
  typical: '실제 값을 볼 수 없어 넣은 일반적인 값',
  spec: '프로토콜 규격이 정한 고정값',
};
