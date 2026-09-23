## Why

Model selection is inconsistent and slow to use. A Workflow step hides every
model behind a second picker, Architect's tier tables and the New project
overrides use native selects that show one long unfiltered list, and the shared
`AvailableModelPicker` groups by provider but cannot be typed into as a
combobox. The approved drawing
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/8-model-pickers.html`
makes one type-to-filter combobox the model picker everywhere, with the provider
named on every row. The two plugins must show the same control on every screen
that chooses a model.

## What Changes

- **The shared `AvailableModelPicker`** (`packages/ui/src/components/model-selection/`)
  is rebuilt on the `Combobox` component (`packages/ui/src/components/ui/combobox.tsx`).
  The user types to filter by provider, model name and model id, exactly as
  `filterModelGroups` in `lookup.ts` already matches. Arrow keys move, Enter
  picks, Escape closes. Each row names the model and its provider. The closed
  field names the chosen model and its provider. The grouped list with provider
  headers and logos becomes a flat list, so the provider is read on the row.
  Admin, onboarding and Design Library settings get the new picker because they
  use this component.
- **A Workflow step's model** (`plugins/sero-orchestrator-plugin/ui/components/StepModelControl.tsx`)
  becomes one combobox field. `Auto`, `LOW`, `MED` and `HIGH` come first, then
  every model, and typing filters both. It replaces the native tier select and
  the separate "Specific model…" picker. Clearing a pinned model still works.
- **Architect's Project models** (`plugins/sero-architect-plugin/ui/components/ModelSettings.tsx`)
  and **New project's Model overrides**
  (`plugins/sero-architect-plugin/ui/components/IntakeModelOverrides.tsx`) pick
  each tier's model through the same combobox, with the inherited choice first.
  The thinking picker stays beside the model field. The Project models
  **Effective** column names the tier's model id and its thinking level together
  (`v4.1-flash · low`), matching frame 2, in place of the provider-qualified
  reference it prints today.
- **Every model picker in Architect and the Orchestrator uses that one field.**
  An inventory of the two plugins finds three places that choose a model: the two
  Architect places above and the step's model. Each moves to the shared picker, so
  the control reads the same on every screen. Read-only model displays - the Room
  member facts, the Room's allowed-models chips, the plan's model list and the
  inspector - are not pickers and do not change.

Non-goals:

- The compact composer picker (`ModelPickerBody`), which the remote web app and
  the chat composer show under a chip. It keeps its grouped list.
- The desktop shell's own model selector (`apps/desktop/src/components/layout/models/`).
  It is not Architect or the Orchestrator.
- Any change to how a model choice is saved, validated, resolved or attributed.
  This change is the control only.

## Capabilities

### New Capabilities

- `model-selection-ui`: the shared model picker's contract - one combobox that
  filters by provider, model name and model id, names the provider on every row
  and in the closed field, and works from the keyboard.

### Modified Capabilities

- `architect-model-overrides`: the Project models table and the New project
  Model overrides choose each tier's model through the shared combobox, with the
  inherited choice first, and the Project models Effective column names the model
  id and thinking level.
- `orchestrator-ui`: a Workflow step's model is one combobox field with the
  tiers first, in place of the tier select and the separate specific-model
  picker.

## Impact

- Shared: `packages/ui/src/components/model-selection/available-model-picker.tsx`
  (rebuilt on `Combobox`) and its test. `model-picker-body.tsx` and
  `thinking-picker.tsx` are unchanged.
- Orchestrator plugin: `ui/components/StepModelControl.tsx` and its test.
- Architect plugin: `ui/components/ModelSettings.tsx`,
  `ui/components/IntakeModelOverrides.tsx`, the `models` preview in
  `ui/__preview__/main.tsx`, and `ui/__tests__/model-settings.test.tsx`.
- Orchestrator preview: a new step-with-Tune-open preview for the capture.
- Consumers that need no code change but change appearance: Admin
  (`AgentEditor.tsx`, `ModelPanel.tsx`), onboarding (`SetupScreen.tsx`) and
  Design Library (`SettingsPage.tsx`).
- `@sero-ai/ui` is published, so its version is bumped in the same pull request.
- No IPC, preload, main-process or dependency change.
- Evidence: side-by-side captures of both frames plus `comparison.md`.
- The linked issue is https://github.com/sero-labs/sero/issues/543; the pull
  request SHALL reference it.
