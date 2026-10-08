# Proposal

## Why

The Architect project page does not say what is happening. It is one small card over an empty screen, the live work sits behind "Watch work" as a line of raw model text, and the plan, checks and decisions are spread over four tabs. A user cannot tell at a glance whether work runs, has stopped or needs them, and never sees the choices the Architect made for them.

## What Changes

- The project page becomes one board, drawn in the approved prototype `apps/styleguide/public/prototypes/architect-one-screen.html`. The prototype is the visual spec.
- The top tile always carries the Architect's own latest sentence, one state line (Working, Waiting for you, Stopped, Finished) and two small meters for progress and spend.
- One large tile shows the single thing that matters now: the open question, the live work, the stop and its fix, or the result.
- Live work is on the board while work runs: what is being done in plain words, a timer, the arriving text, and the last few actions. **BREAKING** for the spec: the overview no longer hides live output behind Watch work.
- Decisions made is a tile: the user's answers and limits, and the assumptions the Architect recorded, each marked with who decided. Change puts the decision into the message box.
- Plan is a side tile with one row per step. A checked step carries its proof picture and a link to its checks.
- A tile exists only when it has content. No placeholder tiles.
- The Work view loses its Live tab. Plan, Research and Evidence stay as detail views reached from the board.
- The board uses the glass dashboard surfaces from `@sero-ai/ui`, so it matches the Sero Dashboard.

Out of scope: the projects list, intake, History, the inspector, model settings, and a continuously updating picture of the Architect's browser.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `architect-ui`: the four-part project page and the separate Watch work view are removed. The board, live work on the board and decisions made are added.

## Impact

- `plugins/sero-architect-plugin/ui`: `ProjectPage.tsx`, `StateLine.tsx`, `NeedsYou.tsx`, `WorkLive.tsx`, `WorkPage.tsx`, `styles.css`, the preview fixtures, and new board components.
- `plugins/sero-architect-plugin/shared`: a pure view-model that turns a record and its feedback into the board's tiles.
- `plugins/sero-architect-plugin/runtime`: the owner live notice keeps the last few finished actions of the turn.
- No record shape change, no new owner tool, no published package change.
