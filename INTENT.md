# INTENT.md — Net Gongbu

Why Net Gongbu is built the way it is, who it is for, and what is still open. `README.md` says
what the app does for the people who use it; `AGENTS.md` says how the code is put together and the
rules for changing it. When a change is not covered by a rule in `AGENTS.md`, decide it by this
file.

## Why it exists

What happens between typing an address, pressing Enter and seeing the page is usually learned from
diagrams: DNS, TCP, TLS and HTTP as boxes and arrows. Net Gongbu shows it happening instead: a page
really opened on this computer, the requests the browser really sent, the route the packets really
took, and the bytes of each packet laid out as the specifications draw them. Hand-written examples
cover what one computer cannot measure, and an AI answers the questions that come up along the
way. The app also accompanies the Net Gongbu volume of the magzog.com book (`media/README.md`).

## Who it is for

Anyone who wants to see how HTTP flows, with no prior knowledge assumed.

- The story at the centre is one web request, from the browser to the server and back. The other
  protocols (ARP, DNS, TCP, TLS, QUIC …) appear as the parts of that story.
- Plain words come first and protocol terms second; the screen introduces a term before it relies
  on it.
- Korean and English readers get the same app.

## Principles

1. **Never mix fact and guess.** Every value says where it came from: observed, derived, typical
   or fixed by the spec. A value that cannot be seen is filled with a typical one and labelled so,
   never passed off as measured.
2. **Real bytes, to spec.** A packet is encoded the way it rides the wire, with its lengths,
   checksums and FCS computed from what is inside, so what the learner reads is what an RFC
   describes.
3. **Nothing leaves this computer that does not have to.** Router addresses are never sent to
   outside web services, measurements stay in the app's data folder, and the only thing sent out on
   the user's behalf is the question to the AI they connected.
4. **The AI helps but is not trusted.** Its scenarios are validated, sent back for fixing when they
   cannot be played, and limited to the devices on the current map.
5. **Users bring their own AI.** A subscription account, an API key, a CLI they already use, or a
   local LLM. There is no server, no account with us and no running cost.
6. **Korean and English are equal.** Every screen, example, measured scenario, packet explanation
   and AI answer exists in both.

## Decisions and why

### Desktop only

The first versions ran in a web browser, which could not do what the lesson needs:

| Blocked on the web                           | In the desktop app (Electron)                                                                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watching real browser messages               | A Chromium view inside the app becomes the laptop's browser, and the DevTools protocol records request and response headers, the HTTP version (h2/h3), TLS details, DNS, connect, TLS and wait times, and the real server IP |
| traceroute, routing table, ARP, DNS settings | The main process runs the OS tools without a shell and parses their output (macOS, Linux)                                                                                                                                    |
| Opening other sites in an iframe, CORS       | Does not apply: it is a separate web view, not an iframe                                                                                                                                                                     |
| API keys, a separate server                  | The main process calls the AI directly (API, official CLIs); keys are stored encrypted with the OS keychain                                                                                                                  |
| Real packet bytes                            | Capturing needs administrator rights, so it is not supported yet → bytes are built to spec from the measured values (packet anatomy), and each value is marked observed/derived/typical/spec                                 |

Once the desktop app held the AI connection itself, the local server and the viewer's standalone
browser mode had nothing left to do and were removed (`913430f`).

### Other decisions

- **Packets are built, not captured.** Capturing needs administrator rights; building the bytes
  from the measured values needs none and works the same on every computer. Built values are
  labelled, so the learner knows which bytes were seen and which were made.
- **Locations come from an offline database**, checked against the round-trip time, rather than
  from an online lookup: less precise, but router addresses stay on this computer.
- **The builder is deterministic.** The same measurement always gives the same map and lesson, so
  a learner can come back to it and the tests and screenshots can be reproduced.
- **Claude accounts go through Claude Code.** Anthropic does not allow the OAuth tokens of Claude
  subscription accounts outside Claude Code and Claude.ai.

## Status

As of 2026-10-24 this version is close to final, and there is no date for the next update. Until
there is:

- Prefer small, contained fixes that keep the released behaviour. Ask before a large refactor or
  a new feature.
- Keep the READMEs true to the installers on the Releases page.

## Wanted in a future version

1. **Measurement on Windows (needed).** The Windows installer ships, but reading this computer's
   network settings (route, gateway, ARP, DNS servers) and tracing the route work only on macOS
   and Linux (`apps/desktop/src/main/trace/local.ts`, `traceroute.ts`). On Windows a measurement
   has the browser's part only.
2. **Packet capture (nice to have).** Observed bytes instead of built ones, where the user grants
   administrator rights. Built bytes stay the fallback, and every captured value is labelled
   observed.
3. **Examples by course or book chapter (nice to have).** Choose the examples by the table of
   contents of a curriculum or of the book, instead of the one flat list in `catalog.json` today.
