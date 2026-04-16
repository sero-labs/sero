# Refactoring Plan — apps/desktop/electron/features/subagent

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/subagent` is strategically important and mostly well-structured, but it still carries two High-priority correctness issues in the AD-021 core: bulk aborts do not propagate to tracker state, and the runner still hides SDK contract drift behind a cast/non-null assertion. After that, the biggest win is slimming the near-cap façade and deleting policy/comment surfaces that no longer match the reduced child-session runtime.

## Issues Found (prioritized)
- **High** — Bulk aborts do not update tracker state, so UI snapshots/events can stay stale after `abortAll()` — `apps/desktop/electron/features/subagent/index.ts:446-447` only delegates to `this.pool.abortAll(parentSessionId)`, while tracker terminal updates are only wired for single-run aborts (`index.ts:451-455`). `apps/desktop/electron/features/subagent/core/tracker.ts:166-172` even exposes `clear()`/`subagent_clear`, but the bulk-abort path never uses it. In an AD-021 snapshot+events system, that is a real runtime correctness bug. Effort: **M**.
- **High** — The runner still uses type escapes around the SDK session-creation contract — `apps/desktop/electron/features/subagent/runtime/runner.ts:202-203` casts the `createAgentSession()` config to `Parameters<typeof createAgentSession>[0]` to pass `systemPromptSuffix`, and `runtime/runner.ts:273` uses `session!` when logging turn context. This is a hard-rule violation on a critical session-runtime boundary. Effort: **S**.
- **Medium** — `SubagentManager` is a near-cap façade with duplicated single-run execution logic — `apps/desktop/electron/features/subagent/index.ts:69-491`, especially `index.ts:113-196` and `index.ts:206-289`, repeats the same resolve/configure/track/run/finalize flow for `runSingle()` and `runSingleStructured()`. That duplication is already making the module expensive to extend safely. Effort: **M**.
- **Medium** — Subagent policy/config fields are stored but not enforced anywhere in the runtime — `apps/desktop/electron/features/subagent/core/types.ts:46-48,76-87` defines `tools`, `extensions`, and `blockedExtensions`; `apps/desktop/electron/features/subagent/index.ts:83` stores the settings; and `apps/desktop/electron/features/subagent/runtime/runner.ts:164-173` still always builds the same reduced extension stack. This leaves dead policy surface that implies controls the runtime does not actually honor. Effort: **S**.
- **Low** — Loader comments no longer match behavior — `apps/desktop/electron/features/subagent/runtime/loader.ts:4-10` claims the reduced extension factory provides `@ws:` path expansion, but `loader.ts:34-65` implements prompt injection, provider logging, and notifications only. This is comment rot in a subtle runtime module. Effort: **S**.

## Proposed Refactoring
1. **Make bulk aborts first-class tracker events.**
   - Add a `tracker.abortByParentSession(parentSessionId)` or equivalent helper that marks all matching running entries as aborted before/while the pool cascades abort signals.
   - Emit one clear terminal event path for bulk aborts so renderer state matches the actual child-session lifecycle.
   - Keep AD-021's snapshot + live-event contract explicit rather than relying on eventual cleanup.

2. **Replace the runner's type escapes with an explicit Sero-owned wrapper.**
   - Introduce a tiny local wrapper/factory for subagent sessions that models the Sero-only `systemPromptSuffix` extension without a broad cast at the callsite.
   - Remove the `session!` assertion by guarding `logTurnContext` behind a local `if (session)` or by narrowing earlier in the callback.
   - This keeps upstream SDK drift visible at compile time instead of being papered over.

3. **Extract one shared single-run execution path from `SubagentManager`.**
   - Target structure:
     - `index.ts` stays the façade/public API
     - `lib/execute-single-run.ts` or similar owns resolve/configure/track/run/finalize mechanics
     - `runSingle()` and `runSingleStructured()` become thin wrappers over the same executor
   - Preserve existing public return shapes so callers in kanban/collaboration do not need churn.

4. **Either enforce or delete the unused policy surfaces.**
   - If `tools`, `extensions`, and `blockedExtensions` are meant to be real v2/v1.5 controls, wire them into discovery + runner filtering.
   - If AD-021 deliberately excludes that scope for now, remove the dead settings/fields or mark them clearly as unsupported to avoid false affordances.
   - Prefer smaller truthful contracts over speculative knobs.

5. **Fix the loader commentary to match the real reduced extension factory.**
   - Remove the stale `@ws:` claim or implement the missing behavior if child sessions truly require it.
   - Keep the reduced-factory contract explicit: prompt blocks, provider logging, notifications, and no recursion.

## Benefits & Trade-offs
- Benefits: correct abort-state reporting in the renderer, stricter SDK boundary typing, a smaller/faster-to-review façade, and fewer misleading policy surfaces for future work.
- Trade-offs: bulk-abort changes touch subtle UI/runtime coordination, and replacing the session-creation cast may require a small amount of shared wrapper code around the Pi SDK.

## Dependencies & Risks
- Bulk-abort fixes should be validated together with the renderer/IPC consumers of tracker events so the UI does not double-handle terminal entries.
- Any wrapper around `createAgentSession()` must preserve current child-session semantics: model setting, `systemPromptSuffix`, container tools, debug logging, and disposal behavior.
- Removing unused policy fields is a behavioral/API change if any external agent definitions or settings UIs already expose them.

## Next Steps
1. ~~Fix the bulk-abort/tracker desync first.~~ ✅ 2026-04-12 (`4350404d`)
2. ~~Remove the `createAgentSession()` cast and `session!` assertion from `runtime/runner.ts`.~~ ✅ 2026-04-12 (`4350404d`)
3. ~~Extract shared single-run execution logic so `index.ts` drops well below the LOC cap.~~ ✅ 2026-04-16 (`99ecc6ff`)
4. Decide whether policy knobs (`tools`, `extensions`, `blockedExtensions`) are real; enforce or delete them accordingly.
5. Verification checklist:
   - Start several subagents, call `abortAll`, and confirm tracker snapshots/events show all affected runs as aborted.
   - Run single, parallel, and chain modes and verify token counts/tool activity/live output still flow to the UI.
   - Create an ad-hoc inline subagent and a discovered named agent and confirm both still receive the intended prompt suffix.
   - Confirm child sessions still exclude recursive subagent tools and external extension loading per AD-021.

## Execution log
- 2026-04-12 — `4350404d` — `fix(desktop): harden wave d high-priority runtime paths`
  - Bulk aborts now mark matching tracker entries aborted before the pool cascade runs.
  - Added a local Pi SDK module augmentation so subagent session creation no longer needs a cast, and removed the remaining `session!` assertion from debug logging.
- 2026-04-16 — `99ecc6ff` — `refactor(desktop): extract shared subagent single-run executor`
  - Moved the duplicated single-run resolve/configure/track/run/finalize flow into `core/single-run.ts`.
  - Reduced `SubagentManager` to thin `runSingle()`/`runSingleStructured()` wrappers that preserve existing return contracts.
