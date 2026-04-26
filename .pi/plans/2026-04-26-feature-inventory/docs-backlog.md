# Feature Inventory Documentation Backlog

**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Inventory:** `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`  
**Verification log:** `.pi/plans/2026-04-26-feature-inventory/verification-log.md`

This is a planning backlog only. It is not polished documentation, marketing copy, onboarding copy, or release-note text.

## Existing Docs Checked

- `README.md` — current alpha positioning, support caveats, highlights, screenshots, docs entry points.
- `docs/README.md` — public/internal docs model and durable-doc placement rules.
- `docs/features/memory.md` — existing detailed memory reference; should be linked/split rather than duplicated.
- `docs/plugins/guide.md` — plugin install/development/distribution guide and built-in vs external plugin distinction.
- `docs/guides/version-control-user-flow.md` — JJ-backed Explorer source-control flow, not the Git Manager plugin guide.
- `docs/reference/state-and-folders.md` — canonical profile/state/storage paths and public caveats.

## Priority Legend

- **P0** — first pilot candidate; high-value, high-confidence, core/built-in, or currently blocking safe public docs.
- **P1** — important follow-up after P0; likely needs runtime screenshots or product decisions first.
- **P2** — later docs, examples, support references, or lower-confidence/external/local topics.

---

## General Users — User Docs

### Title: Memory: persistent context user guide

- **Inventory rows referenced:** Memory & Context / Persistent memory files; Memory & Context / Automatic memory context injection; Memory & Context / Memory search and scratchpad tools; Memory & Context / Memory consolidation and transcript recall; Data Persistence & Sync / Session transcript and memory sync
- **Output type:** User docs + onboarding brief
- **Audience:** General user, Power user
- **Priority:** P0
- **Why now:** Memory is a verified built-in plugin differentiator with existing source/docs support and clear onboarding value.
- **Existing coverage:** `docs/features/memory.md` already covers architecture, storage, tools, QMD, and lifecycle. Future work should split/distill a user-facing guide and link the reference page; do not duplicate the architecture reference wholesale. `docs/reference/state-and-folders.md` should be linked for storage paths.
- **Confidence / verification basis:** High confidence for files, context injection, tools, and scratchpad from `verified-inventory.md`; consolidation/transcript behavior remains partially verified per `verification-log.md`.
- **Blocked by:** Runtime screenshots/demo of memory context visibility, bootstrap questionnaire, and QMD available/unavailable behavior.
- **Acceptance for future doc:** Explains what memory stores, how context injection appears, how to inspect/use memory and scratchpad, where data lives under `<SERO_HOME>/workspaces/global/`, and limitations around recall quality/QMD.

### Title: Core workspace and global chat getting-started guide

- **Inventory rows referenced:** Core Workspace / Persistent desktop shell; Core Workspace / Built-in Dashboard and Explorer apps; Core Workspace / Sidebar app switching; Core Workspace / First-run profile setup and onboarding; Agent & Chat / Global chat panel; Agent & Chat / Session-based agent lifecycle; Files & Projects / Workspace registry; Files & Projects / Searchable session tree grouped by workspace
- **Output type:** User docs + onboarding
- **Audience:** General user
- **Priority:** P0
- **Why now:** This is the first mental model users need before plugin-specific docs. Most rows are verified and already align with README screenshots.
- **Existing coverage:** `README.md` gives a high-level shell overview and screenshots. `docs/architecture.md` may contain deeper architecture, but this backlog checked only required docs; future writer should link architecture for internals and create/update a concise user guide rather than expanding README. `docs/reference/state-and-folders.md` covers profile/workspace storage.
- **Confidence / verification basis:** High for shell, app switching, onboarding/profile setup, global chat, session lifecycle, and workspace registry from FI-005 verification. Some prompt controls/attachments remain partially verified and should stay out of first-pass docs unless tested.
- **Blocked by:** Fresh desktop screenshots and runtime confirmation of onboarding steps, chat controls, and session-create/resume UI.
- **Acceptance for future doc:** Shows first-run/profile flow, identifies sidebar/main app/chat panel/status bar, explains app switching and sessions, states macOS Apple Silicon/source-only alpha caveats, and avoids unverified attachment/slash-command specifics.

### Title: Web access: search, fetch, bookmarks, and provider setup guide

- **Inventory rows referenced:** Web & Research / Web search; Web & Research / Web content fetching and extraction; Web & Research / Code-oriented web search; Web & Research / Web bookmarks and activity widget; Data Persistence & Sync / Web search state sync
- **Output type:** User docs + integration docs
- **Audience:** General user, Power user, Developer
- **Priority:** P0
- **Why now:** Web access is a high-impact built-in plugin area and a recommended pilot, but provider/config caveats need clear docs before public promotion.
- **Existing coverage:** No required existing doc checked here already covers the Web plugin. `README.md` does not list it as a current highlight. Future work should create a focused feature guide and link `docs/reference/state-and-folders.md` for `.sero/apps/web/state.json` state only where useful.
- **Confidence / verification basis:** High confidence that built-in web search/fetch/bookmark/state-sync tooling exists; verification is partial because provider credentials, browser sign-in, third-party availability, and extraction matrix were not runtime-tested.
- **Blocked by:** Provider setup matrix and runtime tests for representative Exa/Perplexity/Gemini paths plus fetch cases for HTML, PDF, GitHub, and video if examples will be included.
- **Acceptance for future doc:** Lists supported workflows conservatively, explains credential/provider prerequisites, describes where results are stored, includes failure-mode guidance, and avoids claiming all providers work by default.

### Title: Automations: scheduler and reminders guide

- **Inventory rows referenced:** Automations & Background Jobs / Recurring agent scheduler; Automations & Background Jobs / Reminders; Automations & Background Jobs / Current time helper
- **Output type:** User docs + onboarding
- **Audience:** General user, Power user
- **Priority:** P0
- **Why now:** Cron/reminders are verified enough to plan docs and are a visible productivity feature, but notification/background behavior needs careful caveats.
- **Existing coverage:** No required existing doc checked here already covers the Scheduler/Cron plugin. Future work should create a feature guide and link `docs/reference/state-and-folders.md` only if state paths are documented later.
- **Confidence / verification basis:** High confidence that Scheduler app/widget, `/cron`, `cron`, `reminder`, and `current_time` tools exist; partial verification for notification delivery, missed-run recovery, and live scheduling behavior.
- **Blocked by:** Runtime test with disposable jobs/reminders, notification permission behavior, missed-run recovery check, and screenshots of app/widget state.
- **Acceptance for future doc:** Explains recurring jobs vs reminders, supported actions, notification limitations, safe examples, troubleshooting for missed/disabled jobs, and does not promise background reliability beyond verified behavior.

### Title: Optional web remote access guide

- **Inventory rows referenced:** Remote Access / Web remote client; Remote Access / Gateway and WebSocket bridge
- **Output type:** User docs + support reference
- **Audience:** General user, Power user, Support
- **Priority:** P1
- **Why now:** The browser client is high-impact and partially verified, but public wording is risky unless optional gateway/token constraints are explicit.
- **Existing coverage:** `README.md` does not promote remote access; `docs/reference/state-and-folders.md` documents gateway token/config file locations. Future work should create a gated support/user guide, not a homepage-style feature page, until runtime pairing is tested.
- **Confidence / verification basis:** High confidence for source-supported workspace/session/chat/file/artifact scope; partial verification because it was not runtime-tested and requires `SERO_GATEWAY=1` plus token-gated access.
- **Blocked by:** Runtime test of paired browser/device flow, token lifecycle documentation, HTTPS/Tailscale/local-network recommendation decision, and security review.
- **Acceptance for future doc:** Describes optional enablement, authentication/token model, supported remote actions, local-network/security caveats, and clearly states remote access is not always-on or publicly hosted by default.

---

## Developers and Power Users — Workflow Docs

### Title: Git Manager: visual and agent-assisted Git workflow guide

- **Inventory rows referenced:** Git & Developer Workflows / Visual Git manager; Git & Developer Workflows / Agent-assisted Git command bridge; Git & Developer Workflows / Branch and worktree operations; Data Persistence & Sync / Git state file sync
- **Output type:** User docs + developer docs
- **Audience:** Developer, Power user
- **Priority:** P0
- **Why now:** Git is a high-impact built-in plugin and recommended pilot. It needs docs that distinguish visual Git Manager behavior from existing Explorer Source Control docs.
- **Existing coverage:** `docs/guides/version-control-user-flow.md` covers JJ-backed Explorer Source Control, not the Git Manager plugin. Future docs should update/split/link: keep JJ Source Control guide for Explorer workflows, create a separate Git Manager guide, and cross-link the two with a clear “which tool to use” note.
- **Confidence / verification basis:** High confidence for `git_manager`, `/git`, Git state sync, and action list; partial verification for complete UI affordance coverage and branch/worktree side effects.
- **Blocked by:** Runtime test in a disposable repo for status, diff, stage, commit, stash, branch, fetch/pull/push, and worktree flows; screenshots of Git app and confirmation of which actions are visual vs agent/tool-only.
- **Acceptance for future doc:** Explains visual Git Manager vs agent bridge vs Explorer JJ Source Control, lists verified supported actions with safety notes, covers repository mutation risk, and avoids claiming every tool action has a polished UI control unless verified.

### Title: Explorer workspace basics and dev-server surfaces

- **Inventory rows referenced:** Core Workspace / Built-in Dashboard and Explorer apps; Files & Projects / Live file tree updates; Files & Projects / Multi-root workspaces; Files & Projects / Workspace references and mounts; Terminal & Containers / Dev server management; Terminal & Containers / Per-workspace container runtime
- **Output type:** User docs + developer docs
- **Audience:** Power user, Developer
- **Priority:** P1
- **Why now:** Explorer is central to daily development but verification notes warn against overclaiming IDE parity or automatic dev-server behavior.
- **Existing coverage:** `README.md` screenshot mentions Explorer workspace. `docs/guides/version-control-user-flow.md` documents only Source Control. Future work should update/create an Explorer basics guide and link Source Control separately; do not fold all Explorer capabilities into the Git Manager doc.
- **Confidence / verification basis:** High confidence that Explorer exists with file/editor/browser/diff/terminal-related surfaces; medium/partial verification for file-watch refresh, multi-root setup, mounts, and automatic dev-server semantics.
- **Blocked by:** Runtime review of file tree refresh, terminal creation, browser panel, diff/editor behavior, dev-server registration/control flow, and container vs host mode differences.
- **Acceptance for future doc:** Provides a conservative map of Explorer surfaces, verified workflows only, known limitations, and cross-links to Source Control, Git Manager, containers, and state/folders references.

### Title: Containers and host-mode runtime guide

- **Inventory rows referenced:** Terminal & Containers / Per-workspace container runtime; Terminal & Containers / Container HTTP proxy; Terminal & Containers / Orphaned container cleanup; Terminal & Containers / Terminal cleanup on shutdown; Terminal & Containers / Container fallback and availability detection
- **Output type:** Developer docs + support
- **Audience:** Developer, Power user, Support
- **Priority:** P1
- **Why now:** Runtime mode affects many user-visible capabilities and README already sets expectations around preferred containers and reduced host mode.
- **Existing coverage:** `README.md` covers high-level container/host posture. Required check did not include `docs/guides/macos-containers.md`, so a future writer must review it before creating or updating runtime docs. `docs/reference/state-and-folders.md` covers profile/workspace paths.
- **Confidence / verification basis:** High confidence for main-process container setup/proxy/cleanup evidence; partial verification for fallback triggers and user-facing messages.
- **Blocked by:** Review existing macOS containers guide, runtime tests with and without Apple containers, and screenshots/errors for unavailable container states.
- **Acceptance for future doc:** Explains preferred container mode, reduced host mode, setup/preflight, common troubleshooting, proxy/cleanup behavior at a support level, and avoids claiming full host/container parity.

---

## Plugin Users — Plugin Management Docs

### Title: App Store, favorites, and installed plugins user guide

- **Inventory rows referenced:** Core Workspace / App store and favorites; Core Workspace / Sidebar app switching; Plugin Ecosystem / Federated app runtime hooks; Data Persistence & Sync / Plugin/app state files; Remote Access / Remote plugin entry loading
- **Output type:** User docs + plugin docs
- **Audience:** Plugin user, General user
- **Priority:** P1
- **Why now:** Users need a clear distinction between built-in apps, discovered apps, external plugins, favorites, and install/update/uninstall behavior before ecosystem docs expand.
- **Existing coverage:** `docs/plugins/guide.md` documents install/uninstall/distribution and built-in vs external plugin distinctions. Future work should update or split it: keep the author-heavy guide, add/link a shorter user-facing plugin-management page, and avoid duplicating manifest/build details.
- **Confidence / verification basis:** High confidence for plugin guide and app runtime platform; partial verification for App Store UI install/uninstall semantics and capability gating.
- **Blocked by:** Runtime/UI inspection of App Store dialog, plugin install/uninstall flow, favorites persistence, incompatible plugin behavior, and app-state retention messaging.
- **Acceptance for future doc:** Explains built-in vs installed plugins, where plugins live, trust caveats for npm/git/local installs, favorites/sidebar behavior, data retention on uninstall, and links the author guide for build/publish details.

---

## Plugin Authors — Developer Docs

### Title: Plugin author quick path and app-runtime API guide

- **Inventory rows referenced:** Plugin Ecosystem / Federated app runtime hooks; Terminal & Containers / App runtime command execution; Data Persistence & Sync / Plugin/app state files; Remote Access / Remote plugin entry loading; UI / Layout / Theming / Dashboard widget sizing
- **Output type:** Plugin docs + developer docs
- **Audience:** Plugin author, Developer
- **Priority:** P0
- **Why now:** Plugin ecosystem is a core product pillar and verified enough for author docs, but API stability and host capabilities must stay caveated during alpha.
- **Existing coverage:** `docs/plugins/guide.md` is comprehensive for install/build/publish. It already links quickstart, end-to-end example, technical details, and local plugin development. Future work should update/split rather than duplicate: keep guide as canonical long-form, produce a shorter quick path or docs-site page that links to the detailed guide.
- **Confidence / verification basis:** High confidence for app-runtime hooks/context and plugin distribution model; partial verification for exact command execution API and current host capability boundaries.
- **Blocked by:** Review `packages/app-runtime/README.md` in full for current API shape, confirm host capability names, and decide what is stable enough for public alpha docs.
- **Acceptance for future doc:** Shows minimal UI + extension + state example, lists supported hooks and caveats, describes widget registration and file-backed state, links build/distribution guide, and clearly states evolving alpha contracts.

### Title: External/local plugin examples catalog

- **Inventory rows referenced:** Integrations / Google Workspace external plugin; Integrations / Spotify external plugin; Integrations / Starling Bank external dashboard; Git & Developer Workflows / Kanban external development board; Git & Developer Workflows / Plan Mode external plugin; Web & Research / Research external orchestrator; Productivity / Todo external app; Productivity / Notes external app; Creative Tools / Image generation external app; Creative Tools / Humanizer external writing assistant
- **Output type:** Plugin examples + later integration docs
- **Audience:** Plugin author, Plugin user, Developer
- **Priority:** P2
- **Why now:** External/local plugins demonstrate ecosystem breadth, but they should not outrank verified built-in/core docs or be presented as bundled features.
- **Existing coverage:** `docs/plugins/guide.md` explains plugins are installed separately and do not ship with Sero. No checked required doc acts as an examples catalog. Future work could add a clearly labeled examples page or link out to plugin READMEs after product decides support status.
- **Confidence / verification basis:** Medium confidence for several external/local plugins from README/package/source checks; Todo/Notes/ImageGen/Humanizer and novelty examples remain needs-verification or lower priority in inventory.
- **Blocked by:** Product decision on official support/website inclusion, runtime smoke tests for any example promoted beyond a catalog, and setup/security review for credential-heavy integrations.
- **Acceptance for future doc:** Labels every entry as external/local, states prerequisites and support status, links plugin READMEs, avoids bundled-feature wording, and keeps novelty/low-confidence plugins in examples/later sections.

---

## Admin and Support — Reference Docs

### Title: State, folders, profiles, and storage map updates

- **Inventory rows referenced:** Data Persistence & Sync / File-backed layout state; Files & Projects / Workspace registry; Security / Permissions / Profile-scoped Chromium isolation; Memory & Context / Persistent memory files; Remote Access / Gateway and WebSocket bridge; Data Persistence & Sync / Plugin/app state files
- **Output type:** Support reference + admin docs
- **Audience:** Admin, Support, Power user
- **Priority:** P1
- **Why now:** Many feature docs need a canonical storage link; verification found stale wording risk around layout paths.
- **Existing coverage:** `docs/reference/state-and-folders.md` is the canonical current reference and already covers profile roots, `SERO_AGENT_DIR`, layout, workspaces, memory, app state, auth, gateway files, local vs remote caveats. Future work should update this page only if verification finds gaps; new pages should link it rather than duplicate paths.
- **Confidence / verification basis:** High confidence for profile-scoped paths and storage model from FI-005 and existing reference doc.
- **Blocked by:** Confirm any plugin-specific state paths that new feature docs plan to mention; reconcile any remaining older docs that say `~/.sero-ui/layout.json`.
- **Acceptance for future doc:** Keeps `<SERO_HOME>/agent/` as canonical, lists any newly documented app state paths, adds cross-links from feature docs, and flags sensitive files/auth material.

### Title: Security, permissions, and sensitive-action prompts reference

- **Inventory rows referenced:** Security / Permissions / Strict renderer isolation; Security / Permissions / Admin surface safety guard; Security / Permissions / Permission-gated sensitive actions; User Feedback & Permissions / Agent question prompts; User Feedback & Permissions / Structured questionnaires; MCP & Tooling / UI-only MCP management and auth
- **Output type:** Admin docs + support
- **Audience:** Admin, Support, General user
- **Priority:** P1
- **Why now:** Permission-gated bash actions, admin UI-only surfaces, and renderer safeguards are important trust topics but easy to overclaim.
- **Existing coverage:** `README.md` links `SECURITY.md` and `docs/security/gateway.md`, but those were outside the required check list. `docs/reference/state-and-folders.md` covers sensitive local files. Future work must review existing security docs before creating a new page; likely update/link existing security references rather than duplicate them.
- **Confidence / verification basis:** High confidence for renderer safeguards and scoped permission gate implementation; partial verification for exact UI prompt layout, TUI fallback, and admin/MCP host-bridge boundaries.
- **Blocked by:** Review `SECURITY.md` and `docs/security/**`, runtime-test permission prompt UI/fallback, and confirm intended wording for admin/MCP UI-only boundaries.
- **Acceptance for future doc:** Uses specific wording: dangerous `bash` patterns can require approval; does not claim universal tool permissions or cryptographic profile isolation; links security policy and state/folders reference.

### Title: Admin app operational guide

- **Inventory rows referenced:** Admin & Configuration / Admin config, logs, and session browser; Security / Permissions / Admin surface safety guard; Security / Permissions / UI-only admin safety boundary
- **Output type:** Admin docs + support
- **Audience:** Admin, Support
- **Priority:** P2
- **Why now:** Admin surfaces are important for support, but exact UI tabs/editing capabilities are only partially verified and sensitive.
- **Existing coverage:** Required docs checked do not cover Admin UI. `docs/reference/state-and-folders.md` covers files Admin may expose. Future work should create/update an admin support guide only after UI review, and link storage/security docs instead of restating secrets guidance.
- **Confidence / verification basis:** High confidence that a built-in Admin app exists and is intended UI-only for sensitive surfaces; partial verification for exact tabs and edit capabilities.
- **Blocked by:** Runtime/UI inspection of Admin tabs, edit/save flows, log/session views, and security review of safe public wording.
- **Acceptance for future doc:** Describes what admins can inspect or edit, what should not be shared in support tickets, how to find logs/session data safely, and avoids implying the agent has direct admin-tool authority.

---

## Website, README, and Release Surfaces — Brief Inputs Only

### Title: Website/README feature pillars update brief

- **Inventory rows referenced:** Core Workspace / Persistent desktop shell; Agent & Chat / Global chat panel; Plugin Ecosystem / Federated app runtime hooks; Memory & Context / Persistent memory files; Git & Developer Workflows / Visual Git manager; Web & Research / Web search; Automations & Background Jobs / Recurring agent scheduler
- **Output type:** Website brief + README update brief
- **Audience:** General user, Developer, Plugin author
- **Priority:** P1
- **Why now:** README already has broad highlights, but the verified inventory identifies stronger built-in feature pillars. This should remain a copy brief until FI-010.
- **Existing coverage:** `README.md` currently covers shell, local-first execution, containers, plugin-first extensibility, Pi-native model, and screenshots. Future work should update existing README/website sections rather than create duplicative marketing pages, and must preserve alpha caveats.
- **Confidence / verification basis:** High for core workspace/plugin/memory; partial for Git UI completeness, web providers, cron notifications. External/local integrations should not be promoted as bundled pillars.
- **Blocked by:** Product approval of public positioning, screenshots/demo clips, and decisions on whether partially verified built-in features appear in website copy before runtime testing.
- **Acceptance for future doc:** Provides proof-point bullets tied to inventory rows, keeps source-only macOS Apple Silicon alpha caveats, avoids final slogans, and excludes low-confidence/external/local plugins from primary feature hierarchy.

### Title: Release-note candidates for newly documented built-in features

- **Inventory rows referenced:** Memory & Context / Automatic memory context injection; Git & Developer Workflows / Agent-assisted Git command bridge; Web & Research / Web bookmarks and activity widget; Automations & Background Jobs / Reminders; Plugin Ecosystem / Federated app runtime hooks; Remote Access / Web remote client
- **Output type:** Release-note brief
- **Audience:** Existing users, Developers, Plugin authors
- **Priority:** P2
- **Why now:** Several features are important but release-note wording should wait for documentation/runtime verification so it does not overstate availability.
- **Existing coverage:** `README.md` and required docs do not act as changelog entries. Future work should use `CHANGELOG.md`/release process after FI-010, not this backlog, for final notes.
- **Confidence / verification basis:** Mixed: high confidence for several built-in capabilities, partial verification for reminders, web provider behavior, and web remote runtime scope.
- **Blocked by:** Product/release decision on which version or milestone each feature belongs to, runtime tests for partial items, and final copy review.
- **Acceptance for future doc:** Each note cites inventory rows, includes caveats/prerequisites, avoids announcing external/local integrations as core releases, and links to finished docs once available.
