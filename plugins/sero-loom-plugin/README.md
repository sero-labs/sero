# Loom — WebGPU Generative Art for Sero

Loom is a global Sero plugin that renders continuously morphing GPU art. Instead
of a fixed set of knobs, the agent **composes a layered scene graph** with an
expression language that compiles to TSL — so it can invent looks, combine
techniques, and drive any value with math. You steer it with natural language, a
persistent creative direction, or the controls directly.

See [`SPEC.md`](./SPEC.md) for the full functional spec.

## The model — an open graph + expression DSL

A `LoomGraph` is an ordered list of **layers** that blend:

- **raymarch** — a full-screen SDF scene built from a composable tree of shapes
  (`sphere/box/torus/capsule`), ops (`smin/union/subtract/intersect`), and warps
  (`twist/repeat`).
- **particles** — a GPU point cloud advected by a flow field the agent *writes*.

**Any numeric field** can be a constant or an `{ "expr": "..." }` string. The
expression language (`shared/expr.ts`) parses to an AST and compiles to TSL
(`ui/engine/expr-compile.ts`). Vars: `t, p, id, depth, ny, speed, pi`; functions:
`sin cos noise mix clamp length vec3 …`. Expressions are pure and bounded — no
code execution, no loops, no crash vectors. Numbers become tweened uniforms
(smooth, no recompile); expressions/structure trigger a layer rebuild with a
fade-in.

## Surfaces

- **UI** (`ui/`) — React + Three.js `WebGPURenderer` / TSL. Canvas + a panel with
  a "talk to Loom" box (`useAI`), a persistent **Creative Direction** field, a
  layer list, an **Advanced graph-JSON** editor, transport, and the gallery.
- **Extension** (`extension/`) — Pi tools:
  - `loom_get` — read the current graph + direction (so the agent iterates/combines).
  - `loom_compose` — set a full `graph` or a `patch`; reports expression issues.
  - `loom_direction` — read/set the persistent creative direction.
  - `loom_random` — generate a fresh randomized graph (may combine layers).
  - `loom_preset` — save / load / list / delete saved pieces.
  - `loom_capture` — persist a captured PNG (+ optional sidecar graph) to
    `$SERO_HOME/apps/loom/captures/`.
  - `/loom` prompt template is the agent's creative brief.

## State

Single JSON-serialisable source of truth in `shared/` (`LoomState` = graph +
direction + presets + settings; `graph.ts` + `expr.ts` define the visual model).
Global scope: `$SERO_HOME/apps/loom/state.json` (Sero) or `.sero/apps/loom/state.json`
(Pi CLI fallback). The UI reads/writes via `useAppState`; the extension writes
atomically — both converge on the same file. v1 (fixed-config) state and presets
migrate automatically.

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
