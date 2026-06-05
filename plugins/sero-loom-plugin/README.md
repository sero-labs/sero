# Loom — WebGPU Generative Art for Sero

Loom is a global Sero plugin that renders continuously morphing GPU art driven
entirely by a JSON config in the plugin's file-backed state. A human twists the
knobs in the control panel; the Sero agent twists the same knobs from natural
language ("make it feel like a stormy ocean at dusk"). Pieces can be saved to a
gallery and captured as high-resolution PNG wallpapers.

See [`SPEC.md`](./SPEC.md) for the full functional spec.

## Surfaces

- **UI** (`ui/`) — React + Three.js `WebGPURenderer` / TSL. Two paradigms:
  - **particles** — a GPU point cloud advected by an animated flow field.
  - **raymarch** — a full-screen SDF scene of smooth-blended morphing shapes.
  - Control panel, palette editor (IQ cosine palettes), mood box (`useAI`),
    preset gallery, and wallpaper capture.
- **Extension** (`extension/`) — Pi tools the agent uses to drive the art:
  - `loom_set` — merge a partial config patch (clamped to safe ranges).
  - `loom_random` — generate a fresh randomized piece.
  - `loom_preset` — save / load / list / delete saved pieces.
  - `loom_capture` — persist a captured PNG (+ optional sidecar config) to
    `$SERO_HOME/apps/loom/captures/`.
  - `/loom` prompt template teaches the agent the config schema.

## State

Single JSON-serialisable source of truth in `shared/types.ts`
(`LoomState` = live config + presets + settings). Global scope: state lives at
`$SERO_HOME/apps/loom/state.json` (Sero) or `.sero/apps/loom/state.json`
(Pi CLI fallback). The UI reads/writes it via `useAppState`; the extension writes
it atomically — both directions converge on the same file and morph smoothly.

## Develop

```bash
pnpm install
pnpm --filter @sero-ai/plugin-loom typecheck
pnpm --filter @sero-ai/plugin-loom build
```

Then run it from a checkout via **Admin → Plugins → Local Plugin Development**
in Sero, or with `SERO_DEV_PLUGINS=loom` during desktop dev.

## Notes

- WebGPU is preferred; the engine falls back to the WebGL backend automatically,
  and shows a clear "renderer unavailable" state if neither initializes.
- Three.js + TSL is a heavy dependency (bundle-size is the main known tradeoff,
  tracked in `SPEC.md` §11).
- The particle paradigm evaluates positions analytically from an animated flow
  field (stateless, robust across devices); stateful GPU-compute integration is a
  documented follow-up.
