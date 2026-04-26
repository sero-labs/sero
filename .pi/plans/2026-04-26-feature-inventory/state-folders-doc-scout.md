# Context for: docs around Sero state, folders, profiles, and storage paths

## Relevant Files
- `docs/reference/state-and-folders.md` — current canonical storage map. Says fixed root is `~/.sero-ui/`, but important nuance is that `SERO_HOME` is profile-resolved and may be custom. Lists profile registry, agent dir, workspaces, app state, memory files, auth/gateway files, and temp logs.
- `apps/docs-site/docs/reference/security-privacy.md` — reiterates local/remote boundary and sensitive files. Uses `agent/` paths and calls out auth, `.env`, gateway, layout, and workspace registry as sensitive.
- `apps/docs-site/docs/reference/troubleshooting.md` — mentions temp logs and redaction guidance; useful for support-facing storage references.
- `apps/docs-site/docs/reference/support-scope.md` — not path-heavy, but anchors alpha support language around supported runtime surfaces.
- `apps/docs-site/docs/guide/memory.md` — user-facing memory guide. Confirms memory files live in the global workspace and memory debug logs under `<SERO_HOME>/debug/memory/`.
- `apps/docs-site/docs/guide/web-access.md` — states Web state is workspace-scoped at `<workspace>/.sero/apps/web/state.json` and bookmarks/history/downloads are workspace-local.
- `apps/docs-site/docs/guide/scheduler-reminders.md` — documents cron app state at `<SERO_HOME>/apps/cron/state.json` with fallback `./.sero/apps/cron/state.json` and notes app manifest path `.sero/apps/cron/state.json`.
- `apps/docs-site/docs/guide/git-manager.md` — documents Git app state at `<workspace>/.sero/apps/git/state.json` and the ignore rule `**/.sero/apps/git/`.
- `apps/docs-site/docs/guide/plugins-and-apps.md` — confirms app state should use `useAppState`/bridge, not browser storage; good for explaining workspace/global app state ownership.
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — explicitly lists “State, folders, profiles, and storage map updates” as an outstanding docs task.
- `apps/desktop/electron/platform/env/index.ts` — authoritative runtime source for `SERO_FIXED_ROOT`, `SERO_HOME`, `SERO_AGENT_DIR`, `AUTH_JSON_PATH`, profile registry resolution, and `.env` loading.
- `apps/desktop/electron/features/workspace/manager.ts` — confirms registry/workspace locations and default global workspace creation under `<SERO_HOME>/workspaces/global`.
- `apps/desktop/electron/ipc/workspace/layout.ts` — confirms `layout.json` is stored in `<SERO_HOME>/agent/layout.json` (despite older comments elsewhere that say `~/.sero-ui/layout.json`).
- `apps/desktop/electron/features/profile/agent-config-migration.ts` and `copy-profile-data.ts` — confirm legacy-to-current config paths and transferable files.
- `apps/desktop/electron/features/apps/discovery/index.ts` — confirms global app state path is `<SERO_HOME>/apps/<app-id>/state.json`.

## Key Findings
- Canonical runtime path model is profile-scoped:
  - fixed registry root: `~/.sero-ui/profiles.json`
  - active profile root: `SERO_HOME`
  - agent dir: `SERO_HOME/agent` exposed as `PI_CODING_AGENT_DIR`
- The docs-site already mirrors the main idea, but some wording still mixes legacy/default-root and profile-scoped paths. The source of truth in code is `apps/desktop/electron/platform/env/index.ts`.
- `layout.json` is not at the profile root anymore; it lives in `SERO_HOME/agent/layout.json`.
- Workspace registry is `SERO_HOME/agent/workspaces.json`; global workspace is `SERO_HOME/workspaces/global`; workspace-local app state lives at `<workspace>/.sero/apps/<app-id>/state.json`.
- Global app state is `SERO_HOME/apps/<app-id>/state.json`.
- Memory docs should keep `MEMORY.md`, `IDENTITY.md`, `USER.md`, `SCRATCHPAD.md`, and `memory/daily/YYYY-MM-DD.md` under the global workspace; debug logs are under `SERO_HOME/debug/memory/`.
- Web, cron, and Git each have distinct app-state paths that matter for user-facing docs:
  - Web: `<workspace>/.sero/apps/web/state.json`
  - Cron: `SERO_HOME/apps/cron/state.json` (docs also mention workspace-relative fallback for non-Sero/Pi CLI usage)
  - Git: `<workspace>/.sero/apps/git/state.json`
- Plugin/install-related state lives under `SERO_HOME/agent/plugins/` and `SERO_HOME/agent/extensions/`; plugin config can live under `SERO_HOME/agent/plugin-config/` (notably Google OAuth migrated there).
- Sensitive files users should redact/share carefully: `profiles.json`, `agent/auth.json`, `agent/.env`, `agent/github-auth.json`, `agent/gateway-token`, `agent/gateway-config.json`, `agent/gateway-web-tokens.json`, `agent/layout.json`, `agent/workspaces.json`, memory files, and debug logs.
- Older docs and comments still mention legacy root-level files/paths such as `~/.sero-ui/layout.json`, `~/.sero-ui/github-auth.json`, and `~/.pi/agent`. Those should be updated or explicitly called out as legacy/back-compat only.

## Gotchas
- `SERO_HOME` is profile-resolved, not always literally `~/.sero-ui/`; public docs should phrase it as the active profile root and only mention `~/.sero-ui/` as the default profile location.
- `PI_CODING_AGENT_DIR` is intentionally set to `SERO_HOME/agent` so Pi resolves Sero-owned config there; docs should avoid telling users to look in `~/.pi/agent`.
- `apps/desktop/electron/ipc/workspace/layout.ts` still has a stale comment saying `~/.sero-ui/layout.json`; that is source-comment drift, not the live path.
- `docs/features/profiles.md` appears older than the newer storage map and still uses some broad “everything is under `<profile>/agent`” phrasing; it likely needs a pass or a link to the canonical state/folders page.
- For support docs, keep the distinction between local state and remote/networked behavior explicit; many files are local even when the feature talks to remote services.

## Recommended Docs Action
- Update the docs-site reference page first (`apps/docs-site/docs/reference/state-and-folders.md`) because it is already the canonical public storage map.
- Also review root docs that overlap with profile/storage truth, especially `docs/features/profiles.md`, for stale path wording and to point readers at the canonical reference page.
- If you want one minimal path, link the docs-site guide pages back to the canonical reference instead of duplicating path tables in every feature guide.
