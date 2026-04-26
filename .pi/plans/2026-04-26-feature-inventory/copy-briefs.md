# Website, Onboarding, and Release-Note Copy Briefs

**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Inventory:** `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`  
**Verification log:** `.pi/plans/2026-04-26-feature-inventory/verification-log.md`  
**Backlog:** `.pi/plans/2026-04-26-feature-inventory/docs-backlog.md`  
**Information architecture:** `.pi/plans/2026-04-26-feature-inventory/information-architecture.md`  
**Pilot briefs:** `.pi/plans/2026-04-26-feature-inventory/pilot-doc-briefs.md`

This is a brief-level planning artifact only. It is not final website copy, onboarding copy, README copy, changelog text, or release notes. Future writers must treat the bullets below as scoped inputs requiring product/copy review, screenshots, and source traceability before publication.

## Global Copy Guardrails

- Preserve the current README positioning: Sero is a **local-first, agent-first desktop workspace for macOS**.
- Preserve alpha/support caveats from `README.md`: **source-only OSS alpha**, supported platform is **macOS on Apple Silicon**, distribution is **build from source only**, preferred runtime is Apple container-backed workspaces, host mode is a reduced fallback, no Linux/Windows/public-binary/stable-internal-API promises.
- Do not turn external/local integrations into bundled Sero feature claims. External/local examples may be mentioned only as separately installed plugin examples after product approval.
- Do not imply provider credentials, OAuth accounts, third-party service availability, notification delivery, gateway enablement, or container availability are automatic.
- Do not write final slogans, headlines, changelog entries, or release notes from this file without a review gate.

---

## Public Website / Homepage Briefs

### Website Brief: Desktop workspace with global agent chat

- **Surface:** Public homepage or website feature-section brief; possible README feature-pillar input after review.
- **Audience:** Developers and power users evaluating a source-built alpha workspace.
- **Positioning angle:** Frame Sero as one macOS desktop shell where project workspace, app surfaces, sidebar navigation, and Pi-backed chat stay visible without switching between unrelated tools.
- **Verified proof points:**
  - `Core Workspace / Persistent desktop shell` — verified, high confidence; supports sidebar, central app surface, right-side chat panel, title/status bars, and resizable/collapsible panels.
  - `Core Workspace / Built-in Dashboard and Explorer apps` — verified, high confidence; supports Dashboard/Explorer plus dynamic app surfaces.
  - `Core Workspace / Sidebar app switching` — verified, high confidence; supports launching built-in and favorited discovered apps.
  - `Agent & Chat / Global chat panel` — verified, high confidence; supports the separate global right-side chat panel.
  - `Agent & Chat / Session-based agent lifecycle` — verified, high confidence; supports open/close/focus/resume session behavior at a conservative level.
  - `UI / Layout / Theming / Resizable shell panels` — verified, high confidence; supports adjustable shell panels and persisted sizes.
- **Source citations:** `README.md`; `apps/desktop/src/App.tsx`; `apps/desktop/src/components/apps/ActiveAppPanel.tsx`; `apps/desktop/src/components/layout/shell/MainSidebar.tsx`; `apps/desktop/src/components/layout/shell/ChatPanel.tsx`; `apps/desktop/src/stores/agent.ts`; `apps/desktop/src/lib/persist-layout.ts`; `docs/architecture.md` as architecture background.
- **Caveats:** Must include source-only alpha and macOS Apple Silicon support scope near the website/README path. Do not describe exact onboarding steps, prompt attachments, slash-command catalog, or collaboration UX unless separately runtime-verified.
- **Do not claim:** Windows/Linux support; official public binaries; stable plugin/runtime APIs; full IDE parity; arbitrary command execution through the command palette; that every panel or state survives all crashes.
- **Demo/screenshot needs:** Updated desktop-shell overview showing sidebar, active app, chat panel, title/status bars, and resizable layout; separate image or clip showing app switching and a resumed session with synthetic data.
- **Review gate:** Product positioning + support-scope review before any homepage/README copy is drafted; screenshot review to ensure it reflects the current source-only alpha UI.

### Website Brief: Local-first runtime and workspace continuity

- **Surface:** Public website technical pillar or README “why Sero” expansion brief.
- **Audience:** Developers, power users, and contributors who care where state and runtime execution live.
- **Positioning angle:** Explain that Sero keeps workspace state and runtime control local, with profile-scoped files and preferred container-backed execution for development workflows.
- **Verified proof points:**
  - `Data Persistence & Sync / File-backed layout state` — verified, high confidence; supports file-backed layout outside browser storage.
  - `Core Workspace / Theme and layout restore` — verified, high confidence; supports restoring shell/theme-related state.
  - `Files & Projects / Workspace registry` — verified, high confidence; supports profile-scoped workspace registry.
  - `Security / Permissions / Profile-scoped Chromium isolation` — verified, high confidence; supports separate Electron browser data by profile.
  - `Terminal & Containers / Per-workspace container runtime` — partially verified, high confidence; supports managed per-workspace containers when available.
  - `Terminal & Containers / Container fallback and availability detection` — partially verified, high confidence; supports reduced host-mode fallback wording.
- **Source citations:** `README.md`; `apps/desktop/src/lib/persist-layout.ts`; `apps/desktop/src/types/layout.ts`; `apps/desktop/electron/ipc/workspace/layout.ts`; `apps/desktop/electron/features/workspace/manager.ts`; `apps/desktop/electron/main.ts`; `apps/desktop/electron/features/profile/manager.ts`; `docs/reference/state-and-folders.md`; `apps/docs-site/docs/reference/support-scope.md`.
- **Caveats:** Use “preferred container-backed workspaces” and “reduced host-mode fallback,” matching README. Keep storage-path language profile-aware and avoid old `~/.sero-ui/layout.json` shorthand for layout state.
- **Do not claim:** Cloud sync; hardened multi-tenant isolation; cryptographic security boundary between profiles; full host/container parity; guaranteed container availability; that all plugin/provider state is local-only without per-plugin review.
- **Demo/screenshot needs:** Runtime/status screenshot showing container/host mode only after runtime review; support-scope link placement in the page design; optional state/folders diagram derived from docs, not from private user paths.
- **Review gate:** Support-scope and security/privacy review before publishing; runtime verification for any container UI screenshot or host-mode message.

### Website Brief: Built-in agent memory and workflow tools

- **Surface:** Public homepage feature group or “what you can do in Sero” section brief.
- **Audience:** Developers and power users looking for agent-assisted workflows beyond plain chat.
- **Positioning angle:** Present built-in plugins as source-supported workflow capabilities: memory/context, Git, web access, and scheduling. Keep these as proof-backed examples, not broad availability promises.
- **Verified proof points:**
  - `Memory & Context / Persistent memory files` — verified, high confidence; supports durable memory files and scratchpad/daily-log concepts.
  - `Memory & Context / Automatic memory context injection` — verified, high confidence; supports selective context injection.
  - `Memory & Context / Memory search and scratchpad tools` — verified, high confidence; supports read/write/search/scratchpad workflows.
  - `Git & Developer Workflows / Agent-assisted Git command bridge` — verified, high confidence; supports `/git` and `git_manager` bridge wording.
  - `Git & Developer Workflows / Visual Git manager` — partially verified, high confidence; supports a built-in Git app at a conservative level.
  - `Web & Research / Web search` — partially verified, high confidence; supports built-in web-search tooling with provider caveats.
  - `Web & Research / Web content fetching and extraction` — partially verified, high confidence; supports fetch/extract tooling with runtime caveats.
  - `Automations & Background Jobs / Recurring agent scheduler` — verified, high confidence; supports Scheduler app/widget and cron tool concepts.
  - `Automations & Background Jobs / Reminders` — partially verified, high confidence; supports reminder actions with notification caveats.
- **Source citations:** `README.md`; `docs/features/memory.md`; `plugins/sero-memory-plugin/extension/index.ts`; `plugins/sero-git-plugin/package.json`; `plugins/sero-git-plugin/extension/index.ts`; `plugins/sero-web-plugin/extension/index.ts`; `plugins/sero-web-plugin/extension/tools-search.ts`; `plugins/sero-web-plugin/extension/tools-fetch.ts`; `plugins/sero-cron-plugin/package.json`; `plugins/sero-cron-plugin/extension/tools.ts`; `verification-log.md` claim reviews for Memory, Git, Web, and Cron.
- **Caveats:** Use cautious “built-in plugin” framing. Memory should be selective context, not perfect recall. Web provider behavior depends on configured credentials/accounts. Git mutations affect real repositories. Reminder notification/background behavior needs runtime verification.
- **Do not claim:** Perfect memory; exhaustive context injection; all web providers work by default; bundled third-party credentials; every Git action has a polished visual control; notification delivery is guaranteed; external/local Research/Google/Spotify/Starling/Kanban plugins are bundled.
- **Demo/screenshot needs:** Memory command with synthetic data; Git app or `/git` read-only action in a disposable repo; Web search/fetch using configured test provider; Scheduler/reminder in disposable workflow with notification permission state documented.
- **Review gate:** Product approval on which built-in plugin examples are homepage-worthy during alpha; runtime screenshot review for any partially verified feature before final web copy.

### Website Brief: Plugin-first extensibility for builders

- **Surface:** Public website developer section; README ecosystem paragraph; plugin-author docs entry teaser.
- **Audience:** Plugin authors, developers, contributors, and advanced users running local plugin checkouts.
- **Positioning angle:** Position Sero as plugin-first: apps can provide UI, Pi extension tools/commands/hooks, runtime/background behavior, app state, and widgets through a local development model.
- **Verified proof points:**
  - `Plugin Ecosystem / Federated app runtime hooks` — verified, high confidence; supports React app context, file-backed state, theme context, active-agent prompts, AI calls, model lists, tools, and widget registration.
  - `Remote Access / Remote plugin entry loading` — partially verified, high confidence; supports dev-server or packaged remote-entry loading as platform functionality.
  - `Data Persistence & Sync / Plugin/app state files` — partially verified, high confidence; supports app-scoped state concept.
  - `Core Workspace / App store and favorites` — partially verified, high confidence; supports browsing discovered apps and favorites at a conservative level.
  - `UI / Layout / Theming / Dashboard widget sizing` — partially verified, high confidence; supports widget sizing hints in plugin manifests.
- **Source citations:** `README.md`; `docs/plugins/guide.md`; `docs/plugins/quickstart.md`; `packages/app-runtime/README.md`; `packages/app-runtime/src/context.ts`; `packages/app-runtime/src/use-app-state.ts`; `packages/app-runtime/src/use-agent-prompt.ts`; `packages/app-runtime/src/use-ai.ts`; `packages/app-runtime/src/use-theme.ts`; `packages/app-runtime/src/use-widget-registration.ts`; `apps/desktop/src/lib/federation-registry.ts`; `apps/desktop/src/components/layout/AppStoreDialog.tsx`.
- **Caveats:** Plugin/runtime APIs may evolve during alpha. Installed external plugins live separately from the monorepo and do not ship with Sero by default. Trust and install-source caveats must accompany plugin ecosystem copy.
- **Do not claim:** Stable marketplace; stable external plugin API; automatic review/security vetting of all plugins; that external/local plugin examples are official bundled integrations; that every host capability is available in host mode.
- **Demo/screenshot needs:** App Store/favorites screenshot after UI verification; minimal plugin demo using app-runtime state and theme; widget example only if visible/runtime-tested.
- **Review gate:** Developer-doc owner and product review before public copy; external/local example inclusion requires explicit support-status decision.

---

## In-App Onboarding Briefs

### Onboarding Brief: First workspace and shell tour

- **Surface:** In-app onboarding module, welcome flow, or first-run checklist brief.
- **Audience:** New source-built alpha users on macOS Apple Silicon.
- **Positioning angle:** Help users identify the basic shell layout and start a first agent session without overexplaining advanced capabilities.
- **Verified proof points:**
  - `Core Workspace / First-run profile setup and onboarding` — verified, high confidence; supports profile/onboarding flow at a high level.
  - `Core Workspace / Persistent desktop shell` — verified, high confidence; supports sidebar/main/chat/status shell tour.
  - `Core Workspace / Sidebar app switching` — verified, high confidence; supports opening apps from the sidebar.
  - `Agent & Chat / Global chat panel` — verified, high confidence; supports persistent right-side chat panel.
  - `Files & Projects / Workspace registry` — verified, high confidence; supports returning to registered workspaces.
  - `Files & Projects / Searchable session tree grouped by workspace` — verified, high confidence; supports session search by name/first message grouped under workspaces.
- **Source citations:** `README.md`; `apps/desktop/src/App.tsx`; `apps/desktop/src/stores/profiles.ts`; `apps/desktop/electron/ipc/workspace/profiles.ts`; `apps/desktop/src/components/layout/shell/MainSidebar.tsx`; `apps/desktop/src/components/layout/shell/ChatPanel.tsx`; `apps/desktop/src/components/layout/workspace/WorkspaceTree.tsx`; `apps/desktop/src/stores/sessions.ts`.
- **Caveats:** Onboarding should acknowledge alpha setup/support scope where it affects the first run. Exact step labels and UI order must be verified in a live app before final onboarding text.
- **Do not claim:** Cross-platform support; one-click binary install; exact slash-command/attachment behavior; workspace-name search if only session search is verified; full IDE parity.
- **Demo/screenshot needs:** Current first-run/profile setup; shell tour overlay targets for sidebar, active app surface, chat panel, workspace/session tree; synthetic workspace/session data.
- **Review gate:** Runtime walkthrough by product/docs before writing final in-app strings; support-scope link or short caveat approved by product.

### Onboarding Brief: Memory basics for new users

- **Surface:** In-app onboarding card, guided example, or first-week tip brief.
- **Audience:** General users and power users learning why Sero’s agent context differs from plain chat.
- **Positioning angle:** Introduce memory as inspectable, selective, local files/context that can help future sessions, while setting limitations early.
- **Verified proof points:**
  - `Memory & Context / Persistent memory files` — verified, high confidence; supports durable memory file concepts.
  - `Memory & Context / Automatic memory context injection` — verified, high confidence; supports selective context injection.
  - `Memory & Context / Memory search and scratchpad tools` — verified, high confidence; supports `memory`, `memory_search`, and `scratchpad` workflows.
  - `Memory & Context / Memory consolidation and transcript recall` — partially verified, medium confidence; supports only caveated mention if needed.
  - `Data Persistence & Sync / Session transcript and memory sync` — partially verified, medium confidence; supports only caveated support-doc link, not onboarding promise.
- **Source citations:** `docs/features/memory.md`; `plugins/sero-memory-plugin/package.json`; `plugins/sero-memory-plugin/extension/index.ts`; `pilot-doc-briefs.md` Memory brief.
- **Caveats:** Use synthetic examples only. Keep QMD/consolidation/transcript recall as advanced/limitations material unless runtime-tested. Make privacy/local-file implications clear without overpromising security.
- **Do not claim:** Perfect recall; all prior chats are always injected; semantic search always works; memory is cloud-synced; generated summaries are always accurate.
- **Demo/screenshot needs:** Safe memory write/read or scratchpad example; visible injected-context indicator only if current UI exposes it; sample memory files with fake data if showing storage.
- **Review gate:** Memory feature owner/docs review; runtime check for current command output and UI visibility before final onboarding content.

### Onboarding Brief: Runtime mode, containers, and reduced host mode

- **Surface:** Setup/onboarding requirements panel, first-run runtime-status card, or troubleshooting prompt brief.
- **Audience:** New users building from source; developers running workspaces with or without Apple containers.
- **Positioning angle:** Set expectations that container-backed workspaces are preferred and host mode is a supported reduced fallback.
- **Verified proof points:**
  - `Terminal & Containers / Per-workspace container runtime` — partially verified, high confidence; supports container-backed workspace language with availability caveat.
  - `Terminal & Containers / Container fallback and availability detection` — partially verified, high confidence; supports reduced host-mode fallback language.
  - `Terminal & Containers / Container HTTP proxy` — verified, high confidence; support/troubleshooting proof point only.
  - `Terminal & Containers / Terminal cleanup on shutdown` — verified, high confidence; support/troubleshooting proof point only.
- **Source citations:** `README.md`; `apps/desktop/electron/main.ts`; `apps/desktop/src/types/ipc.ts`; `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx`; `apps/desktop/src/components/layout/workspace/WorkspaceReferencesMenu.tsx`; `docs/guides/macos-containers.md`; `apps/docs-site/docs/reference/support-scope.md`.
- **Caveats:** Keep onboarding short: preferred containers, reduced host mode, link to setup/troubleshooting. Do not expose proxy/cleanup internals unless in support docs.
- **Do not claim:** Containers are always available; host mode has full parity; Linux/Windows support; automatic repair for all container failures.
- **Demo/screenshot needs:** Current runtime status/toggle UI; unavailable-container state; link target for macOS container setup; host-mode warning state.
- **Review gate:** Runtime owner and support-doc review; test both container-available and container-unavailable paths before final in-app text.

### Onboarding Brief: Built-in workflow starters

- **Surface:** Optional onboarding checklist after basic setup; “try next” cards; demo workspace script brief.
- **Audience:** Developers and power users ready to try built-in plugins.
- **Positioning angle:** Offer a few source-supported next steps: memory, Git, web access, scheduler/reminders, and plugin discovery. Use caveats instead of promising every workflow works out of the box.
- **Verified proof points:**
  - `Memory & Context / Memory search and scratchpad tools` — verified, high confidence; supports safe memory starter.
  - `Git & Developer Workflows / Agent-assisted Git command bridge` — verified, high confidence; supports safe read-only Git starter.
  - `Git & Developer Workflows / Visual Git manager` — partially verified, high confidence; supports opening Git app after UI screenshot review.
  - `Web & Research / Web search` — partially verified, high confidence; supports web starter only with provider credential caveat.
  - `Automations & Background Jobs / Recurring agent scheduler` — verified, high confidence; supports scheduler starter.
  - `Automations & Background Jobs / Reminders` — partially verified, high confidence; supports reminder starter with notification caveat.
  - `Core Workspace / App store and favorites` — partially verified, high confidence; supports plugin discovery/favorites starter after UI verification.
- **Source citations:** `docs/features/memory.md`; `plugins/sero-git-plugin/extension/index.ts`; `plugins/sero-web-plugin/extension/tools-search.ts`; `plugins/sero-cron-plugin/extension/tools.ts`; `apps/desktop/src/components/layout/AppStoreDialog.tsx`; `docs/plugins/guide.md`; `pilot-doc-briefs.md` briefs for Memory, Git, Web, Cron, and Plugin ecosystem.
- **Caveats:** Prefer read-only or disposable examples. Web requires configured providers/accounts. Git actions can mutate repositories. Reminders depend on notification/runtime behavior. App Store install semantics need UI verification.
- **Do not claim:** External/local integrations are installed; Google/Spotify/Starling/Research/Kanban are built in; web credentials are bundled; Git mutations are safe by default; notification delivery is guaranteed.
- **Demo/screenshot needs:** One safe card per verified workflow; disposable repo for Git; provider-ready test account for Web; disposable reminder; App Store/favorite example after verification.
- **Review gate:** Product selection of which starters ship in onboarding; runtime verification for each card; legal/security review for any third-party/provider wording.

---

## Release-Note Briefs

### Release-Note Brief: Desktop shell and onboarding documentation milestone

- **Surface:** Future changelog/release-note input, not final release text.
- **Audience:** Existing alpha users, contributors, and new evaluators reading a release announcement.
- **Positioning angle:** If tied to an actual release/milestone, describe user-visible maturation of the desktop shell, first-run flow, and global chat/session model.
- **Verified proof points:**
  - `Core Workspace / Persistent desktop shell` — verified, high confidence.
  - `Core Workspace / First-run profile setup and onboarding` — verified, high confidence.
  - `Agent & Chat / Global chat panel` — verified, high confidence.
  - `Agent & Chat / Session-based agent lifecycle` — verified, high confidence.
  - `Data Persistence & Sync / File-backed layout state` — verified, high confidence.
- **Source citations:** `README.md`; `apps/desktop/src/App.tsx`; `apps/desktop/src/stores/profiles.ts`; `apps/desktop/src/stores/agent.ts`; `apps/desktop/src/stores/sessions.ts`; `apps/desktop/src/lib/persist-layout.ts`; `verification-log.md` FI-005 core claim reviews.
- **Caveats:** Release notes must be tied to actual product changes/version boundaries. If these are not new in the target release, frame only as documentation/onboarding improvements, not newly shipped functionality.
- **Do not claim:** A new public binary; broad platform expansion; stable API milestone; unverified prompt attachment/slash-command details.
- **Demo/screenshot needs:** Current screenshots from the release build; before/after only if a real product/docs change exists.
- **Review gate:** Release owner confirms version/milestone and whether this is a product change, docs change, or existing-feature highlight.

### Release-Note Brief: Memory documentation or feature-highlight candidate

- **Surface:** Future release-note/changelog input after Memory guide or UI/runtime verification.
- **Audience:** Existing users and power users using agent memory/context.
- **Positioning angle:** Highlight the documented memory workflow and selective context model if it is part of an actual release or documentation milestone.
- **Verified proof points:**
  - `Memory & Context / Persistent memory files` — verified, high confidence.
  - `Memory & Context / Automatic memory context injection` — verified, high confidence.
  - `Memory & Context / Memory search and scratchpad tools` — verified, high confidence.
  - `Memory & Context / Memory consolidation and transcript recall` — partially verified, medium confidence; use only as caveated advanced/background note if runtime-verified.
- **Source citations:** `docs/features/memory.md`; `plugins/sero-memory-plugin/package.json`; `plugins/sero-memory-plugin/extension/index.ts`; `verification-log.md` Memory claim review; `pilot-doc-briefs.md` Memory brief.
- **Caveats:** Keep limitations visible: selective/non-exhaustive context, QMD-dependent retrieval, no perfect recall. Do not use private user data in examples.
- **Do not claim:** Perfect recall; all prior sessions always searchable; generated summaries guaranteed; memory improves every answer automatically.
- **Demo/screenshot needs:** Synthetic memory demo from release build; command output reviewed for current wording; optional screenshot of memory UI/context indicator if available.
- **Review gate:** Feature owner validates current Memory behavior; release owner confirms whether the note announces feature changes or newly published docs.

### Release-Note Brief: Built-in workflow plugins candidate bundle

- **Surface:** Future release-note input for Git, Web, and Automations only after release/version decision.
- **Audience:** Existing alpha users, developers, and power users.
- **Positioning angle:** Summarize built-in workflow surfaces as separate, caveated notes rather than a single overbroad productivity claim.
- **Verified proof points:**
  - `Git & Developer Workflows / Agent-assisted Git command bridge` — verified, high confidence.
  - `Git & Developer Workflows / Visual Git manager` — partially verified, high confidence.
  - `Data Persistence & Sync / Git state file sync` — verified, high confidence.
  - `Web & Research / Web search` — partially verified, high confidence.
  - `Web & Research / Web content fetching and extraction` — partially verified, high confidence.
  - `Data Persistence & Sync / Web search state sync` — verified, high confidence.
  - `Automations & Background Jobs / Recurring agent scheduler` — verified, high confidence.
  - `Automations & Background Jobs / Reminders` — partially verified, high confidence.
- **Source citations:** `plugins/sero-git-plugin/extension/index.ts`; `plugins/sero-git-plugin/ui/GitApp.tsx`; `plugins/sero-git-plugin/extension/state-io.ts`; `plugins/sero-web-plugin/extension/index.ts`; `plugins/sero-web-plugin/extension/tools-search.ts`; `plugins/sero-web-plugin/extension/tools-fetch.ts`; `plugins/sero-web-plugin/extension/state-sync.ts`; `plugins/sero-cron-plugin/package.json`; `plugins/sero-cron-plugin/extension/tools.ts`; `verification-log.md` Git/Web/Cron claim reviews.
- **Caveats:** Treat each item independently. Git mutates real repositories. Web depends on configured providers/accounts and third-party services. Reminders depend on notifications/runtime behavior. Visual UI claims require screenshots/runtime tests.
- **Do not claim:** Every Git action is visually polished; web provider credentials are bundled; all extraction paths are reliable; notification delivery or missed-run recovery is guaranteed; external/local Research/Kanban/Google/Spotify plugins are part of the release.
- **Demo/screenshot needs:** Disposable Git repo demo; provider-configured web search/fetch demo; disposable scheduler/reminder demo with notification state; release-build screenshots only.
- **Review gate:** Release owner maps each item to an actual version/milestone; runtime evidence attached for any partially verified claim before final notes.

### Release-Note Brief: Plugin ecosystem and app-runtime docs candidate

- **Surface:** Future release-note/changelog input for plugin-author docs, app-runtime improvements, or ecosystem milestone.
- **Audience:** Plugin authors, developers, contributors, advanced alpha users.
- **Positioning angle:** If appropriate for a release, emphasize documented plugin-building paths and app-runtime capabilities while preserving alpha API caveats.
- **Verified proof points:**
  - `Plugin Ecosystem / Federated app runtime hooks` — verified, high confidence.
  - `Data Persistence & Sync / Plugin/app state files` — partially verified, high confidence.
  - `Remote Access / Remote plugin entry loading` — partially verified, high confidence.
  - `Core Workspace / App store and favorites` — partially verified, high confidence.
  - `Terminal & Containers / App runtime command execution` — partially verified, high confidence.
- **Source citations:** `docs/plugins/guide.md`; `docs/plugins/quickstart.md`; `packages/app-runtime/README.md`; `packages/app-runtime/src/context.ts`; `packages/app-runtime/src/use-app-state.ts`; `packages/app-runtime/src/use-agent-prompt.ts`; `packages/app-runtime/src/use-ai.ts`; `packages/app-runtime/src/use-theme.ts`; `packages/app-runtime/src/use-widget-registration.ts`; `apps/desktop/src/lib/federation-registry.ts`; `verification-log.md` Plugin ecosystem claim review.
- **Caveats:** Alpha plugin/runtime contracts may evolve. Installed external plugins are separate from Sero and must be trusted by the user. App Store install/update/uninstall semantics need UI verification before end-user release notes.
- **Do not claim:** Stable public marketplace; stable plugin API; automatic plugin vetting; bundled external/local integrations; host-mode parity for all runtime commands.
- **Demo/screenshot needs:** Minimal plugin app from release build; docs-site page or guide link; App Store/favorites screenshot only if UI semantics are verified.
- **Review gate:** Developer experience owner approves API wording; product decides whether external/local examples can be mentioned and under what support label.

### Release-Note Brief: Optional web remote access candidate

- **Surface:** Future release-note or support-doc announcement input only after security/runtime validation.
- **Audience:** Power users and support/admin readers who intentionally enable remote access.
- **Positioning angle:** Describe an optional authenticated browser client for remote workspace/session access when the gateway is enabled, not an always-on hosted service.
- **Verified proof points:**
  - `Remote Access / Web remote client` — partially verified, high confidence; supports authenticated browser client scope at a conservative level.
  - `Remote Access / Gateway and WebSocket bridge` — partially verified, high confidence; supports optional gateway/token-gated bridge wording.
  - `Security / Permissions / Strict renderer isolation` — verified, high confidence; support/security proof point only, not a guarantee.
- **Source citations:** `apps/web-remote/src/App.tsx`; `apps/web-remote/src/components/Layout.tsx`; `apps/web-remote/src/components/ChatPanel.tsx`; `apps/web-remote/src/components/WorkspacePicker.tsx`; `apps/web-remote/src/components/FileBrowser.tsx`; `apps/web-remote/src/lib/gateway-client.ts`; `apps/desktop/electron/features/gateway/server/protocol.ts`; `apps/desktop/electron/features/gateway/security/auth.ts`; `apps/desktop/electron/main.ts`; `docs/security/gateway.md`; `verification-log.md` Web remote claim review.
- **Caveats:** Gateway starts only when enabled; access is token-gated; runtime paired-device/browser flow is not yet verified in this program; security guidance is required before broad promotion.
- **Do not claim:** Always-on remote access; public hosted relay; mobile-polished experience; credential-free access; turnkey HTTPS/Tailscale setup; full desktop parity in the browser client.
- **Demo/screenshot needs:** Runtime-tested paired browser session; token lifecycle screenshots or docs; file/session/artifact view with synthetic workspace; security warning/link placement.
- **Review gate:** Security/support review and runtime pairing test are mandatory before release-note drafting.

---

## External/Local Integration Copy Boundary

External/local integrations may be useful later as ecosystem examples, but they are not safe as bundled-feature website, onboarding, or release-note claims without product support decisions.

- **Referenced inventory rows:**
  - `Integrations / Google Workspace external plugin` — external/local, partially verified, medium confidence.
  - `Integrations / Spotify external plugin` — external/local, partially verified, medium confidence.
  - `Integrations / Starling Bank external dashboard` — external/local, partially verified, medium confidence.
  - `Git & Developer Workflows / Kanban external development board` — external/local, partially verified, medium confidence.
  - `Git & Developer Workflows / Plan Mode external plugin` — external/local, partially verified, medium confidence.
  - `Web & Research / Research external orchestrator` — external/local, partially verified, medium confidence.
  - `Productivity / Todo external app`, `Productivity / Notes external app`, `Creative Tools / Image generation external app`, and `Creative Tools / Humanizer external writing assistant` — external/local and still `needs verification` in inventory.
- **Source citations:** External/local README/package/source paths listed in `verified-inventory.md`; `docs/plugins/guide.md`; `verification-log.md` external/local claim reviews.
- **Allowed brief use:** Plugin examples catalog, ecosystem breadth examples, or integration-doc candidates labeled as separately installed external/local plugins with prerequisites.
- **Do not claim:** Sero bundles these integrations; Sero provides credentials/auth; these are officially supported; provider partnerships exist; financial/media/health/security outcomes are guaranteed.
- **Demo/screenshot needs:** Product-approved support label, install prerequisites, runtime smoke tests, safe test accounts/data, and per-provider security/privacy review.
- **Review gate:** Product owner must approve any public mention; legal/security/support review required for banking, media playback, Google OAuth, health/personal tracking, or credential-heavy examples.
