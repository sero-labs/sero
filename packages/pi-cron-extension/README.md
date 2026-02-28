# @sero/cron

Cron scheduler for [Sero](../../README.md) — schedule recurring agent prompts
that run as isolated `pi -p` subprocesses. Manage jobs from the dashboard UI
or ask the agent to create them for you.

Adapted from [@e9n/pi-cron](https://github.com/espennilsen/pi/tree/main/extensions/pi-cron)
for the Sero platform. The Pi extension works standalone in the Pi CLI; the
React UI is Sero-only.

## Features

- **Visual dashboard** — add, edit, enable/disable, and remove jobs from the
  Sero UI. Live cron expression validation with human-readable previews.
- **Agent tool** — the LLM can manage jobs through the `cron` tool, so you
  can say "schedule a daily standup reminder at 9am" and it just works.
- **No database** — jobs are stored as JSON in a single state file. Both the
  UI and the extension read/write the same file; changes sync instantly.
- **Scheduler off by default** — nothing runs until you start it. Toggle from
  the UI or with `/cron on`.
- **Isolated execution** — each job runs as a `pi -p --no-session` subprocess
  with a 10-minute timeout. Jobs can't interfere with each other or with your
  active chat.
- **Run history** — the last 50 execution results (pass/fail, duration, errors)
  are visible in the History tab.
- **Global scope** — jobs are personal, not per-workspace. Your schedule
  persists across all projects.

---

## User Guide

### Opening the app

Click **Cron** (🕐) in the Sero sidebar. The dashboard has two tabs:

| Tab | What it shows |
|-----|---------------|
| **Jobs** | All configured cron jobs with status, schedule, and actions |
| **History** | Recent execution results with pass/fail status and timing |

### Creating a job

**From the UI:**

1. Click **+ New Job** (top-right corner or empty-state button).
2. Fill in the form:
   - **Name** — unique identifier, no spaces (e.g. `daily-standup`).
   - **Schedule** — a standard 5-field cron expression, or click a preset
     pill to fill one in. The form validates in real time and shows a
     human-readable description (e.g. "Weekdays at 09:00").
   - **Prompt** — the message sent to the agent when the job fires.
   - **Channel** — optional grouping tag (defaults to `cron`).
   - **Model** — optional model pattern or ID for this job
     (e.g. `sonnet`, `openai/gpt-4o`, `gemini:high`). Supports the
     `provider/id` shorthand and optional `:<thinking>` suffix. Leave
     blank to use whatever default is in your Pi settings.
3. Click **Add Job**.

**From the chat:**

Ask the agent naturally — it will use the `cron` tool:

```
Schedule a job called "daily-standup" that runs at 9am on weekdays
and asks "Review my todo tasks and summarize what's open"
```

You can also specify a model:

```
Add a cron job called "cheap-health-check" that runs every 15 minutes
using the model "flash" with the prompt "Check system health"
```

### Cron expression syntax

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

### Starting the scheduler

Jobs are stored immediately when created, but they only **execute** when
the scheduler is running.

**From the UI:** Click the **▶ Start** button in the status bar at the top
of the dashboard.

**From the chat:** Type `/cron on` or ask the agent to start it.

The status bar shows a green dot and "Scheduler Active" when running. It
also displays job counts (total, active, paused).

### Autostart

Toggle the **Autostart** switch in the status bar to have the scheduler
start automatically whenever Sero launches. When enabled, the extension
boots the scheduler on session start (as long as at least one job exists).
The setting persists across restarts — flip it once and forget about it.

### Managing jobs

Each job card in the Jobs tab has four actions:

| Action | What it does |
|--------|--------------|
| **Edit** | Opens the job form pre-filled with current values. Name cannot be changed. |
| **⏸ Disable / ▶ Enable** | Pauses or resumes a job without removing it. Disabled jobs stay in the list but won't fire on schedule. |
| **▶ Run** | Triggers the job immediately (requires the scheduler to be active). |
| **Remove** | Permanently deletes the job. |

All of these can also be done via the agent:

```
Disable the daily-standup cron job
```

```
Remove the health-check job
```

### Viewing history

Switch to the **History** tab to see recent executions. Each entry shows:

- ● Green dot (success) or red dot (failure)
- Job name
- Duration badge
- Error message (if failed)
- Relative timestamp ("2m ago", "1h ago")

The last 50 results are kept. History is stored in the same state file and
persists across sessions.

### Stopping the scheduler

**From the UI:** Click **⏸ Stop** in the status bar.

**From the chat:** Type `/cron off`.

Stopping the scheduler does not remove any jobs — they'll resume next time
you start it. The scheduler also stops automatically when Sero quits.

---

## Agent Tool Reference

The `cron` tool is available to the LLM in both Sero and the Pi CLI. In
Sero it's bridged through the `sero-cli` tool automatically.

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
name with a thinking-level suffix (`sonnet:high`). When omitted, the job
uses your default model.

## Commands

| Command | Description |
|---------|-------------|
| `/cron on` | Start the scheduler |
| `/cron off` | Stop the scheduler |
| `/cron` | Show status (active/inactive, job count) |

---

## Architecture

```
packages/pi-cron-extension/
├── package.json              # Pi + Sero manifest (global scope, port 5188)
├── vite.config.ts            # Module Federation remote config
├── shared/
│   ├── types.ts              # CronJob, CronState, CronRunResult
│   └── cron.ts               # 5-field parser, validator, cronToHuman
├── extension/
│   ├── index.ts              # Tool, /cron command, scheduler lifecycle
│   └── scheduler.ts          # CronScheduler — tick loop + subprocess runner
└── ui/
    ├── CronApp.tsx            # Root component — tabs, job list, status
    ├── components/
    │   ├── SchedulerBar.tsx   # Status indicator + start/stop toggle
    │   ├── JobCard.tsx        # Single job display with actions
    │   ├── JobForm.tsx        # Add/edit dialog with presets + validation
    │   └── RunHistory.tsx     # Recent execution results
    ├── lib/
    │   └── cron-utils.ts      # Presets, formatDuration, timeAgo
    ├── styles.css             # Tailwind + theme tokens
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
           (cron tool)         (useAppState)
                 │                 │
                 ▼                 ▼
           CronScheduler      Dashboard
           ticks every 30s    add/edit/remove
           spawns pi -p       toggle scheduler
           appends results    view history
```

Both sides read and write the same JSON file. The file IS the API:

- **Extension → file**: tool calls (add, remove, etc.) and scheduler run
  results write directly to `state.json` with atomic writes (temp + rename).
- **File → UI**: Sero's `AppStateManager` watches the file with `fs.watch`
  and pushes updates to the renderer via IPC. React re-renders instantly.
- **UI → file**: `useAppState` calls write through IPC to the main process,
  which performs the same atomic write. The extension picks up changes on
  its next read.

### State shape

```typescript
interface CronJob {
  name: string;        // Unique identifier
  schedule: string;    // 5-field cron expression
  prompt: string;      // Agent prompt
  channel: string;     // Grouping tag (default: "cron")
  disabled: boolean;   // Paused — won't fire on schedule
  model?: string;      // Model pattern (e.g. "sonnet", "openai/gpt-4o")
}

interface CronRunResult {
  jobName: string;
  startedAt: string;   // ISO timestamp
  durationMs: number;
  ok: boolean;
  error?: string;
}

interface CronState {
  jobs: CronJob[];
  schedulerActive: boolean;
  autostart: boolean;               // Start scheduler on launch
  lastRunResults: CronRunResult[];  // Capped at 50
}
```

### Global scope

Cron jobs are personal, not project-specific. State lives at
`~/.sero-ui/apps/cron/state.json` regardless of which workspace is active.
In the Pi CLI (where `SERO_HOME` is unset), the extension falls back to
`.sero/apps/cron/state.json` relative to the working directory.

### Scheduler

The scheduler is an in-memory `setInterval` loop that ticks every 30 seconds.
On each tick it:

1. Deduplicates by minute (only fires once per calendar minute).
2. Iterates all non-disabled jobs.
3. Matches each job's cron expression against the current local time.
4. For matches, spawns `pi -p --no-session --no-extensions <prompt>` as a
   child process with a 10-minute timeout.
5. Appends the result (pass/fail, duration, error) to `lastRunResults` in
   the state file.

The scheduler resets to inactive on startup — it does not survive process
restarts. Start it explicitly each session.

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
| `/tmp/sero-electron.log` | Extension loading, scheduler events |

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
| **Settings** | `settings.json` → `pi-cron` key (autostart, activeHours, etc.) | State file only (scheduler toggled via UI or command) |
| **Event API** | `cron:*` events for inter-extension communication | Not ported — apps communicate via shared state |
