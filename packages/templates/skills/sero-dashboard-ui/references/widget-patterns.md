# Widget patterns

How to make a widget useful across its size range, and the conventions the
shared components assume.

## Static manifest declaration

Declare a static widget as a federated component contribution:

```json
{
  "contributes": {
    "components": [{
      "id": "summary",
      "extensionPoint": "ui.dashboard.widget",
      "component": "SummaryWidget",
      "name": "Summary",
      "defaultSize": { "w": 2, "h": 2 }
    }]
  }
}
```

Expose `SummaryWidget` in Module Federation. Use
`useWidgetRegistration()` only when the widget must be registered at runtime.
The host owns the grid and widget chrome in both cases.

## Responsive behaviour

Widgets must stay legible at their declared minimum and default sizes. Use normal
CSS and **container queries**, not a JavaScript viewport contract.

`WidgetContent` opens a container-query boundary (`@container/widget`). Respond to
the widget's own width with Tailwind container variants:

```tsx
<WidgetContent>
  {/* one column when narrow, two when the widget is wider */}
  <Grid columns={1} className="@sm/widget:grid-cols-2">…</Grid>
</WidgetContent>
```

The shared components ship sensible compact defaults; the **plugin** decides
which data to show at each size. A good pattern:

- **1×1** — a single headline number or status. Hide secondary rows.
- **2×2** — the normal hierarchy: a summary + a short list.
- **3×2 and wider** — use the extra space for more rows, a gauge, or metadata,
  not just stretched whitespace.

Drive this from the container width, e.g. cap list length and reveal a section:

```tsx
<Stack gap="sm">
  <Metric label="Open" value={open} />
  <div className="hidden @sm/widget:block">
    <Section heading="Recent">
      <ActivityList overflowCount={Math.max(0, items.length - 5)}>
        {items.slice(0, 5).map((i) => <ActivityListItem key={i.id} label={i.label} timestamp={i.at} />)}
      </ActivityList>
    </Section>
  </div>
</Stack>
```

## Review checklist

Before shipping a widget, review:

- **Sizes** — 1×1, 2×2, 3×2. Legible, no overflow, sensible use of extra space.
- **Themes** — light and dark. Tokens handle this; check nothing hard-codes a
  colour.
- **Long labels** — pass `truncate` / `clamp` on `Text`, and rely on the list
  components' built-in truncation.
- **Empty data** — an `EmptyState`, not a blank box.
- **Loading / error** — a skeleton pattern and an `Alert`, wired through
  `DataBoundary`.
- **Keyboard focus** — interactive controls (`Button`, `IconButton`) show a
  visible focus ring and have accessible labels.

## Conventions the components assume

- **Stateless presentation.** The components never fetch, subscribe or compute
  relative time. Pass pre-formatted values (e.g. `timestamp="in 2h"`); the plugin
  owns any refresh. Avoid `setInterval` polling — prefer reactive state.
- **One tone vocabulary.** `neutral · success · warning · error · info`, mapped
  to the `--status-*` tokens. Map domain status onto a tone.
- **One spacing scale.** `gap="none|xs|sm|md|lg"` on `Stack` / `Inline` / `Grid`
  / `Section`. Don't reach for arbitrary `gap-[Npx]`.
- **Fill for scroll to work.** `WidgetContent` fills its host cell, but a nested
  `<Stack scroll>` only bounds if its ancestors fill too. Put `fill` on the
  top-level Stack under `WidgetContent` (`<Stack gap="sm" fill>`) so a pinned
  header + a scrolling region below it behave correctly.
- **`className` is an escape hatch**, not the main styling path. Use it for a
  one-off layout tweak (`flex-1`, `ml-auto`), not to restyle a component.

## Styling setup (external plugins)

Every plugin's `ui/styles.css` must import the shared stylesheet and scan its own
files, or a packaged remote ships without its classes:

```css
@import "@sero-ai/ui/styles/plugin.css";
@source "./**/*.{ts,tsx}";
```

`plugin.css` already scans the `@sero-ai/ui` dashboard components, so their
classes are emitted for you. Import `../styles.css` from every directly-exposed
Module Federation entry (the app and each widget).
