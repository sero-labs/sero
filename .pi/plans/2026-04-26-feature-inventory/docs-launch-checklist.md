# Docs Launch Checklist

**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Inventory:** `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`  
**Final review:** `.pi/plans/2026-04-26-feature-inventory/final-review.md`

This checklist tracks publication readiness for the docs-site feature guides created from the feature-inventory program. It is not final marketing copy and does not replace product/security review.

## Pages added

- [x] `apps/docs-site/docs/guide/workspace-and-chat.md`
- [x] `apps/docs-site/docs/guide/memory.md`
- [x] `apps/docs-site/docs/guide/web-access.md`
- [x] `apps/docs-site/docs/guide/scheduler-reminders.md`
- [x] `apps/docs-site/docs/guide/plugins-and-apps.md`

## Navigation and discovery

- [x] Guide sidebar includes all new pages.
- [x] Home page links to Workspace and Chat, Memory, Web Access, Scheduler and Reminders, and Plugins and Apps.
- [x] Getting Started includes a `Learn the workspace` section.
- [x] Overview includes a `Core guides` section.

## Validation completed

- [x] Docs-site build/typecheck passed after each guide.
- [x] Full monorepo `pnpm typecheck` passed after the pilot guide set.
- [x] Reviewer subagents checked Memory, Workspace and Chat, Scheduler, Plugins and Apps, and docs-site cohesion.
- [x] Web Access was manually validated after its reviewer exited without output.

## Screenshot/demo needs before broader polish

- [ ] Fresh desktop shell overview screenshot showing sidebar, active app, chat panel, and status bar.
- [ ] Memory workflow screenshot using synthetic data, ideally including visible memory-context block if available.
- [ ] Web app screenshot showing History and Bookmarks with synthetic/non-sensitive sources.
- [ ] Scheduler app screenshot showing Jobs, Reminders, and notification settings with synthetic entries.
- [ ] Scheduler dashboard widget screenshot if available.
- [ ] App Store / plugin favorites screenshot showing built-in vs discovered/favorited apps.

## Outstanding feature guides

Screenshot capture is intentionally deferred to a later single screenshot pass. The list below tracks remaining writing/runtime/product-review work only.

### Already drafted in docs-site

- [x] Workspace and Chat overview — `apps/docs-site/docs/guide/workspace-and-chat.md`
- [x] Memory user guide — `apps/docs-site/docs/guide/memory.md`
- [x] Web Access overview — `apps/docs-site/docs/guide/web-access.md`
- [x] Scheduler and Reminders overview — `apps/docs-site/docs/guide/scheduler-reminders.md`
- [x] Plugins and Apps overview — `apps/docs-site/docs/guide/plugins-and-apps.md`
- [x] Git Manager guide — `apps/docs-site/docs/guide/git-manager.md`

### P0 / next high-value feature guides

- [ ] Plugin author quick path / app-runtime API guide — expand beyond the current Plugins and Apps overview with a minimal UI + extension + state example, supported hooks, widget registration, file-backed state, and alpha API caveats. Blocked by owner approval of public app-runtime stability wording and host capability boundaries.

### P1 / important follow-up guides

- [ ] Optional Web Remote guide — document optional `SERO_GATEWAY=1`, token-gated access, workspace/session/chat/file/artifact scope, and local-network/security caveats. Blocked by runtime pairing test and security/deployment guidance.
- [ ] Explorer workspace basics and dev-server surfaces — map Explorer file/editor/browser/diff/terminal surfaces, file-tree refresh, multi-root/mounts, and DevServerPanel controls conservatively. Blocked by runtime review of Explorer and dev-server workflows.
- [ ] Containers and host-mode runtime guide — explain preferred Apple-container mode, reduced host-mode fallback, setup/preflight, proxy/cleanup support behavior, and troubleshooting. Blocked by review of existing macOS container docs plus runtime tests with/without containers.
- [ ] App Store, favorites, and installed plugins user guide — split user-facing plugin management from author docs, covering built-in vs installed plugins, trust caveats, favorites/sidebar behavior, install/uninstall, compatibility, and state retention. Blocked by App Store/favorites runtime inspection.
- [ ] State, folders, profiles, and storage map updates — update/link the canonical storage map for profile roots, layout, workspaces, app state, memory, auth, gateway files, and sensitive local data. Blocked only by confirming any newly documented plugin-specific paths and stale path wording.
- [ ] Security, permissions, and sensitive-action prompts reference — cover renderer safeguards, dangerous `bash` approval prompts, user-feedback prompts, Admin/MCP boundaries, and realistic security limits. Blocked by review of `SECURITY.md`, `docs/security/**`, prompt runtime behavior, and security owner wording.
- [ ] Website/README feature pillars brief/update — turn verified built-in pillars into public positioning while preserving source-only/macOS alpha caveats. Blocked by product/copy approval and decisions on partially verified features.

### P2 / defer until product/support decisions

- [ ] Admin app operational guide — describe config/log/session/support surfaces only after Admin UI inspection and security/support review.
- [ ] External/local plugin examples catalog — catalog Google, Spotify, Starling, Kanban, Plan Mode, Research, Todo, Notes, ImageGen, Humanizer, and other examples only after product decides support labels and runtime smoke-test expectations.
- [ ] Detailed Web provider setup matrix — document Exa, Perplexity, Gemini API, Gemini Web, credentials, sign-in, failure modes, and extraction limits only after provider/runtime testing.
- [ ] Release-note candidates — create final changelog/release notes only after release owner maps each note to a real version/milestone and confirms whether each item is a product change or docs-only highlight.

## Runtime checks still recommended

- [ ] Memory: QMD unavailable vs available behavior, memory-context visibility, and scratchpad examples.
- [ ] Web Access: representative Exa/Perplexity/Gemini provider setup/failure paths and fetch examples for HTML/PDF/GitHub/video.
- [ ] Scheduler: notification permission behavior, reminder delivery, cron `run`, opt-in missed-run recovery, and disabled/completed item behavior.
- [ ] Plugins and Apps: App Store install/uninstall/update semantics, favorites persistence, unsupported-plugin behavior, and dashboard widget placement.
- [ ] Workspace and Chat: onboarding/profile screenshots, session create/resume UI, command menu catalog, and prompt controls if future docs mention them.

## Product/security decisions still blocked

- [ ] Which external/local plugins may be mentioned publicly and under what support label.
- [ ] Public Web provider matrix and credential setup language.
- [ ] Optional Web Remote security/deployment guidance.
- [ ] Plugin/app-runtime API stability wording for public author docs.
- [ ] Release-note scope: product changes vs docs-only highlights.
- [ ] Homepage/README positioning approval for partially verified built-in capabilities.

## Safe to publish now, with existing caveats

- Workspace and Chat overview guide.
- Memory user guide.
- Web Access guide as a conservative feature overview, not provider setup reference.
- Scheduler and Reminders guide as a conservative feature overview, not a reliability guarantee.
- Plugins and Apps guide as an alpha overview, not a stable marketplace/API promise.

## Do not publish as final claims yet

- External/local integration pages.
- Detailed provider setup matrix.
- Web Remote usage/deployment guide.
- Polished Git Manager step-by-step UI how-to claims without disposable-repo runtime verification.
- Admin operations guide without support/security owner review.
- Security/permission prompt reference without runtime prompt review.
- Release notes not tied to a real version/milestone.

## Next recommended actions

1. Pick the next feature guide from the outstanding list; recommended order is State/Folders or Security depending on release risk.
2. Runtime-test Web Access and Scheduler examples before turning them into step-by-step tutorials.
3. Keep screenshots deferred to the single screenshot/demo pass.
4. Run one final docs-site link/screenshot review before public launch.
