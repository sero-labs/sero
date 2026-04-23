# Batch C Step 5 Prune Review

Date: 2026-04-23
Branch: `feat/release-prep`

## Scope

Execute the fifth narrow Batch C step from `public-tree-prune-plan.md`:
- `docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md`

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-c5-pre-prune-2026-04-23`
- snapshot commit: `bb8f0747`

## Reference audit

A scout subagent audited references before removal.

Concrete stale references found:
- `docs/plans/index.md`
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`

The only clear public-doc cleanup needed was `docs/plans/index.md`; the other
changes were active internal coordination-doc refreshes.

## Changes landed

Removed from the public tree:
- `docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md`

Updated:
- `docs/plans/index.md`
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/public-tree-prune-plan.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`

## Checklist impact

This is only the fifth narrow step inside Batch C.

Truthful current state:
- Batch C step 5 is complete
- the rest of Batch C remains pending
- Batch D remains pending
- `AGENTS.md` still remains temporarily tracked for Pi CLI compatibility
- `Remove only those public docs whose durable information has already been extracted or intentionally discarded` stays open until the broader docs-plan/superpowers wave is finished
- `Remove or relocate non-public artifacts from the public tree` stays open until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md` → no tracked file remains ✅
