# Net Gongbu

**English** · [한국어](README.ko.md)

An educational app that shows, step by step in 3D, how a message travels through routers and servers on a network.

- **Play examples:** plays hand-written scenarios.
- **Ask AI:** one window does two things. **Ask** answers in text about the step, packet, device or header field on screen
  (what is on screen when you ask goes along as text, and optionally a picture of the 3D view too); **Show as scenario**
  turns the answer into a scenario that uses only the devices on the current map, and plays it. Connect ChatGPT or Claude
  by account sign-in (OAuth), an API key or a CLI (a local LLM works too); once connected, the app fetches the models you
  can use and each model's Effort levels for you to choose from.
- **Laptop browser:** enter an address and the app really opens the page on this computer, measures the
  requests the browser sent, this computer's network settings and the route to the server, and builds a new map and
  scenario from the results. From the moment you press Enter it shows each step through the browser, the OS DNS resolver,
  the TCP/IP stack, the routing table, the ARP cache, the network card, the home router, the modem, the ISP's routers and
  the server, and marks every header value with its source: **Observed / Derived / Typical**.
- **Packet anatomy:** the packet moving at each step is built as real bytes from Ethernet up to HTTP, and shown as the
  encapsulation layer by layer and as the bit layout of each header, like the figures in the specifications. Values are
  shown in hexadecimal or binary. The window can be moved, resized, or popped out into a window of its own.
- **Language:** choose 한국어 or English in Settings (the gear). At first the app follows the OS language; when
  you change it the app reloads, and the interface text, the examples and measured scenarios, the packet anatomy
  explanations and the AI's answers all switch to that language.
- **Globe and flat map:** a measured route is laid on a globe that shows land and sea, or on a flat world map, with each
  device at its real location (city). Devices are numbered in the order the scenario first passes through them.

## Download

Get the file for your OS from the [latest release](https://github.com/magzogs/netgongbu/releases/latest).

| OS                    | File                                        |
| --------------------- | ------------------------------------------- |
| macOS (Apple Silicon) | `NetGongbu-<version>-mac-arm64.dmg`         |
| macOS (Intel)         | `NetGongbu-<version>-mac-x64.dmg`           |
| Windows               | `NetGongbu-<version>-win-x64.exe`           |
| Linux                 | `NetGongbu-<version>-linux-x86_64.AppImage` |

## Install

- **macOS:** open the dmg and drag Net Gongbu into Applications. If macOS warns the first time that it cannot verify the
  app, go to System Settings → Privacy & Security and click **Open Anyway**.
- **Windows:** run the installer. If "Windows protected your PC" appears, click **More info** → **Run anyway**.
- **Linux:** `chmod +x NetGongbu-*.AppImage`, then run it.

Report bugs and ideas in [Issues](https://github.com/magzogs/netgongbu/issues).

## Connecting an AI

In "Ask AI", click the connection status (next to the window title) and choose ChatGPT / Claude / Local LLM and how to
connect.

- **Account sign-in (OAuth):** sign in with the ChatGPT or Claude account you subscribe to. The official CLI runs the
  sign-in in your browser and keeps the tokens: for ChatGPT, the Codex CLI's app server (`codex app-server`; the one
  inside the ChatGPT desktop app is found too), for Claude, Claude Code (`claude auth login`). Anthropic does not allow
  the OAuth tokens of Claude subscription accounts outside Claude Code and Claude.ai, so for Claude the questions are
  also handled by Claude Code (with no tools, no settings or plugins, in an empty folder).
- **API key:** an OpenAI (Responses API) or Anthropic (Messages API) key, stored encrypted with the OS keychain. The
  `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` environment variables work too.
- **CLI:** uses a `codex` or `claude` you have already installed and signed in to, as it is (the path is found
  automatically or set by hand).
- **Local LLM:** any server with an OpenAI-compatible API. For example, `ollama pull qwen2.5:7b` and run Ollama
  (`http://localhost:11434/v1`), LM Studio's local server (`http://localhost:1234/v1`), or `llama-server`
  (`http://localhost:8080/v1`). Turn on the picture of the 3D view only for models that can see images.

The model list comes from whatever you connected to. Only the Effort levels the model accepts are shown, and "Default"
follows the model's own default. The chosen AI, model and Effort are remembered in the app settings, and making
scenarios uses the same connection. The desktop app's main process holds the keys, runs the CLIs and sends every
request; the viewer reaches it only over IPC.

## Location database

To place routes on the globe, download DB-IP City Lite (about 60 MB) in Settings. Without it the route is drawn flat.

## What happens in one measurement

1. The laptop browser (an in-memory session with permissions, downloads and pop-ups blocked) opens the page. To measure
   as on a first visit, it can first clear the cache, cookies, DNS cache and open connections.
2. The DevTools Network events are grouped per request. Redirects (HSTS included) are split out, and cookie and
   authorization headers are masked.
3. It reads the default route's interface, the gateway's IP and MAC address and the DNS servers, and looks up the page's
   host again with that DNS server (with the TTL).
4. It runs traceroute to the server that answered and adds to each hop its reverse DNS name, its operator (Team Cymru
   ASN, looked up over DNS) and its location (offline database), showing them live.
5. It saves the result (`TraceReport`), and the builder makes the map (inside the laptop → home → the internet on the
   globe) and the step-by-step scenario deterministically.
   The location database's coordinates are checked against the round-trip time. Light travels about 200 km per ms in
   optical fiber, so a device with a round trip of r ms must be within r × 100 km. If it comes out farther than that (an
   anycast address, a database error), that coordinate is not used for placement and the reason is written in the
   device's description.

Steps 3 and 4 run the OS's own tools, so they work on macOS and Linux; on Windows they are not supported yet.

Router addresses are never sent to outside web services (locations come from the downloaded database, operators from DNS
lookups). The measurement history is stored only in the app's data folder on this computer.

## Packet anatomy

Open it with "Packet anatomy ▸" in the inspector, by double-clicking a packet, or with `P`. The scenario's packet is
built as bytes exactly as it rides the wire on its first leg, and shown in three views. The switch at the top shows the
values in **HEX (hexadecimal) / BIN (binary)**.

1. **Encapsulation:** from application → transport → network → data link → physical, one row per layer shows how each
   layer's unit (message, segment, packet, frame) is its own header plus the data handed down from the layer above. The
   same header sits in the same column in every row, and across an encrypted span the data of the row above turns into
   🔒 ciphertext in the row below. The Ethernet frame's padding and FCS (trailer) and the physical layer's preamble, SFD
   and interframe gap are shown too. Click a row to open that layer.
2. **Header structure:** draws the chosen layer's header 32 bits to a row, like the figures in the specifications (RFCs).
   Each field is a cell spanning its bits, so you see which bit it starts at and how many bits it takes (IPv4's Version
   0–3, IHL 4–7 …), with the real value inside in HEX or BIN. Grouped bits such as Flags are tied together by a band
   above, and long fields such as keys over 1 KB fold their middle rows (click to unfold). Click the Data row at the
   bottom to go into the inner layer.
3. **Raw data:** shows every byte of the frame (or of the content before encryption) in HEX (16 bytes per row) or BIN
   (8 bytes per row), and dims the bytes outside the chosen layer. Click a byte to open the layer and field it belongs
   to.

Hover over a cell or a list item to see beside it the field's position (its bit range in the header), its value in
hexadecimal, binary and decimal, its meaning and its source (**Observed**: measured on this computer / **Derived**:
computed from other values / **Typical**: a common value put in because it cannot be seen / **Spec**: a fixed value set by
the protocol); click to pin it. A pinned field can be asked about with "Ask AI".

Drag the anatomy window's title bar to move it, drag an edge or a corner to resize it (its position and size are
remembered), and double-click the title bar to maximize it. "New window" pops it out into an app window of its own that you can move to another monitor, and "Back into app" brings it back.
The shortcuts (←, →, Space, Esc …) work in that window too.

- **Encoded from the inside out:** lengths, checksums (the IPv4 header, TCP/UDP with the pseudo-header) and the Ethernet
  and Wi-Fi FCS (CRC-32) are really computed from what is inside. Ethernet frames shorter than 64 bytes are padded with
  zeros. DNS name compression, the TLS 1.3 ClientHello (SNI, ALPN, key_share), HPACK in HTTP/2 HEADERS (static table, no
  Huffman) and the QUIC Initial are all written to spec.
- Lower layers the scenario did not include (Ethernet, for example) are filled with typical values and marked as such.
  Calls inside one computer (getaddrinfo and so on) put no bytes on a wire, so only what the call carries is shown.
- HTTP/3 is built down to the QUIC 1-RTT packet, and the HTTP/3 frames inside it are shown only as a description.

## Controls

| Action                          | Mouse / touch                                                             | Key   |
| ------------------------------- | ------------------------------------------------------------------------- | ----- |
| Floor plan: pan · orbit · zoom  | Drag · right drag (two fingers) · wheel (pinch)                           |       |
| Globe: move · turn · zoom       | Drag · right drag (one finger; north stays up) · wheel (pinch)            |       |
| Flat map: pan · tilt · zoom     | Drag · right drag (two fingers) · wheel (toward the cursor)               |       |
| Globe ↔ flat map                | "Globe / Flat map" on the playback card                                   | G     |
| Play / pause                    | ▶ button                                                                  | Space |
| Previous / next step            | ⏮ ⏭ buttons, click the timeline                                           | ← →   |
| Follow the packet               | Follow                                                                    | F     |
| Show everything                 | Show all                                                                  | R     |
| Device info / go to that device | Click / double-click                                                      |       |
| Packet anatomy                  | "Packet anatomy ▸" in the inspector, double-click a packet                | P     |
| Ask AI                          | "Ask AI", "Ask the AI about this step", "Ask the AI" on a device or field |       |
| Laptop browser                  | Click the laptop, or "Laptop browser"                                     |       |
| Close a panel                   |                                                                           | Esc   |

On the globe and the flat map, devices are drawn like map pins, at about the same size on screen (about 100 km across
at most), and devices in the same city are set around each other a few tens of km apart, so they separate as you zoom
in. Home sits at your location (the location of the nearest ISP router), and the inside of the laptop just south of it,
each a few tens of km across; routers in the same city are moved aside around them. When labels overlap, only the label
of the device passed first stays, and the others line up beside it as number badges. With Follow on, the camera height
changes at each step to fit the size of the route, so steps inside the laptop are seen up close and steps across the
ocean from high up (a height you change with the wheel is kept). Dragging to pan on the floor plan or the flat map, or
turning the globe with a right drag, turns Follow off.

## Build from source

Needs Node 22.12 or later and pnpm 9.

```bash
pnpm install
pnpm dev
```

How the code is put together, the other commands, the release steps and the rules for changing it are in
[AGENTS.md](AGENTS.md); why it is built this way, who it is for and what is still wanted are in
[INTENT.md](INTENT.md).

## Data sources

- Borders and land: Natural Earth (public domain), through the world-atlas package
- IP locations: IP Geolocation by [DB-IP](https://db-ip.com) (CC BY 4.0), only when the user downloads it
- ASN: Team Cymru IP-to-ASN (DNS queries)
