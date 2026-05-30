# Facts — apps/desktop/electron/types

_Last reviewed: 2026-04-13_

## What this code does
`apps/desktop/electron/types` is a tiny local type-augmentation seam for the Pi
SDK. Right now it contains one module augmentation that teaches TypeScript about
Sero’s `systemPromptSuffix` addition to `CreateAgentSessionOptions`, which the
subagent runtime uses to append markdown-defined agent instructions.

## Shape & metrics
- Total files: 1
- Total LOC: 11
- Largest file: `apps/desktop/electron/types/pi-coding-agent.d.ts` (11 LOC)
- Files over 500 LOC: none
- Upstream callers / consumers of note:
  - `apps/desktop/electron/features/subagent/runtime/runner.ts:191-202`
- External dependencies of note:
  - `@earendil-works/pi-coding-agent` module augmentation only

## Architectural notes
- This folder is not a general-purpose desktop types bucket; it is currently a
  surgical augmentation seam for one upstream package.
- The augmentation exists to keep the AD-021 subagent runtime type-safe without
  forking or vendoring the full upstream Pi SDK types.
- Because the folder is so small, any future additions should stay equally
  narrow and package-specific; broader desktop contracts still belong in the
  main `apps/desktop/src/types/**` tree.

## Runtime-sensitive surfaces
- The file is type-only, but it guards a real runtime capability:
  `systemPromptSuffix` is passed into `createAgentSession()` by the subagent
  runner. If the augmentation disappears before upstream typings catch up,
  Sero loses compile-time protection on that option.

## Surprising discoveries
- There is effectively no slop here: one file, one augmentation, one consumer.
- The augmentation is already well-scoped and documented inline, which is rare
  for repo-local SDK patches.

## Post-fix snapshot — 2026-04-14

### Metrics after fixes
- Total files: 1
- Largest file: `apps/desktop/electron/types/pi-coding-agent.d.ts` (11 LOC)
- Files over 500 LOC: none
- Targeted validation: source-shape verification, monorepo `pnpm typecheck`, and `cd apps/desktop && pnpm test` all pass

### What changed
- Reconfirmed that the folder still contains exactly one narrow Pi SDK augmentation for `CreateAgentSessionOptions.systemPromptSuffix`.
- Verified the only downstream consumer remains `apps/desktop/electron/features/subagent/runtime/runner.ts`, so the augmentation is still truthful to the live AD-021 subagent runtime.
- Closed the tracked fix-slop item as a documentation-only no-op instead of inventing churn in a healthy type seam.

### Still outstanding
- No active fix-slop work remains for this target.
- Future Pi SDK upgrades should re-check whether upstream now exposes `systemPromptSuffix` natively.
