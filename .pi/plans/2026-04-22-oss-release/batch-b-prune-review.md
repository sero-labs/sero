# Batch B Prune Review

Date: 2026-04-23
Branch: `feat/release-prep`

## Scope

Execute Batch B from `public-tree-prune-plan.md`:
- `.pi/plans/2026-04-19-kanban-extraction/**`
- `.pi/plans/2026-04-19-local-plugin-dev-sessions/**`
- `.pi/plans/2026-04-20-emoji-to-lucide-icons/**`
- `.pi/plans/2026-04-20-github-auth-unification/**`
- `.pi/plans/2026-04-20-mcp-adaptor-plugin/**`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-b-pre-prune-2026-04-23`
- snapshot commit: `87bcefca`

## Reference audit

A scout subagent audited references before removal.

Findings:
- no curated/public docs outside the OSS release coordination docs directly
  referenced these legacy `.pi/plans/**` folders
- the only concrete stale references were inside the active release prune /
  migration docs themselves

Updated coordination docs accordingly:
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Changes landed

Removed from the public tree:
- `.pi/plans/2026-04-19-kanban-extraction/`
- `.pi/plans/2026-04-19-local-plugin-dev-sessions/`
- `.pi/plans/2026-04-20-emoji-to-lucide-icons/`
- `.pi/plans/2026-04-20-github-auth-unification/`
- `.pi/plans/2026-04-20-mcp-adaptor-plugin/`

## Checklist impact

This does **not** complete the full prune/archive program.

Truthful current state:
- Batch B is complete
- Batch C-D remain pending
- `AGENTS.md` still remains temporarily tracked for Pi CLI compatibility
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` remains open until the broader docs-plan/superpowers wave is finished
- `Remove or relocate non-public artifacts from the public tree` remains open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files .pi/plans/2026-04-19-kanban-extraction .pi/plans/2026-04-19-local-plugin-dev-sessions .pi/plans/2026-04-20-emoji-to-lucide-icons .pi/plans/2026-04-20-github-auth-unification .pi/plans/2026-04-20-mcp-adaptor-plugin` → no tracked files remain ✅
