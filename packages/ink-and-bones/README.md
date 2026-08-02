# @sero-ai/ink-and-bones

Procedural puppet animation: a character is a *program* — a skeleton, parts
painted once in bone-local space, and clips as eased curves — and the engine
bakes it onto a pixel grid, deterministically. No video model, no repair.
Ported from the Godot "CyNinja" Ink & Bones pipeline.

Zero runtime dependencies. No Node, Electron, or DOM imports in the core:
the same code runs in a browser, a worker, and a background runtime (the
three tsconfigs enforce this — the core typechecks against plain ES2023).

## The pipeline

| module | role |
| --- | --- |
| `vec`, `img` | 2D affine math; float RGBA pixel buffer |
| `paint` | painterly part canvas (capsule, ribbon, tint), bone-local |
| `skeleton` | bones, FK, 2-bone IK, verlet chain declarations |
| `motion` | clips as eased curves; gait + plant IK authoring |
| `chains` | the verlet cloth simulation (fixed 60 Hz, warmed up, deterministic) |
| `compositor` | 4x composite, then the grade: quantize, despeckle, ink outline |
| `spec` | **the character contract** (`CharacterSpec`) + bake entry points |
| `player` | renderer-agnostic clip playback (caller feeds time, caller draws) |
| `metrics`, `audit` | measured checks and the eight per-clip audit gates |
| `review` | the images a judge looks at: strips, pose grids, silhouettes |

## Try it

```sh
open packages/ink-and-bones/example/index.html
```

The example plays the reference puppet, Scout (`example/scout.ts` — the
artifact an AI would author). The committed bundle means no build step;
rebuild after edits with `example/build.sh`.

## Tests

`pnpm --filter @sero-ai/ink-and-bones test` — the regression net ported from
the Godot `puppet_selftest.gd`, the audit gates run over every Scout clip,
and golden-frame hashes for byte determinism. After a deliberate visual
change: `UPDATE_GOLDEN=1 pnpm --filter @sero-ai/ink-and-bones test -- golden`.

**Determinism scope:** same source, same bytes — on the same JS engine. The
bake leans on `Math.sin/cos/atan2/acos`, whose last-bit rounding is
implementation-defined, so the contract is per-engine: V8 (Node and
Chromium) is the reference, the goldens are recorded there, and the
background bake service is the canonical baker. A browser preview on another
engine may differ by a pixel; anything durable is baked on V8.

Feature docs and the implementation plan: `docs/features/ink-and-bones/`.
