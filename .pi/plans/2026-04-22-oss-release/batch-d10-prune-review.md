# Batch D Step 10 Prune Review

Date: 2026-04-24
Branch: `feat/release-prep`

## Scope

Execute the tenth narrow Batch D step from `public-tree-prune-plan.md`:
- `docs/superpowers/specs/2026-04-04-onboarding-simplification-implementation-spec.md`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-d10-pre-prune-2026-04-24`
- snapshot commit: `48300448`

## Reference audit

A scout subagent audited the remaining `docs/superpowers/specs/**` survivors.

Findings for this file:
- safe to prune now
- no inbound repo references required changes
- its durable context overlaps shipped implementation and the surviving
  onboarding resilience analysis

## Changes landed

Removed from the public tree:
- `docs/superpowers/specs/2026-04-04-onboarding-simplification-implementation-spec.md`

Updated:
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Checklist impact

This is the tenth narrow step inside Batch D.

Truthful current state:
- Batch D step 10 is complete
- the rest of Batch D remains pending
- `AGENTS.md` still remains temporarily tracked for Pi CLI compatibility
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` stays open until the broader superpowers/docs cleanup wave is finished
- `Remove or relocate non-public artifacts from the public tree` stays open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files docs/superpowers/specs/2026-04-04-onboarding-simplification-implementation-spec.md` → no tracked file remains ✅
