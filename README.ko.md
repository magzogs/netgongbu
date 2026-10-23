# Net Gongbu

[English](README.md) · **한국어**

네트워크에서 메시지가 라우터와 서버를 거쳐 어떻게 전달되는지 3D 공간에서 단계별로 보여 주는 교육용 앱입니다.

- **예제 재생:** 직접 작성한 시나리오를 재생합니다(웹·데스크톱).
- **AI에게 질문:** 한 창에서 두 가지를 합니다. **묻기**는 지금 화면의 단계, 패킷, 장비, 헤더 필드에 대해 글로 답하고
  (질문할 때의 화면 내용이 글로, 원하면 3D 화면 그림도 함께 전달됨), **시나리오로 보기**는 현재 지도의 장비만으로 답을
  시나리오로 만들어 재생합니다. AI는 ChatGPT나 Claude를 계정 로그인(OAuth)·API 키·CLI 중 하나로 연결하고(로컬 LLM도 가능),
  연결하면 쓸 수 있는 모델과 모델마다의 Effort 단계를 가져와 고르게 합니다.
- **노트북 브라우저 (데스크톱 앱):** 주소를 입력하면 이 컴퓨터에서 실제로 페이지를 열고, 브라우저가 보낸 요청·이 컴퓨터의
  네트워크 설정·서버까지의 경로를 측정해 그 결과로 지도와 시나리오를 새로 만듭니다. Enter를 누른 순간부터 브라우저,
  OS DNS 리졸버, TCP/IP 스택, 라우팅 테이블, ARP 캐시, 랜카드, 공유기, 모뎀, 통신사 라우터, 서버까지 한 단계씩 보여 주고,
  모든 헤더 값에 **관측 / 계산 / 전형값** 출처를 표시합니다.
- **패킷 해부:** 단계마다 움직이는 패킷을 Ethernet부터 HTTP까지 실제 바이트로 만들어, 계층별 캡슐화와 각 헤더의 비트 구조를
  규격 문서의 그림처럼 보여 줍니다. 값은 16진수 또는 2진수로 봅니다. 창은 옮기고 크기를 바꾸거나 별도의 창으로 띄울 수 있습니다.
- **언어:** 설정(톱니바퀴)에서 한국어와 English 중에 고릅니다. 처음에는 브라우저(OS) 언어를 따르고, 바꾸면 화면을 다시 불러와
  화면 글, 예제와 실측 시나리오, 패킷 해부의 설명, AI의 답까지 그 언어로 바뀝니다. 영어 예제는 `apps/web/public/data/en/`에 있습니다.
- **지구본과 평면 지도:** 실측 경로는 육지와 바다가 구분된 지구본이나 평면 세계 지도 위에 장비의 실제 위치(도시)로 놓입니다.
  장비마다 시나리오에서 처음 거치는 순서대로 번호가 붙습니다.

## 내려받기

[최신 릴리스](https://github.com/magzogs/netgongbu/releases/latest)에서 운영체제에 맞는 파일을 받으세요.

| OS                    | 파일                                     |
| --------------------- | ---------------------------------------- |
| macOS (Apple Silicon) | `NetGongbu-<버전>-mac-arm64.dmg`         |
| macOS (Intel)         | `NetGongbu-<버전>-mac-x64.dmg`           |
| Windows               | `NetGongbu-<버전>-win-x64.exe`           |
| Linux                 | `NetGongbu-<버전>-linux-x86_64.AppImage` |

## 설치

- **macOS:** dmg를 열어 Net Gongbu를 응용 프로그램 폴더로 끌어 넣습니다. 처음 열 때 확인되지 않은 앱이라는 경고가 나오면
  시스템 설정 → 개인정보 보호 및 보안에서 **그래도 열기**를 누릅니다.
- **Windows:** 설치 파일을 실행합니다. "Windows의 PC 보호" 창이 나오면 **추가 정보** → **실행**을 누릅니다.
- **Linux:** `chmod +x NetGongbu-*.AppImage` 후 실행합니다.

버그나 제안은 [Issues](https://github.com/magzogs/netgongbu/issues)에 남겨 주세요.

## 실행

```bash
pnpm install
pnpm dev:desktop   # 데스크톱 앱 (Electron): 뷰어 + 노트북 브라우저 + 측정 + AI
pnpm dev           # 웹 뷰어 http://localhost:5180 + AI 서버 :8787 (/api는 Vite가 프록시)
pnpm dev:fake      # 웹, AI 연결 없이: 가짜 AI가 고정된 시나리오(첫 답은 일부러 틀려서 수정 과정까지)를 돌려줌
pnpm check         # lint + format + typecheck + test
pnpm --filter @netgongbu/desktop test:e2e   # 데스크톱 앱을 띄워 질문·실측·패킷 해부까지 자동 확인 (e2e/out에 스크린샷)
pnpm --filter @netgongbu/desktop measure -- example.com info.cern.ch   # 빌드된 앱으로 실제 측정 후 스크린샷
```

`measure`는 `test:e2e`가 만든 빌드를 씁니다. 옵션: `--download-geo`(위치 DB가 없으면 먼저 내려받기),
`--open <측정 id>`(저장된 측정 다시 열기), `--tour`(따라가기 카메라로 재생하며 몇 초마다 스크린샷),
`--user-data <폴더>`(기본은 앱 데이터 폴더라 측정 기록과 위치 DB가 유지됨).

- **AI 연결:** "AI에게 질문" → 연결 상태(창 제목 옆)를 눌러 ChatGPT / Claude / 로컬 LLM과 연결 방식을 고릅니다.
  - **계정 로그인(OAuth):** 구독 중인 ChatGPT·Claude 계정으로 로그인합니다. 로그인은 공식 CLI가 브라우저에서 진행하고 토큰도
    CLI가 보관합니다. ChatGPT는 Codex CLI의 app server(`codex app-server`, ChatGPT 데스크톱 앱에 든 것도 찾음)가, Claude는
    Claude Code(`claude auth login`)가 맡습니다. Anthropic은 Claude 구독 계정의 OAuth 토큰을 Claude Code와 Claude.ai 밖에서 쓰지
    못하게 하므로, Claude는 질문도 Claude Code가 처리합니다(도구 없이, 설정·플러그인 없이, 빈 폴더에서).
  - **API 키:** OpenAI(Responses API)·Anthropic(Messages API) 키. 데스크톱 앱은 OS 키체인으로 암호화해 저장하고, 웹은 로컬 서버의
    메모리에만 둡니다. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` 환경변수도 씁니다.
  - **CLI:** 이미 설치·로그인한 `codex`나 `claude`를 그대로 씁니다(경로는 자동으로 찾거나 직접 지정).
  - 모델 목록은 연결한 곳에서 가져옵니다: Codex `model/list`, Claude Code의 `initialize`, Anthropic Models API(`capabilities.effort`),
    OpenAI `/v1/models`(Effort 단계는 모델 계열로 판단), 로컬 서버 `/v1/models`. Effort는 그 모델이 받는 단계만 보이고, "기본값"은
    모델의 기본을 따릅니다. 고른 AI·모델·Effort는 기억되고(데스크톱: 앱 설정, 웹: `apps/server/.data/ai.json`), 시나리오 만들기에도
    같은 연결이 쓰입니다. `NETGONGBU_FAKE_AI=1`이면 데스크톱 앱의 시나리오는 가짜 AI가 만듭니다.
- **위치 데이터베이스:** 경로를 지구본 위에 놓으려면 설정에서 DB-IP City Lite(약 60 MB)를 내려받습니다. 없으면 평면으로 그립니다.
- **로컬 LLM:** OpenAI 호환 API를 여는 서버면 됩니다. 예: `ollama pull qwen2.5:7b` 후 Ollama 실행
  (`http://localhost:11434/v1`), LM Studio의 로컬 서버(`http://localhost:1234/v1`), `llama-server`(`http://localhost:8080/v1`).
  3D 화면 그림은 그림을 볼 수 있는 모델일 때만 켜세요.
- **어디서 부르나:** 데스크톱 앱은 메인 프로세스가, 웹은 로컬 AI 서버(`apps/server`, `/api/ai`)가 키를 갖고 CLI를 실행하며 모든
  요청을 보냅니다. AI 서버는 `127.0.0.1`에서만 열리고, 다른 사이트의 페이지가 보낸 요청은 거절합니다.
- AI 서버 환경변수: `SCENARIO_MODEL`·`SCENARIO_EFFORT`(`ANTHROPIC_API_KEY`가 있고 아직 고른 AI가 없을 때의 Claude 기본값,
  `claude-opus-5-5`·`high`), `SCENARIO_MAX_ATTEMPTS`(기본 3), `SCENARIO_PORT`(기본 8787).

## 릴리스

설치 파일은 이 저장소의 [Releases](https://github.com/magzogs/netgongbu/releases)로 배포합니다.

```bash
pnpm --filter @netgongbu/desktop dist   # 이 컴퓨터 OS용 설치 파일을 apps/desktop/release/에 만듦 (배포는 안 함)
git tag -a v0.2.0 -m "바뀐 점…" && git push origin v0.2.0   # 배포
```

`v*` 태그를 올리면 `.github/workflows/release.yml`이 macOS(arm64·x64 dmg)·Windows(x64 설치 파일)·Linux(AppImage)를 만들어
이 저장소에 같은 이름의 릴리스로 올립니다. 버전은 태그에서 가져오고(`package.json`의 버전은 바꾸지 않아도 됨), 태그 메시지가
릴리스 노트가 되며, `v0.2.0-beta.1`처럼 `-`가 붙으면 pre-release가 됩니다. 실패한 릴리스는 Actions의 Release를 태그 이름으로 다시
실행하면 파일을 덮어씁니다.

릴리스는 Actions의 기본 `GITHUB_TOKEN`으로 올리므로 따로 토큰이 필요 없습니다. macOS 서명과 공증은 이 저장소의
Actions secrets로 켭니다:

- `MAC_CERT_P12_BASE64`·`MAC_CERT_PASSWORD` (선택): Developer ID Application 인증서(.p12, base64)와 암호. 없으면 ad-hoc 서명이라
  macOS가 처음 열 때 한 번 허락을 받습니다.
- `APPLE_ID`·`APPLE_APP_SPECIFIC_PASSWORD`·`APPLE_TEAM_ID` (선택, 인증서와 함께): 공증(notarization).

## 웹 브라우저로 어려웠던 것과 데스크톱 앱의 해결

| 웹에서 막힌 것                        | 데스크톱 앱(Electron)에서                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 진짜 브라우저 메시지 관찰             | 앱에 들어 있는 Chromium 뷰가 노트북의 브라우저가 되고, DevTools 프로토콜로 요청·응답 헤더, HTTP 버전(h2/h3), TLS 정보, DNS·연결·TLS·대기 시간, 실제 서버 IP를 기록 |
| traceroute·라우팅 테이블·ARP·DNS 설정 | 메인 프로세스가 OS 도구를 셸 없이 실행해 파싱 (macOS, Linux)                                                                                                       |
| 다른 사이트를 iframe으로 열기, CORS   | iframe이 아닌 별도 웹 뷰라 해당 없음                                                                                                                               |
| API 키·별도 서버                      | 메인 프로세스가 AI를 직접 호출(API, 공식 CLI), 키는 OS 키체인으로 암호화 저장                                                                                      |
| 실제 패킷 바이트                      | 캡처는 관리자 권한이 필요해 아직 미지원 → 측정값으로 규격대로 바이트를 만들고(패킷 해부) 값마다 관측/계산/전형값/규격으로 표시                                     |

## 측정 한 번에 일어나는 일 (데스크톱)

1. 노트북 브라우저(메모리 전용 세션, 권한·다운로드·팝업 차단)가 페이지를 엽니다. 처음 방문처럼 측정하도록 캐시·쿠키·DNS 캐시·열린 연결을 먼저 비울 수 있습니다.
2. DevTools Network 이벤트를 요청 단위로 정리합니다. 리다이렉트(HSTS 포함)를 나누고, 쿠키·인증 헤더는 가립니다.
3. 기본 경로의 인터페이스·게이트웨이 IP와 MAC·DNS 서버를 읽고, 페이지의 호스트를 그 DNS 서버로 다시 조회합니다(TTL 포함).
4. 응답한 서버까지 traceroute를 돌리며 홉마다 역방향 DNS 이름, 운영 사업자(Team Cymru ASN, DNS로 조회), 위치(오프라인 DB)를 붙여 실시간으로 보여 줍니다.
5. 결과(`TraceReport`)를 저장하고, 빌더가 지도(노트북 내부 → 집 → 지구본의 인터넷)와 단계별 시나리오를 결정적으로 만듭니다.
   위치 DB의 좌표는 왕복 시간으로 검사합니다. 빛은 광섬유에서 1 ms에 약 200 km를 가므로 왕복 r ms인 장비는 r × 100 km 안에
   있어야 합니다. 그보다 멀다고 나오면(애니캐스트 주소, DB 오류) 그 좌표는 배치에 쓰지 않고 장비 설명에 이유를 적습니다.

라우터 주소는 외부 웹 서비스로 보내지 않습니다(위치는 내려받은 DB에서, 사업자는 DNS로 조회). 측정 기록은 이 컴퓨터의 앱 데이터 폴더에만 저장됩니다.

## AI 시나리오가 만들어지는 과정

1. 뷰어가 질문을 보냅니다(웹: `POST /api/scenarios`, 데스크톱: IPC).
2. 고정 지침과 토폴로지, 예제 시나리오를 시스템 프롬프트로 묶고, 질문과 함께 연결된 AI에 보냅니다. 답은 `ScenarioDraft`의
   JSON 스키마를 따르는 구조화된 출력으로 받습니다(Claude API: `output_config.format`과 프롬프트 캐시, OpenAI API:
   `text.format`, Codex: `outputSchema`, Claude Code: `--json-schema`).
3. 답을 `validateScenario`로 검사합니다. 재생할 수 없는 부분이 있으면 그 목록을 AI에게 돌려보내 고친 시나리오를 다시 받습니다(최대 3회).
4. 통과한 시나리오는 저장되고 목록의 "AI가 만든 시나리오"에 추가되어 바로 재생됩니다(`?s=<id>`로 공유).

## 패킷 해부

인스펙터의 "패킷 해부 ▸", 패킷 더블클릭, 또는 `P`로 엽니다. 시나리오의 패킷을 첫 구간의 선로 위에 실리는 모습 그대로
바이트로 만들고, 세 가지 그림으로 보여 줍니다. 값은 위쪽 스위치로 **HEX(16진수) / BIN(2진수)** 중에서 골라 봅니다.

1. **캡슐화:** 응용 → 전송 → 네트워크 → 데이터 링크 → 물리 순으로, 각 계층의 단위(메시지, 세그먼트, 패킷, 프레임)가
   자기 헤더 + 위 계층이 넘긴 데이터로 이루어진 모습을 한 줄씩 쌓습니다. 같은 헤더는 모든 줄에서 같은 열에 놓이고,
   암호화 구간은 위 줄의 데이터가 아래 줄에서 🔒 암호문으로 바뀝니다. 이더넷 프레임 끝의 패딩·FCS(트레일러)와 물리 계층의
   프리앰블·SFD·프레임 간격도 보입니다. 줄을 누르면 그 계층을 엽니다.
2. **헤더 구조:** 고른 계층의 헤더를 규격 문서(RFC)의 그림처럼 한 줄 32비트로 그립니다. 필드마다 몇 번째 비트부터 몇 비트인지가
   칸으로 나뉘고(IPv4의 Version 0–3, IHL 4–7 …), 칸 안에 실제 값이 HEX 또는 BIN으로 들어갑니다. Flags처럼 묶인 비트는 위에
   띠로 묶어 보이고, 1 KB가 넘는 키 같은 긴 필드는 가운데 줄을 접습니다(눌러서 펼침). 맨 아래 Data 줄을 누르면 안쪽 계층으로
   들어갑니다.
3. **실제 데이터:** 프레임(또는 암호화 전 내용)의 모든 바이트를 HEX(한 줄 16바이트) 또는 BIN(한 줄 8바이트)으로 보여 주고,
   고른 계층 밖의 바이트는 흐리게 합니다. 바이트를 누르면 그 바이트가 속한 계층과 필드를 엽니다.

칸이나 목록에 마우스를 올리면 그 필드의 위치(헤더 안 비트 범위), 16진수·2진수·10진수 값, 뜻, 출처(**관측** 이 컴퓨터에서
측정 / **계산** 다른 값에서 계산 / **전형값** 볼 수 없어 넣은 일반적인 값 / **규격** 프로토콜이 정한 고정값)가 옆에 나오고,
누르면 고정됩니다. 고정한 필드는 "AI에게 묻기"로 물어볼 수 있습니다.

해부 창은 제목 줄을 끌어 옮기고, 가장자리나 모서리를 끌어 크기를 바꾸고(위치와 크기는 기억됨), 제목 줄을 두 번 눌러 크게
봅니다. "새 창으로"를 누르면 별도의 창(브라우저 팝업, 데스크톱 앱에서는 앱의 창)으로 떨어져 나와 다른 모니터로 옮길 수 있고,
"앱 안으로"를 누르면 돌아옵니다. 그 창에서도 단축키(←, →, Space, Esc …)가 동작합니다.

- **안쪽부터 인코딩:** 길이·체크섬(IPv4 헤더, TCP/UDP 의사 헤더 포함)과 이더넷·Wi-Fi의 FCS(CRC-32)가 안에 든 내용으로
  실제 계산됩니다. 64바이트보다 짧은 이더넷 프레임은 0으로 채웁니다. DNS 이름 압축, TLS 1.3 ClientHello(SNI·ALPN·key_share),
  HTTP/2 HEADERS의 HPACK(정적 테이블, Huffman 없이), QUIC Initial까지 규격대로 씁니다.
- 시나리오에 없던 아래 계층(예: Ethernet)은 전형값으로 채우고 그렇다고 표시합니다. 한 컴퓨터 안의 호출(getaddrinfo 등)은
  선로에 바이트가 없으므로 호출 내용만 보여 줍니다.
- HTTP/3는 QUIC 1-RTT 패킷까지 만들고, 그 안의 HTTP/3 프레임은 설명으로만 보여 줍니다.

## 조작

| 동작                              | 마우스 / 터치                                                   | 키    |
| --------------------------------- | --------------------------------------------------------------- | ----- |
| 평면도: 이동 · 회전 · 확대        | 드래그 · 오른쪽 드래그(두 손가락) · 휠(핀치)                    |       |
| 지구본: 이동 · 돌리기 · 확대      | 드래그 · 오른쪽 드래그(한 손가락, 북쪽은 항상 위) · 휠(핀치)    |       |
| 평면 지도: 이동 · 기울이기 · 확대 | 드래그 · 오른쪽 드래그(두 손가락) · 휠(커서 쪽으로)             |       |
| 지구본 ↔ 평면 지도                | 재생 카드의 "지구본 / 평면 지도"                                | G     |
| 재생 / 일시정지                   | ▶ 버튼                                                          | Space |
| 이전 / 다음 단계                  | ⏮ ⏭ 버튼, 타임라인 클릭                                         | ← →   |
| 패킷 따라가기                     | 따라가기                                                        | F     |
| 전체 보기                         | 전체 보기                                                       | R     |
| 장비 정보 / 그 장비로 이동        | 클릭 / 더블클릭                                                 |       |
| 패킷 해부                         | 인스펙터의 "패킷 해부 ▸", 패킷 더블클릭                         | P     |
| AI에게 질문                       | "AI에게 질문", "이 단계 AI에게 묻기", 장비·필드의 "AI에게 묻기" |       |
| 노트북 브라우저 (데스크톱)        | 노트북 클릭 또는 "노트북 브라우저"                              |       |
| 패널 닫기                         |                                                                 | Esc   |

지구본과 평면 지도에서 장비는 지도 핀처럼 화면에서 늘 비슷한 크기로 그려지고(가장 클 때도 약 100 km), 같은 도시의 장비는 수십 km
간격으로 둘러 놓여 확대하면 나뉩니다. 집은 내 위치(가장 가까운 통신사 라우터의 위치)에, 노트북 내부는 바로 그 남쪽에 각각 수십 km
크기로 놓이고, 같은 도시의 라우터는 그 둘레로 비켜 놓입니다. 이름표가 겹치면 먼저 거치는 장비의 이름표만 남고 나머지는 번호 배지로
그 옆에 줄을 섭니다. 따라가기를 켜면 단계마다 경로 크기에 맞춰 높이를 바꿔, 노트북 안의 단계는 가까이서, 바다를 건너는 단계는
높이서 봅니다(휠로 바꾼 높이는 유지됨). 평면도와 평면 지도에서 드래그로 화면을 옮기거나 지구본을 오른쪽 드래그로 돌리면 따라가기가 꺼집니다.

## 구조

```
packages/schema   토폴로지·시나리오 스키마와 검증, AI 초안 형식, 지구본 좌표 변환
packages/trace    TraceReport(측정 결과), OS 도구·DevTools 이벤트 파서, 측정 결과 → 지도·시나리오 빌더
packages/ai       연결된 AI로 시나리오 생성, 검증·수정 재시도, 저장 (ScenarioService: 서버와 데스크톱이 공유)
packages/bridge   데스크톱 메인 프로세스 ↔ 뷰어 IPC 계약 (window.lab)
packages/protocols 시나리오 패킷 → 규격대로 인코딩한 바이트와 필드 해설 (Ethernet·802.11·IPv4·ARP·ICMP·UDP·TCP·DNS·TLS 1.3·HTTP/1.1·HTTP/2·QUIC)
packages/llm      AI 연결: ChatGPT(Codex app server, OpenAI API)·Claude(Claude Code, Anthropic API)·로컬 LLM, 로그인·키·모델 목록·스트리밍 답
                  (뷰어는 타입만, 호출은 ./node를 데스크톱 메인 프로세스와 서버가 사용)
apps/web          Vite + React + React Three Fiber 뷰어 (데스크톱 앱의 화면이기도 함)
  public/data     catalog.json, topologies/*.json, scenarios/*.json (trace-demo는 빌더로 생성한 데모)
apps/server       웹용 HTTP API (Hono)
apps/desktop      Electron 앱: app:// 프로토콜, preload, 노트북 브라우저, 측정 에이전트(src/main/trace), 설정
```

## 시나리오 작성 규칙

- 시나리오는 beat(단계)의 배열이고, beat 하나에는 동시에 움직이는 hop(패킷)이 여러 개 들어갈 수 있습니다.
- `path`의 인접한 노드 쌍은 반드시 토폴로지 링크로 이어져 있어야 합니다. 테스트가 `public/data`의 모든 파일을 검증합니다.
- 헤더가 바뀌는 노드(NAT, MAC 재작성, 프록시)에서는 hop을 나눕니다. 직전 beat에서 같은 프로토콜·summary의 hop이 그 노드에서 끝나면, 인스펙터가 바뀐 필드를 이전 값과 함께 보여 줍니다.
- 새 시나리오는 `scenarios/<id>.json`을 추가하고 `catalog.json`에 등록합니다. 실측 데모는 `pnpm --filter @netgongbu/trace build:example`로 다시 만듭니다.

## 데이터 출처

- 국경선·육지: Natural Earth (퍼블릭 도메인), world-atlas 패키지
- IP 위치: IP Geolocation by [DB-IP](https://db-ip.com) (CC BY 4.0), 사용자가 내려받을 때만
- ASN: Team Cymru IP-to-ASN (DNS 질의)
