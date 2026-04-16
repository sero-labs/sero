# Refactoring Plan — apps/desktop/electron/types

_Plan drafted: 2026-04-13_

## Executive Summary
`apps/desktop/electron/types` is healthy. It currently contains one tiny,
well-scoped module augmentation that adds `systemPromptSuffix` typing to the Pi
SDK for Sero’s AD-021 subagent runtime. There is no meaningful cleanup work to
schedule here beyond keeping the augmentation minimal and deleting it when the
upstream package exposes the option natively.

## Issues Found (prioritized)
- **Low** — Local SDK augmentation should be retired once upstream types catch
  up — `apps/desktop/electron/types/pi-coding-agent.d.ts:3-10` is an
  intentional repo-local patch for `CreateAgentSessionOptions.systemPromptSuffix`.
  It is correct today, but it should not turn into a permanent shadow type if
  the upstream Pi SDK eventually adds the field. Effort: **S**.

## Proposed Refactoring
1. **~~Keep the file exactly as a narrow package augmentation seam.~~ ✅ 2026-04-14 (`c7452f4d`)**
   - Do not turn this folder into a second general desktop type tree.
   - Keep future additions package-specific and minimal.

2. **Check upstream before touching it during future SDK upgrades.**
   - If `@mariozechner/pi-coding-agent` gains native `systemPromptSuffix`
     support, delete the local augmentation instead of keeping duplicate typing.
   - If the upstream option shape changes, update this augmentation and the
     subagent runner in the same pass.

## Benefits & Trade-offs
- Benefits: preserves a clean, tiny local patch surface and avoids unnecessary
  churn in a healthy area.
- Trade-offs: the only real cost is remembering to re-check it during upstream
  Pi SDK updates.

## Dependencies & Risks
- The only dependent runtime path is the AD-021 subagent runner’s
  `createAgentSession()` call. Any change here must stay aligned with that call
  site and the installed Pi SDK version.
- Deleting the augmentation prematurely would not break runtime behavior by
  itself, but it would remove compile-time protection from the subagent option.

## Next Steps
1. ~~Mark this target as reviewed and move on to the heavier Wave A seams.~~ ✅ 2026-04-14 (`c7452f4d`)
2. Revisit it only when upgrading `@mariozechner/pi-coding-agent` or changing
   the subagent session-construction path.

Verification checklist for future changes:
- `apps/desktop/electron/features/subagent/runtime/runner.ts` still typechecks
  with `systemPromptSuffix` passed to `createAgentSession()`.
- No additional desktop-only contract types are quietly accumulating in this
  folder.

## Execution log
- `c7452f4d` — `chore(deslopify): confirm electron types no-op closeout`
