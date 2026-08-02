# Ink & Bones — TypeScript spike

A proof of concept for a possible second Sprite Studio mode: **procedural
puppet animation**, ported from the Godot "CyNinja" demo
(`../../../repos/cyninja-prompt-demo`). Every frame is drawn by code — no
video model, no frame extraction, no repair pass.

## Try it

```sh
open spikes/ink-and-bones/index.html
```

The built bundle is committed, so this works with no build step. To rebuild
after editing the source:

```sh
spikes/ink-and-bones/build.sh
```

On the page:

- **idle / run / run west / jump** — four clips baked from one rig. "run
  west" is a mirror: one line of code, zero extra art.
- **bones** — overlays the live skeleton on the playing sprite.
- **stride / scarf wind sliders, theme button** — each change rebakes the
  character from source in tens of milliseconds. This is the point: an edit
  is a one-line diff, not a new generation.

## What is in here

| file | role |
| --- | --- |
| `src/vec.ts` | vectors, affine transforms |
| `src/img.ts` | float RGBA pixel buffer |
| `src/paint.ts` | painterly part canvas (capsule, ribbon, tint) |
| `src/skeleton.ts` | bones, FK, 2-bone IK, chain declarations |
| `src/motion.ts` | clips as eased curves; gait + plant IK authoring |
| `src/compositor.ts` | verlet cloth, 4x composite, the grade (quantize, despeckle, ink outline) |
| `src/character.ts` | **the artifact an AI would author** — one puppet, four clips |
| `src/main.ts` | the demo page |

Engine files are a line-for-line port of `art/*.gd` from the Godot repo.
`character.ts` is original, written against the same authoring API.

Findings and the implementation plan live in
`docs/features/ink-and-bones/`.
