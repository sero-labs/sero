# Docs branch handoff

## Overview of what changed
- The docs-site launch batch is now complete and navigable, with the new guide set wired into the sidebar and supported by planning artifacts.
- The docs effort stayed conservative/source-backed: overview pages, reference pages, and launch readiness notes were added, while screenshots and runtime tutorial claims were intentionally deferred.
- No `apps/docs-site` source files were modified in this handoff task.

## Docs pages added/updated
- Added/updated docs-site pages in the launch batch:
  - `apps/docs-site/docs/index.md`
  - `apps/docs-site/docs/guide/overview.md`
  - `apps/docs-site/docs/guide/getting-started.md`
  - `apps/docs-site/docs/guide/workspace-and-chat.md`
  - `apps/docs-site/docs/guide/explorer-workspace.md`
  - `apps/docs-site/docs/guide/memory.md`
  - `apps/docs-site/docs/guide/web-access.md`
  - `apps/docs-site/docs/guide/web-remote.md`
  - `apps/docs-site/docs/guide/scheduler-reminders.md`
  - `apps/docs-site/docs/guide/git-manager.md`
  - `apps/docs-site/docs/guide/plugins-and-apps.md`
  - `apps/docs-site/docs/guide/app-store-favorites.md`
  - `apps/docs-site/docs/reference/state-and-folders.md`
  - `apps/docs-site/docs/reference/security-privacy.md`
  - `apps/docs-site/docs/reference/containers-host-mode.md`
  - `apps/docs-site/docs/reference/plugin-author-quick-path.md`
- Navigation updated in `apps/docs-site/rspress.config.ts`:
  - guide sidebar now includes the new launch pages
  - home/overview discovery links already point at the primary guides

## Planning / scout artifacts added
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-readiness-summary.md`
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md`
- Related planning/scout files referenced by the checklist:
  - `verified-inventory.md`
  - `final-review.md`
  - `screenshot-demo-pass-plan.md`
  - `runtime-tutorial-test-plan.md`
  - `admin-operational-doc-scout.md`
  - `external-plugin-catalog-doc-scout.md`
  - `web-provider-matrix-doc-scout.md`
  - `release-note-candidates.md`

## Validation commands / results known
- `pnpm --filter @sero/docs-site typecheck` — passed
- `pnpm typecheck` — passed
- No app/source/docs-site files were changed in this task
- `git log --oneline --max-count=60` shows the docs-launch work layered on top of the earlier public-launch / OSS-alpha prep history

## Reviewer / subagent coverage summary
- Reviewer subagents covered the main launch pages and docs-site cohesion:
  - Memory
  - Workspace and Chat
  - Scheduler
  - Plugins and Apps
  - docs-site navigation/cohesion
- Web Access was manually validated after its reviewer exited without output
- Coverage is explicitly still source-backed and conservative; screenshot and tutorial conversion remain deferred

## Remaining gated work
- Product/copy approval for website/README positioning of verified built-in pillars
- Support/security owner review for Admin, external/local plugin catalog, detailed Web provider matrix, and release-note candidates
- Runtime checks before converting overviews into step-by-step tutorials
- Deferred screenshot/demo capture pass using synthetic/non-sensitive data
- Final link/screenshot review before public launch

## Recommended PR description bullets
- Add the docs-site launch batch for the core built-in product areas
- Wire the new guide set into docs-site navigation and discovery
- Publish conservative alpha guidance for workspace/chat, memory, web access, web remote, scheduler, git manager, plugins/apps, state/folders, security/privacy, containers/host mode, and plugin author quick path
- Record readiness, validation, and remaining gated follow-up work for launch review

## Recommended test plan
- Run `pnpm --filter @sero/docs-site typecheck`
- Run `pnpm typecheck` from the monorepo root
- Manually spot-check docs-site navigation, home page links, and sidebar discovery for the new guides
- Reconfirm the deferred screenshot/demo and runtime-test backlogs before expanding any overview into a tutorial

## Caution
- Do not run parallel Rspress builds against the same `dist` output directory; keep builds serial to avoid collisions and stale artifacts.
