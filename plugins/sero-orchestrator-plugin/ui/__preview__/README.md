# Component previews

A dev page that renders Orchestrator components against a typed fixture, with no
host bridge, no module federation, and no live workflow.

```bash
pnpm --filter @sero-ai/plugin-orchestrator preview
# http://localhost:5199/ui/__preview__/index.html
# one component: ...?preview=plan-map-3
```

## Why it exists

The plan map draws absolutely positioned cards of a fixed height, and SVG edges
between them. A card that clips its outcome, or an edge that crosses a node,
passes every unit test. The harness makes those faults visible, and it gives a
browser a URL to screenshot.

It found two faults the tests could not: grouped steps clipped inside a parallel
stage, and a card at 3 steps per row whose wrapped title pushed the outcome out.

## How to add a preview

Add an entry to `PREVIEWS` in `previews.tsx`:

```tsx
{
  id: 'my-component',
  title: 'My component · empty state',
  note: 'What this shows, and why it needs eyes.',
  width: 720,
  render: () => <MyComponent {...props} />,
}
```

Give the component everything through props. A component that needs
`OrchestratorStateContext` or `@sero-ai/app-runtime` needs its provider around
the preview — put the provider in `render`, not around the whole page, so one
preview cannot break the others.

## What to know

- `SERO_PREVIEW=true` turns off the module-federation plugin, the same way
  `VITEST=true` does. See `vite.config.ts`.
- The build only takes `ui/index.html`, so this directory never ships.
- `ui/styles.css` scans `./**/*.{ts,tsx}`, so classes used only here still reach
  the CSS build. Keep the harness to classes the product already uses.

## Theme

`plugin.css` leaves the Sero design tokens to the host: a federated plugin
inherits them from the document root of the app that mounts it. The harness has
no host, so `preview.css` imports the host stylesheet for them, after
`ui/styles.css` so the host values win.

The plugin's CSS is wrapped in `@scope ([data-sero-plugin="orchestrator"]) to
([data-sero-plugin])`. Inside `@scope`, a bare selector such as `.dark` matches
descendants of the scope root and never the root itself, so the theme class sits
one element inside the scope root. Move it onto the root and every token stays
at its light value.
