# Plugins

Sero supports both built-in and external plugins. Use the
[Plugin Catalog](/plugins/catalog) for the source-checked list of built-in and
external/local packages.

A plugin can provide:
- a React UI loaded via Module Federation
- a Pi extension with tools, commands, and hooks
- optional runtime/background behavior
- optional provider metadata for model integration

## Distribution modes

Plugins can be installed from:
- npm
- git repositories
- local paths

For source-based installs, Sero may run local build steps. Only install source
plugins from repositories you trust.

## Local plugin development

Sero also supports running a plugin checkout directly in production Sero through
its local plugin development flow. That is distinct from both installed plugins
and attached folders.

| Concept | What it means |
| --- | --- |
| Installed plugin | A package installed into the active profile from npm, git, or a local path. |
| Local plugin development | A source checkout activated from **Admin → Plugins → Local Plugin Development** for the active profile. |
| Attached folder | A workspace-visible folder/reference; it does not activate a plugin. |

![Local plugin development sessions and attached folders](../assets/images/local-plugin-preview.jpg)

Use this Admin plugin surface when you want to run a local plugin checkout for
the active profile. Use attached folders only when you also want the source tree
visible/editable in the current workspace.

### Dev session states

| State | Meaning | Recovery |
| --- | --- | --- |
| Starting | Sero is validating the checkout and resolving UI/runtime entries. | Wait, then inspect logs if it does not settle. |
| Active | The checkout is available to the profile. Live UI may come from the dev server when configured. | Use normally; keep the dev server running if relying on live UI. |
| Needs attention | Sero found the package but a dev server, build output, or capability is missing. | Start the plugin dev server or build the UI. |
| Broken | Manifest, install, runtime, or remote-entry resolution failed. | Fix the checkout, restart the session, and use redacted logs. |

UI resolution prefers a live dev server at the manifest `devPort` when the plugin
has a `dev` script, then falls back to built UI output such as
`dist/ui/mf-manifest.json` where supported. Backend-only plugins can be active
without a UI surface.

Do not present `SERO_DEV_PLUGINS` as the normal plugin-author workflow. It is a
maintainer/dev aid; the product flow is the Admin local plugin development
surface.

## Beta guidance

During beta:
- treat third-party plugins as trusted-source only
- expect plugin/runtime contracts to continue evolving
- keep packaging metadata and compatibility requirements explicit

## Starter author path

The canonical starter example is the external **Daily Quote** plugin:
- `https://github.com/sero-labs/sero-daily-quote-plugin`

Treat it as a **small complete reference plugin**, not a visually minimal one.
Its structure is the main thing to copy: manifest shape, extension entry,
shared types, UI entry, and Vite federation config.

For the end-user App Store and sidebar flow, see
[App Store, Favorites, and Installed Plugins](/guide/app-store-favorites).

For the shortest author-oriented path through manifests, app-runtime hooks,
file-backed state, host capabilities, and Module Federation, see
[Plugin Author Quick Path](/reference/plugin-author-quick-path). For the compact
hook/API table, see [App Runtime Reference](/reference/app-runtime).

For the published starter walkthrough, see
[Plugin Quickstart](/reference/plugin-quickstart).

If you need the smallest example that shows **UI + extension + background
runtime** together, see
[Plugin End-to-End Example](/reference/plugin-end-to-end-example).

## See also

Current detailed source material:
- [`docs/plugins/quickstart.md`](https://github.com/sero-labs/sero/blob/main/docs/plugins/quickstart.md)
- [`docs/plugins/guide.md`](https://github.com/sero-labs/sero/blob/main/docs/plugins/guide.md)
- [`docs/plugins/host-compatibility.md`](https://github.com/sero-labs/sero/blob/main/docs/plugins/host-compatibility.md)
- [`docs/features/local-plugin-development.md`](https://github.com/sero-labs/sero/blob/main/docs/features/local-plugin-development.md)
