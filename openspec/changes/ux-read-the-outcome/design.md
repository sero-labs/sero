## Context

See proposal.md. The design-relevant facts found while reading the code and the
records the drawing was taken from.

**The drawing's own records are still on this machine.** Every claim below was
checked against them:

- Frame 1: `loop_a305ba3c-16b1-4cf2-bbc4-5e736a03915b` in
  `dungeonexplorer-resilience-01`, titled "M3: Maintenance — visibility radius 3
  with regression check". Its recorded completion reason matches the drawing word
  for word. A second real Workflow (`loop_ecaaa152…`, Frogger M1) holds the long
  request the drawing folds, at 10,530 characters.
- Frame 2: `proj_v1hy1h7u` (DungeonExplorer), milestone `m3`, dispatch
  `loop_200ac871-0683-4209-818e-14a95318d3ae`, run
  `run_e7730fe7-dcb4-4490-964a-893cbef93524`.
- Frame 3: Room `room_8f83c75a…` "Frogger: Neon Crossing — Product and Technical
  Direction", three artifacts.
- Frame 4: a member's Info tab, `maxCostUsdPerMember` 2.50.

**The run that frame 2 draws does not hold the reason the issue names.**

```text
 run_e7730fe7…  status        orphaned
                block         (absent — the issue cites block.reason)
                statusReason  (absent)
                stepActivations[0]  implement-fov-fog, visit 1, status orphaned
                observations[0]     "Process restarted: run … marked orphaned;
                                     in-flight steps reset."
 plan step 1    implement-fov-fog
```

`block.reason` does exist on other real runs, but only for management limits:
`reached max cost ($1.2)`, `reached max wall-clock (1800000ms)`.

**The summary drops three facts `LoopRun` already holds.** `toRunSummary()` in
`runtime/store.ts` omits `run.block` and `run.startedStepIds`, and resolves a step's
status as `last?.status ?? (activation.status === 'running' ? 'running' : 'completed')`
— so an interrupted activation reads as completed, and an already-finished attempt
takes precedence over the interruption.

**Two other writers already own this field.** `dispatch-watch.ts` writes its own
`Workflow reached its $X cap…` and `Workflow reached its time limit…` sentences into
`dispatch.failure`, for the two limit cases that already have a real `block.reason`.
Any change to the sentence has to account for both writers, not only `run-health.ts`.

**The artifact bug is at the write, and the escape is deliberate upstream.**
`tokenizeCliInput()` in `apps/desktop/electron/cli/core/parser.ts` keeps a backslash
for anything but `"`, `'`, `\` and a space — "so downstream handlers can interpret
it". The Room command shaper passes `body` through untouched. Measured on the three
Frogger artifacts: 45, 68 and 28 escaped `\n`, and zero real line breaks. The repo
already solves this once, in `plugins/sero-memory-plugin/extension/memory-tool.ts`:
`raw.replace(/\\n/g, '\n')`.

**The artifacts have three different heading shapes.**

```text
 artifact_7aafbcee…  plan   "# <title>" then ten "## <section>"     <- frame 3's card
 artifact_354aa84f…  report "## <section>" only, no document heading
 artifact_f848e9d4…  report no heading at all; a plain opening line then bullets
```

Markdown used across them: `**bold**` (36 delimiters), `-` bullets (38), `1.`
numbers (6), and no tables, fenced code or `###`.

**The drawn card title is the artifact's own title, not the file's first heading.**

```text
 metadata        "Final proposal: Signal Wake Crossing"   <- what the drawing draws
 file line 1     "# Frogger: Neon Crossing — product and implementation direction"
```

**The Result text in frame 3 is already on hand.** `RoomCompletion` receives
`finalLine`, read from the last `room-status` timeline event. The drawing's Result
is that line minus its trailing `Final plan: artifact_7aafbcee….` sentence — which
the inline plan block replaces. `delivery` holds the drawn `To workspace files ·
16 Sep, 23:13` row.

**Frame 2's evidence rows map one-to-one to stored fields.**

```text
 pnpm typecheck 0.9s   commands[0].durationMs 863      preview.smokePassed   "Page / responded"
 pnpm lint      1.5s   commands[1].durationMs 1481     preview.capturePath   "Screenshot of /"
 pnpm test      0.8s   commands[2].durationMs 822
 pnpm build     0.8s   commands[3].durationMs 833      diffSummary "untracked:" has exactly 17 entries
```

`evidenceLines()` in `ui/lib/view-model.ts` currently folds the last 400 characters
of output into one `result` string per check. Changed-files, preview and capture
rows carry no duration, so a duration is not a property of every check.

**Two requirements already exist that this drawing changes.** #537's `architect-ui`
delta puts Retry step in the header *and* keeps the milestone rail's copy, with a
scenario requiring both to work. #537's `orchestrator-ui` and `architect-ui` deltas
are unarchived, so their text is not yet in `openspec/specs/` for the `architect-ui`
case only partly — `architect-ui` and `architect-project-record` have main specs;
`orchestrator-ui` does not.

**The Room's artifacts are inside its workspace.** They live at
`<workspace>/.sero/apps/orchestrator/rooms/<roomId>/artifacts/<id>.md`, so a path
under the plugin state dir is still a workspace path. Whether `openSeroFile()`
should be given that path is a question for the read seam, not an assumption that it
cannot work.

## Goals / Non-Goals

**Goals:**

- The result and the reason are on the page, from the record, from this change
  onwards, without a reader reconstructing either.
- One statement per fact where a fact is currently printed twice or four times.
- One rule per figure, so a screen cannot disagree with the limit that stops work.
- Every obligation the drawing carries has a task that binds it.

**Non-Goals:**

- Recovering the stop reason of runs written before this change. That is history,
  not a workflow the product supports; the field applies from now on and the
  absence case is stated plainly.
- Changing the Room header's meters to text. #537 decided the meters stay meters.
- Decoding escapes in message, question or answer prose. Only artifact content
  published through the Room command surface.
- Rewriting the artifact files already on disk.
- Any surface owned by #539 (History, comparison) or #541 (cross-app thread).

## Decisions

### The per-run summary retains the block and every interrupted step

`LoopRunSummary` gains `block?: LoopBlock` and `interruptedStepIds?: string[]`, and
`toRunSummary()` stops collapsing an interrupted activation into `completed`, and
stops letting a finished last attempt hide the interruption.

All three facts already exist on `LoopRun`; this retains them rather than measuring
anything new. Both fields are optional, so older records load unchanged and are read
as retaining no cause.

This applies from now on. A run that already ended keeps the summary it was written
with, and a reader states that no cause was recorded. A backfill would need to
rebuild every index from its run files, and the value is historical rather than a
workflow the page must support.

Alternative considered: teach `applyRunHealth()` to read each run's own file.
Rejected — it adds a second read path for a historical case, and the same facts are
already being discarded one line earlier.

### A limit's reason reaches the header from wherever the run recorded it

Three writers can set the reason. `applyRunHealth()` composes one from the run's
status; `dispatch-watch.ts` composes its own for a cap or a time limit. The cap and
time-limit cases already have a real `block.reason` on the run, so the fix is to
prefer the run's own reason in all three places and compose only when there is none.

### A restart's reason is composed from retained facts, not saved as a sentence

The record holds that the run was orphaned and which steps were in flight, which
says the same thing as the drawn sentence. The Orchestrator keeps the facts; the
Architect words them. A saved reason is printed when there is one, a restart
sentence is composed when the run was interrupted, and otherwise the page says the
work stopped without a recorded cause.

The step number is printed only when the run's own step order resolves to one
interrupted step. Several interrupted steps are named without a number.

### One Result row for every ending

`LoopNotices` prints `Stopped (<status>): <reason>` for a non-complete ending and
nothing at all for a complete one. One row above the settings, toned by the ending,
replaces both and prints the recorded reason for either.

`BlockNotice`'s non-step branch is removed with it, and its `Restart` and
`Refine plan` actions move onto the Result row, so a limit reason is printed once
and its recovery is still reachable. `BlockNotice`'s step branch stays: it is the
only place that names the blocked step and points at Retry step on it.

### A complete Workflow keeps no state line

Frame 1 shows `Complete · 4 of 4 steps finished · 10 days ago · 1 run`. #537 removed
that line in review and recorded why: every step card already reads Done, and the
Attempt history fold already counts the runs. That departure is carried forward
rather than reversed, and the change takes the Result row and the request fold from
frame 1. `loop-state-line.ts` is not touched.

### Escaped line breaks are decoded where the command surface writes the artifact

`tokenizeCliInput()` keeps a backslash deliberately and expects the handler to
interpret it. The Room command shaper is that handler for a Room command, and it is
where the escape is known to be an encoding rather than text.

Decode there, for the artifact body only. A structured caller that supplies ordinary
text never passes through the shaper, so a line of prose that quotes `\n` is stored
as written. The renderer applies the same rule when it splits a document, which is
what makes the three artifacts already on disk render their headings without being
rewritten — an approved Decision on this issue.

Alternative considered: decode at the Runtime's `publishArtifact`, for every caller.
Rejected — it cannot tell an encoding from text the author meant to write, and it
would rewrite a legitimate single-line artifact that quotes the escape.

### The plan is rendered by a heading split, and every character is kept

The artifacts need four constructs: a document heading, section headings, paragraphs
with bold, and list lines. A split on heading lines gives the first section open and
the author's rest folded. A Markdown library would add a dependency to a plugin for
constructs the artifacts do not use, and would render constructs the drawing never
shows.

The split is lossless. Text before the first heading is shown, a document with no
heading shows all of its content, and unsupported markup is shown as text rather
than dropped. The three real shapes are the cases the tests use.

### The final plan is the Conductor's plan artifact, titled from its own metadata

Kind `plan` produced by the conductor, else the newest artifact of kind `plan`, else
no plan block. The card's title is the artifact's own recorded title — "Final
proposal: Signal Wake Crossing" — not the file's first heading, which names the
subject rather than the artifact. All of the document's text is still shown.

### The read path is the Room app's, with the Room's own authority

The renderer cannot read the plugin state dir directly. The Room app tool gains a
read action that resolves an artifact by id against its Room and returns its
content. Naming an artifact that belongs to another Room is refused.

`RoomArtifactLink` hands `openSeroFile()` a path under the Room's state dir, which is
inside the workspace. The read seam is the right place to settle whether that call
should change, and to keep one action for "open this artifact's file".

### The Room's result is the Room's own closing line

`RoomCompletion` already receives it. The trailing `Final plan: artifact_…` sentence
is dropped only when the inline plan block is shown for that same artifact, matched
by id, so the fact moves rather than disappears. The `Delivered` row is the
`delivery` record the Room already holds.

### The member's spend reads the fault rule the project and the Room already use

`spendTone()` in `plugins/sero-architect-plugin/ui/lib/format.ts` already returns ok,
warn and err for a spend against a cap. The member's spend uses the same rule and the
drawing's ring, rather than `Math.min(100, …)` painted `bg-brand-primary` whatever
the ratio.

### The recovery control moves whole, not partly

The milestone rail's recovery control carries a cap field, an "Approve cap and
resume" mode, a busy state and error output, and works with or without a step id.
Moving only the simple retry would strand cost-limited and no-step recoveries. The
whole control moves, and the rail keeps its title, status and Orchestrator link.

### `runtime/rooms/room-app-actions.ts` is split before it takes the read action

It is at 491 of the 500-line source cap. The artifact read belongs in its own module,
beside `room-command-artifacts.ts` which already owns the member-facing equivalent.

## Matching the drawing

The drawing governs appearance, so each high-risk treatment below is bound to a task
by name. A task that only reorders existing cards would pass a behavioural check and
still fail the design, which is the failure #536 and #537 both recorded.

| Drawing treatment | Selector | Bound by |
| --- | --- | --- |
| Result row: emerald wash, 1px tinted border, 9px radius, 12–14px inset, label column | `.result`, `.result .kv` | 5.1, 5.2 |
| Objective line with the request opening from its chevron | `.objective`, `.objrow`, `.req` | 5.4 |
| Settings row: wrapped labelled values, mono micro labels | `.setrow` | unchanged, checked in 8.8 |
| Evidence: mono rows, duration right, output in its own inset block | `.checks`, `.checks summary`, `.checks pre` | 4.1, 4.3 |
| Milestone ledger: dot, title row, pipeline pills, inline ladder | `.ms`, `.msrow`, `.mshead`, `.pipe` | 4.3, 8.6 |
| Header band split into a main column and a shaded ring column | `.band.split`, `.bandmain`, `.ring` | 3.6, 7.1 |
| Spend ring: 64px, 5px stroke, red when at or over | `.ring`, `.ring.over .val` | 7.5 |
| Room two-column grid, 230px member column | `.roomgrid` | 6.8 |
| Member row: full name, state under it, selected raised | `.tm`, `.tm.on` | 6.8 |
| Plan card: title, kind and author inline, Open file at the right | `.art`, `.arthead`, `.prose` | 6.3 |
| Other artifacts as compact bordered rows | `.others`, `.orow` | 6.4 |
| Cost list: two columns, mono amounts, no bars | `.costs` | 6.7 |
| Member header: name, start time and turns on one line | `.mhead`, `.mini` | 7.2 |
| Tabs: 18px gap, underline on the current tab | `.tabs` | 7.1 |
| Fact rows: 110px label column inside a band, mono micro labels | `.kv`, `.band .kv` | 7.1, 7.3 |
| State glyph: 16px tinted chip, drawn shape | `.act .glyph` | 8.1 |

Three rules apply to every one of these and are checked in 8.1:

- **Nothing animates and no meaning rests on colour.** Every state carries a word
  and a shape.
- **Reuse the shared vocabulary.** `ACTIVITY_STATE_WORD`, `ACTIVITY_STATE_GLYPH`,
  `ACTIVITY_STATE_TONE`, `activityNextStep()`, `isLive()`, and the existing
  `ActivityGlyphIcon` / `ActivityGlyphChip`. No second vocabulary, no fresh icons.
- **Plugin CSS is wrapped in `@scope`, so the `--color-room-*` names exist only
  inside Tailwind utilities.** Plain CSS uses host tokens: `--bg-surface`,
  `--border-subtle`, `--text-muted`.
- **A clickable value looks clickable**: a pointer, a dotted underline and a hover
  state. Tailwind gives a `<button>` the arrow cursor.

## Risks / Trade-offs

- **A consumer of `runs/index.json` assumes the old shape.** → Both fields are
  optional and older records load unchanged. The one changed meaning — an
  interrupted step no longer reading `completed` — is a correction, and
  `architect-run-observability` already forbids showing interrupted work as
  completed.
- **A run that stopped before this change keeps the generic sentence.** → Accepted
  and stated. The page says no cause was recorded rather than inventing one.
- **A branched plan makes a step number ambiguous.** → The sentence drops the number
  when the run's own order does not resolve to one interrupted step.
- **Decoding at the shaper leaves a structured caller's escapes untouched.** → That
  is the intent: only the command surface produces the escape. The renderer's
  document split is the backstop for text that arrived escaped anyway.
- **The Room result reads one artifact on open.** → Read when the plan block opens,
  not on render. A Room's artifacts are bounded and already listed.
- **`RoomCompletion`, `RoomMemberFacts`, `LoopDetail`, `StateLine`, `MilestoneRail`
  and `ProjectPage` all grow.** → The 500-line cap applies; split by seam before
  completion rather than after.
- **Frame 3's header shows text where the Room header keeps meters.** → #537 already
  decided the meters stay meters; this change does not reverse it.

## Migration Plan

1. Archive in order: `ux-activity-at-a-glance`, then `ux-act-on-it`, then this
   change. `strategy` — this change *modifies* `architect-ui`'s "Project page shows
   four parts", which #537 also modifies. Its `MODIFIED` block here is a copy of
   #537's text with only the recovery-control location changed, so archiving this
   change first would let #537 overwrite it. `orchestrator-ui` has no main spec yet,
   so its delta stacks on the two changes in front.
2. Land the run-record retention and the two reason writers first, with their tests,
   so the reason the header prints is available before the header prints it.
3. Land the command-surface decode before the renderer's document split, so a newly
   published artifact and a stored one behave alike.
4. Rollback is per-surface once the run-record retention is in.
