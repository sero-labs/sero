# Sero Pixel Engine Specification

**Status:** Draft for review
**Package:** `@sero-ai/plugin-design-library` (Sprites surface) — extracted to its own plugin later
**Directory:** `plugins/sero-design-library-plugin/pixel-engine` (pure engine) plus plugin glue
**App ID:** `design-library`
**Companion documents:** `docs/decisions/sero-pixel-engine-decisions.md` (why), `docs/prototypes/sero-pixel-engine.html` (visual truth)

---

## 1. What this is

A sprite studio that makes pixel art from language, not from image models.

The model does not draw an image. It writes a **grid of palette indexes**. A deterministic compiler turns that grid into razor-sharp pixels, sprite sheets and animation data. Because the art is data, every pixel is exact, every frame is editable, and the same project plays in a game engine without an export step.

**Sprites** is a top-level page beside Library, Design and Gallery. It holds three surfaces:

| Surface | Question it answers |
|---|---|
| **Sprites** | What projects do I have, and what am I working on? |
| **Sprite** | What does this character look like, and how does it move? |
| **Kept sprites** | What have I finished, and what can I export? |

## 2. Principles

**The grid is the truth.** Everything else — drawing operations, quantised references, model output, user strokes — writes into one grid of palette indexes. Nothing downstream reads any other source.

**Deterministic compilation.** The same project and the same engine version always make byte-identical pixels. No model runs during compilation.

**Invariants before pixels.** Canvas size, palette, transparent index and pivot are project property, not frame property. A frame cannot disagree with the project it belongs to.

**Reuse before redraw.** An animation moves parts that already exist. A frame is only redrawn where the user or the model says so, which is why the character does not drift.

**The user's pixels win.** A hand-edited cell is locked. The model works around it and can never overwrite it.

**Honest failure.** A run that writes no grid, or writes an invalid one, fails and says why. It never reports success for art that does not exist.

**Portable.** The engine has no dependencies, no Node APIs and no plugin imports. The plugin uses the engine; the engine never uses the plugin.

## 3. First-release scope

**In**

- Four project kinds: characters and creatures, items and icons, tiles and terrain, effects
- Text intent, Library references, and an optional user-triggered concept image
- Deterministic reference ingestion: grid detection, background removal, palette extraction, majority-vote downsample
- Palette from a preset, from a model proposal, or extracted from a reference — always user-approved
- Base pose first, then clips
- Part rig with per-frame placements, part variants and sparse patches
- Full frame editor: pencil, fill, eyedropper, select and move, mirror draw, undo
- Cell locks and onion skinning
- Structural and semantic validation with in-session repair, plus one visual pass
- Sprite sheet compilation with an Aseprite-compatible atlas
- Kept sprites with immutable versions
- Export to Downloads or the active workspace
- Agent access from Sero chat

**Out (deferred)**

- Publishing the engine as an npm package (the boundary is built for it; the release is not in scope)
- Autotile rule sets and terrain transitions (plain seamless tiles are in)
- Skeletal interpolation, sub-pixel motion and tweening
- Importing Aseprite files
- Multi-layer frames
- Palette-swap variants of one project (recolours)

---

## 4. Vocabulary

**Sprite project** — the durable unit. Owns the invariants, the palette, the parts, the frames and the clips.

**Grid** — one frame's pixels as rows of palette indexes, one character per cell.

**Palette** — up to 32 colours. Index 0 is always transparent. Colours may belong to a **ramp**, which is an ordered shading run of one material.

**Part** — a reusable piece of artwork (head, torso, leg, wheel, flame) with its own grid and its place in the base pose.

**Part variant** — an alternative drawing of one part, used when a pose cannot be expressed by moving the original.

**Placement** — a part, an integer offset, and an optional flip. Placements are how a frame is built.

**Patch** — a short list of single-cell overrides applied after the placements.

**Lock** — a cell the user drew by hand. It carries its own value and is applied last, so nothing can overwrite it.

**Frame** — the resolved grid of one moment: placements, then patch, then locks.

**Clip** — a named animation (idle, walk, attack) with ordered frames, per-frame durations, a loop mode and a motion budget.

**Sheet** — the compiled sprite sheet image plus its atlas data.

**Kept sprite** — an immutable saved version of a project, with its own sheet, atlas and provenance.

---

## 5. Project invariants

These are fixed for every frame in the project:

| Invariant | Rule |
|---|---|
| Transparent index | Always index 0. Permanent, never changeable |
| Canvas size | Every frame is exactly this size |
| Palette | Every cell holds a declared index |
| Pivot | One point, used for placement, alignment and export |
| Kind | Selects which semantic checks apply |

Nothing except the transparent index is permanent. Each of the others changes through an explicit **project migration**, which is atomic, reported and reversible as one history step:

- **Re-tint an index** — changes only the colour. No pixel changes, so drift is impossible.
- **Append an index** — safe by construction; no existing frame can become invalid.
- **Remove or reorder indexes** — remaps affected cells to the nearest surviving colour and lists every frame it touched.
- **Resize the canvas** — re-anchors every frame on the pivot and reports content that fell outside. It refuses to clip a locked cell unless the user confirms.
- **Move the pivot** — recomputes placements; pixels do not move.

A migration cannot start while a generation job runs, and a generation job always sees fixed invariants.

---

## 6. Stage one — ingestion and interpretation

The output of this stage is a **brief**: what to draw, in what palette, at what size, with which parts and clips. Three inputs can feed it, in any combination.

### 6.1 Text intent

The request in plain language, plus the project kind and canvas size. This is the only required input.

The canvas defaults to **64×64** and is a prominent control, not a buried preference. It offers common square presets, tall character presets, and any custom size. Tall canvases must be as easy to reach as square ones: the tested reference is 62×135. The default is a starting point — §5 makes the canvas changeable later through a reported, reversible migration.

### 6.2 Library references

A pixel project takes Library items as references exactly as a Design does, and receives the Librarian's structured language — palette, mood, shape language, style. Reference pixels reach the model as an image for understanding, never as output.

One reference role is different and must be chosen explicitly: **trace this reference** runs the ingestion pipeline below and copies its shapes into the draft grid. This is only offered for artwork the user owns or generated, and the choice is labelled and recorded in provenance.

### 6.3 Concept image

The user can press **Concept image** to spend on the media provider and get a high-resolution starting picture from the prompt. It is never automatic. It carries the same caps, confirmations and cost display as all other media generation.

### 6.4 The ingestion pipeline (deterministic)

Any supplied image — a reference, a concept image, or existing pixel art — runs through the same non-AI pipeline:

1. **Background separation** — the border colours name the background, because a JPEG turns transparency into a baked-in checkerboard. Classification is **nearest-model, not a tolerance**: a pixel belongs to the background when it sits closer to a background colour than to any colour the artwork actually uses. An anti-aliased edge pixel is a blend of the two, and a fixed tolerance either keeps a white halo around the sprite or eats its outline.
2. **Holes must earn it** — background-looking pixels are grouped into connected regions. A region is transparent when it reaches the image border, or when it is too large to be a highlight. Without the size test, the gap inside a coiled whip fills with a solid plate; without the connection test, near-white eyes and metal highlights punch holes in the face.
3. **Grid detection** — measure where colour changes, then find the cell lattice that explains those changes. Three rules are load-bearing: cells are **square**, so one size serves both axes; candidate sizes are the **local peaks**, since a bigger lattice always scores slightly higher and score alone always picks the largest; and the true size is the peak that **divides the other peaks**, because every whole multiple of it explains the same edges. Miss the last rule and the detector under-samples the artwork by a whole factor.
4. **Majority vote** — each cell takes the most common colour inside it, inset by one source pixel to avoid compression noise at the borders.
5. **Palette extraction** — median cut over confident interior pixels only, then **de-duplication**, because raw median cut spends indexes on colours the eye cannot separate. A blended edge pixel must never define a palette colour. Surviving colours are ordered into ramps.
6. **Canvas fit** — crop to the artwork and resample to the project canvas by majority vote, with a coverage rule deciding transparency.

The result is a **draft grid**: on-grid, on-palette, correct silhouette, no detail. It is a starting point, not art.

### 6.5 Why the draft matters

Correcting a grid is far more reliable than inventing one. Every generation path therefore tries to hand the model a draft before asking it to think about pixels.

---

## 7. Stage two — generation

Generation runs in an isolated subagent with `platformTools: 'none'` and only the custom tools below, the same shape the Design generation run uses. It has no workspace, no filesystem, no network.

### 7.1 The run unit

**The base pose first.** The first run produces the base pose, the palette and the part rig, and nothing else. The user approves it before any clip is paid for. Clips are generated afterwards, one at a time, from the approved rig.

### 7.2 Blockout

The model produces the first grid one of two ways:

- **From a draft** — the ingestion pipeline already made it. The model receives the grid as text with a coordinate ruler.
- **From nothing** — the model calls `pixel_draw_ops` with primitives (rectangle, ellipse, line, flood, mirror, stamp) which the engine rasterises deterministically.

Drawing operations are an authoring channel only. They are never stored: the compiler runs them once and keeps the grid.

### 7.3 Refine

The model then edits pixels directly. It receives the current grid as text and writes either whole rows or a patch of cells. A 32×48 grid is about 1600 characters, so a full rewrite is affordable and a patch is cheap.

This is where outlines, shading ramps, facial features and readability are added — the things a downsample cannot produce.

### 7.4 Rig

The model declares the parts by naming regions of the base pose, and gives each a pivot. A part is cut once. From that moment its pixels are fixed unless a variant is declared or the user edits them.

Two rules make a rig hold together, and both were learned by breaking them:

**Joints overlap.** Every part extends past its joint by a few rows, and the draw order puts the upper part last. Parts cut edge to edge look correct in the base pose and split the moment anything moves — raise the body one pixel and a transparent row opens across the hips.

**A prop is its own part.** Anything that hangs, trails or is carried — a whip, a scabbard, a cape, a tail — gets its own part and its own placement. Left inside a leg's cut it swings with every step, which reads as the character deforming.

### 7.5 Clips

For each frame the model gives placements — a part, an integer offset, an optional flip — plus a sparse patch for what placement cannot express. It may declare part variants where a pose genuinely needs new artwork, for example a leg seen from a different angle.

A frame is never authored as an independent full grid. This is the anti-drift mechanism: shared pixels are shared data, so they cannot differ between frames.

### 7.6 Tools

| Tool | Purpose |
|---|---|
| `pixel_draw_ops` | Rasterise drawing primitives into the working grid |
| `pixel_write_grid` | Replace the working grid, as rows of indexes |
| `pixel_patch_cells` | Change listed cells only |
| `pixel_declare_palette` | Propose the palette with ramps and roles |
| `pixel_declare_parts` | Cut the rig from the base pose |
| `pixel_write_frame` | Declare one frame's placements, variants and patch |
| `pixel_view_render` | Return the compiled frame or sheet as an image |

Every tool validates on the way in and returns its faults as a tool error the model can act on. The runtime, not the reply, decides whether art was produced.

---

## 8. Stage three — the validation firewall

Validation is one pure module in the engine. The same checks run for model output, tool input, user edits and import.

### 8.1 Structural — always rejected

- Row count equals canvas height; every row length equals canvas width
- Every character maps to a declared palette index
- Index 0 means transparent and nothing else
- Part origins and sizes lie inside the canvas
- A placement names a declared part or variant and keeps most of it on canvas
- Clip frames exist, durations are within bounds, frame count is within the cap
- Identifiers are unique

### 8.2 Semantic — rejected or reported by severity

- **Lock violation** — any write to a locked cell. Always rejected, cell restored, reported by coordinate.
- **Drift** — the silhouette box of a frame moves further than the clip's declared motion budget.
- **Part integrity** — a part's pixels differ where no variant was declared.
- **Orphan pixels** — isolated cells above a threshold.
- **Silhouette continuity** — the body is one connected region, unless the project declares detached parts.
- **Palette hygiene** — unused indexes, single-use colours, shading that leaves its ramp.
- **Tile continuity** (tile kind) — the left column matches the right, the top matches the bottom.
- **Readability** (item kind) — minimum fill ratio and a complete outline.

### 8.3 Repair

Faults return to the model in-session, written to be read by the model, with a fixed attempt cap. The rules match the Design generation run: a run that never wrote a grid fails; a revise whose grid equals the grid it started from fails, because agreeing with itself is not a revision.

### 8.4 The visual pass

After structural and semantic checks pass, the engine compiles the frame or clip to an image and shows it back to the model **once** through `pixel_view_render`. The model repairs what it can see — fused legs, a lost silhouette, a limb that reads as background — and the checks run again on the repaired grid.

One pass is the default because in testing one pass fixed every visible fault. The user can ask for more with **Improve** on any frame or clip.

---

## 9. Stage four — compilation

Deterministic, non-AI, and the whole of it lives in the engine.

**Resolve** — placements in order, then patch, then locks. Locks last is what makes the user's pixels win.

**Render** — index grid plus palette to RGBA. Integer nearest-neighbour scaling only. No blending, no anti-aliasing, no filtering at any point.

**Never stretch a grid.** Fitting artwork to a canvas uses a whole-number factor, or places it as drawn and pads with transparency. A fractional resample duplicates some rows and drops others, which turns a belt into a band across the hips and a gap between the legs into a grey column. This rule applies to ingestion, canvas migration, preview and export alike.

**Smoothing is off everywhere.** Every surface that shows a sprite — canvas, timeline, onion skin, cards, previews — sets `image-rendering: pixelated` and scales by whole numbers only. A browser or a viewer that smooths on zoom makes exact pixels look blurred, and the fault is never in the data.

**Pack** — frames into a sheet: one row per clip, fixed cell size, optional padding and edge extrusion so a game engine cannot bleed neighbouring frames at non-integer zoom.

**Atlas** — an Aseprite-compatible JSON: `frames` with bounds and durations, `meta.frameTags` for clips, and the pivot as a slice. Godot, Unity, Phaser and LÖVE already import this.

**Guarantee** — the same project and engine version produce byte-identical output. The engine records its version and a content hash with every compile.

---

## 10. The editor

The working surface holds the canvas, the palette, the parts, the clip timeline and the inspector.

**Tools** — pencil, eraser, fill, eyedropper, rectangle select with move, and mirror draw about the pivot. Undo and redo are per frame.

**Locks** — a hand-edited cell is locked automatically and shown with a marker. Locks can be cleared individually, per selection, or for the whole frame. The lock list is visible, because an invisible lock that blocks the model is a trap.

**Onion skinning** — the previous and next frames render behind the current one, dimmed, with configurable range and opacity. Onion skinning never writes.

**Timeline** — clips as rows, frames as cells, with per-frame duration, loop mode and a live preview at the real frame rate. Frames can be reordered, duplicated and deleted.

**Regeneration** — any frame or clip can be regenerated from the request. Locked cells survive it. The previous state is kept as a revision.

---

## 11. Kept sprites

Sprite projects keep their own surface. A kept sprite is an immutable version holding the exact project data, the compiled sheet, the atlas, a preview and the provenance. Later edits to the source project never change it.

The rail matches Library and Gallery: All sprites, Favourites, Recently saved, Trash. Search uses the shared control. Deletion hides until restore or permanent deletion, and never cascades.

Sprite versions are never mixed into the web-design Gallery. This keeps one content type per surface, and it lets the whole sprite feature leave for its own plugin without splitting a shared store.

---

## 12. Export

Export writes a folder to Downloads or the active workspace:

```
<name>/
  sheet.png            compiled sprite sheet
  sheet.json           Aseprite-compatible atlas: frames, frameTags, pivot slice
  project.json         native project data — a runtime can play this directly
  palette.hex          the palette, for art tools
  frames/              optional single-frame images
  pixel-engine.json    engine version, checksums, provenance
```

Export never regenerates. It verifies checksums first. A workspace export writes one managed folder and replaces it atomically on a later export, and it refuses to replace a folder that is not a Pixel Engine export.

---

## 13. Settings

Added to the existing options page:

- **Pixel model** — used for blockout, refine, rig and clips. Same picker and default as the other model settings.
- **Default canvas** (64×64 out of the box) and **default palette preset** for new projects.
- **Maximum canvas size** and **maximum frames per clip**, as bounded steppers.
- **Visual pass** — one look (default) or off.
- Concept image spend follows the existing media caps and confirmations.

---

## 14. Agent access

The plugin exposes sprite tools through `sero.plugin.bridgeTools`, so the main Sero agent can list projects, make a base pose, add a clip, edit frames and export. Agent runs carry the same caps, locks and validation as in-app work.

---

## 15. Storage and ownership

Reactive state holds summaries only. Full projects, frames and images are plugin-owned files under the global app state directory.

- The background runtime is the single authoritative writer. Extension tools submit intent.
- One authoritative serialisation path per project and per index.
- Kept sprites own immutable copies of everything they need.
- Writes use the existing cross-process lock and revision compare-and-swap.

Grids persist as rows of characters, one character per cell, which keeps a project small, readable in a diff, and cheap to hand to a model.

---

## 16. The engine boundary

`pixel-engine/` contains the schema, the validator, the resolver, the renderer, the packer, the atlas writer and the clip player. It has:

- no dependencies,
- no Node APIs,
- no imports from the plugin, the host, or React,
- no `Date.now()` or randomness in any compile path.

Everything else may import the engine. The engine imports nothing back. It runs unchanged in the plugin runtime, in the browser UI, and in a game. Extracting it later to `@sero-ai/pixel-engine` must be a move, not a rewrite.

**No host change is required.** The feature uses existing seams only: the subagent runner, the media contract, the image budget, plugin state and the tool bridge.

---

## 17. Receipts

Measured during design, on a 32×32 knight and on a supplied 784×1168 faux-pixel-art character:

| Finding | Measurement |
|---|---|
| A frontier model holds a 32×32 grid | 32 rows authored by hand, zero row-length or palette faults |
| Grid text is cheap | 32×48 grid is about 1600 characters, roughly 420 tokens |
| Run-length encoding does not pay | 1052 characters projected against 1121 raw, on detailed art |
| Drawing operations alone are coarse | Fused legs, missing boots and no arm, until repaired |
| The visual pass works | One look, four faults found, all four fixed |
| Ingestion recovers true resolution | 8px cells detected on a supplied 784×1168 reference, giving an exact 62×135 sprite: 32 colours, zero orphan cells, zero fringe cells |
| Detection needs all three rules | Independent axes gave 39.9px against 24px and squashed the sprite to 19 cells wide. Highest-score gave 32px. The peaks formed the series 8, 16, 24, 32, and only the divides rule found the 8px fundamental — the other answers threw away up to three quarters of the artwork |
| The edge classifier is the fringe fix | A tolerance left a visible light halo around the silhouette. Nearest-model classification left **zero** light desaturated edge cells out of 476 edge cells |
| Holes need two tests together | Filling every enclosed region put a grey plate inside the whip loop and behind the elbow; filling none punched holes through the eyes |
| The rig removes drift | Four walk frames with byte-identical head, torso and satchel pixels |
| The drift check earns its place | It caught a prop moving with a leg part: `frame 2: width moved 4px`. Giving the whip its own part cleared it to zero faults |
| Fractional resampling is visible | Fitting a 20×45 sprite into 32×48 by vote put a seam across the hips and a grey column between the legs. Integer placement removed both |
| Butt-jointed parts split | A one-pixel body bob opened a transparent row across the hips. A three-row joint overlap removed it |

---

## 18. Acceptance criteria

1. A project locks canvas, palette, transparent index and pivot, and every frame satisfies them.
2. Each invariant migration is atomic, reported and reversible; index 0 stays transparent for life.
3. A supplied reference is ingested into an on-grid, on-palette draft with its true cell size detected.
4. A base pose is generated, reviewed and approved before any clip runs.
5. Clips are built from placements; part pixels are byte-identical wherever no variant is declared.
6. Structural faults are always rejected and repaired in-session, and a run that wrote no grid fails.
7. The drift, lock, orphan, tile-continuity and readability checks each catch their fault class.
8. The visual pass compiles the art, shows it to the model once, and repairs what it sees.
9. A hand-edited cell survives every later regeneration until the user clears its lock.
10. Onion skinning shows neighbouring frames and never writes.
11. Compilation is deterministic: the same project and engine version give byte-identical pixels.
12. No surface stretches a grid. Every scale is a whole number and every surface disables smoothing.
13. A joint never opens a seam when a part moves, and a prop never moves with a limb it does not belong to.
12. Export produces a sheet and an atlas that Godot, Unity, Phaser and LÖVE import without editing.
13. `project.json` plays in the engine's clip player with no sheet present.
14. Kept sprites stay byte-identical after the source project changes.
15. The engine has no dependency on the plugin, the host or React, and no host API was added.
16. The main Sero agent can make a sprite, add a clip and export it.

---

## 19. Authority

Where documents disagree: this specification and the decision log govern behaviour; the prototype governs layout, hierarchy and visual language.
