# Sero Sprite Studio: Decision Log

**Status:** Agreed, not built
**Latest revision:** 2026-07-31
**Applies to:** the Sprite Studio page of `@sero-ai/plugin-design-library`
**Specification:** `docs/features/sprite-studio/spec.md`

This document records *what was decided and why*. The specification records
*what the product does*. Where a decision here is more recent than prose
elsewhere, this document wins.

Decisions D1 to D6 were taken in conversation. D7 to D16 were settled by the
spike, and every number in them is measured, not estimated. D17 to D19 came from
reviewing the prototype. **D20 to D28 came from two rounds of external critique,
and each one corrects a fault in the decisions above it** — read them before
trusting D8, D11, D12, D21 or D22 on their own. D25 in particular replaces half
of D21, which did not work. The spike outputs are in
`docs/features/sprite-studio/evidence/`.

**D39 was settled by running the studio for real, and it supersedes the model
named in D10.** It is the first decision here taken from live use rather than
from a spike, and it exists because a spike measured the wrong question.

---

### D1 · The model directs; it does not draw the pixels

The original concept had the AI output a grid of palette numbers, which code
would then render.

**Kept:** the grid, the strict palette, the integer scaling, the deterministic
compiler.

**Dropped:** the AI authoring the grid cell by cell. A model can emit 8,400
cells for a 62 × 136 character, but the art it produces that way has no eye
behind it. Pictures come from image and video models; the model plans, judges
and repairs.

**Consequence.** The validation layer became more important, not less, because
the pixel source is now noisy. It is the part that makes the output trustworthy.

---

### D2 · The grid is the stored form, and it is stored as an indexed PNG

The file on disk, the payload a tool receives and the object in memory are one
shape.

Text rows would work at 62 × 136 and would not at four times that size. The
storage format must not have to change when a user asks for a bigger character,
so it is an indexed PNG plus the palette from the start. It is lossless, exactly
recoverable and directly viewable.

**Amended 2026-07-31, after review.** "Indexed" is load-bearing and was being
read loosely. A frame is stored with one palette index per pixel and the palette
in the `PLTE` chunk. It is **not** stored as RGBA, because RGBA can represent a
colour that is not in the palette, which is the single thing this pipeline
exists to prevent — the storage format has to make an illegal frame
unrepresentable rather than merely detectable.

The spike code does not do this: it reads truecolour PNGs only and writes RGBA.
That is acceptable in a throwaway script and is not a foundation. Indexed read
and write comes from a mature library in the build.

---

### D3 · Working size is set by the artwork, not by the file

The reference the user supplied is a 784 × 1168 file whose artwork is 62 × 136,
enlarged eight times. This was measured, not assumed: colour edges land on a
grid of 8 four times more often than chance allows, with confirming harmonics at
4 and 16.

A character therefore stores an **art height** and a separate **export scale**.
The scale must be a whole number, or the pixels blur. A request for 512 px from
a 136 px character resolves to the nearest whole multiple and reports the real
size.

**Consequence.** An earlier analysis that called 512 × 512 infeasible was
answering a question nobody asked. At the real working size the concept is
comfortable.

---

### D4 · Every frame is drawn; no skeletal or cutout animation

Ruled out by the user directly. Moving parts of a fixed character is cheap and
consistent, and it is not what this product is for. Squash, stretch, cloth
movement and secondary motion all require the frame to be drawn.

**Consequence.** Frame-to-frame consistency cannot be guaranteed structurally.
It has to be earned by the locked palette, the fixed scale, the root and the
validation layer — which is what D9 to D12 exist to do, as corrected by D20 to
D22.

---

### D5 · Two checkpoints: the character sheet, then each animation

The user approves the character — palette, canvas, anchor, base pose — before
anything is generated. Then each finished animation, as it lands, rather than at
the end of a batch.

A failed frame is repaired automatically, up to two attempts, and the repair is
declared at the checkpoint. Stopping to ask before each repair would make a five
animation batch stop constantly for a decision the user has already delegated.

---

### D6 · A page in the Design Library, in its own folder

Sprite Studio appears inside the Design Library and shares only the fal
connection and the settings. All of its code lives in its own folder, with no
dependency on Design Library internals.

Chosen over starting a separate plugin because the provider key, the request log
and the settings surface already exist and would otherwise be built twice.
Chosen over full integration because the stated intent is to publish it
separately later, and moving a self-contained folder is a move rather than a
rewrite.

---

### D7 · The background key is flat magenta, not white

The spike first removed the background by flood filling inwards from the border,
because a colour test alone would have eaten the whites of the character's eyes.
That left the hole inside the whip loop filled, since a flood fill cannot reach a
region the character encloses.

Every generated frame is therefore drawn on flat magenta, a colour that appears
nowhere on the character. Keying becomes a per-pixel test with no connectivity
rule and no guessing, and enclosed holes come out transparent.

**Consequence.** Ingestion of a user's own image still uses the flood fill, since
we do not control what they upload.

---

### D8 · Ingestion recovers the true artwork before anything else happens

Detect the art grid, take the dominant colour of each cell, merge near-identical
colours into a palette, cut the background, set the foot anchor.

**Proof.** Against the reference shrunk to 83% with smooth blurring — no hard
edges left, sitting on no grid — recovery found the scale by itself, produced
62 × 136 without being told the width, and scored 98.1% correct silhouette and
91.2% correct colour.

---

### D9 · Seedance 2.0 makes the movement

Measured against Kling v3 Pro on the same character and the same two actions.

| | Seedance 2.0 | Kling v3 Pro |
|---|---|---|
| Size wobble, idle | 0.5 px | 2.1 px |
| Off palette | 0.1–1.1% | 0.2–3.0% |
| Drift after anchoring | 0 px | 1 px, 6 px on the attack |
| Size wobble, attack | 17.3 px | 28.4 px |

Kling redrew the character with far finer internal detail than the source, so
reducing it back to the art grid produced speckled noise instead of flat colour.
Seedance held the pixel discipline and produced a whip attack that reads as one
continuous movement.

**Consequence.** A future model swap must be re-measured against this spike
before it is adopted. "Newer" is not evidence.

**Narrowed by D29.** This decision compared two models on an idle and an attack,
using numbers taken from processed sheets. It is still correct about Kling.
It is no longer the basis for a single default model: watching the clips, rather
than the sheets, showed Seedance animating a jump very stiffly. The model is now
the user's choice, made in the interface.

---

### D10 · Nano Banana Pro repairs single frames

**Superseded by D39.** The endpoint holds — single poses repair a sequence and
never build one — but the model named here does not do the repairing any more.

Measured against Seedream v5 Pro on the same poses.

Nano Banana Pro produced the sharpest pixel art of anything measured, at 0.3% to
0.8% off palette, and held the character's identity, clothing and equipment.
Seedream redrew the character each time — 68% to 91% of the sprite changed
between frames — and drew him at 153 art pixels instead of 136.

Single poses are **not** used to build a sequence on their own: even the good
model changed 14% to 78% of the sprite between frames, so the result pops rather
than flows. Its job is repairing a frame the video route got wrong, and adding a
pose the video missed.

---

### D11 · Difference is measured at the best alignment

A sprite shifted by one pixel differs everywhere. Measured raw, two nearly
identical idle frames scored 67% changed, which would have condemned a good
sequence.

Difference is therefore measured over a small search of offsets, and the lowest
value wins. The same pair then scores 33%. The winning offset is not a
by-product — it is the answer to how far the character drifted after anchoring,
and it is reported as such.

---

### D12 · The scale is fixed per character, never per frame

It would be easy to normalise every frame to the same height. That would hide
the drift instead of measuring it, and it would shrink a character who is
legitimately taller because his arm is raised.

The scale comes from the character's calibration and applies to every frame. A
model that draws the character bigger produces a bigger sprite, and the size
check catches it.

---

### D13 · The canvas is per animation, sized to the widest pose

Measured: 65 × 139 for the idle, 173 × 156 for the whip attack.

One canvas for the whole character would waste most of every idle frame. One
canvas per frame would break the sheet. Per animation, with the foot anchor
keeping the feet in the same place across all of them, is the middle that works.

---

### D14 · Frames are thinned by change, not by a fixed interval

A five second clip sampled at 12 fps gives 61 near-identical pictures. A sprite
needs about ten that carry the movement.

A frame is kept when enough has changed since the last one kept. Still moments
cost nothing and fast moments keep their detail. The spike reduced 61 frames to
10, and the threshold it needed is itself a signal: a clip that needs a very
high threshold to reach ten frames is a noisy clip.

---

### D15 · The extractable engine is the compiler only

Grids and an animation description in; a pixel buffer and an atlas out. No file
system, no network, no clock, no provider knowledge.

PNG encoding stays outside it, in the runtime, where `node:zlib` is available.
An engine that encoded PNGs itself would either carry its own compressor or ship
uncompressed files.

---
### D16 · Export is a PNG sheet plus Aseprite JSON

Aseprite's format is already read by most engines and tools, so the output is
useful without a loader being written first. The anchor, the palette and the
character id go in its `meta` block.

---

### D17 · The palette can be capped, and the cap belongs to the character

Ingestion measures a palette — 66 for the reference — but a measured palette is
not always the wanted one. A 16 colour cap is a legitimate art direction, and so
is a fixed set the user supplies.

Capping re-quantises the character immediately, so the result is visible before
the character is approved and before anything is generated from it. The cap is
stored on the character, so every animation inherits it and no sequence can
drift onto a wider palette than its siblings.

---

### D18 · Fixing by AI is always available, never only automatic

The automatic repair in D5 handles frames that fail a check. That is not
sufficient on its own: a frame can pass every measurement and still be wrong to
the eye, and no measurement will ever raise it.

So the AI repair is a **user action**, offered on every frame and every
animation, at any time, whether or not anything failed. The user may say what is
wrong or say nothing. The automatic path is the same action invoked without
being asked.

Repairs append rather than replace, so the previous version survives — the same
rule the Design Library uses for revisions.

---

### D19 · The canvas is derived from the frames; the source framing is checked instead

A canvas cannot be too small, because it is measured from the finished frames
rather than chosen in advance.

The real clipping risk is upstream: if a whip crack runs off the edge of the
video frame, the drawing arrives already cut, and no canvas can restore it. So
the character is placed at about 80% of the source frame to leave room for a
reach, and a frame whose silhouette still touches the source edge is regenerated
rather than accepted.

This is the one failure that nothing downstream can repair, which is why it is
checked at the point where it can still be fixed.

**Consequence.** Export gains an optional "one cell size for every animation"
mode, for engines that want a uniform grid. It is not the default, because it
wastes space on every idle frame.

---

## Revision 2 — 2026-07-31, after external review

A critique by `gpt-5.6-sol` at extra-high effort found five faults. All five are
accepted. D20 to D24 are the answers, and the reasoning behind each is the
reviewer's, not ours.

---

### D20 · Quantising is a sequence operation, not a frame operation

The spike quantised every frame independently. That is what makes a sprite
*boil*: a cell whose source colour sits between two palette shades flips between
them as video noise moves, and contours crawl even where nothing is happening.
The reviewer saw it in the idle sheet we shipped as evidence.

The change percentage cannot catch this, because it cannot tell noise from
intended movement. So the fix is in the quantiser rather than in the validator:
a cell keeps its previous entry unless the new source colour is clearly closer
to a different one, by a margin rather than a hair. The alpha decision carries
the same memory, so edge cells stop flickering in and out. Matching is done
after the alignment search, so a character who moved is compared with the right
neighbour.

Two new checks back it up: churn in regions that should be still, and, for a
loop, how far the last frame is from the first.

**This was designed in conversation and never reached the specification.** The
mechanism was described, agreed and then lost between the discussion and the
document. That is the failure worth remembering, more than the bug itself.

**Consequence.** The margin has no measured value. It has to be tuned against a
real idle, and until it is, nothing here should be called finished.

---

### D21 · The root is a trajectory with declared ground contact

Anchoring on the lowest pixel of the silhouette is correct for a standing
character and wrong for everything else. A jump would be pinned to the ground
for its entire arc. A death would slide. A lowered weapon would become the
anchor.

The user asked for a jump in the first sentence of the first request, so this is
not an edge case — it is a whole class of animation the original rule could not
express.

Each animation now declares which frames are **grounded**. A grounded frame
takes its root from the feet. An airborne frame takes its root from the
trajectory through the grounded frames on either side. The validator checks a
frame against that trajectory, not against a fixed baseline.

The AI makes the declaration and the runtime checks it against the pixels: a
jump whose airborne frames never leave the baseline is refused. A structural
claim from a model is evidence, never a fact.

---

### D22 · Palette conformance is not palette fidelity

Conformance proves a colour is on the list. It does not prove the shirt is still
the same green.

A lighting change can move a whole region to a *different entry of the same
palette*, and the "colours outside palette" number still reads zero. We were
measuring legality and reporting it as if it were correctness.

The palette is therefore grouped into named material ramps at approval time, and
every frame is compared to the base pose region by region: a region that lands
on a different ramp, or that slides more than a step along its own, is refused.
The comparison happens in a perceptually even colour space, so "a step" means
what the eye thinks it means.

---

### D23 · Thinning keeps the poses an animator would draw

The spike kept a frame when enough cells had changed since the last one kept,
then raised the threshold until about ten frames survived.

Three faults. It compared frames without aligning them, so a one pixel drift
counted as a large change. It could keep a noisy frame and drop the wind-up, the
strike or the recovery. And it discarded the source timing, replacing real
durations with numbers chosen afterwards.

Now four frames are kept unconditionally — first, last, and the extremes of the
action — and the rest are chosen to lose as little of the movement as possible,
judged on the silhouette rather than on raw cell change. **Each kept frame's
duration is the real time it held in the source**, so the animation plays at the
speed it was drawn at.

---

### D24 · Identity is judged from crops, and its verdict only warns

"The AI looks at the contact sheet" was not a real mechanism. A whip attack
sheet is nearly 7,000 pixels wide, and a vision model receives it shrunk far
below the detail being judged. The shirt survives that; the belt buckle, the
face and the hands do not.

The judge now sees one frame at a time at 8×, beside the base pose and the
frame's two neighbours.

More importantly, its verdict is **advisory until it has been measured**. An
identity complaint warns the user; it never triggers an automatic redraw. An
unproven judge that can silently order a repair is worse than no judge, because
a repair from Nano Banana Pro redraws 14% to 78% of the sprite (D10) — it would
be treating a suspicion by rewriting the evidence.

---

## Revision 3 — 2026-07-31, after the second review

The same reviewer read revision 2. It accepted D23 and D24, accepted D2 subject
to two conditions, and found that **D21 did not work at all**. D25 to D27
replace or complete those three.

---

### D25 · The source holds the arc; only the drift is corrected

D21 said an airborne frame takes its root from the trajectory between the
grounded frames on either side. That is wrong, and it fails in the obvious way:
take-off and landing are both on the ground, so the line between them is on the
ground, and the character is pinned exactly as before. An animation that never
touches the ground has no endpoints to interpolate between at all.

The mistake was treating *position* and *drift correction* as one thing.

The camera does not move. A frame in the middle of a jump therefore already
draws the character higher up the picture, and that height **is** the animation.
The position is taken from the source and never recomputed. What is interpolated
between grounded frames is the small correction that removes the video model's
drift — a quantity that is small and changes slowly, so interpolating it is
safe. An animation with no grounded frame gets no correction and says so.

**This supersedes the second half of D21.** The grounded declaration and its
verification against the pixels survive unchanged.

---

### D26 · Alignment is measured before colour is chosen

D20's colour memory needs to know which cell in this frame corresponds to which
cell in the last one, and D11's alignment search compares quantised frames. Run
in that order, each step waits for the other: unstable colours pick the offset,
and the offset decides which colours may stay stable.

Alignment is therefore measured from the silhouette and the source brightness,
before any palette decision is made.

Memory is also applied only where the match is confident or the region is
static, because one offset cannot describe a swinging arm. A limb that is
genuinely moving gets no memory, which is correct — it is supposed to change.

---

### D27 · Colour fidelity is checked by ramp usage, not by region

D22 said "compare region by region". That quietly assumed something that can
follow the shirt across a turning, deforming body, and nothing in the design
provides it. Deriving the regions from colour would make the check depend on the
thing it is checking.

The check is therefore made on **ramp usage**: for each named ramp, how many
cells sit on it and how far along it they sit, compared to the base pose. A
shirt that has gone a shade darker moves its ramp's centre, and that is
detectable without knowing which pixels are the shirt.

A tracked-region check is the fuller answer and stays available if this proves
too blunt. It is not needed to catch the failure that prompted the check.

One shade of movement is a **warning**, not a refusal: a new pose lights a
character differently, and the reviewer was right that a strict limit would
reject correct shading. Two shades is a refusal.

---

### D28 · The evidence gap is now the plan, not the design

Both reviews converged on the same conclusion, and it is not about the
architecture: the largest risk is whether the video model holds the body and the
equipment across **many** characters and **many** actions. The spike covered one
character and two actions.

The validation layer can find a broken sequence and can suppress small faults.
It cannot rebuild a sequence that came back wrong. No further design work
changes that, so the next step is measurement rather than specification: several
characters, and the action types never yet attempted — a walk, a jump, and a
death.

The jump is the direct test of D25. The walk is the direct test of D20, because
a cycle is where boil shows worst and where loop closure has to hold.

---

## Revision 4 — 2026-07-31, after watching the videos

D9 chose Seedance on measurements taken from processed sprite sheets. Watching
the actual clips changed the picture, and D29 to D31 follow from that.

---

### D29 · The video model is a visible choice, not a setting

Two models were run on the same jump, from the same plate, with the same prompt
text. The only differences were a second of duration and an aspect setting that
changed nothing.

- **Grok Imagine** produced a real jump: a deep crouch, arms thrown out, legs
  apart in the air, a proper landing. Its face drifts — it grew a moustache
  across three frames.
- **Seedance Fast** kept the face steady and barely animated. It mostly took the
  standing pose and moved it up and down, arms at its sides.

Neither is better in general. They fail in opposite directions, and which one is
right depends on the animation and on taste. So the model belongs **in the
Sprite Studio interface, beside the request**, not in a settings page — it
changes the result more than any other control the user has.

The last choice is remembered and used for the next generation.

**Consequence.** The provider stays behind one interface, as in the Design
Library, but the *choice* is promoted to the surface. Adding a model means
adding a card with its measured character, not a line in a configuration file.

---

### D30 · Identity drift is a style, not a defect

The drifting face was recorded as a fault. It is not one — it reads as
character, and it can be pushed back with prompting if it is unwanted.

This softens D24: the identity judge warns, and the user decides. It never
blocks and never triggers a repair on its own. A model that draws the character
with a little life in it must not be penalised by a check that rewards a still
pose.

**A stiff animation is the worse failure, and no repair path can fix it.** A
drifting detail can be repaired frame by frame; missing character cannot be
added back.

---

### D31 · 720p, and the resolution question is closed

A clip we already owned at 1440p was shrunk to 720p and 480p and put through the
same pipeline, so the model, the prompt and the movement were identical and
resolution was the only variable.

On the knight, our densest sprite, 720p differs from 1440p in 24.6% of pixels —
but only 0.4% of those are a change of shape. The rest are one shade of grey
against another, and the three results are indistinguishable by eye.

Flicker was very slightly *better* at lower resolution, because shrinking the
video averages the noise away before the pipeline sees it.

480p is rejected: the canvas came out a pixel taller than at full resolution,
which means the measurement itself started to move.

**720p is the default.** The evidence cost nothing, because the clip was already
paid for.

---

## Revision 5 — 2026-07-31, the wider test

Fifteen animations: five characters — explorer, ninja, skeleton, slime, knight —
each with a walk, a jump and a death, all on Grok at 720p. Six were regenerated
once with a stronger instruction. Everything below is measured.

---

### D32 · The loop is found by searching every start and end pair

The first method chose a cycle *length* first, by how well the whole clip
repeated at that spacing, and only then chose where to start. That discards good
loops, because a clip can hold one excellent pair of matching moments without
repeating at any fixed spacing at all.

Searching every start and end pair directly asks the only question that matters:
play from s to e, jump back to s, how big is the jump?

| Walk | Length first | Every pair |
|---|---|---|
| Slime | 26 frames, 16% | **14 frames, 7.4%** |
| Ninja | 36 frames, 9% | 37 frames, 9.4% |
| Knight | 35 frames, 51% | 13 frames, 36.9% |
| Skeleton | 24 frames, 59% | 13 frames, 54.0% |
| Explorer | 18 frames, 64% | 38 frames, 59.3% |

Better or equal everywhere, and on the slime it halves both the frame count and
the error. It costs nothing.

---

### D33 · The bridge was tested and discarded

The idea: when a loop does not close, borrow a short run of frames from
elsewhere in the clip to lead out of the end and back into the start.

Tested on all five walks, for bridges of one to four frames, from anywhere in
the clip. **No bridge beat jumping straight back, on any of them.**

Recorded because it is a reasonable idea that deserves not to be tried a second
time.

---

### D34 · A loop is one of three things, and the tool says which

- **once** — a jump, an attack, a death.
- **forward** — offered only when a real cycle is found.
- **pingpong** — forward then backward. **It cannot fail to join**, because both
  ends are the same frame. It costs the motion its direction, so it suits
  breathing, hovering and bouncing, and it does not suit a walk.

Export needs nothing new: Aseprite's atlas carries `direction` already.

The important part is the honesty. Where no cycle exists the tool must say so
and offer the three real answers — generate again, ping-pong it, or fix it by
hand — rather than quietly shipping a walk that jerks every cycle.

---

### D35 · The root is the lowest *solid* row, and detached matter is dropped

Two faults, found because a picture disagreed with a number.

**The knight's 75-pixel jump measured as 8.** The foot line was the lowest pixel
of the silhouette, and his sword hangs below his tucked feet. The foot line is
now the lowest row that carries real width — about a tenth of the body. A blade
tip never qualifies; feet always do.

**A detached artefact became part of the character.** Anything not joined to the
main mass is not the character, so the largest connected region wins.

Neither fix broke the seven known-answer tests.

---

### D36 · Framing faults are promptable; loops are not

The same six clips, regenerated once with a stronger instruction.

**Fixed by wording.** Frames cut off at the edge went from 1 animation to 0 —
"keep a wide margin" worked where "stay inside the frame" had not. The knight's
jump went from flattened to a 111-pixel arc.

**Not fixed by wording.** The loops did not move: explorer 57→64%, skeleton
61→59%, knight 50→51%. The slime, which had the only good loop, got *worse* at
16% — and telling the model "exactly four steps, steady rhythm, the end matches
the start" is about as concrete as an instruction can be.

**Consequence.** Spend prompt effort on framing, margins and borders, where it
works. Do not spend it on cyclicity. That is a property of the material.

---

### D37 · What the wider test actually proved

Across fifteen animations:

- **Nothing is cut off.** 0 of 15 after the margin wording.
- **Jumps work.** Five of five leave the ground: 42 to 112 art pixels of travel,
  including the slime, which has no feet at all.
- **The flicker control holds everywhere.** 0.0% to 1.3% churn after memory,
  on every character and every action.
- **Deaths work.** All five stagger, fall and settle.
- **Walks are the weak spot.** Two of five loop well; three contain no repeated
  pose anywhere.

Two faults belong to the model, not the pipeline:

- **Grok draws a white box** around the knight — a bright subject on magenta.
  Six ways of refusing it in the prompt reduced it to about one frame in ten but
  did not remove it. The body-size check should reject those frames: the knight
  is 129 art pixels tall and his silhouette measured 205.
- **A small palette fits badly.** Colour residual tracks palette size — the
  knight's 36 colours give 21 to 37, the slime's 4 colours give 39 to 137. A
  character capped very low will not sit close to its own palette.

---

### D38 · An end frame halves the loop problem, and is left open

Dan's idea: rather than cutting a loop out afterwards, ask the model to finish
where it started. Some endpoints take an end frame as well as a start frame, so
setting both to the same picture makes closure the model's job.

Tested once on the two worst walks: explorer 59.3% → **33.4%**, knight 36.9% →
**19.7%**. Clean keying, no cut-off frames, normal colour fit. It is the only
idea so far that improved a walk with no natural cycle in it.

It is not adopted yet, because it halves the problem rather than removing it,
and because the end frame exists only on Seedance — the model that barely
animates. Carried to §12.1 of the specification as the first thing to try when a
model offers both good movement and an end frame.

**Rejected on the same day: Grok's `reference-to-video`.** It measured the best
loop of the whole investigation, 10.4%, and the number was false — the endpoint
dims the background, the key failed, and all 73 frames counted as character.
The body-size check from D37 caught it immediately: 171 art pixels against a
136 pixel character. Recorded so the same measurement is not believed twice.

---

### D39 · The repair endpoint is Nano Banana 2, and drawing a pose is not editing a frame

**Supersedes the model named in D10.**

D10 measured how well a model **draws a pose**. It never measured whether a model
will **edit the frame it is handed**, and those are different questions. Six edit
endpoints were run on one refused frame from a live profile, each given the frame
first, the character reference second, and the prompt the runtime sends:

| Endpoint | Cost | Time | Result |
|---|---|---|---|
| `fal-ai/nano-banana-2/edit` | $0.08 | 16.7 s | **kept the pose, corrected the colour, nothing refused it** |
| `fal-ai/nano-banana-pro/edit` | $0.15 | 33.4 s | redrew the standing reference, in its shape |
| `google/nano-banana-lite/edit` | token-priced | 12.0 s | redrew the standing reference |
| `fal-ai/nano-banana/edit` | $0.039 | 14.1 s | redrew the standing reference, in portrait |
| `fal-ai/qwen-image-2/edit` | not published | 13.1 s | redrew the standing reference, in portrait |
| `xai/grok-imagine-image/edit` | $0.022 | 20.2 s | redrew the standing reference, shirt turned blue |

Five of the six took the character reference as the thing to draw, so the
movement was lost. Four answered in the reference's portrait proportions, which
alone breaks the size measurement: the sequence's scale comes from the returned
width, so a 136 pixel character measured as 462 and every check refused it.

**Nothing said so.** One profile had bought 51 repair images and kept none;
`repairedFrames` was empty on every record. `repairFrame` returned `unchanged`
and the caller ignored it, so a repair bought and refused left no trace anywhere.
That is the same fault as a clip nobody decodes — one side declared something the
other side never acted on — and it is the reason this ran for weeks.

Four things follow:

1. The repair endpoint is `fal-ai/nano-banana-2/edit`. It is also cheaper and
   about twice as fast, which was never the deciding factor. **Cheap was not the
   problem**: the three cheapest candidates all failed on the same thing.
2. The request states its aspect ratio and asks for PNG, rather than hoping. Both
   are dropped by the adapter on an endpoint with no such field. Grok's edit
   endpoint returns JPEG by default, whose ringing on flat pixel art is colours
   the quantiser then has to undo.
3. An answer whose proportions sit more than a fifth from the frame's is refused
   **without a second attempt**. It is not a bad drawing but a different question
   answered, and a second identical call buys the same misunderstanding.
4. A repair that is paid for and refused is reported at the checkpoint, on the
   frame and on the animation.

A stored setting outranks a corrected default for ever, and `repairModel` has no
interface — the user cannot see it, change it, or know it is wrong. So a
superseded value is replaced at start-up, and only where it names an endpoint on
the measured-unusable list. Anything else is somebody's decision, and a start-up
chore does not get to undo one.

`CHARACTER_MODEL` is untouched. Drawing a character from words is generation
rather than editing, and this measurement says nothing about it.
