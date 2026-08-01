# Sprite Studio: the review gate

**Status:** built. Specification §2.5 and decision D40 are the record; this file
is kept for the measurements behind them and for what was deliberately left out.
**Applies to:** `plugins/sero-design-library-plugin/sprite-studio/`
**Specification:** `docs/features/sprite-studio/spec.md` (§2.4, §5)
**Ships as:** one feature commit

---

## 1. What this is

Today a clip is drawn, the page decodes it, and code alone decides which six of
sixty-one frames become the animation. The user sees the result after the money
is spent and after the repairs are bought.

This adds **one screen between the clip and the sequence**. On it the user
watches the clip, sees every frame that came out of it, changes which ones are
kept, and then says go.

One screen, not two. Reviewing the clip and choosing the frames are the same
judgement — "is this take any good, and which parts of it do I want" — and
splitting them would ask the user to look at the same clip twice.

### Why it is worth building

- **Most bad frames are not bad clips.** They are good clips sampled at bad
  moments. Choosing by hand fixes that for nothing, where a repair costs a paid
  call and usually fails anyway.
- **It is the cheapest gate we have.** Everything on this screen is already on
  disk. Rejecting here saves every repair call and the judge run.
- **It answers "why these six?"** The frames are currently chosen by a rule the
  user cannot see, cannot predict and cannot overrule.

---

## 2. Decisions

| | Decision |
|---|---|
| One screen or two | **One.** The clip and the filmstrip sit together. |
| When the gate applies | **Always.** There is no setting to turn it off. |
| One animation | The review opens as soon as its frames are ready. |
| A batch | The review opens **once, at the end**, when every animation in the batch has finished or failed. It never interrupts a running batch. |
| Reordering frames | **Out of scope.** Order is always source order. |
| Changing frame timing | **Out of scope.** Timing is measured from the clip. |
| What the filmstrip shows | The **compiled sprite** for each sample, not the raw video still — the user must judge what they will get. |
| What "draw it again" costs | A new clip, at full price. The button says so. |

The two exclusions are deliberate. The workbench already edits a finished
animation frame by frame; this screen exists to answer one question — which
moments of this clip are the animation — and adding order and timing to it would
make it a second workbench.

---

## 3. The flow

**Now**

```
planned → generating → awaiting-frames → compiling → judging → ready → approved
                            ↑                                     ↑
                       page decodes                          checkpoint
```

**After**

```
planned → generating → awaiting-frames → proposing → awaiting-review → compiling → judging → ready → approved
                            ↑                             ↑                                    ↑
                       page decodes                  review screen                        checkpoint
```

`proposing` is short and unattended: the runtime compiles the samples, works out
which it would have chosen, and writes a preview of each one. `awaiting-review`
is a resting state — nothing is running, and it survives a restart.

No new paid call is added anywhere in this flow.

---

## 4. Where the work goes

### 4.1 The proposal is made by the runtime, not the page

The page holds pictures; the runtime holds the engine. Compiling and thinning
stay where they are, so the frames proposed are the frames the build would have
picked — the same code, not a second copy of it that can drift.

### 4.2 The filmstrip shows compiled sprites

During `proposing` the runtime writes one small indexed PNG per sample into
`animations/<id>/samples/`. These are the quantised sprite, at the character's
palette and scale.

Two reasons, and the second is the load-bearing one:

1. It survives a reload. The page does not decode the clip a second time.
2. **A raw video still is not what the sprite will look like.** Judging the take
   from 480p video frames would be judging something we are not going to ship.

They are small — a 62 × 136 sprite at two times scale is a few kilobytes — and
they are deleted when the review is settled.

### 4.3 The chosen frames are sent as indices

The page sends the sample indices it wants. It does not re-stage pictures and it
does not compute durations: a chosen frame holds until the next chosen frame,
which is a rule the engine already owns.

---

## 5. Changes by file

### 5.1 Types — `sprite-studio/shared/`

`character.ts`
- `AnimationStatus` gains `'proposing'` and `'awaiting-review'`.
- `AnimationRecord` gains:
  - `review?: ReviewProposal`
  - `batchId?: string` — which request created it, so a batch can be recognised
    without parsing an id.
- New `ReviewProposal`: `{ stagingKey, sampleDurationsMs, sampleCount, proposed: number[], loopWindow?: { from, to }, scale, proposedAt }`.

`state.ts`
- `AnimationSummary` gains `review?: { sampleCount; proposed: number[]; loopWindow?; previewDir; clipPath }`.

  Built without the planned `chosen` field. Nothing would ever have written it —
  the choice is held in the screen until Use is pressed, and the request goes
  straight to the build — and a field one side declares and the other never
  writes is the exact fault this feature area keeps producing.
- `SpriteRequestBody` gains `{ kind: 'sprite.frames.choose'; animationId: string; indices: number[] }`, and the kind is added to the allow-list.

### 5.2 Engine — `sprite-studio/engine/thin.ts`

- Extract `durationsFor(indices, sourceDurations, { cycleEnd })` from `thin`,
  which already computes "time until the next kept frame". `thin` calls it; the
  chosen path calls it too. One rule, one place.

  Shipped with an explicit `cycleEnd` rather than a `looping` flag. The caller
  knows where the cycle ends — the whole clip when no loop was cut, the cut's
  end when one was — and a boolean would have made the chosen path guess it.
- `ThinOptions.keep` is **removed**, not loosened: it was a target, and a bound
  that nothing sets is clearer than a target nothing means. `thin` stops when
  the next addition is worth less than 60% of the first addition (§5.8), between
  `MIN_FRAMES` and `MAX_FRAMES`, and `extremesOf` gains a size threshold and a
  cap (§5.9).

### 5.3 Assembly — `sprite-studio/runtime/generation/assemble.ts`

- `AssembleOptions` gains `chosen?: number[]`.
- When `chosen` is present, `thin` is skipped and those indices are used
  verbatim. The loop window is **not** re-cut: the user has already seen the
  whole clip and said which frames they want.
- Everything after selection — checks, report, continuity — is unchanged.

### 5.4 The proposal job — `sprite-studio/runtime/queue-jobs.ts`

New `runPropose`:
1. Read the staged samples.
2. Compile them and calibrate the scale, exactly as `buildAnimation` does today.
3. Run the loop search and `thin` to get the proposed indices.
4. Write one preview PNG per sample.
5. Write `review` onto the record and set the status to `awaiting-review`.
6. Open the review **only if** no sibling with the same `batchId` is still
   working.

`runBuild` gains the chosen indices and passes them through as `chosen`. It
keeps its staging key, so nothing is staged twice.

### 5.5 Requests — `sprite-studio/runtime/requests.ts`

- `sprite.generate` allocates one `batchId` and writes it on every animation it
  creates.
- `sprite.frames.attach` queues **propose** rather than build. Its existing
  guard — ignore unless the status is `awaiting-frames` — is unchanged.
- `sprite.frames.choose` is new: it is ignored unless the status is
  `awaiting-review`, refuses fewer than two frames, and queues the build.
- `sprite.animation.redo` already exists and is what both "draw it again" and
  "change the instruction" call. Nothing new is needed for either.
- `sprite.animation.delete` already exists and is what "discard" calls.

### 5.6 The screen — `sprite-studio/ui/`

New `components/ReviewPanel.tsx` — the clip, the count, the four actions.
New `components/SampleStrip.tsx` — the filmstrip, selection, keyboard support.

`SpriteStudioPage.tsx` shows the review panel when the open animation is at
`awaiting-review`, in the place the checkpoint uses.

The panel holds:
- the clip, playing, with normal controls;
- a filmstrip of every sample, in order, with the chosen ones marked and the
  loop window shown as a band;
- a live count — "9 of 61 chosen";
- **Use these 9 frames** · **Draw it again** · **Change the instruction** ·
  **Discard**.

Clicking a sample turns it on or off. There is no drag, no reorder handle and no
timing field, by decision. "Draw it again" and "Change the instruction" both say
that a new clip is paid for.

### 5.7 Housekeeping — three places a sample can be lost

- `staging.ts` / `runtime/index.ts` — `pruneStaging` removes staged files after
  an hour unless a pending request names them. An animation at `awaiting-review`
  has **no pending request**, so its samples would be deleted underneath it.
  The protected set must also include the staging key of every animation at
  `proposing` or `awaiting-review`.
- `recover.ts` — `awaiting-review` and `proposing` must be handled. A review left
  open at shutdown is resumed, not failed. `proposing` returns to
  `awaiting-frames`, which re-decodes for nothing.
- Sample previews and staged samples are cleared when the review is settled —
  chosen, discarded, redone or failed.

### 5.8 How many frames — measured from the clip, not guessed beforehand

Today the planner declares `frameCount` before anything is drawn, and the
selector keeps exactly that many. The planner cannot know: it has not seen the
clip. The description it reads even says *"a resting loop needs about six
drawings"*, which is why resting loops come back with six.

**Measured on the five clips in the test profile** — one resting loop, two
jumps, a walk and a whip attack, all re-sampled and compiled by the real engine:

| Animation | kept today | 15% | 20% | 25% | 30% | 40% |
|---|---|---|---|---|---|---|
| resting (forward) | 6 | 18 | 11 | 7 | 6 | 2 |
| whip attack | 14 | 24 | 21 | 18 | 15 | 12 |
| jump | 12 | 24 | 24 | 24 | 24 | 20 |
| Jump | 10 | 24 | 24 | 24 | 24 | 24 |
| walk | 16 | 24 | 24 | 24 | 24 | 24 |

**A fixed threshold was tried and rejected.** The quantity measured — how
different the worst-represented frame is from its nearest kept frame — is not
comparable between clips. The first addition is worth 32% on the resting loop,
52% on the whip attack and 100% on a jump. Any threshold loose enough for a
resting loop pins every energetic clip to the cap, so "the clip decides" becomes
"the cap decides".

**A relative rule is adopted instead**: keep adding while the next frame is
worth more than 60% of what the first addition was worth, scaled to each clip's
own movement, bounded between `MIN_FRAMES` and `MAX_FRAMES`.

Run back through the shipped code — not the sketch the table above came from —
the same five clips give:

| Animation | kept before | kept now |
|---|---|---|
| resting (forward) | 6 | 10 |
| whip attack | 14 | 15 |
| jump | 12 | 14 |
| Jump | 10 | 16 |
| walk | 16 | 24 (the cap) |

The whip attack lands within one frame of the count a person settled on by hand,
and the resting loop is corrected from six. The walk is discussed in §5.9.

This is fitted to five clips from one character, so it is a **proposal and not a
law**. That is the right strength for it: the review screen is where it is
overruled, and it only has to start in a sensible place.

`plan.frameCount` stops driving selection. It stays in the plan because the
airborne range is expressed in it, and the tool description is changed to say so
— it is a description of the action, not a quota for the selector.

### 5.9 Two faults the measurement exposed

**Reach extremes overshoot the count.** The walk seeds 15 extremes before the
count is consulted, which is why it kept 16 frames against a plan of 8. Frame
count is a floor today, not a limit. Extremes gain a size threshold — a reversal
must be worth something — and a cap, so they can no longer decide the count on
their own.

**A five second clip of a walk holds about five walk cycles.** No frame count
can fix that, and the relative rule cannot either: the walk sits at the cap at
every threshold because it genuinely contains that much distinct movement. The
answer is to cut one cycle, which is what `searchLoop` does — and it never ran,
because the plan said `loop: once`.

That is **not** in this commit. It is a loop-detection question, it needs its own
measurement, and the review screen makes it survivable in the meantime: the user
can see the repeats and keep one cycle by hand. Recorded here so it is not
rediscovered as a new problem.

---

### 5.10 Getting back — `ui/components/PanelParts.tsx`

Once a character is open there is no way back to the shelf. The breadcrumb is
already drawn — `Crumbs trail={['Sprite Studio']}` — but every step in the trail
is a plain `<span>`, so it looks like navigation and is not.

Each step becomes a button. `sprite.open` with neither key set already means
"nothing is open", because `setOpen` assigns both keys rather than skipping the
absent ones, so the shelf needs no new request.

The trail also gains the character when an animation is open, so the character
sheet is one click away rather than two.

### 5.11 Deleting an animation — `ui/components/CharacterRail.tsx`

An animation can be made but not removed. A delete control is added to each row
of the animation list.

**It confirms first, and the confirmation names what is lost:** the frames, and
the clip they came from. The clip is the part that cost money, so the dialog says
so — deleting is throwing away a paid call, and that is the fact the user needs
at that moment.

`sprite.animation.delete` already exists, already cancels any running job, and is
already safe (§9). No new deletion code is written.

**It is not a soft delete**, for the reason §9 gives.

## 6. Build order

- [x] **1 · Types.** Statuses, `ReviewProposal`, `batchId`, the summary field,
      the new request kind.
- [x] **2 · Engine.** `durationsFor` extracted; `chosen` accepted by `assemble`;
      the relative stop rule and the threshold on reach extremes (§5.8, §5.9).
      Unit tests: a chosen set keeps source order; durations run to the next
      chosen frame; the last frame of a loop covers the join; a flat reach curve
      seeds no extremes; the count never exceeds `MAX_FRAMES`.
- [x] **3 · Propose.** `runPropose`, sample previews, the batch-open rule. Unit
      tests: the proposal matches what `thin` would have picked; a batch does not
      open until its last animation lands.
- [x] **4 · Requests.** `batchId` at generate, attach queues propose,
      `sprite.frames.choose` with its guards. Unit tests: a replayed choose after
      the build changes nothing; fewer than two frames is refused.
- [x] **5 · Housekeeping.** Staging protection, recovery, clearing. Unit tests:
      an hour-old review keeps its samples; a review survives a restart.
- [x] **6 · Screen.** `ReviewPanel`, `SampleStrip`, page wiring. Component tests:
      toggling changes the count; Use is disabled below two frames.
- [x] **7 · Planner.** `frameCount` described as the action's shape and the
      airborne range's unit, not a quota for the selector.
- [x] **8 · End to end.** The existing test is extended: the run now stops at the
      review, the frames are changed, and the sequence that comes out has the
      chosen count. This replays from the recorded cassette and costs nothing.
- [x] **9 · Getting about.** Clickable breadcrumbs; a delete control on each
      animation row, with a confirmation that names the frames and the paid clip.
      Component tests: the trail returns to the shelf; delete does nothing until
      the confirmation is accepted.
- [x] **10 · The deleted-character leak.** Wire up `restoreCharacter` and
      `purgeCharacter`, which exist and are unreachable (§9).
- [x] **11 · Documents.** Specification §2.4 and §5, decision D40, and the
      Design Library page on the documentation site.

Every step leaves the application working. Steps 1 to 5 are invisible to the
user; the gate only appears at step 6.

---

## 7. What could go wrong

**A review nobody can finish.** The samples are on disk and the record points at
them. If either is removed while the other survives, the screen has nothing to
show and no way forward. This is the fault that has broken this feature area
repeatedly — one side depending on something the other never wrote, or quietly
deleted. §5.7 is the whole of the answer, and step 5 is where it is tested.

**Disk.** Sixty-one source frames per animation are held until the review is
settled. At 720p that is roughly ten megabytes an animation, so a batch of five
holds about fifty until the user comes back. Acceptable, and it must actually be
released — a leak here grows with every animation ever made.

**A batch that never opens its review.** The rule is "open when no sibling is
still working". An animation that fails must therefore count as finished, or one
failure holds the whole review shut for ever.

**Nothing chosen.** Refused at the request, not only in the interface, because
the interface is not the only way in.

---

## 8. Not in this commit

- Reordering frames, and editing frame timing on the review screen.
- Adding a frame the clip does not contain. The workbench already redraws a
  frame, and that path is unchanged.
- Any change to the repair budget. With hand-picking, fewer repairs should be
  needed, but that is a number to change after the gate has been used rather
  than on the strength of an expectation.
- Cutting a repeating cycle out of a clip that contains several (§5.9).

---

## 9. Every deletion in Sprite Studio, checked

Nothing new deletes anything. This is an audit of what already does, because a
delete control is being added to the interface and the code behind it has to be
sound before a button points at it.

**There are four deletions, and all four are recursive.**

| Where | Removes | Path built from |
|---|---|---|
| `store.ts` `destroyCharacter` | `characters/<id>/` | the id in the request |
| `store.ts` `destroyAnimation` | `characters/<id>/animations/<id>/` | the record, after it is found |
| `staging.ts` `clearStaged` | `sprite-staging/<key>/` | the key in the request |
| `staging.ts` `pruneStaging` | `sprite-staging/<name>/` | names read from the directory |

### The guard

Every id used to build one of those paths goes through `assertSafeId`, and the
check lives **inside the path helpers** rather than at the call sites, so a new
call site cannot forget it. The rule is one path segment:

```
/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
```

It was attacked rather than read. Twenty-two hostile ids, all refused:

- `..`, `../..`, `../../../../etc`, `a/../../b`, `a/b`, `a\b` — traversal, refused
  by the character class, which holds no separator.
- `.`, `..`, `.hidden`, `-rf`, `~`, `$HOME` — refused by the first-character rule.
- **`""` — refused.** This is the dangerous one. `path.join(charactersDir, '')`
  is `charactersDir`, so an empty id would have aimed a recursive delete at
  **every character at once**.
- `"a\n"`, `"a\n../.."`, `"a\r\n.."` — refused. JavaScript `$` without the `m`
  flag matches only the true end of the string, unlike some other languages where
  a trailing newline would slip through.
- 129 characters — refused; 128 accepted.

`destroyAnimation` is safer still: it takes its ids from the record it has just
read off disk, not from the request. `pruneStaging` takes its names from
`readdir`, which never yields `.` or `..`.

**Verdict: the four deletions are sound, and the new control needs no new
deletion code.** A test that runs this list against `assertSafeId` is added, so
the guard cannot be loosened later without something failing.

### Two faults found while checking

**A deleted character is invisible and cannot be recovered or removed.**
`sprite.character.delete` sets `deletedAt`, and the shelf then filters those
characters out for ever. `restoreCharacter` and `purgeCharacter` exist in the
interface layer and **nothing calls either of them**. So a deleted character
keeps its base pose, its animations, its frames and its clips on disk, out of
sight, with no way to bring it back or clear it out.

A soft delete with nowhere to go is a leak wearing the costume of a safety net.
This is why the animation control deletes for real, and why step 10 wires up the
two requests that already exist.

**`sprite.frame.delete` leaves the frame's PNG on disk.** That is correct and
should stay: revisions in `history` hold `FrameRecord`s pointing at those files,
and removing one would break the restore that repairs depend on. Recorded so it
is not "tidied up" later by someone who reads it as an oversight.
