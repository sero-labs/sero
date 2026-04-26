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
- Git Manager how-to guide without disposable-repo runtime verification.
- Admin operations guide without support/security owner review.
- Security/permission prompt reference without runtime prompt review.
- Release notes not tied to a real version/milestone.

## Next recommended actions

1. Capture fresh screenshots with synthetic data for the five new guides.
2. Runtime-test Web Access and Scheduler examples before turning them into step-by-step tutorials.
3. Decide whether the next guide should be Git Manager, Security/Privacy, or Web Remote based on release priorities.
4. Run one final docs-site link/screenshot review before public launch.
