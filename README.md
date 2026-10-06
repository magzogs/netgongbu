# magVirtualEdu: Network in 3D

네트워크에서 메시지가 라우터와 서버를 거쳐 어떻게 전달되는지 3D 공간에서 단계별로 보여 주는 교육용 앱입니다.

- **예제 재생:** 직접 작성한 시나리오를 재생합니다(웹·데스크톱).
- **AI에게 질문:** Claude가 현재 지도의 장비만으로 답을 시나리오로 만들어 재생합니다.
- **노트북 브라우저 (데스크톱 앱):** 주소를 입력하면 이 컴퓨터에서 실제로 페이지를 열고, 브라우저가 보낸 요청·이 컴퓨터의
  네트워크 설정·서버까지의 경로를 측정해 그 결과로 지도와 시나리오를 새로 만듭니다. Enter를 누른 순간부터 브라우저,
  OS DNS 리졸버, TCP/IP 스택, 라우팅 테이블, ARP 캐시, 랜카드, 공유기, 모뎀, 통신사 라우터, 서버까지 한 단계씩 보여 주고,
  모든 헤더 값에 **관측 / 계산 / 전형값** 출처를 표시합니다.

## 실행

```bash
pnpm install
pnpm dev:desktop   # 데스크톱 앱 (Electron): 뷰어 + 노트북 브라우저 + 측정 + Claude
pnpm dev           # 웹 뷰어 http://localhost:5180 + AI 서버 :8787 (/api는 Vite가 프록시)
pnpm dev:fake      # 웹, API 키 없이: 가짜 AI가 고정된 답(첫 답은 일부러 틀려서 수정 과정까지)을 돌려줌
pnpm check         # lint + format + typecheck + test
pnpm --filter @magvirtualedu/desktop test:e2e   # 데스크톱 앱을 띄워 질문·실측까지 자동 확인 (e2e/out에 스크린샷)
```

- **API 키:** 데스크톱 앱은 설정(⚙)에서 입력하면 OS 키체인으로 암호화해 저장합니다(`ANTHROPIC_API_KEY` 환경변수도 사용).
  웹은 서버의 `ANTHROPIC_API_KEY`를 씁니다. `MAGVE_FAKE_AI=1`이면 데스크톱 앱도 가짜 AI를 씁니다.
- **위치 데이터베이스:** 경로를 지구본 위에 놓으려면 설정에서 DB-IP City Lite(약 60 MB)를 내려받습니다. 없으면 평면으로 그립니다.
- AI 서버 환경변수: `SCENARIO_MODEL`(기본 `claude-opus-5-5`), `SCENARIO_EFFORT`(기본 `high`), `SCENARIO_MAX_ATTEMPTS`(기본 3),
  `SCENARIO_PORT`(기본 8787).

## 웹 브라우저로 어려웠던 것과 데스크톱 앱의 해결

| 웹에서 막힌 것                        | 데스크톱 앱(Electron)에서                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 진짜 브라우저 메시지 관찰             | 앱에 들어 있는 Chromium 뷰가 노트북의 브라우저가 되고, DevTools 프로토콜로 요청·응답 헤더, HTTP 버전(h2/h3), TLS 정보, DNS·연결·TLS·대기 시간, 실제 서버 IP를 기록 |
| traceroute·라우팅 테이블·ARP·DNS 설정 | 메인 프로세스가 OS 도구를 셸 없이 실행해 파싱 (macOS, Linux)                                                                                                       |
| 다른 사이트를 iframe으로 열기, CORS   | iframe이 아닌 별도 웹 뷰라 해당 없음                                                                                                                               |
| API 키·별도 서버                      | 메인 프로세스가 Claude를 직접 호출, 키는 OS 키체인으로 암호화 저장                                                                                                 |
| 실제 패킷 바이트                      | 관리자 권한이 필요해 아직 미지원 → 값마다 관측/계산/전형값으로 표시                                                                                                |

## 측정 한 번에 일어나는 일 (데스크톱)

1. 노트북 브라우저(메모리 전용 세션, 권한·다운로드·팝업 차단)가 페이지를 엽니다. 처음 방문처럼 측정하도록 캐시·쿠키·DNS 캐시·열린 연결을 먼저 비울 수 있습니다.
2. DevTools Network 이벤트를 요청 단위로 정리합니다. 리다이렉트(HSTS 포함)를 나누고, 쿠키·인증 헤더는 가립니다.
3. 기본 경로의 인터페이스·게이트웨이 IP와 MAC·DNS 서버를 읽고, 페이지의 호스트를 그 DNS 서버로 다시 조회합니다(TTL 포함).
4. 응답한 서버까지 traceroute를 돌리며 홉마다 역방향 DNS 이름, 운영 사업자(Team Cymru ASN, DNS로 조회), 위치(오프라인 DB)를 붙여 실시간으로 보여 줍니다.
5. 결과(`TraceReport`)를 저장하고, 빌더가 지도(노트북 내부 → 집 → 지구본의 인터넷)와 단계별 시나리오를 결정적으로 만듭니다.

라우터 주소는 외부 웹 서비스로 보내지 않습니다(위치는 내려받은 DB에서, 사업자는 DNS로 조회). 측정 기록은 이 컴퓨터의 앱 데이터 폴더에만 저장됩니다.

## AI 시나리오가 만들어지는 과정

1. 뷰어가 질문을 보냅니다(웹: `POST /api/scenarios`, 데스크톱: IPC).
2. 고정 지침과 토폴로지, 예제 시나리오를 시스템 프롬프트로 묶어 캐시하고, 질문만 바꿔 Claude에 보냅니다.
   답은 구조화된 출력(`output_config.format`)으로 `ScenarioDraft` 스키마를 따릅니다.
3. 답을 `validateScenario`로 검사합니다. 재생할 수 없는 부분이 있으면 그 목록을 Claude에게 돌려보내 고친 시나리오를 다시 받습니다(최대 3회).
4. 통과한 시나리오는 저장되고 목록의 "AI가 만든 시나리오"에 추가되어 바로 재생됩니다(`?s=<id>`로 공유).

## 조작

| 동작                       | 마우스 / 터치                                | 키    |
| -------------------------- | -------------------------------------------- | ----- |
| 회전 · 이동 · 확대         | 드래그 · 오른쪽 드래그(두 손가락) · 휠(핀치) |       |
| 재생 / 일시정지            | ▶ 버튼                                       | Space |
| 이전 / 다음 단계           | ⏮ ⏭ 버튼, 타임라인 클릭                      | ← →   |
| 패킷 따라가기              | 따라가기                                     | F     |
| 전체 보기                  | 전체 보기                                    | R     |
| 장비 정보 / 그 장비로 이동 | 클릭 / 더블클릭                              |       |
| 노트북 브라우저 (데스크톱) | 노트북 클릭 또는 "노트북 브라우저"           |       |
| 패널 닫기                  |                                              | Esc   |

## 구조

```
packages/schema   토폴로지·시나리오 스키마와 검증, AI 초안 형식, 지구본 좌표 변환
packages/trace    TraceReport(측정 결과), OS 도구·DevTools 이벤트 파서, 측정 결과 → 지도·시나리오 빌더
packages/ai       Claude 호출, 검증·수정 재시도, 저장 (ScenarioService: 서버와 데스크톱이 공유)
packages/bridge   데스크톱 메인 프로세스 ↔ 뷰어 IPC 계약 (window.lab)
apps/web          Vite + React + React Three Fiber 뷰어 (데스크톱 앱의 화면이기도 함)
  public/data     catalog.json, topologies/*.json, scenarios/*.json (trace-demo는 빌더로 생성한 데모)
apps/server       웹용 HTTP API (Hono)
apps/desktop      Electron 앱: app:// 프로토콜, preload, 노트북 브라우저, 측정 에이전트(src/main/trace), 설정
```

## 시나리오 작성 규칙

- 시나리오는 beat(단계)의 배열이고, beat 하나에는 동시에 움직이는 hop(패킷)이 여러 개 들어갈 수 있습니다.
- `path`의 인접한 노드 쌍은 반드시 토폴로지 링크로 이어져 있어야 합니다. 테스트가 `public/data`의 모든 파일을 검증합니다.
- 헤더가 바뀌는 노드(NAT, MAC 재작성, 프록시)에서는 hop을 나눕니다. 직전 beat에서 같은 프로토콜·summary의 hop이 그 노드에서 끝나면, 인스펙터가 바뀐 필드를 이전 값과 함께 보여 줍니다.
- 새 시나리오는 `scenarios/<id>.json`을 추가하고 `catalog.json`에 등록합니다. 실측 데모는 `pnpm --filter @magvirtualedu/trace build:example`로 다시 만듭니다.

## 데이터 출처

- 국경선: Natural Earth (퍼블릭 도메인), world-atlas 패키지
- IP 위치: IP Geolocation by [DB-IP](https://db-ip.com) (CC BY 4.0), 사용자가 내려받을 때만
- ASN: Team Cymru IP-to-ASN (DNS 질의)
