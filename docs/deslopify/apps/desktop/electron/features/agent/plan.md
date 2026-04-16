# Refactoring Plan — apps/desktop/electron/features/agent

_Plan drafted: 2026-04-12_

## Executive Summary
This area is comparatively healthy: low file count, clear responsibilities, and no size-cap
violations. Cleanup is mostly type-hygiene and dead-bridge reduction in `image-agent.ts`.
No major architecture rewrite is needed.

## Issues Found (prioritized)
- **Medium** — ~~`any` leaks remain in image agent content and global exposure paths —
  `apps/desktop/electron/features/agent/assistants/image-agent.ts:163-164,188` uses
  `Record<string, any>` and `globalThis as any`, weakening compile-time guarantees.~~ ✅ 2026-04-16 (`f24ff585`)
  Effort: **S**.

- **Low** — ~~Potential dead global bridge hook for image generation —
  `apps/desktop/electron/features/agent/assistants/image-agent.ts:186-188` exports
  `generateImages` on `globalThis.__seroImageGen`, but there is no internal consumer.~~ ✅ 2026-04-16 (`f24ff585`) — formalized as a typed legacy compatibility seam after repo-wide validation found no in-repo consumer, but external consumers could not be ruled out.
  Effort: **S**.

- **Low** — ~~Comment suggests mirrored shared types that no longer exist —
  `apps/desktop/electron/features/agent/assistants/image-agent.ts:19` references
  “shared/types.ts” mirroring, but no corresponding shared source is present.~~ ✅ 2026-04-16 (`f24ff585`)
  Effort: **S**.

## Proposed Refactoring
1. **Tighten image-agent typing.**
   - Replace `Record<string, any>` content-part shapes with explicit interfaces.
   - Remove `globalThis as any` via a typed global augmentation if exposure is required.

2. **Verify and either remove or formalize `__seroImageGen` bridge.**
   - If unused, delete `exposeImageAgent()` and the handler call site.
   - If required for extension interop, document the contract and add a typed accessor.

3. **Update stale comments and align docs to actual ownership.**
   - Remove “mirrored from shared/types.ts” wording or move types to a real shared module.

## Benefits & Trade-offs
- Benefits: cleaner typing, less dead scaffolding, and easier maintenance in a small critical helper layer.
- Trade-offs: minor churn only; no broad migration expected.

## Dependencies & Risks
- If `__seroImageGen` is consumed externally (outside repo), removing it requires compatibility validation.
- Type tightening may require small updates in `ipc/agent/handlers/imagegen.ts` signatures.

## Next Steps
1. Continue Wave A: `deslopify apps/desktop/electron/features/container`.

## Execution log
- 2026-04-16 — `f24ff585` — `refactor(agent): tighten image generation typing`
