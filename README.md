# magVirtualEdu: Network in 3D

네트워크에서 메시지가 라우터와 서버를 거쳐 어떻게 전달되는지 3D 공간에서 단계별로 보여 주는 교육용 뷰어입니다.
지금은 직접 작성한 시나리오를 재생합니다(MVP-1). 다음 단계(MVP-2)에서는 AI가 질문에 맞는 시나리오를 생성합니다.

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:5180
pnpm check      # lint + format + typecheck + test
pnpm build      # apps/web/dist (정적 파일, 어느 경로에 올려도 동작)
```

## 조작

| 동작                       | 마우스 / 터치                                | 키    |
| -------------------------- | -------------------------------------------- | ----- |
| 회전 · 이동 · 확대         | 드래그 · 오른쪽 드래그(두 손가락) · 휠(핀치) |       |
| 재생 / 일시정지            | ▶ 버튼                                       | Space |
| 이전 / 다음 단계           | ⏮ ⏭ 버튼, 타임라인 클릭                      | ← →   |
| 패킷 따라가기              | 따라가기                                     | F     |
| 전체 보기                  | 전체 보기                                    | R     |
| 장비 정보 / 그 장비로 이동 | 클릭 / 더블클릭                              |       |

## 구조

```
packages/schema   토폴로지·시나리오 zod 스키마, 검증(validateScenario) — 뷰어와 AI 서버가 함께 쓰는 계약
apps/web          Vite + React + React Three Fiber 뷰어
  public/data     catalog.json, topologies/*.json, scenarios/*.json
  src/engine      경로·타임라인·패킷 위치·헤더 비교·카메라 프레이밍 (순수 함수, 테스트 대상)
  src/store       zustand: 불러오기, 선택, 재생 상태
  src/scene       3D 씬 (노드, 링크, 패킷, 카메라)
  src/ui          플레이어, 인스펙터, 범례, 3D 위 DOM 라벨
```

## 시나리오 작성 규칙

- 시나리오는 beat(단계)의 배열이고, beat 하나에는 동시에 움직이는 hop(패킷)이 여러 개 들어갈 수 있습니다.
- `path`의 인접한 노드 쌍은 반드시 토폴로지 링크로 이어져 있어야 합니다. 테스트가 `public/data`의 모든 파일을 검증합니다.
- 헤더가 바뀌는 노드(NAT, MAC 재작성, 프록시)에서는 hop을 나눕니다. 직전 beat에서 같은 프로토콜·summary의 hop이 그 노드에서 끝나면, 인스펙터가 바뀐 필드를 이전 값과 함께 보여 줍니다.
- 새 시나리오는 `scenarios/<id>.json`을 추가하고 `catalog.json`에 등록합니다.
