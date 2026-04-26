# Context for: external/local plugin examples catalog

## Relevant Files
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — explicitly blocks the external/local plugin catalog behind product/support decisions and runtime smoke tests.
- `.pi/plans/2026-04-26-feature-inventory/plugin-ecosystem-doc-scout.md` — summarizes the user/authored plugin model, discovery/favorites behavior, alpha caveats, and what is safe to say.
- `apps/docs-site/docs/guide/plugins-and-apps.md` — user-facing overview of built-in vs bundled vs installed plugins, App Store discovery, trust caveats, compatibility gating, and widget scope.
- `apps/docs-site/docs/guide/app-store-favorites.md` — user-facing install/discovery/favorites flow, uninstall/state retention, unsupported-host labeling, and security caveats.
- `apps/docs-site/docs/reference/plugins.md` — canonical plugin model, distribution modes, local plugin development, and the Daily Quote starter reference.
- `apps/docs-site/docs/reference/plugin-author-quick-path.md` — conservative author path, manifest fields, app-runtime hooks, widget registration, and compatibility checklist.
- `docs/plugins/guide.md` — canonical monorepo plugin author/user guide, including install sources, local plugin development, manifest reference, and source-only alpha warnings.
- `docs/features/local-plugin-development.md` — defines local plugin development as profile-scoped activation of a checkout, separate from install and attached folders.
- `plugins/sero-*-plugin/package.json` — confirms manifest metadata for built-in/bundled plugin examples.
- `../plugins/sero-*-plugin/package.json` — adjacent external examples in the sibling plugin repo (google, kanban, etc.); treat as examples only, not support claims.

## Candidate Examples and Locations

### Built-in / in-repo bundled examples
These live in `sero/plugins/sero-*-plugin/` and ship with the monorepo:
- `sero-admin-plugin` → app id `admin`, category `developer-tools`, tags `admin/settings/sessions/logs/agents/skills/prompts`, global scope, no widgets.
- `sero-cron-plugin` → `cron` / `Scheduler`, category `productivity`, tags `scheduler/reminders/jobs`, global scope, static dashboard widget `scheduler-status`.
- `sero-git-plugin` → `git` / `Git`, category `developer-tools`, tags `git/branches/diff`.
- `sero-mcp-plugin` → `mcp` / `MCP`, category `developer-tools`, tags `mcp/servers/oauth/resources`, global scope, required caps `appAgent.invokeTool` + `tool.cli`, `bridgeTools: ["mcp"]`.
- `sero-memory-plugin` → no app manifest in the read manifest; only `sero.plugin` with category `utilities`, tags `memory/identity/logs`.
- `sero-user-feedback-plugin` → `userfeedback` / `User Feedback`, category `utilities`, tags `questions/questionnaire/feedback`, `bridgeTools: false`.
- `sero-web-plugin` → `web` / `Web`, category `productivity`, tags `web/search/fetch/youtube/github`, widget `activity`.
- `sero-alibaba-plugin` → provider-only plugin; no `sero.app`, only `sero.providers` for `alibaba-coding-plan`.

### Adjacent external examples
These live under sibling `../plugins/` and are useful catalog candidates if product decides to mention external examples:
- `sero-daily-quote-plugin` → `daily-quote` / `Daily Quote`, category `utilities`, tags `quotes/inspiration/daily`.
- `sero-google-plugin` → `google` / `Google`, category `integrations`, tags `google/gmail/calendar/workspace`, runtime `runtime/index.ts`, widgets `mail-indicator` and `mini-calendar`, required caps `appAgent.invokeTool`, `tool.cli`, `appRuntime.background`, bridged tools `google/gmail/gcal`.
- `sero-kanban-plugin` → `kanban` / `Kanban`, category `productivity`, tags `kanban/planning/workflow`, runtime `runtime/index.ts`, widget `board-overview`, required caps `appAgent.invokeTool`, `tool.cli`, `appRuntime.background`, bridged tool `kanban`.
- `sero-plan-mode-plugin` → `planmode` / `Plan Mode`, category `developer-tools`, tags `plan-mode/planning/execution`, skills folder present.
- `sero-research-plugin` → `research` / `Research`, category `productivity`, tags `research/multi-agent/orchestrator`, runtime `runtime/index.ts`, skills folder present.
- `sero-spotify-plugin` → `spotify` / `Spotify`, category `entertainment`, tags `spotify/music/playback/streaming`, widget `mini-player`.
- `sero-notes-plugin` → `notes` / `Notes`, category `productivity`, tags `notes/writing/notebook`, widget `pinboard`.
- `sero-imagegen-plugin` → `imagegen` / `ImageGen`, category `creative`, tags `image-generation/ai-art/gemini`, widget `gallery`.
- `sero-humanizer-plugin` → `humanizer` / `Humanizer`, category `creative`, tags `humanizer/writing/ai-detection`, skills folder present.
- `sero-starling-plugin` → `starling` / `Starling Bank`, category `finance`, tags `starling/banking/finance/transactions`.
- `sero-calc-plugin` → `calc` / `Calculator`, category `utilities`, tags `calculator/math`.
- `sero-tetris-plugin` → `tetris` / `Tetris`, category `entertainment`, tags `tetris/game/arcade`.
- `sero-slopzilla-plugin` → `slopzilla` / `SlopZilla`, category `creative`, tags `slopzilla/ai-slop/idea-generator`.
- `sero-weight-tracker-plugin` → `weight-tracker` / `Weight`, category `health`, tags `weight/tracker/health/fitness`.

## Confirmed Metadata Patterns
- Plugin manifests consistently confirm `sero.app.id`, `name`, `icon`, `scope` (when present), `stateFile`, `ui`, `component`, and `devPort` for app-backed plugins.
- Widgets are manifest-confirmed for `cron`, `web`, `spotify`, `notes`, `imagegen`, `google`, `kanban`, and `userfeedback` has no widget in the manifest read.
- `mcp` and `google`/`kanban` confirm `requiredHostCapabilities`; `mcp`, `google`, `kanban`, and `userfeedback` confirm `bridgeTools` variations.
- `alibaba` confirms provider-only metadata via `sero.providers`, not an app surface.

## Safe Support Labels
Safe to say in public docs without overclaiming:
- “built-in plugin example” or “in-repo bundled plugin” for `sero/plugins/sero-*-plugin/`.
- “adjacent external example” or “source example repo” for `../plugins/*`.
- “confirmed app surface”, “confirmed dashboard widget”, “confirmed provider metadata”, or “confirmed required host capabilities” when the manifest shows them.
- “alpha”, “trusted source only”, “compatibility-gated”, and “local plugin development is profile-scoped”.

## Product-Decision-Needed Labels
Do **not** state these without a product/support decision:
- official support / endorsed / reviewed / maintained
- bundled as a product feature for external examples
- stable marketplace or commercial marketplace
- all examples are tested or smoke-checked
- all examples are safe to install from search/discovery
- auto-update is available as a public guarantee
- widget placement/sizing is guaranteed beyond declared hints
- every installed plugin activates in every runtime/host mode

## Runtime Smoke-Test Expectations Before Public Catalog Mentions
The docs explicitly defer the catalog until product/support decisions and runtime checks. For each candidate, expect at least:
- install path verification from the intended source type (npm/git/local path/local checkout dev session)
- sidebar/app launch visibility for app-backed plugins
- host compatibility gating behavior (`minSeroVersion`, `requiredHostCapabilities`)
- uninstall/reinstall behavior and state-retention expectations
- widget rendering where manifests claim widgets
- runtime/background capability when the manifest declares `runtime`
- source trust review for any source-based install path

## Trust / Security / Install-Source Caveats
- Third-party plugins are source code; treat them like code you run locally.
- Discover/search results are not reviewed or sandboxed.
- Source installs may execute local build steps.
- Local Plugin Development is not the same as install and not the same as attached folders.
- Uninstall does not guarantee secure wipe of plugin-created app state.
- Compatibility checks reduce breakage, but they are not a security review.

## What Not to Claim
Avoid saying or implying:
- external/local examples are official Sero features
- the catalog is a stable, supported marketplace
- every listed example is maintained/tested by the team
- all examples are bundled with the app
- search/discovery results are vetted or safe by default
- install/update/uninstall semantics are fully finalized beyond what is explicitly documented

## Key Takeaway
The public docs can safely describe a conservative catalog of examples only as **examples**, with source location and manifest-confirmed metadata. Anything about support status, maintenance, or marketplace guarantees remains product/support gated.
