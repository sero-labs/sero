# Comparison: the built surfaces and the drawing

Change: `ux-follow-the-thread`. Drawing:
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/6-follow-the-thread.html`.

## Capture method

The drawing frames were read from
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/6-follow-the-thread.html`
in a Chromium browser at a 1920x1400 viewport, wider than the 1440 panel. The
drawing is versioned in this repository, so its re-captures are not committed.

The built surfaces were served by
`pnpm --filter @sero-ai/plugin-orchestrator preview` at the same viewport, with
every `<details>` fold open:

- `.../ui/__preview__/index.html?preview=loop-ending` → `built-loop-ending.png`
- `.../ui/__preview__/index.html?preview=room-result` → `built-room-result.png`

Every captured image was read as an image before any difference below was
recorded.

## Frame-by-frame

### Frame 1 — a Workflow that Architect opened

| | Drawing | Built (`loop-ending`) |
|---|---|---|
| `FROM` | `DungeonExplorer` | `DungeonExplorer` |
| `RUNS IN` | Managed worktree | Managed worktree |
| `RESULTS TO` | Workspace files | Pull request (auto) |
| `STARTS` | Manually | Manually |
| `CONTEXT` | absent | `Default preset` |
| `SPEND` | $1.42 of $4.00 | $1.33 of $6.00 |
| `ATTEMPTS` | 50 | 50 |
| `TIME` | 30 min | 30 min |

The value this change adds (`FROM`, first on the line) matches the drawing.
`RESULTS TO`, `SPEND` and `ATTEMPTS` differ only because the preview fixture
holds different record data than the drawing's DungeonExplorer run. No
component difference was found. `CONTEXT` is a knowing departure (below).

### Frame 2 — a Room that Architect opened

The built Room header shows the state pill (`Completed`) with the project name
(`FroggerNeon`) beside it, and the name is a link. The drawing shows the same
header with `Complete` and `FroggerNeon ↗`. The live view in the drawing is the
Timeline; the preview shows the Result view. Both are the same `RoomTopBar`
component, so the header under test is compared directly.

### Frame 3 — switching workspace

The drawing shows a title-bar Back label of
`Back to Sero Orchestrator · FroggerNeon` after a switch to
`reading-tracker-resilience-01`, and a history line
`FroggerNeon · Rooms → FroggerNeon · Workflows → reading-tracker-resilience-01 · New Room`.

No static preview renders this move. It was not compared as an image. It is
covered by unit tests (`NavButtons.test.tsx`) and by
`apps/desktop/e2e/navigation.workflow.spec.ts`, which switches workspace in the
sidebar and asserts that one Back returns to the page left and that the Back
label names the workspace left.

## Departures taken knowingly

- **`CONTEXT` is kept.** The drawing's frame 1 drops `CONTEXT` and adds `FROM`,
  but its own parity list says "all kept · 1 added". The row therefore shows one
  more value than the drawing.
- **The workspace suffix is shown on every Back**, including an ordinary
  in-workspace Back that the drawing never shows. The rule is the workspace of
  the place being reached, or the active workspace when that place names none.
- **The project name is a snapshot.** It is the name the project had when the
  work was dispatched. A later rename can make the shown name stale. The link
  uses `projectId` and still reaches the project.

## Frames never compared

Frame 3 was not read against a built surface, because no component preview
renders the cross-workspace Back. The room-result preview shows the Result view,
not the drawing's Timeline view; only the shared header was compared for frame 2.
