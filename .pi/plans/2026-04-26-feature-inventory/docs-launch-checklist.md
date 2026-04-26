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
- [x] State and Folders reference — `apps/docs-site/docs/reference/state-and-folders.md`
- [x] Security, Privacy, and Permissions reference — `apps/docs-site/docs/reference/security-privacy.md`
- [x] Containers and Host Mode reference — `apps/docs-site/docs/reference/containers-host-mode.md`
- [x] Explorer Workspace guide — `apps/docs-site/docs/guide/explorer-workspace.md`
- [x] Web Remote guide — `apps/docs-site/docs/guide/web-remote.md`
- [x] App Store, Favorites, and Installed Plugins guide — `apps/docs-site/docs/guide/app-store-favorites.md`
- [x] Plugin Author Quick Path reference — `apps/docs-site/docs/reference/plugin-author-quick-path.md`

### P0 / next high-value feature guides

_All current P0 feature-guide candidates from the launch checklist have a conservative docs-site draft._

### P1 / important follow-up guides

- [ ] Website/README feature pillars brief/update — turn verified built-in pillars into public positioning while preserving source-only/macOS alpha caveats. Blocked by product/copy approval and decisions on partially verified features.

### P2 / defer until product/support decisions

- [ ] Admin app operational guide — scout complete in `admin-operational-doc-scout.md`; public guide still blocked on security/support owner review.
- [ ] External/local plugin examples catalog — scout complete in `external-plugin-catalog-doc-scout.md`; public catalog still blocked on support labels and runtime smoke tests.
- [ ] Detailed Web provider setup matrix — scout complete in `web-provider-matrix-doc-scout.md`; public matrix still blocked on provider/runtime testing and support wording.
- [ ] Release-note candidates — candidate notes complete in `release-note-candidates.md`; final changelog/release notes still blocked on release owner mapping to a real version/milestone.

## Runtime checks still recommended

- [ ] Memory: QMD unavailable vs available behavior, memory-context visibility, and scratchpad examples.
- [ ] Web Access: representative Exa/Perplexity/Gemini provider setup/failure paths and fetch examples for HTML/PDF/GitHub/video.
- [ ] Scheduler: notification permission behavior, reminder delivery, cron `run`, opt-in missed-run recovery, and disabled/completed item behavior.
- [ ] Plugins and Apps: App Store install/uninstall/update semantics, favorites persistence, unsupported-plugin behavior, and dashboard widget placement.
- [ ] Workspace and Chat: onboarding/profile screenshots, session create/resume UI, command menu catalog, and prompt controls if future docs mention them.

## Product/security decisions still blocked

- [ ] Which external/local plugins may be mentioned publicly and under what support label.
- [ ] Public Web provider matrix and credential setup language.
- [ ] Optional Web Remote runtime pairing/deployment polish beyond conservative guide.
- [ ] Plugin/app-runtime API stability wording for public author docs beyond the conservative quick path.
- [ ] Release-note scope: product changes vs docs-only highlights.
- [ ] Homepage/README positioning approval for partially verified built-in capabilities.

## Safe to publish now, with existing caveats

- Workspace and Chat overview guide.
- Explorer Workspace guide as a conservative surface map, not a full IDE/dev-server parity promise.
- Memory user guide.
- Web Access guide as a conservative feature overview, not provider setup reference.
- Web Remote guide as a conservative optional alpha overview, not deployment hardening guidance.
- Scheduler and Reminders guide as a conservative feature overview, not a reliability guarantee.
- Git Manager guide as a conservative overview, not a step-by-step verified disposable-repo tutorial.
- Plugins and Apps guide as an alpha overview, not a stable marketplace/API promise.
- App Store, Favorites, and Installed Plugins guide as a user-management overview, not a stable marketplace or reviewed-plugin claim.
- Plugin Author Quick Path reference as a conservative alpha authoring guide, not a frozen app-runtime/API stability guarantee.
- State and Folders reference as the canonical profile/path map for the docs site.
- Security / Privacy reference as practical alpha security guidance, not a hardening guarantee.
- Containers and Host Mode reference as support-scope guidance, not host/container parity or security-boundary claims.

## Do not publish as final claims yet

- External/local integration pages.
- Detailed provider setup matrix.
- Polished Web Remote deployment guide beyond the conservative alpha overview.
- Polished Git Manager step-by-step UI how-to claims without disposable-repo runtime verification.
- Admin operations guide without support/security owner review.
- Polished security/permission prompt UI how-to claims without runtime prompt review.
- Release notes not tied to a real version/milestone.

## Next recommended actions

1. Get product/copy approval for Website/README positioning, or leave that work deferred.
2. Get support/security owner review before publishing Admin, external plugin catalog, detailed Web provider matrix, or release-note pages from the scout artifacts.
3. Runtime-test Web Access and Scheduler examples before turning them into step-by-step tutorials.
4. Keep screenshots deferred to the single screenshot/demo pass.
5. Run one final docs-site link/screenshot review before public launch.
