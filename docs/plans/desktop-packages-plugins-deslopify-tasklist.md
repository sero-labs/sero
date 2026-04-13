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

- [ ] Capture current hotspot inventory for all folders in scope
- [ ] Note files over the 500 LOC cap
- [ ] Note likely contract and ownership hotspots across shared packages,
      desktop Electron seams, and plugin extension/UI boundaries
- [ ] Confirm review order before starting

## Wave A — Deslopify Shared Contracts and Runtime Foundations

### 1. Shared package foundations
- [ ] `deslopify packages/common/src`
- [ ] `deslopify packages/app-runtime/src`

### 2. Residual desktop contract / platform seams
- [ ] `deslopify apps/desktop/electron/types`
- [ ] `deslopify apps/desktop/electron/cli`
- [ ] `deslopify apps/desktop/electron/gateway`
- [ ] `deslopify apps/desktop/electron/features/kanban`

## Wave B — Fix Shared/Desktop High-Priority Findings

- [ ] Review all Wave A plans together for cross-cutting themes
- [ ] Group fixes into coherent `fix-slop` batches
- [ ] `fix-slop` High items for `packages/common/src`
- [ ] `fix-slop` High items for `packages/app-runtime/src`
- [ ] `fix-slop` High items for `apps/desktop/electron/types`
- [ ] `fix-slop` High items for `apps/desktop/electron/cli`
- [ ] `fix-slop` High items for `apps/desktop/electron/gateway`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/kanban`
- [ ] Run `pnpm typecheck` after each batch and keep notes linked from the
      relevant plan

## Wave C — Deslopify Plugin Platform Exemplars First

Review the most host-coupled / architecture-setting plugins first so later
plugin reviews can treat their patterns as either good examples or debt to stop
copying.

### 3. Core plugin exemplars
- [ ] `deslopify plugins/sero-kanban-plugin`
- [ ] `deslopify plugins/sero-cron-plugin`
- [ ] `deslopify plugins/sero-admin-plugin`
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
