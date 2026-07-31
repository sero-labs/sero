# Sero Pixel Engine — Implementation Plan

**Status:** Proposed
**Branch:** `feat/pixel-engine` (one branch per PR below)
**Plugin:** `@sero-ai/plugin-design-library` — the **Sprites** page
**App ID:** `design-library` · **Scope:** Global

Product behaviour lives in `docs/specs/sero-pixel-engine-spec.md`. Rationale lives in `docs/decisions/sero-pixel-engine-decisions.md`. The visual truth is `docs/prototypes/sero-pixel-engine.html`. This document is build order only.

The design spike that produced the algorithms and every sprite in the prototype is kept at `~/Downloads/pixel-spike/code/`. It is reference material, not source: port it, do not copy it.

---

## 1. Governing constraints

- **The engine imports nothing.** `pixel-engine/` has no dependencies, no Node APIs, no React and no plugin imports. Everything else may import the engine; the engine never imports back. A test enforces this.
- **No model runs in a compile path.** Resolve, render, pack and atlas are pure. No `Date.now()`, no randomness.
- **Never stretch a grid.** Whole-number factors only, everywhere — ingestion, migration, preview, export. Every surface showing a sprite sets `image-rendering: pixelated`.
- **Locks are applied last** in frame resolution, so no path can bypass them.
- **The runtime is the single authoritative writer.** Extension tools submit intent. Reuse `shared/state-io.ts` — the queue, cross-process lock and revision compare-and-swap already exist.
- No binary payloads in reactive state; no filesystem access from UI code.
- No Design Library domain types cross into pixel code, and no pixel types cross out. The only shared surface is Library references.
- No new host API.
- Never exceed 500 LOC in a source file.

## 2. Reuse map

| Need | Existing capability | Use |
|---|---|---|
| Page registration | `sero.app` manifest | Sprites as a top-level page beside Library, Design, Gallery |
| UI state | `useAppState()` | Project, clip and job summaries only |
| UI actions | `useAppTools()` | All mutation through grouped `pixel_*` tools |
| Background work | existing `createAppRuntime()` coordinator | New job kinds, same writer and lock |
| Storage primitives | `shared/state-io.ts`, `shared/file-lock.ts` | Unchanged |
| Structured AI | `host.subagents.runStructured()` | `platformTools: 'none'` plus pixel custom tools, `repair` |
| Tool-returned images | `runtime/librarian/image-tool.ts` pattern | `pixel_view_render` returns `ImageContent`; the runtime records whether it was called |
| Image budget | `host.media.prepareImage()` | Reference images on the way to the model |
| Media generation | existing `MediaProvider` contract and caps | Concept image, unchanged |
| Library references | existing item records and Librarian analysis | Read-only |
| Model choice | `AvailableModelPicker` / `useAvailableModels()` | Adds **Pixel model** |
| Agent access | `sero.plugin.bridgeTools` | Sprite tools in Sero chat |
| Tests | Vitest, jsdom per file | Unit, golden-image and fixture tests |

## 3. Target shape

```text
plugins/sero-design-library-plugin/
├── pixel-engine/                 # pure, extractable, zero dependencies
│   ├── index.ts
│   ├── schema.ts                 # project, palette, part, placement, frame, clip
│   ├── grid.ts                   # rows-of-characters codec, base32 indexes
│   ├── resolve.ts                # placements → patch → locks
│   ├── validate/
│   │   ├── structural.ts
│   │   ├── semantic.ts           # drift, orphans, silhouette, palette hygiene
│   │   └── kinds.ts              # tile continuity, item readability
│   ├── render.ts                 # grid + palette → RGBA, whole-number scale
│   ├── png.ts                    # RGBA → PNG bytes, stored deflate (no platform zlib)
│   ├── hash.ts                   # SHA-256, for the compile receipt and export checksums
│   ├── pack.ts                   # sheet layout, padding, edge extrusion
│   ├── atlas.ts                  # Aseprite-compatible JSON
│   ├── compile.ts                # resolve → pack → render → encode → hash
│   ├── player.ts                 # clip timing for a game runtime
│   ├── migrate.ts                # palette, canvas and pivot migrations
│   ├── fault.ts                  # one fault type, written to be read by a model
│   ├── testing/                  # the fixture project and the golden sheet
│   └── ingest/                   # deterministic, image-in → grid-out
│       ├── background.ts         # nearest-model classification, hole regions
│       ├── lattice.ts            # square cells, local peaks, divides rule
│       ├── quantise.ts           # majority vote, palette, ramps, de-duplication
│       └── fit.ts                # whole-number fit, pivot anchoring
├── shared/pixel/                 # plugin-side domain, JSON-serialisable
│   ├── records.ts                # project record, kept-sprite record, job kinds
│   ├── paths.ts
│   └── requests.ts
├── runtime/pixel/
│   ├── coordinator.ts            # project jobs on the existing runtime
│   ├── store.ts                  # single authoritative writer
│   ├── ingest.ts                 # engine ingest + Library reference reads
│   ├── generation/
│   │   ├── run.ts                # base pose, rig and clip runs
│   │   ├── tools.ts              # the seven custom tools
│   │   ├── prompt.ts
│   │   └── visual-pass.ts        # compile → show → repair, once
│   ├── compile.ts                # sheet + atlas + checksums
│   └── export.ts
├── extension/tools/pixel-*.ts    # intent only; never writes records
└── ui/pixel/
    ├── SpritesPage.tsx
    ├── SpritePage.tsx            # base pose and clip editor
    ├── KeptSpritesPage.tsx
    ├── canvas/                   # draw surface, onion skin, lock markers
    ├── timeline/
    └── panels/                   # palette + ramps, parts, checks
```

## 4. Tool surface

| Tool | Actions |
|---|---|
| `pixel_projects` | Create, open, rename, duplicate, soft delete, restore, purge, migrate invariant |
| `pixel_frames` | Write grid, patch cells, set lock, clear lock, reorder, duplicate, delete |
| `pixel_clips` | Create, rename, set timing, set loop, add frame, remove frame, delete |
| `pixel_parts` | Declare rig, add variant, edit part, delete part |
| `pixel_palette` | Set, re-tint, append, remove, build ramps, extract from reference |
| `pixel_generate` | Base pose, rig, clip, improve frame, improve clip, cancel |
| `pixel_kept` | Keep version, open, feature, delete, restore, purge |
| `pixel_export` | Export a kept version to Downloads or the workspace |

Tools handed to a generation run are the narrower set from spec §7.6: `pixel_draw_ops`, `pixel_write_grid`, `pixel_patch_cells`, `pixel_declare_palette`, `pixel_declare_parts`, `pixel_write_frame`, `pixel_view_render`. They validate on the way in and return faults the model can act on.

`bridgeTools` exposes the read, create and export surfaces to the main agent.

## 5. Storage

```text
sprites/<project-id>/
  record.json            invariants, palette, parts, clips, frame index
  frames/<frame-id>.json placements, patch, locks
  parts/<part-id>.json   grid rows + variants
  refs/                  local copies of traced reference drafts
  sheets/<hash>/         compiled sheet + atlas, cache only
kept-sprites/<family-id>/{family.json,versions/<version-id>/}
jobs/<job-id>.json
```

Grids persist as rows of characters, one per cell, base32. A 64×64 frame is about 4 KB of text, diffable and cheap to hand to a model. Frames are separate files because a clip rewrite must not rewrite the project record under lock.

## 6. Job contract

One persisted job per generation run (base pose, rig, one clip, one improve). Successful siblings never roll back. Cancellation uses `AbortSignal`. Restart reconciles running jobs into resumable states. Reuse the existing job machinery; add no scheduler.

---

# PR 1 — The engine

No UI, no AI. The engine and its proof.

**Build**

- [x] 1. `pixel-engine/schema.ts` and `grid.ts`: project, palette with ramps, part, placement, patch, lock, frame, clip; the rows-of-characters codec with round-trip tests.
- [x] 2. `resolve.ts`: placements in order, then patch, then locks. Locks last is a test, not a comment.
- [x] 3. `validate/structural.ts`: row count and length, index range, id uniqueness, part bounds, placement bounds, clip bounds. Every fault carries a message written to be read by a model.
- [x] 4. `validate/semantic.ts`: drift against a clip's motion budget, part-pixel integrity, orphan cells, silhouette continuity, palette hygiene, lock violation.
- [x] 5. `validate/kinds.ts`: tile edge-wrap continuity; item fill ratio and outline completeness.
- [x] 6. `render.ts`, `pack.ts`, `atlas.ts`: whole-number nearest-neighbour rendering, sheet packing with padding and edge extrusion, Aseprite-compatible atlas with `frameTags` and a pivot slice.
- [x] 7. `player.ts`: clip timing, loop, ping-pong, frame lookup — the API a game calls.
- [x] 8. `migrate.ts`: re-tint, append, remove-and-remap, canvas resize on the pivot, pivot move. Each returns a report of what it touched and refuses to clip a locked cell.
- [x] 9. Boundary test: `pixel-engine/` must contain no import of anything outside itself.
- [x] 10. Determinism test: compile a fixture project twice, and on a second process, and assert byte-identical PNG bytes and hash.

**Accept when** the engine builds and tests with zero plugin, Node or React imports; resolution puts locks last; every validator catches its fault class on a fixture built to fail it; an atlas imports into a real engine without editing; the same project renders byte-identically twice.

**Done.** 195 engine tests. The atlas-into-a-real-engine half of the acceptance is the one part PR 1 cannot prove on its own; it is checked against Godot, Unity, Phaser and LÖVE in PR 5.

Two notes for later PRs:

- **PNG size.** `png.ts` writes a *stored* deflate stream, so the same pixels give the same bytes on every platform and in every Node version. Nothing is compressed: a 51×33 sheet is about 7 KB, the same sheet at 8× is 431 KB. Exports are written at 1×, so this is affordable — but PR 5 should measure a real kept sprite before it becomes a surprise.
- **The whip fixture.** `testing/fixtures.ts` is a rigged 12×16 character with an overlapping joint and a prop of its own. It is not proof that a *stride* can be drawn by placement alone; that still needs part variants and is still owed before PR 4 closes (§7).

# PR 2 — Sprites, projects and the editor

The plugin becomes a usable pixel editor with no AI at all.

**Build**

- [ ] 1. Sprites as a top-level page: rail (All, Favourites, In progress, Recently opened, Kind, Kept, Trash), toolbar, project grid — prototype state 1.
- [ ] 2. Project records, storage layout, and the runtime store as single writer. Soft delete, restore, purge.
- [ ] 3. New sprite dialog: request, kind, canvas with **64×64 default** plus square, tall and custom sizes, palette source, clips to plan — prototype state 2.
- [ ] 4. Canvas surface: whole-number zoom, grid overlay, pivot marker, smoothing off everywhere.
- [ ] 5. Tools: pencil, eraser, fill, eyedropper, rectangle select with move, mirror draw about the pivot. Per-frame undo and redo.
- [ ] 6. Locks: a hand edit locks its cell and shows a marker; clear one, clear a selection, clear the frame; the lock list is visible in the inspector.
- [ ] 7. Palette panel: ramps, re-tint, append, remove-and-remap through `migrate.ts`, with the report surfaced.
- [ ] 8. Timeline: clips as rows, frames as cells, per-frame duration, loop mode, reorder, duplicate, delete, live preview at the real rate — prototype state 4.
- [ ] 9. Onion skinning: configurable range and opacity, previous and next tinted differently, never writes.
- [ ] 10. Invariant migrations from the UI, atomic and reversible as one history step.

**Accept when** a sprite can be drawn, animated, saved and reopened with no model involved; locks survive every path; onion skinning never mutates; a canvas resize re-anchors on the pivot and reports what it clipped; no surface stretches a grid.

# PR 3 — Ingestion

Turn a reference into a draft grid, deterministically. This is the highest-value non-AI stage and the one with the four hard-won rules.

**Build**

- [ ] 1. `ingest/background.ts`: nearest-model classification against a border-derived background model; connected-region holes with the reach-the-border-or-too-big-to-be-a-highlight rule.
- [ ] 2. `ingest/lattice.ts`: square cells, edge-energy scoring, local peaks, and the fundamental-divides-the-other-peaks rule. Returns the chosen size **and its alternatives**.
- [ ] 3. `ingest/quantise.ts`: majority vote with a one-pixel inset, palette from confident interior pixels only, de-duplication, ramp ordering.
- [ ] 4. `ingest/fit.ts`: whole-number fit or 1:1 placement with pivot anchoring and transparent padding.
- [ ] 5. Runtime path: Library reference or uploaded image → draft grid → new project, with **Trace this reference** as an explicit, labelled, recorded choice.
- [ ] 6. Detection review in the UI: show the detected cell size, the grid it implies and the alternatives, and let the user pick — detection is a judgement about the source, not a fact the file carries.
- [ ] 7. Fixture suite: synthetic sources at known cell sizes with known palettes, plus faux pixel art with baked-in checkerboard transparency, JPEG ringing, enclosed holes and near-white highlights.

**Accept when** a synthetic 8px-cell fixture is recovered at exactly its authored resolution and palette; the harmonic ladder does not fool the detector; edge fringe measures zero light desaturated cells; enclosed holes stay holes and near-white eyes stay eyes; the user can override the detected size.

# PR 4 — Generation

**Build**

- [ ] 1. The seven custom tools, each validating on the way in and returning faults written for the model.
- [ ] 2. Base pose run: blockout from a draft or from drawing operations, then refine at the pixel level, then palette declaration. Prototype state 3 is the approval gate.
- [ ] 3. Rig run: parts declared as regions of the base pose, with **joint overlap** and **props as their own parts** enforced by the validator, not by the prompt alone.
- [ ] 4. Clip runs: placements, part variants where placement cannot express the pose, sparse patches. One clip per run, from the approved rig.
- [ ] 5. Repair loop with a fixed attempt cap. A run that wrote no grid fails; a revise whose grid equals its input fails.
- [ ] 6. Visual pass: compile, return the image through `pixel_view_render`, repair once, re-check. **Improve** runs it again on demand.
- [ ] 7. Persisted jobs per run, cancellation, partial success, restart recovery.
- [ ] 8. Concept image through the existing media contract, user-triggered only, with existing caps and confirmations.
- [ ] 9. **Pixel model** setting, plus caps for canvas size, frames per clip and the visual pass.

**Accept when** a base pose is generated, reviewed and approved before any clip runs; clips keep part pixels byte-identical wherever no variant is declared; every validator fault reaches the model as actionable text; a hollow run fails honestly; locked cells survive regeneration; cancellation and restart behave like Design's variant jobs.

# PR 5 — Sheets, kept sprites, export and the agent

**Build**

- [ ] 1. Sheet view: packed sheet, layout options, whole-number scale, atlas preview — prototype state 5.
- [ ] 2. Kept sprites: immutable versions with their own grids, sheet, atlas, preview and provenance; rail, search, favourites, trash — prototype state 6.
- [ ] 3. Export: `sheet.png`, `sheet.json`, `project.json`, `palette.hex`, optional `frames/`, `pixel-engine.json` with version and checksums. Downloads or workspace, atomic managed-folder replacement, checksum verification first, refusal to replace a folder that is not a Pixel Engine export.
- [ ] 4. `bridgeTools`: list, create, add a clip, export from Sero chat.
- [ ] 5. Docs-site page for the Sprites feature.

**Accept when** a kept version stays byte-identical after its project changes; an export imports into Godot, Unity, Phaser or LÖVE without editing; `project.json` plays in `player.ts` with no sheet present; the main agent can make a sprite and export it.

---

## 7. Risks and watchlist

| Risk | Sign | Response |
|---|---|---|
| A stride cannot be expressed by placement | Torn trousers, distorted joints in a walk | Part variants are load-bearing, not optional. Prove a walk with drawn variants before PR 4 closes |
| Grid token cost at 64×64 and above | Slow, expensive clip runs | 64×64 is about 4 KB per frame. Measure per run; prefer patches over full rewrites; cap canvas and frames per clip |
| Detection is a judgement | A user's reference is read at the wrong resolution | Always show alternatives and allow an override (PR 3 item 6) |
| The engine boundary erodes | A convenient plugin import appears in `pixel-engine/` | The boundary test fails the build |
| File size | Editor and validator files grow past 500 LOC | Split by tool and by fault class from the first commit |
| Scope | Four project kinds is four validator families | Characters and items first within each PR; tiles and effects last |

## 8. Test strategy

- **Golden images.** Fixture projects render to committed PNG bytes. A change to the renderer must change a golden deliberately.
- **Fault fixtures.** One fixture per validator fault, each built to fail exactly that check.
- **Ingestion fixtures.** Synthetic sources at known cell sizes and palettes, so a detector regression is a failed assertion rather than an opinion about a picture.
- **Concurrency.** Reuse the existing stale-writer tests against the new record types.
- **Boundary.** The engine's import graph is asserted, not trusted.
