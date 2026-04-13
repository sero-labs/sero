# Facts — plugins/sero-cron-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-cron-plugin/` is Sero’s global scheduler plugin. It owns three bridged Pi tools (`current_time`, `cron`, `reminder`), a module-level singleton scheduler that survives multiple session mounts, a file-backed state model at `~/.sero-ui/apps/cron/state.json`, and a federated React UI/widget for managing jobs, reminders, notification sound settings, and run history. Cron jobs execute in transient in-memory Pi sessions, while reminder delivery goes through the standard `sero:notify` event bus rather than Electron-specific APIs.

## Shape & metrics
- Total reviewable files: 44
- Total reviewable LOC: 9,055
- Largest source file: `plugins/sero-cron-plugin/extension/index.ts` (473 LOC)
- Files over 500 LOC: none in source (`README.md` is 656 LOC but docs are exempt)
- Near-cap source files (≥300 LOC):
  - `plugins/sero-cron-plugin/extension/index.ts` (473)
  - `plugins/sero-cron-plugin/ui/components/ReminderForm.tsx` (330)
  - `plugins/sero-cron-plugin/ui/CronApp.tsx` (329)
  - `plugins/sero-cron-plugin/extension/reminder-actions.ts` (310)
  - `plugins/sero-cron-plugin/ui/components/ModelPicker.tsx` (307)
- External dependencies of note:
  - Pi SDK session/runtime APIs (`createAgentSession`, `SessionManager.inMemory`, `createCodingTools`, `ExtensionAPI`)
  - `@sinclair/typebox` for the bridged tool schemas
  - `@sero-ai/app-runtime` for file-backed app state and prompt handoff from the remote UI
  - `@sero-ai/ui` for the federated React surface
  - Node `fs` / `fs.watch` for state persistence, logging, and scheduler sync
- Upstream callers / consumers of note:
  - Manifest-driven host discovery loads `CronApp` and `CronWidget` from `sero.app`
  - AD-020 manifest-first bridging exposes `current_time`, `cron`, and `reminder` through `sero-cli`
  - The dashboard widget system consumes the `scheduler-status` widget declared in `package.json`
- Downstream dependencies:
  - Global state file at `~/.sero-ui/apps/cron/state.json` (`resolveStatePath()` keeps a Pi CLI fallback under `.sero/apps/cron/state.json`)
  - Log file at `~/.sero-ui/apps/cron/cron.log`
  - Desktop notification/event-bus path via `pi.events.emit('sero:notify', …)`
  - `plugins/sero-memory-plugin/extension/cron-types.ts`, which mirrors part of this plugin’s persisted state shape
- Test surface:
  - 11 focused extension/shared test files (scheduler, lifecycle, state I/O, reminder actions, session runner, cron parsing)
  - No direct UI test coverage; `vitest.config.ts` only includes `extension/**` and `shared/**`

## Architectural notes
- The package follows the expected plugin-platform shape well: manifest metadata is complete, production Vite `base: './'` is correct, the widget is exposed explicitly, and tool registration goes through the normal AD-020 bridgeable `pi.registerTool()` path.
- Scheduler ownership is intentionally process-global. `extension/index.ts` keeps module-level singleton state plus a session refcount so multiple Sero sessions do not double-start the scheduler.
- The plugin is globally scoped in Sero. In normal desktop use the resolved state path is `SERO_HOME/apps/cron/state.json`, not a workspace-local file, even though the extension keeps Pi CLI fallback behavior for standalone use.
- UI and extension both mutate the same JSON file today. The extension owns some invariants (`validateChannel()`, completed-reminder pruning, recovery semantics), but the remote UI duplicates other mutations directly with `useAppState()` callbacks.
- A downstream plugin already mirrors cron state types instead of importing them directly (`plugins/sero-memory-plugin/extension/cron-types.ts`). Any persisted shape change here needs coordination beyond this package.

## Runtime-sensitive surfaces
- Startup ordering is behavior-sensitive: the scheduler does an immediate tick on `start()`, and recovery logic runs separately afterward. Any cleanup here must preserve reminder/job semantics across restart, not just type-shape cleanliness.
- `readState()` is a global truth surface. A malformed or partially-written file affects jobs, reminders, autostart, notification settings, and run history simultaneously.
- Reminder delivery is split across shared reminder state, the scheduler callbacks, and the `sero:notify` event-bus payload shape. “Email” is only a semantic label today; there is no actual email transport.
- The transient-session runner depends on process-wide environment state (`SERO_CRON_SUBPROCESS`) to avoid recursive scheduler startup during cron job execution.
- The plugin’s public README promises specific reminder/email/recovery behavior. Runtime cleanup here must keep the UI, tools, and docs aligned or explicitly retire drift.

## Surprising discoveries
- Missed reminders can currently notify twice on startup: `CronScheduler.start()` immediately ticks reminders before `runRecovery()` executes, but recovery still replays the same stale missed-reminder state.
- The UI and the tool surface disagree about email reminders. The README says the email option falls back to desktop notification, the UI allows selecting it, but `handleReminderAdd()` / `handleReminderUpdate()` reject `email` outright.
- The extension aggressively fails open on state reads: malformed JSON is treated the same as “first run,” so the next successful write can wipe the whole schedule/history file.
- The plugin has solid extension/shared test coverage but no UI coverage even though the UI owns direct persistence logic for reminder completion/toggling and notification settings.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Total reviewable files: 49 (was 44)
- Largest source file: `plugins/sero-cron-plugin/extension/index.ts` (500 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged in reminder/session-runtime seams outside the D1 state-integrity scope

### What changed
- `extension/state-io.ts` now defaults only on missing scheduler state and throws on malformed/unreadable JSON.
- `extension/index.ts` now surfaces unreadable-state failures to `/cron`, `cron`, and `reminder` callers instead of silently continuing with defaults.
- Extracted `extension/runtime-helpers.ts` to keep the singleton entrypoint under the repo’s 500-LOC cap while adding the new runtime error/reporting path.
- Updated state-I/O coverage to assert fail-closed malformed-state behavior; the broader cron test suite still passes.

### Still outstanding
- The remaining High item is still startup reminder recovery truthfulness / duplicate-fire behavior.
- Medium UI reminder ownership, logging, and `extension/index.ts` modularization work remain pending.
