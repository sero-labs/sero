# Multi-Profile System

Sero supports multiple user profiles, each with completely independent state.
Profiles enable you to maintain separate environments for different contexts
(e.g. work, personal, research) without any data leakage between them.

## What's Isolated Per Profile

Each profile is a self-contained Sero installation:

| State | Location |
|-------|----------|
| Workspaces | `<profile>/agent/workspaces.json` |
| Sessions | `<profile>/agent/sessions/` |
| Auth tokens | `<profile>/agent/auth.json` |
| Settings (model, packages) | `<profile>/agent/settings.json` |
| Layout (sidebar, panels) | `<profile>/agent/layout.json` |
| Skills & prompts | `<profile>/agent/skills/`, `prompts/` |
| Subagent definitions | `<profile>/agent/agents/` |
| App state | `<profile>/workspaces/*/` |
| API keys (.env) | `<profile>/agent/.env` |
| Browser data (cookies, cache) | Per-profile Chromium userData |
| UI state (layout.json) | `<profile>/agent/layout.json` |

## How It Works

### Profile Registry

All profiles are tracked in a single fixed file:

```
~/.sero-ui/profiles.json
```

```json
{
  "version": 1,
  "activeProfileId": "abc-123",
  "profiles": [
    {
      "id": "abc-123",
      "name": "Personal",
      "path": "<default-profile-root>",
      "createdAt": "2026-03-08T12:00:00.000Z"
    },
    {
      "id": "def-456",
      "name": "Work",
      "path": "<custom-profile-root>",
      "createdAt": "2026-03-08T13:00:00.000Z"
    }
  ]
}
```

### Profile = SERO_HOME

Each profile entry points to a directory that becomes `SERO_HOME` for that
profile. The entire existing architecture (workspaces, sessions, agent
config) resolves from `SERO_HOME`, so switching profiles simply changes
which root directory Sero reads from.

### Profile Switching

Switching profiles triggers an app restart (`app.relaunch()` + `app.exit()`).
This ensures:

- All lazy-initialised singletons are cleanly reset
- No stale state from the previous profile leaks through
- The new profile's `SERO_HOME` is resolved fresh from `profiles.json`

### First Run Experience

- **New users:** See a setup screen asking for a profile name
- **Existing users:** Auto-migrated silently. A "Default" profile pointing
  to `~/.sero-ui/` is created in `profiles.json`. No data is moved.

### Custom Storage Locations

Profiles can be stored anywhere on the filesystem. When creating a profile,
you can pick a custom folder. The profile name is independent of the folder
name — you can name a profile "Work" even if it's stored at
`<custom-profile-root>`.

## UI

### Profile Switcher (TitleBar)

The current profile name appears in the TitleBar with a user icon. Clicking
it opens a popover listing all profiles:

- **Active profile** — shown with a checkmark
- **Other profiles** — click to switch (confirms restart)
- **New Profile** — opens creation dialog

### First-Run Setup

A full-screen welcome screen appears on first launch (or when no profile
exists). Enter a name and optionally pick a custom storage location.

## Technical Details

### Architecture Decision: AD-022

See [decisions.md](decisions.md) for the full architecture decision record.

### Key Files

| File | Purpose |
|------|---------|
| `electron/profile/types.ts` | Profile types |
| `electron/profile/manager.ts` | Profile CRUD + registry I/O |
| `electron/profile/migration.ts` | Auto-migration for existing users |
| `electron/env.ts` | Resolves SERO_HOME from active profile |
| `electron/ipc/profiles.ts` | IPC handlers |
| `src/stores/profiles.ts` | Renderer profile state |
| `src/lib/persist-layout.ts` | Filesystem-backed layout persistence |
| `src/components/profiles/` | UI components |

### Startup Sequence

```
1. env.ts: migrateExistingInstall()     ← creates profiles.json if needed
2. env.ts: readRegistrySync()           ← reads active profile
3. env.ts: SERO_HOME = profile.path     ← sets root for all downstream
4. main.ts: app.setPath('userData')     ← per-profile Chromium data
5. main.ts: bootstrapAgentDir()         ← creates agent dir if new
6. Renderer: loadProfiles()             ← hydrates profile store
7. Renderer: !hasActiveProfile?         ← shows setup or app
```
