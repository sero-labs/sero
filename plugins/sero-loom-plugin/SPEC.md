# Loom — Functional Spec

> **Status:** Draft v3 · supersedes v1 (fixed config) and v2 (graph + expression DSL)
> **Plugin id:** `loom` · **Package:** `@sero-ai/plugin-loom` · **Directory:** `plugins/sero-loom-plugin/`
> **Category:** `creative` · **Scope:** `global` · **Name:** "Loom"

**Loom** is a generative art studio for Sero where the **Sero agent is the
artist**. A piece of art is real fragment-shader code (GLSL, Shadertoy
conventions) authored by the agent, rendered continuously in the plugin UI.
The agent composes, *looks at* its own output, critiques it, and refines —
the same loop a human shader artist runs. Each piece declares its own small
set of meaningful controls, so the UI is designed by the artist that made
the artwork.

---

## 1. Why v3 (diagnosis of v1/v2)

v1 gave the agent a fixed knob set; v2 opened it up to a bespoke layer graph
plus a mini expression DSL. Both underperformed for the same three reasons:

1. **A language the model has never seen.** The v2 graph/DSL exists nowhere in
   training data, while the model has read enormous amounts of Shadertoy/GLSL.
   We built a strictly weaker language the model is strictly worse at, in the
   name of safety — but shader code is already sandboxed by the GPU. The worst
   it can do is fail to compile or render slowly, both recoverable at runtime.
   Safety belongs in **run mechanics, not authoring limits**.
2. **The agent was blind.** It composed pieces without ever seeing the result,
   so quality was open-loop luck.
3. **`loom_random` was a heuristic doing an LLM's job.** RNG over parameter
   ranges produces parameter soup, not ideas.

v3 therefore changes the medium (real shaders), closes the loop (the agent
sees its output), and deletes the heuristic generator (surprise = the agent
inventing). The Sero architecture — state file, two-way sync, tools, presets,
capture — carries over unchanged.

### Goals (v3)

- The agent authors **multi-pass GLSL fragment shaders** (Shadertoy contract)
  and reliably produces good-looking, animated pieces from natural language.
- A **see → critique → refine** loop: the agent can capture frames of its own
  output as images and iterate until the piece meets the brief.
- **Per-piece controls:** each piece declares 0–8 named, typed parameters; the
  UI renders exactly those, and changes tween smoothly.
- **Canvas-first UI:** full-bleed art, a floating prompt bar, auto-hiding
  chrome, a real gallery.
- Robust run mechanics: compile errors fed back to the agent verbatim,
  frame-time watchdog, last-good fallback so the canvas never goes black.
- Keep: presets/gallery, persistent Creative Direction, capture/wallpaper
  export, `/loom` prompt template.

### Non-goals (v3)

- No WGSL/WebGPU compute passes yet (documented follow-up — GLSL/WebGL2 first
  for reliability and bundle size).
- No timeline/keyframe editor, no video/GIF export, no audio reactivity (§12).
- No user-facing node editor — the code panel is a read/tweak surface, not an
  authoring IDE. Authoring is the agent's job (or paste-in for power users).

---

## 2. Architecture fit (unchanged)

```
   Floating prompt bar ──useAI()──► Sero agent ──tools──► state.json ──watch──► shader runtime (UI)
   Per-piece controls ──useAppState()───────────────────────┘                        │
   Agent "eyes": loom_see ◄── UI captures frames ◄────────────────────────────────────┘
```

| Concern | Sero implementation |
|---------|---------------------|
| Source of truth | File-backed `state.json` via `useAppState<LoomState>()`; global scope → `~/.sero-ui/apps/loom/state.json` (`.sero/apps/loom/state.json` Pi-CLI fallback). |
| Agent → art | Pi extension tools (`loom_compose`, …) write state atomically (`temp → fs.rename`); the UI file-watcher picks it up. |
| UI → agent | Prompt bar calls `useAI().prompt(...)`; direct tool calls via `useAppTools()`. |
| Agent's eyes | `loom_see` tool + UI fulfilment round-trip (§6.3). |
| Manifest | `requiredHostCapabilities: ["appAgent.invokeTool"]`. |

### Surfaces

| Surface | Used? | Responsibility |
|---------|-------|----------------|
| **Pi extension** (`extension/`) | ✅ | Tools (`loom_get`, `loom_compose`, `loom_see`, `loom_direction`, `loom_preset`, `loom_capture`), `/loom` prompt template, atomic state IO, capture/see file writes. Pi-CLI-safe, no Sero imports. |
| **Web UI** (`ui/`) | ✅ | WebGL2 shader runtime, canvas, prompt bar, generated controls, gallery, code panel, capture rendering, build/see fulfilment. |
| **Background runtime** | ❌ | Not needed. |
| **Dashboard widget** | ◻︎ optional | Live thumbnail of the current piece (post-v1 of v3). |

---

## 3. The piece format (the agent-facing contract)

A piece is real code plus declared controls. Defined in `shared/piece.ts`.
State stays strictly JSON-serialisable.

```ts
type PassId = 'A' | 'B' | 'C' | 'D' | 'image';

interface LoomPiece {
  title: string;               // e.g. "Stormy Ocean at Dusk"
  idea: string;                // the concept, in the agent's words — kept with the piece
  common?: string;             // GLSL shared across passes (noise libs, palettes, SDF helpers)
  passes: LoomPass[];          // 1..5; exactly one 'image' pass, drawn last
  params: PieceParam[];        // 0..8 declared controls (§5)
  paramValues: Record<string, number | number[] | boolean>; // current values
}

interface LoomPass {
  id: PassId;                  // buffer passes render to ping-pong float targets
  code: string;                // GLSL ES 3.00 fragment source with mainImage(...)
  inputs?: ChannelBinding[];   // what iChannel0..3 sample
  scale?: number;              // render-target scale relative to canvas (0.25..1; buffers default 0.5)
}

interface ChannelBinding {
  channel: 0 | 1 | 2 | 3;
  source: PassId | 'self';     // 'self' = this pass's previous frame (feedback)
}
```

### 3.1 The Shadertoy contract

Each pass implements `void mainImage(out vec4 fragColor, in vec2 fragCoord)`.
The runtime provides the standard uniforms the model already knows:

- `iTime` (seconds, scaled by `settings.speed`, frozen when paused),
  `iTimeDelta`, `iFrame`
- `iResolution` (vec3, per-pass target size)
- `iMouse` (Shadertoy semantics; the canvas forwards pointer events, so pieces
  can be interactive)
- `iChannel0..3` (bound per `inputs`; buffer passes are RGBA16F, ping-ponged,
  so feedback/simulation passes — fluids, reaction-diffusion, trails — work
  exactly like on Shadertoy)
- One uniform per declared param: `u_<name>` (§5)

`common` is prepended to every pass. The runtime injects the `#version 300 es`
prelude, precision, uniform declarations, and the `main()` wrapper — the agent
writes only `mainImage` + helpers, i.e. exactly what Shadertoy taught it.

### 3.2 Structural bounds (crash-safety only, no aesthetic rails)

Validated/normalised in `shared/piece.ts`, shared by extension and UI:

- ≤ 5 passes, exactly one `image`; ≤ 64 KB source per pass; ≤ 8 params;
  names `^[a-zA-Z_][a-zA-Z0-9_]*$` and unique; `scale` clamped 0.25–1.
- No content inspection of the GLSL beyond size. Compilation is the validator
  (§4.2) — never a hand-written GLSL linter (no heuristics for LLM output).

---

## 4. The shader runtime (UI)

Hand-rolled **raw WebGL2** — no Three.js. The whole runtime is a few small
modules (context, program compile, ping-pong targets, pass scheduler, uniform
tweener). This deletes the v2 bundle-size risk (multi-MB Three.js/TSL → a few
KB) and the WebGPU-availability risk (WebGL2 is universal in Electron).

### 4.1 Lifecycle

- Mount: create context, compile the current piece, start the RAF loop.
- `ResizeObserver` on the container drives canvas + target resize (never
  `window` listeners). Keyboard shortcuts scoped to the container.
- Unmount: cancel the loop, delete programs/textures/FBOs, lose the context.

### 4.2 Compile pipeline & error contract

On every piece change (agent write or code-panel edit):

1. Compile all passes against a fresh program set. **The last-good program set
   keeps rendering** while compiling — the canvas never flashes or blanks.
2. Success → atomically swap program sets and **cross-fade** over
   `settings.transitionMs`.
3. Failure → keep rendering last-good and write a build report into state:

```ts
interface BuildReport {
  revision: number;            // echoes piece.revision (§6.2)
  status: 'ok' | 'error';
  errors: BuildError[];        // pass id, line (mapped back to the agent's source), message
  fps?: number;                // recent average, for the agent to reason about
}
```

Error lines are translated back to the agent's own source coordinates
(subtracting the injected prelude/common offset) so the model can fix them
directly.

### 4.3 Run mechanics (the safety layer)

- **Watchdog:** live rendering is capped at 60fps. New pieces start at half
  internal resolution. A rolling frame-time monitor steps slow pieces down
  (1 → 0.75 → 0.5 → 0.35 → 0.25) and recovers upward only after sustained fast
  frames.
- **Context loss:** `webglcontextlost/restored` → rebuild from state; if the
  same piece kills the context twice, mark it `status:'error'` with a
  "GPU-hostile piece" message and stay on last-good.
- **Param changes are uniforms** — tweened (eased lerp over
  `settings.transitionMs`), never a recompile. Code/structure changes
  recompile + cross-fade.

---

## 5. Per-piece controls

The agent declares what's worth touching; the UI renders exactly that.

```ts
type PieceParam =
  | { name: string; label: string; kind: 'slider'; min: number; max: number; default: number; step?: number }
  | { name: string; label: string; kind: 'color';  default: [number, number, number] }   // linear 0..1
  | { name: string; label: string; kind: 'toggle'; default: boolean }                    // uniform 0/1
  | { name: string; label: string; kind: 'xy';     default: [number, number] };          // 2D pad, 0..1
```

- Bound as `u_<name>` uniforms; edits write `paramValues` through `useAppState`
  (agent sees them via `loom_get`, and can set them via `loom_compose` for
  cheap no-recompile adjustments).
- Prompt-template guidance: 3–6 params, named in the piece's own language
  ("Storm", "Dusk color", "Drift"), each with a visible, meaningful effect.
- This *replaces* the v2 fixed control panel entirely. Global transport
  (speed/pause/capture) is the only piece-independent control surface.

---

## 6. Agent integration

### 6.1 Tools

| Tool | Purpose | Input (sketch) |
|------|---------|----------------|
| `loom_get` | Read current piece, param values, latest `BuildReport`, direction, and preset index — the iteration entry point. | `{}` |
| `loom_compose` | Set a full `piece` or a `patch` (param values, single-pass code swap, title…). Bumps `revision`, writes atomically, then **waits for the UI's `BuildReport`** for that revision (§6.2) and returns it — compile errors come back in the same tool result. | `{ piece? , patch?, transitionMs? }` |
| `loom_see` | The agent's eyes: capture 1–3 frames (optionally spaced in time to judge motion) and return them **as image content** in the tool result. | `{ frames?: 1\|2\|3, spacingSeconds?, width? (default 768) }` |
| `loom_direction` | Read/set the persistent creative direction. | `{ action: 'get'\|'set', guidance? }` |
| `loom_preset` | Save / load / list / delete gallery pieces. | `{ action, name?, id? }` |
| `loom_capture` | Write a high-res PNG (+ optional sidecar piece JSON) to the captures dir; also the UI→disk write path for §7/§6.3. | `{ dataUrl, width, height, name?, writeSidecar? }` |

`loom_random` is **removed**. "Surprise me" is a prompt path (§6.4), not RNG.

### 6.2 The build-report round-trip (compile feedback)

Only the UI has a GL context, so `loom_compose` can't compile GLSL itself.
Contract:

1. Tool writes the piece with `revision: n` and returns *after* feedback:
   it `fs.watch`es the state file (push, not polling) for
   `build.revision === n`, up to a short timeout (~4 s).
2. The UI compiles on the state change and writes the `BuildReport` back into
   state (`state.build`).
3. Tool returns the report: `ok` (with fps) or the exact errors to fix.
4. If the Loom UI isn't open, the tool times out and returns
   `"applied — not compiled (open Loom to verify), call loom_get for the build
   report later"`. State is still written; nothing is lost.

### 6.3 The see round-trip (visual feedback)

Same shape, larger payload kept out of `state.json`:

1. `loom_see` writes a request `{ id, frames, spacingSeconds, width }` into
   `state.seeRequest` and watches for fulfilment.
2. The UI renders the requested frames offscreen at the requested width
   (default 768 px wide — plenty for critique, cheap on tokens), encodes PNG
   data-URLs, and calls `loom_capture` with `purpose:'see'` + the request id;
   the extension writes them to a temp dir and marks the request fulfilled in
   state.
3. `loom_see` returns the frames as **image content blocks** so the model
   actually sees pixels, then clears the request.
4. UI closed → timeout → clear the request, return a plain-text "Loom UI is
   not open; cannot look at the piece" so the agent degrades gracefully.

### 6.4 Prompt template — a studio process, not a schema dump

`prompts/loom.md` (the `/loom` template) is rewritten around the loop:

1. **Always `loom_get` first**; honor the persistent `direction` on every
   change; build on what's there unless asked for something new.
2. **Compose → look → optional refine.** Compose one strong first draft quickly,
   fix compile errors, then call `loom_see` once (1 frame by default, 2 only
   when motion is central). Refine only for obvious mismatch, blank output,
   broken composition, or harsh artefacts.
3. **Surprise me = invention, not dice.** Pick a concept the gallery doesn't
   have yet (the template carries a technique lexicon as *inspiration, never
   rails*: fbm & domain warping, voronoi, raymarched SDFs, curl-noise flows,
   reaction-diffusion, feedback trails, kaleidoscopes, palettes). Pick one brave
   direction instead of drafting multiple concepts first.
4. **Design the controls** (§5): 3–6 params in the piece's own vocabulary.
   Always set `title` and `idea`.
5. Offer to `loom_direction set` when the user states a lasting preference;
   offer `loom_preset save` when a piece lands.

### 6.5 Scope

Global (confirmed in v1, unchanged): the studio and gallery follow the user
everywhere; the agent bridge works under global scope as proven by
`sero-cron-plugin` / `sero-mcp-plugin`.

---

## 7. UI / UX — the canvas is the app

The v2 sidebar-of-forms is removed. Principles: the art is full-bleed; chrome
overlays and auto-hides; the prompt bar is the primary interface; every panel
is a floating card over the art (`bg-background/80` + blur, `@sero-ai/ui`
components, semantic Tailwind colors only).

- **Stage:** canvas fills the panel edge-to-edge. Pointer events feed
  `iMouse`. After a few idle seconds all chrome fades; any pointer/keyboard
  activity brings it back. An explicit **ambient mode** hides everything.
- **Prompt bar** (bottom-center, floating): free text → `useAI().prompt(...)`.
  Shows a prominent generating indicator while the agent works, keeps chrome
  visible during generation, and shows the agent's one-line description when
  done.
- **Icon rail** (right edge, slim): opens floating panels —
  - **Controls** — the current piece's generated params (§5) + title/idea.
  - **Gallery** — thumbnail grid (stored preset thumbnails), click to load
    with cross-fade, save-current, rename/delete, **fork** ("riff on this" →
    routes a remix prompt through the agent).
  - **Code** — per-pass tabs + `common`, monospace editor, inline compile
    errors from `state.build`, Apply = same compile path as the agent's.
    Power-user surface; deliberately tertiary.
  - **Settings** — speed, pause, capture resolution, transition duration.
- **Transport** stays tiny: play/pause + camera button live on the rail, not
  in a panel.
- **Renderer states:** initializing shimmer; "WebGL2 unavailable" card if the
  context can't be created; build-error badge (small, non-blocking — the art
  keeps playing last-good) that opens the Code panel at the first error.
- Preset thumbnails: small JPEG data-URLs captured on save, size-capped;
  never full frames in state.

---

## 8. State model

```ts
interface LoomState {
  version: 3;
  piece: LoomPiece;            // the live artwork (replaces v2 `graph`)
  revision: number;            // bumped on every piece write (build handshake §6.2)
  build?: BuildReport;         // written by the UI after each compile
  seeRequest?: SeeRequest;     // §6.3, transient
  direction: { guidance: string };
  presets: LoomPreset[];       // { id, name, createdAt, piece, thumbnail? }
  settings: LoomSettings;      // speed, paused, transitionMs, capture (§ as v1/v2)
}
```

- `DEFAULT_LOOM_STATE` ships a hand-written default piece (never a blank
  canvas).
- **Migration:** `normalizeLoomState` migrates v1/v2 state: settings,
  direction, and capture prefs carry over; v2 presets are preserved with their
  graph JSON stored on the preset as `legacyGraph` (renderable summary in
  `idea`), so the agent can be asked to recreate any of them as shaders. The
  live v2 graph is replaced by the default piece. The v2 graph/DSL engine
  (`shared/expr.ts`, `shared/graph.ts`, `ui/engine/*` TSL modules) is deleted,
  not maintained alongside.

---

## 9. Capture / wallpaper export (carried over, minor changes)

Identical flow to v2 (§7.6 of the old spec): camera button or agent → UI
renders offscreen at target resolution/aspect (display / 1080p / 1440p / 4K /
custom), recomputing `iResolution`-dependent composition rather than
stretching the panel; `loom_capture` writes the PNG atomically to
`~/.sero-ui/apps/loom/captures/` and returns the path; browser-download
fallback; optional sidecar JSON now contains the **piece** (code + params),
making every wallpaper exactly reproducible. `loom_capture` additionally
serves as the write path for `loom_see` fulfilment (§6.3).

---

## 10. Manifest / build

Unchanged from v2 except the dependency story:

- **Drop `three`** entirely; the runtime is dependency-free WebGL2. `dist/ui`
  shrinks from multi-MB to tens of KB — the v2 bundle-size risk closes.
- Same MF pattern: remote `sero_loom`, expose `./LoomApp`, `devPort: 5199`,
  react singletons shared, `@sero-ai/app-runtime` excluded from MF sharing,
  styles via `@sero-ai/ui/styles/plugin.css`.
- `preBuilt: false`; `requiredHostCapabilities: ["appAgent.invokeTool"]`.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Agent writes GLSL that doesn't compile | Expected and cheap: exact errors return in the same `loom_compose` call; last-good keeps rendering; the loop self-heals. |
| Piece compiles but looks bad | The prompt requires one `loom_see` pass and a quick refinement when the first draft is clearly off. |
| GPU-hostile shader (infinite-ish loops, huge cost) | Watchdog resolution scaling; context-loss recovery; two-strike revert to last-good. Never static code analysis. |
| Build/see round-trips when UI is closed | Tools time out gracefully with actionable text; state writes always land. |
| `fs.watch` reliability for the handshake | Same watcher tech the UI sync already relies on; timeout fallback bounds the damage to "check loom_get later". |
| Token cost of images | `loom_see` defaults to 768 px, ≤ 3 frames; the agent controls when to look. |
| Losing v2 pieces | Presets carry `legacyGraph`; recreation-by-agent path documented (§8). Plugin is pre-release, so no external users are affected. |

---

## 12. Future work

- WGSL/WebGPU compute passes for million-particle sims (additive pass type).
- Video/GIF export; audio reactivity (mic → uniforms); dashboard widget.
- Piece lineage view (fork history); shared/portable piece JSON import-export.
- "Art of the hour" background rotation (would add a runtime surface).

---

## 13. Milestones

1. **M0 — Shader runtime.** WebGL2 multi-pass harness (compile, ping-pong
   buffers, Shadertoy uniforms, param uniforms, tweener, watchdog, last-good
   swap). Default piece renders. Old engine deleted.
2. **M1 — State + build handshake.** `shared/piece.ts` (types, bounds,
   normalize/migrate), `revision`/`BuildReport` round-trip, code panel with
   inline errors.
3. **M2 — Agent loop.** `loom_get`/`loom_compose`/`loom_see` (+ see
   fulfilment path), rewritten `/loom` template. End-to-end: "stormy ocean at
   dusk" → compose → see → refine → good piece.
4. **M3 — UI redesign.** Full-bleed stage, prompt bar, icon rail, generated
   controls, gallery grid, ambient mode.
5. **M4 — Capture + presets port.** Wallpaper export against the new runtime;
   preset save/load/fork with thumbnails; v1/v2 migration.
6. **M5 — Polish.** Perf/bundle check, degradation states, docs-site page,
   export script.

---

## 14. Acceptance criteria (v3)

- Opening Loom shows an animating default piece; chrome auto-hides.
- "Stormy ocean at dusk" in the prompt bar produces a piece that visibly
  matches the description; the agent demonstrably looked (`loom_see`) and only
  refined when the first draft was clearly off.
- A piece with a deliberate GLSL error keeps the previous art on screen and
  returns the exact compile error to the agent, which fixes it in the next
  `loom_compose`.
- The Controls panel shows only the current piece's declared params; dragging
  a slider morphs the art smoothly with no recompile.
- "Surprise me" yields a piece meaningfully different from the gallery —
  invented by the agent, no RNG config generator in the codebase.
- Save → gallery thumbnail → reload restores the piece exactly; fork routes a
  remix through the agent.
- Camera button writes a display-matched/4K PNG composed for the target
  aspect; sidecar JSON reproduces the piece.
- A GPU-heavy piece degrades via resolution scaling instead of hanging; a
  context-killing piece reverts to last-good with a clear report.
- `pnpm --filter @sero-ai/plugin-loom typecheck && build && test` pass;
  `dist/ui` contains no Three.js.
