# Ink & Bones — implementation plan

**Status: approved 2026-08-02. Phase 0 complete; Phase 1 not started.**
Progress rule: tick the boxes here as tasks land, per commit — this file is
the single source of truth for where the work stands.

The spike (findings in `spike.md` beside this file; its code now lives in
`packages/ink-and-bones`) proved the renderer. This plan turns it into a
product: a self-contained animation engine as a runtime library, and a
second Sprite Studio mode that consumes it.

## Locked decisions

- **P1 — The engine is its own package: `packages/ink-and-bones`**, npm
  identity `@sero-ai/ink-and-bones` (private until first publish). Zero
  runtime dependencies. No Node, Electron, or DOM imports in the core —
  the same code must run in the browser, a worker, and the background
  runtime. Sprite Studio is a consumer like any other; the package is the
  seed of a future game engine and nothing in it may know Sprite Studio
  exists.
- **P2 — A character is TypeScript source.** The LLM (or a person) writes
  a `.ts` file against the engine's authoring API. It is compiled at bake
  time with esbuild in the plugin's background runtime — the same pattern
  Design Library uses to bundle generated pages. The UI never executes
  character code; only the runtime does. No data-DSL, no rails: paints
  and clips are code, which is the entire point of the technique.
- **P3 — Phase 1 is a hard gate.** No Sprite Studio UI or state work
  starts until an LLM has converged one character end-to-end from a text
  brief inside Sero, with the audit gates and review strips as its only
  feedback. If the loop cannot converge, we stop with only Phases 0–1
  spent.
- **P4 — Audits live in the engine, not in Sprite Studio.** They are
  properties of a bake, wanted by any future consumer, and they are the
  LLM loop's feedback signal. Typed, machine-readable reports.
- **P5 — Determinism is a contract.** No randomness, no clock reads, no
  float behaviour that differs between runtimes. Same source in, same
  frames out — this is what makes review gates and caching honest.

## Phase 0 — the engine package

The spike code, promoted to a library with the missing half (audits,
tests, playback) added. Reference for everything: the Godot originals in
`repos/cyninja-prompt-demo` (`art/*.gd`, `tools/puppet_audit.gd`,
`tools/puppet_selftest.gd`, `docs/ANIMATION.md`).

- [x] Scaffold `packages/ink-and-bones` (tsconfig, vitest, exports map,
      catalog versions; no runtime deps).
- [x] Move the spike engine in: `vec`, `img`, `paint`, `skeleton`,
      `motion`, `chains`, `compositor`. Split anything over 500 LOC.
- [x] Define the character contract: a `CharacterSpec` interface
      (canvas, skeleton, parts, clips, restPose, shadow, groundRow,
      palette vocabulary) — the shape every authored file exports.
- [x] Add the playback core: frame-timing clip player, mirror handling,
      renderer-agnostic (no canvas dependency; a caller draws).
- [x] Port the audit gates from `puppet_audit.gd`: distinct-colours,
      wrap, islands, in-place (declared wobble budget), baseline
      (airborne-aware, vs groundRow), edge margin, speckle, ramp/
      vocabulary bleed. One typed `AuditReport` per clip.
- [x] Port the review renderers from `tools/puppet/`: frame strips,
      zoomed pose grids, rest-pose diff — engine returns images; callers
      encode.
- [x] Test net, modelled on `puppet_selftest.gd` (42 checks): FK/IK
      math, curve wrapping, plants, mirrors, z-order, verlet determinism,
      grade rules, fixtures proving speckle/ramp fire. Plus golden-frame
      snapshots of the Scout demo character for byte determinism.
- [x] Move the spike's demo page to `packages/ink-and-bones/example/`;
      delete `spikes/ink-and-bones/`.
- [x] Wire into the monorepo: `pnpm typecheck` and `pnpm test` cover the
      package from the root.

**Gate:** all tests green from root; the example page renders the Scout
character identically to the spike (visual check).

## Phase 1 — the authoring loop (go/no-go)

An LLM writes and converges a character inside Sero's background runtime.
This phase's product is the harness, which later becomes the production
authoring path — nothing here is throwaway.

- [x] Compile-and-load: esbuild-bundle a character `.ts` against the
      engine (engine externalized), execute in the runtime, surface
      compile/contract errors as structured feedback. Execution is
      vm-bounded: a hard timeout covers buildCharacter, the painters,
      and the whole bake, so authored code cannot wedge the runtime.
- [x] Bake service in the sprite-studio runtime: source → frames +
      `AuditReport`s + review strips, cached by source hash
      (`sha256(engine version + source)`; successes only).
- [x] The loop job: brief → author → compile → bake → audit → look at
      the strips (vision) → edit → repeat, with an iteration cap and a
      transcript of every round (`puppet-lab/<runId>/`). One subagent
      run is the loop: the write tool bakes on every call and returns
      audits + review images as tool content (the judge's
      image-handover seam), so the author keeps its context between
      rounds; convergence is measured by the runtime (`allClean`),
      never taken from the author's word.
- [x] The authoring context: a compact authoring guide distilled from
      `docs/ANIMATION.md` conventions (sign traps, canvas budgeting,
      ramp law, cloth model) — the LLM's system material, versioned in
      the repo (`AUTHORING_GUIDE`, exported by the engine package).
- [x] Run the experiment: one character from a one-paragraph brief, all
      audit gates green, strips awaiting Dan's review. Two live runs of
      "the lantern-keeper" in the dev app, each converging in 3 bakes /
      ~3 minutes. Run 1 exposed a silent engine hole (a chain painter
      written with the wrong parameter order drew nothing and passed
      every gate) — fixed at the root (ribbon/stroke now throw, guide
      states the painter signature) and re-run. Transcripts:
      `puppet-lab/exp-lantern-{1,2}/` in the orchestratordemo profile's
      design-library home.

**Gate (P3):** Dan judges the converged character acceptable and the
iteration count/cost sane. Explicit sign-off before Phase 2.
**Verdict (2026-08-02): the loop converges but the blind-authored
characters are not identifiable** ("it doesn't look like anything I can
easily identify" — the lantern-keeper twice, then a knight with
readability rules added; better, still short). Root cause: nothing in
the loop knows what right looks like, and the author grades its own
pictures. The gate stays open pending Phase 1b below.

## Phase 1b — the reference target (approved direction)

Aim the loop at a picture instead of a guess. Sprite Studio already
owns every needed piece: text→character-image generation, palette
extraction from ingestion, the image-handover tool seam, and a
vision judge that compares against a base pose.

- [ ] Reference step: brief → reference image through the existing
      character-image path (or a user-supplied picture); stored with
      the run, shown beside the results at review.
- [ ] Palette handoff: extract the reference's palette and ramps with
      the existing ingestion code; the author receives them as its
      required materials instead of inventing timid ones.
- [ ] The author sees the target: the reference image is handed into
      the authoring session as tool content (the judge image seam),
      alongside each bake's own strips.
- [ ] Independent judge: a separate session, blind to the brief, is
      shown the reference beside the render — "same character? name
      what is missing" — modelled on the video-mode judge, including
      its called-the-image-tool guard. Finishing requires the judge's
      pass; the author's self-grade is no longer the bar.
- [ ] Canvas guidance: characters in this style author at ~112x144
      (engine cap is 160); export can downscale when a smaller sheet
      is wanted.
- [ ] Fidelity: prototype at least one of the options below and
      measure it on the knight.
- [ ] Re-run the knight from Dan's reference image; gate P3
      re-review on the result.

- [x] Authoring effort: the live runs resolved to the profile's
      background default — gpt-5.6-sol at LOW thinking. The loop now
      pins thinking to high and records modelId/provider/usage in
      run.json. (The good-looking prototype was hand-iterated at full
      effort; the comparison was never level.)

Fidelity options — **revised after Sol's second opinion (2026-08-02)**,
ranked by gain per cost. Sol's headline: *shape, not colour, is the
ceiling — "more shades cannot fix a capsule-shaped knight."*

1. **Canonical target + shape tools** (Sol's first move): normalise
   the reference (matte, crop, foot-align onto the exact canvas; the
   author approves the derived target, both images kept), give the
   author silhouette OVERLAYS of render-vs-target with measured
   overlap, and add filled polygon/path/mask primitives to Paint —
   capsules alone cannot draw a helmet.
2. **Richer materials** — semantic material ramps (armour, leather,
   cloth), 4-6 steps + trim accents. Arbitrary ramp lengths already
   work; near-zero engine cost. A flat colour list is not enough.
3. **Grade controls** — outline policy first (selective, coloured, or
   off: the mandatory 1px black ring defines the current chunky
   style), before any dithering (which fights despeckle; outline,
   coverage and despeckle are golden-tested engine law today).
4. **Rig-sheet conversion** (new, from Sol) — ONE paid image
   generation of the character as separated parts (head, torso,
   limbs, gear on a sheet), then hybrid bitmap+procedural parts.
   Cleaner than cutting a finished illustration apart. `Paint.img`
   accepts arbitrary pixels and parts already rotate at 4x before
   grading, so rendering is cheap — asset storage vs the
   source-only bake cache is the real cost.
5. **Bitmap parts cut from the reference** — highest still fidelity,
   high cost (segmentation, hidden joints, pivots, seams).
6. **Mesh deformation / per-angle part variants** — high ceiling,
   very high cost; only after rigid bitmap parts prove out.
7. **Paid key-frame repair** — last resort: it can rewrite much of a
   frame, pops temporally, and breaks source→frames reproducibility.

Judge cautions (Sol): score silhouette, proportions, head, equipment
and colour placement separately — a boolean "same character?" is
gameable by one big emblem; normalise both images to the same crop,
scale and background; calibrate on known good/bad pairs; abstention
or unavailability must never count as a pass. Palette cautions: the
existing `recoverArtwork`/`buildRamps` suit generated hard pixel art,
not painted references — the reference path needs its own foreground
extraction and material grouping.

**Gate:** the knight re-run beside Dan's reference — Dan judges the
resemblance and signs off before Phase 2.

## Phase 2 — Sprite Studio as a consumer

The second mode, beside video. The existing checkpoints and screens are
reused; the pipeline between them is swapped.

- [ ] `mode: 'video' | 'puppet'` on the character record; new-character
      flow offers the choice (text brief; reference image optional as
      concept input).
- [ ] Storage: `characters/<id>/puppet/character.ts` + baked frames in
      the existing indexed-PNG store (palette-exact output; the store's
      encoder unchanged). The source file is part of the record.
- [ ] Character checkpoint = rest pose + palette approval (reuses the
      character sheet gate).
- [ ] Animation checkpoint = baked clip approval: player + strip +
      `AuditReport` surfaced plainly (reuses the review gate; no frame
      picking — there is no noisy take to pick from).
- [ ] "Fix it" instruction → LLM edits the character source (a diff),
      rebake, re-audit, back to the checkpoint. Same request/notice
      plumbing as the video mode's fix path.
- [ ] Export unchanged (frames are frames); e2e spec extended with a
      puppet-mode walkthrough on a fixture character (no LLM in tests).
- [ ] Docs: spec.md section for the mode; docs-site page update.

**Gate:** full walkthrough in the app — brief to exported sheet — plus
green e2e.

## Phase 3 — the dials surface

What the spike's sliders hinted at: cheap, reviewable edits.

- [ ] Named-dial extraction: the engine exposes a clip/skeleton's keyed
      numbers so the UI can offer safe live tweaks (stride, wind, rates,
      theme) with instant rebake — preview-only until saved as a source
      diff through the runtime.
- [ ] New-clip flow for an existing character ("add a slide") — author
      curves only, art reused.
- [ ] Retheme flow: palette swap as a first-class, near-free operation.

**Gate:** Dan drives a dial edit and a new clip end-to-end.

## Non-goals (for this plan)

- No game-engine features (scenes, physics beyond cloth, input) — the
  package boundary is what keeps that door open, not this plan.
- No replacement of the video mode; the two stand side by side.
- No hand pixel-editing of puppet frames (edits go through source; the
  workbench's pixel editor stays a video-mode tool).
