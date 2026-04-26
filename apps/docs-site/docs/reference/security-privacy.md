# Security / Privacy

Sero is a local-first developer tool in a **source-only OSS alpha** stage. It
runs on your machine, stores profile state locally, and can optionally connect
to remote services such as model providers, GitHub, plugin registries, Discord,
Tailscale, or the Sero gateway.

This page is practical guidance, not a claim of hardened isolation. During the
alpha, treat Sero like a powerful local automation environment: protect the
profile directory, review what plugins and remote clients can reach, and report
security issues privately.

## Public alpha security posture

Security reports are accepted for:

- the latest `main` branch
- current OSS alpha tags, best effort
- the desktop app, auth/token handling, local secret handling, gateway and
  remote-control surfaces, workspace/container execution boundaries, core plugin
  loading, and docs or examples that encourage unsafe behavior

Older commits, local forks, heavily modified builds, and third-party plugins
outside this monorepo are not supported security-report targets unless they
expose a vulnerability in Sero itself.

Please **do not** open public GitHub issues or public PRs for suspected security
problems. Use private reporting instead:

1. GitHub private vulnerability reporting / security advisories, if enabled.
2. Email `security@sero-ai.dev` with subject `[Sero Security]`.

Include impact, reproduction steps, commit/build context, and whether the issue
requires local access, profile access, network access, or a malicious plugin or
workspace.

## Local/profile state is sensitive

Sero's active profile contains auth stores, settings, workspace metadata, plugin
state, memory files, and logs. The canonical path map is
[State and Folders](/reference/state-and-folders); use that page when checking
what to redact from bug reports, screenshots, terminal output, and shared logs.

Common sensitive paths include:

| Surface | Current location |
| --- | --- |
| provider auth store | `<SERO_HOME>/agent/auth.json` |
| profile-local env vars | `<SERO_HOME>/agent/.env` |
| GitHub auth | `<SERO_HOME>/agent/github-auth.json` |
| gateway token | `<SERO_HOME>/agent/gateway-token` |
| gateway config | `<SERO_HOME>/agent/gateway-config.json` |
| gateway web tokens | `<SERO_HOME>/agent/gateway-web-tokens.json` |
| layout and UI state | `<SERO_HOME>/agent/layout.json` |
| workspace registry | `<SERO_HOME>/agent/workspaces.json` |
| global memory files | `<SERO_HOME>/workspaces/global/` |
| app state | `<SERO_HOME>/apps/` and `<workspace>/.sero/apps/` |
| runtime logs | `/tmp/sero-*.log` |

Before sharing diagnostics:

- never paste raw API keys, OAuth tokens, gateway tokens, or full auth files
- redact private local paths, project names, prompts, and workflow details when
  they are not needed for the report
- rotate any secret that may already have been exposed
- prefer private reporting when security impact is plausible

Profile-scoped storage helps keep Sero state organized, but it is not a
cryptographic boundary. Someone who can read your active profile files may be
able to recover useful secrets or steer connected integrations.

## Local vs remote/networked surfaces

### Local by default

These surfaces are local/profile-scoped unless you explicitly copy, sync, or
expose them elsewhere:

- profiles and the profile registry
- provider auth/settings under `<SERO_HOME>/agent/`
- workspaces under `<SERO_HOME>/workspaces/`
- global app state under `<SERO_HOME>/apps/`
- installed plugins under `<SERO_HOME>/agent/plugins/`
- memory files, daily logs, layout state, and debug output

### Remote or networked when enabled

These surfaces can talk to external systems, while their Sero-side state remains
stored locally:

- model/provider API calls and OAuth flows
- GitHub authentication and repository access
- plugin installs from npm, git, or local source paths
- gateway remote-control clients
- Discord and Tailscale integrations
- plugin-specific third-party integrations

Remote integrations can expand what an attacker can do with a stolen token,
profile file, or malicious plugin. Enable them intentionally and remove or
rotate credentials you no longer need.

## Renderer and browser safeguards

Sero applies Electron/browser safeguards intended to reduce accidental exposure
and common renderer risks. These are defense-in-depth controls, not a guarantee
that arbitrary content or untrusted plugins are safe.

Current safeguards include:

- main-window navigation is restricted to trusted app origins; development also
  allows the local Vite origin
- popups for `http` and `https` URLs are opened externally through the operating
  system shell, while other popup attempts are denied
- webviews are configured conservatively: no Node integration, context isolation
  enabled, sandbox enabled, insecure content disabled, and preload scripts
  stripped from untrusted webviews
- permission requests are deny-by-default except for limited cases such as media
  and sanitized clipboard writes
- the renderer Content Security Policy is intentionally narrow, with allowances
  for Sero extension assets, required media domains, `blob`/`data` where needed,
  and loopback HTTP/WebSocket sources used by local auth and viewer flows

These controls should not be described as a hardened browser sandbox for all
possible plugin or web content. Treat plugin code and embedded remote content as
part of the security surface.

## Permission prompts and user feedback tools

Sero has a focused permission gate for some dangerous `bash` tool calls. It does
**not** gate every tool, every filesystem action, every plugin action, or every
agent decision.

The current gate checks `bash` commands for a limited set of risky patterns,
including examples such as:

- recursive destructive delete patterns like broad `rm -rf`
- `sudo`
- `chmod` / `chown` patterns such as `777`
- disk-writing or formatting commands such as `mkfs` and `dd ... of=`
- redirection to raw disk devices
- shutdown/reboot/halt/poweroff commands

Simple workspace-scoped cleanup can be auto-allowed when it parses as a plain
recursive remove inside the current workspace and does not target the workspace
root or `.git` paths. Complex shell constructs, globs, and shell-control
characters are treated conservatively.

In Sero mode, the gate asks through the user-feedback bridge and times out by
default. In CLI/non-interactive contexts where confirmation is unavailable,
dangerous matched commands are blocked by default.

Sero also includes user-feedback tools such as question, questionnaire, and
interview flows. Those tools are for collecting user input; they are not the
permission gate and should not be treated as a general security approval system.

## Admin and MCP management surfaces

Some powerful configuration and inspection features are intentionally UI-first.
That keeps the agent-facing tool surface smaller, but it is not a hard security
boundary by itself.

- The Admin plugin is a UI-only surface for inspecting configuration, sessions,
  and logs. Do not assume it is an agent tool just because it appears in the app.
- The MCP plugin keeps the agent-facing surface small: the agent uses the bridged
  `mcp` tool, while `mcp_manager` is a UI/runtime management surface.

These distinctions reduce accidental exposure and clarify intent. They do not
replace careful handling of profile files, plugins, MCP servers, or gateway
access.

## Gateway and remote-control access

The gateway is **off by default**. It only starts when explicitly enabled with
`SERO_GATEWAY=1`.

When enabled, an authenticated gateway client has the same effective power as
the desktop UI. It can open sessions on any workspace, send prompts, steer or
abort agent turns, and list workspaces and sessions. Because prompts can lead the
agent to run tools, treat the gateway token like a high-privilege secret.

Important gateway caveats during alpha:

- the token is profile-scoped and should be stored/handled like a root password
- there is no per-workspace access control for authenticated gateway clients
- there are no gateway-specific tool restrictions beyond the normal Sero/Pi tool
  behavior and focused `bash` permission gate described above
- there is no rate limiting; an authenticated client can consume API credits
- Tailscale exposure depends on tailnet trust and should use `tailscale serve`,
  not public funneling
- Discord access is risky if `SERO_DISCORD_USERS` is empty, because anyone who
  can reach the bot may be able to interact with it
- token URLs are discouraged because they can leak through browser history,
  autocomplete, screenshots, or referrers

Prefer login prompts or ephemeral shell variables over putting tokens in URLs or
command history. Stop Tailscale serve, disable the gateway, and rotate tokens
when remote access is no longer needed.

## What Sero does not claim during alpha

The public alpha does **not** claim:

- universal permission prompts for every tool or action
- comprehensive blocking of all dangerous agent behavior
- hardened multi-tenant isolation
- cryptographic isolation between profiles
- that containers are a complete security boundary against malicious code
- that Admin or MCP UI-only management is a hard access-control boundary
- that gateway clients can be restricted per workspace or per tool
- that third-party plugins are reviewed or sandboxed to a production security
  standard

Use Sero on machines and workspaces where you are comfortable running a powerful
local developer assistant, and review remote access, plugin installs, and stored
credentials accordingly.

## See also

- [State and Folders](/reference/state-and-folders)
- [Support Scope](/reference/support-scope)

Current source material:

- [`SECURITY.md`](https://github.com/sero-labs/sero/blob/main/SECURITY.md)
- [`docs/reference/state-and-folders.md`](https://github.com/sero-labs/sero/blob/main/docs/reference/state-and-folders.md)
- [`docs/security/gateway.md`](https://github.com/sero-labs/sero/blob/main/docs/security/gateway.md)
- [`docs/features/memory.md`](https://github.com/sero-labs/sero/blob/main/docs/features/memory.md)
- [`docs/features/profiles.md`](https://github.com/sero-labs/sero/blob/main/docs/features/profiles.md)
