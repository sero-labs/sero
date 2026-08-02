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

**Diagnosis first (2026-08-02).** Dan asked why the hand-built Scout
looks so much better than anything the loop produced. Measured on
`exp-knight-2` (the converged high-effort run), three causes, and
effort was not the largest:

1. **The engine discarded a third of the drawing calls in silence.**
   Six `stroke` calls passed a bare number where the per-point width
   ARRAY belongs, and one `occludeAbove` passed `(vec, depth, colour,
   n)`. Every one became NaN, drew nothing, and passed every gate. Lost:
   the brief's visor slit, the shield emblem, the sword crossguard and
   grip, and all the chest shading — the last washed the torso to flat
   white, which is why the knight reads as a slab. Its `shadow` was
   declared `{ color, opacity, radiusX, radiusY }` and never drew.
2. **Nothing told it how big to draw.** Scout: 19x53 px, head 0.80 of
   the widest body. The knight: 43x47 (nearly square), head 0.43. The
   edge gate punishes drawing big and no gate punished drawing small.
3. **The guide taught the wrong proportion** — "the head must be
   visibly narrower than the shoulders" is life drawing, not pixel art.

Dan's reference (`~/Downloads/3qzXr.jpg`) measures ~93x132 art pixels
— 2.5x the linear size the loop was authoring at on 64x80.

- [x] Engine: every authoring argument is guarded and throws
      (`src/guard.ts`); `Paint.polygon` added as the first non-capsule
      shape tool; `assertGradeAndShadow` on every bake. 7 regression
      tests, one per fault the run actually exhibited.
- [x] Engine: `fill` audit gate (declared `minFill`, default 0.75) plus
      a measured silhouette info line, so drawing small is a gate
      failure rather than a matter of taste. Engine 0.1.0 → 0.2.0.
- [x] Guide rewritten: the engine draws a SIDE view (stated, not
      implied); the head is as wide as the torso; fill the canvas;
      `polygon`; the exact `shadow` shape; canvas guidance 112x144.
- [x] `API_REFERENCE` — the authoring surface emitted as `.d.ts` by
      `pnpm build:api`, committed, staleness-tested, and handed to the
      author beside the prose guide (Dan's suggestion, the `pi-docs`
      pattern). A prose example must be generalised from; a type
      signature cannot be misread.
- [x] View decision (Dan, 2026-08-02): the reference is dead-front and
      the rig, `gait()` and the proven run are side-on. We spend one
      paid generation turning his knight into a side view of the same
      character and aim the author at that, judging against the
      original.

- [x] Reference step: a user-supplied picture (or words) → ONE paid
      image-to-image call turning it side-on, since the rig, `gait()`
      and the proven run are all profile. Written into the run's own
      directory and never re-bought; a run whose reference cannot be
      prepared FAILS rather than authoring blind under a Phase 1b name.
- [x] Canonical target: the side view separated, cropped, and stood on
      the character's own canvas at the fill the gate demands, feet on
      its ground row — so target and render differ only in what was
      drawn. Built on the studio's OWN engine (`floodForeground`,
      `keepLargestBody`, `measureSilhouette`, `rawGrid`, `capPalette`,
      `buildRamps`) after Dan pushed back on a hand-rolled first draft.
      Two findings: reducing by mean alone came back visibly blurred
      (a two-colour figure became twelve palette entries) — fixed by
      snapping to a palette measured on the SOURCE; and
      `floodForeground` could not take off a checkerboard baked into a
      JPEG, now fixed in the engine for every consumer (`pageMatch`).
      `recoverArtwork` is deliberately not used: on the real reference
      its grid detector reports block 1 with zero lift.
- [x] Palette handoff: the reference's colours as material ramps,
      commonest first, handed over as the ramps to declare. Which ramp
      is armour and which is leather is left to the model looking at
      the picture.
- [x] The author sees the target: `puppet_studio_show_target` hands it
      over as tool content with the measurements stated; whether it
      was ever called is tracked and the repair pass demands it.
- [x] Independent judge: a separate session, blind to the brief, shown
      target and render framed identically, scoring silhouette,
      proportions, head, equipment and colour SEPARATELY (never a
      boolean — one big emblem wins that). Bar: 10 of 15 with nothing
      at zero. Its verdict returns inside the bake result naming the
      one thing to fix, and it — not `allClean` — converges a
      reference-aimed run. Unreachable returns 'unavailable', never a
      pass.
- [x] Canvas guidance: characters in this style author at ~112x144
      (engine cap is 160); export can downscale when a smaller sheet
      is wanted. Set in the guide and the loop's task prompt.
- [ ] Fidelity: prototype at least one of the options below and
      measure it on the knight. (Option 1's shape tools and option 3's
      first half are in; the canonical target and the overlays are
      not.)
- [x] Part splitting (Dan, 2026-08-02): option 4 — one more paid
      picture of the character drawn as separate pieces, split by
      connected components (sound, because a parts sheet's masses do
      not touch) and each piece put at the TARGET's scale, so the
      author is told "the helmet is 22 x 19 of your 112 x 144 canvas".
      Optional and failure-tolerant: no sheet is a worse-off run, not
      a broken one. The pieces are reference, not bitmaps to blit —
      cutting a finished illustration into rotating sprite parts is
      option 5 and still unbuilt.
**Phase 1b verdict (2026-08-02): the procedural authoring loop does not
get there, and the direction changed.** Everything above was built and the
knight was re-run against Dan's reference with all of it in play. The
result was still bad, and the measurements say why: the author DOES use
the new polygon primitive (13-14 calls a bake), and bakes 2 through 5 were
structurally identical — 3 capsules, 4 discs, 14 polygons, 38 tints, every
time. It tweaks numbers; it never restructures. Writing shape coordinates
into a text file and seeing the raster thirty seconds later is not a way
to draw. Dan: "this is still looking terrible... we may have to rethink."

**Phase 1c — bitmap parts on bones (Dan's call, 2026-08-02).** Stop asking
the model to paint; bind the reference's own pixels to the bones.

- [x] `Paint.image(src, at, scale)` in the engine: stamp ready-made pixels
      into a part's canvas. NOTHING downstream changes — same skeleton,
      same 4x rotation, same z-order, same grade and ink outline, same
      cloth, same audit gates, same ramp law. A character may mix freely:
      a bitmap torso under a procedural cloak is one parts list.
- [x] Hand-rigged spike proving it: the 14 pieces stamp, rotate, grade and
      animate, and the idle clip passes every gate at 116 of 144 rows. It
      does not look good yet, because the joints and the draw order were
      guessed — an offset per part gave a heap, top-centre for everything
      gave a figure with its shoulders wrong.
- [x] Rig plan (Dan's suggestion): a separate vision call, shown the
      assembled figure and the numbered pieces, returns per piece what it
      is, which slot, which side, its z-order, and its anchor AS A
      FRACTION of the piece's own size. Validated and refused rather than
      defaulted; a planner that never looked is 'unavailable'.
- [x] Rig editor (Dan's call — Sol's highest-ROI suggestion): a joint
      editor with the knight's side view embedded, click/drag/nudge 19
      named joints, bones drawn between them so a wrong pivot reads as a
      wrong limb. Dan's placements are kept at
      `sprite-studio/runtime/puppet/fixtures/knight-joints.json`.
      https://claude.ai/code/artifact/b1116ff4-74e5-43fe-9ed9-afdba7b1eea8
      Dan's own caveat, and it is the honest limit of this reference: on a
      three-quarter drawing the far arm and wrist are OBSCURED, so those
      joints are estimates. Recorded as such in the fixture.
- [ ] **NEXT — cut the pieces from the joints, and the bind-pose gate.**
      The algorithm, written down so it is not re-derived:
      1. Segment the CANVAS-SPACE target (112x144 cells, already in the
         same space as the joints), not the source PNG. Assign every
         opaque cell to the nearest bone SEGMENT by distance to the line
         (crown-neck, neck-pelvis, shoulder-elbow, elbow-wrist,
         hip-knee, knee-ankle, ankle-toe, per side). That is the cut, and
         it keeps source coordinates by construction.
      2. Build the skeleton from the joints. Angles: api 0 points
         screen-DOWN and positive swings the tip EAST, so a bone from A
         to B has restDeg = atan2(dx, dy) in degrees, and its restDeg is
         that MINUS the parent's world angle. A child's pivot is in
         PARENT-LOCAL space: localPivot = R(-parentWorldAngle) *
         (childOrigin - parentOrigin), tracked incrementally while
         building.
      3. Each part's Paint stamps its own cells at
         (cellBBoxTopLeft - boneOrigin) * SS, so at rest every piece
         lands exactly where it was cut from.
      4. **The bind-pose gate (Sol: non-negotiable).** Bake the rest
         frame and compare it with the target: it must reproduce it
         within a small measured error. If it does not, do not animate —
         report the error instead. This is what makes every later claim
         about the rig honest.
      5. Only then: clips, the near/far z-order track, and the temporal
         stability audit.
- [ ] Open questions: rotating pixel art degrades it (only 4x supersample
      and the re-grade defend it); pieces cut from a three-quarter drawing
      in a strict side rig; far-side limbs faked by darkening a copy;
      z-order that must change mid-clip.

- [ ] Model A/B (Dan, 2026-08-02): run the same reference-aimed brief
      with anthropic/claude-opus-5 AND with gpt-5.6-sol at high
      thinking (Dan's preferred Sero model, the current baseline) and
      compare. Check the profile has the Anthropic provider configured
      before the opus run; every run records its model in run.json.
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
