# Context for: Admin app operational guide discovery

## Relevant Files
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — explicitly defers the Admin guide until UI inspection plus security/support review.
- `plugins/sero-admin-plugin/package.json` — confirms Admin is a built-in `sero.app`/plugin package with global scope, `stateFile` at `.sero/apps/admin/state.json`, and no special agent-facing plugin metadata.
- `plugins/sero-admin-plugin/extension/index.ts` — registers only a UI notification command; comments state the surface is intentionally UI-only and must not be bridged into `sero-cli`.
- `plugins/sero-admin-plugin/ui/AdminApp.tsx` — root UI surface and section routing.
- `plugins/sero-admin-plugin/ui/components/{ConfigPanel.tsx,LogViewer.tsx,SessionBrowser.tsx,PluginsPanel.tsx}` — confirmed admin views for configs, logs, sessions, and plugins.
- `plugins/sero-admin-plugin/shared/types.ts` — canonical list of config files and admin persisted UI state.
- `plugins/sero-admin-plugin/ui/hooks/{useConfigFile.ts,useSessionFiles.ts,usePlugins.ts,useAgentCrud.ts,useSkillCrud.ts,usePromptCrud.ts,useProfiles.ts,host.ts}` — data sources and host bridge calls.
- `apps/docs-site/docs/reference/security-privacy.md` — public security language and redaction caveats.
- `apps/docs-site/docs/reference/state-and-folders.md` — canonical profile/app/log paths.
- `apps/docs-site/docs/reference/troubleshooting.md` — log paths and issue-report context.
- `docs/plugins/guide.md` — plugin install/storage conventions.

## Confirmed Admin UI Surfaces
- Main nav sections are: **Resources** (Agents, Skills, Prompts), **Config** (Settings, Model, Plugins), and **System** (Logs, Sessions).
- `ConfigPanel` exposes these files in the profile:
  - `agent/settings.json`
  - `agent/auth.json` (sensitive)
  - `agent/layout.json`
  - `agent/workspaces.json`
  - `../profiles.json`
  - `agent/.env` (sensitive, read-only)
- `LogViewer` reads `/tmp/sero-electron.log`, `/tmp/sero-vite.log`, and discovers `/tmp/sero-remote-<app>.log` via app discovery.
- `SessionBrowser` lists sessions via `sessions.list()` and loads session files directly from the profile/session store.
- `PluginsPanel` manages installed plugins, local plugin development sessions, and attached folders.
- Additional CRUD surfaces exist for agents, skills, prompts, and model settings; these are real UI surfaces, but the future public guide should keep scope conservative unless each surface is separately verified.

## UI-only vs Agent-tool Exposure
- Source confirms Admin is intended as a **UI-only** surface.
- The extension only registers a command that shows an info notification; it does **not** expose Admin as an agent tool.
- Do not describe Admin as agent-accessible management, a CLI-bridged surface, or a general-purpose tool endpoint.

## Sensitive Data / Redaction Caveats
- `security-privacy.md` and `state-and-folders.md` both treat profile state as sensitive local developer-machine data.
- Redact or avoid sharing raw copies of:
  - `<SERO_HOME>/agent/auth.json`
  - `<SERO_HOME>/agent/.env`
  - `<SERO_HOME>/agent/github-auth.json`
  - `<SERO_HOME>/agent/gateway-token`
  - `<SERO_HOME>/agent/gateway-config.json`
  - `<SERO_HOME>/agent/gateway-web-tokens.json`
  - `<SERO_HOME>/agent/layout.json`
  - `<SERO_HOME>/agent/workspaces.json`
  - `<SERO_HOME>/apps/**` and `<workspace>/.sero/apps/**`
  - memory files under `<SERO_HOME>/workspaces/global/`
  - `/tmp/sero-*.log` when they contain paths, prompts, tokens, or project data
- `ConfigPanel` uses an explicit unlock gate for sensitive files, but the docs should still treat this as UX friction, not a hardened boundary.

## State / Config Paths It May Inspect or Mutate
- Profile registry: `~/.sero-ui/profiles.json`
- Profile-local state: `<SERO_HOME>/agent/settings.json`, `layout.json`, `workspaces.json`
- Sensitive auth/env: `auth.json`, `.env`, `github-auth.json`
- Installed plugins: `<SERO_HOME>/agent/plugins/`
- App state: `<SERO_HOME>/apps/admin/state.json`
- Session files are read directly from the active profile session store via the sessions API.
- Admin CRUD surfaces can write agents, skills, prompts, and some settings; `useConfigFile` only writes JSON files and does not support saving text files like `.env`.

## Support / Security Review Questions Before Public Guide
- Which Admin views are stable enough to mention as durable docs, versus alpha-internal convenience panes?
- Can the public guide name `auth.json`/`.env`/session logs directly, or should it only say “sensitive profile files” and point to the state map?
- Should the guide mention read-only vs editable behavior per file, or avoid implying safe mutation workflows?
- Are local plugin development sessions and attached folders part of the public support story, or internal/admin-only guidance?
- Should logs be framed as troubleshooting artifacts only, given they live in `/tmp` and may include sensitive output?
- Is the model/settings panel part of the public admin story, or too incomplete/unstable to promise?

## What Not to Claim
- Do **not** claim a hardened admin boundary or security sandbox.
- Do **not** claim Admin is a safe public support workflow for arbitrary user machines or shared screenshots.
- Do **not** claim Admin is agent-accessible or bridged into CLI tooling.
- Do **not** claim complete config coverage; the file list is source-defined and may be incomplete.
- Do **not** claim stable UI/API behavior beyond current alpha surfaces.
- Do **not** imply logs, sessions, or profile state are non-sensitive just because they are visible in Admin.
