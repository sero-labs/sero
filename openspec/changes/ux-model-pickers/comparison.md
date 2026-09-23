# Matching the drawing

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/8-model-pickers.html`.
Its two frames, its "Controls on this screen today" lists and its Decisions are
binding.

**Status: drawing captured and read; build not captured yet.** Both frames of the
drawing were rendered and read as images at planning time (see the method below
and "What the drawing shows"). The built surfaces do not exist yet. Task 4.2
captures both sides after the build and task 4.3 fills in the "Differences the
captures showed" section. Until then this file records what the drawing shows
from real images, so it is not later checked against memory.

## How the captures are taken

- Start the drawing page with `pnpm styleguide`, then open
  `http://localhost:5176/prototypes/agent-workspace-ux-audit/8-model-pickers.html`.
- Screenshot each frame's `.app` element from `section.state .app`, and the whole
  page with `fullPage: true`, at a viewport wider than the panel (1440 used here).
  Open every `<details>` disclosure first.
- Use the repository's own Playwright, not the Homebrew CLI:
  `node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs`.
- Built surfaces: `pnpm --filter @sero-ai/plugin-orchestrator preview` for the
  step (the Tune panel open on a real `StepCard`), and
  `pnpm --filter @sero-ai/plugin-architect preview` with `?state=models` for the
  tier table.
- Every fold, chevron and Tune panel is opened on both sides before comparing.
  Each surface is read as an image. A byte size proves nothing.

## What the drawing shows

Frame 1 - a step's model, Orchestrator, `Composable title search`:

- One row of three inline, externally labelled fields: `Model`, `Agent`
  (`implementer`), `Tools` (`Default`).
- The `Model` field is a wide combobox, about ten times the width a single model
  name needs, with `sonnet` typed and its list open.
- The list holds only the four matching Sonnet rows; the tier entries are
  filtered out because they do not match the query. Each row names the model and
  its provider (`Anthropic`, right-aligned and muted). The chosen row carries a
  check mark.
- The `Agent` and `Tools` fields are compact chevron fields.

Frame 2 - Project models, Architect, `FroggerNeon`:

- A table: `TIER`, `PROJECT SELECTION`, `EFFECTIVE`, `SOURCE`, and a trailing
  action column.
- Each tier's `PROJECT SELECTION` cell is the model field followed by a compact
  thinking field (`low ▾`, `high ▾`, `medium ▾`) on the same line.
- The model field names the model on the left and the provider on the right,
  inside the field, before the chevron (`DeepSeek V4.1 Flash` ... `DeepSeek`).
  No provider logo and no group heading appear; the provider is text on the row.
- The open list shows one row per model, name left and provider right, with a
  check mark on the chosen row.
- `EFFECTIVE` reads `<model> · <thinking>`; `SOURCE` reads `project`; the trailing
  column holds one `Use global` button per row.
- The header keeps `revision 5` and the `Back to project` control is in the
  parity list.

Both frames confirm the parity lists: frame 1 folds "the tier select and the
Specific model picker, into one field" and keeps Auto, the tiers, every model,
clearing a pin, Agent and Tools; frame 2 keeps model and thinking for LOW, MED
and HIGH, `Use global`, `Back to project` and the revision number.

## Differences the captures showed

To be filled by task 4.3, one row per difference, each naming the frame, what the
capture showed, and what was done. The drawing side above is the reference.

## Departures taken knowingly

- **The shared picker's other consumers are not captured.** The drawing names
  Admin, onboarding and Design Library as changing with the shared picker, but
  they have no preview harness and no frame. They are covered by the shared
  component's tests and appear here as uncaptured.
- **The list is flat, with no provider logos or headings.** The drawing shows
  text only. This drops the grouped list and the provider logo the current picker
  draws.
- **The Project models first choice keeps the shipped label rule.** The open list
  labels the inherited choice `Global` when the global cannot be read and
  `Not selected` otherwise, as the view does today. The drawing names it `Global`
  in the closed-field data. The issue allows this ("Global (or Not selected)"),
  and the user kept the split. The difference will show when the list is opened
  for a tier whose global can be read.
- **The owner row's Effective cell is unchanged.** Frame 2 draws no owner row, so
  the change to `<model id> · <thinking level>` applies to the LOW, MED and HIGH
  rows only. The owner row keeps the model string it shows today.
- **The read-only model displays are not pickers and are unchanged.** The Room
  member facts, the Room's allowed-models chips, `ModelChoices.tsx` and the
  inspector keep their format; only the three model-choice sites move to the
  shared picker.
