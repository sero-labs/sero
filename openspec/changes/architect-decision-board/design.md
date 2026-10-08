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

- No new owner tool. "Architect decided" reads `working.assumptions`.
- No streaming view of the browser. Live shows the last screenshot the Architect took, refreshed when its action changes.
- No redesign of Plan, Research, Evidence, History or the inspector.

## Decisions

**A board view-model in `ui/lib/board.ts`.** It sits beside `view-model.ts`, whose `needsYouItems` and `evidenceLines` it reuses. `boardOf(record, activity, { live, action })` returns the sentence, the state line, the progress, the list of large tiles, the plan steps and the decisions made. The large tiles stack in a fixed order: a question, a stop, live work. A result shows only when none of those do. A question and live work can both be present, because a decision parks only the steps that depend on it. An idle project has no large tile: the top tile already says nothing is running. Empty steps and decisions give no tile. Components only draw what it returns. Alternative considered: decide in each component, as today. That is what spread the state over `StateLine`, `NeedsYou` and `ProjectPage` and made the page hard to reason about.

**The hero sentence comes from saved text, newest first.** The newest of `overview.result`, `overview.acknowledgement` and `overview.objective` by its `at` time, else `overview.outcome`, else the user's idea. Live text is not used here: it belongs to the Live tile and changes every second.

**The state line reuses `projectActivity`.** Working and Waiting for you are fixed words. A stop reads Stopped, because its tile states the cause. Every other state shows the existing headline and owner line (Paused by you, Delivered, Last known), without the "Architect idle" suffix. Working is used only when this session observes work.

**Stopped is a main tile, not a fifth layout.** The cap field, Retry step, Resume, Open Room and Review access controls that `ProjectPage` puts in the header today move into this tile unchanged. The prototype has no stopped moment, so the tile reuses the Needs you tile's shape: a heading that states the stop, the saved reason, and the existing control.

**Live reuses the existing watch hooks.** The owner row uses `useOwnerLive`; Room members and Workflow steps use the feedback rows as `WorkLive` does now. One agent draws as the prototype shows. Several agents draw as a short list of rows in the same tile, each with its name, action and timer, and the arriving text of the one the user selects. Alternative considered: keep the eye toggle. Rejected: the user asked for live work to be obvious.

**Actions are said in plain words.** A small table maps a tool name to a phrase: `read` to "Reading", `edit`/`write` to "Editing", `bash` to "Running a command", `automation_browser` to "Using the browser", `codemode` to "Running a script". The tool's own summary is shown under it in small text. An unknown tool shows its name. This is a fixed label table, not interpretation of model output.

**The last few actions are kept by the plugin runtime.** The owner live notice gains `recent`: up to three finished tool calls of the current turn. `work-watch.ts` derives it from changes of the snapshot's tool, in the session subscription, so the host and `@sero-ai/common` do not change. It exists only while a view holds the watch lease, so a board opened in the middle of a turn starts the list from that moment. Alternative considered: add it to the host snapshot. Rejected for now: it is a host and published-package change for a three-line list.

**Decisions made is derived.** Rows, newest first: answered decisions (the chosen option's label, by the user), `working.assumptions` (by the Architect), then the start cap (by the user). An assumption becomes `{ text, why? }` so the row can show its reason. The `working` action accepts both forms, and a saved plain string reads as an assumption with no reason. Change on any row puts a short prefilled sentence in the message box and focuses it. It sends nothing itself.

**Glass surfaces.** New rules are prefixed `bd-` in a new `ui/board.css`. Tiles read the `--glass-*` tokens from `@sero-ai/ui`, with the dark values as fallbacks, so the board matches the Dashboard in both themes.

**The Work view keeps three tabs.** Live is removed from `WORK_TABS`. A stored `live` tab opens `plan`.

**Pictures come through one runtime request.** `picture` on the projects tool reads a PNG and returns it as a data URL. With a step id it reads that step's saved capture, and only inside the project's evidence folder. With no step it reads `.sero/tmp/automation-browser-shot.png`, where the browser tool saves a screenshot in a host workspace. The view passes the time of the picture it holds, so the same bytes are not sent twice. Live shows the browser screenshot only when it was saved during the current turn. Alternative considered: a file URL the view loads itself. Rejected: the request keeps the two readable paths in one checked place.

## Risks / Trade-offs

- [The header controls move, and a recovery control is lost in the move] -> the existing ProjectPage tests for cap, retry, resume and Open Room are kept and pointed at the board.
- [A project with no `overview` or `working` (charter flow) shows a thin board] -> the view-model falls back to the idea, `stateLine` and milestones, and the charter-flow notice stays.
- [The existing spec forbade live output on the overview] -> the requirement is replaced here on the user's instruction. The live text is the bounded end of the current turn, not a transcript.
- [One press answers a question, with no second step] -> the choices state their consequence on the button, and an answer can be reopened from Decisions made.
