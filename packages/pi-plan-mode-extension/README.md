# Plan Mode — Sero Extension

Read-only exploration mode for safe code analysis, with progress-tracked
plan execution.

Adapted from the [Pi plan-mode extension](https://github.com/nickarbon/pi-mono/tree/main/packages/coding-agent/examples/extensions/plan-mode)
to work as a Sero app with a web UI dashboard.

## How It Works

### Pi TUI → Sero UI Mapping

| Pi TUI (`ctx.ui`)           | Sero equivalent                                    |
| --------------------------- | -------------------------------------------------- |
| `ctx.ui.setStatus()`        | State file → mode badge in web UI                  |
| `ctx.ui.setWidget()`        | State file → step list in web UI                   |
| `ctx.ui.notify()`           | `pi.sendMessage({ display: true })` in chat        |
| `ctx.ui.select()` (blocking)| Non-blocking message + `/plan-execute` command      |
| `ctx.ui.editor()`           | User types naturally in the chat                   |
| `Ctrl+Alt+P` shortcut       | "Enable/Disable Plan Mode" button in web UI        |

### Modes

1. **Normal** — Full tool access. No restrictions.
2. **Plan** — Read-only tools only. Bash filtered through an allowlist.
   The agent creates a numbered plan.
3. **Execute** — Full tools restored. The agent executes plan steps in
   order, marking each with `[DONE:n]`.

### Commands

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `/plan`          | Toggle plan mode on/off              |
| `/plan-execute`  | Start executing the current plan     |
| `/plan-todos`    | Show plan progress in chat           |

### Web UI

The dashboard (in the main app area) shows:

- **Mode badge** — current mode (Normal / ⏸ Plan / ▶ Execute)
- **Progress bar** — completion percentage during plan/execute
- **Step list** — numbered steps with completion checkmarks
- **Action buttons** — Enable/Disable Plan Mode, Execute Plan, Show Progress

### Usage

1. Click **Enable Plan Mode** (or type `/plan` in chat)
2. Ask the agent to analyse code and create a plan
3. The agent outputs a numbered plan under a `Plan:` header
4. Steps appear in the web UI dashboard
5. Click **Execute Plan** (or type `/plan-execute`)
6. The agent executes steps, marking `[DONE:n]` as it goes
7. Progress updates live in the dashboard

## State

Written to `.sero/apps/planmode/state.json` (workspace-scoped):

```json
{
  "mode": "plan",
  "steps": [
    { "step": 1, "text": "Analyse the auth module", "completed": false },
    { "step": 2, "text": "Refactor token validation", "completed": false }
  ]
}
```

Both the Pi extension (write) and web UI (read via `useAppState`) share
this file. Changes from the agent are reflected instantly in the UI.
