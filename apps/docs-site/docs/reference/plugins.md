# Plugins

A Sero plugin can provide Pi tools and commands, a React app, and an optional
background runtime. It can also contribute components or standard controls to
host-owned extension points.

New authors should start with [Plugin Quickstart](/reference/plugin-quickstart).
Users who only want to install an app should use
[App Store, Favorites, and Installed Plugins](/guide/app-store-favorites).

## Install a plugin

Open **App Store** to browse installed apps or discover community plugins. The
installer accepts these source forms:

| Source | Exact form |
| --- | --- |
| npm | `npm:@scope/package@version` |
| Git | `git:https://github.com/owner/repository.git` |
| Local folder | `/absolute/path/to/plugin` |

Git and local installs can install dependencies and build source. They support
npm and pnpm package managers. A source package must not contain unresolved
`workspace:` or `catalog:` dependency versions. Install source only when you
trust the repository.

An npm UI package must include `dist/ui/remoteEntry.js`. A Git or local source
package with a UI needs a build script unless it declares a prebuilt package.

## Develop a local checkout

Use **Admin → Plugins → Local Plugin Development**. This flow activates a
source checkout in the current profile. It is not the same as an installed
plugin or a folder attached to a workspace.

For a UI plugin, Sero:

1. validates the manifest and host compatibility;
2. reads `scripts.dev` and `sero.app.devPort`;
3. starts the development command on the host;
4. checks the loopback `mf-manifest.json` and confirms the remote name;
5. uses the live UI when it is ready;
6. uses built `dist/ui` output as a fallback when it is available.

Sero owns this development server process. If another process uses the port,
stop it and let Sero start the server. UI edits refresh the plugin surface.
Edits to extension, runtime, shared, resource, or manifest files refresh the
development session.

The page can report these states: **Starting**, **Active**,
**Needs attention**, and **Broken**. Use the shown error and redacted logs to
correct a failed session.

![Local plugin development sessions and attached folders](../assets/images/local-plugin-preview.jpg)

## Federated UI contract

Current UI plugins must:

- declare `sero.plugin.runtimeAbi` as `2`;
- declare `sero.app.styleIsolation` as `"scope"`;
- use `seroPluginCssScope()` from `@sero-ai/plugin-vite`;
- use `base: './'` for production;
- expose each module as `./<Component>` in Vite;
- use `<Component>` without `./` in the app manifest;
- default-export a React component from each exposed source module;
- import the plugin stylesheet from each exposed entry.

The current package versions in this repository are
`@sero-ai/app-runtime@0.4.0` and `@sero-ai/plugin-vite@0.1.1`. External plugins
must use published versions instead of monorepo `workspace:` versions.

## Compatibility checks

Sero checks `sero.plugin.minSeroVersion` and
`sero.plugin.requiredHostCapabilities`. It also checks the runtime ABI for a
plugin that has a federated UI. A UI plugin with a missing or different ABI is
inactive. An extension-only plugin has no federated UI ABI check.

State can remain on disk when a plugin is inactive. Do not use activation as a
signal that plugin-owned data was deleted.

## Author references

- [Plugin Author Quick Path](/reference/plugin-author-quick-path)
- [Plugin End-to-End Example](/reference/plugin-end-to-end-example)
- [App Runtime Reference](/reference/app-runtime)
- [Plugin Extension Points](/reference/plugin-extension-points)
- [Plugin Catalog](/plugins/catalog)
