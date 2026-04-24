# Batch D Step 5 Prune Review

Date: 2026-04-24
Branch: `feat/release-prep`

## Scope

Execute the fifth narrow Batch D step from `public-tree-prune-plan.md`:
- `docs/superpowers/specs/2026-04-05-onboarding-polish-design.md`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-d5-pre-prune-2026-04-24`
- snapshot commit: `0018e75e`

## Reference audit

A scout subagent audited references before removal.

Findings:
- no tracked files in the repo linked to this spec by exact path
- no curated/public docs required updates
- no internal coordination docs required updates for this spec removal

## Changes landed

Removed from the public tree:
- `docs/superpowers/specs/2026-04-05-onboarding-polish-design.md`

Updated:
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Checklist impact

This is the fifth narrow step inside Batch D.

Truthful current state:
- Batch D step 5 is complete
- the rest of Batch D remains pending
- `AGENTS.md` still remains temporarily tracked for Pi CLI compatibility
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` stays open until the broader superpowers/docs cleanup wave is finished
- `Remove or relocate non-public artifacts from the public tree` stays open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files docs/superpowers/specs/2026-04-05-onboarding-polish-design.md` → no tracked file remains ✅
