# Facts — plugins/sero-google-plugin

_Last reviewed: 2026-04-17_

## What this code does
`plugins/sero-google-plugin/` is an external Sero integrations plugin that exposes Gmail and Google Calendar to both the agent and the federated React UI. The package already owns the app manifest, widgets, shared state shape, and the `gmail` / `gcal` extension tools, but the desktop shell still owns the plugin’s OAuth flow, gog credential provisioning, direct UI execution bridge, and the richer built-in `sero google ...` CLI surface.

## Shape & metrics
- Total tracked files: 24 (excluding `node_modules/`, `dist/`, and `package-lock.json`)
- Total tracked LOC: 3,433
- Largest file: `plugins/sero-google-plugin/extension/index.ts` (335 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC): none
- Test surface: none — no plugin-local `*test*` files are present today
- External dependencies of note:
  - Pi extension/runtime APIs (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`)
  - `@sero-ai/app-runtime` file-backed state bridge (`packages/app-runtime/src/use-app-state.ts:19-99`)
  - gogcli / `gog` on the host machine
  - Google OAuth endpoints + localhost loopback callback server
  - Desktop-only Google bridge surfaces: `window.sero.google` and `window.sero.pluginConfig` (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:30-34`)
- Upstream callers / consumers of note:
  - Generic plugin platform: app discovery, Module Federation remote loading, and app-agent session loading (`apps/desktop/electron/ipc/agent/handlers/app-agent.ts:116-149`)
  - Google UI path: `apps/desktop/electron/preload/integrations/google-imagegen.ts:33-45`, `apps/desktop/electron/preload/api.ts:19-20,63-65`, `apps/desktop/src/types/electron-apps.d.ts:65-75`, `apps/desktop/src/types/ipc-channels.ts:385-396`
  - Host Google runtime: `apps/desktop/electron/ipc/integrations/google-api.ts:80-110`, `apps/desktop/electron/features/auth/google/**/*.ts`, `apps/desktop/electron/cli/lib/gog-runner.ts:68-148`, `apps/desktop/electron/cli/commands/integrations/google.ts:49-95`
- Downstream dependencies:
  - Global app state at `$SERO_HOME/apps/google/state.json` or workspace-local fallback via `resolveStatePath()` (`plugins/sero-google-plugin/extension/index.ts:22-39`)
  - Plugin config at `$SERO_AGENT_DIR/plugin-config/sero-google-plugin.json` (`apps/desktop/electron/features/auth/google/config.ts:25-37`)
  - gog keyring password + client bucket semantics (`apps/desktop/electron/features/auth/google/gog-keyring.ts:34-82`)
  - Current built-in `sero google` command contract, which is broader than the plugin’s own tools (`apps/desktop/electron/cli/commands/integrations/google.ts:49-95`)

## Architectural notes
- The plugin already gets the core plugin-platform basics right: standard `sero.app` / `sero.plugin` manifest, relative production `base: './'`, `pi.registerTool()` usage, and `useAppState()` for file-backed UI state (`plugins/sero-google-plugin/package.json:18-77`, `plugins/sero-google-plugin/ui/GoogleApp.tsx:21-24`, `packages/app-runtime/src/use-app-state.ts:19-99`).
- The biggest ownership break is the renderer path. The UI does not invoke plugin-owned tools or commands; it calls a dedicated shell API instead (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:30-34`). That forces Google-specific preload, IPC, and type declarations into the core desktop app (`apps/desktop/electron/preload/integrations/google-imagegen.ts:33-45`, `apps/desktop/src/types/electron-apps.d.ts:65-75`, `apps/desktop/src/types/ipc-channels.ts:385-396`).
- Google domain logic currently exists in three parallel runtimes:
  1. plugin extension tools writing app state (`plugins/sero-google-plugin/extension/index.ts:89-329`)
  2. renderer-side direct gog JSON mapping (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:178-250`)
  3. host-owned `sero google` CLI + auth/runtime helpers (`apps/desktop/electron/cli/commands/integrations/google.ts:49-95`, `apps/desktop/electron/cli/lib/gog-runner.ts:68-148`, `apps/desktop/electron/features/auth/google/**/*.ts`)
- The host auth/runtime path is profile-aware and migration-aware. It chooses a per-profile gog client bucket (`apps/desktop/electron/features/auth/google/gog-keyring.ts:64-75`) and preserves the buggy-password migration path (`apps/desktop/electron/features/auth/google/status.ts:52-89`). The plugin extension’s own gog runner does not currently participate in that contract (`plugins/sero-google-plugin/extension/gogcli.ts:70-78`).
- The app-agent infrastructure is already app-scoped: each app gets a dedicated session that loads only that app’s own extensions and skills (`apps/desktop/electron/ipc/agent/handlers/app-agent.ts:136-149`). That is the obvious generic foundation for a future plugin-owned tool-execution bridge.

## Runtime-sensitive surfaces
- **AD-022 profile isolation:** current host auth stores Google tokens in a per-profile gog client bucket, not just a shared default bucket (`apps/desktop/electron/features/auth/google/gog-keyring.ts:64-75`). Any migration that drops that behavior risks stranding tokens for non-default profiles.
- **Legacy keyring migration:** the host still carries recovery logic for the previous buggy profile-scoped keyring password (`apps/desktop/electron/features/auth/google/status.ts:52-89`). A plugin-owned rewrite must preserve or explicitly retire that migration path.
- **AD-018 container behavior:** the built-in CLI runner can execute `gog` inside workspace containers or on the host (`apps/desktop/electron/cli/lib/gog-runner.ts:113-148`). The plugin extension currently runs gog only via host `execFile()` (`plugins/sero-google-plugin/extension/gogcli.ts:75-89`).
- **AD-020 command/tool ownership:** today the plugin contributes `gmail` and `gcal`, while the shell separately exposes a broader built-in `google` command family. Removing the shell command without a plugin-owned parity plan would be a user-visible contract change.
- **State-truthfulness:** both the UI and the extension write `.sero/apps/google/state.json`, but they do not shape Gmail/Calendar payloads identically. Cleanup must converge these paths instead of moving the mismatch to a different folder.

## Surprising discoveries
- The plugin is only partially self-contained today. The desktop shell still ships a Google-only preload API, dedicated IPC channels, a Google auth manager, and a built-in Google CLI even though the plugin already exists.
- The plugin extension and the renderer produce different state richness from the same gog payloads. For example, the tool path writes thread messages without `bodyHtml` (`plugins/sero-google-plugin/extension/index.ts:144-153`), while the UI path parses full HTML bodies (`plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:196-204` + `plugins/sero-google-plugin/ui/components/gmail-parser.ts:67-91`). Calendar event shaping diverges similarly (`plugins/sero-google-plugin/extension/index.ts:236-248` vs `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts:207-225`).
- The plugin extension’s gog runner does not pass `--client`, does not ensure OAuth credentials are imported, and therefore does not obviously align with the profile-aware host auth/runtime contract (`plugins/sero-google-plugin/extension/gogcli.ts:70-78` vs `apps/desktop/electron/cli/lib/gog-runner.ts:70-92`).
- The existing app-agent architecture already loads only app-local extensions, which means the shell is missing a generic “invoke my app’s tool directly” capability more than it is missing Google-specific business logic.
