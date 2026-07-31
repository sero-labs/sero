# Sero Pixel Engine decisions

**Status:** Proposed
**Date:** 2026-07-31
**Scope:** An AI-driven pixel art and animation engine, added to the Design Library plugin as the Sprites surface

These decisions come from an interview and from measured spikes. Where a decision rests on a measurement, the measurement is named. Where it rests on judgement, the judgement is named as such.

## P1 · The grid is the truth

A project stores grids of palette indexes. Drawing operations, quantised references, model output and user strokes all write into a grid. Nothing downstream reads any other source.

**Reason.** One stored representation means the user editor, the model, the compiler and a game runtime all speak the same language. A stored operation list cannot express a pencil stroke, and a stored image cannot be validated.

**Consequence.** Drawing operations become a transient authoring channel. The compiler runs them once and keeps the result.

## P2 · Pixels are edited, not invented

Generation runs in stages: blockout (operations or an ingested draft), then refine (direct pixel edits), then rig, then clips. The model is given a draft to correct wherever one can be produced.

**Reason.** Measured. Hand-authoring a 32×32 grid produced zero structural faults and the best art of the three encodings tested. Drawing operations alone produced fused legs, missing boots and no arm. Correcting a grid is more reliable than inventing one.

**Receipt.** Raw rows: 1121 characters, 0 faults. Operations: 933 characters, coarse. Operations plus one repair pass: all four visible faults fixed.

## P3 · Run-length encoding is not used

Grids are stored and transmitted as plain rows of indexes, one character per cell.

**Reason.** Measured. On detailed art, run-length rows projected to 1052 characters against 1121 raw — no useful saving, and it adds an arithmetic failure mode where runs must sum to the row width.

## P4 · Animation is placement, not redrawing

A frame is placements of parts, then a sparse patch, then locked cells. A frame is never authored as an independent full grid.

**Reason.** Shared pixels must be shared data. If two frames each describe the head, they can disagree, and that disagreement is pixel drift.

**Receipt.** A four-frame walk cycle built this way kept the head, torso, hat and satchel byte-identical in every frame.

## P5 · Joints overlap and props are their own parts

Every part extends past its joint by a few rows, with the upper part drawn last. Anything that hangs or is carried gets its own part.

**Reason.** Measured, by breaking both. Parts cut edge to edge split when the body bobbed one pixel, opening a transparent row across the hips. A whip left inside the leg's cut swung with every step; the drift check reported `frame 2: width moved 4px`. Giving it its own part cleared the run to zero faults.

## P6 · Never stretch a grid

Fitting artwork to a canvas uses a whole-number factor, or places it as drawn and pads with transparency. Every surface that displays a sprite disables smoothing and scales by whole numbers.

**Reason.** Measured. Fitting a 20×45 sprite into a 32×48 canvas by majority vote put a seam across the hips and a grey column between the legs, because a fractional resample duplicates some rows and drops others.

## P7 · Reference ingestion is deterministic and needs four non-obvious rules

Image ingestion runs without a model. Four rules were each learned by getting them wrong on a supplied 784×1168 faux-pixel-art character:

1. **Square cells.** Solving each axis independently gave 39.9px horizontally against 24px vertically and squashed the sprite to 19 cells wide.
2. **The fundamental divides the other peaks.** The lattice peaks formed the series 8, 16, 24 and 32px. Highest score picked 32px; an earlier tolerance rule picked 23.95px. Both under-sampled the artwork by a whole factor, and the 23.95px reading was reported as this reference's "true" resolution before the run-length estimator contradicted it. The real cell is **8px**, giving a 62×135 sprite.
3. **Nearest-model edge classification, not a tolerance.** An anti-aliased edge pixel is a blend of the sprite and the page behind it. A tolerance left a light halo — the visible "noise" around the silhouette. Nearest-model classification left zero light desaturated cells out of 476 edge cells.
4. **A hole must reach the border or be too big to be a highlight.** Filling every enclosed region put a grey plate inside the coiled whip; filling none punched holes through near-white eyes.

**Consequence.** Palette extraction reads confident interior pixels only and de-duplicates. Raw median cut over all pixels produced two visually identical reds and wasted an index.

**Consequence.** Detection is shown to the user with its alternatives. The engine states the cell size it found and the grid it implies, because the fundamental is a judgement about the source, not a fact the file carries.

## P8 · One visual pass by default

After structural and semantic checks pass, the engine compiles the art and shows it back to the model once. The user can ask for more with **Improve**.

**Reason.** Interview decision, supported by measurement: one look found and fixed four faults that no structural check can see. Iterating further costs a round trip per pass for diminishing return.

## P9 · Hand-edited cells are locked

A cell the user edits is locked, carries its own value, and is applied as the last step of frame resolution. The model is told which cells are locked and any write to one is rejected.

**Reason.** Interview decision. Hand work must survive regeneration, and making the lock the final compile step means it cannot be bypassed by any path.

**Consequence.** Locks are visible and clearable. An invisible lock that silently blocks the model is a trap.

## P10 · Nothing is permanent except the transparent index

Index 0 is transparent for the life of a project. Canvas size, palette and pivot change through an explicit project migration that is atomic, reported and reversible as one history step.

**Reason.** Interview decision — the user does not want choices set in stone from the first minute. Drift safety comes from invariants being fixed *during* a run, not from being fixed forever.

## P11 · Base pose first, then clips

The first run makes the base pose, the palette and the rig. The user approves it before any clip is generated.

**Reason.** Interview decision. A bad character is caught before eight frames are paid for.

## P12 · Palette from three sources, always approved

A palette can be proposed by the model with ramps, chosen from a preset, or extracted from a reference. The user approves it before the first frame.

**Reason.** Interview decision. Good pixel art depends on ramp structure, which the model can reason about, presets guarantee, and extraction must be told to build.

## P13 · The concept image stage is user-triggered

The media provider is called only when the user presses **Concept image**. It carries the existing caps, confirmations and cost display.

**Reason.** Interview decision. No surprise spend. The pipeline works from text or a reference alone.

## P14 · Sprites keep their own gallery

Kept sprites live on their own surface with their own immutable versions. They are not mixed into the web-design Gallery.

**Reason.** Interview decision. One content type per surface, and the feature can leave for its own plugin without splitting a shared store.

## P15 · The engine is encapsulated now, extractable later

`pixel-engine/` holds the schema, validator, resolver, renderer, packer, atlas writer and clip player. It has no dependencies, no Node APIs, and no imports from the plugin, the host or React. The plugin uses the engine; the engine never uses the plugin.

**Reason.** Interview decision. Publishing is not in scope, but a later extraction must be a move rather than a rewrite, and the same compiler must serve the studio and a game runtime so a sheet and a played sprite cannot disagree.

**Consequence.** Export writes an Aseprite-compatible atlas, which Godot, Unity, Phaser and LÖVE already import, plus the native project file a runtime can play directly.

## P16 · Built in Design Library, bounded for extraction

The Sprites surface is built inside the Design Library plugin, reusing Library references, the media contract, credentials, storage rules and the agent bridge. All pixel code stays in its own folders and shares no domain types with Design or Gallery.

**Reason.** Interview decision. Speed now, with the split kept possible by respecting the boundary.

**Consequence.** Library references are shared; nothing else is. A pixel project reads the Librarian's language for a reference and never writes to Library records.

## P17 · No host change

The feature uses existing seams only: the subagent runner, the media contract, the image budget, plugin state and the tool bridge.

**Reason.** The Design Library established that a plugin of this size needs no bespoke host API. Nothing found during design contradicts it.

## P18 · Sprites is a top-level page

The surface is named **Sprites** and sits beside Library, Design and Gallery as a page of its own. It is never a mode inside Design.

**Reason.** Decided at prototype review. Sprite work is a different craft from web design, and a top-level page is also the shape that leaves cleanly when the feature becomes its own plugin.

## P19 · The default canvas is 64×64, and the canvas is easy to change

A new project starts at 64×64. The size is a plain, prominent control offering common presets and any custom size, and the project migration in P10 makes it changeable afterwards.

**Reason.** Decided at review — most of the intended characters are higher resolution than the classic 32×32. The tested reference came in at 62×135, so tall character canvases must be as easy to reach as square ones. A default is a starting point, never a limit.
