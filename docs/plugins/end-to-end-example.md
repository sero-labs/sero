# Sero Plugin End-to-End Example

This page points to the canonical **minimal end-to-end example** for a Sero
plugin that includes all three major plugin surfaces together:

- **UI**
- **Pi extension**
- **background runtime**

For the smaller UI + extension-only starter, keep using
[`quickstart.md`](./quickstart.md).

## Canonical end-to-end example

Use the in-repo **Notes** reference plugin:

- repo folder:
  [`packages/templates/skills/sero-plugin/example/sero-notes-plugin/`](https://github.com/sero-labs/sero/tree/main/packages/templates/skills/sero-plugin/example/sero-notes-plugin)
- example walkthrough:
  [`packages/templates/skills/sero-plugin/example/README.md`](https://github.com/sero-labs/sero/blob/main/packages/templates/skills/sero-plugin/example/README.md)

Important framing:
- it is a **template/reference plugin**, not a public installable starter repo
- it is the smallest example in this repo that exercises the **full surface**
- it is best when you need to understand how **UI + extension + runtime** fit
  together in one plugin

## What this example covers

The Notes example demonstrates:

- `package.json`
  - `pi.extensions`
  - `sero.app`
  - `sero.plugin`
  - `runtime`
  - `requiredHostCapabilities`
  - a static widget under `sero.app.contributes.components`
- `shared/types.ts`
  - one shared state contract used by extension, runtime, and UI
- `extension/index.ts`
  - tool + command registration
  - bridged CLI behavior
  - state writes and session hooks
- `runtime/index.ts`
  - plugin-owned background runtime
  - startup reconcile
  - `handleStateChange`
  - cleanup via `dispose`
- `ui/NotesApp.tsx`
  - mounted React app
  - app-runtime hooks
  - agent/tool integration
- `ui/widgets/NotesWidget.tsx`
  - dashboard widget path
- `vite.config.ts`
  - Module Federation remote config

## File shape

```text
sero-notes-plugin/
├── package.json
├── extension/
│   ├── index.ts
│   └── tsconfig.json
├── runtime/
│   ├── index.ts
│   └── tsconfig.json
├── shared/
│   └── types.ts
├── ui/
│   ├── NotesApp.tsx
│   ├── widgets/NotesWidget.tsx
│   ├── index.html
│   ├── styles.css
│   ├── tsconfig.json
│   └── vite-env.d.ts
└── vite.config.ts
```

## When to use which example

### Use Daily Quote when you want:
- the fastest author quickstart
- one UI surface + one extension entry
- minimal structure without runtime complexity

See [`quickstart.md`](./quickstart.md).

### Use Notes when you want:
- a plugin-owned **background runtime**
- a complete example of **all plugin surfaces together**
- a reference for `requiredHostCapabilities`, extension points, widgets, and runtime wiring

## How to adapt it

Start from the example README first:
- remove `runtime/` if you do not need long-lived background behavior
- remove widgets if you do not need dashboard surfaces
- keep static widgets as component contributions to `ui.dashboard.widget`;
  `useWidgetRegistration()` is only for widgets registered at runtime
- keep `shared/types.ts` as the single source of truth for plugin state
- keep the UI/extension/runtime split rather than collapsing everything into one
  file

For external plugins, remember that this example is monorepo-oriented. Replace
workspace-only dependencies and config inheritance with published package usage
before distributing it outside this repo.

## See also

- [`quickstart.md`](./quickstart.md)
- [`guide.md`](./guide.md)
- [`host-compatibility.md`](./host-compatibility.md)
- [`../features/local-plugin-development.md`](../features/local-plugin-development.md)
