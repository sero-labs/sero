# Loom — Functional Spec

> **Status:** Draft v1 · Functional specification (no implementation yet)
> **Plugin id:** `loom` · **Package:** `@sero-ai/plugin-loom` · **Directory:** `plugins/sero-loom-plugin/`
> **Category:** `creative` · **Scope:** `global`
> **Name:** "Loom" — confirmed display name and branding (see §13)

**Loom** is a WebGPU-accelerated generative art plugin for Sero. It renders continuously
morphing GPU art (compute-shader particle systems and raymarched SDF scenes)
that is driven entirely by a JSON configuration in the plugin's file-backed
state. A control panel lets a human twist the knobs; the **Sero agent** drives
the same knobs from natural language ("make it feel like a stormy ocean at
dusk") from day one. Pieces can be saved as named presets and recalled by either
the human or the agent.

---

## 1. Goals and non-goals

### Goals (v1)

- Render beautiful, smoothly-animating generative art at interactive framerates
  using **Three.js `WebGPURenderer` + TSL** (Three.js Shading Language) inside a
  Sero plugin UI.
- Support **two switchable paradigms** in v1:
  - **A — Compute-shader particle systems** (GPU storage buffers; curl-noise
    flow fields and strange attractors).
  - **B — Raymarched SDF scenes** (per-pixel signed-distance fields; smooth-
    blended morphing primitives).
- Drive everything from a single **JSON config** held in the plugin's
  file-backed state (the "State Registry"), read in the UI via `useAppState`.
- Make the **Sero agent a first-class driver**: a Pi extension tool lets the
  agent mutate the live config or recall presets from natural language, and the
  UI can hand a mood prompt to the agent via `useAI`.
- **Smooth transitions:** parameter changes (from human or agent) **morph**
  over a transition window rather than snapping, anchored to a global `uTime`
  uniform.
- **Procedural color** via Inigo Quilez cosine palettes (four `vec3` knobs
  `a,b,c,d`) so the agent can recolor a piece harmoniously with four vectors.
- **Preset gallery:** save the live config as a named "piece," list/load/delete
  presets, and let the agent save and recall them.
- **Capture / wallpaper export:** a camera button captures the current art as a
  high-resolution PNG (display-matched or up to 4K) written to disk for use as an
  OS or Sero wallpaper; the agent can trigger capture too.

### Non-goals (v1)

- Still-image (PNG) capture for wallpaper **is** in v1 (§7.6). Video/GIF capture
  and a high-res offline render farm remain future work (§12).
- No timeline/keyframe editor — animation is procedural + transition-tween only.
- No custom user-authored shader code entry in v1 (the agent and UI only twist
  exposed, typed knobs — this is deliberate, see §6).
- No multi-canvas / multi-window compositing.
- No audio reactivity in v1 (listed as future work).

---

## 2. Why this is a Sero plugin (architecture fit)

The original concept proposed a "future AI agent → JSON payload → central app
state → render engine" pipeline. Sero already provides every box in that diagram,
so the plugin leans into Sero primitives instead of reinventing them:

```
   Human control panel ─┐                       ┌─ TSL particle engine (Paradigm A)
                        ├─► state.json ──watch──►├─ TSL raymarch engine (Paradigm B)
   Sero agent (tools) ──┘   (State Registry)     └─ shared renderer + transition tweener
        ▲
        └── useAI().prompt("stormy ocean")  ──► agent calls loom_set tool ──► writes state.json
```

| Concept term            | Sero implementation                                                        |
|-------------------------|----------------------------------------------------------------------------|
| Central App State / "State Registry" | File-backed `state.json`, read/written in the UI via `useAppState<LoomState>()` (reactive, persistent, no `localStorage`). |
| The "future AI agent"   | Sero's own agent. UI → agent via `useAI().prompt(...)`; agent → state via the plugin's `loom_set` tool. |
| JSON payload            | `LoomConfig` (the typed live config). The tool's TypeBox schema **is** the contract the agent fills in. |
| Render engine           | Three.js `WebGPURenderer` + TSL graph, mounted in the React UI component. |
| Time-based uniforms     | A single global `uTime` uniform incremented per frame, plus a transition tweener for smooth morphs. |

This is the core reason to build it in Sero rather than as a standalone Vite app:
the agent control loop is essentially free.

---

## 3. Surfaces

A Sero plugin can expose up to three coordinated surfaces backed by one state
file. This plugin uses all but the background runtime:

| Surface | Used? | Responsibility |
|---------|-------|----------------|
| **Pi extension** (`extension/`) | ✅ | Registers agent tools (`loom_set`, `loom_preset`, `loom_random`), a `/loom` command, and the prompt template that teaches the agent the config schema. Pi-CLI-safe, no Sero imports. Reads/writes `state.json` atomically. |
| **Web UI** (`ui/`) | ✅ | The WebGPU canvas, the render engine, the control panel, the mood/prompt box, and the preset gallery. React, loaded via Module Federation. |
| **Background runtime** (`runtime/`) | ❌ (v1) | Not needed — there is no long-lived workspace orchestration. The render loop lives in the UI; agent writes go through the extension tool. Deferred unless a headless render/scheduler is added (§12). |
| **Dashboard widget** | ◻︎ Optional | A small live "now playing" thumbnail widget could expose the current piece on the Sero dashboard. Nice-to-have, not required for v1. |

---

## 4. State model (the source of truth)

All surfaces agree on one JSON-serialisable shape in `shared/types.ts`. Global
scope means state lives at `~/.sero-ui/apps/loom/state.json` (with the
`.sero/apps/loom/state.json` Pi-CLI fallback). State must be strictly
JSON-serialisable — no `Date`, `Map`, `Set`, or functions.

### 4.1 Top-level shape

```ts
interface LoomState {
  version: 1;                 // schema version for migrations
  live: LoomConfig;         // the currently-rendered config
  presets: LoomPreset[];    // saved pieces (the gallery)
  settings: LoomSettings;   // engine/runtime preferences
}

interface LoomPreset {
  id: string;                 // stable id (e.g. `piece-<counter>`)
  name: string;               // human/agent-given name, e.g. "Stormy Ocean"
  createdAt: number;          // epoch ms
  config: LoomConfig;       // a frozen snapshot of `live`
  thumbnail?: string;         // optional data-URL preview (see §7.5)
}

interface LoomSettings {
  transitionMs: number;       // default morph duration, e.g. 1500
  targetFps: number;          // soft cap, e.g. 60
  paused: boolean;            // freeze uTime advance
  quality: 'low' | 'medium' | 'high'; // particle count / raymarch step budget
  rendererBackend: 'auto' | 'webgpu' | 'webgl'; // see §8 fallback
  capture: CaptureSettings;   // wallpaper export prefs (§7.6)
}

interface CaptureSettings {
  // 'display' = match the user's screen (screen.width × height × devicePixelRatio)
  resolution: 'display' | '1080p' | '1440p' | '4k' | 'custom';
  customWidth: number;        // used when resolution === 'custom'
  customHeight: number;
  freezeOnCapture: boolean;   // pause uTime for the captured frame
  writeSidecarConfig: boolean; // also write a <name>.json with the LoomConfig
}
```

### 4.2 The config (the agent-facing payload)

`LoomConfig` is the heart of the spec — it is the JSON the agent produces and
the engine consumes. Every field is a plain number, string enum, or fixed-length
numeric tuple so it is trivial for an LLM to fill in and impossible to inject raw
shader code through.

```ts
type Vec3 = [number, number, number];

interface LoomConfig {
  paradigm: 'particles' | 'raymarch';

  // Global time/motion — every animated value is a modifier of uTime,
  // never a static jump, so changes interpolate fluidly.
  motion: {
    speed: number;            // master time multiplier (0..3)
    turbulence: number;       // global noise amplitude (0..1)
    seed: number;             // deterministic RNG seed
  };

  // Inigo Quilez cosine palette: color(t) = a + b * cos(2π(c·t + d))
  palette: { a: Vec3; b: Vec3; c: Vec3; d: Vec3 };
  background: Vec3;           // clear color

  particles: ParticleConfig;  // used when paradigm === 'particles'
  raymarch: RaymarchConfig;   // used when paradigm === 'raymarch'
}

interface ParticleConfig {
  count: number;              // resolved against settings.quality budget
  field: 'curl' | 'lorenz' | 'aizawa' | 'gravity';
  fieldStrength: number;      // 0..2
  noiseFrequency: number;     // spatial frequency of curl noise
  noiseEvolution: number;     // how fast the field morphs over uTime
  pointSize: number;          // 0.5..8
  trailFade: number;          // 0 (no trails) .. 1 (long trails)
  colorMode: 'velocity' | 'age' | 'position'; // what drives palette t
}

interface RaymarchConfig {
  primitives: SdfPrimitive[]; // 1..N blended shapes (cap N, e.g. 6)
  blendSmoothness: number;    // smooth-min k (0..1)
  cameraDistance: number;
  cameraOrbitSpeed: number;
  glow: number;               // 0..1 emissive bloom-ish factor
  fractalIterations: number;  // 0 = plain shapes; >0 = fractal fold
}

interface SdfPrimitive {
  shape: 'sphere' | 'box' | 'torus' | 'capsule';
  position: Vec3;
  scale: number;
  // each primitive may breathe on uTime: radius += morphAmount*sin(uTime*morphSpeed)
  morphAmount: number;
  morphSpeed: number;
}
```

`DEFAULT_LOOM_STATE` ships a pleasant default piece so the canvas is never
blank on first open.

### 4.3 Why this shape is "AI-friendly"

- Flat, typed, bounded knobs → the agent fills a small JSON object, never writes
  WGSL/GLSL (which LLMs hallucinate).
- The palette is four `vec3`s → the agent can completely change the mood with 12
  numbers while staying mathematically harmonious.
- Everything animated is a *modifier of `uTime`*, so the agent expresses motion
  as frequencies/amplitudes, not frame-by-frame instructions.

---

## 5. The render engine (UI)

A `LoomApp` React component owns a `<canvas>` and a renderer instance. Engine
modules live under `ui/engine/` and are deliberately split from React so they can
be unit-tested headlessly where possible.

### 5.1 Lifecycle

- On mount: create `THREE.WebGPURenderer`, `await renderer.init()`, build the
  scene graph for the active paradigm, start a `requestAnimationFrame` loop.
- A single global **`uTime` uniform** advances each frame (unless
  `settings.paused`), scaled by `config.motion.speed`.
- A **`ResizeObserver`** on the container drives canvas/renderer resize (never
  `window` resize listeners).
- On unmount: stop the loop, dispose geometries/materials/render targets, and
  **dispose the renderer/WebGPU device** (critical — leaking GPU devices across
  remounts will exhaust resources).
- Keyboard shortcuts (if any) are scoped to the container via `tabIndex={0}`,
  never `window` (per Sero plugin rules).

### 5.2 Config → engine binding

The engine reads from a single in-memory `LoomConfig` mirror of
`state.live`. When `useAppState` reports a new `live` config (human edit, or an
agent tool write picked up by the file watcher):

1. The engine diffs old vs new config.
2. Scalar/`vec3` uniforms are handed to the **transition tweener** (§5.3) which
   eases them to their targets over `settings.transitionMs`.
3. Structural changes (paradigm switch, particle `count` change, primitive
   add/remove) that can't be smoothly tweened are handled by a graceful
   rebuild + cross-fade rather than a hard cut where feasible.

### 5.3 Transition tweener

A small module interpolates "live uniform" values toward "target" values each
frame (e.g. exponential/`damp` smoothing or eased lerp). This guarantees the
"transform smoothly over time" requirement: the agent overwriting `state.live`
produces a fluid morph, not a jump. Per-field easing curves are configurable;
defaults favor smooth ease-in-out.

### 5.4 Paradigm A — compute-shader particles

- Particle position/velocity live in **GPU storage buffers**; a TSL compute pass
  integrates motion each frame from the selected flow field (`curl`, `lorenz`,
  `aizawa`, `gravity`).
- A render pass draws points/sprites; color comes from the cosine palette
  evaluated at `t` chosen by `colorMode` (velocity magnitude, particle age, or
  position).
- `count` is resolved against `settings.quality` (e.g. low ≈ 50k, medium ≈ 250k,
  high ≈ 1M+) and clamped to what the device reports it can handle.
- Optional trails via a feedback/accumulation target governed by `trailFade`.

### 5.5 Paradigm B — raymarched SDF

- A full-screen pass raymarches a scene assembled from `primitives` combined with
  smooth-min (`blendSmoothness`).
- Each primitive can breathe on `uTime` (`morphAmount`/`morphSpeed`); the camera
  can orbit (`cameraOrbitSpeed`).
- Optional fractal folding (`fractalIterations`) and a cheap `glow` term.
- Step budget scales with `settings.quality` to keep framerate interactive.

### 5.6 Shared

- Both paradigms share the renderer, the `uTime` uniform, the cosine-palette TSL
  node, the tweener, and the resize/lifecycle plumbing. Paradigm switch swaps the
  scene graph, not the renderer.

---

## 6. Agent integration (the AI driver)

### 6.1 Extension tools (Pi)

The Pi extension registers tools with `pi.registerTool()` (auto-bridged into
`sero-cli`). Tool input schemas are the agent-facing contract. Use `StringEnum`
from `@earendil-works/pi-ai` for enums.

| Tool | Purpose | Input (sketch) |
|------|---------|----------------|
| `loom_set` | Mutate the live config. Accepts a **partial** config patch so the agent can change only what it means to (e.g. just the palette). Merged over `state.live`, then written atomically. | `{ patch: DeepPartial<LoomConfig> }` |
| `loom_preset` | Save / load / list / delete presets. | `{ action: 'save'\|'load'\|'list'\|'delete', name?, id? }` |
| `loom_random` | Generate a fresh randomized config (optionally constrained to a paradigm or mood seed) and apply it. | `{ paradigm?, seed? }` |
| `loom_capture` | Persist a captured frame to disk as a PNG (and optional sidecar config). The UI renders the pixels (§7.6) and hands them to this tool, which writes the file and returns its absolute path. The agent can also request a capture ("save a 4K wallpaper"); the host completes the render-and-write round-trip. | `{ dataUrl, width, height, name?, writeSidecar? }` |

Tool writes go through the **same atomic write** (`temp → fs.rename`) the UI uses,
so the file watcher reflects changes into the UI immediately. Tools resolve the
state path from `ctx.cwd`/`SERO_HOME` inside `execute`, using `session_start`
only as a warm fallback (per Sero conventions).

`statePath` resolution, default-state seeding, and config validation/clamping
live in a shared module so the extension and UI agree (invalid agent input is
clamped to safe ranges rather than rejected, to keep the creative loop smooth).

### 6.2 Prompt template (teaching the agent the knobs)

A prompt template declared in `pi.prompts` (e.g. `./prompts/loom.md`)
documents the `LoomConfig` schema, the palette math, and good-taste guidance
("map mood words to palette + motion; prefer smooth transitions; pick a paradigm
that suits the description"). This is what lets "stormy ocean at dusk" become a
sensible `loom_set` call. A `/loom` slash shortcut maps to this template.

### 6.3 UI → agent path

The control panel includes a **mood prompt box**. On submit, the UI calls
`useAI().prompt("<user mood text>")` (or `promptStream` for token-by-token
feedback). The agent — which has the `loom_set`/`loom_preset` tools in its
session — interprets the mood and calls the tool(s); the resulting state write
morphs the canvas. The UI may also call tools directly without the LLM via
`useAppTools().run('loom_random', {...})` for a deterministic "surprise me"
button.

Because the UI uses `useAI`/`useAppTools`, the manifest declares
`requiredHostCapabilities: ["appAgent.invokeTool"]`.

### 6.4 Scope (decided: global)

Loom is a **`global`** app — an art studio is not workspace-bound, and the same
gallery of pieces should be available everywhere in Sero. This is confirmed, not
provisional: the built-in `sero-cron-plugin` and `sero-mcp-plugin` are both
`global` scope **and** use the agent bridge (`useAppTools` / `useAI` /
`useAgentPrompt`), so a global app resolves the current workspace for its agent
session. The mood box (`useAI`) and tool calls (`useAppTools`, incl.
`loom_capture`) therefore work under global scope without a fallback.

---

## 7. UI / UX

### 7.1 Layout

- **Stage:** the WebGPU canvas fills the panel; art animates continuously.
- **Control panel:** a collapsible side/overlay panel (lil-gui-style, but built
  from `@sero-ai/ui` components and Tailwind semantic colors — `bg-background`,
  `text-foreground`, etc., not a bespoke theme) bound directly to `state.live`
  via `useAppState`. Twisting a control writes state → engine morphs.
- **Mood box:** free-text prompt + "Generate" (routes to `useAI`) and a
  "Surprise me" button (routes to `loom_random`).
- **Gallery:** preset thumbnails with load/rename/delete; a "Save current as…"
  action.
- **Transport:** play/pause, speed, quality, paradigm toggle, and a **camera
  button** (capture wallpaper — §7.6).

### 7.2 Controls reflect the active paradigm

When `paradigm === 'particles'`, particle controls show; when `'raymarch'`, SDF
controls show. Palette, motion, and background controls are shared and always
visible.

### 7.3 Palette editor

Four `vec3` swatches (`a,b,c,d`) plus a live gradient strip previewing the cosine
palette across `t ∈ [0,1]`, a "randomize palette" button, and a few curated
palette presets. This is the highest-leverage mood control.

### 7.4 Live two-way sync

- Human edits a control → `updateState` → file write → engine morphs.
- Agent calls a tool → extension writes file → watcher → `useAppState` update →
  controls and engine both reflect the new values.

Both directions converge on the same `state.json`, so the panel always shows what
the agent did and vice-versa.

### 7.5 Thumbnails (presets)

On "Save preset," the UI captures a downscaled canvas snapshot
(`renderer.domElement.toDataURL` or an offscreen read-back) and stores it as the
preset `thumbnail`. Kept small to respect the JSON state size; large/raw frames
are never stored in state.

---

### 7.6 Capture & wallpaper export

Clicking the **camera button** (or asking the agent) saves the current art as a
high-resolution PNG suitable for an OS or Sero desktop wallpaper.

**Why offscreen, not a panel grab.** The on-screen canvas matches the plugin
panel's size and aspect ratio, which is wrong for a wallpaper. Capture therefore
renders a dedicated frame **off-screen at the chosen resolution and aspect**, so
the piece is composed correctly for the target screen rather than stretched from
the panel. Concretely:

1. Resolve the target size from `settings.capture` (`'display'` uses
   `screen.width × screen.height × devicePixelRatio`; presets cover 1080p / 1440p
   / 4K; `'custom'` uses `customWidth × customHeight`).
2. Allocate an offscreen render target at that size and **recompute aspect-
   dependent inputs** for the frame: raymarch camera aspect and fullscreen-pass
   UVs, particle projection, and any resolution-relative parameters. Use the
   current `uTime` (optionally frozen via `freezeOnCapture`) so the saved frame
   matches what's on screen at click time.
3. Render one frame into the target and read back the pixels
   (`renderer.readRenderTargetPixelsAsync` for WebGPU), then encode a PNG
   (`OffscreenCanvas` → `convertToBlob`, or canvas `toDataURL`).
4. Restore the live on-screen size and resume animation.

**Persisting the file.** The UI hands the encoded PNG to the `loom_capture`
tool (§6.1) via `useAppTools().run('loom_capture', { dataUrl, width, height,
name, writeSidecar })`. The Pi extension (Node `fs`) writes it atomically to a
captures directory and returns the absolute path. This follows Sero's "UI →
plugin tool" rule — no custom host bridge, consistent with how config writes
already work.

- **Destination:** default `~/.sero-ui/apps/loom/captures/<name>-<timestamp>.png`
  (global app dir; resolved from `SERO_HOME` with the Pi-CLI fallback). The
  returned absolute path is surfaced in a toast so the user can grab it and set it
  as wallpaper.
- **Browser-download fallback:** the UI also offers a direct download (anchor
  `download`) so the user always gets the file even if the tool path is
  unavailable in a given host build.
- **Reproducibility:** when `writeSidecarConfig` is on, the tool also writes
  `<name>-<timestamp>.json` containing the exact `LoomConfig` (incl. seed) next
  to the PNG, so any captured wallpaper can be regenerated or tweaked later.
  (Embedding the config in a PNG `tEXt` chunk is a possible future enhancement.)

**Size / transport note.** A 4K PNG handed through a tool call as base64 can be
tens of MB. For local single-shot exports this is acceptable over Sero's local
IPC; if it proves heavy, switch to a temp-file handoff (UI writes to a temp path,
tool moves it). Tracked alongside the bundle/perf risks (§11).

**Agent path.** Because capture is a tool, the agent can drive it
("save this piece as a 4K wallpaper"). The host performs the same offscreen
render-and-write round-trip on the agent's behalf.

## 8. WebGPU availability & graceful degradation

- Sero's UI runs in Electron (Chromium), where WebGPU is available, but it is not
  guaranteed on every platform/driver/build.
- `settings.rendererBackend: 'auto'` tries `WebGPURenderer`; on failure it falls
  back to the WebGL backend (Three.js can run the same TSL graph on a WebGL
  fallback, with reduced particle budgets) and surfaces a non-blocking notice.
- Compute-shader particles require WebGPU; under WebGL fallback the particle
  paradigm uses a reduced transform-feedback/texture-based path **or** the panel
  disables the highest particle counts and explains why. Raymarch works on both.
- If neither backend initializes, the panel shows a clear "WebGPU/WebGL
  unavailable on this device" state instead of a blank canvas.

This degradation path is part of the spec, not an afterthought, because GPU
capability varies across Sero's supported targets.

---

## 9. Manifest (`package.json`)

Triple-duty manifest (Pi + Sero app + Sero plugin). Illustrative — final values
fixed during implementation:

```jsonc
{
  "name": "@sero-ai/plugin-loom",
  "version": "0.1.0",
  "description": "WebGPU generative art studio for Sero — agent-driven, smoothly morphing GPU art.",
  "keywords": ["pi-package", "sero-plugin"],
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "pnpm exec vitest run",
    "typecheck": "tsc --noEmit -p ui/tsconfig.json && tsc --noEmit -p extension/tsconfig.json"
  },
  "pi": {
    "extensions": ["./extension/index.ts"],
    "prompts": ["./prompts/loom.md"]
  },
  "sero": {
    "app": {
      "id": "loom",
      "name": "Loom",
      "icon": "sparkles",
      "scope": "global",
      "stateFile": ".sero/apps/loom/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "LoomApp",
      "devPort": 5197
    },
    "plugin": {
      "category": "creative",
      "tags": ["generative", "art", "webgpu", "shaders", "particles", "raymarching"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool"],
      "preBuilt": false
    }
  }
}
```

Notes:
- `scope: "global"` (decided — §6.4), `stateFile` required even for global apps
  (Pi-CLI fallback).
- `devPort: 5197` — next free port (5182/5188/5193–5196 are taken).
- Three.js and React UI deps are bundled by Vite into the MF remote, so they live
  in `devDependencies` (like `motion` in existing plugins); Pi SDK packages go in
  `peerDependencies`; `@sero-ai/app-runtime` + `@sero-ai/ui` in `devDependencies`.
- `preBuilt: false` so the exported source repo is rebuilt by Sero on git/local
  install.

---

## 10. Module Federation / Vite

Follows the standard plugin pattern (see `sero-cron-plugin/vite.config.ts`):

- `base: process.env.NODE_ENV === 'production' ? './' : '/'`.
- `federation({ name: 'sero_loom', filename: 'remoteEntry.js', exposes: { './LoomApp': './ui/LoomApp.tsx' } })` (+ `./LoomWidget` if the dashboard widget is built).
- `react`/`react-dom` shared singletons; `@sero-ai/app-runtime` **not** MF-shared
  and added to `optimizeDeps.exclude`.
- `server.port` must equal `sero.app.devPort` (5197).
- `build.outDir: 'dist/ui'`, `rollupOptions.input: 'ui/index.html'`.
- Every exposed MF entry imports `./styles.css` (which pulls
  `@sero-ai/ui/styles/plugin.css` and `@source`-scans plugin files).
- **Bundle-size watch:** Three.js is heavy. Import from `three/webgpu` / `three/tsl`
  subpaths and tree-shake aggressively; verify the produced `dist/ui` size is
  acceptable. Tracked as a risk (§11).

---

## 11. Risks & open items

| Item | Notes / mitigation |
|------|--------------------|
| **Bundle size** | Three.js + TSL is large. Use subpath imports, measure `dist/ui`, lazy-load the heavier paradigm if needed. (§10) |
| **WebGPU not available** | Fallback to WebGL backend + reduced budgets; clear unavailable state. (§8) |
| **GPU resource leaks** | Must dispose renderer/device + GPU buffers on unmount and on paradigm rebuilds. (§5.1) |
| **Three.js WebGPU/TSL API churn** | TSL is young and evolving. Pin the Three.js version; isolate engine code behind a thin internal API so upgrades are localized. |
| **Agent producing nonsense configs** | Validate + clamp all tool input to safe ranges; never reject — clamp and continue. Prompt template gives taste guidance. (§6.1/6.2) |
| **Perf on low-end devices** | `settings.quality` + device-reported limits gate particle counts and raymarch steps; default to `medium`. |
| **Thumbnail cost / state bloat** | Downscale + cap thumbnail size; never store full frames in `state.json`. (§7.5) |
| **Large capture payloads** | 4K PNG base64 through a tool call can be tens of MB; acceptable for one-shot local exports, else switch to a temp-file handoff. PNGs are written to a captures dir, never into `state.json`. (§7.6) |
| **Capture aspect/composition** | Wallpaper aspect differs from the panel; capture renders off-screen at the target resolution/aspect and recomputes camera/UVs rather than grabbing the on-screen canvas. (§7.6) |
| **Headless tests** | Engine math (palette, tweener, field integrators, config validate/clamp) is unit-testable without a GPU; WebGPU rendering itself is validated manually in Sero. |

---

## 12. Future work (post-v1)

- **Audio reactivity** (mic/loopback → uniforms).
- **Export:** still image (PNG) export; later video/GIF capture.
- **Dashboard widget** showing the current piece.
- **Headless/background runtime** for scheduled "art of the hour" rotations or
  agent-curated playlists (would add `runtime/` + `appRuntime.background`).
- **More paradigms:** reaction-diffusion, fluid sim, flow-field typography.
- **Shared galleries / piece import-export** as portable JSON.

---

## 13. Naming

The plugin is named **Loom**. The name evokes weaving threads — fitting for both
the particle flow fields and the woven SDF surfaces. This is the confirmed name
and is reflected consistently across the contract surface:

| Surface | Value |
|---------|-------|
| App id (`sero.app.id`) | `loom` |
| Display name (`sero.app.name`) | `Loom` |
| npm package | `@sero-ai/plugin-loom` |
| Directory | `plugins/sero-loom-plugin/` |
| MF remote name | `sero_loom` |
| Exposed component | `LoomApp` (+ optional `LoomWidget`) |
| Tool prefix | `loom_` (`loom_set`, `loom_preset`, `loom_random`, `loom_capture`) |
| Slash command | `/loom` |
| State dir | `~/.sero-ui/apps/loom/` |

---

## 14. Milestones

1. **M0 — Skeleton.** Plugin scaffold via the `sero-plugin` skill: manifest,
   `shared/types.ts` with `LoomConfig` + `DEFAULT_LOOM_STATE`, empty
   extension + UI, MF/Vite wiring. Appears in the Sero sidebar; blank canvas.
2. **M1 — Engine core.** `WebGPURenderer` + `uTime` + cosine-palette TSL node +
   transition tweener. Raymarch paradigm rendering a default morphing piece from
   `state.live`.
3. **M2 — Particles.** Compute-shader particle paradigm + paradigm switch +
   quality budgets + WebGL fallback path.
4. **M3 — Control panel.** Full panel bound to `useAppState` (palette editor,
   motion, paradigm-specific controls, transport). Two-way live sync.
5. **M4 — Agent driver.** `loom_set` / `loom_preset` / `loom_random` tools,
   `loom.md` prompt template, mood box wired to `useAI`. End-to-end:
   "stormy ocean" → tool call → morph.
6. **M5 — Presets/gallery.** Save/load/delete named pieces with thumbnails; agent
   save/recall.
7. **M6 — Capture / wallpaper.** Camera button + `loom_capture` tool: offscreen
   high-res render at display/1080p/1440p/4K/custom, PNG write to the captures
   dir with path toast, download fallback, optional sidecar config, agent-driven
   capture.
8. **M7 — Polish & export.** Perf passes, bundle-size check, degradation states,
   then `scripts/export-plugin-source.sh` to produce the standalone git repo and
   tag it `sero-agent-plugin` for distribution.

---

## 15. Acceptance criteria (v1)

- Opening the plugin shows a smoothly-animating default piece (no blank canvas).
- Switching paradigm (particles ⇄ raymarch) works without a renderer leak.
- Editing any control morphs the art smoothly (no hard jumps).
- Asking the agent (mood box or chat) to change the mood results in a
  `loom_set` call that visibly + smoothly transforms the piece.
- A piece can be saved as a named preset and reloaded later by both human and
  agent, restoring the same look.
- Clicking the camera button writes a high-resolution PNG (display-matched or up
  to 4K, composed at the target aspect) to the captures directory and surfaces
  its path; the agent can trigger the same capture. With the sidecar option on, a
  matching `.json` config is written next to the PNG.
- On a device without WebGPU, the plugin degrades to WebGL (or a clear
  unavailable state) rather than crashing or showing a blank canvas.
- `pnpm --filter @sero-ai/plugin-loom build` and `typecheck` pass;
  `scripts/build-plugin.sh` / `export-plugin-source.sh` produce a valid bundle.

---

## 16. Addendum — v2: open graph + expression DSL

§1–§15 describe the original fixed-config design. Implementation feedback ("it
feels too restrictive") drove a pivot from *knob-twisting* to *graph-authoring*.
The shipped model supersedes the rigid `LoomConfig` where they differ.

**What changed**

- **Layered scene graph.** State is now a `LoomGraph` = an ordered list of
  **layers** that blend (`normal/add/screen`). Paradigms became layer *types*
  (`raymarch`, `particles`) that can be **combined** in one piece.
- **Expression DSL.** Any numeric field may be a constant or `{ "expr": "..." }`.
  A pure parser (`shared/expr.ts`) → AST → TSL compiler (`ui/engine/expr-compile.ts`)
  lets the agent drive anything with math (`sin`, `noise`, `mix`, `vec3`, vars
  `t/p/id/depth/ny/speed`). Bounded and safe: no code execution, no loops.
- **Composable SDF trees** (shapes / ops `smin·union·subtract·intersect` / warps
  `twist·repeat`) replace the fixed primitive list — agents compose novel forms.
- **Guardrails loosened.** Aesthetic clamps removed; only crash-safety bounds
  remain (layer/particle/SDF caps, expression length/complexity). Invalid
  expressions are *reported and fall back*, never rejected — a tight iteration loop.
- **Agent gets a brain + eyes.** Tools are now `loom_get` (read & iterate),
  `loom_compose` (set/patch graph, returns expression issues), `loom_direction`
  (persistent creative direction), plus `loom_random`/`loom_preset`/`loom_capture`.
  The prompt template is a creative brief, not a schema dump.
- **Self-steering.** A persistent **Creative Direction** (`state.direction.guidance`)
  is honored on every generation; an ad-hoc **talk box** steers in the moment;
  `loom_get` lets the agent build on the current piece.

**Smoothness model.** Plain numbers are tweened uniforms (smooth, no recompile);
expression/structure changes rebuild the affected layer with a short fade-in.
A `rebuildKey` (`shared/graph.ts`) decides which path applies.

**Migration.** v1 state and presets (fixed `LoomConfig`) migrate to v2 graphs
automatically (`migrateLegacyConfig` / `normalizeLoomState`).

**Verification.** The expression parser and graph normalization/migration/
validation/random-generation are pure and were unit-checked outside the GPU
(parser 12/12 cases; all random graphs validate clean; v1→v2 migration verified).
WebGPU rendering itself still needs a real device to validate.
