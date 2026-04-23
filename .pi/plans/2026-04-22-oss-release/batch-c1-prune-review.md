# Batch C Step 1 Prune Review

Date: 2026-04-23
Branch: `feat/release-prep`

## Scope

Execute the first narrow Batch C step from `public-tree-prune-plan.md`:
- `docs/plans/2026-04-12-pr-136-followups.md`
- `docs/plans/2026-04-12-pr-137-followups.md`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-c1-pre-prune-2026-04-23`
- snapshot commit: `7f94f8ce`

## Reference audit

A scout subagent audited references before removal.

Finding:
- the only direct reference that needed updating was `docs/plans/index.md`
- no curated public docs or other important coordination docs had direct links
  to these two follow-up plan files

## Changes landed

Removed from the public tree:
- `docs/plans/2026-04-12-pr-136-followups.md`
- `docs/plans/2026-04-12-pr-137-followups.md`

Updated:
- `docs/plans/index.md`
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Checklist impact

This is only the first narrow step inside Batch C.

Truthful current state:
- Batch C step 1 is complete
- the rest of Batch C remains pending
- Batch D remains pending
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` stays open until the broader docs-plan/superpowers wave is finished
- `Remove or relocate non-public artifacts from the public tree` stays open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files docs/plans/2026-04-12-pr-136-followups.md docs/plans/2026-04-12-pr-137-followups.md` → no tracked files remain ✅
