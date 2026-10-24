# Net Gongbu 미디어

[English](README.md) · **한국어**

사용자 문서(docs)와 광고·소개 영상에 쓸 Net Gongbu 영상과 이미지, 그리고 그것들을 만든 도구입니다.
magzog.com 책의 Net Gongbu 권에 들어간 영상과 같은 원본에서 나왔습니다(2026-10-15, 데스크톱 앱 빌드
`apps/desktop/out/renderer` 2026-10-14).

## 실제 사용 영상 `real-use/`

데스크톱 앱의 화면(렌더러, 곧 웹 뷰어)을 헤드리스 Chromium에서 실행해 화면 밖에서 녹화했습니다. 데스크톱 앱의
preload(`window.lab`)는 `source/recording/mock.js`가 대신해서 AI 연결도, 저장된 측정도 없이 앱에 든 실측 예시
「서울에서 미국 서버까지 (데모 데이터)」만 씁니다. 개인 정보는 없습니다.

1. 지구본에서 접힌 「노트북 내부 + 집」을 펼치기 → 카메라가 서울로 내려가 브라우저, OS DNS 리졸버, TCP/IP 스택,
   랜카드, 공유기, 모뎀이 보임
2. 다음 단계(▶|) 세 번: HSTS, 브라우저가 OS에 주소를 물음, DNS 질의가 공유기로 나감
3. 따라가기 → 16단계: TLS ClientHello가 태평양을 건너는 동안 카메라가 패킷을 따라가고, 오른쪽 패킷 헤더를
   내려 SNI·ALPN·키 교환 그룹을 봄
4. 패킷 해부: TLS → TCP → IPv4 계층을 차례로 열고, Handshake Type·Time To Live 칸에 마우스를 올려 설명을 본 뒤,
   BIN(2진수)으로 바꿔 Don't Fragment 비트를 봄

31초이고 소리는 없습니다. 언어마다 따로 찍어서(앱의 언어 설정) 화면 글이 그 언어입니다. 헤드리스 녹화에는
포인터가 없어서, 실제 마우스 이벤트가 난 자리에 포인터와 클릭 동그라미를 그렸습니다(`pointer.js`). 끝의 0.6초는
첫 장면으로 겹쳐 넘어가서 반복 재생이 끊기지 않고, 포스터(첫 장면)와도 이어집니다.

| 파일                                   | 내용                                                                                                                     | 쓰임                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `netgongbu-use-{ko,en}-1080p.mp4`      | 1920 × 1080. 펼친 노트북과 집, 패킷 헤더, 패킷 해부에 카메라가 다가갔다가 물러납니다                                     | 광고, 문서의 대표 영상 |
| `netgongbu-use-{ko,en}-wide-1080p.mp4` | 같은 장면을 카메라 없이 창 전체로                                                                                        | 문서에서 전체 흐름     |
| `netgongbu-use-{ko,en}-540p.mp4`       | 960 × 540. magzog.com 책 Log#10.1(화면)에 들어간 것                                                                      | 웹에 넣기              |
| `still-{ko,en}-01…06-*.png`            | 1080p 정지 화면(창 전체): 노트북과 집, DNS 질의, 태평양을 건너는 ClientHello, TLS 헤더, 패킷 해부(TLS), IPv4 헤더의 비트 | 문서 스크린샷          |

## 모션그래픽 `motion/`

magzog.com 책 Net Gongbu 권의 주요 기능, 작동 흐름, 스택 · 상태 페이지 끝에 들어간 2D 모션그래픽입니다. 앱의
부품을 그대로 썼습니다: 잉크 테두리의 흰 라우터 노드, 프로토콜 태그를 단 민트색 패킷(아이콘의 패킷), 앱의 프로토콜
색(LOCAL 분홍, DNS 노랑, TCP 파랑, TLS 보라, HTTP 초록)과 계층 색, 아이콘의 정육면체. 바탕은 책의 청록 `#C4EEEE`,
글자와 선은 잉크 `#0F6464`, 글꼴은 IBM Plex Sans(KR)와 IBM Plex Mono입니다. 사용자가 고른 Pinterest 보드
「모션그래픽」에서 orbit(점이 고리 사이를 달리고 닿으면 고리가 퍼짐 → 홉과 traceroute), planets(가운데를 감싸며
퍼지는 겹친 사각형 → 패킷의 계층), stopscroll(실에 매달려 흔들리는 표지 → 작동 흐름의 번호)을 참고했습니다. 모두
끊김 없이 반복됩니다.

| 파일                   | 길이   | 내용                                                                                                                                                                                                                                                                                                                               | 크기 (`@2x`)            |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `features-{ko,en}.mp4` | 12.6초 | 세 기능을 차례로, 위의 헤더 칸에 번호와 이름: ① 노트북 → 공유기 → 통신사 라우터 → 서버를 패킷이 한 단계씩(아래에 단계 막대와 ▶\| 버튼) ② 지구 위 traceroute: 핑 고리가 퍼질 때마다 홉이 왕복 시간과 함께 나타나고, 그 경로가 22단계 시나리오가 됨 ③ 패킷의 계층이 겹친 사각형으로 퍼졌다가 캡슐화 줄로 펼쳐지고, TTL을 AI에게 물음 | 968 × 830 (1936 × 1660) |
| `how-{ko,en}.mp4`      | 9.6초  | 작동 흐름 01–04: 주소 입력과 Enter, DNS(example.org → 192.0.2.10)와 SYN·SYN-ACK·ACK, 공유기와 통신사 라우터, 서버(GET / → 200 OK가 돌아옴). 지금 단계의 번호표가 실에 매달려 흔들림                                                                                                                                                | 968 × 672 (1936 × 1344) |
| `stack.mp4`            | 7.6초  | 라우터 일곱 개가 나타나 정육면체로 이어지고, 면이 채워지고 아이콘 바탕이 깔린 뒤, 패킷이 한 바퀴 돌며 기술 스택(Three.js, TypeScript, Electron, ChatGPT · Claude)을 띄움. 제품 이름 말고는 글자가 없어 한 파일                                                                                                                     | 968 × 972 (1936 × 1944) |
| `*@2x.png`             |        | 포스터(그 영상을 대표하는 한 장면)                                                                                                                                                                                                                                                                                                 |                         |

크기는 책 페이지의 빈자리에 맞춘 것입니다. 16:9나 세로 9:16 광고가 필요하면 `source/motion/edunet.html`에 그 크기로
장면을 하나 더 만들어 렌더링합니다.

## 원본 `raw/` (git에 넣지 않음)

- `take-{ko,en}.mp4`: 녹화한 2배 프레임 전부(2880 × 1620, 언어마다 약 2,740장)를 프레임마다 한 장씩 묶은 것
  (H.264 CRF 12, 언어마다 약 30 MB). 풀면 `edit.mjs`가 읽는 프레임이 됩니다.
- `take-{ko,en}.json`: 프레임마다 찍힌 앱 안의 시각(초)과 포인터 동작 기록. `edit.mjs`가 이것으로 30fps에 맞춰 다시
  짜고 카메라를 맞춥니다.

`media/.gitignore`로 git에서 뺐습니다. 함께 보관하려면 Git LFS나 다른 저장소를 쓰세요. 다시 편집하려면 프레임으로
풉니다(언어마다 약 1 GB):

```bash
cd media/raw
mkdir take-ko && ffmpeg -i take-ko.mp4 -fps_mode passthrough -q:v 2 take-ko/f%05d.jpg && cp take-ko.json take-ko/take.json
```

## 다시 만들기 `source/`

### 실제 사용 영상 `source/recording/`

필요한 것: Node 22, ffmpeg, ImageMagick(`magick`, 포스터), 이 저장소의 `pnpm install`(Playwright는
`apps/desktop`의 playwright-core를 씀)과 Playwright의 Chromium(`npx playwright install chromium`, 또는 `CHROME`에
Chromium 경로). 녹화는 화면 밖에서 하므로 화면과 마우스는 그대로 써도 됩니다.

```bash
pnpm --filter @netgongbu/desktop build      # 뷰어를 apps/desktop/out/renderer에 빌드
python3 -m http.server 8190 --bind 127.0.0.1 --directory apps/desktop/out/renderer   # 다른 터미널에서 띄워 둠
cd media/source/recording
node take.mjs ko && node take.mjs en        # → ../../raw/take-{ko,en}/ (프레임 + take.json), 언어마다 약 4분
./cuts.sh                                   # → ../../real-use/ (1080p 두 가지, 540p, 정지 화면), ../../site/ (magzog.com용)
```

- `take.mjs`: 앱을 실제보다 6배 느리게 돌리면서(`slowmo.js`: `performance.now`, `Date.now`,
  `requestAnimationFrame`, 타이머. CSS 애니메이션은 DevTools 프로토콜의 `Animation.setPlaybackRate`) 2배
  스크린샷을 찍을 수 있는 만큼 찍고, 프레임마다 앱 안의 시각을 적습니다. 그래서 3D 화면을 2배로 찍어도 30fps로
  매끄럽습니다. 무엇을 누르고 얼마나 기다리는지는 「the take」 부분에 있고, 누를 자리는 화면의 요소에서 찾으므로 화면
  글이 바뀌어도 맞습니다.
- `edit.mjs`: 프레임을 시각대로 골라 30fps로 짜고 카메라를 움직입니다(Chromium의 canvas로 잘라 그림). 카메라는
  맨 위 `CAMERA`(동작 이름에 묶인 시각, 창 좌표의 중심과 배율), 정지 화면의 시각은 `STILLS`에 있습니다.
- `cuts.sh`의 `site/`(`use-{ko,en}.mp4`와 포스터 `use-{ko,en}-poster.webp`)는 magHome의
  `public/captures/edunet/`에 들어가는 파일입니다.

### 모션그래픽 `source/motion/`

- `edunet.html`: 시간 `t`만으로 한 장면을 그리는 HTML입니다(`lib.js`, `lib.css`는 magHome `scripts/motion/`의 공용
  부분 사본). 브라우저에서 `edunet.html?clip=features&lang=ko`(`features` · `how` · `stack`, `ko` · `en`)로 열면 첫
  장면이 보이고, `renderAt(t)`로 아무 시각이나 그릴 수 있습니다. 문구는 맨 위 `T`에 있습니다.
- `render.mjs`: Playwright로 프레임을 찍어 ffmpeg로 `motion/`에 영상과 포스터를 씁니다(글꼴은 Google Fonts에서
  받으므로 네트워크가 필요).

```bash
node media/source/motion/render.mjs features ko             # → media/motion/features-ko.mp4, .png
node media/source/motion/render.mjs stack --scale 2         # → media/motion/stack@2x.mp4, .png
```

magzog.com용으로는 magHome 저장소의 `scripts/motion/edunet.html`(같은 페이지)이 있고, 그쪽 `render.mjs`는
`src/assets/motion/`에 씁니다.
