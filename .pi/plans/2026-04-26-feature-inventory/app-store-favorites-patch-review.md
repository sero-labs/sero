# Code Review

**Reviewed:** Follow-up P2 docs patch for App Store/Favorites wording in `apps/docs-site/docs/guide/app-store-favorites.md` and `apps/docs-site/docs/guide/plugins-and-apps.md`.
**Verdict:** APPROVED

## Summary
The patch resolves the prior wording issues. The docs now distinguish core shell apps (Dashboard/Explorer) from bundled plugin apps, explain that bundled plugin apps can be surfaced through the discovered/favorites path, and clarify that unstarring those apps can remove them from the sidebar without uninstalling Sero-shipped code.

## Findings

No P0/P1/P2/P3 issues found in the reviewed patch.

## Verification Notes

- `apps/docs-site/docs/guide/app-store-favorites.md` clearly separates **core shell apps**, **bundled plugin apps**, and **installed plugins**.
- `apps/docs-site/docs/guide/plugins-and-apps.md` makes the same distinction and avoids overgeneralizing all built-ins as always sidebar-present or non-favoritable.
- The favorite/sidebar wording matches the implementation: built-in Dashboard/Explorer are fixed shell apps, while discovered plugin-backed apps are controlled by `favouriteApps` and host compatibility checks.
- Bundled plugin apps are described as removable from the sidebar via favorites without being uninstalled, which matches the seeded favorites/discovered app behavior.

## Tests

Not run; docs-only review. I verified the wording against the relevant app store/favorites implementation in `apps/desktop/src/stores/app/shared.ts`, `apps/desktop/src/stores/app/discovery.ts`, and `apps/desktop/src/stores/app/state.ts`.

## What's Good

- The revised wording is precise without exposing unnecessary implementation detail.
- Alpha caveats and trust/security guidance remain appropriately conservative.
- Cross-links between the App Store guide and Plugins and Apps guide are helpful and consistent.
