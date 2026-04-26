# Docs launch readiness summary

## Publishable now

- Core docs-site pages are in place and navigation is wired:
  - `apps/docs-site/docs/index.md`
  - `apps/docs-site/docs/guide/overview.md`
  - `apps/docs-site/docs/guide/getting-started.md`
  - plus the new guide batch in the sidebar via `apps/docs-site/rspress.config.ts`
- The completed, publishable docs batch is:
  - Workspace and Chat
  - Explorer Workspace
  - Memory
  - Web Access
  - Web Remote, as an optional/security-sensitive alpha overview
  - Scheduler and Reminders
  - Git Manager
  - Plugins and Apps
  - App Store, Favorites, and Installed Plugins
  - Plugin Author Quick Path, as conservative alpha authoring guidance
  - State and Folders
  - Security / Privacy
  - Containers and Host Mode
- Caveats to keep visible on those pages:
  - docs are conservative/source-only, not full runtime tutorials
  - screenshots are intentionally deferred
  - current alpha scope remains macOS Apple Silicon only
  - host mode is a reduced fallback, not parity with containers

## Validation status from this session

- `pnpm --filter @sero/docs-site typecheck` passed
- serial `pnpm typecheck` passed
- no app/source/docs-site files were modified in this pass

## Remaining gated items

Blocked until product/support/security review or missing runtime input:

- Website/README positioning for partially verified built-in pillars
- Admin app operational guide
- External/local plugin catalog and support labels
- Detailed Web provider setup matrix
- Final release-note candidates tied to real versions/milestones
- Admin/public support wording for sensitive local profile inspection
- Optional Web Remote deployment/pairing polish beyond the conservative overview
- Plugin/app-runtime API stability wording beyond the conservative quick path

## Deferred screenshot/demo pass

Keep these for one later synthetic-data capture pass:

- desktop shell overview
- Memory workflow screenshot
- Web Access screenshot with safe synthetic sources
- Scheduler reminders screenshot
- Scheduler dashboard widget screenshot, if available
- App Store / favorites screenshot

## Runtime-test backlog before turning overviews into tutorials

- Memory: QMD available/unavailable behavior, memory-context visibility, scratchpad examples
- Web Access: provider setup/failure paths and fetch examples across HTML/PDF/GitHub/video
- Scheduler: notification permissions, reminder delivery, cron `run`, missed-run recovery, disabled/completed behavior
- Plugins and Apps: install/uninstall/update semantics, favorites persistence, unsupported-plugin behavior, widget placement
- Workspace and Chat: onboarding/profile flow, session resume UI, command menu catalog, prompt controls

## Launch note

The docs batch is ready to publish as a conservative alpha docs set. It should be presented as source-backed guidance for the current macOS Apple Silicon OSS alpha, with screenshots and tutorial-style runtime claims intentionally deferred.
