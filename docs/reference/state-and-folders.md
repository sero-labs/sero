# State and Folders Reference

This page documents the current Sero public beta storage model: where profile
state lives, which files are local-only, and which surfaces can talk to remote
services.

## Core path model

### Fixed root

Sero has one fixed root anchor:

```text
~/.sero-ui/
```

This fixed root is where the profile registry lives.

### Profile registry

```text
~/.sero-ui/profiles.json
```

This file tracks:
- the active profile ID
- the list of known profiles
- the filesystem path for each profile root

### Active profile root (`SERO_HOME`)

The active profile root is resolved at runtime. In public docs, think of it as:

```text
<SERO_HOME>
```

For the default profile, that is usually `~/.sero-ui/`.
For custom profiles, it can be any user-chosen folder.

### Agent directory (`SERO_AGENT_DIR`)

Within the active profile root, Sero uses:

```text
<SERO_HOME>/agent/
```

Sero explicitly sets `PI_CODING_AGENT_DIR` to this path so Pi uses Sero's
profile-scoped agent directory instead of `~/.pi/agent`.

## Key profile-scoped files and directories

| Path | Purpose |
| --- | --- |
| `~/.sero-ui/profiles.json` | Global profile registry |
| `<SERO_HOME>/agent/auth.json` | Pi-managed auth store for provider credentials / OAuth data |
| `<SERO_HOME>/agent/settings.json` | Profile-scoped settings, package/plugin config, feature settings |
| `<SERO_HOME>/agent/layout.json` | Persisted UI layout, theme, active workspace/session, dashboard layout |
| `<SERO_HOME>/agent/.env` | Profile-local environment variables and local secret config |
| `<SERO_HOME>/agent/workspaces.json` | Workspace registry for the active profile |
| `<SERO_HOME>/agent/agents/` | Global subagent definitions |
| `<SERO_HOME>/agent/skills/` | Installed skill definitions |
| `<SERO_HOME>/agent/prompts/` | Prompt templates |
| `<SERO_HOME>/agent/plugins/` | Installed optional plugins |
| `<SERO_HOME>/agent/extensions/` | Additional extension packages/resources |
| `<SERO_HOME>/agent/editor-state/` | Editor-related persisted state |
| `<SERO_HOME>/agent/github-auth.json` | GitHub device-flow auth token store |
| `<SERO_HOME>/agent/gateway-token` | Gateway master auth token |
| `<SERO_HOME>/agent/gateway-config.json` | Gateway config / cost controls |
| `<SERO_HOME>/agent/gateway-web-tokens.json` | Scoped/owner web tokens for gateway clients |
| `<SERO_HOME>/themes/` | User theme presets |
| `<SERO_HOME>/workspaces/` | Profile-owned workspaces |
| `<SERO_HOME>/apps/` | Global-scoped app state |
| `<SERO_HOME>/debug/memory/` | Memory plugin debug logs |

## Workspaces and app state

### Workspace roots

Sero maintains profile-owned workspaces under:

```text
<SERO_HOME>/workspaces/
```

The built-in global workspace lives at:

```text
<SERO_HOME>/workspaces/global/
```

### Workspace config

Each real workspace directory can also contain:

```text
<workspace-root>/.sero-workspace.json
```

This stores workspace-level config such as runtime mode and workspace metadata.

### Workspace-scoped app state

Most app state is stored inside each workspace:

```text
<workspace-root>/.sero/apps/<app-id>/state.json
```

### Global-scoped app state

Global apps store state at:

```text
<SERO_HOME>/apps/<app-id>/state.json
```

## Memory system storage

The memory system uses the global workspace under the active profile.

Common files:

```text
<SERO_HOME>/workspaces/global/MEMORY.md
<SERO_HOME>/workspaces/global/IDENTITY.md
<SERO_HOME>/workspaces/global/USER.md
<SERO_HOME>/workspaces/global/memory/daily/YYYY-MM-DD.md
```

Memory-related debug logs live at:

```text
<SERO_HOME>/debug/memory/
```

### Runtime logs

Source-dev runtime logs are written to:

```text
~/.sero-ui/logs/
```

or to `$SERO_LOG_DIR` when that environment variable is set. Compatibility
symlinks are also kept under `/tmp/` for older tooling:

```text
/tmp/sero-vite.log
/tmp/sero-electron.log
/tmp/sero-remote-<app-id>.log
```

Container workspaces get an obvious read-only log portal at:

```text
/workspace/.sero/logs/
```

Start with `/workspace/.sero/logs/README.md`. It points agents to source-dev
logs, profile debug logs, app logs, and session JSONL files without needing to
guess host paths.

Treat runtime logs as local developer-machine artifacts, not durable profile
state.

## Auth and secrets

### Provider auth / Pi auth

Sero uses Pi's managed auth store at:

```text
<SERO_HOME>/agent/auth.json
```

The desktop app hardens this file to owner-only permissions (`0600`).

### Profile-local `.env`

Local environment-based secrets and config live at:

```text
<SERO_HOME>/agent/.env
```

This file is local plaintext configuration. Treat it as sensitive.

### GitHub auth

Current profile-scoped location:

```text
<SERO_HOME>/agent/github-auth.json
```

Older installs may still have a legacy root-level file:

```text
<SERO_HOME>/github-auth.json
```

The desktop app still reads that legacy location for migration / back-compat.

### Gateway auth

Current profile-scoped locations:

```text
<SERO_HOME>/agent/gateway-token
<SERO_HOME>/agent/gateway-config.json
<SERO_HOME>/agent/gateway-web-tokens.json
```

Older docs or notes may still mention root-level gateway files; current code is
profile-scoped under `agent/`.

## Local vs remote

### Local-only by default

These are local/profile-scoped surfaces:
- `profiles.json`
- `<SERO_HOME>/agent/*`
- `<SERO_HOME>/workspaces/*`
- `<SERO_HOME>/apps/*`
- installed plugins and local plugin-dev session metadata
- memory files and most debug logs

### Remote/networked surfaces

These may talk to remote systems, but their stored state is still local:
- model/provider auth in `auth.json`
- GitHub OAuth / API access
- gateway remote-control surfaces when enabled
- Discord bot integration when configured
- plugin installs from npm or git sources

## Public caveats

- In public docs, avoid presenting `~/.pi/agent` as Sero's storage root.
  Sero's current profile-scoped path is `<SERO_HOME>/agent/`.
- `SERO_HOME` is profile-resolved, not always the literal `~/.sero-ui/` path.
- Some older docs and plans still mention legacy root-level files. Prefer the
  profile-scoped `agent/` locations above when documenting current behavior.
- The active profile directory should be treated as sensitive local state.
  It contains auth material, settings, workspace metadata, and app state.
