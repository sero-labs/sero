# Sero motion reel

Source for a 30-second, 1080p60 motion piece about Sero. The picture is an
HTML page. Every element is a pure function of time, so the renderer can
draw any frame on its own. The soundtrack is synthesised from code.

The reel uses the repository's own brand files (`assets/phoenix2.svg`,
`assets/logo-dark.svg`), the JetBrains Mono font from the docs site, and real
screenshots from `apps/docs-site/docs/assets/images/`.

## Structure

| Time | Section | File |
|---|---|---|
| 0:00 | "every agent starts as a spark", then the burnout loop | `src/scenes/intro.js` |
| 0:07.5 | The drop: the phoenix ignites, "grow your own agent." | `src/scenes/ignite.js` |
| 0:11.25 | Six capabilities, one bar each | `src/scenes/features.js`, `src/scenes/overlays.js` |
| 0:22.5 | Workspace wall, the ask → build → use → grow loop, end card | `src/scenes/finale.js` |

The music is 128 BPM, so 16 bars take exactly 30 seconds. The picture
(`src/lib.js`) and the soundtrack (`soundtrack.py`) use the same bar and beat
grid, so cuts and hits stay in sync.

## Render

Requirements: Node 22, Playwright with Chromium, an ffmpeg with libx264, and
Python 3 with numpy and scipy.

```bash
cd apps/homepage/scripts/showreel
python3 soundtrack.py              # out/soundtrack.wav
node render.mjs                    # out/sero-reel.mp4, about 15 min on 4 cores
node render.mjs --stills 8,14.2    # PNG stills for review
node render.mjs --regrade          # re-run only the colour grade and mux
```

`render.mjs` serves the repository on a local port and runs parallel headless
Chromium workers. Each output frame averages four sub-frames across a 180°
shutter, which gives true motion blur. ffmpeg then adds bloom, chromatic
aberration on the two impacts, a vignette and grain. Set `FFMPEG` to use a
specific ffmpeg binary. Use `--fps 30 --samples 1` for a quick draft.

To preview in a browser, serve the repository root with any static server and
open `apps/homepage/scripts/showreel/index.html?play` (real time, with sound
after a render) or `index.html?t=12.4` (one frame).
