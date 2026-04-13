# Refactoring Plan — plugins/sero-cron-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-cron-plugin/` is structurally close to a good exemplar plugin: the manifest/build wiring is correct, the singleton scheduler design is explicit, and the extension/shared split is much cleaner than most built-ins. The debt is in runtime truthfulness, not scaffolding. Startup reminder recovery currently fights the scheduler’s own immediate tick, state-file reads fail open in a way that can erase the entire global schedule, and the UI bypasses reminder invariants that the extension tool path tries to enforce. The right outcome is a single truthful reminder lifecycle, fail-loud state I/O, shared reminder mutation rules across UI + tool paths, and a thinner extension entrypoint.

## Issues Found (prioritized)
- **High** — Startup reminder recovery double-fires and does not own state transitions truthfully — `plugins/sero-cron-plugin/extension/index.ts:62-85` starts the scheduler and only then runs `runRecovery(state)`, while `plugins/sero-cron-plugin/extension/scheduler.ts:46-68,171-190` immediately ticks reminders on `start()` and already calls `onReminderFire` / `onReminderUpdate` for due items. `plugins/sero-cron-plugin/extension/recovery.ts:104-147` then replays missed reminders from the pre-start snapshot without persisting post-recovery reminder state. In practice, reminders missed while Sero was closed can notify twice on startup, and the recovery path is not a truthful source of `lastFiredAt` / completion history. For a global scheduler plugin, that is a real behavior bug, not cosmetic debt. Effort: **M**.

- **High** — State-file reads fail open and can silently wipe the user’s global schedule/history — `plugins/sero-cron-plugin/extension/state-io.ts:35-42` returns a brand-new default state on every read failure, including malformed JSON or transient partial writes. Because nearly every lifecycle/tool path (`plugins/sero-cron-plugin/extension/index.ts:116-147,177-229,327-356,405-443`) trusts `readState()`, one corrupted read can turn into the next successful write replacing all jobs, reminders, notification settings, and run history with defaults. In Sero specifically, this breaks the plugin’s only persistence surface. Effort: **S**.

- **Medium** — The UI bypasses reminder invariants that the extension tool path owns — `plugins/sero-cron-plugin/ui/CronApp.tsx:117-161` mutates reminder state directly with `useAppState()` callbacks, and `plugins/sero-cron-plugin/ui/components/ReminderForm.tsx:274-289` offers an `email` option. But `plugins/sero-cron-plugin/extension/reminder-actions.ts:123-139,170-176,257-308` rejects `email` in `validateChannel()` and applies completed-reminder pruning that the UI completion path never runs. The result is two reminder mutation contracts: one for agents/tools and one for humans. Effort: **M**.

- **Medium** — Logging does synchronous file I/O on the runtime path and hides failures — `plugins/sero-cron-plugin/extension/logger.ts:11-12,68-92` uses `appendFileSync`, `statSync`, `renameSync`, and `mkdirSync`, then swallows file-write and rotation errors. This plugin logs timer ticks, lifecycle events, and recovery behavior from a long-lived extension process; blocking sync I/O plus silent failure is the wrong trade-off when logs are also the main diagnostic surface for scheduler bugs. Effort: **S**.

- **Medium** — `extension/index.ts` is still a near-cap singleton hub with too many reasons to change — `plugins/sero-cron-plugin/extension/index.ts:62-150` handles recovery/persistence callbacks, `plugins/sero-cron-plugin/extension/index.ts:154-233` owns singleton lifecycle, and `plugins/sero-cron-plugin/extension/index.ts:266-466` registers commands and both bridged tools. The file is under the 500-LOC cap, but it is still the one place where lifecycle, recovery, tool schemas, notifier wiring, and persistence semantics all collide. Effort: **M**.

- **Medium** — The current test surface protects extension/shared internals but not the UI-owned mutation paths — `plugins/sero-cron-plugin/vitest.config.ts:5-6` only includes `extension/**` and `shared/**`, while reminder/job mutations in `plugins/sero-cron-plugin/ui/CronApp.tsx:61-161` and widget rendering in `plugins/sero-cron-plugin/ui/widgets/CronWidget.tsx:38-122` have no direct coverage. That gap already matters because one of the contract drifts lives entirely in the UI path. Effort: **M**.

- **Low** — The dashboard widget is more illustrative than truthful — `plugins/sero-cron-plugin/ui/widgets/CronWidget.tsx:13-26,50-51` labels itself as showing upcoming jobs/reminders but only renders simplified cron labels / relative fire strings, and it assumes `state.reminders` is always present instead of using the same migration guard as `plugins/sero-cron-plugin/ui/CronApp.tsx:35`. It is not broken enough to block other work, but it is the kind of loose edge that spreads when exemplar plugins are copied. Effort: **S**.

## Proposed Refactoring
1. **Unify missed-reminder recovery with the scheduler’s real reminder transition path.**
   - Stop treating “startup recovery” as a second notification engine.
   - Target structure:
     - `extension/recovery.ts` should only decide *which* jobs/reminders were missed and return explicit recovery actions.
     - One canonical reminder-transition helper should own notification + post-fire state (`lastFiredAt`, `completedAt`, `snoozedUntil`, recurring vs once semantics), whether the reminder fired during a normal tick or during startup recovery.
   - The easiest safe shape is: detect recovery candidates before or during scheduler boot, feed them through the same transition helper the tick path uses, and persist the resulting reminder updates under the state lock before the scheduler starts processing the same snapshot again.
   - This keeps behavior aligned with the plugin’s core promise: one reminder should generate one truthful post-fire state transition.

2. **~~Make `readState()` distinguish first-run from malformed/unreadable state.~~ ✅ 2026-04-13 (`336b790a`)**
   - Default state should be returned only for genuine missing-file cases (`ENOENT`).
   - Parse errors, permission problems, and partial-write reads should surface as explicit errors to callers.
   - Add one small normalization helper to fill optional fields like `reminders` / `notificationSettings` without pretending corrupted JSON is valid.
   - Update caller behavior in `extension/index.ts` and `StateWatcher` so malformed state blocks mutation/recovery instead of silently resetting the schedule.
   - This mirrors the broader Sero deslop pattern already applied to other persisted JSON registries: fail closed on corruption, not open.

3. **Centralize reminder mutation rules in a shared pure helper layer used by both the extension and the UI.**
   - Do not make the React remote re-implement reminder business rules ad hoc.
   - Target structure:
     - `shared/reminder-mutations.ts` (or equivalent) for pure add/update/complete/toggle/prune/channel policy helpers
     - `extension/reminder-actions.ts` becomes a thin tool adapter over those helpers + state writes
     - `ui/CronApp.tsx` and `ui/components/ReminderForm.tsx` call the same helpers before writing state
   - Make one explicit product decision on `email`:
     - either remove it from the UI/docs until real transport exists, or
     - accept it consistently everywhere as a labeled fallback-to-desktop mode.
   - Whatever choice lands, the tool help, UI form, notifier behavior, and README must all say the same thing.

4. **Move logger file writes off sync filesystem calls and stop suppressing real logging failures.**
   - Replace `appendFileSync` / `statSync` / `renameSync` with async equivalents or a small serialized append queue.
   - Keep the “logging must never crash the extension” rule, but emit one explicit console/event-bus warning when file logging is unavailable instead of silently going dark.
   - Preserve the current structured log format and rotation behavior.

5. **Split `extension/index.ts` by responsibility before more behavior changes land there.**
   - Suggested modules:
     - `extension/lifecycle.ts` for singleton init/start/stop/refcount handling
     - `extension/runtime-callbacks.ts` for append/persist/notifier wiring
     - `extension/tools.ts` for schema + registration of `current_time`, `cron`, and `reminder`
   - Keep the default export as a thin composition root.
   - This aligns with the plugin-exemplar goal: future plugins should copy a small composition entrypoint, not a 473-line singleton kitchen sink.

6. **Add targeted tests for the real gaps before medium cleanup spreads.**
   - Extension tests:
     - missed one-time reminder on startup fires once and becomes completed
     - missed recurring reminder recovery updates `lastFiredAt` once
     - malformed `state.json` blocks mutation instead of resetting to defaults
   - Shared/UI tests:
     - reminder completion path prunes completed reminders consistently
     - UI and extension treat `email` the same way
     - widget handles legacy/missing `reminders` arrays safely
   - If full remote-component tests feel too heavy, at minimum test the new shared mutation helpers directly so UI and tool paths cannot drift again.

## Benefits & Trade-offs
- Benefits: removes a real duplicate-notification bug, stops silent global schedule loss, restores one reminder contract across human + agent paths, and makes the extension easier to review and evolve.
- Trade-offs: state-I/O hardening will surface errors that the plugin currently hides, and the reminder-contract cleanup will require coordinated README/help/UI wording updates rather than code-only churn.

## Dependencies & Risks
- The recovery fix is behavior-sensitive. Startup notification timing, once-vs-recurring completion rules, and `lastFiredAt` semantics all need targeted verification, not just green types.
- Hardening `readState()` changes failure behavior. Users with already-corrupted `state.json` files may now see explicit errors instead of the plugin silently continuing with an empty schedule; that is the correct trade-off, but it needs a user-facing recovery message.
- Reminder state shape changes or new required fields must be coordinated with `plugins/sero-memory-plugin/extension/cron-types.ts:1-31`, which mirrors part of this plugin’s persisted contract.
- If the team removes the UI’s `email` option, the README examples/help text need to change in the same patch. If the team keeps it as a fallback mode, the tool path and notifier docs need to stop contradicting each other.
- Logger changes must preserve the current “never crash the extension” behavior even while making file-I/O failures visible.

## Next Steps
1. Fix the reminder recovery pipeline first; it is the only documented active behavior bug in this review.
2. Harden `state-io.ts` so malformed state cannot silently reset the global scheduler file.
3. Extract shared reminder mutation helpers and make the UI + extension consume them.
4. Split `extension/index.ts` once the recovery/state semantics are stable.
5. Add recovery + shared-mutation tests before any broader Medium cleanup.

Verification checklist:
- Starting Sero after missing a one-time reminder produces exactly one notification and persists that reminder as completed.
- Starting Sero after missing a recurring reminder produces exactly one notification for the recovery window and does not immediately double-fire on the first scheduler tick.
- A malformed `~/.sero-ui/apps/cron/state.json` no longer causes the next mutation to overwrite the file with an empty default schedule.
- Completing reminders from the UI and from the `reminder` tool yields the same pruning/capping behavior.
- The UI, tool help, notifier behavior, and README all describe the same `email` behavior.
- The dashboard widget still loads in production after the extension/UI module split, and the plugin keeps its relative `base: './'` MF behavior intact.

## Execution log
- `336b790a` — `fix(plugins): harden persisted state integrity`
