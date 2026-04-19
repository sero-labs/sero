# PR #147 follow-up task — move Kanban domain contracts out of `@sero-ai/common`

Status: **required before PR #147 can merge**

## Why this exists

The current branch successfully decouples the Kanban plugin from desktop-host
internals, but it still leaves the Kanban domain model in `@sero-ai/common`.
That is not aligned with the goal of making Kanban a self-contained external
plugin.

`@sero-ai/common` should keep **generic Sero platform contracts** only.
Kanban-specific state, validation, and workflow helpers should be owned by the
Kanban plugin itself.

Related package-boundary rule:
- monorepo `packages/*` directories are Sero-owned shared package sources
- external plugins should **consume** those packages via published package names
- external-plugin domain code should **not** be relocated into `packages/*`
  just because the plugin is external

## Current pollution audit

### Host package still owns Kanban domain exports

These files in the main repo still publish Kanban-specific contracts:

- `packages/common/src/kanban.ts`
- `packages/common/src/index.ts`

Published exports currently include:

- types: `Column`, `Priority`, `CardStatus`, `ReviewMode`, `Subtask`,
  `PlanningToolEntry`, `PlanningProgress`, `ImplementationProgress`,
  `ReviewProgress`, `Card`, `KanbanSettings`, `KanbanState`, `ValidationResult`
- values/helpers: `COLUMNS`, `COLUMN_LABELS`, `PRIORITY_ORDER`,
  `DEFAULT_KANBAN_STATE`, `createDefaultKanbanState`, `createCard`,
  `validateCardTransition`, `validateReviewDecision`,
  `getUnmetDependencies`, `getManualMoveTargets`, `validateManualMove`

### External Kanban plugin still imports those host-owned Kanban contracts

Files in `../plugins/sero-kanban-plugin/` that still pull Kanban domain pieces
from `@sero-ai/common`:

- `shared/types.ts`
- `shared/validation.ts`
- `runtime/types.ts`
- `runtime/core/contracts.ts`
- `runtime/prompts/plan-result.ts`
- `runtime/prompts/planning.ts`
- `runtime/prompts/prompt-conflict-resolution.ts`
- `runtime/prompts/prompt-implementation.ts`
- `runtime/prompts/prompt-light-review-repair.ts`
- `runtime/prompts/prompt-review-specialized.ts`
- `runtime/prompts/review-prompt.ts`
- `runtime/prompts/review-types.ts`
- `runtime/planning/planning-submission-tool.ts`

These imports are the ones that should be eliminated. Generic platform types
such as `AppRuntimeContext`, `AppRuntimeHost`, `AppToolResult`,
`ExtensionSessionRuntime`, and `AppRuntimeWorkspaceSyncResult` can and should
stay in `@sero-ai/common`.

## Target end state

After the follow-up commit:

- `@sero-ai/common` contains **no Kanban domain contracts**
- the Kanban plugin owns its own:
  - state types
  - constants
  - card creation helpers
  - transition/review/manual-move validation helpers
- the external Kanban plugin uses **local plugin imports** for Kanban domain
  code (`../shared/*`, `./types`, etc.)
- only generic platform contracts remain imported from `@sero-ai/common`

## Required implementation steps

### 1. Move Kanban contracts into the plugin-owned shared layer

In `../plugins/sero-kanban-plugin/`:

- make `shared/types.ts` the source of truth for the Kanban domain model
- make `shared/validation.ts` the source of truth for the Kanban validation
  helpers

Preferred structure:

- `shared/types.ts`
  - `Column`, `Priority`, `CardStatus`, `ReviewMode`
  - `Subtask`, `PlanningToolEntry`, `PlanningProgress`,
    `ImplementationProgress`, `ReviewProgress`
  - `Card`, `KanbanSettings`, `KanbanState`
  - `COLUMNS`, `COLUMN_LABELS`, `PRIORITY_ORDER`
  - `createDefaultKanbanState`, `DEFAULT_KANBAN_STATE`, `createCard`
- `shared/validation.ts`
  - `ValidationResult`
  - `validateCardTransition`
  - `validateReviewDecision`
  - `getUnmetDependencies`
  - `getManualMoveTargets`
  - `validateManualMove`

Keep these files renderer-safe and framework-agnostic.

### 2. Rewrite plugin imports to use local Kanban contracts

Update the Kanban plugin files listed above so they no longer import Kanban
pieces from `@sero-ai/common`.

Use local imports such as:

- `../shared/types`
- `../shared/validation`
- `./types`
- `./core/types`

Do **not** introduce desktop-host imports as part of this cleanup.

### 3. Remove Kanban exports from `@sero-ai/common`

In the main repo:

- remove the Kanban export block from `packages/common/src/index.ts`
- delete `packages/common/src/kanban.ts`
- verify there are no remaining non-doc imports in the main repo relying on
  those exports

### 4. Keep generic platform contracts in `@sero-ai/common`

Do **not** move these out as part of this follow-up:

- app runtime host contracts
- app tool contracts
- plugin metadata / compatibility contracts
- session runtime contracts
- IPC bridge types shared across Sero packages

This follow-up is specifically about removing **Kanban domain ownership** from
`@sero-ai/common`, not dismantling the generic shared package.

### 5. Handle package/version fallout cleanly

Because `@sero-ai/common` is published, removing public exports is a breaking
change.

Before merging:

- decide the right version bump for `@sero-ai/common`
- update any dependent manifests if needed
- ensure the external Kanban plugin no longer relies on those removed exports

If no other consumer needs the old Kanban exports, prefer a clean removal over a
back-compat shim.

## Validation checklist for the follow-up commit

### In the main repo

Run:

```bash
pnpm typecheck
pnpm --dir apps/desktop exec vitest run \
  electron/__tests__/features/apps/runtime/loader.test.ts \
  electron/__tests__/features/apps/runtime/manager.test.ts \
  electron/__tests__/features/apps/app-discovery.test.ts \
  electron/__tests__/cli/prompt-block.test.ts \
  electron/__tests__/ipc/app-state-settings-reload.test.ts
```

### In the external Kanban plugin repo

Run:

```bash
cd ../plugins/sero-kanban-plugin
npm test
npm run typecheck
npm run build
```

### Final grep guard

From the Sero repo root, confirm the only remaining Kanban-related imports from
`@sero-ai/common` are docs/examples you intentionally keep — not live source:

```bash
rg -n "@sero-ai/common" ../plugins/sero-kanban-plugin
rg -n "kanban" packages/common/src apps packages plugins -g '!docs/**'
```

## Suggested commit message

```text
refactor(kanban): move domain contracts out of @sero-ai/common
```
