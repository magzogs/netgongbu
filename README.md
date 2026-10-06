# magVirtualEdu: Network in 3D

네트워크에서 메시지가 라우터와 서버를 거쳐 어떻게 전달되는지 3D 공간에서 단계별로 보여 주는 교육용 뷰어입니다.
직접 작성한 예제 시나리오를 재생하고, **AI에게 질문**하면 Claude가 현재 지도의 장비만으로 답을 시나리오로 만들어 재생합니다.

## 실행

```bash
pnpm install
export ANTHROPIC_API_KEY=...   # AI 질문에 필요 (없으면 예제만 재생)
pnpm dev        # 뷰어 http://localhost:5180 + AI 서버 :8787 (/api는 Vite가 프록시)
pnpm dev:fake   # API 키 없이: 가짜 AI가 고정된 답(첫 답은 일부러 틀려서 수정 과정까지)을 돌려줌
pnpm check      # lint + format + typecheck + test
pnpm build      # apps/web/dist (정적 파일, 어느 경로에 올려도 동작; AI 질문은 서버 필요)
```

AI 서버 환경변수: `SCENARIO_MODEL`(기본 `claude-opus-5-5`), `SCENARIO_EFFORT`(기본 `high`),
`SCENARIO_MAX_ATTEMPTS`(기본 3), `SCENARIO_PORT`(기본 8787). 생성된 시나리오는 `apps/server/.data/`에 저장됩니다.

## AI 시나리오가 만들어지는 과정

1. 뷰어가 `POST /api/scenarios {topologyId, question}`을 보냅니다.
2. 서버가 고정 지침과 토폴로지, 예제 시나리오를 시스템 프롬프트로 묶어 캐시하고, 질문만 바꿔 Claude에 보냅니다.
   답은 구조화된 출력(`output_config.format`)으로 `ScenarioDraft` 스키마를 따릅니다.
3. 답을 `validateScenario`로 검사합니다. 없는 링크를 지나가는 경로처럼 재생할 수 없는 부분이 있으면,
   그 목록을 Claude에게 돌려보내 고친 시나리오를 다시 받습니다(최대 3회).
4. 통과한 시나리오는 저장되고, 목록의 "AI가 만든 시나리오"에 추가되어 바로 재생됩니다(`?s=<id>`로 공유).

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
packages/schema   토폴로지·시나리오 zod 스키마, 검증(validateScenario), AI 초안 형식(ScenarioDraft)
apps/server       Hono + Anthropic SDK: 질문 → Claude → 검증·재시도 → 저장
  scripts/fake-ai 키 없이 UI를 개발할 때 쓰는 가짜 AI 서버
apps/web          Vite + React + React Three Fiber 뷰어
  public/data     catalog.json, topologies/*.json, scenarios/*.json
  src/engine      경로·타임라인·패킷 위치·헤더 비교·카메라 프레이밍 (순수 함수, 테스트 대상)
  src/store       zustand: 불러오기, 선택, 재생, AI 질문 상태
  src/scene       3D 씬 (노드, 링크, 패킷, 카메라)
  src/ui          플레이어, 인스펙터, 범례, 질문 패널, 3D 위 DOM 라벨
```

## 시나리오 작성 규칙

- 시나리오는 beat(단계)의 배열이고, beat 하나에는 동시에 움직이는 hop(패킷)이 여러 개 들어갈 수 있습니다.
- `path`의 인접한 노드 쌍은 반드시 토폴로지 링크로 이어져 있어야 합니다. 테스트가 `public/data`의 모든 파일을 검증합니다.
- 헤더가 바뀌는 노드(NAT, MAC 재작성, 프록시)에서는 hop을 나눕니다. 직전 beat에서 같은 프로토콜·summary의 hop이 그 노드에서 끝나면, 인스펙터가 바뀐 필드를 이전 값과 함께 보여 줍니다.
- 새 시나리오는 `scenarios/<id>.json`을 추가하고 `catalog.json`에 등록합니다.
