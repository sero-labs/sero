# Sprite Studio

A page in the Design Library that turns a character description, or a picture of
a character, into finished 2D sprite sheets with animations.

The user asks for what they want in plain words — "give this character a resting
loop, two attacks, a jump and a death" — and gets back sprite sheets with hard
pixels, one shared palette, planted feet and a machine-readable atlas.

Status: specified, not built. Every number quoted below was measured — first on
one character, then across fifteen animations covering five characters and three
action types. Nothing here is an estimate (`evidence/`, `spike/`).

---

## 1. What the concept turned out to be

The original idea was that the model writes the picture as a grid of palette
numbers, and code renders that grid. The spike showed where that holds and
where it breaks.

**A pixel art image has two sizes.** The reference the user supplied is a
784 × 1168 file, but the artwork inside it is drawn at 62 × 136 and enlarged
eight times. `spike/grid.mjs` measured this: colour edges land on a grid of 8
four times more often than chance allows. The character uses 66 colours.

So the working size for a good-looking character is around 60 × 140 art pixels,
not 512 × 512. That is about 8,400 cells per frame.

**At that size a model still cannot draw the art by typing cells.** 8,400 cells
is inside a model's output limit, but a model authoring that many cells produces
mush. It has no eye. What it does have is judgement, planning and language.

**So the grid becomes the storage form, not the authoring form.** Pictures are
drawn by an image or video model. Deterministic code converts them onto the
grid, locks the palette, plants the feet and hardens the edges. The AI directs
the work, judges the result and repairs what is wrong. The user edits cells by
hand when they want to.

This keeps everything the original concept wanted — a strict palette, exact
integer grids, deterministic compilation, no blurred output — and drops only the
part that could not work.

---

## 2. The four layers

### 2.1 Ingestion

A character starts from an uploaded image, an existing Library item, or from
text alone.

For a picture, the ingestion step recovers the true artwork:

1. **Detect the art grid.** Collect strong colour edges, then find the cell size
   at which those edges line up far more often than chance. The reference gave a
   clear answer of 8, with harmonics at 4 and 16 confirming it.
2. **Recover the sprite.** Take the dominant colour of each cell. This produces
   the artwork at its real size.
3. **Extract the palette.** Merge near-identical colours. The reference gave 66.
   The user can then cap it — 32, 16, 8, or a fixed set of their own — and the
   character is re-quantised so the result is visible before it is approved. The
   cap belongs to the character, so every animation inherits it.
4. **Cut the background.** Flood fill inwards from the border, so a
   background-coloured region enclosed by the character — the whites of the
   eyes — is not eaten.
5. **Set the root.** For the base pose the character is standing, so the root is
   the bottom of the silhouette and the horizontal centre of its lowest rows.
   This is the character's reference root, and it is the only place the
   silhouette is allowed to define it — see §2.4 for what happens once he leaves
   the ground.

For text alone, an image model draws the base character first, and the same
steps run on the result.

**Proof.** `spike/cleanup` recovered the sprite from a version of the reference
that had been shrunk to 83% with smooth blurring — so every hard edge was gone
and the artwork sat on no grid at all. It found the scale by itself (6.64 source
pixels per art pixel), produced 62 × 136 without being told the width, and
scored 98.1% correct silhouette and 91.2% correct colour against the true
sprite.

### 2.2 Generation

Frames are drawn, not typed.

**Movement comes from a video model.** The base character plus a motion
instruction produces a clip. Frames are pulled out at 12 fps, cleaned, then
thinned to the ones that carry the movement.

**Single frames come from an image model.** This is how a bad frame is repaired
and how a pose the video missed is added.

The AI writes the motion instruction, decides how many frames the action needs,
sets the timing, judges the output and orders repairs. It never writes pixels.

**Measured, on the same character and the same two actions:**

| Model | Route | Size wobble, idle | Off palette | Drift left after anchoring | Verdict |
|---|---|---|---|---|---|
| Seedance 2.0 | video | 0.5 px | 0.1–1.1% | 0 px | **chosen** |
| Kling v3 Pro | video | 2.1 px | 0.2–3.0% | 1 px, 6 px on the attack | rejected |
| Nano Banana Pro | pose | 0.8 px | 0.3–0.8% | 1 px | chosen for repair, later superseded (§2.2.1) |
| Seedream v5 Pro | pose | 0.2 px | 0.4–0.7% | 3 px | rejected |

Kling redrew the character with much finer internal detail, so shrinking it back
gave speckled noise instead of flat colour. Seedream redrew the character each
time — 68% to 91% of the sprite changed between frames — and drew him at 153 art
pixels instead of 136.

**The video model is the user's choice, made in the interface.** It changes the
result more than any other control, and the candidates fail in opposite
directions, so it sits beside the request rather than in a settings page. The
last choice is remembered and used next time. Each option carries its measured
character, not a recommendation:

| Model | What it does | What it costs you |
|---|---|---|
| Grok Imagine | a real jump — crouch, arms out, legs apart, a landing | the face drifts, which reads as style; audio cannot be turned off |
| Seedance Fast | follows the instruction closely, face steady | stiff; it can move a standing pose up and down rather than animate |

A stiff sequence is the worse failure of the two, because no repair path can add
character back. A drifting detail can be repaired frame by frame.

Resolution is fixed at **720p**. Shrinking a 1440p clip we already owned to 720p
changed 24.6% of pixels on our densest sprite, of which only 0.4% were a change
of shape — the rest were one shade against another, and the results are
indistinguishable by eye.

Whichever video model is chosen, it supplies **continuity** — its frames belong
to one movement (`evidence/02-seedance-attack.gif`). The repair model supplies
**cleanliness**: Nano Banana Pro's frames are the sharpest pixel art of anything
measured, but 14% to 78% of the sprite changes between them, so a sequence built
only from single poses pops rather than flows (`evidence/04-nano-attack.gif`).
That is why single poses repair a sequence and never build one.

#### 2.2.1 The repair endpoint, measured again

The table above measured how well a model **draws a pose**. It never measured
whether a model will **edit the frame it is handed**, and those turned out to be
different questions.

Six edit endpoints were run on one refused frame from a live profile — a
mid-strike pose whose green had drifted from the base pose — each given the frame
first, the character reference second, and the prompt the runtime actually sends.

| Endpoint | Cost | Time | Result |
|---|---|---|---|
| `fal-ai/nano-banana-2/edit` | $0.08 | 16.7 s | **kept the pose, corrected the colour, nothing refused it** |
| `fal-ai/nano-banana-pro/edit` | $0.15 | 33.4 s | redrew the standing reference, in the reference's shape |
| `google/nano-banana-lite/edit` | token-priced | 12.0 s | redrew the standing reference |
| `fal-ai/nano-banana/edit` | $0.039 | 14.1 s | redrew the standing reference, in portrait |
| `fal-ai/qwen-image-2/edit` | not published | 13.1 s | redrew the standing reference, in portrait |
| `xai/grok-imagine-image/edit` | $0.022 | 20.2 s | redrew the standing reference, and changed the shirt colour |

**Five of the six answered a different question**: they took the character
reference as the thing to draw, and the movement was lost. Four returned the
reference's portrait proportions, which alone breaks the size measurement — the
sequence's scale is derived from the returned width, so a 136 pixel character
measured as 462 and every check refused it.

The cost of this was not the price of a call. Before it was found, one profile
had bought 51 repair images and kept none of them; `repairedFrames` was empty on
every record. Three things follow, and all three are now in the code:

1. The repair endpoint is `fal-ai/nano-banana-2/edit` — cheaper than what it
   replaces and about twice as fast, which was never the deciding factor.
2. The request states its aspect ratio and asks for PNG. Leaving either to the
   endpoint is what let a portrait answer through, and Grok's edit endpoint
   returns JPEG by default, whose ringing on flat pixel art is colours the
   quantiser then has to undo.
3. A repair that is bought and refused is **reported at the checkpoint**, on the
   frame and on the animation. It used to leave no trace at all, which is how
   this ran unnoticed: "nothing was wrong" and "everything we paid for was thrown
   away" looked the same to the person deciding whether to approve.

An answer whose proportions are more than a fifth away from the frame's is
refused without a second attempt. It is not a bad drawing but a different
question answered, and a second identical call buys the same misunderstanding.

### 2.3 Validation

The pixel source is noisy, so the firewall is stricter than the original concept
needed, not looser. Every frame is checked before it is accepted:

| Check | Refuses |
|---|---|
| Palette conformance | a colour that is not within tolerance of the locked palette |
| Hard alpha | a partly transparent pixel; a sprite pixel is in or out |
| Canvas | a frame that is not the animation's exact canvas size |
| Root | a root that departs from the animation's declared trajectory, and a grounded frame whose feet are off the baseline |
| Body size | a silhouette height outside tolerance of the character's height. **This rejects the frame**, it does not merely report a number — it is what catches a drawn artefact touching the character. The knight is 129 art pixels tall and came back inside a white box measuring 205 |
| Detached matter | anything not joined to the main body mass; a character is one connected thing |
| Silhouette continuity | a frame that differs from its neighbour by more than the action allows, measured **at the best alignment**, not where the frames happen to land |
| Static churn | a region that should be still but changes between frames — the measurement that catches boil (§2.4) |
| Region colour drift | a named region whose colour has moved to a different palette entry from the base pose, even though every colour is legal |
| Loop closure | a **forward** looping animation whose last frame does not return to its first, within tolerance. Ping-pong loops are exempt, because they join by construction |
| Orphans | isolated pixels left by the quantiser |
| Source framing | a frame whose silhouette touches the edge of the drawing it came from |

The last one is the only check that cannot be repaired by anything downstream.
The canvas is derived from the frames, so a canvas is never too small — but if
the whip ran off the edge of the video frame, the drawing is already cut and no
canvas can put it back. The fix has to happen before that: the character is
placed at about 80% of the source frame, leaving room for a reach, and a frame
that still touches the edge is regenerated with more margin rather than
accepted.

The alignment search matters. A sprite shifted by one pixel differs everywhere,
and the raw number called an unchanged idle frame "67% redrawn". Measured at
best alignment the same pair differs by 33%, and the winning offset is itself
the answer to how far the character drifted.

**Legal is not faithful.** Palette conformance only proves a colour is on the
list. A lighting change can move a whole region — the shirt, the hat brim — to a
*different entry of the same palette*, and conformance still reports everything
as fine.

The palette is therefore grouped into named ramps at approval time, and each
frame is compared to the base pose **by ramp usage**, not pixel by pixel: how
many cells sit on each ramp, and how far along it they sit. A shirt that has
gone a shade darker moves its ramp's centre, and that is visible without knowing
which pixels are the shirt.

This deliberately avoids needing something that can follow a region across a
turning, deforming body. Such a tracker would be the right answer and is far
more than this needs, and deriving the regions from colour would make the check
depend on the thing it is checking.

Comparison happens in a perceptually even colour space, so "a shade" means what
the eye thinks it means. One shade of movement is a warning, because a new pose
legitimately lights the character differently. Two is a refusal.

**Identity is judged from crops, not from a sheet.** A contact sheet of a whip
attack is nearly 7,000 pixels wide, and a vision model sees it shrunk to a
fraction of that — enough to confirm the shirt, not the belt buckle. So the
judge is shown, per frame, the base pose beside the frame and its two
neighbours, each at 8× and cropped to the region in question. Until the judge's
hit rate has been measured against known-bad frames, an identity complaint is a
warning to the user, never grounds for an automatic redraw.

### 2.4 Compilation

Deterministic, no AI, and the part that is extractable.

1. **Resample.** Average each art cell over foreground pixels only, so the
   background never bleeds into an edge pixel. The scale is fixed for the whole
   sequence and comes from the character, never from each frame — a model that
   draws the character bigger must show up as a bigger sprite, because that is
   the drift being measured.
2. **Quantise, as a sequence rather than as frames.** Snapping each frame to the
   nearest palette entry on its own is what makes a sprite *boil*: a cell whose
   source colour sits between two shades flips between them as the video noise
   moves, and edges crawl. So the choice is made with memory. A cell keeps the
   entry it had in the previous frame unless the new source colour is clearly
   closer to a different one — a margin, not a tie-break. The same rule applies
   to the alpha decision at step 3, so an edge cell does not flicker in and out.

   Cells are matched to the previous frame using an alignment measured from the
   **silhouette and the source brightness**, before any colour is chosen. This
   ordering is not a detail. Measuring alignment from already-quantised cells
   would make each step wait for the other: unstable colours would decide the
   offset, and the offset would decide which colours are allowed to stay stable.

   One offset cannot match a swinging arm, so memory applies only where the
   match is confident or the region is still. A limb that is genuinely moving
   gets no memory, which is correct — it is supposed to change.
3. **Harden.** A cell is opaque when at least half of it was foreground, subject
   to the same memory as step 2.
4. **Place.** Put every frame on the animation's canvas by its root (below).
5. **Thin.** Reduce the dense sample to the frames that carry the movement.
   Four frames are kept unconditionally — the first, the last, and the extremes
   of the action, which are the poses an animator would draw first. The rest are
   chosen to minimise how much of the movement is lost, judged on the silhouette
   rather than on raw cell change, so noise cannot outrank a wind-up. An extreme
   is found by measuring, not declared: it is where a limb or a held object
   reverses direction. Small fast things — a whip, a blade — are weighted up, or
   a thin object that crosses the whole canvas counts for less than a shoulder
   that shifts two pixels. **The source timing is kept**: each surviving frame's
   duration is the real time until the next one, so the animation plays at the
   speed it was drawn at rather than at a rate chosen afterwards. In a looping
   animation the first and last frame are the same moment, so only one of them
   is kept and its duration covers the join. The spike took 61 sampled frames
   down to 10.
6. **Compile.** Lay the frames into a sheet and write the atlas.

**The source already holds the arc. Correct the drift, not the position.**

Taking the bottom of the silhouette as the anchor works for a standing character
and breaks everything else. A jump gets pinned to the ground for its whole arc.

The camera does not move, so a frame in the middle of a jump already draws the
character higher up the picture. That height is the animation. It must be kept,
not recomputed.

So the position comes from the source and is never moved. What is computed and
applied is a small **correction**, which removes the drift the video model adds:

The feet are the lowest **solid** row of the character, not its lowest pixel. The
knight holds a sword that hangs below his tucked feet in the air; taking the
lowest pixel made the sword tip the foot line, and a 75 pixel jump measured as 8.
A row must carry about a tenth of the body's width to count as standing on
something. A blade tip never does.

- A **grounded** frame is one where the feet are on the ground. Its correction
  is whatever it takes to put the feet back on the baseline.
- An **airborne** frame gets its correction by interpolating between the
  grounded frames on either side. Corrections are small and change slowly, so
  interpolating one is safe. Interpolating the *position* is what would have
  flattened the jump.
- An animation with no grounded frame at all gets **no correction**, and says
  so. Trusting the source is better than inventing a baseline that does not
  exist.

The AI declares which frames are grounded when it plans the animation, and the
declaration is checked against the pixels: for a jump, the feet must actually
leave the baseline in the frames it called airborne. A grounded frame whose feet
are off the baseline after correction is refused.

**A loop is one of three things, and only one of them can fail.**

- **once** — plays and stops. A jump, an attack, a death.
- **forward** — the last frame runs back into the first. The loop is found by
  comparing **every start and end pair** in the clip: play from s to e, jump
  back to s, how big is the jump? Choosing a cycle length first and a start
  second is worse, and was replaced. Measured across five walks, two joined
  cleanly at 7% and 9%; the other three could not get below 37%, which means the
  character never returned to a pose it had held.
- **pingpong** — plays forward, then backward. **It always joins**, because the
  two ends are the same frame by construction. It costs the motion its
  direction, so it suits breathing, hovering and bobbing, and it does not suit a
  walk.

So a forward loop is offered when a real cycle is found, and ping-pong is
offered always. The user can also reorder or duplicate frames by hand. The atlas
already carries this: Aseprite's `direction` field takes `forward` and
`pingpong` unchanged.

**When no loop exists, say so.** A clip with no repeated pose cannot be made to
loop by any means after the fact — bridging with borrowed frames was tested on
five walks and never beat jumping straight back. The three honest answers are:
generate it again, ping-pong it and accept the reversed motion, or fix it by
hand. Quietly shipping a walk that jerks every cycle is not one of them.

**The canvas is per animation, and it is derived rather than chosen.** After the
frames are cleaned, each one's reach from its root is measured and the largest
in each direction sets the canvas. The spike measured 65 × 139 for the idle and
173 × 156 for the whip attack. The root keeps the character in the same place
across both.

Export can flatten this: one cell size for every animation, taken from the
largest, for engines that want a uniform grid. It costs empty space in the idle
rows, so it is a choice rather than the default.

---

## 3. The model

```
Character
  palette          the locked colour set, editable before any animation runs
  paletteCap       optional limit: 32, 16, 8, or a fixed set the user supplies
  ramps            the palette grouped into named material ramps, set at
                   approval, used to tell a lighting shift from a wrong colour
  artHeight        the character's height in art pixels (the reference: 136)
  exportScale      whole number only; 1 for a game engine, 8 for a large PNG
  basePose         the canonical frame, and the calibration for every scale
  root             the reference root: foot line and horizontal centre, standing
  styleNotes       what the AI must preserve, in words
  Animation[]
    canvas         cols x rows, sized to this animation's widest pose
    playRate       frames per second for playback
    loop           once | forward | pingpong  (see below)
    Frame[]
      cells        the grid: one palette index per cell, transparent allowed
      root         this frame's root position
      grounded     whether the feet are on the ground in this frame
      durationMs   the real time this frame held in the source
      provenance   which model drew it, which prompt, whether it was repaired
```

The grid is the stored form. The file on disk, the payload a tool receives and
the object in memory are one shape. There is no second representation.

A frame is stored as an **indexed** PNG — one palette index per pixel, with the
character's palette in the `PLTE` chunk — not as text rows and not as RGBA. At
60 × 140 text rows would also work; at larger sizes only the PNG does, and the
format should not have to change when a user asks for a bigger character.

This is stricter than the spike, which reads only truecolour PNGs and writes
RGBA. That was fine for throwaway scripts and is not fine here: RGBA storage
would let a frame hold a colour that is not in the palette, which is the one
thing the whole pipeline exists to prevent. The build takes indexed read and
write from a mature library rather than extending the spike's decoder.

Two rules make it hold. Every frame's `PLTE` chunk is compared to the
character's palette entry by entry when it is read, so a file whose palette has
been edited elsewhere is rejected rather than trusted. And index 0 is always
transparent, declared through `tRNS`, in every frame of every character — a
convention that is fixed once here so nothing downstream has to ask.

---

## 4. What the AI does

Everything that needs judgement, and nothing that needs an eye for pixels.

| Job | Output |
|---|---|
| Read the reference | the character sheet: palette size, ramp names, style notes, what must never change |
| Plan a batch | which animations, how many frames each, the play rate, whether each loops |
| Describe the movement | the motion instruction, plus which frames are grounded and where the extremes fall |
| Write the motion instruction | the prompt sent to the video model |
| Judge the result | per frame: accept, repair, or reject with a reason |
| Order a repair | a new single-frame draw, with an instruction naming what is wrong |
| Name and describe | animation names, frame labels |

The AI is given frames as images, never as text grids. The plugin already has
this seam: a custom tool hands an image back as tool content.

**It is never handed the whole sheet as one image.** A judgement is made on one
frame at a time, shown at 8× beside the base pose and the frame's two
neighbours. A single wide sheet is what the eye wants and what a vision model
cannot use, because it arrives shrunk past the detail being judged.

Its structural declarations — grounded frames, extremes — are checked against
the pixels, not trusted. A jump whose "airborne" frames never leave the baseline
is refused, the same way a run that claims to have written a file is refused
today.

Every run follows the Design Library's existing generation pattern:
`platformTools: 'none'`, custom tools as the only output channel, and a repair
loop that validates before accepting. See
`plugins/sero-design-library-plugin/runtime/generation/run.ts`.

---

## 5. Checkpoints

Two gates, both cheap to judge:

1. **The character sheet.** After ingestion, before any animation. The user sees
   the recovered sprite, the palette, the canvas and the anchor, and can change
   the palette or the size. Nothing is generated until this is approved.
2. **Each finished animation.** In a batch of five, the user approves each one
   as it lands rather than at the end.

When a frame fails validation, the runtime repairs it with the repair endpoint
(§2.2.1), up to two attempts, then presents the sequence and says which frames
were repaired — and which redraws were paid for and refused. It does not stop to
ask first; the checkpoint is where the user rules on it.

**At most four frames per animation are repaired automatically.** Each is a paid
call of about twenty seconds, and a clip with more wrong than that is one to run
again rather than to patch frame by frame. Whatever the budget could not reach is
named at the checkpoint rather than dropped.

---

## 6. Fixing

Two ways to fix anything, and **both are available on every frame at all times**
— not only when a check failed, and not only during a run. A frame that passes
every measurement can still be one the user dislikes, and that has to be
actionable.

### 6.1 Ask the AI

Available on a single frame and on a whole animation. The user may type what is
wrong, or say nothing and let the model work it out from the sequence.

A frame repair is a single-pose draw with the repair endpoint (§2.2.1), holding
the character, the palette, the canvas and the anchor. An animation repair re-runs
the sequence from an amended instruction. Both go through the same validation as
the original, and both append rather than replace, so the previous version
survives.

This is the same mechanism the automatic repair uses. The automatic path is
just this action, run without being asked, up to twice.

### 6.2 Edit it yourself

Reached from **edit** on any frame in the strip, or by double-clicking it.

Deliberately minimal, because the AI is expected to get it close: pencil,
eraser, eyedropper, fill, undo, onion skin of the neighbouring frames, and the
palette strip. Colours are restricted to the character's palette, so a hand edit
cannot break palette conformance.

Frame operations: duplicate, delete, reorder, insert, set duration.

---

## 7. Export

**PNG sheet plus Aseprite JSON.** Aseprite's format is already read by most
engines and tools. The anchor, the palette and the character id go in its `meta`
block.

`exportScale` must be a whole number. A request for a 512 px tall sprite from a
136 px character resolves to the nearest whole multiple, and the real size is
reported rather than silently produced by a fractional scale.

Options: trim to content, and one cell size for every animation. The second
pads the smaller animations up to the largest canvas, for engines that expect a
uniform grid.

---

## 8. The engine boundary

The extractable part is the compiler: grids and an animation description go in,
a pixel buffer and an atlas come out. It has no file system, no network, no
clock and no provider knowledge. A future game engine can take it as it stands.

Encoding the PNG stays outside it, in the runtime, where `node:zlib` is
available. This keeps the engine pure and the files small.

---

## 9. Where the code lives

A Sprite Studio page inside `plugins/sero-design-library-plugin/`, with all of
its code in its own folder. It shares only the fal connection and the settings.
Moving it into its own plugin later is a move, not a rewrite.

Storage sits beside the existing trees, under `characters/<id>/`.

---

## 10. Out of scope

- Skeletal or cutout animation. Every frame is drawn, not assembled from moved
  parts. This was ruled out deliberately.
- Tilesets, backgrounds, effects and UI sprites.
- Training a per-character adapter. Reference conditioning was good enough in
  the spike; revisit only if identity drift is seen in real use.
- Sound.

---

## 11. Known risks

Rewritten after the wider test — fifteen animations, five characters, three
action types. Several earlier risks are now closed and are not repeated here.

1. **Three walks in five contain no loop.** Not a search failure: every pair of
   moments in 73 frames was compared and the character never returned to a pose
   it had held. Prompting did not help, and neither did bridging. Ping-pong
   covers bouncing and breathing; it does not cover walking. This is the largest
   open problem, and §12.1 is the most promising lead on it — an end frame
   halved the error on both walks it was tried on.
2. **Grok draws a white box** around a bright subject on flat magenta. It
   appeared on every knight clip, and refusing it six ways in the prompt reduced
   it to about one frame in ten. The body-size check rejects those frames, so
   the cost is a repair rather than a broken sprite — but it is the model doing
   something we cannot stop.
3. **A small palette fits badly.** Colour residual tracks palette size: the
   knight's 36 colours give 21 to 37, the slime's 4 colours give 39 to 137. A
   character capped very low will not sit close to its own palette, and the
   fidelity threshold cannot be one number for every character.
4. **The identity judge is still unproven.** Showing crops rather than a sheet
   is a better bet, not a measured one. It warns and never repairs on its own.
5. **The spike code is proof, not foundation.** It reads only truecolour PNGs
   and writes RGBA, against D2. Every measurement in this document came from it,
   and none of it should survive into the build unexamined.

## 12. Worth trying next

Not investigated far enough to decide, and cheap to pick up later. Each entry
says what was seen, so the next attempt starts from evidence rather than from
the idea again.

### 12.1 Ask the model to land where it started

Some video endpoints accept an **end frame** as well as a start frame. Setting
both to the same picture makes closure the model's job instead of ours.

Tested once, on Seedance Fast, on the two worst walks:

| Walk | Best loop from cutting | With the end frame |
|---|---|---|
| Explorer | 59.3% | **33.4%** |
| Knight | 36.9% | **19.7%** |

Roughly halved on both, with clean keying, no cut-off frames and normal colour
fit. That is a real mechanism, and the only idea so far that improved a walk
with no natural cycle.

It does not finish the job. A third of the sprite still changes across the join,
and the motion is noticeably stiffer, because the end frame exists on Seedance
and Seedance is the stiff model.

**What to try.** A model with both good movement and an end frame. Grok has the
movement and no end frame; Seedance has the end frame and little movement.
Whichever model gains the other property first is worth re-measuring straight
away.

### 12.2 Grok's reference endpoint — rejected for now, and why

`reference-to-video` looked like the answer: it measured a 10.4% loop on the
character that could not get below 59.3% by any other means.

**The number was false.** The endpoint returns a *dimmed* magenta background,
which the key does not recognise, so the whole frame counted as the character —
all 73 frames failed the cut-off check and the silhouette measured 171 art
pixels for a 136 pixel character. Two frames that are almost entirely background
look nearly identical, and that is where the low number came from.

**What to try.** A key colour the model preserves, or a key that tolerates a
shift in brightness while still rejecting the character's own colours. The
earlier attempt at a brightness-tolerant key failed on the knight, because his
armour sits close to a washed-out magenta. It may work for characters whose
palettes are further from the key.

### 12.3 Others, untested

- **Training a small adapter per character** before any animation runs. The
  strongest identity lock available, and it was never needed badly enough to
  justify the time.
- **Two clips joined at a matching pose.** If one clip's end matches another
  clip's start, a longer usable sequence exists across the pair. The all-pairs
  search already computes what this needs.
- **A palette-aware key.** Choose the background colour per character, as far
  from its own palette as possible, rather than always magenta. A purple
  character would break the current fixed choice.
- **Video models with an explicit loop mode**, if any appear. Every failure in
  §11.1 is the same missing feature.

---

## 13. Evidence

| File | What it shows |
|---|---|
| `evidence/00-reference-sprite.png` | the reference recovered at its true 62 × 136 |
| `evidence/00-reference-recovered.png` | the same sprite enlarged, for comparison with the original |
| `evidence/01-seedance-idle.png` | the chosen video model, idle |
| `evidence/02-seedance-attack.png` / `.gif` | the chosen video model, whip attack |
| `evidence/03-nano-idle.png` | the chosen pose model, idle |
| `evidence/04-nano-attack.png` / `.gif` | the chosen pose model, whip attack |
| `evidence/05-kling-idle-rejected.png` | pixel discipline lost to noise |
| `evidence/06-seedream-idle-rejected.png` | character redrawn each frame |
| `evidence/07-walk-loop-*.gif` | the loop fix: the old cut jerks, the found cycle does not |
| `evidence/16-raw-grok-top-seedance-bottom.png` | why the model is the user's choice: Grok animates, Seedance moves a still pose |
| `evidence/17-model-choice-in-the-open.png` | the model picker, beside the request |
| `evidence/18-grok-white-box-artefact.png` | the white box Grok draws around the knight |
| `evidence/20-knight-jump-after-retry.png` | the knight's jump once the framing was fixed |
| `evidence/21-pingpong-*.gif` | forward against ping-pong, on the worst and best walks |

`spike/` holds the throwaway scripts that produced all of it. They are reference
material, not production code, and they are not wired into any build.
