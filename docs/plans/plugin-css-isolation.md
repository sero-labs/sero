# Plugin CSS isolation

Date: 2026-07-15
Status: Proposed

## Goal

Prevent one plugin's stylesheet from changing the shell, another plugin, or another plugin widget.

The solution must work for:

- built and live-development plugins,
- full-page plugin apps,
- several plugin widgets shown at the same time,
- UI rendered through portals, such as dialogs, menus, selects, popovers, and tooltips,
- existing external plugins during a migration period.

It must not require Shadow DOM, iframes, rewriting every Tailwind class, or unloading and reloading stylesheets whenever the user changes apps.

## Problem

Each federated plugin currently imports `@sero-ai/ui/styles/plugin.css`. That file imports the full shared `globals.css`, including Tailwind utilities, resets, and root theme declarations. Every plugin therefore emits another unscoped copy of many of the same CSS selectors.

All loaded plugin stylesheets remain in the document. Module Federation does not add a new copy every time the user changes apps, but it also does not remove the styles of previously loaded plugins. The cascade is therefore determined by stylesheet load order rather than plugin ownership.

This caused the Admin layout regression:

1. Admin loaded its stylesheet and rendered the intended responsive layout.
2. Cron loaded a later stylesheet containing the same Tailwind utility names.
3. Cron's later `.flex-col` rule overrode Admin's earlier container-query `.@xl:flex-row` rule.
4. Returning to Admin reused the already-loaded stylesheets, so the incorrect layout remained.

The current `prioritizeFederatedStyles(appId)` workaround moves the active app's existing stylesheet links to the end of `<head>`. It does not create duplicates, but it is not isolation:

- only one app can be “last” at a time,
- several widgets from different plugins can be visible together,
- portals are outside the app mount element,
- correctness still depends on load and navigation order.

## Decision

Use native CSS `@scope` around every plugin's generated CSS.

Each plugin stylesheet will be tied to its exact app ID:

```css
@scope ([data-sero-plugin="admin"]) to ([data-sero-plugin]) {
  /* Admin's generated CSS */
}
```

Cron's generated CSS will use `data-sero-plugin="cron"`, and so on. A plugin stylesheet therefore cannot match another plugin's mount even when both stylesheets contain `.flex`, `.flex-col`, or any other identical utility selector.

The lower boundary, `to ([data-sero-plugin])`, prevents an outer plugin scope from crossing into a nested plugin mount.

Every UI surface owned by a plugin must have a matching scope root:

```tsx
<div data-sero-plugin={manifest.id}>
  <PluginComponent />
</div>
```

This keeps normal DOM behavior, shared React context, inherited host theme values, browser developer tools, and existing component APIs.

## Browser support

Sero controls its desktop browser runtime. Electron 41 uses Chromium 146, which supports `@scope`. Supporting browsers older than the Sero Electron runtime is not a requirement for desktop plugin UI.

If the remote web client renders federated plugin UI, its supported-browser policy must require `@scope` before this becomes its only isolation mechanism.

## Scope ownership contract

### Canonical attribute

The canonical root attribute is:

```text
data-sero-plugin="<sero.app.id>"
```

The value must be the discovered `sero.app.id`, not the npm package name, federation remote name, or display name.

Plugin IDs must continue to use the existing lowercase identifier rules. The build helper must escape the value before inserting it into CSS even though discovery validates it.

`data-app` may remain temporarily for tests and automation, but styling must use `data-sero-plugin`.

### App mounts

`SeroAppMount` must put the scope attribute on the element that owns the federated app. Loading and error placeholders belong to the host and do not need plugin styling.

### Widget mounts

`WidgetMount` must add an independent scope root around every federated widget. This is required even when another surface from the same plugin is already mounted.

Runtime-only host widgets are not plugin CSS consumers unless they are supplied by a plugin runtime. The mount API must make ownership explicit rather than infer it from the component tree.

### Nested surfaces

If a plugin renders another plugin surface inside itself, the inner surface gets its own `data-sero-plugin` root. The `to ([data-sero-plugin])` boundary ensures the outer plugin's CSS stops at that root.

## Build-time CSS wrapping

Add a small published Vite helper for Sero plugins, for example `@sero-ai/plugin-vite`:

```ts
import { seroPluginCssScope } from '@sero-ai/plugin-vite';

seroPluginCssScope({ pluginId: 'admin' });
```

The name is illustrative; implementation may use an existing plugin tooling package if one is introduced first.

The helper must:

- run after Tailwind and other CSS transforms,
- wrap final plugin-owned style rules in the plugin-specific `@scope`,
- work in Vite development mode and production builds,
- preserve HMR without briefly injecting unscoped CSS,
- preserve source maps,
- handle code-split CSS assets,
- avoid wrapping a stylesheet twice,
- fail the build if it cannot prove that emitted plugin CSS is scoped,
- leave JavaScript and non-CSS assets unchanged.

A production-only `generateBundle` rewrite is insufficient. The original failure occurred in the local `pnpm dev` workflow, so the same transform must apply to Vite's development CSS modules and HMR updates.

All built-in plugin Vite configs and the plugin template must use the shared helper. Plugin authors should not hand-write the `@scope` wrapper or copy build logic between repositories.

## Shared CSS and theme tokens

The host remains the owner of document-wide CSS:

- resets and preflight,
- `html`, `body`, and `:root` rules,
- light/dark theme variables,
- font defaults,
- shell layout and shared animation primitives.

Plugins consume those inherited values. They must not emit their own document-wide copy of them.

Refactor `packages/ui/src/styles/plugin.css` so plugin builds can generate the required Tailwind utilities and shared component styles without re-emitting host-owned global rules. The exact Tailwind integration may change, but the resulting contract must be:

```text
host stylesheet   -> global reset, theme, and shell rules once
plugin stylesheet -> plugin-scoped utilities and component rules
```

Plugin-specific custom properties belong on `:scope` inside the plugin stylesheet:

```css
@scope ([data-sero-plugin="example"]) to ([data-sero-plugin]) {
  :scope {
    --example-chart-accent: oklch(0.7 0.12 220);
  }
}
```

Plugins must not declare `:root`, `html`, or `body`. The build helper should reject these selectors after imports and Tailwind transforms have been resolved, except for an explicit compatibility escape hatch during migration.

## Portals

CSS scope follows the DOM, not the React component tree. Radix and Base UI components commonly portal content to `document.body`, which would place it outside the plugin root and leave it unstyled.

Add a shared plugin-style-scope provider with a body-level portal container for each mounted plugin surface:

```html
<body>
  <div data-sero-plugin="admin" data-sero-plugin-portals="mount-123"></div>
</body>
```

Shared UI portal primitives must use the nearest provider's container. The provider should use the same `globalThis` singleton-context pattern as `@sero-ai/app-runtime`, so the host and separately bundled Module Federation remote observe the same React context.

Requirements:

- one portal container per mounted app or widget surface,
- append it directly under `body` to avoid clipping and transformed ancestors,
- give it the same `data-sero-plugin` value as its surface,
- remove it when that surface unmounts,
- direct dialogs, alert dialogs, drawers, sheets, dropdowns, context menus, selects, comboboxes, menubars, popovers, hover cards, and tooltips through it,
- retain current stacking and focus-management behavior.

Portal primitives must continue to work outside a plugin. When no plugin scope provider exists, they should keep their current default portal behavior.

## CSS constructs that `@scope` does not isolate

`@scope` limits selector matching. It is not a namespace for every CSS identifier.

The following remain document-wide and need a plugin naming rule or build validation:

- `@keyframes` names,
- `@font-face` family names,
- `@property` names,
- view-transition names,
- counter-style names,
- named cascade layers.

Custom plugin names must be prefixed with the app ID, for example `admin-panel-enter`. The build helper should validate or prefix names where this can be done safely. Shared definitions supplied by `@sero-ai/ui` may keep stable shared names.

## Compatibility with existing plugins

Add an optional manifest capability:

```json
{
  "sero": {
    "app": {
      "id": "example",
      "styleIsolation": "scope"
    }
  }
}
```

The final property location should follow the existing `sero.app` schema; the important part is an explicit value rather than guessing from plugin version or inspecting minified CSS at runtime.

Compatibility behavior:

- `styleIsolation: "scope"`: the host adds scope roots and does not reorder the plugin's stylesheet.
- missing capability: treat the plugin as legacy and retain the stylesheet-prioritization workaround.
- invalid capability: fail manifest validation with a clear plugin error.

All built-in plugins should move to scoped CSS together. Newly generated plugins should declare scoped isolation by default. Installed legacy plugins continue to work during the migration, with the known limitation that their global styles can still collide.

After the supported plugin contract requires scoped CSS, remove `prioritizeFederatedStyles` and its legacy path.

## Development behavior

Changing apps must not add another stylesheet for a plugin that is already loaded. Scoped CSS fixes selector ownership; it does not require stylesheet churn.

Expected sequence:

```text
open Admin -> load Admin remote and its scoped CSS once
open Cron  -> load Cron remote and its scoped CSS once
open Admin -> reuse Admin remote and CSS; no duplicate and no reorder
```

In local plugin development:

- Vite serves scoped CSS from the first render,
- HMR replaces or updates the existing scoped style module,
- rebuilding a plugin cannot leave a stale unscoped style element behind,
- built fallback and live dev mode produce the same layout,
- switching between a live plugin and a built plugin is order-independent.

## Security boundary

This is style isolation, not a security sandbox. A trusted plugin can still run JavaScript in the renderer and could deliberately add a global stylesheet or mutate the DOM. Untrusted plugin execution would require a separate iframe/process and capability design.

## Alternatives considered

### Prefix every selector at build time

This can work, but it rewrites selectors and specificity, needs careful handling of `:root`, pseudo selectors, container queries, and nested at-rules, and is easier to get subtly wrong than native scope. Keep it as the fallback if a required renderer cannot support `@scope`.

### Disable inactive plugin stylesheets

This reduces collisions for a single active app but fails when widgets from several plugins are visible together. It also complicates portals and introduces layout flashes during navigation.

### Give each plugin a unique Tailwind prefix

This prevents utility-name collisions but requires rewriting plugin markup and complicates shared `@sero-ai/ui` components. It does not contain arbitrary plugin CSS.

### CSS Modules

CSS Modules are useful for authored component CSS but do not isolate Tailwind utilities or global imports without a broad markup migration.

### Cascade layers

Layers control which rule wins. They do not prevent a selector from matching another plugin, so correctness would still depend on ordering.

### Shadow DOM or iframes

These offer stronger boundaries but would disrupt portals, shared theme inheritance, focus behavior, developer tooling, and parts of the current React/Module Federation integration. They are disproportionate for accidental stylesheet collisions.

## Implementation phases

### Phase 1 — Build and stylesheet foundations

- Add the shared Vite CSS-scope helper with development and production fixtures.
- Add `data-sero-plugin` roots to app and widget mounts.
- Add the manifest capability to shared types, discovery, validation, and templates.
- Separate host-owned global CSS from plugin-consumable CSS.
- Keep all existing plugins on the legacy path until portal support is ready.

### Phase 2 — Portal support

- Add the shared scope provider and per-surface body portal container.
- Update every shared UI portal primitive to use it.
- Test portals from full apps and dashboard widgets.

Phase 2 must land before scoped isolation is declared generally available. A plugin with scoped CSS but an unscoped portal has broken UI even though its main surface is isolated.

### Phase 3 — Built-in migration

- Migrate Admin and Cron first as the regression pair.
- Migrate every built-in plugin Vite config.
- Update the example plugin, plugin creation guidance, and technical documentation.
- Add validation for forbidden global selectors and custom global names.
- Keep stylesheet reordering for all unmarked plugins.

### Phase 4 — External rollout and cleanup

- Publish the build helper and updated plugin packages.
- Keep the legacy fallback for the documented compatibility window.
- Report legacy style isolation in plugin diagnostics so authors know why a plugin uses the fallback.
- Require scoped isolation in a future plugin contract version.
- Remove stylesheet reordering after that minimum version is enforced.

## Acceptance criteria

### Isolation

- Opening Admin, then Cron, then Admin produces the same Admin layout as opening Admin first.
- The result is unchanged if the stylesheet links are manually reordered.
- Identically named utility classes in two scoped plugin bundles cannot affect the other plugin.
- Plugin CSS does not change shell elements outside `data-sero-plugin` roots.
- Nested plugin roots stop styles from the outer plugin.

### Multiple surfaces

- Widgets from at least two different plugins render correctly at the same time.
- A plugin app and a widget from another plugin render correctly at the same time.
- Two surfaces from the same plugin can coexist without sharing portal ownership or leaking lifecycle state.

### Portals

- Dialog, dropdown/select, popover, tooltip, and sheet smoke tests render with plugin styles.
- Portal overlays retain expected focus trapping, positioning, stacking, and dismissal.
- Closing or removing a widget removes its portal container without affecting another surface.

### Build and development parity

- Production plugin CSS contains the exact plugin-specific `@scope` wrapper.
- Vite development and HMR never inject unscoped plugin CSS.
- Code-split CSS assets are scoped.
- Returning to an already loaded plugin does not add or reorder stylesheet nodes.
- `pnpm build && pnpm dev` exercises the same style-isolation contract as selective plugin development.

### Compatibility

- A legacy external plugin without the capability still mounts using the existing fallback.
- A scoped plugin never uses the reorder fallback.
- Invalid isolation metadata is reported as a manifest error.

## Test plan

Unit tests:

- CSS build helper transforms representative Tailwind output and code-split assets.
- It rejects unscoped output, forbidden document selectors, invalid IDs, and accidental double wrapping.
- Manifest discovery defaults missing metadata to legacy behavior.
- App and widget mounts set the correct scope attributes.
- Portal providers create, select, and remove the correct container.

Integration tests:

- Run representative plugin builds and inspect emitted CSS.
- Exercise Vite dev CSS and an HMR update, not only production output.
- Verify shared UI portal primitives inside and outside a plugin provider.

Electron Playwright tests:

- Admin -> Cron -> Admin navigation regression.
- Cron -> Admin navigation in a clean profile.
- Admin plus another plugin widget on the dashboard.
- Plugin dialog, select, and tooltip portal rendering.
- Assert one stylesheet or Vite style module per loaded plugin after repeated navigation.

Required final checks:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @sero/desktop e2e:workflow -- plugins.workflow.spec.ts
```

## Likely files and packages affected

- `apps/desktop/src/components/apps/SeroAppMount.tsx`
- `apps/desktop/src/components/apps/dashboard/WidgetMount.tsx`
- `apps/desktop/src/lib/federation-registry.ts`
- `apps/desktop/src/types/sero-apps.ts`
- `apps/desktop/electron/features/apps/discovery/`
- `packages/ui/src/styles/plugin.css`
- `packages/ui/src/styles/globals.css`
- `packages/ui/src/components/ui/` portal primitives
- a new or existing published plugin Vite helper package
- every built-in `plugins/sero-*-plugin/vite.config.ts`
- `packages/templates/skills/sero-plugin/example/sero-notes-plugin/`
- `docs/plugins/guide.md`
- `docs/plugins/technical.md`
- `apps/desktop/e2e/plugins.workflow.spec.ts`

## Open implementation questions

These should be resolved with small build fixtures before broad migration:

1. Whether the Vite helper should transform the final PostCSS AST or wrap emitted CSS assets with a matching dev-server transform. Both development and build output must be covered.
2. Whether `styleIsolation` belongs directly in `sero.app` or in a versioned UI capability object.
3. Which global CSS definitions should remain shared once `plugin.css` stops importing all of `globals.css`.
4. Whether safe custom global names should be validated only or automatically prefixed. Validation is preferable when rewriting could break JavaScript references.
5. Whether the remote web client needs a temporary selector-prefix fallback for browsers outside the Electron support window.

## References

- [CSS Cascading and Inheritance Level 6 — scoped styles](https://www.w3.org/TR/css-cascade-6/#scoped-styles)
- [Electron 41 release notes](https://www.electronjs.org/blog/electron-41-0)
- [Chrome overview of CSS `@scope`](https://developer.chrome.com/blog/whats-new-css-ui-2023#scope)
- [Tailwind prefix documentation](https://tailwindcss.com/docs/upgrade-guide#using-a-prefix)
