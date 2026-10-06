import type { FieldSource, LinkMedium, NodeActionKind, NodeType } from '@magvirtualedu/schema';

// Korean display names for schema enums.

export const NODE_TYPE_NAMES: Record<NodeType, string> = {
  client: '클라이언트',
  router: '라우터',
  switch: '스위치',
  firewall: '방화벽',
  dns: 'DNS 서버',
  server: '서버',
  loadbalancer: '로드밸런서',
  cdn: 'CDN',
  cloud: '네트워크 구간',
  service: '서비스',
  queue: '메시지 큐',
  database: '데이터베이스',
  browser: '브라우저',
  os: '운영체제 구성요소',
  nic: '네트워크 카드',
  modem: '모뎀 / ONT',
  hop: '인터넷 라우터',
};

export const MEDIUM_NAMES: Record<LinkMedium, string> = {
  ethernet: '이더넷',
  wifi: 'Wi-Fi',
  fiber: '광케이블',
  internet: '인터넷',
  virtual: '가상 링크',
};

export const ACTION_NAMES: Record<NodeActionKind, string> = {
  lookup: '조회',
  rewrite: '변환',
  drop: '폐기',
  process: '처리',
};

export const SOURCE_NAMES: Record<FieldSource, string> = {
  observed: '관측',
  derived: '계산',
  typical: '전형값',
};

export const SOURCE_HINTS: Record<FieldSource, string> = {
  observed: '이 컴퓨터에서 실제로 측정한 값',
  derived: '측정한 값에서 계산한 값',
  typical: '실제 값을 볼 수 없어 보여 주는 일반적인 값',
};
