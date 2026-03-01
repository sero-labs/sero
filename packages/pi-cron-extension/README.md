# @sero/cron

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
- **Visual dashboard** — three tabs (Reminders, Jobs, History) for managing
  everything. Live cron expression validation with human-readable previews.
- **Agent tools** — two LLM-callable tools (`reminder` and `cron`) so you
  can manage everything through natural conversation.
- **No database** — all state is stored as JSON in a single file. Both the
  UI and the extension read/write the same file; changes sync instantly.
- **Scheduler off by default** — nothing runs until you start it. Toggle from
  the UI or with `/cron on`.
- **Isolated job execution** — each cron job runs as a `pi -p --no-session`
  subprocess with a 10-minute timeout. Jobs can't interfere with each other
  or with your active chat.
- **Run history** — the last 50 cron job execution results (pass/fail,
  duration, errors) are visible in the History tab.
- **Global scope** — jobs and reminders are personal, not per-workspace.
  Your schedule persists across all projects.

> **Note — Email notifications:** The reminder channel option includes
> `email` alongside `notification` (desktop). However, **email delivery is
> not yet implemented**. Selecting the email channel currently falls back to
> a desktop notification with a "(email pending)" prefix. Email support
> will require SMTP or API configuration in a future update.

---

## User Guide

### Opening the app

Click **Cron** (🕐) in the Sero sidebar. The dashboard has three tabs:

| Tab | What it shows |
|-----|---------------|
| **Reminders** | All reminders with status filters, snooze, and management |
| **Jobs** | Configured cron jobs with status, schedule, and actions |
| **History** | Recent cron job execution results with pass/fail and timing |

---

### Reminders

#### Creating a reminder

**From the chat (recommended):**

Ask the agent naturally — it will use the `reminder` tool:

```
Set a reminder for 1 hour to phone mum
```

```
Remind me on Tuesday at 11am to wash the car
```

```
Create a reminder every Friday morning to pay the cleaner
```

You can also specify a notification channel:

```
Remind me at 5pm to pick up the parcel, send it by email
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
   - **Channel** — Desktop notification (default) or Email (coming soon).
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
boots the scheduler on session start (as long as at least one job or
reminder exists). The setting persists across restarts.

---

## Agent Tool Reference

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
| `channel` | `"notification"` (desktop, default) or `"email"` (not yet implemented) |
| `type` | `"once"` (default) — fires at `fire_at`; `"recurring"` — fires on `schedule` |
| `fire_at` | ISO datetime for one-time reminders (e.g. `"2025-03-15T14:30:00"`) |
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
packages/pi-cron-extension/
├── package.json                # Pi + Sero manifest (global scope, port 5188)
├── vite.config.ts              # Module Federation remote config
├── shared/
│   ├── types.ts                # CronJob, Reminder, CronState, CronRunResult
│   ├── cron.ts                 # 5-field parser, validator, cronToHuman
│   └── reminder-utils.ts       # Fire-time checks, snooze, status helpers
├── extension/
│   ├── index.ts                # Tools (cron + reminder), /cron cmd, lifecycle
│   ├── scheduler.ts            # CronScheduler — tick loop, jobs + reminders
│   ├── actions.ts              # Cron job action handlers
│   ├── reminder-actions.ts     # Reminder action handlers (CRUD + snooze)
│   ├── notifier.ts             # Desktop notification delivery
│   └── logger.ts               # File-based structured logger
└── ui/
    ├── CronApp.tsx              # Root — tabs (Reminders, Jobs, History)
    ├── components/
    │   ├── SchedulerBar.tsx     # Status indicator + start/stop + autostart
    │   ├── ReminderCard.tsx     # Single reminder with snooze dropdown
    │   ├── ReminderForm.tsx     # Add/edit reminder dialog
    │   ├── ReminderList.tsx     # Filterable reminder list with sorting
    │   ├── JobCard.tsx          # Single job display with actions
    │   ├── JobForm.tsx          # Add/edit job dialog with presets
    │   └── RunHistory.tsx       # Recent cron execution results
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
            tools)                 │
                 │                 ▼
                 ▼            Dashboard
           CronScheduler      ├─ Reminders tab
           ticks every 30s    ├─ Jobs tab
           ├─ cron matching   └─ History tab
           ├─ reminder checks
           ├─ snooze expiry
           └─ notifications
```

Both sides read and write the same JSON file. The file IS the API:

- **Extension → file**: tool calls and scheduler events write to
  `state.json` with atomic writes (temp + rename) protected by an
  async mutex.
- **File → UI**: Sero's `AppStateManager` watches the file with `fs.watch`
  and pushes updates to the renderer via IPC. React re-renders instantly.
- **UI → file**: `useAppState` calls write through IPC to the main process,
  which performs the same atomic write. The extension picks up changes on
  its next read.

### State shape

```typescript
interface CronState {
  jobs: CronJob[];
  reminders: Reminder[];
  schedulerActive: boolean;
  autostart: boolean;
  lastRunResults: CronRunResult[];  // Capped at 50
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
}
```

### Global scope

Jobs and reminders are personal, not project-specific. State lives at
`~/.sero-ui/apps/cron/state.json` regardless of which workspace is active.
In the Pi CLI (where `SERO_HOME` is unset), the extension falls back to
`.sero/apps/cron/state.json` relative to the working directory.

### Scheduler

The scheduler is an in-memory `setInterval` loop that ticks every 30 seconds.

**Cron jobs** (checked once per minute):

1. Iterates all non-disabled jobs.
2. Matches each job's cron expression against the current local time.
3. For matches, spawns `pi -p --no-session <prompt>` as a child process
   with a 10-minute timeout.
4. Appends the result to `lastRunResults` in the state file.

**Reminders** (checked every tick):

1. Iterates all reminders.
2. **Active one-time**: fires if `fireAt ≤ now` and hasn't fired yet.
3. **Active recurring**: fires if cron expression matches (once per minute).
4. **Snoozed**: fires if `snoozedUntil ≤ now`.
5. On fire: shows desktop notification, updates `lastFiredAt`, and
   transitions status (one-time → completed, recurring → stays active,
   snoozed → completed or active depending on type).

### Notifications

Desktop notifications use Electron's `Notification` API when running
inside Sero. In the Pi CLI (where Electron is unavailable), notifications
fall back to `console.log`.

> **Email channel**: The `email` channel is accepted as a configuration
> option on reminders but is **not yet functional**. When selected, the
> extension logs a warning and falls back to a desktop notification with
> a "(email pending)" prefix. Implementing email delivery will require
> SMTP configuration or an email API integration in a future release.

---

## Development

### Prerequisites

From the monorepo root:

```bash
pnpm install
pnpm --filter @sero/cron build
```

### Dev server

```bash
cd apps/desktop
bash scripts/dev.sh          # Starts all remotes + host + Electron
```

The cron remote runs on port **5188**. Edits to files in `ui/` trigger
live reload (~300ms). Extension changes (`extension/`) require a full
restart.

### Typecheck

```bash
pnpm --filter @sero/cron typecheck
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

| | @e9n/pi-cron | @sero/cron |
|---|---|---|
| **Storage** | `~/.pi/agent/pi-cron.tab` (custom text format) | `~/.sero-ui/apps/cron/state.json` (JSON) |
| **UI** | Vanilla HTML/CSS/JS served via pi-webserver | React + Tailwind via Module Federation |
| **State sync** | File watcher on `.tab` file reloads scheduler | `useAppState` + `fs.watch` syncs UI and extension |
| **Scope** | Tied to `~/.pi/agent/` | Global (`~/.sero-ui/`) with Pi CLI fallback |
| **Lock file** | PID lock at `~/.pi/agent/pi-cron.lock` | Not needed — single Electron process |
| **Web server** | Mounts on pi-webserver (`/cron`, `/api/cron`) | Not needed — federated UI is embedded |
| **Settings** | `settings.json` → `pi-cron` key | State file only (scheduler toggled via UI or command) |
| **Reminders** | Not supported | One-time + recurring reminders with snooze and notifications |
| **Event API** | `cron:*` events for inter-extension communication | Not ported — apps communicate via shared state |
