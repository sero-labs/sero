# Symphony User Guide

Symphony is a long-running orchestrator that polls an issue tracker for work, creates isolated workspaces per issue, and runs Codex coding-agent sessions to complete each issue automatically. It lives inside Sero as a global-scoped app.

## Quick Start

### 1. Create a WORKFLOW.md

Place a `WORKFLOW.md` file in your workspace root (or the global Sero workspace at `~/.sero-ui/workspaces/global/`). This file defines what Symphony should do and how.

**Minimal example (file-based tracker):**

```markdown
---
tracker:
  kind: file
  issues_dir: ~/my-project/issues
  active_states: [active]
  terminal_states: [done, failed]

agent:
  max_concurrent: 2

codex:
  command: codex
---

You are working on issue **{{ issue.title }}** ({{ issue.identifier }}).

{{ issue.description }}

Complete the task described above. When finished, commit your changes.
```

**Minimal example (Linear tracker):**

```markdown
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: my-project
  active_states: [Todo, In Progress]
  terminal_states: [Done, Canceled]

agent:
  max_concurrent: 2

codex:
  command: codex
---

You are working on Linear issue **{{ issue.title }}** ({{ issue.identifier }}).

{{ issue.description }}

Complete the task. When finished, create a PR and move the issue to review.
```

### 2. Start Symphony

**From the Sero UI:** Open the Symphony app from the sidebar, then click **Start**.

**From chat:** Ask the agent:
> Start Symphony

**From the command line (in a Sero/Pi session):**
```
/symphony start
```

### 3. Add Issues

**File tracker:** Drop `.md` files into the `active/` subfolder of your issues directory.

**Linear tracker:** Create issues in the configured Linear project. Symphony picks up issues in the configured active states on each poll cycle.

---

## Tracker Backends

Symphony supports two issue sources. Both produce the same internal `Issue` model — the orchestrator is tracker-agnostic.

### File-Based Tracker

Uses a local folder where subfolders represent issue states. Issues are Markdown files with YAML front matter.

**Folder structure:**

```
~/my-project/issues/
├── active/           ← Issues eligible for dispatch
│   ├── PROJ-001.md
│   └── PROJ-002.md
├── done/             ← Terminal: completed
│   └── PROJ-000.md
├── failed/           ← Terminal: agent gave up
│   └── PROJ-003.md
└── paused/           ← Paused (not active, not terminal)
    └── PROJ-004.md
```

**Issue file format:**

```markdown
---
id: PROJ-001
title: Add retry logic to payment service
priority: 2
labels: [backend, payments]
branch: feat/PROJ-001-retry-logic
blocked_by: []
---

## Description

The payment service currently fails silently when Stripe returns a 429.
Add exponential backoff retry logic with a max of 3 attempts.
```

**Front matter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | No | Unique ID. Defaults to filename (without `.md`) |
| `title` | No | Issue title. Defaults to filename |
| `priority` | No | Numeric priority (lower = higher priority) |
| `labels` | No | Array of labels (lowercased automatically) |
| `branch` | No | Git branch name for the issue |
| `blocked_by` | No | Array of issue identifiers this issue depends on |

**State transitions:** Moving a file between subfolders changes its state. For example, moving `PROJ-001.md` from `active/` to `done/` marks it as completed. This can be done manually, by scripts, or by CI/CD pipelines.

**Configuration:**

```yaml
tracker:
  kind: file
  issues_dir: ~/my-project/issues    # Path (~ and $VAR expanded)
  active_states: [active]             # Subfolder names for active issues
  terminal_states: [done, failed]     # Subfolder names for terminal states
```

### Linear Tracker

Polls the Linear GraphQL API for issues in a specific project.

**Configuration:**

```yaml
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY            # Environment variable reference
  project_slug: my-project            # Linear project slug
  active_states: [Todo, In Progress]  # Linear workflow states to poll
  terminal_states: [Done, Canceled]   # States that mean "finished"
```

**Requirements:**
- A Linear API key with read access to the project (set `LINEAR_API_KEY` in your environment or `.env`)
- The project slug matches the URL slug in Linear (e.g., `https://linear.app/myteam/project/my-project`)

---

## WORKFLOW.md Reference

The `WORKFLOW.md` file has two parts:

1. **YAML front matter** (between `---` delimiters) — configuration
2. **Markdown body** — the prompt template sent to the coding agent

### Configuration Sections

#### `tracker` (required)

See the [Tracker Backends](#tracker-backends) section above.

#### `polling`

Controls how often Symphony checks for new issues.

```yaml
polling:
  interval_ms: 30000        # Poll every 30 seconds (default)
  stall_timeout_ms: 300000   # Kill a session after 5 minutes of no events (default)
```

#### `workspace`

Where Symphony creates per-issue working directories.

```yaml
workspace:
  root: ~/.sero-ui/symphony/workspaces   # Default location
```

Each issue gets a subdirectory named after its identifier (sanitized). For example, issue `PROJ-001` gets workspace `~/.sero-ui/symphony/workspaces/PROJ-001/`.

#### `hooks`

Shell commands that run at workspace lifecycle events.

```yaml
hooks:
  after_clone: "npm install"              # Run after workspace is created
  before_remove: "git push origin HEAD"   # Run before workspace is deleted
  timeout_ms: 60000                       # Hook timeout (default: 60s)
```

#### `agent`

Concurrency and retry settings.

```yaml
agent:
  max_concurrent: 2           # Max parallel agent sessions (default: 2)
  max_retries: 3              # Max retry attempts per issue (default: 3)
  max_retry_backoff_ms: 320000  # Max backoff between retries (default: ~5 min)
```

#### `codex`

Coding agent subprocess settings.

```yaml
codex:
  command: codex               # Command to launch (default: codex)
  read_timeout_ms: 120000      # Max time waiting for agent output (default: 2 min)
  turn_timeout_ms: 600000      # Max time per turn (default: 10 min)
  max_turns: 10                # Max conversation turns per issue (default: 10)
```

### Prompt Template

The markdown body after the front matter is the prompt template. It supports `{{ variable }}` interpolation.

**Available variables:**

| Variable | Description |
|----------|-------------|
| `{{ issue.id }}` | Issue unique ID |
| `{{ issue.identifier }}` | Issue identifier (e.g., `PROJ-001`) |
| `{{ issue.title }}` | Issue title |
| `{{ issue.description }}` | Full issue description |
| `{{ issue.priority }}` | Priority number (or null) |
| `{{ issue.state }}` | Current issue state |
| `{{ issue.branchName }}` | Git branch name (or null) |
| `{{ issue.url }}` | Issue URL (Linear only) |
| `{{ issue.labels }}` | Array of labels |
| `{{ attempt }}` | Current retry attempt number |

**Example prompt:**

```markdown
You are an expert software engineer working on issue **{{ issue.title }}**.

**Issue ID:** {{ issue.identifier }}
**Priority:** {{ issue.priority }}
**Branch:** {{ issue.branchName }}

## Task Description

{{ issue.description }}

## Instructions

1. Read the existing code to understand the current implementation
2. Implement the changes described above
3. Write tests for your changes
4. Commit with a descriptive message referencing {{ issue.identifier }}
```

### Hot Reload

Symphony watches `WORKFLOW.md` for changes. When the file is saved, the new configuration and prompt template are applied immediately — no restart needed. If the updated config has validation errors, the previous valid config continues to be used.

---

## Tool Actions

Symphony registers a `symphony` tool with the following actions:

| Action | Description |
|--------|-------------|
| `start` | Start the orchestrator (begin polling for issues) |
| `stop` | Stop the orchestrator (all running sessions are terminated) |
| `status` | Show current state: active/inactive, tracker info, running/retrying counts, token totals |
| `refresh` | Trigger an immediate poll cycle (without waiting for the next interval) |
| `config` | Display the current effective configuration (parsed from WORKFLOW.md) |
| `issues` | List all running and retrying issues with their current phase |

**Usage via chat:**

> "Start Symphony"
> "What's the Symphony status?"
> "Refresh Symphony to pick up new issues"
> "Show me the current Symphony config"
> "List all Symphony issues"

**Usage via slash command:**

```
/symphony start
/symphony stop
/symphony status
```

---

## Dashboard UI

The Symphony app in the Sero sidebar shows a real-time dashboard:

### Header
- **Status indicator** — green (active), gray (inactive), or red (error)
- **Start/Stop button** — toggle the orchestrator
- **Refresh button** — trigger an immediate poll
- **Tracker info** — which backend (Linear/file) and project/directory

### Running Sessions Table
Lists all active agent sessions with:
- Issue identifier and title
- Current phase (preparing, launching, streaming, finishing, etc.)
- Turn count
- Elapsed time
- Token usage (input/output/total)
- Last event timestamp

Click a row to expand and see full details including session ID, PID, and last agent message.

### Retry Queue
Shows issues waiting to be retried:
- Issue identifier
- Attempt number
- Countdown to next retry
- Error from the previous attempt

### Token Totals
Aggregate statistics across all sessions:
- Total input/output/total tokens
- Total runtime
- Number of completed issues

### Workflow Status
Shown when the workflow has validation errors:
- Path to `WORKFLOW.md`
- Validation error messages
- Current config summary

---

## How It Works

### Poll-Dispatch Loop

1. **Poll** — Symphony fetches candidate issues from the tracker on each tick
2. **Filter** — Issues must be in an active state, not already claimed, not blocked
3. **Sort** — Candidates are sorted by priority (ascending), then creation date (oldest first)
4. **Dispatch** — If concurrency slots are available, issues are dispatched to agent sessions
5. **Reconcile** — Running sessions are checked for stalls and tracker state changes

### Agent Sessions

For each dispatched issue, Symphony:
1. Creates an isolated workspace directory
2. Runs the `after_clone` hook (if configured)
3. Renders the prompt template with issue data
4. Launches a Codex subprocess in the workspace
5. Streams events via JSON-RPC over stdio
6. Tracks token usage and turn count
7. Handles completion, failure, or timeout

### Retry Logic

When an agent session fails:
- **Continuation retry** — if the agent can continue, retries after 1 second
- **Failure retry** — exponential backoff: `min(10s × 2^(attempt-1), max_retry_backoff_ms)`
- After `max_retries` attempts, the issue is marked as failed

### State Persistence

Symphony writes periodic state snapshots to `~/.sero-ui/apps/symphony/state.json`. The UI reads this file via `useAppState()` for real-time updates. Changes from the UI (start/stop) are written back and picked up by the orchestrator via a file watcher.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINEAR_API_KEY` | Linear API key (referenced as `$LINEAR_API_KEY` in WORKFLOW.md) |
| `SERO_HOME` | Sero home directory (set automatically by Sero) |

Any `$VAR` reference in WORKFLOW.md config values is resolved from the process environment. Tilde (`~`) in paths is expanded to the user's home directory.

---

## Logging

Symphony logs to `~/.sero-ui/apps/symphony/symphony.log` with structured entries:

```
2026-03-11T10:30:00.000Z [INFO] symphony:started
2026-03-11T10:30:30.000Z [INFO] file-tracker:fetch-candidates {count: 3}
2026-03-11T10:30:30.500Z [INFO] orchestrator:dispatch {issueId: "PROJ-001", identifier: "PROJ-001"}
```

Log files rotate at 1MB.

---

## Troubleshooting

### "No WORKFLOW.md loaded"

Symphony looks for `WORKFLOW.md` in the workspace root. Make sure the file exists and is valid YAML + Markdown. Check the Workflow Status card in the UI for specific validation errors.

### "tracker.api_key is required for Linear"

Set the `LINEAR_API_KEY` environment variable before starting Sero, or add it to your `.env` file in `~/.sero-ui/agent/`.

### Issues not being picked up

- **File tracker:** Verify issue files are in the correct `active/` subfolder and have valid YAML front matter
- **Linear tracker:** Check that `project_slug` and `active_states` match your Linear project's workflow states exactly (case-sensitive)
- Run `symphony refresh` to trigger an immediate poll

### Agent sessions timing out

Increase `codex.turn_timeout_ms` or `codex.read_timeout_ms` in WORKFLOW.md. The default turn timeout is 10 minutes.

### Sessions stalling

If sessions appear stuck, the reconciler will kill them after `polling.stall_timeout_ms` (default: 5 minutes of no events). You can also run `symphony refresh` to trigger reconciliation manually.

### Token usage seems high

Check `agent.max_concurrent` — running many parallel sessions multiplies token usage. Consider reducing concurrency or using `codex.max_turns` to limit conversation depth.
