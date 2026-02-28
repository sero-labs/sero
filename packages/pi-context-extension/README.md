# @sero/context — Context Management App

A Sero app that gives your agent git-like context management tools and
provides a visual dashboard for monitoring context window usage.

Based on [pi-context](https://github.com/ttttmr/pi-context) by ttttmr.

## Features

### Agent Tools

| Tool | Analog | Description |
|------|--------|-------------|
| `context_tag` | `git tag` | Create named bookmarks in conversation history |
| `context_log` | `git log` | View history structure, tags, and context usage |
| `context_checkout` | `git reset` | Navigate/squash to any point in history |

### Web UI

- **Usage Dashboard** — segmented progress bar showing token breakdown
  (system, tool defs, messages, tool calls)
- **Context Graph** — vertical timeline with role-colored nodes, tag
  badges, HEAD indicator, and hidden-message gaps
- **Quick Reference** — collapsible guide to the context management workflow
- **Interactive Actions** — click any node to checkout or tag it

### Bundled Skill

The `context-management` skill is included. Load it with:

```
/skill:context-management
```

## Architecture

```
state.json
(context snapshot)
┌────────┴────────┐
│                  │
Pi Extension     Web UI (React)
(3 tools + cmd)  (graph + usage)
↓                ↑
SessionManager   useAppState
(read/write)     (read only)
```

The extension writes a structured state snapshot after each tool call.
The UI watches this file and renders the graph in real time.

## Development

```bash
# From monorepo root
pnpm install
pnpm --filter @sero/context build

# Start everything
cd apps/desktop
bash scripts/dev.sh
```

The Context app appears in the sidebar. Click it to see the dashboard.
Use "Refresh" or ask the agent to run `context_log` to populate data.
