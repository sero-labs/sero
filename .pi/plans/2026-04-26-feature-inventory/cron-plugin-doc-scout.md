# Cron plugin docs scout

## Relevant Files
- `plugins/sero-cron-plugin/package.json` — plugin/app registration, user-facing app name, widget surface, state file location, and exposed UI component name.
- `plugins/sero-cron-plugin/extension/index.ts` — extension entry; registers the scheduler singleton, session lifecycle hooks, `/cron` command, and `current_time` / `cron` / `reminder` tools.
- `plugins/sero-cron-plugin/extension/tools.ts` — tool schemas, command names, tool descriptions, and the exact actions users can invoke.
- `plugins/sero-cron-plugin/extension/runtime.ts` — scheduler lifecycle, command handling, tool execution, autostart, state updates, and missed-run recovery bootstrap.
- `plugins/sero-cron-plugin/extension/scheduler.ts` — tick cadence, cron matching, ad-hoc run behavior, reminder firing, and notification hooks.
- `plugins/sero-cron-plugin/extension/recovery.ts` — missed job/reminder recovery window logic and opt-in behavior.
- `plugins/sero-cron-plugin/extension/notifier.ts` — desktop notification emission, job-complete notifications, reminder channel handling, and email stub behavior.
- `plugins/sero-cron-plugin/extension/state-io.ts` — state path resolution and JSON persistence details.
- `plugins/sero-cron-plugin/extension/actions.ts` — cron job CRUD and ad-hoc run semantics.
- `plugins/sero-cron-plugin/extension/reminder-actions.ts` — reminder CRUD, snooze/complete/enable-disable semantics, validation, and user-facing messages.
- `plugins/sero-cron-plugin/shared/types.ts` — shared reminder/state shape, notification settings, snooze options, and supported reminder channels/statuses.
- `plugins/sero-cron-plugin/ui/CronApp.tsx` — top-level app surface and available tabs/actions.
- `plugins/sero-cron-plugin/ui/widgets/CronWidget.tsx` — compact dashboard widget surface.
- `plugins/sero-cron-plugin/ui/components/JobForm.tsx` / `ReminderForm.tsx` / `SchedulerBar.tsx` / `ReminderList.tsx` / `JobsTab.tsx` / `NotificationSettings.tsx` — user-facing controls and caveats shown in the UI.
- `packages/common/src/cron-contract.ts` — canonical cron job/state contract shared across app and extension.

## User-facing names and surfaces
- App name in Sero: **Scheduler** (`sero.app.name`).
- Plugin id: `cron`.
- Command: `/cron` with `on|off|status` (also accepts `start|stop` aliases).
- Tools: `current_time`, `cron`, `reminder`.
- Cron tool actions: `list`, `add`, `update`, `remove`, `enable`, `disable`, `run`.
- Reminder tool actions: `list`, `add`, `update`, `remove`, `snooze`, `complete`, `enable`, `disable`.
- Dashboard widget: `CronWidget` / widget id `scheduler-status`, labeled **Scheduler**.
- Main UI tabs: **Jobs**, **Reminders**, **History**.

## Mental model: jobs vs reminders
- **Cron jobs** are recurring agent prompts. They run on a cron expression and send a prompt to the agent when they fire.
- **Reminders** are notifications-first items. They can be one-time (`once`) or recurring (`recurring`) and currently only deliver through desktop notifications.
- Cron jobs have a `prompt`, optional `model`, optional `channel` tag, and optional `runIfMissed` recovery flag.
- Reminders have a `title`, optional `notes`, `channel`, `type`, either `fireAt` or `schedule`, persisted status, and optional `recoverIfMissed` flag. Status is saved state, not a user-settable tool parameter.

## Supported actions and behavior
- `cron add` requires `name`, `schedule`, and `prompt`; `cron update` requires `name` plus optional fields to change (`schedule`, `prompt`, `channel`, `model`, `run_if_missed`); `run` triggers a transient background session immediately.
- `reminder add` requires `title` plus either `fire_at` for one-time reminders or `schedule` for recurring reminders; `reminder update` requires `id` plus optional fields to change.
- Reminder `snooze` requires `id` and accepts `snooze_minutes` with a default of 15; `-1` is documented as “tomorrow 9am” in the schema comment and UI presets.
- Reminder `complete`, `remove`, `enable`, and `disable` operate by `id`; `complete` marks reminders completed/dismissed while `disable`/`enable` toggle state.
- `current_time` returns ISO time, local time, timezone offset, and Unix time, and the docs explicitly tell agents to call it before using relative reminder times.

## Notifications and caveats
- Reminder notifications are emitted through `pi.events.emit('sero:notify', ...)` and routed by the host to macOS notifications.
- Job completion notifications use the same `sero:notify` path and include success/failure, duration, and optional sound.
- Notification sound is user-configurable in the UI (`Glass`, `Hero`, `Ping`, etc.) and can be turned off.
- Reminder `channel` currently supports `notification` only in the tool schema; `email` exists in shared types / notifier logic but is explicitly not implemented and falls back to desktop notification with a warning.
- The docs should avoid claiming guaranteed delivery: notifications depend on Sero/host being available, and email is not actually supported yet.

## Missed-run / recovery behavior
- Recovery is opt-in per item: cron jobs use `run_if_missed`, reminders use `recover_if_missed`.
- Recovery only looks at the window from the last scheduler shutdown or today’s midnight, whichever is later; very short windows under 2 minutes are skipped.
- Missed cron jobs are only recovered if they would have matched in that window and are not disabled.
- Missed reminders are only recovered if the flag is set and the reminder was not completed/disabled.
- On startup, recovered cron jobs are executed; recovered reminders trigger a notification only.
- Scheduler restart within the same minute preserves `lastTickMinute` to avoid duplicate cron job firing.

## State / storage
- Shared state shape is in `packages/common/src/cron-contract.ts`; plugin-specific reminder and notification types are layered in `plugins/sero-cron-plugin/shared/types.ts`.
- State file path is resolved to `~/.sero-ui/apps/cron/state.json` when `SERO_HOME` is present; otherwise it falls back to `./.sero/apps/cron/state.json` under the current workspace.
- `package.json` advertises `stateFile: ".sero/apps/cron/state.json"` for the Sero app config.
- State includes jobs, reminders, `schedulerActive`, `autostart`, `lastTickMinute`, `lastSchedulerShutdown`, `lastRunResults`, and `notificationSettings`.
- Writes are serialized through a mutex and persisted atomically via temp-file rename.

## UI / widget surfaces
- `CronApp` defaults to the **Reminders** tab, with a top status bar showing scheduler state, autostart, and notification settings.
- Jobs tab exposes add/edit/remove/enable-disable/run-now actions, plus a “run if missed” option.
- Reminder UI exposes add/edit/remove/snooze/complete/enable-disable and a “recover if missed” option.
- The widget shows scheduler active/paused, counts for jobs and reminders, up to 3 upcoming jobs/reminders, and recent job-result dots.
- The widget’s countdown labels are intentionally simplified; they are not a full scheduling explanation.

## Gotchas
- The scheduler is a module-level singleton; docs should avoid implying multiple independent schedulers per session or workspace.
- `schedulerActive` can be stale and is reset on startup if the scheduler is not actually running.
- Cron jobs run in transient in-memory sessions; they do not reuse the user’s visible session and are not persistent processes.
- Reminder “email” is a placeholder path, not a shipped feature.
- A “run now” cron action is background-only and records history asynchronously; it does not block until completion.
- The code’s recovery logic is conservative and only handles same-day misses, so it should not be described as a full catch-up system for long outages.
