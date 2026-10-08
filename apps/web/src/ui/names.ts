import type { FieldSource, LinkMedium, NodeActionKind, NodeType } from '@netgongbu/schema';
import { tr } from '@netgongbu/schema';

// Display names for schema enums, in the current language.

export const NODE_TYPE_NAMES: Record<NodeType, string> = {
  client: tr('클라이언트', 'Client'),
  router: tr('라우터', 'Router'),
  switch: tr('스위치', 'Switch'),
  firewall: tr('방화벽', 'Firewall'),
  dns: tr('DNS 서버', 'DNS server'),
  server: tr('서버', 'Server'),
  loadbalancer: tr('로드밸런서', 'Load balancer'),
  cdn: 'CDN',
  cloud: tr('네트워크 구간', 'Network segment'),
  service: tr('서비스', 'Service'),
  queue: tr('메시지 큐', 'Message queue'),
  database: tr('데이터베이스', 'Database'),
  browser: tr('브라우저', 'Browser'),
  os: tr('운영체제 구성요소', 'OS component'),
  nic: tr('네트워크 카드', 'Network card'),
  modem: tr('모뎀 / ONT', 'Modem / ONT'),
  hop: tr('인터넷 라우터', 'Internet router'),
};

export const MEDIUM_NAMES: Record<LinkMedium, string> = {
  ethernet: tr('이더넷', 'Ethernet'),
  wifi: 'Wi-Fi',
  fiber: tr('광케이블', 'Fiber'),
  internet: tr('인터넷', 'Internet'),
  virtual: tr('가상 링크', 'Virtual link'),
};

export const ACTION_NAMES: Record<NodeActionKind, string> = {
  lookup: tr('조회', 'Lookup'),
  rewrite: tr('변환', 'Rewrite'),
  drop: tr('폐기', 'Drop'),
  process: tr('처리', 'Process'),
};

export const SOURCE_NAMES: Record<FieldSource, string> = {
  observed: tr('관측', 'Observed'),
  derived: tr('계산', 'Derived'),
  typical: tr('전형값', 'Typical'),
};

export const SOURCE_HINTS: Record<FieldSource, string> = {
  observed: tr('이 컴퓨터에서 실제로 측정한 값', 'Measured on this computer'),
  derived: tr('측정한 값에서 계산한 값', 'Calculated from measured values'),
  typical: tr(
    '실제 값을 볼 수 없어 보여 주는 일반적인 값',
    'A typical value, shown because the real one can’t be seen',
  ),
};
