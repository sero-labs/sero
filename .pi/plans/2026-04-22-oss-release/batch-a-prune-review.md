# Batch A Prune Review

Date: 2026-04-23
Branch: `feat/release-prep`

## Scope

Execute Batch A from `public-tree-prune-plan.md`:
- `.claude/**`
- `AGENTS.md`
- `CLAUDE.md`

Important follow-up: `AGENTS.md` was restored immediately afterward because the
current Pi CLI session harness still relies on it. Do not auto-delete it again
in this cleanup wave.

## Archive snapshot

Created local archive branch before removal:
- `private-archive/batch-a-pre-prune-2026-04-23`
- snapshot commit: `3137ccd9`

This preserves the removed maintainer/agent surfaces before pruning them from
`feat/release-prep`.

## Pre-prune checks

Reviewed curated/public-root references and updated only the files that would
become stale as repo-surface documentation:
- `docs/README.md`
- `apps/docs-site/README.md`

A parallel scout subagent also audited references. It confirmed that the main
repo-surface docs needing cleanup were the documentation-model/readme surfaces,
while most other hits were either internal planning material or product/runtime
references to workspace-level AGENTS discovery rather than the repo-root file.

## Changes landed

Removed from the public tree:
- `.claude/`
- `CLAUDE.md`

Restored after the prune:
- `AGENTS.md`

Updated docs/metadata:
- `docs/README.md`
- `apps/docs-site/README.md`
- `.pi/plans/2026-04-22-oss-release/migration-map.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`

## Checklist impact

This does **not** complete the full prune program.

Truthful current state:
- Batch A is only partially complete
- `.claude/**` and `CLAUDE.md` were removed
- `AGENTS.md` is still temporarily retained for Pi CLI compatibility
- Batch B-D remain pending
- `Remove or relocate non-public artifacts from the public tree` stays open
  until the broader prune/archive wave is finished

## Validation

- `pnpm typecheck` ✅
- `git ls-files CLAUDE.md .claude` → no tracked files remain ✅
- `AGENTS.md` intentionally restored and re-tracked for now ✅
