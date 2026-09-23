# Matching the drawing

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/8-model-pickers.html`.
Its two frames, its "Controls on this screen today" lists and its Decisions are
binding.

**Status: both sides captured and read.** The drawing's two frames and both
built surfaces were rendered, screenshot, and read as images. The differences
below are what the images showed, not what anyone remembered.

## How the captures are taken

- Drawing: `pnpm styleguide`, then
  `http://localhost:5176/prototypes/agent-workspace-ux-audit/8-model-pickers.html`.
  Screenshot each frame's `.app` element from `section.state .app` and the whole
  page with `fullPage: true`, at 1440 width, with every `<details>` opened.
- Built step: `pnpm --filter @sero-ai/plugin-orchestrator preview`, then
  `ui/__preview__/index.html?preview=step-model`. Tune opens on load; the field's
  chevron is clicked and `sonnet` typed. Screenshot the viewport at 1600x900.
- Built tier table: `pnpm --filter @sero-ai/plugin-architect preview`, then
  `ui/__preview__/index.html?state=models&width=1240`. The MED field's chevron is
  clicked and `flash` typed. Screenshot the viewport at 1600x1000.
- The drawing page renders at a 16px root; the app renders at 13px. A width the
  drawing draws as 320px is a 20rem (`w-80`) token, which measures 260px in the
  app. Compare widths by token, not by pixel.
- Both built captures add the `dark` class to `document.documentElement` first.
  The harness toggles the theme on an inner div, and a popup portals into a
  sibling container, so without this the popup renders light on a dark card.
- Every surface is read as an image. A byte size proves nothing. The
  repository's own Playwright is used, not the Homebrew CLI:
  `node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs`.

## The model-picker inventory

Every site in the two plugins that chooses a model, and what it uses:

- `plugins/sero-orchestrator-plugin/ui/components/StepModelControl.tsx` -
  `AvailableModelPicker`, tiers first.
- `plugins/sero-architect-plugin/ui/components/ModelSettings.tsx` -
  `AvailableModelPicker` per tier, the inherited choice first.
- `plugins/sero-architect-plugin/ui/components/IntakeModelOverrides.tsx` -
  `AvailableModelPicker` per tier, `Global selection` first.

No native `<select>` and no styled `Select` chooses a model in either plugin. The
remaining `Select` in `ModelSettings.tsx` and `IntakeModelOverrides.tsx` is the
thinking picker, which the drawing keeps beside the model field. Read-only model
displays are not pickers and are unchanged: the Room member facts, the Room's
allowed-models chips, `ModelChoices.tsx` and the inspector.

## What the drawing shows

Frame 1 - a step's model, Orchestrator:

- One row of three inline, externally labelled fields: `Model`, `Agent`
  (`implementer`), `Tools` (`Default`).
- The `Model` field is a combobox 20rem wide (`w-80`; 320px at the drawing page's
  16px root) with `sonnet` typed and its list open. The tier entries are filtered
  out because they do not match the query. Each row names the model and its
  provider (`Anthropic`, right-aligned and muted). The closed field carries no
  clear control.

Frame 2 - Project models, Architect:

- A table: `TIER`, `PROJECT SELECTION`, `EFFECTIVE`, `SOURCE`, and a trailing
  `Use global` column. The model field names the model on the left and the
  provider on the right, inside the field, before the chevron. The thinking field
  is compact and sits on the same line. `EFFECTIVE` reads `<model id> · <thinking>`.
- No provider logo and no group heading; the provider is text on the row.

## Differences the captures showed

- **Frame 1: the built Model field first stretched the whole row.** The first
  capture used `flex-1`, so the field filled the card (748px) and pushed `Agent`
  and `Tools` to the far right; the drawing draws a 20rem field with the other
  two controls just after it. Fixed: `StepModelControl` uses `w-80`, matching the
  drawing's token (320px at its 16px root, 260px at the app's 13px root). The two
  tier fields use `w-80` too, in place of `min-w-0 flex-1`.
- **Frame 1: the step field showed a clear `X` beside a tier.** The drawing shows
  none, because a tier is not a pinned model. Fixed: `StepModelControl` passes
  `allowClear` only when the step's model is a pinned model (`isModelTier` is
  false). The tier tables already passed no `allowClear`.
- **Frame 1: the built list held three Sonnet rows against the drawing's four.**
  That is the preview fixture's catalogue, not the control: the drawing used a
  saved profile with four Sonnet models. The field, the rows, the filter and the
  provider label all match.
- **Frame 1: the built card also shows a Result row.** The drawing's frame is a
  simplified step (title, state, Tune row). The real card shows the Result row
  from an earlier change. The model field itself matches the frame.
- **Frame 2: `EFFECTIVE` now reads `v4.1-flash · low`, `v4.1-flash · high` and
  `gpt-5.6-sol · medium`.** The drawing's format. The shipped page had read the
  provider-qualified reference with no thinking level.
- **Frame 2: the open list shows one DeepSeek row with a check mark and its
  provider right-aligned.** Matches the drawing.
- **Harness: the Orchestrator popup lost every plugin style.** The plugin
  preview page did not wrap its surface in `PluginStyleScope`, so the combobox
  popup portaled to `document.body`, outside the plugin's `@scope`. Fixed in
  `ui/__preview__/main.tsx`, matching the Architect harness. A harness fix, not a
  product change.

## Departures taken knowingly

- **The Project models first choice keeps the shipped label rule.** The open list
  labels the inherited choice `Global` when the global cannot be read and
  `Not selected` otherwise, as the view does today. The drawing names it `Global`.
  The issue allows this ("Global (or Not selected)"), and the user kept the split.
- **The owner row's Effective cell is unchanged.** Frame 2 draws no owner row, so
  the change to `<model id> · <thinking level>` applies to the LOW, MED and HIGH
  rows only. The owner row keeps the model string it shows today.
- **The list is flat, with no provider logos or headings.** The drawing shows text
  only. This drops the grouped list and the provider logo the picker drew before.
- **The shared picker's other consumers are not captured.** The drawing names
  Admin, onboarding and Design Library as changing with the shared picker, but
  they have no preview harness and no frame. They are covered by the shared
  component's tests.
- **The New project Model overrides are not captured.** They use the same field
  as Project models and are covered by a unit test, but no harness state opens the
  folded section with a catalogue, so no image was taken.

## Frames never compared

- The drawing page's other documents (`proposals.html`, `evidence.html`,
  `flows.html`) are not this change.
- The Admin, onboarding and Design Library surfaces, and the folded New project
  Model overrides, were not put beside an image. They are named as uncaptured
  above.
