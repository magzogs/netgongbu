# Net Gongbu

네트워크에서 메시지가 라우터와 서버를 거쳐 어떻게 전달되는지 3D 공간에서 단계별로 보여 주는 교육용 데스크톱 앱입니다.
([English](#english))

- **예제 재생:** 준비된 시나리오로 패킷이 장비 사이를 오가는 모습을 봅니다.
- **AI에게 질문:** 지금 화면의 단계·패킷·헤더에 대해 묻거나, 답을 시나리오로 만들어 재생합니다.
  ChatGPT·Claude 계정이나 API 키, 또는 로컬 LLM을 연결해 씁니다.
- **노트북 브라우저:** 주소를 입력하면 이 컴퓨터에서 실제로 페이지를 열고, 요청·네트워크 설정·서버까지의 경로를 측정해
  그 결과로 지도와 시나리오를 만듭니다.
- **패킷 해부:** 단계마다 Ethernet부터 HTTP까지 실제 바이트와 헤더의 비트 구조를 보여 줍니다.
- **언어:** 한국어와 English.

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

버그나 제안은 [Issues](https://github.com/magzogs/netgongbu/issues)에 남겨 주세요. 이 저장소는 배포용이라 소스 코드는 들어 있지
않습니다.

## English

Net Gongbu is an educational desktop app that shows, step by step in 3D, how a message travels through routers and servers.
Play the bundled scenarios, ask an AI (your own ChatGPT or Claude account, an API key, or a local LLM) about what is on screen,
open a real page and watch the measured path it took, and take each packet apart down to its header bits. Korean and English.

Download the file for your OS from the [latest release](https://github.com/magzogs/netgongbu/releases/latest).

- **macOS:** open the dmg and drag Net Gongbu into Applications. If macOS warns that it cannot verify the app the first time,
  go to System Settings → Privacy & Security and click **Open Anyway**.
- **Windows:** run the installer. If SmartScreen appears, click **More info** → **Run anyway**.
- **Linux:** `chmod +x NetGongbu-*.AppImage`, then run it.

Report bugs and ideas in [Issues](https://github.com/magzogs/netgongbu/issues). This repository only hosts releases; the source
code is not included.
