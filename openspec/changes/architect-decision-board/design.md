# Design

## Context

See proposal.md for the motivation. The visual spec is the prototype `apps/styleguide/public/prototypes/architect-one-screen.html` at its four moments (`?moment=start|ask|working|done`).

The record already holds almost everything the board shows:

- `overview.outcome|objective|result|acknowledgement`: the Architect's short sentences.
- `working.assumptions`: choices the Architect made without asking.
- `decisions[]`: questions, and the user's answers.
- `agreement` and `budget`: the start cap and spend.
- `milestones[]` with `status`, `verification` and `evidence` (checks and captured pictures).
- `projectActivity()` in `shared/activity.ts`: the derived state.
- The owner live snapshot (`text`, `tool`, `request`) and the feedback rows for Room and Workflow members.

## Goals / Non-Goals

**Goals:**

- One pure function decides which tiles exist and which one is large, so the rule is tested without rendering.
- Reuse every existing action. The board adds no new way to change a project.

**Non-Goals:**

- No new owner tool and no record field. "Architect decided" reads `working.assumptions`.
- No streaming picture of the automation browser. Proof pictures are the ones evidence already captured.
- No redesign of Plan, Research, Evidence, History or the inspector.

## Decisions

**A board view-model in `shared/board.ts`.** `boardOf(record, context)` returns `{ hero, main, plan, made }`. `main` is a tagged union: `ask | live | stopped | result | idle`. The order is fixed: an open decision or approval first, then a stop that needs the user, then running work, then a delivered result, then idle. `plan` and `made` are null when empty. Components only draw what it returns. Alternative considered: decide in each component, as today. That is what spread the state over `StateLine`, `NeedsYou` and `ProjectPage` and made the page hard to reason about.

**The hero sentence comes from saved text, newest first.** The newest of `overview.result`, `overview.acknowledgement` and `overview.objective` by its `at` time, else `overview.outcome`, else the user's idea. Live text is not used here: it belongs to the Live tile and changes every second.

**The state line is one of four words.** It maps from `projectActivity().state` and drops the "Architect idle" suffix. Working is used only when `projectActivity` says working, which already requires an observed report.

**Stopped is a main tile, not a fifth layout.** The cap field, Retry step, Resume, Open Room and Review access controls that `ProjectPage` puts in the header today move into this tile unchanged. The prototype has no stopped moment, so the tile reuses the Needs you tile's shape: a heading that states the stop, the saved reason, and the existing control.

**Live reuses the existing watch hooks.** The owner row uses `useOwnerLive`; Room members and Workflow steps use the feedback rows as `WorkLive` does now. One agent draws as the prototype shows. Several agents draw as a short list of rows in the same tile, each with its name, action and timer, and the arriving text of the one the user selects. Alternative considered: keep the eye toggle. Rejected: the user asked for live work to be obvious.

**Actions are said in plain words.** A small table maps a tool name to a phrase: `read` to "Reading", `edit`/`write` to "Editing", `bash` to "Running a command", `automation_browser` to "Using the browser", `codemode` to "Running a script". The tool's own summary is shown under it in small text. An unknown tool shows its name. This is a fixed label table, not interpretation of model output.

**The last few actions are kept by the runtime.** The owner live notice gains `recent`: up to three finished tool calls of the current turn, each a tool name and summary. It is built where the notice is built, from the same tool-end events, and cleared with the turn. Alternative considered: remember them in the React hook. Rejected: the list would be empty every time the page opens.

**Decisions made is derived.** Rows, newest first: answered decisions (the chosen option's label, by the user), `working.assumptions` (by the Architect), then the start cap (by the user). Change on any row puts a short prefilled sentence in the message box and focuses it. It sends nothing itself.

**Glass surfaces.** The page root takes the `.glass` scope and `glass-canvas`, and tiles use `glass-tile` from `@sero-ai/ui/styles/glass-board.css`. New rules are prefixed `bd-` in a new `ui/board.css`, because `styles.css` is already large.

**The Work view keeps three tabs.** Live is removed from `WORK_TABS`. A stored `live` tab opens `plan`.

## Risks / Trade-offs

- [The header controls move, and a recovery control is lost in the move] -> the existing ProjectPage tests for cap, retry, resume and Open Room are kept and pointed at the board.
- [A project with no `overview` or `working` (charter flow) shows a thin board] -> the view-model falls back to the idea, `stateLine` and milestones, and the charter-flow notice stays.
- [The existing spec forbade live output on the overview] -> the requirement is modified here on the user's instruction.
