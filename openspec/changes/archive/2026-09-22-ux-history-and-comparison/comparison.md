# History and comparison — capture record

The captures are the check for this change. Every frame of
`4-history-and-comparison.html` and every new preview was captured at a 1600
viewport for a 1440 panel, with the folds open on both sides, and read side by
side. This file records what they found and what was fixed.

## Captured and read

| Capture | Result |
| --- | --- |
| Drawing frame 1 (History as its own view) | read |
| Drawing frame 2 (a Room's activity and side panel) | read |
| Drawing frame 3 (a Workflow's runs and what reflection learned) | read |
| Drawing Decisions | read |
| Preview `?state=history` (folded and notes open) | read |
| Preview `?preview=room-activity` | read |
| Preview `?preview=attempt-history` | read |

Nothing was skipped. The captures live in the working directory used for the
comparison and are not committed.

## Defects the captures found and fixed

1. **The History preview could not open its notes.** The fold state comes from
   the host layout service, which the preview harness does not have, so the
   note control did nothing. The harness now keeps the opened notes in local
   state, and the capture shows the folded note opening under its entry.
2. **The attempt-history preview showed the runs in the wrong order.** The
   component expects the run index oldest-first and reverses it; the fixture was
   written newest-first, so `Run 1` sat above `Run 2`. The fixture is now
   oldest-first and the capture matches the drawing's `Run 2` above `Run 1`.

Neither was a product defect. Both were faults in what the capture rendered,
which is exactly what this pass is for.

## Departures the change states

1. **Entries written earlier keep their ids.** The `DungeonExplorer` record's 31
   entries were written before a subject existed. They read with the cause they
   were written with — including `milestone m3 dispatched as workflow
   loop_200ac871-0683-4209-818e-14a95318d3ae` and `decision dec_p5pq0ezs
   answered: retry` — and no link is invented for any of them. Nothing is
   dropped: the view states `31 changes` and `Show 17 earlier` opens the rest.
   Unwinding the ids inside those sentences would be string matching, which this
   change removes elsewhere.
2. **A block entry shows `Blocked` as a status and the reason without its
   prefix.** A block cause is written as `blocked: <reason>`. The view separates
   the literal word into the drawing's status column, so `blocked: The Workflow
   stopped. No cause was recorded.` reads as `Blocked · The Workflow stopped.
   No cause was recorded.` This is a rendering difference, not a change to what
   the entry holds.
3. **A block entry carries no link.** The drawing's block rows link to their
   Workflow. The approved writer table does not give the block writers a subject,
   so a block entry has no Workflow to link to and shows its dot and reason
   alone. The reason text still names the work.
4. **A published artifact stays a promoted card.** The drawing draws the publish
   row as a plain feed row with a right-aligned `Open`. The approved task keeps
   the promoted card, so the card's title is the event's summary and its `Open`
   control opens the file; the file name stays reachable on the control's title
   attribute.

## Wording difference in a raised question's headline

The drawing's frame 1 shows `Architect asked how to get past the broken capture
step`, a hand-shortened question. The build composes the plain headline
`Architect asked a question` and folds the complete question under the entry.
The drawing's wording is not reproducible from the record without taking the
question apart, so the plain headline stands and the full question is one click
away.

## What was not captured end to end

A fresh Architect project was not run through the desktop app in this
environment. Instead the "new code" entries were produced by the real writers
(`createOwnerActions` dispatch, decide and milestone-add) and read through the
real `HistoryView` in `ui/__tests__/history-record.test.tsx`: every entry the
new code wrote names its subject and no entry it wrote prints a raw id. The
preview `?state=history` captures the same shapes with the drawing's values.

## Parity walk

Every control each frame names is still reachable.

**Frame 1 — all kept · 1 moved · 1 added**

- Older directives, the directive box and Send: still on the project page. The
  `SideColumn` keeps the older-directives disclosure; the composer is unchanged.
- Back to projects, Open session, Project controls (⋯), Choose execution
  location: unchanged in the top bar.
- History: moved from the right rail to its own view at
  `projects/<id>/history`, opened from the project controls menu. The view's
  `Back to project` control returns to the page.
- Links from an entry to what it names: added. An accepted milestone opens its
  evidence on the project page; a dispatched milestone opens its Workflow or
  Room.

**Frame 2 — all kept · 1 folded**

- Highlights, All, Decisions, Messages and Work, each with its count: kept.
- Brief, Work, Claims, Artifacts and Changes: kept. An empty tab shows `0` and
  stays usable.
- The artifact file-name row: folded into the publish row's `Open` control. The
  file name is still reachable on the control's title attribute.
- Back to Rooms, Result, Timeline, Watch, ⋯ with Delete Room, the team column,
  Open in Agent Board: unchanged in the Room header and team rail.

**Frame 3 — all kept**

- Attempt history, with every run and its time, tokens and cost, five runs a
  page: kept. The page size and the amount columns are unchanged.
- What reflection has learned, Reflect, Reflect all, and the suggestions with
  Approve and Reject: kept. The fold gained a count and a day per lesson.
- The trigger and delivery badges on a run: kept.
