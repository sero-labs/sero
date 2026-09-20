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
- **The Effective column keeps its two-line shape.** The drawing sets `deepseek-flash · low`
  on one line; the built table keeps the model above a small thinking level, which is the
  column's existing style and is not in the screen's parity list.
- **The meters in the Room header stay as meters.** The drawing writes them as text. They
  are not in the parity list and the change did not touch them.
- **The execution target moved rather than disappeared.** The drawing's step header has no
  type badge and the parity list does not mention it. It is now a `Runs as` mark inside the
  step's opened panel, so nothing became unreachable.

## Parity, screen by screen

**Screen 3, the Room on hold.** Back to Rooms, Timeline and Watch are on the header. Message
the team, Resume and Stop the Room are in the card, and the header offers none of the three
while the card is shown (`room-hold-card.test.tsx`). Read it is gone, and the card shows what
it opened. The member rows, Open in Agent Board and the Brief drawer are unchanged in
`RoomRoster` and `RoomDetail`.

**Screen 4, the Workflow.** Run again is still the only primary control, with Delete moved
into More actions (`loop-controls-delete.test.tsx`). Library, Reflect and Skill are unchanged
in `LoopDetail`. Context and Delivery open from their values on the settings line; their
actions are the same two the buttons ran. Map, Details and Steps per row are untouched. The
steps-at-a-time limit is off the display and still applies in `runtime/limits.ts`. Tune still
opens Model, Agent and Tools. Retry step is unchanged on a recoverable step. Attempt history
and the reflection section are unchanged.

**Screen 5, project models.** Back to project, the model and thinking pickers, Use global on
each tier and the revision number are all unchanged. The saving rules are in one disclosure.
"The Architect runtime is not running" is now also the words on each tier it affects.
