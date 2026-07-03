# PR Lifecycle Loops — implementation plan (spec 15)

Branch: `feat/orchestrator-pr-lifecycle`. Spec:
[specs/15-pr-lifecycle.md](specs/15-pr-lifecycle.md).

## Phases

- [x] **Phase 1 — Pending-event FIFO queue** (FR-P3): `runtime.pendingEvents`
      replaces latest-wins `pendingEvent`; cap 10, dedupe `source#dedupeKey`,
      drop-oldest → `event-queue-overflow` warning; drain oldest-first;
      persisted `pendingEvent` migrates as a one-element queue.
- [ ] **Phase 2 — New GitHub kinds** (FR-P4): `pr-approved` + `main-updated`
      via `repo-events`, `issue-opened` via `issues` (PR entries dropped);
      source catalog entries.
- [ ] **Phase 3 — Existing-branch worktree host seam** (FR-P2):
      `createWorktree(key, title, { existingBranch })` through
      packages/common → desktop-core `WorktreeManager` → plugin host;
      removal never deletes the branch.
- [ ] **Phase 4 — event-pr branch resolution** (FR-P1):
      `worktreeBranchSource: 'new' | 'event-pr'`; branch from event payload,
      else PR-number lookup in `listPullRequests()`; unresolvable → visible
      block, no fallback; `deleteBranch` guarded for event-pr worktrees.
- [ ] **Phase 5 — pr receipt widening** (FR-P5): verify-back accepts an
      update to an existing open PR named by number.
- [ ] **Phase 6 — UI**: branch source control (event/hybrid loops), queued
      events count in loop detail, overflow warning chip.
- [ ] **Phase 7 — Catalog entries** (FR-P7, FR-P9): `issue-implementer`
      (claim protocol), `ci-fixer`, `review-responder`, `rebase-on-main`;
      content validation + e2e (lost claim race ⇒ skipped, no PR).
- [ ] **Phase 8 — Docs** (FR-P6, FR-P8): docs-site reference (branch source,
      event queue, new sources, stale-PR hybrid pattern).

## FR matrix

| FR | Phase | Status |
| --- | --- | --- |
| FR-P1 event-pr resolution, visible block | 4 | pending |
| FR-P2 existingBranch worktree seam | 3 | pending |
| FR-P3 pending-event FIFO | 1 | done |
| FR-P4 three new GitHub kinds | 2 | pending |
| FR-P5 updated-PR receipts | 5 | pending |
| FR-P6 stale-PR hybrid pattern documented | 8 | pending |
| FR-P7 four catalog entries shipped | 7 | pending |
| FR-P8 docs-site reference updated | 8 | pending |
| FR-P9 claim protocol e2e-verified | 7 | pending |

## Constraints carried in

- `run-engine.ts` (487 LOC) and `coordinator.ts` (496 LOC) are at the
  500-LOC cap — spec-15 work lands in new modules or must move weight out
  first.
- Catalog authoring uses the spec-14 harness (`catalog-author.agent.spec.ts`
  RECIPES) against the official catalog checkout; per-entry `version` bumps
  are what make updates visible to installed loops.

## Findings during implementation

- Phase 1: `runEventPass` previously re-armed from a caller-held loop copy via
  `replaceLoop`, which could overwrite an event enqueued concurrently — the
  re-arm now happens inside `updateState` against the on-disk copy. Also
  caught in review: `rearmLoop` clears `runtime.workspace`, so the prior
  worktree must be captured before the re-arm or it leaks. `run-engine.ts` is
  now 494/500 LOC.
