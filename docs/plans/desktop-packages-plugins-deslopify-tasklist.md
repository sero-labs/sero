# Desktop Packages + Plugins Deslopify Tasklist

_Last updated: 2026-04-13_

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
- [ ] `deslopify plugins/sero-memory-plugin`

### 4. Additional host-integrated plugins
- [ ] `deslopify plugins/sero-git-plugin`
- [ ] `deslopify plugins/sero-context-plugin`
- [ ] `deslopify plugins/sero-web-plugin`
- [ ] `deslopify plugins/sero-user-feedback-plugin`

### 5. Smaller / narrower plugins last
- [ ] `deslopify plugins/sero-alibaba-plugin`
- [ ] `deslopify plugins/sero-hello-world-plugin`

## Wave D — Fix Plugin High-Priority Findings

- [ ] Review all Wave C plans together for repeated plugin architecture issues
- [ ] Group fixes into coherent `fix-slop` batches by shared pattern, not by
      folder name
- [ ] `fix-slop` High items for `plugins/sero-kanban-plugin`
- [ ] `fix-slop` High items for `plugins/sero-cron-plugin`
- [ ] `fix-slop` High items for `plugins/sero-admin-plugin`
- [ ] `fix-slop` High items for `plugins/sero-memory-plugin`
- [ ] `fix-slop` High items for `plugins/sero-git-plugin`
- [ ] `fix-slop` High items for `plugins/sero-context-plugin`
- [ ] `fix-slop` High items for `plugins/sero-web-plugin`
- [ ] `fix-slop` High items for `plugins/sero-user-feedback-plugin`
- [ ] `fix-slop` High items for `plugins/sero-alibaba-plugin`
- [ ] `fix-slop` High items for `plugins/sero-hello-world-plugin`
- [ ] Run targeted package/plugin tests plus monorepo `pnpm typecheck` after
      each batch

## Wave E — Medium-Priority Cleanup Planning

- [ ] Identify all Medium findings from Waves A–D and consolidate them into a
      dependency-ordered backlog
- [ ] Start with shared package Medium items still affecting multiple desktop
      areas or multiple plugins
- [ ] Then do residual desktop Electron Medium items
- [ ] Then do plugin-level Medium items, grouped by repeated concerns
      (contracts, runtime lifecycle, UI composition, storage, docs drift)
- [ ] Leave Low items for opportunistic cleanup or dedicated polish passes

## Wave F — Medium Cleanup Execution

### 6. Shared + desktop mediums first
- [ ] `fix-slop` Medium items for `packages/common/src`
- [ ] `fix-slop` Medium items for `packages/app-runtime/src`
- [ ] `fix-slop` Medium items for `apps/desktop/electron/types`
- [ ] `fix-slop` Medium items for `apps/desktop/electron/cli`
- [ ] `fix-slop` Medium items for `apps/desktop/electron/gateway`
- [ ] `fix-slop` Medium items for `apps/desktop/electron/features/kanban`

### 7. Plugin mediums after shared patterns stabilize
- [ ] `fix-slop` Medium items for `plugins/sero-kanban-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-cron-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-admin-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-memory-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-git-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-context-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-web-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-user-feedback-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-alibaba-plugin`
- [ ] `fix-slop` Medium items for `plugins/sero-hello-world-plugin`

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
