# Matching the drawing

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/6-follow-the-thread.html`.
Its three frames, its Decisions and its "Controls on this screen today" lists are
binding.

**Status: not yet captured.** No frame of this change has been put beside the
drawing. Task 6.2 captures both sides and task 6.3 fills in the section below with
what each capture showed. Until then this file records only the departures already
decided, so they are not later mistaken for oversights.

## How the captures are taken

- Orchestrator: `pnpm --filter @sero-ai/plugin-orchestrator preview`, screenshot at
  a viewport wider than the panel so the panel's right edge is not clipped by the
  harness page's own padding.
- The drawing's own frames are screenshotted from `file://` and read beside the
  build, frame by frame.
- Every fold, chevron and Tune panel is opened on both sides before comparing.
- Each surface is read as an image. A byte size proves nothing.

## Differences the captures showed

To be filled by task 6.3, one row per difference, each naming the frame, what the
capture showed, and what was done.

## Departures taken knowingly

- **The Workflow settings row keeps `CONTEXT`.** Frame 1 draws seven values with no
  `CONTEXT`; this change adds `FROM` and keeps `CONTEXT`, so the row has eight. The
  frame's own parity list says "all kept · 1 added", and #538 recorded the same
  omission as a carried departure, so the omission is read as an oversight rather
  than a removal instruction. Nothing that is reachable today becomes unreachable.
- **The workspace suffix is shown on every Back and Forward label.** The drawing
  shows it in all three frames, but the issue says "when it differs". Frames 1 and
  2 return to the global Architect app, which names no workspace; under "when it
  differs" those frames would carry no suffix. An ordinary Back inside one
  workspace therefore also gains a suffix the drawing never shows.
- **The project name is a snapshot.** Renaming a project after it dispatched work
  leaves the old name on that work. The link uses the project id, so it still
  reaches the renamed project.
