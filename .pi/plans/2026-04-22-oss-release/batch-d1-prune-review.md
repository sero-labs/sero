# Batch D Step 1 Prune Review

Date: 2026-04-24
Branch: `feat/release-prep`

## Scope

Execute the first narrow Batch D step from `public-tree-prune-plan.md`:
- `docs/superpowers/plans/2026-04-04-google-auth-ux.md`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-d1-pre-prune-2026-04-24`
- snapshot commit: `1549448f`

## Reference audit

A scout subagent audited references before removal.

Findings:
- no curated/public docs directly referenced this plan
- only internal coordination docs mentioned it
- the one active internal doc that needed a concrete refresh was:
  - `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`

## Changes landed

Removed from the public tree:
- `docs/superpowers/plans/2026-04-04-google-auth-ux.md`

Updated:
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`

## Checklist impact

This is the first narrow step inside Batch D.

Truthful current state:
- Batch D step 1 is complete
- the rest of Batch D remains pending
- `AGENTS.md` still remains temporarily tracked for Pi CLI compatibility
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` stays open until the broader superpowers/docs cleanup wave is finished
- `Remove or relocate non-public artifacts from the public tree` stays open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files docs/superpowers/plans/2026-04-04-google-auth-ux.md` → no tracked file remains ✅
