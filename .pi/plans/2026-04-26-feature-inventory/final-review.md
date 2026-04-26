# Feature Inventory Final Review

**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Inventory:** `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`  
**Verification log:** `.pi/plans/2026-04-26-feature-inventory/verification-log.md`  
**Backlog:** `.pi/plans/2026-04-26-feature-inventory/docs-backlog.md`  
**IA:** `.pi/plans/2026-04-26-feature-inventory/information-architecture.md`  
**Pilot briefs:** `.pi/plans/2026-04-26-feature-inventory/pilot-doc-briefs.md`  
**Copy briefs:** `.pi/plans/2026-04-26-feature-inventory/copy-briefs.md`

This is a review artifact only. It does not draft finished docs, website copy, onboarding copy, or release notes.

## Gate 1: Inventory Verification

### Checklist

- [x] All high-impact scout items are represented in `verified-inventory.md`.
- [x] Unclear, risky, external/local, provider-dependent, security-sensitive, and partially verified features are logged in `verification-log.md`.
- [x] Built-in/core, built-in/plugin, and external/local status is explicit in inventory rows.
- [x] No high-impact feature remains uncategorized.
- [x] No high-impact inventory row lacks a source path.

### Result

**Pass with caveats.**

### Notes

- Inventory contains 84 normalized rows, including core shell, agent/chat, files/projects, containers, persistence, security, remote access, plugin ecosystem, built-in plugins, provider/plugin integrations, and external/local plugins.
- Automated row check found **0 high-impact rows without source paths**.
- Nine rows remain `needs verification`; all are external/local or example/novelty/plugin-catalog candidates rather than immediate built-in docs pillars:
  - `Productivity / Todo external app`
  - `Productivity / Notes external app`
  - `Creative Tools / Image generation external app`
  - `Creative Tools / Humanizer external writing assistant`
  - `Productivity / Calculator external app`
  - `Productivity / Daily quote external app`
  - `Plugin Ecosystem / SlopZilla external idea generator`
  - `Games / Tetris external app`
  - `Health & Personal Tracking / Weight Tracker external app`
- Several high-impact built-in features are intentionally `partially verified` because source review confirms existence but runtime/UI/provider behavior is not proven. These are safe for planning briefs with caveats, not finished how-to docs or homepage claims.
- External/local plugins are explicitly labeled `external/local`; none should be described as bundled product features without a product decision.

## Gate 2: Backlog Prioritization

### Checklist

- [x] `docs-backlog.md` groups work by audience and output type.
- [x] Each backlog item references verified inventory rows.
- [x] High-priority items include rationale, confidence basis, existing-docs check, blockers, and future acceptance criteria.
- [x] Duplicate or already-covered docs are identified as update/split/link work instead of unconditional new pages.
- [x] Low-confidence/external/local topics are deferred to examples/later surfaces unless product approval changes their status.

### Result

**Pass with caveats.**

### Notes

- P0 backlog items cover the intended high-value docs areas: Memory, Core workspace/global chat, Web access, Cron/reminders, Git Manager, and Plugin author/app-runtime docs.
- P1/P2 backlog items correctly hold higher-risk surfaces: optional web remote access, Explorer/dev-server specifics, containers/host-mode, App Store/favorites semantics, external/local examples, security/admin docs, and release-note candidates.
- Existing docs checks are present and call out likely split/link/update paths for `docs/features/memory.md`, `docs/plugins/guide.md`, `docs/guides/version-control-user-flow.md`, `docs/reference/state-and-folders.md`, `docs/security/**`, and docs-site pages.
- Backlog blockers are explicit and mostly runtime/product-review oriented; they should be treated as prerequisites before drafting polished docs.

## Gate 3: Information Architecture

### Checklist

- [x] `information-architecture.md` distinguishes canonical docs from website, onboarding, and release-note surfaces.
- [x] IA supports general users, power users/developers, admins/support, and plugin authors.
- [x] Existing docs locations are referenced as keep/update/split/link candidates.
- [x] Alpha/support constraints remain visible in the IA.
- [x] External/local plugins are kept out of bundled-feature hierarchy.

### Result

**Pass.**

### Notes

- IA proposes distinct tracks: Use Sero, Build with Sero, Develop in Sero, Administer/Troubleshoot Sero, and Public Website/Onboarding Inputs.
- IA maps backlog items to canonical destinations and public/onboarding/release surfaces without moving files or drafting final docs.
- It accounts for current docs-site migration boundaries by distinguishing `apps/docs-site/docs/**` curated docs from root `docs/**` source/deep-reference material.
- Alpha caveats are repeated in the IA and should continue to gate public docs and copy.

## Gate 4: Pilot Brief Readiness

### Checklist

- [x] `pilot-doc-briefs.md` covers 3-5 pilot topics.
- [x] All five recommended pilots are covered: Memory, Git Manager, Web access, Cron/reminders, and Plugin ecosystem/app runtime.
- [x] Each pilot brief includes audience, goal, inventory rows, source citations, outline, screenshot/demo needs, caveats, and future acceptance criteria.
- [x] Partially verified capabilities are caveated instead of promoted as final docs claims.
- [x] `copy-briefs.md` is clearly marked as brief-level input, not final copy.

### Result

**Pass with caveats.**

### Notes

- Pilot briefs are ready for docs planning and product/docs review, not direct publication.
- The brief set correctly preserves caveats around memory recall/QMD, Git UI coverage and repo mutation, web provider/extraction reliability, notification/missed-run behavior, App Store semantics, and alpha plugin APIs.
- Screenshot/demo needs are explicit and should be completed with synthetic/disposable data before polished docs are drafted.

## Traceability Summary

| Surface | Traceability result | Notes |
|---|---|---|
| Verified inventory | Pass | Every high-impact row checked by script has at least one source path. Status/confidence/source fields are populated consistently enough for planning use. |
| Verification log | Pass | Core and plugin uncertainty is recorded by claim, including public-copy decisions and follow-ups. External/local and provider-dependent claims are explicitly caveated. |
| Docs backlog | Pass | Backlog items reference inventory rows, existing docs, confidence basis, blockers, and future acceptance criteria. |
| Information architecture | Pass | IA maps backlog items to docs-site/root docs/website/onboarding/release surfaces and references existing docs as keep/update/split/link candidates. |
| Pilot briefs | Pass | Pilot rows are tied to inventory row names and concrete source citations. Briefs avoid finished-doc language. |
| Copy briefs | Pass with caveats | Proof points cite inventory rows and source paths; global guardrails prevent final marketing copy. Product/release/security review remains required before publication. |

### Traceability Spot Checks

- Memory docs path: inventory rows cite `docs/features/memory.md` and `plugins/sero-memory-plugin/extension/index.ts`; backlog, pilot brief, onboarding brief, and release-note brief all reference the same Memory rows and preserve QMD/recall caveats.
- Git docs path: inventory rows cite `plugins/sero-git-plugin/package.json`, `plugins/sero-git-plugin/extension/index.ts`, `plugins/sero-git-plugin/ui/GitApp.tsx`, and state sync paths; backlog and pilot brief distinguish visual Git Manager from agent bridge and existing Explorer/JJ docs.
- Web access path: inventory rows cite Web plugin search/fetch/bookmark/state-sync source files; backlog, pilot brief, and copy briefs all preserve provider credential and runtime extraction caveats.
- Cron/reminders path: inventory rows cite Cron package, extension, tools, scheduler/notifier/recovery source files; backlog and pilot brief hold notification/missed-run behavior as runtime follow-up.
- Plugin ecosystem path: inventory rows cite `docs/plugins/guide.md`, `packages/app-runtime/README.md`, app-runtime hooks, and federation registry; backlog, IA, pilot, and copy briefs distinguish plugin users from plugin authors and preserve alpha/API caveats.
- External/local integrations path: inventory rows cite absolute external plugin README/package/source paths where verified; backlog and copy briefs keep them in examples/later/integration-doc surfaces with product-decision gates.

## Blocked or Product-Decision Needed

| Topic | Why blocked | Recommended owner/decision |
|---|---|---|
| External/local plugin public status | Google, Spotify, Starling, Kanban, Plan Mode, Research, Todo, Notes, ImageGen, Humanizer, and other examples are not bundled built-ins. Public mention could imply official support. | Product owner decides which, if any, appear in website/docs and under what support label. |
| External/local low-confidence examples | Todo, Notes, ImageGen, Humanizer, Calculator, Daily Quote, SlopZilla, Tetris, and Weight Tracker remain `needs verification` or lower-priority examples. | Product/docs owner either defers them or assigns runtime/source verification before examples catalog work. |
| Web provider setup matrix | Web search/fetch depends on Exa, Perplexity, Gemini API, Gemini Web/browser sign-in, credentials, provider accounts, and third-party service behavior. | Feature/docs owner defines supported provider matrix and tests representative success/failure paths. |
| Web extraction reliability | HTML/PDF/GitHub/YouTube/video/local-video paths are source-supported but not runtime-tested for doc examples. | Web feature owner supplies tested examples and limitations before how-to docs. |
| Optional web remote access | Gateway is optional (`SERO_GATEWAY=1`), token-gated, and not runtime-tested in this program; security/deployment recommendations are not finalized. | Security/support/product review token lifecycle, local-network/HTTPS/Tailscale guidance, and publishability. |
| Git Manager visual completeness | Tool action list is source-supported, but not every action is verified as a polished visual UI control. | Git feature owner/runtime tester maps visual controls vs agent/tool-only actions in a disposable repo. |
| Git mutation safety wording | Git actions can alter real repos, including branch/worktree/force-like operations. | Docs/product owner approves safety language and required warnings before publishing guides. |
| Cron notification and missed-run behavior | Source supports notification/recovery paths, but desktop permissions, delivery, and live missed-run semantics were not tested. | Cron feature owner runs disposable job/reminder tests and records exact limitations. |
| Memory recall, QMD, and consolidation behavior | Source/docs support selective memory and QMD paths, but recall quality, generated summaries, and retention/cadence behavior require runtime evidence. | Memory feature owner provides synthetic demos and confirms limitation wording. |
| App Store install/update/uninstall semantics | Sidebar/App Store/favorites are partially verified; install/uninstall/update/data-retention behavior is not fully verified. | Plugin platform owner reviews App Store UI/runtime behavior before user-facing plugin management docs. |
| Plugin/app-runtime API stability | App-runtime hooks are source-supported, but alpha API stability and host/container capability boundaries need owner approval. | Developer experience owner approves public API wording and caveats. |
| Containers and host-mode fallback details | Source and README support preferred containers/reduced host mode, but exact fallback triggers/UI messages need runtime checks. | Runtime/support owner tests container-available and unavailable paths. |
| Explorer/dev-server workflows | Explorer surfaces and DevServerPanel exist, but automatic startup, file-watch behavior, terminal/browser/diff flows, and multi-root/mount UX need runtime review. | Desktop/workspace owner validates workflows before Explorer how-to docs. |
| Security and permission prompts | Renderer safeguards and bash permission gate are source-supported, but prompt UI/fallback and admin/MCP boundary wording need careful review. | Security/support owner reviews `SECURITY.md`, `docs/security/**`, permission prompt UX, and allowed public claims. |
| Admin app operations | Admin app exists but exact tabs/editing/log/session capabilities were not runtime-inspected and are sensitive. | Admin/support owner verifies UI and approves safe support-doc scope. |
| Release-note scope | Release-note briefs list existing capabilities, but final notes must map to actual release/version changes. | Release owner decides version/milestone and whether notes are product changes or docs-only highlights. |
| Website/README positioning | Copy briefs are proof-backed but not product-approved final positioning. | Product/copy owner approves public pillars, screenshots, support caveats, and whether partially verified built-ins can appear before runtime tests. |

## Recommended Fixes / Follow-ups

1. Do not start finished docs until each target brief's blockers are closed or explicitly scoped out.
2. Use Memory and Core workspace/global chat as the safest first user-doc drafts, but still collect fresh screenshots and runtime confirmations first.
3. Treat Git, Web, Cron/reminders, Web Remote, App Store/favorites, Explorer/dev-server, Admin, and Security docs as gated by runtime/product/security review.
4. Keep external/local integrations out of homepage/onboarding/release surfaces until product approves their support status.
5. Before any release notes, require a release owner to map each note to an actual version/milestone and confirm whether it is a new product capability or a documentation milestone.
6. Preserve source-only OSS alpha, macOS Apple Silicon, build-from-source, reduced host-mode, and evolving API caveats in every public or onboarding path.

## Final Review Decision

FI-011 review is complete. The planning artifacts pass the four gates with documented caveats and blocked decisions. No source files were modified, no finished docs or marketing copy were drafted, and no high-impact inventory rows lack source paths.
