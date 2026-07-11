# Phase 4 — External consumption verification

Companion note to [dashboard-widgets-plan.md](./dashboard-widgets-plan.md).
Records how packed `@sero-ai/ui` consumption was verified.

## What was verified objectively

1. **Packed dist ships the components and the catalogue.** `npm pack --dry-run`
   on `@sero-ai/ui` includes `dist/index.js`, every
   `dist/components/dashboard/*.js`, `dist/dashboard-catalog.js` (+ `.d.ts`),
   `dist/components/dashboard/catalog.js`, and both `dist/styles/plugin.css` and
   `dist/styles/globals.css`.

2. **A real bundler resolves the packed dist.** esbuild bundles
   `dist/components/dashboard/index.js` and `dist/dashboard-catalog.js` cleanly
   (react/lucide external). This confirms the package's extensionless ESM emit —
   the same format used by every component in the package — is bundler-consumable
   from the packed `dist`, not just from source.

3. **Styling flows through `plugin.css` in a packed consumer.** `globals.css`
   contains `@source "../components"`. Relative to the packed stylesheet that is
   `dist/components`, which contains the dashboard component `.js` files with
   their literal `className` strings intact (verified: `tabular-nums`,
   `line-clamp-1`, `grid-cols-3`, `var(--status-success-muted)`, etc.). So a
   plugin importing `@sero-ai/ui/styles/plugin.css` emits the dashboard classes
   with no change to the existing `@source` line.

4. **Production Module Federation bundles render the components.** The new
   `plugins/sero-showcase-plugin` builds with `NODE_ENV=production` and emits a
   `remoteEntry.js`, `mf-manifest.json` and a single CSS chunk that contains all
   dashboard component classes plus the `--status-*` tokens. React is configured
   as a shared singleton (matching the other plugins), so there is no dual-React
   regression.

## What remains a manual gate

- **Pixel-level visual confirmation** in a running Sero (themes, focus rings,
  overflow at each grid size). Open the **Showcase** app and review the gallery.
- **Publishing** the `@sero-ai/ui` `0.4.0` bump to the registry is a release
  action, intentionally not run here. The version is bumped and `CHANGELOG.md`
  notes the additions; run the normal publish step to release.
- A dedicated **external** plugin (e.g. `../plugins/sero-google-plugin`) building
  against the published tarball is the final release smoke test. The mechanism is
  proven above; only the published-registry install differs from the packed pack
  tested here.
