# Matching the drawing

The approved drawing is `apps/styleguide/public/prototypes/agent-workspace-ux-audit/2-act-on-it.html`,
with the two answered questions in `2a-open-questions.html`. Every frame of both was
captured at 1440 and put beside the built surface, taken from each plugin's own preview
harness at the same width.

## How the captures were taken

- Orchestrator: `pnpm --filter @sero-ai/plugin-orchestrator preview`, previews
  `workflow-page` and `room-hold` added for this change. The harness wraps each preview
  in `@container/panel` (`ui/__preview__/main.tsx`) and injects the host stylesheet as a
  raw string, so container queries and the design tokens both read as they do in the app.
- Architect: `pnpm --filter @sero-ai/plugin-architect preview`, state `models`, with
  `?runtime=off` for the second table the drawing shows.
- The Workflow page was captured a second time from real records: three Workflows from a
  local workspace (a plain plan, a plan that loops back, a plan with branches and steps
  that run together), rendered through the real `ShellTopBar` and `WorkflowPage`. That
  harness read a private workspace, so it was not committed.

## What differed, and what was done

| Frame | Difference | Outcome |
| --- | --- | --- |
| 4, Workflow | State line stopped after the step count; the drawing adds when it last ran and how many runs | Fixed. `LoopStateLine` takes `runCount` and appends both. |
| 4, Workflow | `Objective:` where the drawing has `Objective ·` | Fixed. |
| 3, Room | Header pill read `Paused`; the drawing reads `Paused · waiting for you` | Fixed. `RoomTopBar` takes `waitingForYou`, which `RoomDetail` sets from a question, never from a limit or a user pause. |
| 3, Room | The hold was a full-bleed strip; the drawing is a bordered card inset from the edge | Fixed. |
| 3, Room | The card printed the stop's explanatory note under the runtime's detail; the drawing has one sentence | Fixed. The note now shows only when nobody asked, where it is the only explanation. |
| 5, Models | The unreadable-global cell was two lines and had no glyph | Fixed. One line with the last-known glyph, worded as the drawing words it. |
| 5, Models | The OWNER row named the pin with the Architect off; the drawing reads `Last known` | Fixed. With the runtime off the page does not claim the rule that produced the reading still holds. The Source column still names it. |
| 4, Workflow | Steps were full-width cards with a type badge and the model on the card; the drawing has a compact card with the Result under the title and everything else behind the chevron | Fixed. `StepCard` draws the drawing's card; the chevron opens the labelled facts; Tune opens Model, Agent and Tools. |
| 4, Workflow | Branches, steps that run together and loop-backs were drawn differently in Map and Details | Fixed. `planStages()` classifies each dependency level once; both views use it. Groups are a dashed box, the rail marker is the group's icon, and the loop-back bracket has its hooks. |
| 4, Workflow | Controls under the title, a status badge beside it, and a "Plan" fold around the plan | Fixed. One top row with the back link, the title and every control; the plan is not folded. |
| 4, Workflow | The folds at the foot had a triangle and no count | Fixed. The drawing's fold: a rule above, the title, the count on the right. |

## Departures, and why

- **The hold card's headline names who stopped, not what they asked.** The drawing reads
  "Morgan and Riley cannot merge the repaired files". Only the members wrote that, in four
  long messages, and nothing in the record summarises them. Writing that sentence needs a
  model call, and hand-parsing agent text into a summary is exactly what this repository
  does not do. The card says who stopped, prints the runtime's own detail sentence, and
  folds both members' words under it.
- **Relative times use the app's own format.** The drawing reads "9 days ago"; the built
  line reads "9d ago", which is what `formatRelative` produces everywhere else in the app.
  One line in a different format would be the inconsistency, not the fix.
- **The Effective column names the model only.** The drawing sets `deepseek-flash · low`.
  In review the thinking level was taken out of the column, and out of the OWNER row: the
  thinking picker beside it already says it.
- **Every picker is the styled Select.** The drawing's pickers are native `<select>`s. In
  review every native select in the repository was replaced, here and in the Orchestrator
  Tune panel, the admin agent editor, the git pull request pane and the local model editor.
- **The meters in the Room header stay as meters.** The drawing writes them as text. They
  are not in the parity list and the change did not touch them.
- **The step card shows no model and no execution target.** In review both were taken off
  the card and out of the opened panel. Tune still shows and sets the model and the agent.
- **Spend reads the figure the limit counts.** The drawing's example reads $3.13; the same
  record reads $3.77 built, because the limit also counts planning and reflection. The
  Decision asks for one figure everywhere, the one the limit enforces.
- **The paused state line does not say why the last pass chose nothing.** The drawing's
  "the last pass selected no issue" is not in the record. Writing it needs a model call.
- **A complete Workflow has no state line.** The drawing shows `Complete · 3 of 3 steps
  finished · 4d ago · 2 runs`. In review it read as repetition: every step card says Done and
  the Attempt history fold counts the runs. Any other state still shows the line, because it
  is the only place on the page that says what the Workflow is doing.
- **Reflect all is gone from the Workflows tab.** Each Workflow has its own Reflect. The
  batch action is still there for agents, as `reflect_workspace`.
- **The completion card shows only for an ending that is not complete.** The prompt shows
  only when there is no objective, the Suggestions section shows only while one waits, and
  the Result no longer counts attempts. Each repeated a fact the page already states.
- **Refine plan shows on a paused Workflow, and the Library badge on a linked one.** The
  drawing's frames have neither case.

## Parity, screen by screen

**Screen 3, the Room on hold.** Back to Rooms, Timeline and Watch are on the header. Message
the team, Resume and Stop the Room are in the card, and the header offers none of the three
while the card is shown (`room-hold-card.test.tsx`). Read it is gone, and the card shows what
it opened. The member rows, Open in Agent Board and the Brief drawer are unchanged in
`RoomRoster` and `RoomDetail`.

**Screen 4, the Workflow.** Run again is still the only primary control, with Delete moved
into More actions (`loop-controls-delete.test.tsx`). Library, Reflect and Skill are unchanged
in `LoopDetail`, moved to the top row. The values that open something on the settings line
(Results to, Starts, Context) have a dotted underline and a pointer. Context and Delivery open from their values on the settings line; their
actions are the same two the buttons ran. Map, Details and Steps per row are untouched. The
steps-at-a-time limit is off the display and still applies in `runtime/limits.ts`. Tune still
opens Model, Agent and Tools, now with the styled Select. Retry step is unchanged on a recoverable step. Attempt history
and the reflection section are unchanged.

**Screen 5, project models.** Back to project, the model and thinking pickers, Use global on
each tier and the revision number are all unchanged. The workspace path in the project header
opens the folder, through the host's `shell.showItemInFolder`.

**Outside the drawing.** The workspace tree's attention icon opens the Architect project
page when the attention comes from a project. An icon raised by a Workflow or a Room opens
nothing, as before. The saving rules are in one disclosure.
"The Architect runtime is not running" is now also the words on each tier it affects.
