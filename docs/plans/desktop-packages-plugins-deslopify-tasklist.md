# Desktop Packages + Plugins Deslopify Tasklist

_Last updated: 2026-04-14_

Core-first checklist for reviewing and cleaning up the remaining desktop-adjacent
source areas outside the original `apps/desktop` wave, plus every Sero plugin,
without losing sequencing discipline.

## Scope

### Remaining desktop / shared package targets
- `apps/desktop/electron/cli/`
- `apps/desktop/electron/gateway/`
- `apps/desktop/electron/types/`
- `apps/desktop/electron/features/kanban/`
- `packages/app-runtime/src`
- `packages/common/src`

### Plugin targets
- `plugins/sero-admin-plugin/`
- `plugins/sero-alibaba-plugin/`
- `plugins/sero-context-plugin/`
- `plugins/sero-cron-plugin/`
- `plugins/sero-git-plugin/`
- `plugins/sero-hello-world-plugin/`
- `plugins/sero-kanban-plugin/`
- `plugins/sero-memory-plugin/`
- `plugins/sero-user-feedback-plugin/`
- `plugins/sero-web-plugin/`

## Working Rules

- Analyze shared contracts and shared runtime packages before feature folders.
- Finish a full **deslopify wave** before starting the matching **fix-slop wave**.
- Default `fix-slop` scope: **High only** unless explicitly expanded.
- Re-analyze downstream plugin/UI areas after shared High items are fixed.
- Keep plugin reviews grounded in the real package structure: extension, UI,
  shared types, docs drift, and host integration boundaries.
- Ignore generated output, build artifacts, and vendored files.

## Phase 0 — Baseline Map

- [x] Capture current hotspot inventory for all folders in scope
- [x] Note files over the 500 LOC cap
- [x] Note likely contract and ownership hotspots across shared packages,
      desktop Electron seams, and plugin extension/UI boundaries
- [x] Confirm review order before starting

## Wave A — Deslopify Shared Contracts and Runtime Foundations

### 1. Shared package foundations
- [x] `deslopify packages/common/src`
- [x] `deslopify packages/app-runtime/src`

### 2. Residual desktop contract / platform seams
- [x] `deslopify apps/desktop/electron/types`
- [x] `deslopify apps/desktop/electron/cli`
- [x] `deslopify apps/desktop/electron/gateway`
- [x] `deslopify apps/desktop/electron/features/kanban`

## Wave B — Fix Shared/Desktop High-Priority Findings

- [x] Review all Wave A plans together for cross-cutting themes
- [x] Group fixes into coherent `fix-slop` batches
- [x] `fix-slop` High items for `packages/common/src`
- [x] `fix-slop` High items for `packages/app-runtime/src`
- [x] `fix-slop` High items for `apps/desktop/electron/types`
- [x] `fix-slop` High items for `apps/desktop/electron/cli`
- [x] `fix-slop` High items for `apps/desktop/electron/gateway`
- [x] `fix-slop` High items for `apps/desktop/electron/features/kanban`
- [x] Run `pnpm typecheck` after each batch and keep notes linked from the
      relevant plan

## Wave C — Deslopify Plugin Platform Exemplars First

Review the most host-coupled / architecture-setting plugins first so later
plugin reviews can treat their patterns as either good examples or debt to stop
copying.

### 3. Core plugin exemplars
- [x] `deslopify plugins/sero-kanban-plugin`
- [x] `deslopify plugins/sero-cron-plugin`
- [x] `deslopify plugins/sero-admin-plugin`
- [x] `deslopify plugins/sero-memory-plugin`

### 4. Additional host-integrated plugins
- [x] `deslopify plugins/sero-git-plugin`
- [x] `deslopify plugins/sero-context-plugin`
- [x] `deslopify plugins/sero-web-plugin`
- [x] `deslopify plugins/sero-user-feedback-plugin`

## Wave D — Fix Plugin High-Priority Findings

- [x] Review all Wave C plans together for repeated plugin architecture issues
- [x] Group fixes into coherent `fix-slop` batches by shared pattern, not by
      folder name

### Wave D batch map

Use the shared-pattern batches below as the real execution order. The
plugin-specific checkboxes that follow are **closeout markers** only — mark a
plugin done when all of its High items are cleared across every batch it joins.

| Batch | Targets | Shared pattern |
| --- | --- | --- |
| **D1 — Persisted state integrity** | `sero-kanban`, `sero-cron`, `sero-memory`, `sero-git`, `sero-web` | Fail-closed reads for board/error/state files and any shared persisted-contract seams so malformed JSON never gets silently rewritten away |
| **D2 — Canonical contract / bridge ownership** | `sero-admin`, `sero-git`, `sero-memory`, `sero-web` | Remove narrowed/local host-contract copies and converge shared action/persisted contracts on neutral owners |
| **D3 — Truthful UI→extension action ownership** | `sero-kanban`, `sero-web`, `sero-context` | Route side-effectful UI actions through the truthful extension/host path or label prompt-routed/manual behavior honestly |
| **D4 — Sero-first lifecycle + profile-home semantics** | `sero-cron`, `sero-memory`, `sero-context`, `sero-user-feedback`, `sero-web` | Fix startup/session lifecycle truthfulness, questionnaire/onboarding ownership, dashboard freshness semantics, and `SERO_HOME`/agent-dir path ownership |

- [x] `fix-slop` High items for `plugins/sero-kanban-plugin`
- [x] `fix-slop` High items for `plugins/sero-cron-plugin`
- [x] `fix-slop` High items for `plugins/sero-admin-plugin`
- [x] `fix-slop` High items for `plugins/sero-memory-plugin`
- [x] `fix-slop` High items for `plugins/sero-git-plugin`
- [x] `fix-slop` High items for `plugins/sero-context-plugin`
- [x] `fix-slop` High items for `plugins/sero-web-plugin`
- [x] `fix-slop` High items for `plugins/sero-user-feedback-plugin`
- [x] Run targeted package/plugin tests plus monorepo `pnpm typecheck` after
      each batch

## Wave E — Medium-Priority Cleanup Planning

- [x] Identify all Medium findings from Waves A–D and consolidate them into a
      dependency-ordered backlog
- [x] Start with shared package Medium items still affecting multiple desktop
      areas or multiple plugins
- [x] Then do residual desktop Electron Medium items
- [x] Then do plugin-level Medium items, grouped by repeated concerns
      (contracts, runtime lifecycle, UI composition, storage, docs drift)
- [x] Leave Low items for opportunistic cleanup or dedicated polish passes

### Wave E batch map

Use these batches as the real execution order for Wave F. A target can appear in
multiple batches; the per-folder checkboxes in Wave F are **closeout markers**
only. `apps/desktop/electron/types` and `apps/desktop/electron/gateway` are
Medium no-op closeouts, and docs/help drift should ship inside the owning batch
instead of as a standalone pass.

| Batch | Targets | Shared concern |
| --- | --- | --- |
| **E1 — Shared contract ownership + runtime reliability** | `packages/common/src`, `packages/app-runtime/src` | Canonical model/provider contracts, data-first warning payloads, and a truthful `useAppState()` failure/lifecycle policy before downstream plugin bridge work |
| **E2 — Residual desktop Electron seam relief** | `apps/desktop/electron/cli`, `apps/desktop/electron/features/kanban` | Cap-relief and ownership cleanup on the AD-020 CLI seam and the host Kanban workflow/runtime helpers |
| **E3 — Plugin contract / bridge ownership + quality gates** | `sero-admin`, `sero-user-feedback`, `sero-web`, `sero-context` | Neutralize mirrored host/plugin contracts, move shared helpers to neutral owners, and expand package-local typecheck/tests beyond UI-only coverage |
| **E4 — Plugin runtime lifecycle + storage semantics** | `sero-cron`, `sero-memory`, `sero-git`, `sero-context`, `sero-kanban` | Reminder/state/runtime truthfulness, projection/helper dedupe, fail-visible cleanup/logging, and repo-backed or single-owner runtime behavior |
| **E5 — Plugin UI composition + cap-pressure relief** | `sero-kanban`, `sero-admin`, `sero-git`, `sero-web`, `sero-user-feedback`, `sero-cron` | Split near-cap UI/entrypoint hubs, add direct component coverage, remove dead scaffolding, and align settings/help surfaces after the contract/runtime batches stabilize |

## Wave F — Medium Cleanup Execution

Treat the checklist below as **closeout markers**. Execute the Wave E batch map
in order and only mark a target done after all of its Medium items are cleared
across every batch it participates in.

### 6. Shared + desktop mediums first
- [x] `fix-slop` Medium items for `packages/common/src`
- [x] `fix-slop` Medium items for `packages/app-runtime/src`
- [x] `fix-slop` Medium items for `apps/desktop/electron/types` _(no Medium findings; closeout only)_
- [x] `fix-slop` Medium items for `apps/desktop/electron/cli`
- [x] `fix-slop` Medium items for `apps/desktop/electron/gateway` _(generated-only; no Medium findings)_
- [x] `fix-slop` Medium items for `apps/desktop/electron/features/kanban`

### 7. Plugin mediums after shared patterns stabilize
- [x] `fix-slop` Medium items for `plugins/sero-kanban-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-cron-plugin`
- [x] `fix-slop` Medium items for `plugins/sero-admin-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-memory-plugin`
- [x] `fix-slop` Medium items for `plugins/sero-git-plugin`
- [x] `fix-slop` Medium items for `plugins/sero-context-plugin`
- [x] `fix-slop` Medium items for `plugins/sero-web-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-user-feedback-plugin`

## Wave G — Final Periphery / Drift Sweep

- [ ] Review whether any plugin docs / templates / examples drifted from the
      final architecture after fixes
- [ ] Do a final sweep for stale `docs/deslopify/index.md` entries
- [ ] Do a final sweep for stale `docs/plans/index.md` entries
- [ ] Verify each reviewed folder has the expected `facts.md` / `plan.md` pair
- [ ] Run final monorepo `pnpm typecheck`

## Current Rationale

Follow this dependency direction:

1. Shared contracts and runtime packages
2. Remaining desktop Electron seams
3. Plugin exemplars with the deepest host coupling
4. Remaining plugins
5. Medium cleanup and documentation drift

That keeps us from fixing repeated plugin symptoms before fixing the shared
runtime, contract, or desktop-side code that those plugins consume.

## Progress Notes

- 2026-04-13: Tasklist created to cover the remaining unreviewed desktop-adjacent
  folders (`electron/cli`, `electron/gateway`, `electron/types`,
  `electron/features/kanban`), shared runtime packages (`packages/app-runtime/src`,
  `packages/common/src`), and every plugin under `plugins/sero-*-plugin/`.
- 2026-04-13: Phase 0 baseline map completed via deslopify. Hotspot inventory +
  review-order confirmation are documented at
  `docs/deslopify/desktop-packages-plugins/{facts.md,plan.md}`; the baseline also
  confirmed that `apps/desktop/electron/gateway/` and
  `plugins/sero-hello-world-plugin/` are currently generated-only / no-source
  closeout targets rather than full review surfaces.
- 2026-04-13: Wave A step 1 complete for `packages/common/src` and
  `packages/app-runtime/src`. Facts + plans added under
  `docs/deslopify/packages/**`; headline findings: `@sero/common` is healthy but
  still does not fully own shared plugin/provider/model contracts, while
  `@sero-ai/app-runtime` has three High-priority boundary type escape hatches
  (`globalThis` singletons + `window.sero` access) plus a reliability follow-up
  for optimistic `useAppState()` writes.
- 2026-04-13: Wave A step 2.1 complete for `apps/desktop/electron/types`.
  Facts + plan added at `docs/deslopify/apps/desktop/electron/types/{facts,plan}.md`;
  result: healthy narrow Pi SDK augmentation seam, with only a Low follow-up to
  remove the local `systemPromptSuffix` patch once upstream typings catch up.
- 2026-04-13: Wave A step 2.2 complete for `apps/desktop/electron/gateway`.
  Facts + plan added at `docs/deslopify/apps/desktop/electron/gateway/{facts,plan}.md`;
  result: generated-only closeout confirmed (`web-dist/**` only), so real
  gateway cleanup continues to live under
  `apps/desktop/electron/features/gateway/**`.
- 2026-04-13: Wave A step 2.3 complete for `apps/desktop/electron/cli`.
  Facts + plan added at `docs/deslopify/apps/desktop/electron/cli/{facts,plan}.md`;
  result: the AD-020 bridge is structurally solid and well-tested, but it still
  has a High-priority type-safety seam in `schema-bridge.ts` / `core/tool.ts` /
  `gog-runner.ts`, plus Medium follow-ups to dedupe app-control and split the
  near-cap command/router hubs.
- 2026-04-13: Wave A step 2.4 complete for
  `apps/desktop/electron/features/kanban`.
  Facts + plan added at
  `docs/deslopify/apps/desktop/electron/features/kanban/{facts,plan}.md`;
  result: the runtime is broadly modular, but the top High finding is contract
  truthfulness — several declared/user-visible settings (`maxConcurrentCards`,
  `requireApproval.*`, `reviewLevel`) are not enforced by the host, and shared
  Kanban state ownership should move out of duplicated host/plugin types into a
  neutral shared contract.
- 2026-04-13: Wave A is now fully deslopified across the shared packages and
  residual desktop seams. Next up: Wave B synthesis and High-only `fix-slop`
  batching across the newly documented plans.
- 2026-04-13: Wave B synthesis complete. Grouped High-only batches are recorded
  in `docs/deslopify/desktop-packages-plugins/plan.md` (B1 shared/CLI boundary
  typing; B2 Kanban contract truthfulness). `packages/common/src`,
  `apps/desktop/electron/types`, and `apps/desktop/electron/gateway` had no
  direct High code work and were treated as Wave B closeouts rather than forced
  churn.
- 2026-04-13: Wave B High fixes landed. Highlights: app-runtime boundary escape
  hatches removed; CLI bridge typing hardened via `core/bridge-context.ts`;
  canonical Kanban card/state/validation ownership moved to
  `packages/common/src/kanban.ts`; dead Kanban settings surface removed from the
  host/plugin flows. Targeted desktop/plugin tests plus monorepo
  `pnpm typecheck` all pass.
- 2026-04-13: Wave C step 3.1 complete for `plugins/sero-kanban-plugin`.
  Facts + plan added at
  `docs/deslopify/plugins/sero-kanban-plugin/{facts,plan}.md`; result: the
  plugin remains a strong exemplar for manifest/build/shared-contract wiring,
  but the top High findings are runtime truthfulness issues — the UI can bypass
  extension-owned review side effects, and board/error-log reads still fail open
  on malformed JSON.
- 2026-04-13: Wave C step 3.2 complete for `plugins/sero-cron-plugin`.
  Facts + plan added at
  `docs/deslopify/plugins/sero-cron-plugin/{facts,plan}.md`; result: the
  plugin is structurally healthy, but the top High findings are runtime
  truthfulness defects — startup reminder recovery can double-fire notifications,
  and fail-open `state.json` reads can silently wipe the global scheduler state
  on the next successful write.
- 2026-04-13: Wave C step 3.3 complete for `plugins/sero-admin-plugin`.
  Facts + plan added at
  `docs/deslopify/plugins/sero-admin-plugin/{facts,plan}.md`; result: the
  admin surface remains correctly UI-only, but the top High finding is boundary
  truthfulness — `ui/hooks/useSeroFiles.ts` duplicates and narrows the canonical
  `window.sero` contract, and the host still imports admin-owned
  `skill-visibility` helpers that should move to a neutral shared home.
- 2026-04-13: Wave C step 3.4 complete for `plugins/sero-memory-plugin`.
  Facts + plan added at
  `docs/deslopify/plugins/sero-memory-plugin/{facts,plan}.md`; result: the
  extension is structurally modular, but the top High findings are boundary
  truthfulness defects — auto-consolidation rewrites cron state through a local
  mirrored contract, and QMD still has a Sero-incompatible `~/.pi/agent`
  fallback that can split profile-scoped search/transcript data.
- 2026-04-13: Wave C step 4.1 complete for `plugins/sero-git-plugin`.
  Facts + plan added at
  `docs/deslopify/plugins/sero-git-plugin/{facts,plan}.md`; result: the
  plugin is structurally healthy and well-tested, but the top High findings are
  host-boundary truthfulness defects — the canonical Git action contract has
  already drifted across app-runtime/preload/UI layers, and fail-open
  state-file reads can silently replace real snapshots with defaults.
- 2026-04-13: Wave C step 4.2 complete for `plugins/sero-context-plugin`.
  Facts + plan added at
  `docs/deslopify/plugins/sero-context-plugin/{facts,plan}.md`; result: the
  package is small and coherent, but the top High findings are truthfulness
  defects — the dashboard is not actually real-time, and the UI's tag/checkout
  actions are prompt-routed agent requests presented as direct interactions.
- 2026-04-13: Wave C step 4.3 complete for `plugins/sero-web-plugin`.
  Facts + plan added at
  `docs/deslopify/plugins/sero-web-plugin/{facts,plan}.md`; result: the
  plugin is feature-rich but currently has three top High findings —
  fail-open `state.json` reads can silently wipe persisted web activity,
  provider/config paths still drift to a Sero-incompatible `~/.pi` fallback,
  and the UI bypasses extension-owned mutation paths for bookmarks/history/
  downloads.
- 2026-04-13: Wave C step 4.4 complete for
  `plugins/sero-user-feedback-plugin`. Facts + plan added at
  `docs/deslopify/plugins/sero-user-feedback-plugin/{facts,plan}.md`; result:
  this core communication plugin is still small and structurally coherent, but
  it now has two clear High-priority truthfulness/ownership findings —
  `questionnaire` completion semantics drift between the Sero UI and Pi CLI TUI,
  and the generic remote UI incorrectly owns profile onboarding lifecycle state.
- 2026-04-13: Wave D synthesis complete. Cross-plugin High findings are now
  grouped by shared pattern in `docs/deslopify/desktop-packages-plugins/plan.md`
  rather than by folder: **D1** persisted state integrity,
  **D2** canonical contract/bridge ownership,
  **D3** truthful UI→extension action ownership, and
  **D4** Sero-first lifecycle/profile-home semantics.
- 2026-04-13: Wave D batch **D1 — Persisted state integrity** landed in
  `336b790a` (`fix(plugins): harden persisted state integrity`). Covered:
  fail-closed Kanban board/error-log reads, fail-closed Cron/Git/Web state
  reads, and a fail-closed guard on memory-plugin cron auto-consolidation.
  Targeted plugin tests plus monorepo `pnpm typecheck` passed.
- 2026-04-13: Wave D batch **D2 — Canonical contract / bridge ownership**
  landed in `d885ff2d` (`refactor(contracts): centralize plugin bridge
  ownership`). Covered: neutral shared Git app contracts in `@sero/common`,
  canonical admin/web host bridge subsets, and neutral shared cron persistence
  types consumed by cron + memory. Targeted package typechecks, Git plugin
  tests, and monorepo `pnpm typecheck` passed.
- 2026-04-13: Wave D batch **D3 — Truthful UI→extension action ownership**
  landed in `ff4e460a` (`fix(plugins): make web and context actions
  truthful`). Covered: a canonical `webApp` host action bridge for Web UI
  mutations, truthful prompt-routed labeling in Context UI/README, and
  Kanban D3 closeout after validating that host-side review-action effects
  already fire on UI state transitions. Targeted desktop tests, plugin
  typechecks, and monorepo `pnpm typecheck` passed.
- 2026-04-14: Wave D batch **D4 — Sero-first lifecycle + profile-home
  semantics** landed across `a3f625be` (`fix(plugins): align profile-scoped
  path ownership`) and `aa301f95` (`fix(plugins): make lifecycle semantics
  sero-first`). Covered: memory/web profile-home semantics, cron startup
  recovery truthfulness, Context snapshot freshness, and User Feedback
  onboarding/questionnaire parity. Targeted cron tests, package typechecks,
  targeted extension compiles, desktop user-feedback tests, and monorepo
  `pnpm typecheck` passed.
- 2026-04-14: Wave E synthesis complete. The remaining Medium findings are now
  consolidated into dependency-ordered batches in
  `docs/deslopify/desktop-packages-plugins/plan.md` and mirrored here as the
  Wave E batch map: shared package contract/runtime owners first, then residual
  Electron seam relief, then plugin batches grouped by contract ownership,
  runtime/storage semantics, and UI cap-pressure/coverage. `electron/types` and
  `electron/gateway` are Medium no-op closeouts; docs/help drift stays attached
  to the behavior batch that changes it.
- 2026-04-14: Wave F batch **E1 — Shared contract ownership + runtime
  reliability** landed across `1486f968` (`refactor(common): split model
  contracts and provider manifests`) and `b145471f` (`refactor(app-runtime):
  harden shared state and widget runtime`). Covered: `@sero/common`
  model-selection split + data-first warning formatting + canonical
  `sero.providers` contracts, plus app-runtime model-contract dedupe,
  `useAppState()` failure recovery, widget-registration idempotence, and focused
  desktop tests. Targeted Vitest coverage plus monorepo `pnpm typecheck`
  passed.
- 2026-04-14: Wave F batch **E2 — Residual desktop Electron seam relief**
  landed across `a917905a` (`refactor(cli): split batch runtime and google
  router`), `06b1b653` (`refactor(app-control): centralize host app control
  service`), `8e1f9b7b` (`refactor(kanban): centralize cleanup and workspace
  path helpers`), `e7e2e69c` (`refactor(kanban): split prompt and review
  workflow helpers`), and `181bd3cc` (`refactor(kanban): split orchestrator
  phase runners`). Covered: AD-020 CLI batch/runtime relief, a shared host-owned
  app-control bridge for CLI + IPC, Kanban cleanup warning visibility, shared
  workspace→container path ownership, and the planned prompt/review/orchestrator
  file splits. Targeted CLI/Kanban Vitest suites plus monorepo `pnpm typecheck`
  passed.
- 2026-04-14: Wave F batch **E3 — Plugin contract / bridge ownership + quality
  gates** landed across `56ff5e59` (`refactor(plugins): harden E3 bridge
  ownership and quality gates`) and `cd40bbcb` (`test(web): cover history
  clearing and download cleanup`). Covered: moved admin skill-visibility
  ownership into `@sero/common`, canonicalized user-feedback transport/bus
  ownership plus the shared renderer bridge type, and added package-local
  extension-inclusive typecheck/tests for admin, user-feedback, web, and
  context. Targeted plugin tests, focused desktop/user-feedback tests, and
  monorepo `pnpm typecheck` all passed.
- 2026-04-14: Wave F batch **E4 — Plugin runtime lifecycle + storage semantics**
  landed in `86342e2a` (`refactor(plugins): land E4 runtime semantics batch`).
  Covered: shared cron reminder mutation ownership + truthful desktop-only
  channel semantics, memory single-pass phase-1 migration plus async
  state/logging helpers, repo-backed Git `log`/`branches`, shared Context
  projection ownership, and visible Kanban cleanup warnings/error-log
  breadcrumbs. Targeted plugin tests, package-local memory typecheck, and
  monorepo `pnpm typecheck` all passed.
- 2026-04-14: Wave F batch **E5 — Plugin UI composition + cap-pressure relief**
  is now executing **one plugin at a time** to keep context bounded. The
  first plugin closeout landed in `1d433349`
  (`refactor(kanban): align settings and split ui panels`): shared Kanban
  settings descriptors now drive both the tool/help and the UI, the largest
  remaining Kanban UI hubs were split below the near-cap cluster, dead add-card
  scaffolding was removed, direct UI coverage was added, and the Kanban plugin
  is now marked complete for its remaining Medium items.
- 2026-04-14: The second plugin-scoped E5 closeout landed in `96b489fb`
  (`refactor(admin): finish E5 session and settings cleanup`): the admin
  plugin’s host/session hook hub was split into focused modules, session
  browsing now reuses cached path metadata and surfaces malformed JSONL lines,
  auth/model refresh wiring is shared behind one hook, dead provider-defaults
  scaffolding was deleted, focused package-local admin tests were added, and
  targeted admin validation plus monorepo `pnpm typecheck` and
  `apps/desktop pnpm test` all passed. The remaining E5 plugins stay queued in
  the checklist above.
- 2026-04-14: The third plugin-scoped E5 closeout landed across `ec22f935`
  (`refactor(git): split service and branch panel seams`) and `5d187d86`
  (`test(git): add direct ui interaction coverage`): the Git plugin’s shared
  service/parser/sidebar hotspots were split into focused modules, direct UI and
  bridge-contract coverage was added for `GitApp` / `BranchPanel` /
  `CommitDetail` / `StagingArea`, and targeted Git validation plus monorepo
  `pnpm typecheck` and `apps/desktop pnpm test` all passed. The remaining E5
  plugins stay queued in the checklist above.
- 2026-04-14: The fourth plugin-scoped E5 closeout landed in `43572da8`
  (`refactor(web): split provider extraction seams`): the web plugin’s near-cap
  Gemini Web / Gemini Search / video / YouTube / RSC extraction hubs were split
  into focused helper modules, the package-local extension typecheck now covers
  those provider/extractor seams directly, new extension tests landed for the
  split helpers, and targeted web validation plus monorepo `pnpm typecheck` and
  `apps/desktop pnpm test` all passed. The remaining E5 plugins stay queued in
  the checklist above.
