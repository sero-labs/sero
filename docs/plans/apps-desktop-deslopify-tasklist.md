# Apps Desktop Deslopify Tasklist

_Last updated: 2026-04-12_

Core-first checklist for reviewing and cleaning up `apps/desktop` without losing track of sequencing.

## Working Rules

- Analyze core layers before shell/periphery.
- Finish a full **deslopify wave** before starting the matching **fix-slop wave**.
- Default `fix-slop` scope: **High only** unless explicitly expanded.
- Re-analyze downstream UI areas after core High items are fixed.

## Phase 0 — Baseline Map

- [ ] Capture current hotspot inventory for `apps/desktop/src` and `apps/desktop/electron`
- [ ] Note files over the 500 LOC cap
- [ ] Note likely contract/boundary hotspots (`types`, `preload`, `ipc`, stores)
- [ ] Confirm the first wave order before starting

## Wave A — Deslopify Core Contracts and Ownership

### 1. Contracts and boundaries
- [ ] `deslopify apps/desktop/src/types`
- [ ] `deslopify apps/desktop/electron/preload`
- [ ] `deslopify apps/desktop/electron/ipc`

### 2. Core platform/domain owners
- [ ] `deslopify apps/desktop/electron/features/workspace`
- [ ] `deslopify apps/desktop/electron/features/agent`
- [ ] `deslopify apps/desktop/electron/features/container`
- [ ] `deslopify apps/desktop/electron/features/apps`
- [ ] `deslopify apps/desktop/electron/features/plugins`
- [ ] `deslopify apps/desktop/electron/shared`
- [ ] `deslopify apps/desktop/electron/platform`

### 3. Renderer orchestration
- [ ] `deslopify apps/desktop/src/stores`
- [ ] `deslopify apps/desktop/src/hooks`
- [ ] `deslopify apps/desktop/src/lib`

## Wave B — Fix Core High-Priority Findings

- [ ] Review all Wave A plans together for cross-cutting themes
- [ ] Group fixes into coherent `fix-slop` batches
- [ ] `fix-slop` High items for `apps/desktop/src/types`
- [ ] `fix-slop` High items for `apps/desktop/electron/preload`
- [ ] `fix-slop` High items for `apps/desktop/electron/ipc`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/workspace`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/agent`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/container`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/apps`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/plugins`
- [ ] `fix-slop` High items for `apps/desktop/electron/shared`
- [ ] `fix-slop` High items for `apps/desktop/electron/platform`
- [ ] `fix-slop` High items for `apps/desktop/src/stores`
- [ ] `fix-slop` High items for `apps/desktop/src/hooks`
- [ ] `fix-slop` High items for `apps/desktop/src/lib`
- [ ] Run `pnpm typecheck` after each batch and keep notes linked from the relevant plan

## Wave C — Deslopify Primary Consumers

### 4. Main app surfaces
- [ ] `deslopify apps/desktop/src/components/apps/explorer`
- [ ] `deslopify apps/desktop/electron/features/editor`
- [ ] `deslopify apps/desktop/src/lsp`

### 5. Shell and app chrome
- [ ] `deslopify apps/desktop/src/components/layout`

### 6. Secondary feature islands
- [ ] `deslopify apps/desktop/src/components/profiles`
- [ ] `deslopify apps/desktop/electron/features/onboarding`
- [ ] `deslopify apps/desktop/electron/features/profile`
- [ ] `deslopify apps/desktop/electron/features/auth`
- [ ] `deslopify apps/desktop/electron/features/vcs`
- [ ] `deslopify apps/desktop/electron/features/subagent`
- [ ] `deslopify apps/desktop/electron/features/gateway`
- [ ] `deslopify apps/desktop/electron/features/collaboration`

## Wave D — Fix UI/Feature Findings

### 7. High-priority fixes first
- [ ] `fix-slop` High items for `apps/desktop/src/components/apps/explorer`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/editor`
- [ ] `fix-slop` High items for `apps/desktop/src/lsp`
- [ ] `fix-slop` High items for `apps/desktop/src/components/layout`
- [ ] `fix-slop` High items for `apps/desktop/src/components/profiles`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/onboarding`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/profile`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/auth`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/vcs`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/subagent`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/gateway`
- [ ] `fix-slop` High items for `apps/desktop/electron/features/collaboration`

### 8. Medium-priority cleanup
- [ ] Schedule Medium batches by dependency order, not folder name
- [ ] Start with core Medium items still affecting multiple consumers
- [ ] Then do feature-level Medium items
- [ ] Leave Low items for opportunistic cleanup or dedicated polish passes

## Wave E — True Periphery Last

- [ ] Review whether `apps/desktop/src/components/ui` needs deslopify at all
- [ ] Review styles/theme-only surfaces if still needed
- [ ] Review tests for drift after major refactors
- [ ] Do final sweep for stale docs/plans/index entries

## Current Rationale

Follow this dependency direction:

1. Types/contracts
2. Platform owners
3. State/orchestration
4. Feature implementations
5. Shell/layout
6. Secondary feature islands
7. UI primitives/tests/periphery

That keeps us from fixing visible symptoms in the UI before fixing the code that creates them.

## Progress Notes

- 2026-04-12: Initial tasklist created from the agreed core-first deslopify/fix-slop strategy.
