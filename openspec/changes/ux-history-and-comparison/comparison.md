# Matching the drawing

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/4-history-and-comparison.html`.
Its three frames and its Decisions are binding.

This file is the audit record for the change. It is filled in during the capture
pass (tasks 6.1 to 6.6), the way `ux-read-the-outcome`'s did. The sections below
carry the departures known before the build starts, so they are not rediscovered
as defects later.

## How the captures are taken

- Orchestrator previews: `pnpm --filter @sero-ai/plugin-orchestrator preview`,
  panel width 1440, screenshotted at a 1600 viewport.
- Architect previews: `pnpm --filter @sero-ai/plugin-architect preview`.
- The drawing is screenshotted from `file://` at 1440.
- Every preview renders the real component. A preview that re-draws a surface
  proves nothing about it.
- Every fold, chevron and disclosure is opened in the drawing and in the build
  before a frame is compared.
- One frame at a time, drawing on the left and build on the right.

## Departures known before the build

### Entries written earlier keep their ids

The drawing's frame 1 source is the DungeonExplorer project, and every entry it
holds was written before this change. Those entries have no saved subject, so the
view prints their cause as written, which for several is
`milestone m2 dispatched as workflow loop_0bf73d9f-…`.

This is a stated departure, not a defect. Unwinding those ids would mean parsing
the Architect's own sentences, and the approved decision was to save the subject
on new entries rather than branch on old ones. The "no raw id" acceptance applies
to entries the new code writes. The capture in task 6.3 shows the old entries
reading as they did, with nothing dropped.

### A raised question's headline is composed, not shortened by hand

The drawing's headline for a raised question is a hand-shortened version of a
97-word question. The build composes a plain headline and folds the full question
under it. If the wording stands after the capture, it is recorded here rather than
chased.

## Defects already visible in the code

These do not need the capture to find, but they are the change's work all the same,
and each is checked again against the drawing in the capture.

- The shipped filter pills fill every option and tint the active one with the brand
  colour. The drawing outlines the inactive pills and fills only the active one
  with a raised background and white text.
- The shipped tabs are an equal-width grid at 11px with a 1px inset underline. The
  drawing sizes the tabs to their content, sets 12.5px text, and gives the active
  tab a 2px underline.
- Neither the filters nor the tabs carry a count today. The drawing puts a 10px
  muted mono count after each label.

The Workflow page's attempt history has the same kind of gap:

- The shipped run row prints `Run #2`, where the drawing prints `Run 2`.
- The shipped start is `formatTime`'s full locale stamp, where the drawing prints
  `10 Sep, 13:09`.
- The shipped row keeps a step-outcome count line and a separate step-id line. The
  drawing has one line of step titles, and the chip carries the ending. The counts
  are dropped, not moved.
- The `blocked` chip is amber. The stop chip is red, as the drawing has it and as
  the decision approves for this case: a stopped run is a fault, not an ask.
- The "What reflection has learned" fold carries no count and no lesson dates,
  where the drawing shows both.

The drawing gives a count to the Work, Claims and Artifacts tabs and to none of the
filters' counterpart tabs, Brief and Changes. The build matches the drawing. A
Changes count, if it is wanted later, is a new decision rather than a defect
against this drawing.

## Defects the captures found, and what was done

Filled in by task 6.5.

| Frame | What the capture showed | Outcome |
| --- | --- | --- |
| | | |

## Differences that remain

Filled in by task 6.5.

## Departures taken knowingly

Filled in by task 6.5. Carries the two above unless the capture changes them.

## Footer: what is captured, and what was checked by eye

Filled in by task 6.2. Names each frame that was captured and read beside the
drawing, and says plainly which frames were not compared.
