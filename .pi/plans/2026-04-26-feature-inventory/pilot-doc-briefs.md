# Pilot Documentation Briefs

**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Inventory:** `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`  
**Backlog:** `.pi/plans/2026-04-26-feature-inventory/docs-backlog.md`  
**Verification log:** `.pi/plans/2026-04-26-feature-inventory/verification-log.md`

This is a planning artifact only. It is not final documentation, marketing copy, onboarding copy, or release-note text. Future docs must stay traceable to the inventory rows and source paths below, and must not add unverified feature claims.

## Pilot Selection Notes

All five recommended pilot topics are verified enough for briefs, with caveats:

- Memory has the strongest existing docs/source support, but recall quality, generated summaries, and QMD availability need runtime examples before polished copy.
- Git Manager is source-supported, but UI coverage for every tool action is not fully verified; future docs must distinguish visual controls from agent/tool actions.
- Web access is source-supported, but provider availability depends on credentials, browser/profile state, third-party services, and runtime dependencies.
- Cron/reminders are source-supported, but notification delivery and missed-run behavior need runtime tests.
- Plugin ecosystem/app runtime is source-supported for developer docs, while end-user App Store/install semantics remain partially verified.

No recommended pilot was skipped or replaced.

---

## Pilot Brief: Memory System User Guide

- **Audience:** General users and power users.
- **Goal:** Explain how Sero stores durable memory, injects relevant context into agent sessions, and lets users inspect or update memory and scratchpad content.
- **Inventory rows:**
  - `Memory & Context / Persistent memory files` — verified, high confidence.
  - `Memory & Context / Automatic memory context injection` — verified, high confidence.
  - `Memory & Context / Memory search and scratchpad tools` — verified, high confidence.
  - `Memory & Context / Memory consolidation and transcript recall` — partially verified, medium confidence.
  - `Data Persistence & Sync / Session transcript and memory sync` — partially verified, medium confidence.
- **Source citations:**
  - `docs/features/memory.md`
  - `plugins/sero-memory-plugin/package.json`
  - `plugins/sero-memory-plugin/extension/index.ts`
- **Proposed outline:**
  1. What Sero memory is and why it exists.
  2. What memory files can store: durable facts, identity, user profile, scratchpad, daily logs, and transcript/debug-related memory data.
  3. How selective context injection works at a user-facing level.
  4. How to inspect and update memory with the `memory`, `memory_search`, and `scratchpad` tools plus `/memory`, `/scratchpad`, and `/memory-log` commands.
  5. Where memory lives and how it relates to profile/workspace state.
  6. Limits and troubleshooting: QMD unavailable, imperfect recall, non-exhaustive context injection, consolidation uncertainty.
- **Screenshot/demo needs:**
  - Memory-related command or tool invocation in chat.
  - Visible memory context or event if the UI exposes it.
  - Scratchpad read/write example.
  - Example of QMD available vs unavailable behavior if safe to demonstrate.
  - Storage-path screenshot only if it does not expose private user data.
- **Caveats:**
  - Do not claim perfect recall, exhaustive context injection, or always-available semantic search.
  - Do not imply generated summaries or consolidation cadence are fully verified without runtime testing.
  - Keep private memory file examples synthetic and avoid screenshots containing real user facts.
- **Acceptance criteria for future doc:**
  - Explains what memory stores, how context enters chat, how users inspect/update memory, and where data lives.
  - Links `docs/features/memory.md` as the detailed reference instead of duplicating it wholesale.
  - Includes recall/QMD/consolidation limitations.
  - Uses only screenshots or examples generated from disposable/synthetic data.

---

## Pilot Brief: Git Workspace Manager Guide

- **Audience:** Developers and power users working in Git repositories.
- **Goal:** Document the built-in Git Manager and agent-assisted Git bridge while clearly separating visual Git UI behavior, supported tool actions, and repository mutation risks.
- **Inventory rows:**
  - `Git & Developer Workflows / Visual Git manager` — partially verified, high confidence.
  - `Git & Developer Workflows / Agent-assisted Git command bridge` — verified, high confidence.
  - `Git & Developer Workflows / Branch and worktree operations` — partially verified, high confidence.
  - `Data Persistence & Sync / Git state file sync` — verified, high confidence.
- **Source citations:**
  - `plugins/sero-git-plugin/package.json`
  - `plugins/sero-git-plugin/extension/index.ts`
  - `plugins/sero-git-plugin/ui/GitApp.tsx`
  - `plugins/sero-git-plugin/extension/state-io.ts`
  - `packages/common/src/app-runtime-background.ts`
  - `docs/guides/version-control-user-flow.md` for contrast with Explorer/JJ source-control docs.
- **Proposed outline:**
  1. When to use Git Manager vs Explorer Source Control/JJ workflows.
  2. Opening the Git app and understanding repository state.
  3. Verified agent bridge capabilities: status, log, branch, diff, staging, commit, stash, fetch/pull/push, merge, cherry-pick, show commit, and worktree-related actions.
  4. What is known about the visual UI and what still requires UI verification.
  5. How Git state is synced into `.sero/apps/git/state.json` for app/agent context.
  6. Safety notes for mutating actions and disposable-repo testing.
- **Screenshot/demo needs:**
  - Git app overview in a disposable repository.
  - Status/diff/staging/commit flow if visually supported.
  - Agent `/git` or `git_manager` example for a safe read-only action.
  - Branch/worktree demo only after runtime verification.
- **Caveats:**
  - Do not claim every `git_manager` action has a polished visual control until the UI is runtime-tested.
  - Do not imply mutating Git operations are risk-free; they affect the real repository.
  - Do not merge this guide with `docs/guides/version-control-user-flow.md` without preserving the Git Manager vs Explorer/JJ distinction.
- **Acceptance criteria for future doc:**
  - States the difference between Git Manager, agent bridge, and Explorer Source Control.
  - Lists only verified supported actions, with visual-vs-tool-only distinctions where needed.
  - Includes safety guidance for staging, commits, pushes, branch/worktree operations, and force flags.
  - Uses screenshots from a disposable repo and links existing version-control docs.

---

## Pilot Brief: Web Access, Search, Fetch, and Bookmarks Guide

- **Audience:** General users, power users, and developers who want web context in agent workflows.
- **Goal:** Explain the built-in Web plugin’s search, fetch/extraction, code-search, bookmark, and state-sync workflows without overstating provider availability or extraction reliability.
- **Inventory rows:**
  - `Web & Research / Web search` — partially verified, high confidence.
  - `Web & Research / Web content fetching and extraction` — partially verified, high confidence.
  - `Web & Research / Code-oriented web search` — partially verified, high confidence.
  - `Web & Research / Web bookmarks and activity widget` — partially verified, high confidence.
  - `Data Persistence & Sync / Web search state sync` — verified, high confidence.
  - `Web & Research / Gemini account availability check` — partially verified, medium confidence; support/troubleshooting only.
- **Source citations:**
  - `plugins/sero-web-plugin/package.json`
  - `plugins/sero-web-plugin/extension/index.ts`
  - `plugins/sero-web-plugin/extension/tools-search.ts`
  - `plugins/sero-web-plugin/extension/tools-fetch.ts`
  - `plugins/sero-web-plugin/extension/tools-code-search.ts`
  - `plugins/sero-web-plugin/extension/tools-bookmark.ts`
  - `plugins/sero-web-plugin/extension/state-sync.ts`
- **Proposed outline:**
  1. What the Web plugin can do: search, fetch/extract, code-oriented search, bookmarks, and Web Activity widget.
  2. Provider-dependent search paths: Exa, Perplexity, Gemini API, and Gemini Web/account-dependent behavior.
  3. Fetch/extraction scope at a conservative level: URLs/pages, PDFs, GitHub content, YouTube/video, and local-video paths as source-supported but runtime-dependent.
  4. Saving and revisiting results/bookmarks.
  5. Where web search/fetch state is synced for the Web app.
  6. Troubleshooting credentials, provider failures, unsupported content, and third-party service changes.
- **Screenshot/demo needs:**
  - Successful web search result in Sero.
  - Fetched article/page content.
  - Bookmark creation and Web Activity widget if visible.
  - Provider setup/status screen or failure message if available.
  - Optional code-search example after provider behavior is verified.
- **Caveats:**
  - Do not imply all providers work by default or that credentials are bundled.
  - Do not guarantee extraction quality for PDFs, GitHub, YouTube/video, or local video without runtime tests.
  - Do not publish setup instructions until provider prerequisites and failure modes are confirmed.
- **Acceptance criteria for future doc:**
  - Lists provider prerequisites and conservative supported workflows.
  - Explains where results/bookmarks are stored without exposing private data.
  - Includes verified screenshots for search, fetch, and bookmarks/widget behavior.
  - Clearly separates built-in Web plugin capabilities from external/local Research plugin workflows.

---

## Pilot Brief: Cron, Reminders, and Automations Guide

- **Audience:** General users and power users who want recurring prompts, scheduled jobs, or reminders.
- **Goal:** Document Scheduler app/widget, `/cron`, `cron`, `reminder`, and `current_time` workflows while keeping notification/background reliability caveats visible.
- **Inventory rows:**
  - `Automations & Background Jobs / Recurring agent scheduler` — verified, high confidence.
  - `Automations & Background Jobs / Reminders` — partially verified, high confidence.
  - `Automations & Background Jobs / Current time helper` — verified, high confidence.
- **Source citations:**
  - `plugins/sero-cron-plugin/package.json`
  - `plugins/sero-cron-plugin/extension/index.ts`
  - `plugins/sero-cron-plugin/extension/tools.ts`
  - `plugins/sero-cron-plugin/extension/scheduler.ts`
  - `plugins/sero-cron-plugin/extension/notifier.ts`
  - `plugins/sero-cron-plugin/extension/recovery.ts`
- **Proposed outline:**
  1. What automations are in Sero: recurring jobs vs one-off/recurring reminders.
  2. Where users interact: Scheduler app, dashboard widget, `/cron`, and agent tools.
  3. Cron job actions: list, add, update, remove, enable, disable, and run.
  4. Reminder actions: create, update, snooze, complete, enable, disable, and list.
  5. Using `current_time` to avoid timezone ambiguity before scheduling.
  6. Notification limitations, missed-run behavior, and troubleshooting.
- **Screenshot/demo needs:**
  - Scheduler app overview.
  - Dashboard widget state.
  - Creating a disposable recurring job.
  - Creating/snoozing/completing a disposable reminder.
  - Desktop notification permission/delivery behavior.
  - Missed-run recovery example only after runtime verification.
- **Caveats:**
  - Do not promise notification delivery or background reliability until runtime-tested.
  - Do not overstate missed-run semantics beyond what source and tests prove.
  - Keep examples disposable and avoid scheduling prompts that mutate user data.
- **Acceptance criteria for future doc:**
  - Explains jobs vs reminders and lists verified actions.
  - Includes timezone/current-time guidance.
  - Documents notification prerequisites and known failure modes.
  - Demonstrates only runtime-tested app/widget/tool behavior.

---

## Pilot Brief: Plugin Ecosystem, App Store, Favorites, and App Runtime Guide

- **Audience:** Two linked audiences: plugin users who manage apps/favorites, and plugin authors who build with `@sero-ai/app-runtime`.
- **Goal:** Prepare a split guide plan that explains built-in vs installed plugins, sidebar/App Store/favorite behavior, and app-runtime capabilities while keeping alpha/API stability and trust caveats visible.
- **Inventory rows:**
  - `Core Workspace / App store and favorites` — partially verified, high confidence.
  - `Core Workspace / Sidebar app switching` — verified, high confidence.
  - `Plugin Ecosystem / Federated app runtime hooks` — verified, high confidence.
  - `Data Persistence & Sync / Plugin/app state files` — partially verified, high confidence.
  - `Remote Access / Remote plugin entry loading` — partially verified, high confidence.
  - `Terminal & Containers / App runtime command execution` — partially verified, high confidence.
  - `UI / Layout / Theming / Dashboard widget sizing` — partially verified, high confidence.
- **Source citations:**
  - `docs/plugins/guide.md`
  - `packages/app-runtime/README.md`
  - `packages/app-runtime/src/context.ts`
  - `packages/app-runtime/src/use-app-state.ts`
  - `packages/app-runtime/src/use-agent-prompt.ts`
  - `packages/app-runtime/src/use-ai.ts`
  - `packages/app-runtime/src/use-theme.ts`
  - `packages/app-runtime/src/use-widget-registration.ts`
  - `apps/desktop/src/components/layout/shell/MainSidebar.tsx`
  - `apps/desktop/src/components/layout/AppStoreDialog.tsx`
  - `apps/desktop/src/stores/app/shared.ts`
  - `apps/desktop/src/lib/federation-registry.ts`
- **Proposed outline:**
  1. User-facing concepts: built-in apps, installed/external plugins, discovered apps, favorites, and sidebar launch behavior.
  2. What is safe to say about the App Store dialog today, and what still needs UI verification.
  3. Plugin trust and alpha caveats: external/local plugins are separate from bundled features; APIs may evolve.
  4. Author-facing app-runtime overview: context, file-backed state, active-agent prompts, app-scoped AI, theme, models/tools, and widget registration.
  5. Remote entries and development/package loading at a high level.
  6. Links to long-form plugin guide, quickstart, and technical docs.
- **Screenshot/demo needs:**
  - Sidebar with built-in and favorite apps.
  - App Store dialog browsing/discovered apps.
  - Favorite toggle and persistence across relaunch if runtime-tested.
  - Minimal plugin UI using app-runtime state and theme.
  - Widget registration/dashboard widget example if verified.
- **Caveats:**
  - Do not imply a stable marketplace, stable plugin API, or that external/local plugins are bundled.
  - Do not document install/update/uninstall semantics until the App Store UI is runtime-inspected.
  - Do not overpromise host/container capability parity for plugin runtime commands.
- **Acceptance criteria for future doc:**
  - Separates plugin-user management docs from plugin-author API docs, even if they cross-link.
  - Clearly labels built-in vs external/local plugins and trust boundaries.
  - Cites `docs/plugins/guide.md` and `packages/app-runtime/README.md` for deeper details.
  - Includes runtime-confirmed screenshots for App Store/favorites before publishing end-user steps.
  - States alpha/evolving API caveats for app-runtime behavior.
