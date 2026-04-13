---
title: Apps Desktop Wave F — Periphery Review and Closeout
author: OpenAI
date: 2026-04-13
status: planned
related:
  - docs/plans/apps-desktop-deslopify-tasklist.md
  - docs/deslopify/index.md
  - apps/desktop/src/components/apps
  - apps/desktop/src/components/ui
  - apps/desktop/src/styles/global.css
  - apps/desktop/vite.config.ts
  - apps/desktop/src/lib/federation-registry.ts
---

# Apps Desktop Wave F — Periphery Review and Closeout

This is a short ad-hoc plan for closing the remaining `apps/desktop` deslopify
work without reopening already-reviewed core and shell areas.

The main conclusion from the current repo state is:

- we **do not** need a full deslopify pass for `apps/desktop/src/components/ui`
- we **do** still have a meaningful review gap in `apps/desktop/src/components/apps`
  outside of `apps/explorer`
- the remaining Wave F work is mostly a **closeout / drift / coverage** pass,
  not another broad refactor wave

## Goal

Finish the last periphery checks for `apps/desktop` with the minimum amount of
new work needed to confidently close Wave F:

- review the remaining unreviewed app-surface components
- explicitly decide which tiny periphery folders do **not** need deslopify
- sweep style/config drift that may have been left behind by earlier refactors
- run targeted regression coverage for the remaining seams
- refresh planning/deslopify docs so the written status matches reality

## Current state snapshot

Already reviewed:

- `apps/desktop/src/components/apps/explorer`
- `apps/desktop/src/components/layout`
- `apps/desktop/src/components/profiles`

Still unreviewed or only implicitly covered:

- `apps/desktop/src/components/apps` root
- `apps/desktop/src/components/apps/dashboard`
- `apps/desktop/src/components/ui`
- `apps/desktop/src/components/ErrorBoundary.tsx`
- tiny style/config surfaces tied to app discovery and Tailwind source globs

Important observations from the current codebase:

- `apps/desktop/src/components/ui` currently contains only
  `ui/IconAction.tsx` (**78 LOC**)
- `apps/desktop/src/components/apps/dashboard` is small overall
  (**~620 LOC total**) but still owns real behavior around widget mounting,
  app-runtime context setup, and dashboard interactions
- `apps/desktop/src/components/apps/SeroAppMount.tsx` and
  `apps/desktop/src/components/apps/dashboard/WidgetMount.tsx` duplicate
  session-bootstrap and app-context wiring patterns, which is exactly the kind
  of medium-grade periphery slop worth documenting before we call this done
- `apps/desktop/src/styles/global.css`, `apps/desktop/vite.config.ts`, and
  `apps/desktop/src/lib/federation-registry.ts` still reference `packages/pi-*`,
  which may now be naming drift rather than a live convention

## Working assumptions

- Keep this wave tightly scoped; do not reopen finished core/platform work unless
  a new review uncovers a genuine contract issue.
- Follow the deslopify discipline: review/docs first, then fix only what is
  real and worth touching.
- Do not create busywork review docs for tiny healthy primitives just to make
  every folder symmetrical.
- Prefer targeted tests over broad snapshots.
- Keep touched source files under the 500 LOC cap.

## Progress checklist

### Task 1 — Finish the last unreviewed app-surface review
- [ ] Run `deslopify apps/desktop/src/components/apps`
- [ ] Include `SeroAppMount.tsx`, `ActiveAppPanel.tsx`, and `apps/dashboard/**`
- [ ] Capture duplicated session-bootstrap / app-context wiring findings if they hold up under full review
- [ ] Decide whether `components/ErrorBoundary.tsx` needs any follow-up or can be treated as healthy

### Task 2 — Explicitly close `components/ui` without over-reviewing it
- [ ] Review `apps/desktop/src/components/ui/IconAction.tsx`
- [ ] Record that no dedicated deslopify pass is needed unless real findings appear
- [ ] Only add `docs/deslopify/apps/desktop/src/components/ui/*` if the review uncovers non-trivial issues

### Task 3 — Sweep style/config drift instead of opening a new theme wave
- [ ] Review `apps/desktop/src/styles/global.css`
- [ ] Verify whether `packages/pi-*` references in `global.css`, `vite.config.ts`, and `federation-registry.ts` are still intentional
- [ ] Fix or document any stale discovery / Tailwind source-glob assumptions
- [ ] Confirm earlier layout/theme/font findings already cover the real theme-heavy work so we do not duplicate Wave C/E effort

### Task 4 — Run targeted regression coverage for periphery seams
- [ ] Run targeted tests for `ActiveAppPanel`, `SeroAppMount`, and dashboard/runtime-widget flows
- [ ] Add tests for `Dashboard.tsx` and/or `WidgetMount.tsx` if the review/fix pass changes those files
- [ ] Run relevant focused desktop tests after any code changes
- [ ] Run `pnpm typecheck`

### Task 5 — Close the doc/status loop
- [ ] Update `docs/plans/apps-desktop-deslopify-tasklist.md` Wave F items as decisions land
- [ ] Refresh stale Wave E / progress notes so they match the completed checkbox state
- [ ] Update `docs/deslopify/index.md` with current review/fix status and any new `components/apps` review
- [ ] Keep `docs/plans/index.md` in sync with this plan and any follow-up artifacts

---

## Task 1 — Finish the last unreviewed app-surface review

**Priority:** High

### Why

This is the only remaining `src/components` area with enough real behavior to
justify a final deslopify pass.

`apps/desktop/src/components/apps` is not large by shell standards, but it owns
important renderer-side boundaries:

- app selection handoff via `ActiveAppPanel`
- federated app mounting via `SeroAppMount`
- dashboard widget mounting and app-runtime wiring via `dashboard/*`

The key risk is not LOC explosion; it is **duplicated ownership logic** around:

- ensuring a session exists
- opening the agent session before prompt dispatch
- revealing the chat panel
- building `AppProvider` context from workspace/global app scope

If that duplication stays informal, future fixes can drift between full apps and
widgets.

### Scope

Review the whole folder:

- `apps/desktop/src/components/apps/ActiveAppPanel.tsx`
- `apps/desktop/src/components/apps/SeroAppMount.tsx`
- `apps/desktop/src/components/apps/dashboard/*`
- optionally fold in `apps/desktop/src/components/ErrorBoundary.tsx` as a tiny
  adjacent periphery sanity check rather than a standalone review target

### Expected outputs

- `docs/deslopify/apps/desktop/src/components/apps/facts.md`
- `docs/deslopify/apps/desktop/src/components/apps/plan.md`
- `docs/deslopify/index.md` updated accordingly

### What to look for

- duplicated `ensureSessionAndPrompt()` flows between `SeroAppMount` and
  `WidgetMount`
- duplicated app-runtime context construction
- drift between dashboard widget behavior and full-app behavior
- renderer ownership that should move to a shared helper/store/lib module
- missing or thin test coverage around dashboard mounting and fallback states

### Acceptance criteria

- The folder has a documented senior-review record.
- Any real slop is written down as explicit findings, not just intuition.
- We either have a small follow-up fix plan or a clear written reason why no
  code changes are necessary.

---

## Task 2 — Explicitly close `components/ui` without over-reviewing it

**Priority:** Low

### Why

Wave F explicitly calls for reviewing whether `apps/desktop/src/components/ui`
needs deslopify at all. Right now, it does not look like a real review target:

- the folder contains only `IconAction.tsx`
- the file is small and straightforward
- the folder is not a hotspot by size, coupling, or churn

The risk here is process slop, not code slop: creating unnecessary review docs
for a tiny healthy primitive just to satisfy the checklist mechanically.

### Scope

Perform a quick explicit review of:

- `apps/desktop/src/components/ui/IconAction.tsx`

Record one of two outcomes:

1. **Preferred:** no dedicated deslopify needed
2. **Fallback:** create docs only if the review uncovers a meaningful issue
   worth planning

### Acceptance criteria

- Wave F has an explicit decision on `components/ui`.
- We do not spend a full deslopify pass on a 78-LOC primitive unless there is a
  concrete reason.

---

## Task 3 — Sweep style/config drift instead of opening a new theme wave

**Priority:** Medium

### Why

The real theme-heavy surfaces were already reviewed in earlier waves
(`components/layout`, `src/lib`, `src/stores`, `src/types`). What remains is not
another big theme cleanup; it is a small drift check for style/config edges.

The main suspicious area is stale discovery/source-glob wiring:

- `apps/desktop/src/styles/global.css`
- `apps/desktop/vite.config.ts`
- `apps/desktop/src/lib/federation-registry.ts`

These still reference `packages/pi-*`, while the current repo layout does not
appear to contain live `packages/pi-*` directories.

### Scope

Review and either validate or clean up:

- Tailwind `@source` globs in `src/styles/global.css`
- workspace app discovery globs in `vite.config.ts`
- comments/docs in `src/lib/federation-registry.ts` that describe discovery
  behavior

This task is also where we explicitly confirm that existing Wave C/E theme
findings already cover:

- theme editor lifecycle issues
- font preloading behavior
- shell/theme ownership drift

### Acceptance criteria

- Any stale `packages/pi-*` reference is either corrected or documented as still
  intentional.
- We do not create a duplicate broad theme review just because Wave F mentions
  style surfaces.

---

## Task 4 — Run targeted regression coverage for periphery seams

**Priority:** Medium

### Why

The remaining unreviewed periphery code is small, but it contains seams where
subtle runtime regressions would be easy to miss:

- dashboard empty-state vs mounted-grid behavior
- widget fallback behavior when remotes/runtime widgets are unavailable
- app-mount behavior while workspace state is still hydrating
- prompt/session bootstrap behavior shared between full apps and widgets

The existing test coverage is decent but thin in exactly these spots.

### Scope

At minimum:

- run the existing tests around:
  - `apps/desktop/src/components/apps/ActiveAppPanel.test.tsx`
  - `apps/desktop/src/components/apps/SeroAppMount.test.tsx`
  - `apps/desktop/src/components/apps/dashboard/useRuntimeWidgets.test.ts`
- add focused tests for `Dashboard.tsx` and/or `WidgetMount.tsx` if the review
  leads to code changes there
- run `pnpm typecheck`

### Good candidate additions if code changes land

- `Dashboard.tsx`
  - empty state when no widgets exist
  - mounted grid when widgets exist and width is available
  - persist only on interaction stop
- `WidgetMount.tsx`
  - workspace-scoped widget without active workspace
  - runtime-widget fallback when runtime component is unavailable
  - federated-widget fallback when no UI module is registered

### Acceptance criteria

- Any changed periphery behavior is covered by targeted tests.
- `pnpm typecheck` passes after the closeout work.

---

## Task 5 — Close the doc/status loop

**Priority:** High

### Why

The repo now has a mismatch between checkbox state and narrative state:

- `docs/plans/apps-desktop-deslopify-tasklist.md` shows Wave E tasks completed
- the progress notes still read like parts of Wave E are merely “started”
- `docs/deslopify/index.md` is stale relative to current fix progress

That documentation drift will make the next pass more confusing than the code.

### Scope

Update:

- `docs/plans/apps-desktop-deslopify-tasklist.md`
- `docs/deslopify/index.md`
- `docs/plans/index.md`
- any new `docs/deslopify/apps/desktop/src/components/apps/*` artifacts

### Acceptance criteria

- The plan/tasklist/index files agree on what has been reviewed, what has been
  fixed, and what is still intentionally deferred.
- Wave F can be closed without needing another archaeology pass.

---

## Suggested execution order

1. Run the focused `deslopify apps/desktop/src/components/apps` pass.
2. Make the explicit `components/ui` no-op review decision.
3. Sweep style/config drift (`global.css`, `vite.config.ts`,
   `federation-registry.ts`).
4. Implement any small fixes that the review actually justifies.
5. Run targeted tests and `pnpm typecheck`.
6. Refresh tasklist/deslopify/index docs.

## Definition of done

Wave F is done when:

- `components/apps` has either a completed deslopify review or a documented
  reason not to change anything
- `components/ui` has an explicit “no review needed” decision recorded
- style/config drift has been checked and resolved/documented
- relevant tests and `pnpm typecheck` pass
- docs reflect the real status of Waves E and F
