# Batch C Tail Review

Date: 2026-04-24
Branch: `feat/release-prep`

## Scope

Review the remaining `docs/plans/**` survivors after Batch C narrow prune steps:
- `docs/plans/index.md`
- `docs/plans/apps-desktop-deslopify-tasklist.md`
- `docs/plans/desktop-packages-plugins-deslopify-tasklist.md`

## Scout conclusion

These files should **remain for now** as durable internal records for the OSS
release wave.

### `docs/plans/index.md`
Keep.
- still acts as the internal navigation hub for the remaining planning records
- referenced by the surviving tasklists
- already classified in `migration-map.md` as a durable internal index

### `docs/plans/apps-desktop-deslopify-tasklist.md`
Keep.
- still serves as durable wave history / cleanup rationale for the
  `apps/desktop` deslopify program
- not just dead backlog; it remains review lineage

### `docs/plans/desktop-packages-plugins-deslopify-tasklist.md`
Keep.
- not safe to prune yet
- still contains open checklist items and final sweep work
- remains the active coordination doc for the remaining desktop-adjacent/plugin
  cleanup wave

## Checklist impact

This means Batch C is **complete for now**:
- removable/transient plan docs were pruned in narrow steps
- the remaining `docs/plans/**` survivors are intentionally retained as durable
  internal records

Batch D (`docs/superpowers/**`) is now the next prune wave.

## Validation

- no repo edits required to the retained files themselves
- `pnpm typecheck` ✅
