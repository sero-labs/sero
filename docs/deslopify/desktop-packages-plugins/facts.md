# Facts — desktop-packages-plugins

_Last reviewed: 2026-04-16_

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
  - Narrow provider/example packages: `sero-alibaba-plugin`
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
- `apps/desktop/electron/gateway/` has
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

## Post-fix snapshot — 2026-04-13 (Wave D / D1)

### Metrics after fixes
- Wave D High batch landed: **D1 — Persisted state integrity**
- Plugins touched in code: 5 (`sero-kanban`, `sero-cron`, `sero-memory`, `sero-git`, `sero-web`)
- New helper/test files added in this batch: 4
- Files over 500 LOC in touched source: none (`plugins/sero-cron-plugin/extension/index.ts` sits exactly at the 500-LOC cap after extracting `runtime-helpers.ts`)

### What changed
- Hardened persisted JSON reads across Kanban, Cron, Git, and Web so malformed state now fails closed instead of looking like first run.
- Stopped memory auto-consolidation from rewriting malformed cron state and surfaced a recovery-oriented tool/admin error instead.
- Added targeted persisted-state coverage where test harnesses already existed (`sero-kanban`, `sero-cron`, `sero-git`).
- Verified the batch with targeted plugin tests, targeted memory/web validation, and monorepo `pnpm typecheck`.

### Still outstanding
- **D2** canonical contract / bridge ownership remains next for `sero-admin`, `sero-git`, `sero-memory`, and `sero-web`.
- **D3** truthful UI→extension action ownership remains next for `sero-kanban`, `sero-web`, and `sero-context`.
- **D4** lifecycle/profile-home High items remain next for `sero-cron`, `sero-memory`, `sero-context`, `sero-user-feedback`, and `sero-web`.
- `plugins/sero-memory-plugin` still carries the mirrored cron persisted contract locally; D1 only cleared the fail-open corruption risk, not the ownership drift.

## Post-fix snapshot — 2026-04-13 (Wave D / D2)

### Metrics after fixes
- Wave D High batch landed: **D2 — Canonical contract / bridge ownership**
- Shared/host contracts moved to neutral owners in `@sero/common`
- Plugins with direct D2 code work: 4 (`sero-admin`, `sero-git`, `sero-memory`, `sero-web`)
- Cross-layer host files touched: app-runtime + preload + renderer desktop types + host Git manager/IPC

### What changed
- Added neutral shared owners for Git app action contracts, minimal shared cron persistence contracts, and the admin/web host bridge subset.
- Removed the admin plugin’s local `window.sero` contract copy and replaced it with a canonical shared bridge subset.
- Replaced the memory plugin’s mirrored cron persisted types with imports from the new neutral shared cron contract.
- Repointed the Git bridge across app-runtime, preload, IPC, host manager, desktop declarations, and the remote UI to one canonical shared contract.
- Replaced the web plugin’s local host-bridge subset with canonical shared host typing.

### Still outstanding
- **D3** truthful UI→extension action ownership is now the next High batch for `sero-kanban`, `sero-web`, and `sero-context`.
- **D4** lifecycle/profile-home semantics remain the next High batch for `sero-cron`, `sero-memory`, `sero-context`, `sero-user-feedback`, and `sero-web`.
- `plugins/sero-web-plugin` still has unresolved High ownership drift because the UI mutation paths themselves are still local even though the bridge typing is now canonical.
- `plugins/sero-memory-plugin` still has one remaining High item: the QMD `~/.pi/agent` fallback.

## Post-fix snapshot — 2026-04-13 (Wave D / D3)

### Metrics after fixes
- Wave D High batches landed so far: **D1 + D2 + D3**
- New cross-layer action bridge added: `webApp`
- Plugins with direct D3 code work: 2 (`sero-web`, `sero-context`)
- Plugin validated obsolete during D3: `sero-kanban` (the claimed UI review-action bypass is already covered by host-side state-transition effects)

### What changed
- Added a canonical `webApp` host action bridge so the Web UI no longer mutates history, bookmarks, or downloads by writing shared state directly.
- Routed the Web UI through one deterministic host action path that reuses the existing plugin state owner and added desktop tests for clear-history, download deletion, and workspace-boundary validation.
- Reworded Context refresh/tag/checkout affordances and README copy so prompt-routed actions are labeled honestly instead of looking deterministic.
- Validated that Kanban review decision side effects already run through desktop host watchers (`applyReviewActionEffects`) when the UI writes the board state, so that earlier D3 High finding is now obsolete rather than needing a new bridge.

### Still outstanding
- **D4** lifecycle/profile-home semantics are now the next High batch for `sero-cron`, `sero-memory`, `sero-context`, `sero-user-feedback`, and `sero-web`.
- `plugins/sero-web-plugin` still has one remaining High item: the `SERO_HOME` / `~/.pi` path drift.
- `plugins/sero-context-plugin` still has one remaining High item: truthful snapshot freshness / lifecycle ownership.
- `plugins/sero-memory-plugin` still has one remaining High item: the QMD `~/.pi/agent` fallback.

## Post-fix snapshot — 2026-04-14 (Wave D / D4)

### Metrics after fixes
- Wave D High batches landed: **D1 + D2 + D3 + D4**
- New plugin-local shared helper added: `plugins/sero-memory-plugin/extension/agent-dir.ts`
- New runtime recovery module added: `plugins/sero-cron-plugin/extension/recovery-runtime.ts`
- All documented plugin High batches are now cleared across the Wave D target set

### What changed
- Rebased memory/QMD and web-provider path ownership on Sero’s profile-scoped homes instead of legacy `~/.pi` fallbacks, while keeping legacy Web config/usage reads discoverable during migration.
- Moved cron missed-item recovery ahead of scheduler ticking so missed reminders/jobs update state once before normal processing and no longer double-fire on startup.
- Made the Context app snapshot lifecycle truthful by writing snapshots on session entry and after each agent run, not only when context tools execute.
- Removed onboarding ownership from the generic User Feedback remote and aligned Pi TUI questionnaire submission with the Sero UI’s partial-answer contract.

### Still outstanding
- Wave F batch **E1** is now complete; the next backlog is **Wave F / E2–E5 Medium execution** using the dependency-ordered batches in `docs/deslopify/desktop-packages-plugins/plan.md`.
- Notable Medium carryovers remain: residual CLI/Kanban cap relief, cron reminder mutation ownership/logging, memory startup migration + tests, context projection dedupe + extension quality gate, user-feedback canonical transport ownership, and web package-local extension coverage/module splitting.

## Post-fix snapshot — 2026-04-14 (Wave F / E4)

### Metrics after fixes
- Wave F batches landed: **E1 + E2 + E3 + E4**
- New shared runtime-owner modules added in this batch: `plugins/sero-cron-plugin/shared/reminder-mutations.ts`, `plugins/sero-context-plugin/extension/context-projection.ts`, `plugins/sero-memory-plugin/extension/{state-paths.ts,json-state.ts,log-writer.ts,phase1-migration-state.ts}`
- Targeted validation: cron/git/context/kanban plugin tests, memory package-local typecheck, and monorepo `pnpm typecheck` all pass

### What changed
- Centralized cron reminder mutation semantics in one shared pure helper layer and removed the stale UI/docs email path so the human and tool reminder contracts match again.
- Removed the memory plugin’s duplicate phase-1 migration pass and moved its config/debug persistence onto shared async helpers instead of sync hot-path filesystem calls.
- Rebased Git `log` / `branches` on the repo-backed refresh path, extracted a shared Context projection owner for both `context_log` and snapshots, and made Kanban cleanup failures visible in tool output plus the board error log.

### Still outstanding
- Wave F batch **E5** is now the next execution step for the remaining UI-heavy plugin Medium items.
- Medium carryovers still include cron logging/modularization/UI coverage, memory test-surface work, git file splitting/UI coverage, kanban settings/UI splits, web provider/module cleanup, admin session/UI cleanup, and user-feedback state-machine/file-splitting work.

## Post-fix snapshot — 2026-04-14 (Wave F / E5, plugin-by-plugin start)

### Metrics after fixes
- Wave F batches landed: **E1 + E2 + E3 + E4**, plus the first plugin-scoped **E5** closeout
- E5 plugin cleared in this pass: `plugins/sero-kanban-plugin`
- New focused UI/shared modules added in this pass: `plugins/sero-kanban-plugin/shared/settings-descriptor.ts`, `plugins/sero-kanban-plugin/ui/components/{CardDetailSections.tsx,ActivityPanelFeeds.tsx,useDescriptionEditorState.ts}`
- Targeted validation: Kanban package tests + package-local typecheck + monorepo `pnpm typecheck` all pass

### What changed
- Switched Wave F / E5 execution to a **one plugin at a time** cadence to keep context bounded while the remaining UI-heavy plugin cleanups land.
- Cleared the Kanban plugin’s remaining Medium work by aligning the tool/UI settings surface, splitting the largest remaining UI hubs, deleting dead add-card scaffolding, and adding direct UI coverage.
- Updated tracking so `plugins/sero-kanban-plugin` is now closed out while the remaining E5 plugins stay queued explicitly in tasklist order.

### Still outstanding
- Remaining E5 plugins, in order: `plugins/sero-admin-plugin`, `plugins/sero-git-plugin`, `plugins/sero-web-plugin`, `plugins/sero-user-feedback-plugin`, `plugins/sero-cron-plugin`.
- `plugins/sero-memory-plugin` still has non-E5 Medium follow-up work (test-surface expansion), but it is not part of the current UI-composition batch.

## Post-fix snapshot — 2026-04-14 (Wave F / E5, admin complete)

### Metrics after fixes
- Wave F batches landed: **E1 + E2 + E3 + E4**, plus plugin-scoped **E5** closeouts for `plugins/sero-kanban-plugin` and `plugins/sero-admin-plugin`
- New focused admin modules added in this pass: `plugins/sero-admin-plugin/ui/hooks/{host,useProfiles,useConfigFile,useSessionFiles,useBridgeRefresh}.ts`, `plugins/sero-admin-plugin/ui/lib/{auth-refresh,plugins,session-log}.ts`
- Targeted validation: admin package typecheck/tests, monorepo `pnpm typecheck`, and `apps/desktop pnpm test` all pass

### What changed
- Cleared the admin plugin’s remaining Medium work by splitting the old host/session hook hub, making the session browser reuse already-loaded session metadata, surfacing malformed JSONL diagnostics, deduplicating auth/model refresh wiring, and deleting dead provider-defaults scaffolding.
- Added focused package-local coverage for auth refresh filtering, session-log parsing, and plugin-manager normalization so the admin plugin now has direct safety nets beyond the earlier skill-visibility helper coverage.
- Updated tracking so `plugins/sero-admin-plugin` is now closed out while the remaining E5 plugins stay queued explicitly in tasklist order.

### Still outstanding
- Remaining E5 plugins, in order: `plugins/sero-git-plugin`, `plugins/sero-web-plugin`, `plugins/sero-user-feedback-plugin`, `plugins/sero-cron-plugin`.
- `plugins/sero-memory-plugin` still has non-E5 Medium follow-up work (test-surface expansion), but it is not part of the current UI-composition batch.

## Post-fix snapshot — 2026-04-14 (Wave F / E5, git complete)

### Metrics after fixes
- Wave F batches landed: **E1 + E2 + E3 + E4**, plus plugin-scoped **E5** closeouts for `plugins/sero-kanban-plugin`, `plugins/sero-admin-plugin`, and `plugins/sero-git-plugin`
- New focused Git modules added in this pass: `plugins/sero-git-plugin/extension/{git-service-core.ts,git-service-query-actions.ts,git-service-mutation-actions.ts,git-command-support.ts,git-log-queries.ts,git-status-queries.ts,git-diff-queries.ts}`, `plugins/sero-git-plugin/ui/components/{BranchPanelSections.tsx,BranchPanelRows.tsx}`
- Targeted validation: git package typecheck/tests, monorepo `pnpm typecheck`, and `apps/desktop pnpm test` all pass

### What changed
- Cleared the Git plugin’s remaining Medium work by splitting the near-cap service/parser/sidebar modules below the hotspot cluster while preserving the existing host-facing entrypoints.
- Added direct UI coverage for Git bridge notices, branch/worktree destructive-action wiring, cherry-pick confirmation, commit gating, and staged/unstaged diff selection, plus a shared bridge-contract guard for `force` / `worktreePath`.
- Updated tracking so `plugins/sero-git-plugin` is now closed out while the remaining E5 plugins stay queued explicitly in tasklist order.

### Still outstanding
- Remaining E5 plugins, in order: `plugins/sero-web-plugin`, `plugins/sero-user-feedback-plugin`, `plugins/sero-cron-plugin`.
- `plugins/sero-memory-plugin` still has non-E5 Medium follow-up work (test-surface expansion), but it is not part of the current UI-composition batch.

## Post-fix snapshot — 2026-04-14 (Wave F / E5, web complete)

### Metrics after fixes
- Wave F batches landed: **E1 + E2 + E3 + E4**, plus plugin-scoped **E5** closeouts for `plugins/sero-kanban-plugin`, `plugins/sero-admin-plugin`, `plugins/sero-git-plugin`, and `plugins/sero-web-plugin`
- New focused Web modules added in this pass: `plugins/sero-web-plugin/extension/{gemini-web-config.ts,gemini-web-email.ts,gemini-web-response.ts,gemini-search-config.ts,gemini-search-format.ts,video-config.ts,video-gemini-files.ts,youtube-config.ts,youtube-media.ts,rsc-chunks.ts}`
- Targeted validation: web package typecheck/tests, monorepo `pnpm typecheck`, and `apps/desktop pnpm test` all pass

### What changed
- Cleared the Web plugin’s remaining Medium work by splitting the near-cap provider/extractor hubs below the hotspot cluster while keeping the existing public entrypoints stable.
- Expanded the package-local extension quality gate so the provider/extractor seams now compile directly and added focused helper tests for Gemini Web parsing, Gemini Search prompt/source formatting, YouTube URL detection, and RSC markdown extraction.
- Updated tracking so `plugins/sero-web-plugin` is now closed out while the remaining E5 plugins stay queued explicitly in tasklist order.

### Still outstanding
- Remaining E5 plugins, in order: `plugins/sero-user-feedback-plugin`, `plugins/sero-cron-plugin`.
- `plugins/sero-memory-plugin` still has non-E5 Medium follow-up work (test-surface expansion), but it is not part of the current UI-composition batch.

## Post-fix snapshot — 2026-04-14 (Wave F / E5, user-feedback complete)

### Metrics after fixes
- Wave F batches landed: **E1 + E2 + E3 + E4**, plus plugin-scoped **E5** closeouts for `plugins/sero-kanban-plugin`, `plugins/sero-admin-plugin`, `plugins/sero-git-plugin`, `plugins/sero-web-plugin`, and `plugins/sero-user-feedback-plugin`
- New focused user-feedback modules added in this pass: `plugins/sero-user-feedback-plugin/shared/questionnaire-flow.ts`, `plugins/sero-user-feedback-plugin/extension/tui-questionnaire-render.ts`, `plugins/sero-user-feedback-plugin/ui/questionnaire/{QuestionnaireQuestionStep.tsx,QuestionnaireReviewStep.tsx}`
- Targeted validation: user-feedback package `typecheck` + `test`, monorepo `pnpm typecheck`, and `apps/desktop pnpm test` all pass

### What changed
- Cleared the user-feedback plugin’s remaining Medium work by extracting one shared questionnaire-flow owner, splitting the near-cap questionnaire UI/TUI hubs into focused modules, and keeping the partial-answer contract aligned across the Sero UI and Pi TUI.
- Added package-local regression coverage for questionnaire parity, interview result aggregation/cancel behavior, permission-gate timeout plus workspace-delete exemptions, direct `QuestionnaireForm` partial-submit behavior, and `UserFeedbackApp` queue hydration/clear behavior.
- Updated tracking so `plugins/sero-user-feedback-plugin` is now closed out while only `plugins/sero-cron-plugin` remains in the E5 queue.

### Still outstanding
- Remaining E5 plugins, in order: `plugins/sero-cron-plugin`.
- `plugins/sero-memory-plugin` still has non-E5 Medium follow-up work (test-surface expansion), but it is not part of the current UI-composition batch.

## Post-fix snapshot — 2026-04-14 (Wave F / E5, cron complete)

### Metrics after fixes
- Wave F batches landed: **E1 + E2 + E3 + E4**, plus plugin-scoped **E5** closeouts for `plugins/sero-kanban-plugin`, `plugins/sero-admin-plugin`, `plugins/sero-git-plugin`, `plugins/sero-web-plugin`, `plugins/sero-user-feedback-plugin`, and `plugins/sero-cron-plugin`
- New focused cron modules added in this pass: `plugins/sero-cron-plugin/extension/{runtime.ts,tools.ts}`, `plugins/sero-cron-plugin/ui/components/{CronAppHeader.tsx,CronTabs.tsx,JobsTab.tsx}`
- Targeted validation: cron package tests, monorepo `pnpm typecheck`, and `apps/desktop pnpm test` all pass

### What changed
- Cleared the cron plugin’s remaining Medium work by moving logger file writes onto a visible async queue, splitting the old singleton entrypoint into focused runtime/tool modules, and adding direct `CronApp` / `CronWidget` coverage under the package test gate.
- Updated tracking so the Wave F / E5 plugin-by-plugin queue is now fully empty.
- Preserved the low-priority widget-fidelity note as deferred polish rather than folding a behavior change into the cap-pressure batch.

### Still outstanding
- Wave F / E5 is complete for the queued plugin set.
- `plugins/sero-memory-plugin` still has non-E5 Medium follow-up work (test-surface expansion), and `apps/desktop/electron/{types,gateway}` remain documented no-op Medium closeouts unless real source changes.

## Post-fix snapshot — 2026-04-14 (Wave F / memory test surface)

### Metrics after fixes
- Wave F plugin code batches are now fully landed, including the non-E5 `plugins/sero-memory-plugin` Medium test-surface follow-up
- New package-local memory test harness files added in this pass: `plugins/sero-memory-plugin/vitest.config.ts` plus 5 focused `extension/__tests__` modules
- Targeted validation: memory package `test` + `typecheck`, monorepo `pnpm typecheck`, and `cd apps/desktop && pnpm test` all pass

### What changed
- Cleared the last remaining code-bearing Medium item in this cross-cutting plan by adding focused package-local coverage for the memory plugin’s highest-risk runtime seams without changing shipped behavior.
- Added direct regression tests for malformed cron sync refusal, profile-scoped agent/QMD/session-store paths, phase-1 migration state reuse, memory CRUD/capacity semantics, and transcript export stability.
- Left the remaining tracked follow-up as documentation-only no-op closeouts for `apps/desktop/electron/{types,gateway}` rather than inventing churn in healthy/generated-only folders.

### Still outstanding
- Only the documented no-op Medium closeouts for `apps/desktop/electron/{types,gateway}` remain in this plan unless real source returns there.
- Low follow-up remains deferred across the reviewed targets.

## Post-fix snapshot — 2026-04-14 (Wave F / electron types closeout)

### Metrics after fixes
- Wave F code-bearing work remains fully complete; this pass only closed one documented no-op tracker item
- `apps/desktop/electron/types/` still contains 1 reviewable source file / 11 LOC and no 500+ LOC hotspots
- Targeted validation: source-shape verification, monorepo `pnpm typecheck`, and `cd apps/desktop && pnpm test` all pass

### What changed
- Reconfirmed that `apps/desktop/electron/types/` still contains only the narrow `systemPromptSuffix` Pi SDK augmentation and that its single AD-021 consumer remains truthful.
- Closed the `apps/desktop/electron/types/` tracker item as a documentation-only no-op instead of manufacturing source churn in a healthy seam.
- Narrowed the remaining Wave F backlog to the final generated-only `apps/desktop/electron/gateway/` closeout.

### Still outstanding
- Only the documented no-op closeout for `apps/desktop/electron/gateway/` remains in this plan unless real source returns there.
- Low follow-up remains deferred across the reviewed targets.

## Post-fix snapshot — 2026-04-14 (Wave F / electron gateway closeout)

### Metrics after fixes
- Wave F execution is now fully closed, including both documented no-op desktop closeouts (`apps/desktop/electron/types` and `apps/desktop/electron/gateway`)
- `apps/desktop/electron/gateway/` still contains 0 reviewable source files and the same 3 generated `web-dist/` assets
- Targeted validation: source-shape verification, monorepo `pnpm typecheck`, and `cd apps/desktop && pnpm test` all pass

### What changed
- Reconfirmed that `apps/desktop/electron/gateway/` still contains only generated `web-dist/` output and no reviewable source.
- Closed the final remaining tracked Wave F item as a documentation-only no-op; no source changes were needed for this folder.
- With this closeout, the `desktop-packages-plugins` execution map no longer has any remaining High or Medium tracked items.

### Still outstanding
- Only deferred Low follow-up remains across the reviewed targets.
- Re-run Phase 0 for `apps/desktop/electron/gateway/` if maintainable source returns there.

## Post-fix snapshot — 2026-04-16 (cross-cutting low-polish closeout)

### Metrics after fixes
- Docs-only closeout pass; no source files changed in this baseline
- High tracked items: none (unchanged)
- Medium tracked items: none (unchanged)
- Low tracker status: retired for this cross-cutting baseline

### What changed
- Retired the deferred Low-polish tracker for `desktop-packages-plugins` so this baseline no longer appears as outstanding backlog.
- Updated plan/index tracking to mark this cross-cutting baseline fully closed.

### Still outstanding
- None in this baseline.
