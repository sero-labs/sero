# Batch C Step 2 Prune Review

Date: 2026-04-23
Branch: `feat/release-prep`

## Scope

Execute the second narrow Batch C step from `public-tree-prune-plan.md`:
- `docs/plans/2026-04-13-apps-desktop-wave-f-periphery-closeout.md`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-c2-pre-prune-2026-04-23`
- snapshot commit: `038fe726`

## Reference audit

A scout subagent audited references before removal.

Concrete stale references found:
- `docs/plans/index.md`
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`

No other curated/public docs required updates for this removal.

## Changes landed

Removed from the public tree:
- `docs/plans/2026-04-13-apps-desktop-wave-f-periphery-closeout.md`

Updated:
- `docs/plans/index.md`
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Checklist impact

This is only the second narrow step inside Batch C.

Truthful current state:
- Batch C step 2 is complete
- the rest of Batch C remains pending
- Batch D remains pending
- `AGENTS.md` still remains temporarily tracked for Pi CLI compatibility
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` stays open until the broader docs-plan/superpowers wave is finished
- `Remove or relocate non-public artifacts from the public tree` stays open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files docs/plans/2026-04-13-apps-desktop-wave-f-periphery-closeout.md` → no tracked file remains ✅
