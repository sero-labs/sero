## Context

See `proposal.md` for motivation and `specs/` for the behaviour contracts. This
document covers only what the specs leave open: the record's shape, what each
writer saves, how the view composes a line without parsing, the navigation the
links need, and the three data-touching fixes.

The relevant current state:

- `HistoryEntry` is `{ at, phase, overlay, cause }`. Ten writers compose `cause`
  by string interpolation, and eight of them embed a raw id.
- History renders in `ui/components/SideColumn.tsx` as a `<details>` list of
  `shortTime(at) · cause`, with the open state in the host layout service under
  `historyOpen`.
- `ArchitectView` in `ui/lib/navigation.ts` has four modes: `list`, `project`,
  `models`, `inspector`. The project controls menu in `ui/components/TopBar.tsx`
  owns the last two.
- `LoopRunStepSummary` holds `stepId` and `planIndex`, no title.
  `toRunSummary(run, planStepIds)` in `runtime/store.ts` already receives the
  plan's ids.
- `LoopRunSummary.block` exists, written by the previous change, so a run's stop
  reason is on the summary.
- `RoomActivity.tsx` promotes an `artifact` event into a card whose title is
  `artifactFileName(ref)`, so the event's own `Published plan: <title>` line is
  discarded. `RoomSidePanel.tsx` tabs and `RoomActivity.tsx` filters carry no
  counts.
- `REFLECT_SYSTEM` in `runtime/reflection.ts` does not mention the existing
  insights, though `buildReflectTask` already sends them.

## Goals / Non-Goals

**Goals:**

- One small shape on the record, so the view names and links a subject and folds
  a note with no parsing and one branch.
- Keep the change to the persisted shapes additive, so a record and a run summary
  written earlier load unchanged.
- Reuse the seams that already exist: `openDispatch` for a Workflow or Room, the
  host layout service for a preference, `RoomArtifactLink` for opening a file.

**Non-Goals:**

- Rewriting the entries a record already holds. That is the accepted departure in
  `comparison.md`.
- A general id resolver, or a migration pass over stored records.
- Any change to the Workflow page's plan or result views, which earlier changes own.

## Decisions

### 1. Two optional fields on a history entry, and one branch in the view

```ts
export interface HistorySubject {
  /** Which record the entry is about. The kind also decides the link, if any. */
  kind: 'milestone' | 'workflow' | 'room' | 'decision';
  id: string;
  /** The subject's name, saved where the writer held it. */
  label: string;
}

export interface HistoryEntry {
  at: string;
  phase: ArchitectPhase;
  overlay: ArchitectOverlay | null;
  cause: string;
  /** What the entry is about. Absent on entries written before this change. */
  subject?: HistorySubject;
  /** The long note, question or reason, folded under the entry. */
  detail?: string;
}
```

The view builds one line:

```ts
const line = entry.subject && entry.subject.kind !== 'decision'
  ? `${entry.subject.label} ${entry.cause}`
  : entry.cause;
```

A decision's cause is already a full sentence ("You answered Architect's
question: retry"), so it takes no label prefix. Every other kind reads as its
name followed by what happened. This is the whole branching cost, and it is one
ternary in one pure function, `historyLine(entry)` in a new
`ui/lib/history-view.ts`, beside `historyLink(entry)`.

The alternative was to save the composed sentence in `cause` and resolve the
title at read time from `record.milestones`. That needs a lookup that can miss,
and it reads the current record to describe a past event, which the "truth on
screen" rule forbids. Saving the label costs four bytes per entry and removes the
lookup.

### 2. What each writer saves

The eight interpolation sites become name-first sentences plus a subject. The
kind, not the surface, chooses the link.

| Writer | cause | subject | detail |
| --- | --- | --- | --- |
| `dispatch-link.ts` | `sent to its Workflow` or `sent to its Room` | work kind, work id, milestone title | none |
| `owner-actions.ts` accepted | `accepted on passed evidence` | milestone, its title | none |
| `owner-actions.ts` milestone added | `added` | milestone, its title | none |
| `projects-actions.ts` milestone approved | `approved` | milestone, its title | none |
| `owner-actions.ts` decision raised | `Architect asked a question` | decision, its id | the question |
| `projects-actions.ts` decision answered | `You answered Architect's question: <option label>` | decision, its id | the answer note, when there is one |
| `repair-dispatch.ts` | `You reconnected it to its Workflow` | workflow, work id, milestone title | none |
| `run-health.ts`, `research-workflow.ts` | `Workflow resumed` | workflow, work id, milestone title where known | the block reason |
| `research-room.ts` | `Room resumed` | room, room id, room title | the block reason |
| `services.ts` maintenance | `Maintenance Workflow subscribed` | workflow, its id, the Workflow's title where known | none |

A writer that does not hold a title saves the best name it has, and saves `null`
where it has none; the view falls back to `cause` alone. Every writer already has
the milestone or the decision in hand at the call site.

### 3. Entries written earlier are shown as written

No resolver and no backfill. `subject` and `detail` are absent, so the view prints
`cause` exactly as today and invents no link. This is the departure the proposal
names, and `comparison.md` records the reason: the ids in those entries are inside
sentences the Architect wrote, and unwinding them would be string matching, which
this change removes elsewhere.

### 4. Navigation and the link map

`ArchitectView` gains a `history` mode. `viewId` maps it to
`projects/<id>/history`, `parseViewId` reads it back, and `ProjectView` in
`ArchitectApp.tsx` renders a new `HistoryView` for it, beside `ModelSettings` and
`Inspector`. The project controls menu gains one item that calls `openHistory`,
beside the existing `openModels` and `openInspector`.

`historyLink(entry)` returns at most one target:

```text
milestone -> the milestone's evidence on the project page
workflow  -> openDispatch (already exists in ui/lib/page-helpers.ts)
room      -> openDispatch
decision  -> none
```

The Workflow and Room links reuse `openDispatch`, which already opens the
Orchestrator on a dispatched Workflow or Room.

The Evidence link needs one new seam, because evidence lives on the project page
inside `MilestoneRail`. The project view gains an optional `focusMilestoneId`.
`viewId` encodes it, `parseViewId` reads it, and the rail scrolls that milestone
into view and opens its evidence. It is one optional field on an existing view and
one prop on `MilestoneRail`, not a second navigation system.

### 5. A run's step summary keeps the title

```ts
export interface LoopRunStepSummary {
  // ...existing fields
  /** The plan's title for the step when the run visited it. Absent on older summaries. */
  title?: string;
}
```

`toRunSummary` in `runtime/store.ts` takes the plan's steps instead of just their
ids, and writes each activation's title from the step it names. `loop-store.ts`
passes `loop.plan.steps`. A summary written earlier has no title, and the row
falls back to `stepId`.

The alternative was to look the title up from the loop's current plan in the UI.
That breaks when the plan is revised after the run, which is common: reflection
and manual revise both rewrite the plan. A row would then name a run's step with a
title that step did not have when it ran.

### 6. The attempt-history row

`RunRow` in `ui/components/AttemptHistory.tsx` takes the drawing's row:

- The number reads `Run 2`, without the shipped `#`.
- The chip carries the ending. It is `run.block?.reason` when the run holds a
  block, and the existing status label otherwise.
- The start is `formatDayTime(run.startedAt)`, the drawing's `10 Sep, 13:09`,
  where the shipped row prints `formatTime`'s full locale stamp. `formatTime`
  stays for its other callers.
- The second line is the visited steps' titles in visit order, joined with an
  arrow, each read from `LoopRunStepSummary.title` with a fallback to its id. When
  the run visited no step, or carries a run-level `statusReason`, the line is
  `summarizeRun`, which states the reason.
- The step-outcome counts `summarizeRun` builds for a run that did visit steps are
  dropped. The chip states the ending and the titles state the steps, so the
  counts say a third time what the row already says. `summarizeRun` stays for the
  run that visited no step.
- The trigger and delivery badges stay on the first line when the run has them.
- The table follows the drawing: uppercase mono column labels with no shaded
  strip, and rows separated by a hairline rather than boxed.
- A run's stop chip is red, not the shipped amber. This case is approved: a stopped
  run is a fault, red is the fault colour, and amber stays reserved for what asks
  the user something.

The status label stays for runs with no block, so nothing that reads today reads
as empty tomorrow.

### 7. Reflection gets one rule, not a filter

`REFLECT_SYSTEM` in `runtime/reflection.ts` gains a rule that the existing
insights are already known and that a new insight must state something none of
them states. `buildReflectTask` already sends them. No change to
`applyReflection`: it still appends what the model returns. The spec's "MUST NOT
be made by matching one lesson's text against another's" is why there is no
duplicate filter in code.

The "What reflection has learned" fold in `ui/components/LoopDetail.tsx` takes the
drawing's treatment through the `hint` that `CollapsibleSection` already carries
for the run count: the number of lessons at the section's right, and each lesson's
recorded day beside its text. The day is a new `formatDay` beside `formatDayTime`,
which would otherwise print a time the drawing does not show.

### 8. The Room changes

- The promoted `artifact` card's title becomes `event.summary`, and
  `RoomArtifactLink` becomes the card's own `Open` control. `artifactFileName` is
  no longer used for the title. The artifact's title already rides the event.
- `RoomActivity` counts events per filter in the same `useMemo` that filters them,
  and each filter carries its count. `RoomSidePanel` counts items per tab; Work,
  Claims and Artifacts carry a count, and Brief and Changes do not, as the drawing
  has it. An empty tab carries `0` and stays a button.
- The count is its own element, not part of the label: a 10px mono numeral in the
  muted text colour, set 3px after the label. The label stays the label and the
  count stays the count.
- The filter pills take the drawing's treatment, which is not the shipped one. An
  inactive pill is outlined with a transparent background and one hairline border
  and the active pill alone is filled with a raised background and white text. The
  shipped build fills every pill and tints the active one with the brand colour.
  The drawing's geometry is `padding: 4px 10px`, a full round, and 12px text, where
  the build is 21px tall, an 11px round and 10px text.
- The tab row takes the drawing's treatment too: tabs sized to their content with
  an 18px gap rather than an equal-width grid, 12.5px text, and the active tab
  carrying a 2px brand underline rather than the shipped 1px inset shadow. An
  empty tab is dimmed while its `0` stays legible.
- `Brief` drops its trailing paragraph. Nothing else in the panel changes.

### 9. The fold preference

`useDisclosures` keeps `olderOpen`. `historyOpen` stops being read. The History
view persists which notes the user has opened as one joined list under
`historyFolded`, the same shape `useInspectorPreferences` uses for
`inspectorExpanded`. One preference, one pure helper.

## Risks / Trade-offs

- The Evidence focus reaches into `MilestoneRail`, which earlier changes own. If
  the scroll-and-open turns out to need more than a prop, the link becomes a
  departure and returns to the project page without opening the milestone.
  Mitigation: build the rail prop first, and record the outcome either way.
- The drawing's frame 1 headline for a raised question ("Architect asked how to
  get past the broken capture step") is a hand-shortened question. The build
  composes a plain headline and folds the full question. Mitigation: capture both,
  and record the wording difference in `comparison.md` if it stands.
- The drawing's frame 1 source record holds only old-format entries, so a capture
  of it will not match the drawing on those lines and will look like a defect.
  Mitigation: capture the DungeonExplorer record once to show old entries reading
  as they always did, and compare a fresh project's History against the drawing.
- Dropping `historyOpen` from the layout service leaves a stored key unread. It is
  inert, and removing it is not worth a migration. Mitigation: note it in the
  design only.
- The Room publish row loses the file-name display. The link opens the same file,
  and the parity list calls the file-name row folded. Mitigation: keep the file
  name in the control's title attribute so it is still reachable on hover.

## Migration Plan

The three record changes are additive optional fields. A record and a run summary
written earlier load with the fields absent, and the surfaces fall back to the
text and ids they already show. Nothing is written back. Rollback is removing the
new UI and ignoring the new fields, which leaves stored records readable in both
directions.

The verification work is a capture pass, not a migration:

1. Add previews that render the real History view, the real Room activity and side
   panel, and the real attempt-history rows, each from fixture data taken from a
   real record.
2. Start the preview harness and the styleguide, screenshot each frame of the
   drawing and each preview at a 1600 viewport for a 1440 panel, and read them
   side by side with every fold open.
3. Run a fresh Architect project so History holds entries written by the new code,
   then capture that record through the real page component.

## Open Questions

None. The two choices that could have changed the specs (entries written earlier,
and where History opens from) are settled, and the Evidence focus is a design
fallback rather than a spec change.
