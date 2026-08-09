# Plugin End-to-End Example

If you want the smallest public example that shows **UI + extension + runtime**
together, use the in-repo **Notes** reference plugin.

## Canonical example

- example folder:
  [`packages/templates/skills/sero-plugin/example/sero-notes-plugin/`](https://github.com/sero-labs/sero/tree/main/packages/templates/skills/sero-plugin/example/sero-notes-plugin)
- walkthrough:
  [`packages/templates/skills/sero-plugin/example/README.md`](https://github.com/sero-labs/sero/blob/main/packages/templates/skills/sero-plugin/example/README.md)

This is the best reference when you need to understand how a Sero plugin can
ship all of these together:
- a React UI
- a Pi extension
- a plugin-owned background runtime
- a static dashboard widget component contribution
- shared state types across surfaces

## What it demonstrates

The Notes example includes:
- `package.json` with `pi.extensions`, `sero.app.runtime`, a
  `ui.dashboard.widget` contribution, and
  `requiredHostCapabilities`
- `shared/types.ts` as the shared state contract
- `extension/index.ts` for tools, commands, and CLI-bridged behavior
- `runtime/index.ts` for long-lived background orchestration
- `ui/NotesApp.tsx` plus a widget component and Module Federation config

## File shape

```text
sero-notes-plugin/
├── package.json
├── extension/
├── runtime/
├── shared/
├── ui/
└── vite.config.ts
```

## Which example to start from

### Start from Daily Quote when you want:
- the fastest starter path
- UI + extension only
- the simplest structure to copy first

See [Plugin Quickstart](/reference/plugin-quickstart).

### Start from Notes when you want:
- UI + extension + runtime together
- a runtime-enabled example
- a reference for widgets and background behavior

The Notes widget uses `sero.app.contributes.components`. This static manifest
path is separate from `useWidgetRegistration()`, which registers a widget only
for the current renderer lifecycle. See
[Plugin Extension Points](/reference/plugin-extension-points).

## Source-material version

For the deeper repo-side writeup, see:
- [`docs/plugins/end-to-end-example.md`](https://github.com/sero-labs/sero/blob/main/docs/plugins/end-to-end-example.md)

## See also

- [Plugins](/reference/plugins)
- [Plugin Quickstart](/reference/plugin-quickstart)
- [Plugin Extension Points](/reference/plugin-extension-points)
