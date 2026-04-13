# Facts — desktop-packages-plugins

_Last reviewed: 2026-04-13_

## What this code does
This Phase 0 scope covers the remaining desktop-adjacent foundations outside the
original `apps/desktop` wave: the shared runtime/contracts packages
(`packages/common/src`, `packages/app-runtime/src`), the unreviewed Electron
seams under `apps/desktop/electron/`, and every built-in plugin package under
`plugins/sero-*-plugin/`.

## Shape & metrics
- Total folders scanned: 16 (6 desktop/shared targets + 10 plugin targets)
- Total source files scanned (TS/JS only, generated output ignored): 340 files /
  53,983 LOC
- Slice totals:
  - Shared packages — 15 files / 1,210 LOC
  - Residual desktop Electron seams — 84 files / 10,575 LOC
  - Plugins — 241 files / 42,198 LOC
- Largest file: `apps/desktop/electron/features/kanban/core/orchestrator.ts`
  (491 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC): 20 total
  - Residual Electron hotspots:
    - `apps/desktop/electron/features/kanban/core/orchestrator.ts` (491)
    - `apps/desktop/electron/cli/core/tool.ts` (474)
    - `apps/desktop/electron/cli/commands/integrations/google.ts` (441)
    - `apps/desktop/electron/cli/commands/apps/app-control.ts` (436)
    - `apps/desktop/electron/features/kanban/prompts/index.ts` (423)
    - `apps/desktop/electron/cli/core/schema-bridge.ts` (403)
    - `apps/desktop/electron/features/kanban/review/workflow/review-executor.ts` (400)
  - Shared package hotspot just below the threshold:
    - `packages/common/src/model-selection.ts` (396)
  - Plugin hotspots:
    - `plugins/sero-web-plugin/extension/gemini-web.ts` (483)
    - `plugins/sero-cron-plugin/extension/__tests__/session-runner.test.ts` (489)
    - `plugins/sero-cron-plugin/extension/index.ts` (473)
    - `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts` (473)
    - `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx` (469)
    - `plugins/sero-memory-plugin/extension/memory-tool.ts` (466)
    - `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx` (466)
    - `plugins/sero-git-plugin/extension/git-service.ts` (457)
    - `plugins/sero-git-plugin/extension/git-commands.ts` (457)
    - `plugins/sero-user-feedback-plugin/extension/tui-questionnaire.ts` (416)
    - `plugins/sero-git-plugin/ui/components/BranchPanel.tsx` (421)
    - `plugins/sero-kanban-plugin/ui/components/DescriptionEditor.tsx` (405)
    - `plugins/sero-cron-plugin/extension/__tests__/reminder-actions.test.ts` (400)
- Largest folders by LOC in this scope:
  - `plugins/sero-cron-plugin/` (~8,218 LOC)
  - `plugins/sero-web-plugin/` (~7,370 LOC)
  - `apps/desktop/electron/features/kanban/` (~6,702 LOC)
  - `plugins/sero-memory-plugin/` (~6,238 LOC)
  - `plugins/sero-kanban-plugin/` (~6,032 LOC)
  - `plugins/sero-admin-plugin/` (~5,246 LOC)
- Generated-only / no-reviewable-source targets at baseline:
  - `apps/desktop/electron/gateway/` — only `web-dist/` assets
  - `plugins/sero-hello-world-plugin/` — only generated temp/build output; no
    source `package.json`

## Architectural notes
- `packages/common/src` and `packages/app-runtime/src` are the canonical
  host↔remote contract surfaces for built-in plugins and federated UIs. Any
  duplicate types or renderer/host boundary drift found later in plugin
  `shared/` folders should be fixed there first, not papered over per plugin.
- `apps/desktop/electron/cli/` is the AD-020 tool-bridge spine. `core/tool.ts`,
  `core/schema-bridge.ts`, and the command registries are high-risk because
  every bridged app/plugin tool ultimately flows through them.
- `apps/desktop/electron/features/kanban/` sits on the AD-018 + AD-020 +
  AD-021 intersection: container-backed execution, tool bridging, subagent
  review/planning flows, worktree lifecycle, and workspace coordination all
  meet there.
- Plugin ownership is heterogeneous rather than uniform:
  - UI-heavy: `sero-admin-plugin`, `sero-kanban-plugin`,
    `sero-user-feedback-plugin`
  - Extension-heavy: `sero-cron-plugin`, `sero-memory-plugin`,
    `sero-web-plugin`
  - Mixed extension/UI seams: `sero-git-plugin`, `sero-context-plugin`
  - Narrow provider/example packages: `sero-alibaba-plugin`,
    `sero-hello-world-plugin`
- `apps/desktop/electron/types/pi-coding-agent.d.ts` is a tiny augmentation
  seam, not a structural hotspot. It should review quickly once the heavier
  shared/package context is fresh.

## Runtime-sensitive surfaces
- Tool bridging and manifest-driven discovery must stay aligned with AD-020 and
  `docs/plugins/technical.md`: `electron/cli/**`, plugin `extension/index.ts`,
  `sero.plugin.bridgeTools`, and `sero.providers` metadata are one shared
  runtime contract.
- Federated UI boundaries live across `packages/app-runtime/src`,
  `packages/common/src`, plugin `shared/`, and plugin `ui/` host adapters.
  Future reviews need to watch for duplicate contracts and renderer-only
  assumptions leaking into shared packages.
- `apps/desktop/electron/features/kanban/**` is behavior-sensitive code: cleanup
  there can affect container startup, worktree maintenance, PR/review flows,
  and subagent orchestration even when types still compile.
- Generated output under `apps/desktop/electron/gateway/web-dist/` and plugin
  temp/build folders should remain out of scope unless real source is restored.

## Surprising discoveries
- There are no current 500+ LOC violations anywhere in this entire Phase 0
  scope. The debt is a broad near-cap cluster, not a single obvious hard-rule
  breach.
- `apps/desktop/electron/gateway/` and `plugins/sero-hello-world-plugin/` have
  no reviewable source after generated output is ignored, so they should be
  treated as scope-cleanup / no-op closeouts instead of normal deslopify passes.
- Plugin review load is concentrated in a handful of exemplar packages
  (`cron`, `web`, `memory`, `kanban`, `admin`), which validates the
  exemplar-first wave order in the tasklist.
- Baseline grep already shows type escape hatches in shared/runtime boundary
  code: `packages/app-runtime/src/context.ts:36`,
  `packages/app-runtime/src/widget-registry.ts:45`,
  `packages/app-runtime/src/sero-bridge.ts:97`,
  `apps/desktop/electron/cli/core/schema-bridge.ts:56-243`,
  `apps/desktop/electron/cli/core/tool.ts:431`,
  `apps/desktop/electron/cli/lib/gog-runner.ts:111-118`,
  `plugins/sero-context-plugin/extension/index.ts:122-127,305`, and
  `plugins/sero-web-plugin/ui/lib/host.ts:16`.
- Baseline grep found no active `localStorage` / `sessionStorage` usage under
  these targets, so storage-policy drift is not an immediate blocker in this
  wave.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total files: 342 (was 340)
- Total LOC: 54,134 (was 53,983)
- Shared packages: 16 files / 1,539 LOC (was 15 / 1,210)
- Residual desktop Electron seams: 85 files / 10,637 LOC (was 84 / 10,575)
- Largest file: `apps/desktop/electron/features/kanban/core/orchestrator.ts` (491 LOC)
- Files over 500 LOC: none

### What changed
- Cleared the Wave B High type-safety seam in `@sero-ai/app-runtime` by replacing boundary casts with typed globals/runtime guards.
- Cleared the Wave B High AD-020 typing seam in `electron/cli` and extracted `core/bridge-context.ts` to keep `schema-bridge.ts` under the 500-LOC cap.
- Added `packages/common/src/kanban.ts` as the neutral Kanban contract owner, removed the dead Kanban settings surface, and switched the host/plugin shared layers to consume that canonical module.
- Reconfirmed that `apps/desktop/electron/types` and `apps/desktop/electron/gateway` remain Wave B closeout/no-op targets rather than code-fix targets.

### Still outstanding
- `packages/common/src`: Medium canonical-contract work around model selection and provider manifests.
- `packages/app-runtime/src`: Medium `useAppState()` hardening and model-contract dedupe.
- `apps/desktop/electron/cli/`: Medium app-control dedupe and router splitting.
- `apps/desktop/electron/features/kanban/`: Medium workflow modularization and cleanup-failure visibility.
- Plugin exemplar `deslopify` wave is still next; no plugin folders beyond shared Kanban contract support have been reviewed yet.
