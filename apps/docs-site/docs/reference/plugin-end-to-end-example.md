# Plugin End-to-End Example

The maintained Notes example shows all three plugin surfaces in one package.
It uses monorepo `workspace:` and `catalog:` dependencies. Use it inside the
Sero monorepo unless you port its complete manifest to published dependencies:

- [source folder](https://github.com/sero-labs/sero/tree/main/packages/templates/skills/sero-plugin/example/sero-notes-plugin)
- [file map and copy instructions](https://github.com/sero-labs/sero/blob/main/packages/templates/skills/sero-plugin/example/README.md)

Use this index to find the smallest relevant example.

For an external repository, use the maintained
[Kanban starter](https://github.com/sero-labs/sero-kanban-plugin) and its
[setup guide](https://github.com/sero-labs/sero-kanban-plugin/blob/main/README.md).

| Task | File |
| --- | --- |
| Define the Pi, app, and plugin manifests | `package.json` |
| Set runtime ABI 3 and required host capabilities | `package.json` |
| Define JSON-serialisable state and defaults | `shared/types.ts` |
| Register a tool, command, and CLI metadata | `extension/index.ts` |
| Read and write state from the React UI | `ui/NotesApp.tsx` |
| Call a plugin tool from the UI | `ui/NotesApp.tsx` |
| Create and clean up long-running behavior | `runtime/index.ts` |
| Contribute a static Dashboard widget | `package.json` and `ui/widgets/NotesWidget.tsx` |
| Register a widget for the renderer session | `ui/NotesApp.tsx` |
| Expose the app and widget through Module Federation | `vite.config.ts` |
| Isolate plugin CSS | `ui/styles.css` and `vite.config.ts` |

## Module Federation checks

The manifest uses component names without `./`. The Vite `exposes` map uses
keys with `./`:

```text
manifest component: NotesApp
Vite exposed key:  ./NotesApp
```

`NotesApp.tsx` and `NotesWidget.tsx` each have a default React component export.
Each directly exposed entry also imports `styles.css`. The Vite configuration
uses `base: './'` for production and `seroPluginCssScope()` after Tailwind.

## Select only the parts that you need

For UI and extension only, remove `runtime/`, the runtime manifest field, the
`appRuntime.background` capability, and runtime typecheck entries. For an
extension-only plugin, also remove `ui/`, `vite.config.ts`, app UI fields,
widgets and other contributions, Module Federation exposes, and UI build or
typecheck entries.

Follow [Plugin Quickstart](/reference/plugin-quickstart) for the complete first
journey. Use [Plugin Extension Points](/reference/plugin-extension-points) for
the contribution schema and lifecycle rules.
