# Multi-Profile System — Findings

## State Location Inventory

All state that must be profile-scoped:

### Electron main process (file-based)
| State | Path | Source |
|-------|------|--------|
| Auth tokens | `SERO_AGENT_DIR/auth.json` | shared-infra.ts |
| Settings (model, packages) | `SERO_AGENT_DIR/settings.json` | shared-infra.ts |
| Workspace registry | `SERO_AGENT_DIR/workspaces.json` | workspace.ts |
| Sessions | `SERO_AGENT_DIR/sessions/` | shared-infra.ts |
| Layout state | `SERO_AGENT_DIR/layout.json` | ipc/layout.ts |
| Editor state | `SERO_AGENT_DIR/editor-state/` | workspace.ts |
| Skills | `SERO_AGENT_DIR/skills/` | shared-infra.ts |
| Prompts | `SERO_AGENT_DIR/prompts/` | shared-infra.ts |
| Extensions | `SERO_AGENT_DIR/extensions/` | app-discovery.ts |
| Agents (subagent defs) | `SERO_AGENT_DIR/agents/` | subagent/ |
| Models | `SERO_AGENT_DIR/models.json` | shared-infra.ts |
| Gateway token | `SERO_HOME/gateway-token` | shared-infra.ts |
| Context presets | `SERO_AGENT_DIR/context-presets.json` | ipc/context-presets.ts |
| Feedback | `SERO_AGENT_DIR/feedback.json` | ipc/feedback.ts |
| .env (tool API keys) | `SERO_AGENT_DIR/.env` | env.ts |
| Workspaces dir | `SERO_HOME/workspaces/` | workspace.ts |
| Global app state | `SERO_HOME/apps/` | app-state (global scope) |

### Renderer (localStorage)
| Key | Store | Purpose |
|-----|-------|---------|
| `sero:workspace:active` | workspace.ts | Active workspace ID |
| `sero:session:active` | sessions.ts | Active session ID |
| `sero:theme` | app.ts | Dark/light theme |

### Renderer (sessionStorage)
| Key | Store | Purpose |
|-----|-------|---------|
| `sero:activeApp` | app.ts | Currently active app tab |

## Key Insight: Minimal Code Changes Needed

Because `SERO_HOME` and `SERO_AGENT_DIR` in `env.ts` are the root of all paths,
and they're read once at startup by every module, changing them before startup
automatically scopes ALL file-based state. The only additional work is:

1. Profile registry management (new code)
2. IPC bridge (new code)
3. UI components (new code)
4. localStorage scoping (small changes to 3 stores)
5. Chromium userData isolation (1 line in main.ts)

The entire existing codebase doesn't need to know about profiles — it just
sees a different `SERO_HOME`.

## Profile Registry Schema

```typescript
interface ProfileEntry {
  id: string;           // UUID or slug
  name: string;         // Display name (user-editable)
  path: string;         // Absolute path to the profile's SERO_HOME
  createdAt: string;    // ISO timestamp
}

interface ProfileRegistry {
  version: 1;
  activeProfileId: string | null;
  profiles: ProfileEntry[];
}
```

**Fixed location:** `~/.sero-ui/profiles.json`

This file MUST live at a fixed location because we need to read it BEFORE
knowing which profile (and thus which SERO_HOME) to use.

## Migration Strategy

For existing users with `~/.sero-ui/`:
1. On startup, `loadActiveProfile()` checks for `~/.sero-ui/profiles.json`
2. If it doesn't exist BUT `~/.sero-ui/agent/` does → existing user
3. Create profiles.json with a single "Default" profile pointing to `~/.sero-ui/`
4. Set it as active
5. Continue normal startup — zero disruption

For new users:
1. No `~/.sero-ui/` at all
2. Renderer shows ProfileSetup screen
3. User creates first profile → profiles.json written
4. Normal startup continues
