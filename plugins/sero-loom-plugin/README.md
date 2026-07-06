# Loom — Generative Art Studio for Sero

Loom is a global Sero plugin where the **Sero agent is the artist**. A piece of
art is real multi-pass GLSL (Shadertoy conventions) authored by the agent. The
agent composes, **looks at its own output** (`loom_see` returns rendered frames
as images), critiques, and refines — and each piece declares its own small set
of controls, so the UI is designed by the artist that made the artwork.

See [`SPEC.md`](./SPEC.md) for the full functional spec (v3).

## The model — real shaders, run-mechanics safety

A piece = `{ title, idea, common?, passes, params, paramValues }`:

- **passes** — up to 5 Shadertoy-style fragment shaders (`A–D` + `image`), each
  implementing `mainImage`. Buffer passes render to float ping-pong targets;
  `source: "self"` samples the pass's previous frame, enabling fluids,
  reaction-diffusion, trails, and other feedback sims. Standard uniforms:
  `iTime`, `iTimeDelta`, `iFrame`, `iResolution`, `iMouse`, `iChannel0–3`.
- **params** — 0–8 agent-declared controls (slider/color/toggle/xy) bound as
  `u_<name>` uniforms. Value changes tween live with no recompile.

There is no GLSL linting or aesthetic clamping — the compiler is the validator.
Safety is run mechanics: compile errors return to the agent verbatim (the
last-good piece keeps rendering), a frame-time watchdog scales resolution down
for heavy shaders, and a piece that kills the GPU context twice is reverted.

## Surfaces

- **UI** (`ui/`) — dependency-free WebGL2 runtime (`ui/runtime/`), full-bleed
  canvas, floating prompt bar (`useAI`), icon rail with floating panels
  (per-piece Controls + creative direction, Gallery with riff/fork, Code with
  inline build errors, Settings), auto-hiding chrome and ambient mode.
- **Extension** (`extension/`) — Pi tools:
  - `loom_get` — piece + build report + direction + preset index.
  - `loom_compose` — set a full `piece` or a `patch`; waits for the UI's
    compile and returns build errors in the same call.
  - `loom_see` — the agent's eyes: the UI renders 1–3 frames (simulated
    spacing) and they return as image content.
  - `loom_direction` / `loom_preset` / `loom_capture` — standing orders,
    gallery, and wallpaper PNG export (+ sidecar piece JSON).
  - `/loom` prompt template — the studio process (compose → see → refine).

Both handshakes are push-based (`fs.watch` on the state file, no polling): only
the UI has a GL context, so tools write a request + `revision` and wait for the
UI's `BuildReport` / see fulfilment, timing out gracefully when Loom is closed.

## State

Single JSON source of truth (`shared/types.ts`): `LoomState` = piece + revision
+ build + direction + presets + settings. Global scope:
`$SERO_HOME/apps/loom/state.json` (Sero) or `.sero/apps/loom/state.json`
(Pi CLI). v1/v2 state migrates automatically — old graph presets are kept as
`legacyGraph` so the agent can recreate their looks as shaders.

## Develop

```bash
pnpm install
pnpm --filter @sero-ai/plugin-loom typecheck
pnpm --filter @sero-ai/plugin-loom test
pnpm --filter @sero-ai/plugin-loom build
```

Then run it from a checkout via **Admin → Plugins → Local Plugin Development**
in Sero, or with `SERO_DEV_PLUGINS=loom` during desktop dev.

## Notes

- WebGL2 only (universal in Electron); no Three.js — `dist/ui` is a few hundred
  KB. Float render targets fall back to RGBA8 where `EXT_color_buffer_float`
  is unavailable.
- Wallpaper capture renders offscreen at the target resolution/aspect
  (recomposed, not stretched); feedback pieces get warm-up frames.
