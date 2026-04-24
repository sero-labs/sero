# Batch D Step 8 Prune Review

Date: 2026-04-24
Branch: `feat/release-prep`

## Scope

Execute the eighth narrow Batch D step from `public-tree-prune-plan.md`:
- `docs/superpowers/plans/2026-04-04-onboarding-simplification-plan.md`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-d8-pre-prune-2026-04-24`
- snapshot commit: `a9e1380f`

## Reference audit

A scout subagent audited references before removal.

Findings:
- no direct references to this plan file remained in tracked repo docs
- nearby onboarding docs and deslopify records were conceptually related but did not depend on this file
- no curated/public docs or internal coordination docs required edits for this removal

## Changes landed

Removed from the public tree:
- `docs/superpowers/plans/2026-04-04-onboarding-simplification-plan.md`

Updated:
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Checklist impact

This is the eighth narrow step inside Batch D.

Truthful current state:
- Batch D step 8 is complete
- the `docs/superpowers/plans/**` subtree is now pruned on this branch
- only `docs/superpowers/specs/**` remain pending targeted triage
- `AGENTS.md` still remains temporarily tracked for Pi CLI compatibility
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` stays open until the broader superpowers/docs cleanup wave is finished
- `Remove or relocate non-public artifacts from the public tree` stays open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files docs/superpowers/plans/2026-04-04-onboarding-simplification-plan.md` → no tracked file remains ✅
