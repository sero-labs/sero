# State and Folders

Sero keeps profile data on the local machine. Use this map when you back up a profile, inspect state, or remove private data from a support report.

## Profile roots

The fixed Sero root is:

```text
~/.sero-ui/
```

The profile registry is always `~/.sero-ui/profiles.json`. Each registry entry points to a profile root. This page writes the active profile root as `<SERO_HOME>`.

Sero uses this agent directory for the active profile:

```text
<SERO_HOME>/agent/
```

For the default profile, the exact agent directory is `~/.sero-ui/agent/`. Sero sets `PI_CODING_AGENT_DIR` to this directory. Do not use `~/.pi/agent/` for Sero state.

```text
<SERO_HOME>/
├── agent/
│   ├── auth.json
│   ├── settings.json
│   ├── layout.json
│   ├── models.json
│   ├── workspaces.json
│   ├── plugins/
│   ├── extensions/
│   ├── agents/
│   ├── skills/
│   └── prompts/
├── apps/
├── workspaces/
├── themes/
└── debug/
```

![Sero profile state and folder map](../assets/generated/img8.jpg)

## Profile files

| Path | Purpose |
| --- | --- |
| `~/.sero-ui/profiles.json` | Profile registry and active profile ID. |
| `<SERO_HOME>/agent/auth.json` | Pi provider credentials and OAuth data. |
| `<SERO_HOME>/agent/settings.json` | Profile settings and package configuration. |
| `<SERO_HOME>/agent/.env` | Profile environment variables. |
| `<SERO_HOME>/agent/layout.json` | Shell layout, theme, active workspace and session, browser state, and dashboard layout. |
| `<SERO_HOME>/agent/models.json` | Local and custom model configuration. |
| `<SERO_HOME>/agent/workspaces.json` | Workspace registry. |
| `<SERO_HOME>/agent/github-auth.json` | GitHub authentication data. Sero uses Electron safe storage when operating-system encryption is available. |
| `<SERO_HOME>/agent/gateway-token` | Gateway master token. |
| `<SERO_HOME>/agent/gateway-config.json` | Gateway configuration. |
| `<SERO_HOME>/agent/gateway-web-tokens.json` | Remote web tokens. |
| `<SERO_HOME>/agent/plugins/` | Installed optional plugins. |
| `<SERO_HOME>/agent/extensions/` | Additional extension resources. |
| `<SERO_HOME>/agent/agents/` | Subagent definitions. |
| `<SERO_HOME>/agent/skills/` | Installed skills. |
| `<SERO_HOME>/agent/prompts/` | Prompt templates. |
| `<SERO_HOME>/themes/` | User theme presets. |

These files are durable profile state. A custom profile keeps them under its own `<SERO_HOME>`.

## Workspaces and app state

Sero-managed workspaces are under `<SERO_HOME>/workspaces/`. The built-in global workspace is `<SERO_HOME>/workspaces/global/`.

A workspace can contain `.sero-workspace.json` for its runtime and workspace metadata. Workspace-scoped plugins store data under:

```text
<workspace>/.sero/apps/<app-id>/
```

Global plugins store data under:

```text
<SERO_HOME>/apps/<app-id>/
```

The plugin controls the files inside its directory. A common file is `state.json`, but this name is not required for all plugins.

Sero adds `.sero/` and `.sero-workspace.json` patterns to the clone's `.git/info/exclude`. It does not edit the repository's `.gitignore`. Git can still report a Sero file if you force-add or already track it.

## Memory files

Memory uses the global workspace:

```text
<SERO_HOME>/workspaces/global/MEMORY.md
<SERO_HOME>/workspaces/global/IDENTITY.md
<SERO_HOME>/workspaces/global/USER.md
<SERO_HOME>/workspaces/global/memory/daily/YYYY-MM-DD.md
```

Memory debug output is under `<SERO_HOME>/debug/memory/`. See [Memory](/guide/memory) for the user workflow.

## Logs and temporary files

Source-development logs are under `~/.sero-ui/logs/`, unless `SERO_LOG_DIR` sets another location. Compatibility links at `/tmp/sero-*.log` point to current log files. These logs are not durable profile state.

Container workspaces have a log guide at `/workspace/.sero/logs/README.md`. It points to files such as:

```text
/workspace/.sero/logs/dev/sero-electron.log
/workspace/.sero/logs/dev/sero-vite.log
/workspace/.sero/logs/dev/sero-remote-<app-id>.log
```

Logs can contain paths, prompts, errors, and project details.

## Protect private state

Do not share raw credentials, `.env` files, gateway tokens, model configuration, layout state, workspace registries, agent definitions, memory files, or plugin state. Review logs before you attach them to an issue.

Profile storage is an organization boundary, not a cryptographic boundary. A process that can read the profile can read many of these files.

## See also

- [Profiles and Onboarding](/guide/profiles-and-onboarding)
- [`models.json` Reference](/reference/models-json)
- [Security / Privacy](/reference/security-privacy)
- [Agent Definitions](/reference/agent-definitions)
