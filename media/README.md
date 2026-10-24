# Net Gongbu media

**English** · [한국어](README.ko.md)

Videos and images of Net Gongbu for the user docs and for ads and introductions, and the tools that
made them. They come from the same source as the videos in the Net Gongbu volume of the magzog.com
book (2026-10-15, desktop app build `apps/desktop/out/renderer` of 2026-10-14).

## Real-use videos `real-use/`

The desktop app's screen (the renderer, that is, the web viewer) was run in headless Chromium and
recorded off screen. `source/recording/mock.js` stands in for the desktop app's preload
(`window.lab`), so there is no AI connection and no saved measurement: only the measured example
that ships with the app, “Measured example: from Seoul to a US server (demo data)”. There is no
personal information.

1. Open the folded “Inside the laptop · Home” on the globe → the camera comes down to Seoul and
   shows the browser, the OS DNS resolver, the TCP/IP stack, the network card, the home router and
   the modem
2. Next step (▶|) three times: HSTS, the browser asks the OS for the address, the DNS query goes out
   to the home router
3. Follow → step 16: the camera follows the TLS ClientHello across the Pacific, and the packet
   headers on the right are scrolled down to SNI, ALPN and the key exchange groups
4. Packet anatomy: open the TLS → TCP → IPv4 layers in turn, hover over the Handshake Type and Time
   To Live cells to read their explanations, then switch to BIN (binary) to see the Don't Fragment
   bit

It is 31 seconds long, with no sound. Each language was recorded separately (with the app's
language setting), so the screen text is in that language. A headless recording has no pointer, so
a pointer and click circles are drawn where the real mouse events happened (`pointer.js`). The last
0.6 seconds cross-fade into the first scene, so the loop plays without a break and also joins the
poster (the first scene).

| File                                   | Content                                                                                                                                                                       | Use                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `netgongbu-use-{ko,en}-1080p.mp4`      | 1920 × 1080. The camera moves in on the opened laptop and home, the packet headers and the packet anatomy, then back out                                                      | Ads, the main video of the docs |
| `netgongbu-use-{ko,en}-wide-1080p.mp4` | The same scenes as the whole window, without the camera                                                                                                                       | The whole flow in the docs      |
| `netgongbu-use-{ko,en}-540p.mp4`       | 960 × 540. The one in Log#10.1 (Screen) of the magzog.com book                                                                                                                | Embedding on the web            |
| `still-{ko,en}-01…06-*.png`            | 1080p stills (the whole window): the laptop and home, the DNS query, the ClientHello crossing the Pacific, the TLS headers, packet anatomy (TLS), the bits of the IPv4 header | Screenshots for the docs        |

## Motion graphics `motion/`

2D motion graphics at the end of the Features, How it works and Stack · Status pages of the Net
Gongbu volume of the magzog.com book. They use the app's own parts: white router nodes with an ink
outline, mint packets with a protocol tag (the icon's packet), the app's protocol colours (LOCAL
pink, DNS yellow, TCP blue, TLS purple, HTTP green) and layer colours, and the icon's cube. The
background is the book's teal `#C4EEEE`, text and lines are ink `#0F6464`, and the fonts are IBM
Plex Sans (KR) and IBM Plex Mono. They draw on three pins of the Pinterest board “모션그래픽”
(motion graphics) picked for them: orbit (a dot runs between rings, and a ring spreads where it
lands → hops and traceroute), planets (overlapping squares spreading around the centre → the
layers of a packet) and stopscroll (signs swinging on strings → the numbers of How it works). All
of them loop without a break.

| File                   | Length | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Size (`@2x`)            |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `features-{ko,en}.mp4` | 12.6 s | The three features in turn, each with its number and name in the header cell above: ① a packet goes step by step from the laptop → home router → ISP router → server (with a step bar and a ▶\| button below) ② traceroute on the globe: each time a ping ring spreads, a hop appears with its round-trip time, and the route becomes a 22-step scenario ③ the layers of a packet spread as overlapping squares, unfold into the encapsulation rows, and the TTL is asked to the AI | 968 × 830 (1936 × 1660) |
| `how-{ko,en}.mp4`      | 9.6 s  | How it works 01–04: typing an address and Enter, DNS (example.org → 192.0.2.10) and SYN · SYN-ACK · ACK, the home router and the ISP router, the server (GET / → 200 OK comes back). The number tag of the current step swings on a string                                                                                                                                                                                                                                          | 968 × 672 (1936 × 1344) |
| `stack.mp4`            | 7.6 s  | Seven routers appear and join into a cube, its faces fill and the icon's background is laid down, then a packet goes once around and brings up the tech stack (Three.js, TypeScript, Electron, ChatGPT · Claude). No text but the product names, so one file for both languages                                                                                                                                                                                                     | 968 × 972 (1936 × 1944) |
| `*@2x.png`             |        | Posters (one scene that stands for the video)                                                                                                                                                                                                                                                                                                                                                                                                                                       |                         |

The sizes fit the empty spaces on the book's pages. For a 16:9 or a vertical 9:16 ad, add a scene at
that size to `source/motion/edunet.html` and render it.

## Originals `raw/` (not in git)

- `take-{ko,en}.mp4`: every recorded 2x frame (2880 × 1620, about 2,740 per language), packed one
  frame per video frame (H.264 CRF 12, about 30 MB per language). Unpacked, they are the frames
  `edit.mjs` reads.
- `take-{ko,en}.json`: the in-app time (in seconds) stamped on each frame, and the record of the
  pointer actions. `edit.mjs` uses it to re-time the frames to 30 fps and to place the camera.

`media/.gitignore` keeps them out of git. To keep them with the rest, use Git LFS or another
repository. To edit again, unpack them into frames (about 1 GB per language):

```bash
cd media/raw
mkdir take-ko && ffmpeg -i take-ko.mp4 -fps_mode passthrough -q:v 2 take-ko/f%05d.jpg && cp take-ko.json take-ko/take.json
```

## Making them again `source/`

### Real-use videos `source/recording/`

Needs Node 22, ffmpeg, ImageMagick (`magick`, for the posters), `pnpm install` in this repo
(Playwright uses the playwright-core of `apps/desktop`) and Playwright's Chromium
(`npx playwright install chromium`, or the path to a Chromium in `CHROME`). The recording happens
off screen, so the screen and the mouse stay free to use.

```bash
pnpm --filter @netgongbu/desktop build      # builds the viewer into apps/desktop/out/renderer
python3 -m http.server 8190 --bind 127.0.0.1 --directory apps/desktop/out/renderer   # keep it running in another terminal
cd media/source/recording
node take.mjs ko && node take.mjs en        # → ../../raw/take-{ko,en}/ (frames + take.json), about 4 minutes per language
./cuts.sh                                   # → ../../real-use/ (two 1080p, 540p, stills), ../../site/ (for magzog.com)
```

- `take.mjs`: runs the app 6 times slower than real time (`slowmo.js`: `performance.now`,
  `Date.now`, `requestAnimationFrame` and timers; CSS animations through the DevTools protocol's
  `Animation.setPlaybackRate`), takes as many 2x screenshots as it can, and writes down the in-app
  time of each frame. That is how the 3D view stays smooth at 30 fps even when captured at 2x. What
  to press and how long to wait is in the “the take” part; the places to press are found from the
  elements on screen, so they still match when the screen text changes.
- `edit.mjs`: picks the frames by their time to make 30 fps and moves the camera (cropping and
  drawing with Chromium's canvas). The camera is in `CAMERA` at the top (times tied to action
  names, a centre in window coordinates and a scale); the times of the stills are in `STILLS`.
- The `site/` files from `cuts.sh` (`use-{ko,en}.mp4` and the posters `use-{ko,en}-poster.webp`)
  go into magHome's `public/captures/edunet/`.

### Motion graphics `source/motion/`

- `edunet.html`: HTML that draws a scene from the time `t` alone (`lib.js` and `lib.css` are copies
  of the shared parts in magHome's `scripts/motion/`). Open `edunet.html?clip=features&lang=ko` in a
  browser (`features` · `how` · `stack`, `ko` · `en`) to see the first scene; `renderAt(t)` draws
  any time. The text is in `T` at the top.
- `render.mjs`: takes the frames with Playwright and writes the video and the poster to `motion/`
  with ffmpeg (the fonts come from Google Fonts, so it needs the network).

```bash
node media/source/motion/render.mjs features ko             # → media/motion/features-ko.mp4, .png
node media/source/motion/render.mjs stack --scale 2         # → media/motion/stack@2x.mp4, .png
```

For magzog.com, the magHome repo has `scripts/motion/edunet.html` (the same page), and its
`render.mjs` writes to `src/assets/motion/`.
