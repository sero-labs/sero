# Unified Model Selection Plan

Date: 2026-04-06
Status: Proposed
Owner: TBD

## Summary

Sero currently has **four different model-selection paths** with inconsistent data sources and UX:

1. **Chat `ModelSelector`** — dynamic, session-aware, fed by live available models and thinking capabilities.
2. **Onboarding setup** — bespoke recommendation flow with provider-centric heuristics and separate model-picking UI.
3. **Admin Providers panel** — provider-first configuration, duplicate pickers, auth actions, and a separate `provider-model-defaults.json` system.
4. **Admin Agents editor** — hardcoded Claude model options and a simplified type model that does not match the actual subagent file format.

This fragmentation is the root problem. It creates:

- mismatched available options across screens
- provider-specific behavior in places where users just want “pick a model”
- extra persistence layers (`provider-model-defaults.json` vs `settings.json`)
- hidden fallback/cleanup behavior that removes invalid selections without clearly warning the user
- admin agent editing that is already out of date with the runtime

The requested direction is to make model configuration feel like **one system**:

- global LOW / MED / HIGH defaults picked from the same live model inventory used by chat
- a global default thinking level using the same semantics as chat
- Admin tab renamed to **Model**
- no provider-auth controls in the Admin model UI
- Agents editor driven by live available models instead of hardcoded options
- visible warnings when saved model references are no longer available

---

## User Requests Captured

1. Global LOW / MED / HIGH tier selection should come from whatever models are currently available.
2. Global default thinking amount should be configurable with the same thinking vocabulary used by chat.
3. Rename the Admin tab/panel from **Providers** to **Model** and remove provider-auth UI from that panel.
4. Update Agents management to use available models dynamically instead of hardcoded options.
5. Unify model-selection behavior across Sero as much as practical.
6. Surface clear warnings when previously configured models are missing.

---

## Current-State Analysis

### 1) Chat already has the best runtime model source

`apps/desktop/src/components/layout/ModelSelector.tsx`
- Uses live session model state.
- Shows actual available models.
- Uses shared thinking labels from `model-config.ts`.
- Is the closest thing we have to the desired source of truth.

But it is tightly bound to session state and cannot be reused directly by Admin/onboarding/plugin UIs.

### 2) Admin model config is provider-centric, not user-centric

`plugins/sero-admin-plugin/ui/components/ModelDefaultsPanel.tsx`
- Organizes config around providers rather than user intent.
- Mixes tier selection, provider overrides, provider health, and auth actions in one screen.
- Persists config through `providerDefaults`, which is separate from the existing `modelTiers` system.

This is the main reason the UI feels too complex.

### 3) Onboarding has a separate recommendation engine and UI path

`apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx`
`apps/desktop/electron/features/onboarding/recommendations.ts`
- Uses provider-default heuristics.
- Couples “which provider should I use?” with “which models should I set?”
- Does not reuse the same picker UX as the rest of the app.

This is another major unique code path.

### 4) Agents editor is hardcoded and partially type-misaligned

`plugins/sero-admin-plugin/ui/components/AgentEditor.tsx`
- Hardcodes a few Claude models.
- Hardcodes a reduced thinking list.
- Assumes `model?: string`.

But the runtime already supports richer subagent model fields:
- `string` model IDs
- tier aliases like `LOW` / `MED` / `HIGH`
- structured `{ prefer, fallbacks }` config

See:
- `apps/desktop/electron/ipc/subagent/subagent.ts`
- `apps/desktop/src/types/subagent.ts`

So the editor is already lagging behind runtime capabilities.

### 5) Missing-model handling is mostly silent today

`apps/desktop/electron/shared/settings/cleanup-unavailable-model-selections.ts`
- Removes invalid saved selections automatically.
- Helps keep runtime state clean.
- But works against user-facing warnings, because stale selections can disappear before the UI explains what happened.

If we want explicit warnings, we need a validator-first flow rather than cleanup-first behavior in user-facing surfaces.

---

## Design Goals

### Primary goals

- One mental model: **pick models, not providers**.
- One live source of available models across chat, onboarding, and admin.
- One shared thinking vocabulary across chat and global defaults.
- One persistent global config path for future sessions.
- Agent editor that reflects real runtime capabilities.
- Clear missing-model warnings instead of silent surprises.

### Secondary goals

- Reduce duplicated picker/filter/search code.
- Keep touched source files under 500 LOC.
- Remove obsolete provider-default infrastructure where it is no longer needed.

### Non-goals

- Redesign chat session model switching behavior.
- Remove `/login` or change chat auth flows.
- Redesign provider auth everywhere in the same change unless required by onboarding follow-up.

---

## Proposed Product Model

### A. Global Model defaults

The Admin **Model** panel should only manage:

- `LOW` tier model
- `MED` tier model
- `HIGH` tier model
- global default thinking level

Each tier picker:
- draws from the live available model list
- is grouped/searched the same way as chat
- stores `{ provider, modelId }` in `sero.modelTiers`

Global thinking:
- uses the same thinking levels/labels as chat
- persists through the existing default thinking setting
- does not show provider/auth controls

### B. Agent model config

Agent editor should support three conceptual states:

1. **Inherit / default** — no explicit agent model
2. **Use global tier** — `LOW`, `MED`, or `HIGH`
3. **Use a specific available model** — explicit `{provider, modelId}` or plain string model ref, depending on the chosen persistence format

This keeps agents aligned with the same model inventory while preserving runtime flexibility.

### C. Missing-model warnings

Warnings should be surfaced for:

- global tier defaults pointing at unavailable models
- global default thinking that is not supported by the selected/default model path
- agent configs that point at unavailable explicit models
- agent configs that depend on missing global tiers

Warnings should be visible in the Admin Model tab and Agent editor before the user saves changes.

---

## Architecture Direction

## 1) Consolidate on a single persistent global config model

Keep and strengthen the config that already makes sense:

- `settings.json`
  - `sero.modelTiers`
  - `defaultThinkingLevel`

Retire the config that creates extra complexity:

- `provider-model-defaults.json`
- provider-default IPC bridge/state types
- provider-default recommendation logic in onboarding

### Why

This matches the requested UX directly. Users want global tiers, not provider-local fallback trees in Admin.

---

## 2) Create shared model-selection primitives instead of reusing chat wholesale

Do **not** try to directly reuse `ModelSelector.tsx` everywhere; it is session/store-specific.

Instead extract reusable layers:

### Shared data helpers
Likely home: `packages/common/` or desktop shared renderer utilities

Candidate helpers:
- `THINKING_LEVELS`
- `THINKING_LABELS`
- `findModel()`
- `findGroup()`
- grouped search/filter helpers
- model reference formatting/parsing helpers
- validation helpers for missing selections

### Shared UI primitives
Likely home: `packages/ui/`

Candidate components:
- `AvailableModelPicker` — searchable grouped model picker driven entirely by props
- `ThinkingLevelPicker` — reusable thinking selector using shared labels
- optional `ModelWarningBanner` / `ModelSelectionNotice`

### Thin wrappers
Each surface should then wrap the shared primitives:
- chat `ModelSelector` keeps session-specific behavior and favourites/manager gear
- onboarding uses shared picker + onboarding-specific copy/actions
- Admin Model tab uses shared picker + global persistence
- Agent editor uses shared picker + agent persistence semantics

This gives us shared behavior without coupling plugin UIs to desktop-specific stores.

---

## 3) Add a focused model-config API for non-session screens

Today, non-session screens have to stitch together multiple APIs.

Introduce a dedicated IPC/API for global model config, for example:

```ts
interface GlobalModelConfigState {
  tiers: ModelTierSettings;
  defaultThinkingLevel: string;
  warnings: ModelConfigWarning[];
}
```

Suggested renderer surface:

- `window.sero.modelConfig.get()`
- `window.sero.modelConfig.setTiers(tiers)`
- `window.sero.modelConfig.setDefaultThinking(level)`
- `window.sero.modelConfig.validate()` or bundle warnings into `get()`

`window.sero.models.list()` remains the canonical available-model inventory.

### Why

This prevents Admin/onboarding from directly reading raw config files or stitching together unrelated APIs.

---

## 4) Extend available model metadata for thinking-capability-aware surfaces

Current `models.list()` gives:
- provider
- modelId
- name
- reasoning

That is enough for model choice, but not enough to fully mirror chat’s thinking behavior.

We should extend model metadata with capability hints if feasible, e.g.:

```ts
interface ModelInfo {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  availableThinkingLevels?: string[];
  supportsXhigh?: boolean;
}
```

If the backend cannot derive exact supported levels per model without a live session, use:
- `reasoning === false` => only `off`
- `reasoning === true` => `off|minimal|low|medium|high`
- `supportsXhigh(model)` => add `xhigh`

This is close enough to the existing chat semantics and still uses the same vocabulary.

---

## 5) Replace cleanup-first behavior with validation-first behavior in config UIs

User-facing config surfaces should prefer:

- preserve invalid saved refs long enough to explain them
- show warnings inline
- let the user repair/save

Runtime can still fall back safely when a session opens.

### Proposed split

- **Validation helpers** for UI warnings
- **Cleanup helpers** only on explicit save or on legacy migration paths

This is especially important for the new Model tab, otherwise users will never understand why a saved default disappeared.

---

## Implementation Plan

## Phase 1 — Shared model-selection foundation

- [ ] Audit current model/tier/thinking types and choose the shared extraction boundary.
- [ ] Extract shared thinking labels/constants from `apps/desktop/src/components/layout/model-config.ts`.
- [ ] Create a reusable searchable grouped model picker component.
- [ ] Create a reusable thinking picker component.
- [ ] Add shared model validation helpers:
  - `validateGlobalTierSelections()`
  - `validateAgentModelConfig()`
  - helpers to produce friendly warning text

### Likely files
- New: `packages/ui/src/components/...` or equivalent shared UI path
- New: `packages/common/src/...` or shared renderer utility path
- Refactor: `apps/desktop/src/components/layout/model-config.ts`

---

## Phase 2 — Global model config API

- [ ] Add backend helpers to read/write `defaultThinkingLevel` alongside `modelTiers`.
- [ ] Add a focused `modelConfig` IPC surface for non-session UIs.
- [ ] Keep `models.list()` as the inventory API.
- [ ] Optionally enrich `models.list()` with thinking capability metadata.
- [ ] Add validation output for missing tiers / invalid thinking.

### Likely files
- Modify: `apps/desktop/electron/ipc/workspace/profiles.ts`
- Modify: `apps/desktop/electron/preload/api.ts`
- Modify: `apps/desktop/src/types/ipc.ts`
- Modify: `apps/desktop/src/types/electron.d.ts`
- Modify: `apps/desktop/src/types/ipc-channels.ts`
- New: `apps/desktop/electron/shared/settings/default-thinking.ts` or expand model settings helpers

---

## Phase 3 — Rewrite Admin panel as “Model”

- [ ] Rename Admin section id/label from `modelDefaults` to `model`.
- [ ] Replace `ModelDefaultsPanel` with a simpler `ModelPanel`.
- [ ] Remove provider cards, provider health, and auth actions from this panel.
- [ ] Show:
  - three global tier pickers
  - one global default thinking picker
  - warning banners for missing selections
  - save/reset affordances
- [ ] Keep UI intentionally simple and compact.

### Likely files
- Modify: `plugins/sero-admin-plugin/shared/types.ts`
- Modify: `plugins/sero-admin-plugin/ui/AdminApp.tsx`
- Modify: `plugins/sero-admin-plugin/ui/components/NavSidebar.tsx`
- Modify: `plugins/sero-admin-plugin/ui/components/Header.tsx`
- Replace: `plugins/sero-admin-plugin/ui/components/ModelDefaultsPanel.tsx`
- Delete: `plugins/sero-admin-plugin/ui/components/ProviderCard.tsx`
- Simplify: `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts`

---

## Phase 4 — Update onboarding to use the same selection model

- [ ] Replace provider-default-driven onboarding model setup with live model pickers.
- [ ] Remove provider-default dependency from onboarding recommendation logic.
- [ ] Reuse the same shared model picker UI used by Admin/chat wrappers.
- [ ] Add global default thinking selection to onboarding.
- [ ] Keep onboarding auth gating separate from the model picker itself.
- [ ] Reduce `OnboardingWizard.tsx` size by moving model config logic into subcomponents/hooks.

### Likely files
- Modify: `apps/desktop/src/components/profiles/OnboardingWizard.tsx`
- Replace/simplify: `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx`
- Possibly reuse or remove: `apps/desktop/src/components/profiles/TierPicker.tsx`
- Modify: `apps/desktop/electron/features/onboarding/recommendations.ts`
- Modify: `apps/desktop/electron/features/onboarding/types.ts`
- Modify: `apps/desktop/electron/features/onboarding/preflight.ts`

---

## Phase 5 — Upgrade Agent editor to dynamic models

- [ ] Fix admin plugin agent IPC/types to match runtime `SubagentAgentFile` capabilities.
- [ ] Replace hardcoded model `<select>` with shared model-selection UI.
- [ ] Support at least:
  - inherit/default
  - global tier alias (`LOW`/`MED`/`HIGH`)
  - explicit available model
- [ ] Preserve runtime compatibility with existing plain-string agent files.
- [ ] Show warnings when the selected explicit model is unavailable or when a referenced tier is unset.

### Important note

The current admin plugin types flatten `model` to `string`, but the runtime already supports structured model fields. This needs correction before or during the UI rewrite.

### Likely files
- Modify: `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx`
- Modify: `plugins/sero-admin-plugin/ui/components/types.ts`
- Modify: `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts`
- Possibly modify: `apps/desktop/src/types/subagent.ts`
- Possibly modify: `apps/desktop/electron/ipc/subagent/subagent.ts`

---

## Phase 6 — Remove obsolete provider-default system

Once onboarding and admin no longer depend on it:

- [ ] Remove provider-default IPC channels and preload bridge.
- [ ] Remove `provider-model-defaults.ts` and its types if no longer used.
- [ ] Remove package-provider default aggregation that only fed this system.
- [ ] Delete stale docs/spec references or mark them obsolete.
- [ ] Add one-time migration from `provider-model-defaults.json` to `sero.modelTiers` if needed.

### Migration strategy

If `provider-model-defaults.json` exists and `sero.modelTiers` is empty:
- derive `LOW/MED/HIGH` from the effective previous selections where possible
- write them into `settings.json`
- keep the old file untouched for one release or archive it
- show a non-blocking migration notice if conversion was partial

### Likely files
- Delete: `apps/desktop/electron/shared/settings/provider-model-defaults.ts`
- Modify: `apps/desktop/electron/ipc/onboarding/onboarding.ts`
- Modify: `apps/desktop/electron/preload/onboarding.ts`
- Modify: `apps/desktop/electron/preload/api.ts`
- Modify: `apps/desktop/src/types/ipc.ts`
- Modify: `apps/desktop/src/types/electron.d.ts`
- Modify: `apps/desktop/src/types/model-tiers.ts`
- Modify: `apps/desktop/electron/shared/providers/package-provider-manifests.ts`

---

## Missing-Model Warning Plan

## Global model tab warnings

Show warnings when:
- a saved LOW/MED/HIGH tier model is no longer available
- the saved default thinking level exceeds what the selected default path can support
- migration from old provider defaults was partial or lossy

Example copy:
- “`HIGH` was set to `anthropic/claude-opus-4`, but that model is not currently available.”
- “Default thinking is `xhigh`, but the selected default model only supports up to `high`.”

## Agent editor warnings

Show warnings when:
- the agent points to an explicit unavailable model
- the agent points to `LOW`/`MED`/`HIGH` but that global tier is unset or invalid
- a structured model config has fallbacks that are all unavailable

Important: warnings should explain runtime behavior, not just validation failure.

---

## Testing Plan

- [ ] Unit tests for global model config read/write helpers.
- [ ] Unit tests for missing-model validation helpers.
- [ ] Unit tests for onboarding recommendation/migration behavior after removing provider defaults.
- [ ] Unit tests for agent model validation (inherit / tier alias / explicit model).
- [ ] Renderer tests for Admin Model tab warnings and save flows.
- [ ] Type tests / regression coverage for subagent model field typing.
- [ ] Full `pnpm typecheck` at each phase.

Potential test files:
- `apps/desktop/electron/__tests__/features/onboarding/...`
- new tests under `apps/desktop/electron/__tests__/shared/settings/...`
- plugin-admin UI tests if present / add targeted component tests

---

## Risks

### 1) Thinking capability parity may not be available session-independently

If exact per-model thinking capabilities are only available through `AgentSession`, Admin/onboarding cannot perfectly mirror chat. In that case:
- use shared labels and best-effort capability hints
- validate at runtime and warn when a selection is too aggressive

### 2) Silent cleanup currently masks invalid state

If we leave cleanup behavior untouched, warnings may never surface. This must be resolved deliberately.

### 3) Agent model field compatibility

The runtime supports richer model config than the current editor types. If we only patch the UI superficially, we will create more mismatch rather than less.

### 4) File-size pressure

`OnboardingWizard.tsx` is already near the 500 LOC limit. This refactor must split logic into smaller hooks/components rather than add more branching there.

---

## Recommended Order of Execution

1. Shared picker + thinking primitives
2. Global model config API
3. Admin Model tab rewrite
4. Agent editor dynamic model support
5. Onboarding migration to shared picker
6. Provider-default system removal + migration cleanup

This order gets the new simpler Admin experience first, while setting up the pieces needed for true cross-surface unification.

---

## Open Questions

1. Should Agent editor expose only:
   - inherit
   - LOW / MED / HIGH
   - explicit model
   or should it also expose structured fallback editing in v1?

2. Should onboarding auth itself remain a dedicated first-run UI, or should it also eventually route people into `/login`?

3. Do we want the Admin Model tab to auto-save on each selection, or require an explicit Save button now that warnings matter more?

4. Should missing saved tiers remain persisted until the user repairs them, or should we still prune them after first warning display?

---

## Recommendation

Proceed with a **unified model system** centered on:

- live available models (`models.list()` / session model state)
- `sero.modelTiers`
- `defaultThinkingLevel`
- shared picker primitives
- warning-first validation

And explicitly retire the provider-centric Admin configuration path.

This is the cleanest way to match the requested UX and reduce future model-selection drift across Sero.
