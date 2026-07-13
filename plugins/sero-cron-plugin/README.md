# @sero-ai/plugin-cron

Cron scheduler and reminders for [Sero](../../README.md) — schedule recurring
agent prompts and set reminders with desktop notifications. Manage everything
from the dashboard UI or ask the agent naturally.

Adapted from [@e9n/pi-cron](https://github.com/espennilsen/pi/tree/main/extensions/pi-cron)
for the Sero platform. The Pi extension works standalone in the Pi CLI; the
React UI is Sero-only.

## Features

- **Reminders** — set one-time or recurring reminders with desktop
  notifications. Ask the agent naturally ("Remind me in 1 hour to phone
  mum") or create them from the UI.
- **Snooze** — snooze fired reminders for 5 min, 15 min, 30 min, 1 hour,
  3 hours, or until tomorrow 9am.
- **Configurable notification sounds** — pick from 14 macOS system sounds
  (Glass, Hero, Ping, Pop, etc.) or disable sound entirely. Settings
  accessible via the 🔔 button in the scheduler bar.
- **Job completion notifications** — desktop notification when any cron job
  finishes (✅ success or ❌ failure with duration).
- **Visual dashboard** — four tabs (Reminders, Jobs, Loops, History) for
  managing everything. Live cron expression validation with human-readable
  previews.
- **Run output capture** — agent responses from cron job runs are saved and
  viewable in the History tab. Latest result auto-expands; older results
  show an inline preview with a toggle to expand.
- **Agent tools** — three LLM-callable tools (`current_time`, `reminder`,
  and `cron`) so you can manage everything through natural conversation.
- **No database** — all state is stored as JSON in a single file. Both the
  UI and the extension read/write the same file; changes sync instantly.
- **Scheduler off by default** — nothing runs until you start it. Toggle from
  the UI or with `/cron on`.
- **Isolated job execution** — each cron job runs in a dedicated transient
  `AgentSession` with `SessionManager.inMemory()`. Sessions are created on
  demand, never persisted to disk, and disposed immediately after the job
  completes. Jobs can't interfere with each other or with your active chat.
- **Concurrency control** — at most 2 cron jobs run simultaneously (configurable).
  Additional jobs queue and execute when a slot frees up. Duplicate runs of the
  same job are rejected immediately.
- **Run history** — the last 50 cron job execution results (pass/fail,
  duration, output, errors) are visible in the History tab. Clear history
  with one click.
- **Global scope** — jobs and reminders are personal, not per-workspace.
  Your schedule persists across all projects.

> **Note — Reminder delivery:** Reminders currently use the desktop
> notification channel only. Email delivery is not implemented yet, so the
> UI no longer offers it and tool calls should stick to `notification`.

---

## User Guide

### Opening the app

Click **Cron** (🕐) in the Sero sidebar. The dashboard has four tabs:

| Tab | What it shows |
|-----|---------------|
| **Reminders** | All reminders with status filters, snooze, and management |
| **Jobs** | Configured cron jobs with status, schedule, and actions |
| **Loops** | The workspace's scheduled Orchestrator loops — edit/pause their schedule or jump to the loop |
| **History** | Recent cron job execution results with expandable output |

---

### Reminders

#### Creating a reminder

**From the chat (recommended):**

Ask the agent naturally — it will use the `current_time` and `reminder`
tools:

```
Set a reminder for 1 hour to phone mum
```

```
Remind me on Tuesday at 11am to wash the car
```

```
Create a reminder every Friday morning to pay the cleaner
```

**From the UI:**

1. Click **+ Reminder** (top-right, visible when on the Reminders tab).
2. Fill in the form:
   - **Title** — what to remind you about (e.g. "Phone mum").
   - **Notes** — optional extra details.
   - **Type** — **One-time** (fires once at a specific datetime) or
     **Recurring** (fires on a cron schedule).
   - **When** (one-time) — pick a date and time with the datetime picker.
     Defaults to 1 hour from now.
   - **Schedule** (recurring) — a 5-field cron expression, or click a
     preset pill (e.g. "Every Friday morning", "Weekday mornings").
   - **Channel** — Desktop notification. Email delivery is not supported yet.
3. Click **Set Reminder**.

#### Snoozing a reminder

When a reminder fires, a desktop notification appears. You can snooze it
from the Sero UI:

1. Open the Reminders tab.
2. Find the reminder (snoozed/recently fired reminders sort to the top).
3. Click **💤 Snooze** and pick a duration:

| Option | Behaviour |
|--------|-----------|
| 5 minutes | Re-fires in 5 min |
| 15 minutes | Re-fires in 15 min |
| 30 minutes | Re-fires in 30 min |
| 1 hour | Re-fires in 1 hour |
| 3 hours | Re-fires in 3 hours |
| Tomorrow 9am | Re-fires at 9:00 AM tomorrow |

Snoozing can also be done via the agent:

```
Snooze the reminder abc12345 for 30 minutes
```

#### Managing reminders

Each reminder card has these actions:

| Action | What it does |
|--------|--------------|
| **Edit** | Opens the form pre-filled with current values |
| **⏸ Disable / ▶ Enable** | Pauses or resumes without removing |
| **💤 Snooze** | Delays the next notification |
| **✓ Done** | Marks the reminder as completed |
| **Remove** | Permanently deletes the reminder |

**Filter chips** above the list let you filter by status: All, Active,
Snoozed, Done, or Paused. Reminders are sorted by urgency — snoozed
reminders appear first, then active (soonest fire time first), then
disabled, then completed.

#### Reminder statuses

| Status | Meaning |
|--------|---------|
| 🔔 **Active** | Scheduled and will fire when due |
| 💤 **Snoozed** | Fired but user snoozed — will re-fire at the snooze expiry |
| ✅ **Done** | Completed/dismissed (one-time auto-completes after firing) |
| ⏸ **Paused** | User-disabled — won't fire until re-enabled |

#### How reminder scheduling works

- **One-time**: fires when the `fireAt` datetime passes, then auto-completes.
- **Recurring**: uses cron matching (same as cron jobs) — fires every time
  the schedule matches, stays active indefinitely.
- **Snoozed**: the scheduler checks `snoozedUntil` every 30 seconds and
  re-fires the notification when the snooze expires.

---

### Cron Jobs

#### Creating a job

**From the UI:**

1. Switch to the **Jobs** tab.
2. Click **+ Job** (top-right corner or empty-state button).
3. Fill in the form:
   - **Name** — unique identifier, no spaces (e.g. `daily-standup`).
   - **Schedule** — a standard 5-field cron expression, or click a preset
     pill. The form validates in real time and shows a human-readable
     description (e.g. "Weekdays at 09:00").
   - **Prompt** — the message sent to the agent when the job fires.
   - **Channel** — optional grouping tag (defaults to `cron`).
   - **Model** — optional model pattern or ID for this job
     (e.g. `sonnet`, `openai/gpt-4o`, `gemini:high`). Supports the
     `provider/id` shorthand and optional `:<thinking>` suffix. Leave
     blank to use whatever default is in your Pi settings.
4. Click **Add Job**.

**From the chat:**

```
Schedule a job called "daily-standup" that runs at 9am on weekdays
and asks "Review my todo tasks and summarize what's open"
```

You can also specify a model:

```
Add a cron job called "cheap-health-check" that runs every 15 minutes
using the model "flash" with the prompt "Check system health"
```

#### Cron expression syntax

Schedules use standard 5-field cron format:

```
┌───────────── minute (0–59)
│ ┌─────────── hour (0–23)
│ │ ┌───────── day of month (1–31)
│ │ │ ┌─────── month (1–12)
│ │ │ │ ┌───── day of week (0–6, Sun=0)
│ │ │ │ │
* * * * *
```

**Operators:**

| Operator | Example | Meaning |
|----------|---------|---------|
| `*` | `* * * * *` | Every unit (every minute) |
| `,` | `0,30 * * * *` | List — minute 0 and 30 |
| `-` | `1-5` (in dow) | Range — Monday through Friday |
| `/` | `*/15 * * * *` | Step — every 15 minutes |

**Common schedules:**

| Expression | Description |
|------------|-------------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour (at :00) |
| `0 9 * * *` | Daily at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 * * 0` | Weekly on Sunday at midnight |
| `0 0 1 * *` | Monthly on the 1st at midnight |
| `30 8,12,17 * * *` | 8:30 AM, 12:30 PM, and 5:30 PM daily |

#### Managing jobs

Each job card in the Jobs tab has four actions:

| Action | What it does |
|--------|--------------|
| **Edit** | Opens the job form pre-filled with current values. Name cannot be changed. |
| **⏸ Disable / ▶ Enable** | Pauses or resumes a job without removing it. |
| **▶ Run** | Triggers the job immediately (requires the scheduler to be active). |
| **Remove** | Permanently deletes the job. |

---

### Scheduler

Jobs and reminders are stored immediately when created, but they only
**execute** when the scheduler is running.

**From the UI:** Click the **▶ Start** button in the status bar at the top
of the dashboard.

**From the chat:** Type `/cron on` or ask the agent to start it.

The status bar shows a green dot and "Scheduler Active" when running. It
also displays counts for jobs, active jobs, paused jobs, and active
reminders.

**Stopping:** Click **⏸ Stop** in the status bar or type `/cron off`.
Stopping does not remove any jobs or reminders — they'll resume next
time you start it. The scheduler also stops automatically when Sero quits.

#### Autostart

Toggle the **Autostart** switch in the status bar to have the scheduler
start automatically whenever Sero launches. When enabled, the extension
boots the scheduler eagerly at extension load time (no need to open a chat
or send a message first). The setting persists across restarts.

#### Notification sound settings

Click the **🔔** icon in the scheduler bar to configure notification sounds:

- **Play sound** — toggle on/off
- **Sound** — choose from 14 macOS system sounds: Glass, Hero, Ping, Pop,
  Purr, Submarine, Tink, Basso, Blow, Bottle, Frog, Funk, Morse, Sosumi

Sound settings apply to both reminder notifications and job completion
notifications. The setting persists in `state.json`.

> **macOS notification persistence:** To make notifications stay on screen
> until dismissed (instead of auto-closing), go to **System Settings →
> Notifications → Electron** (or **Sero** when packaged) and set the
> notification style to **Alerts**.

---

### Run History

The History tab shows the last 50 job execution results.

Each row shows the job name, duration, a status indicator (green = success,
red = failure), and how long ago it ran.

**Viewing output:** Rows with captured output show a `▸ Output` button.
Click to expand and see the agent's full response. The most recent result
auto-expands if it has output. When collapsed, a truncated preview of the
first line is shown inline.

**Clearing history:** Click the **Clear** button in the top-right corner
of the History tab to remove all run results.

---

## Agent Tool Reference

### `current_time` tool

Returns the current date and time. The LLM should call this **before**
creating reminders with relative times (e.g. "in 5 minutes", "in 1 hour")
to compute an accurate `fire_at` value.

**Returns:**

```
Current time: 2026-03-01T13:45:00.000Z
Local: Saturday, 1 March 2026 at 13:45:00 GMT
Timezone: UTC+0:00
Unix: 1772541900000
```

### `reminder` tool

Manage reminders with desktop notifications. In Sero it's bridged through
the `sero-cli` tool automatically.

| Action | Required params | Optional params | Description |
|--------|----------------|-----------------|-------------|
| `list` | — | — | Show all reminders grouped by status |
| `add` | `title` | `notes`, `channel`, `type`, `fire_at`, `schedule` | Create a reminder |
| `update` | `id` | `title`, `notes`, `channel`, `fire_at`, `schedule` | Modify a reminder |
| `remove` | `id` | — | Delete a reminder |
| `snooze` | `id` | `snooze_minutes` | Snooze (default 15 min, use -1 for tomorrow 9am) |
| `complete` | `id` | — | Mark as done/dismiss |
| `enable` | `id` | — | Re-enable a disabled reminder |
| `disable` | `id` | — | Pause a reminder without removing it |

**Parameter details:**

| Parameter | Description |
|-----------|-------------|
| `id` | 8-character reminder ID (shown in list output) |
| `title` | What to remind about |
| `notes` | Optional extra details |
| `channel` | `"notification"` (desktop, default). Email delivery is not implemented yet. |
| `type` | `"once"` (default) — fires at `fire_at`; `"recurring"` — fires on `schedule` |
| `fire_at` | ISO datetime for one-time reminders. Call `current_time` first for accurate values. |
| `schedule` | Cron expression for recurring (e.g. `"0 9 * * 5"` = Fridays at 9am) |
| `snooze_minutes` | Minutes to snooze (default 15). Use `-1` for "tomorrow 9am". |

### `cron` tool

Manage scheduled cron jobs.

| Action | Required params | Optional params | Description |
|--------|----------------|-----------------|-------------|
| `list` | — | — | Show all jobs with status |
| `add` | `name`, `schedule`, `prompt` | `channel`, `model` | Create a new job |
| `update` | `name` | `schedule`, `prompt`, `channel`, `model` | Modify an existing job |
| `remove` | `name` | — | Delete a job |
| `enable` | `name` | — | Re-enable a disabled job |
| `disable` | `name` | — | Pause a job without removing it |
| `run` | `name` | — | Trigger a job immediately (scheduler must be active) |

The `model` parameter accepts any value that `pi --model` accepts: a model
name (`sonnet`, `flash`), a `provider/id` pair (`openai/gpt-4o`), or a
name with a thinking-level suffix (`sonnet:high`).

### Commands

| Command | Description |
|---------|-------------|
| `/cron on` | Start the scheduler |
| `/cron off` | Stop the scheduler |
| `/cron` | Show status (active/inactive, job count, reminder count) |

---

## Architecture

```
plugins/sero-cron-plugin/
├── package.json                 # Pi + Sero manifest (global scope, port 5188)
├── vite.config.ts               # Module Federation remote config
├── shared/
│   ├── types.ts                 # CronJob, Reminder, NotificationSettings, CronState
│   ├── cron.ts                  # 5-field parser, validator, cronToHuman
│   └── reminder-utils.ts       # Fire-time checks, snooze, status helpers
├── extension/
│   ├── index.ts                 # Singleton scheduler, tools, /cron cmd, lifecycle
│   ├── state-io.ts              # Path resolution, atomic read/write, mutex
│   ├── state-watcher.ts         # Directory-based fs.watch → scheduler sync
│   ├── scheduler.ts             # CronScheduler — tick loop, jobs + reminders
│   ├── session-runner.ts        # Transient in-memory AgentSession runner
│   ├── actions.ts               # Cron job action handlers
│   ├── reminder-actions.ts      # Reminder action handlers (CRUD + snooze)
│   ├── notifier.ts              # sero:notify EventBus emitter
│   ├── logger.ts                # File-based structured logger
│   └── __tests__/
│       ├── session-runner.test.ts  # Concurrency, cleanup, re-entrancy, timeout
│       └── scheduler.test.ts      # Tick execution, callbacks, running-set mgmt
└── ui/
    ├── CronApp.tsx              # Root — tabs (Reminders, Jobs, Loops, History)
    ├── components/
    │   ├── SchedulerBar.tsx     # Status + notification settings + start/stop
    │   ├── NotificationSettings.tsx # Sound toggle + sound picker popover
    │   ├── ReminderCard.tsx     # Single reminder with snooze dropdown
    │   ├── ReminderForm.tsx     # Add/edit reminder dialog
    │   ├── ReminderList.tsx     # Filterable reminder list with sorting
    │   ├── JobCard.tsx          # Single job display with actions
    │   ├── JobForm.tsx          # Add/edit job dialog with presets
    │   └── RunHistory.tsx       # Execution results with expandable output
    ├── lib/
    │   └── cron-utils.ts        # Presets, formatDuration, timeAgo
    ├── styles.css               # Tailwind + theme tokens + animations
    ├── tsconfig.json
    └── index.html
```

### How it works

```
                   state.json
                 (~/.sero-ui/apps/cron/)
                 ┌────────┴────────┐
                 │                 │
           Pi Extension        React UI
           (cron + reminder    (useAppState)
            + current_time)        │
                 │                 ▼
                 ▼            Dashboard
           CronScheduler      ├─ Reminders tab
           ticks every 30s    ├─ Jobs tab
           ├─ cron matching   └─ History tab
           ├─ reminder checks
           ├─ snooze expiry
           └─ sero:notify → desktop notifications
```

Both sides read and write the same JSON file. The file IS the API:

- **Extension → file**: tool calls and scheduler events write to
  `state.json` with atomic writes (temp + rename) protected by an
  async mutex.
- **File → scheduler**: a directory-based `fs.watch` detects changes
  (including atomic renames) and syncs updated jobs/reminders into the
  scheduler's in-memory state.
- **File → UI**: Sero's `AppStateManager` watches the file and pushes
  updates to the renderer via IPC. React re-renders instantly.
- **UI → file**: `useAppState` calls write through IPC to the main process,
  which performs the same atomic write.

### Notifications

The extension uses the **`sero:notify` EventBus pattern** for
notifications. This keeps extensions decoupled from Electron:

1. The extension emits `pi.events.emit('sero:notify', { message, type, sound, source })`
2. The Sero host extension factory listens on `pi.events.on('sero:notify', ...)`
3. The listener calls `showNotification()` which uses Electron's native
   `Notification` API with configurable macOS system sounds.

Any Pi extension can use this pattern — no `require('electron')` needed.
In the Pi CLI (where the Sero host isn't present), notifications fall back
to `console.log`.

### Singleton scheduler

The scheduler is a **module-level singleton**. The extension's default
export may be called multiple times (once per Sero session), but all
invocations share the same `initialized` flag, `scheduler` instance, and
`stateWatcher`. This prevents duplicate job execution.

### State shape

```typescript
interface CronState {
  jobs: CronJob[];
  reminders: Reminder[];
  schedulerActive: boolean;
  autostart: boolean;
  lastRunResults: CronRunResult[];  // Capped at 50
  notificationSettings?: NotificationSettings;
}

interface CronJob {
  name: string;        // Unique identifier
  schedule: string;    // 5-field cron expression
  prompt: string;      // Agent prompt
  channel: string;     // Grouping tag (default: "cron")
  disabled: boolean;
  model?: string;      // Model pattern (e.g. "sonnet", "openai/gpt-4o")
}

interface Reminder {
  id: string;          // 8-char unique ID
  title: string;
  notes?: string;
  channel: 'notification' | 'email';
  type: 'once' | 'recurring';
  fireAt?: string;     // ISO datetime (one-time)
  schedule?: string;   // Cron expression (recurring)
  status: 'active' | 'snoozed' | 'completed' | 'disabled';
  snoozedUntil?: string;  // ISO datetime
  createdAt: string;
  lastFiredAt?: string;
  completedAt?: string;
}

interface CronRunResult {
  jobName: string;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  error?: string;
  output?: string;     // Agent response (extension noise stripped)
}

interface NotificationSettings {
  soundEnabled: boolean;     // Whether to play a sound
  soundName: string;         // macOS sound name (default: "Glass")
}
```

### Global scope

Jobs and reminders are personal, not project-specific. State lives at
`~/.sero-ui/apps/cron/state.json` regardless of which workspace is active.
In the Pi CLI (where `SERO_HOME` is unset), the extension falls back to
`.sero/apps/cron/state.json` relative to the working directory.

### Scheduler internals

The scheduler is an in-memory `setInterval` loop that ticks every 30 seconds.

**Cron jobs** (checked once per minute):

1. Iterates all non-disabled jobs.
2. Matches each job's cron expression against the current local time.
3. For matches, creates a transient `AgentSession` via `session-runner.ts`:
   - Acquires a concurrency slot (max 2 concurrent, duplicate job key rejected).
   - Sets `SERO_CRON_SUBPROCESS=1` to prevent the cron extension from
     starting a second scheduler inside the transient session (re-entrancy guard).
   - Calls `createAgentSession()` with `SessionManager.inMemory()` — no
     session files are written to disk.
   - Sends the prompt and waits for completion (10-minute timeout).
   - Extracts the agent's text response from the last assistant message.
   - Disposes the session and releases the concurrency slot (guaranteed
     via `finally` blocks, even on errors or timeouts).
4. Appends the result (with output) to `lastRunResults` in the state file.
5. Fires a desktop notification on completion.

**Reminders** (checked every tick):

1. Iterates all reminders.
2. **Active one-time**: fires if `fireAt ≤ now` and hasn't fired yet.
3. **Active recurring**: fires if cron expression matches (once per minute).
4. **Snoozed**: fires if `snoozedUntil ≤ now`.
5. On fire: shows desktop notification (with configured sound), updates
   `lastFiredAt`, and transitions status (one-time → completed,
   recurring → stays active, snoozed → completed or active depending on
   type).

---

## Development

### Prerequisites

From the monorepo root:

```bash
pnpm install
pnpm --filter @sero-ai/plugin-cron build
```

### Dev server

```bash
cd apps/desktop
SERO_DEV_PLUGINS=cron bash scripts/dev.sh          # Starts cron in dev mode + host + Electron
```

When started with `SERO_DEV_PLUGINS=cron`, the cron remote runs on port
**5188**. Edits to files in `ui/` trigger live reload (~300ms). Extension
changes (`extension/`) require a full restart.

### Tests

```bash
pnpm --filter @sero-ai/plugin-cron test         # Run once
pnpm --filter @sero-ai/plugin-cron test:watch   # Watch mode
```

The test suite (34 tests) covers:

- **Session runner** (20 tests) — session lifecycle (create → prompt →
  dispose), `SessionManager.inMemory()` usage, cleanup on errors,
  re-entrancy guard (`SERO_CRON_SUBPROCESS` env management), concurrency
  limits (max slots, duplicate rejection, slot release), timeout + abort,
  and output extraction from assistant messages.
- **Scheduler** (14 tests) — job execution via transient sessions,
  `onJobStart` / `onJobComplete` callbacks (success + failure),
  running-set dedup and cleanup, tick-based cron matching, disabled-job
  skipping, once-per-minute guard, and lifecycle (stop, updateJobs).

All Pi SDK dependencies are mocked — tests run in <1s with no network or
auth required.

### Typecheck

```bash
pnpm --filter @sero-ai/plugin-cron typecheck
```

### Logs

| File | Contents |
|------|----------|
| `/tmp/sero-remote-cron.log` | Cron remote Vite dev server |
| `/tmp/sero-electron.log` | Extension loading, scheduler events, reminder fires |
| `~/.sero-ui/apps/cron/cron.log` | Structured extension log (rotates at 1 MB) |

---

## Differences from @e9n/pi-cron

This package is adapted from the original
[pi-cron](https://github.com/espennilsen/pi/tree/main/extensions/pi-cron)
extension for the Sero platform. Key differences:

| | @e9n/pi-cron | @sero-ai/plugin-cron |
|---|---|---|
| **Storage** | `~/.pi/agent/pi-cron.tab` (custom text format) | `~/.sero-ui/apps/cron/state.json` (JSON) |
| **UI** | Vanilla HTML/CSS/JS served via pi-webserver | React + Tailwind via Module Federation |
| **State sync** | File watcher on `.tab` file reloads scheduler | Directory-based `fs.watch` + `useAppState` |
| **Scope** | Tied to `~/.pi/agent/` | Global (`~/.sero-ui/`) with Pi CLI fallback |
| **Job execution** | `pi -p --no-session` subprocess | In-process transient `AgentSession` (in-memory, disposed after use) |
| **Lock file** | PID lock at `~/.pi/agent/pi-cron.lock` | Not needed — singleton scheduler in Electron process |
| **Web server** | Mounts on pi-webserver (`/cron`, `/api/cron`) | Not needed — federated UI is embedded |
| **Settings** | `settings.json` → `pi-cron` key | State file only (scheduler toggled via UI or command) |
| **Reminders** | Not supported | One-time + recurring reminders with snooze and notifications |
| **Notifications** | Not supported | `sero:notify` EventBus → Electron Notification API with configurable sounds |
| **Output capture** | Not supported | Agent responses saved in run results, viewable in History tab |
| **Event API** | `cron:*` events for inter-extension communication | Not ported — apps communicate via shared state |
