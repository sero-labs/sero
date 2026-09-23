## Context

See proposal.md - Why. The facts that shape the approach, as the code stands:

**The shared picker is a popover of grouped buttons.** `AvailableModelPicker`
(`packages/ui/src/components/model-selection/available-model-picker.tsx`) wraps a
`Popover` trigger around `ModelPickerBody`. `ModelPickerBody` renders a
`SearchInput`, then provider groups with a logo, a provider heading, and a row
per model. Rows show the model name only; the provider is read from the group
heading. Its props are `groups`, `value`, `onChange`, `placeholder`,
`searchPlaceholder`, `emptyLabel`, `noModelsLabel`, `allowClear`, `disabled`,
`className`, generic over `SharedModelInfo` and `SharedAvailableModelGroup`.

**The matcher already exists.** `filterModelGroups`
(`packages/common/src/model-selection/lookup.ts`) matches a query against
`` `${group.displayName} ${model.name} ${model.modelId}` ``. That is exactly the
provider, model name and model id rule the drawing asks for.

**The Combobox exists and is used.** `packages/ui/src/components/ui/combobox.tsx`
wraps `@base-ui/react`'s Combobox. Base UI's root accepts a `filter` predicate and
an `items` prop. `MediaModelSettings.tsx` and `LibraryToolbar.tsx` in the Design
Library plugin already use it. `ComboboxInput` renders an `InputGroup` with a
chevron trigger, an optional clear button, and a slot for extra children.

**The compact composer is separate.** `ModelPickerBody` is also used directly by
`apps/web-remote/src/components/ModelPicker.tsx` under a compact chip. It is not
one of the three places in the drawing and it keeps its grouped list.

**The three call sites.** `StepModelControl.tsx` uses a styled `Select` for
`Auto`/tiers/`Specific model…` and, when the last is picked, a second
`AvailableModelPicker` beside it. `ModelSettings.tsx` uses a styled `Select` per
tier, with `NONE` for the inherited choice, and a thinking `Select` beside it.
`IntakeModelOverrides.tsx` uses the same pattern with `GLOBAL`.

## Goals / Non-Goals

**Goals:**

- One combobox contract for choosing a model, shared by the three call sites and
  every other `AvailableModelPicker` consumer.
- Provider named on every row and in the closed field.
- Fixed choices (`Auto`, tiers, the inherited selection) listed first and
  filtered by the same query as the models.
- The three call sites keep every choice and every value they show today.

**Non-Goals:**

- The compact composer picker (`ModelPickerBody`), which keeps its grouped list
  for the remote web app and the chat composer.
- The desktop shell's own model selector.
- Any save, validation, resolution or attribution change.
- A new IPC, preload, main-process or dependency.

## Decisions

### 1. Rebuild `AvailableModelPicker` on `Combobox`, keep its props

Keep the current props and generics, so the four consumers that need no behaviour
change (Admin, onboarding, Design Library) keep working without an edit. The
internals become `Combobox` + `ComboboxInput` + `ComboboxContent` +
`ComboboxList` + `ComboboxItem`, with one flat list.

**Alternative considered:** keep the popover and add filtering to
`ModelPickerBody`. Rejected: the drawing asks for a combobox - a typed filter in
the field itself - and `ModelPickerBody` must keep its grouped, chip-wrapped
shape for the composer.

### 2. Add `leadingOptions` for the fixed choices

Add one optional prop:

```ts
leadingOptions?: ReadonlyArray<{ value: string; label: string }>;
```

Those entries are listed before the models and are filtered by the same query.
`AvailableModelPicker` resolves the closed field against `leadingOptions` first,
then the catalogue. This lets the step pass `Auto`, `LOW`, `MED`, `HIGH`; the
tier tables pass the inherited choice; and the intake passes `Global selection`.
Each caller keeps its own sentinel value (`''`, `NONE`, `GLOBAL`) as the
caller's saved value, and maps it in `onChange`.

**Alternative considered:** pass the fixed choices through `groups` as a fake
provider. Rejected: it puts a non-model into the model list and muddles the
provider display.

### 3. Filter with a predicate, reusing the existing rule

Set `filter={(option, query) => ...}` on `Combobox.Root` and match the same
string `filterModelGroups` matches: provider, then label, then value, lowercased
and trimmed. A leading option has no provider, so it matches on its label.

**Alternative considered:** pre-filter with `filterModelGroups` and pass
`filteredItems`. Rejected: `filterModelGroups` does not know the leading
choices, so the fixed choices and models would filter by two rules. One predicate
over the combined list keeps one rule.

### 4. Show the provider in the row and beside the closed field

Each `ComboboxItem` renders the model name and its provider. The closed field's
provider is an `InputGroupAddon` inside `ComboboxInput`, so the field reads the
model name with its provider beside it, as the drawing shows. No provider logos
or group headings remain in this picker; the drawing shows text only.

### 5. A step's model control is one picker with four leading options

`StepModelControl` renders one `AvailableModelPicker` with
`leadingOptions = [Auto, LOW, MED, HIGH]`, `value = model ?? 'Auto'`, and
`allowClear`. `onChange` maps `Auto` and `''` to `onChange(undefined)`, a tier to
`onChange(tier)`, and a model key to `onChange(key)`. The `customArmed` state and
the second picker are removed. Clearing stays: it selects `Auto`. The field is a fixed 20rem (`w-80`), which
frame 1 draws as 320px at its 16px root; the app's root is 13px, so the same
token measures 260px there. A name and its provider read on one line beside
`Agent` and `Tools`.

**Alternative considered:** keep the select and only swap the second picker.
Rejected: the drawing folds both into one field.

### 6. The tier fields use the picker with the inherited choice first

`ModelSettings` replaces each tier's `Select` with `AvailableModelPicker`,
`leadingOptions` holding one entry with the caller's `NONE` value, labelled
`Global` when the inherited selection cannot be read and `Not selected`
otherwise (the label rule the view already uses, and the issue's "Global (or Not
selected)"). Its `onChange` MUST branch on `NONE` and call
`clearModelDefault`; today the handler returns early when the value is not in
`options`, so the first choice would be inert. The thinking `Select` stays
beside it. `IntakeModelOverrides` does the same with `GLOBAL` and chooses the
thinking level the same way.

**Alternative considered:** label the first entry only `Global` everywhere.
Rejected: the Project models view distinguishes "not selected" from "the global
cannot be read", and that distinction is an existing spec requirement
(`architect-model-overrides`).

### 7. Every model picker in Architect and the Orchestrator is this field

The only model-choice sites in the two plugins are `ModelSettings.tsx`,
`IntakeModelOverrides.tsx` and `StepModelControl.tsx`. All three move to
`AvailableModelPicker`, so the picker reads the same on each screen. Read-only
model displays are not pickers and do not change: the Room member facts, the
Room's allowed-models chips, `ModelChoices.tsx` and the inspector.

**Alternative considered:** change only the three places the drawing names and
leave the shared picker's other consumers alone. Rejected: the shared picker is
one component, so its consumers change anyway, and the plugins would then show
two picker styles.

### 8. The Effective column names the model id and the thinking level

Frame 2 draws the Effective cell as `v4.1-flash · low`, where the page prints
`deepseek/v4.1-flash` today. Change the tier rows to `<model id> · <thinking
level>` from the tier's effective entry. The provider stays on the model field,
so it is not lost. The owner row keeps its current Effective cell, because the
drawing shows no owner row and `record.session` there carries a different shape.

**Alternative considered:** leave the Effective column as shipped and record it
as out of scope. Rejected by the user, who asked for the drawing to be matched.

### 9. Test the picker where it lives, and stand it in for plugin tests

Add `packages/ui/src/components/model-selection/available-model-picker.test.tsx`
for the shared contract: filter by provider, name and id; rows name the provider;
the closed field names the provider; leading options first; clear. The Architect
plugin tests mock `@sero-ai/ui`, so add a picker stand-in beside
`select-stand-in.tsx` that exposes the labelled options, and use it in
`model-settings.test.tsx` and `project-controls.test.tsx` (which renders
`IntakeDialog`, and so `IntakeModelOverrides`).

### 10. Capture both frames through the preview harnesses

The Architect harness already has `?state=models` (`ui/__preview__/main.tsx`),
but its fixture holds three models; extend it so the open list shows rows,
providers and a check mark. Add an Orchestrator preview that renders a step with
Tune open and a catalogue with several providers. Screenshot the drawing's two
frames and both built surfaces at a viewport wider than the panel, open every
fold and Tune panel on both sides, and read each pair as images. Write the
differences and the departures in `comparison.md`.

## Risks / Trade-offs

- **The shared picker changes Admin, onboarding and Design Library with no
  capture of their own.** They are not in scope for the drawing and have no
  preview harness. Mitigation: the shared component's tests cover the contract,
  and `comparison.md` states plainly that these three surfaces were not captured.
- **A flat list loses the provider grouping some users scan by.** Trade-off
  accepted: the drawing names the provider on every row instead, which is what
  distinguishes same-named models.
- **Two model controls remain in the codebase** (`AvailableModelPicker` and
  `ModelPickerBody`). Trade-off accepted: the composer's compact chip needs a
  different shape, and merging them would change a surface outside this change.
- **`ComboboxInput`'s provider addon may crowd a narrow field.** Mitigation: the
  Architect tier fields are already narrow, so the provider is shown only where
  the field has room, and `comparison.md` records what the capture showed.

## Migration Plan

No data, IPC or settings migration. The saved values keep their current shape
(`provider/modelId`, a tier, or a sentinel); only the control that writes them
changes. `@sero-ai/ui` is published, so its version is bumped in the same pull
request.

## Open Questions

None. The first choice's label is settled by the issue's "Global (or Not
selected)" and the existing `architect-model-overrides` requirement; the
Effective column and the cross-plugin consistency are settled by the user
(Decisions 7 and 8).
