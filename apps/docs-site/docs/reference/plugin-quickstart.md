# Plugin Quickstart

Build an external plugin from the maintained
[Kanban starter](https://github.com/sero-labs/sero-kanban-plugin). Follow its
[setup and install guide](https://github.com/sero-labs/sero-kanban-plugin/blob/main/README.md).
Its manifest uses published dependencies and can run outside this monorepo.

The Notes example includes a React UI, a Pi extension, shared state, a
background runtime, and a dashboard widget. It uses `workspace:` and `catalog:`
dependencies and is for development in the Sero monorepo unless you port its
complete manifest to published dependencies:

The example is for a plugin inside the Sero monorepo:

- [`packages/templates/skills/sero-plugin/example/sero-notes-plugin/`](https://github.com/sero-labs/sero/tree/main/packages/templates/skills/sero-plugin/example/sero-notes-plugin)
- [example file map and instructions](https://github.com/sero-labs/sero/blob/main/packages/templates/skills/sero-plugin/example/README.md)

For a separate repository, start with Kanban. Use Notes only when you need its
additional surfaces. At the time of this documentation, `@sero-ai/app-runtime`
is `0.4.0` and `@sero-ai/plugin-vite` is `0.1.1`. Check the npm registry before
you select versions for a new plugin.

## 1. Copy and rename the example

Copy `sero-notes-plugin` to `plugins/sero-<name>-plugin/`. Then change:

- the npm package name;
- `sero.app.id`, `name`, `icon`, and `stateFile`;
- the remote name in `vite.config.ts` to `sero_<id>`;
- the component names and Module Federation exposed keys;
- `devPort` in `package.json` and `server.port` in `vite.config.ts`.

Keep the port values equal. Use a port that no other plugin uses.

## 2. Remove surfaces that you do not need

Keep `extension/` for Pi tools and commands. Keep `ui/` and `vite.config.ts` for
a visual app. Keep `runtime/` only for long-running work, such as watchers or
recovery.

If the plugin has a federated UI, keep these contracts:

- set `sero.plugin.runtimeAbi` to `2`;
- set `sero.app.styleIsolation` to `"scope"`;
- use `seroPluginCssScope({ pluginId: '<id>' })` from
  `@sero-ai/plugin-vite` after Tailwind;
- import `@sero-ai/ui/styles/plugin.css` in `ui/styles.css`;
- import the plugin stylesheet from every exposed component entry;
- expose `./<Component>` in Vite, but put `<Component>` in the manifest;
- give each exposed source module a default React component export;
- use `base: './'` for production builds.

Sero rejects a federated UI when its runtime ABI is absent or does not equal the
host ABI. Extension-only plugins do not need this ABI value.

When you remove a UI or runtime surface, remove all of its contracts:

- remove its source folder and related Vite entry or runtime entry;
- remove its manifest fields, such as `ui`, `component`, `runtime`, `devPort`,
  and `widgets`;
- remove capabilities that the surface required, such as
  `appRuntime.background`;
- remove its host contributions and their Module Federation exposes;
- remove its build and typecheck commands from package scripts and root
  TypeScript configurations.

Run the remaining typecheck and build scripts after each removal.

## 3. Install dependencies and check the plugin

From the monorepo root, run:

```bash
pnpm install
pnpm --filter @sero-ai/plugin-<name> typecheck
pnpm --filter @sero-ai/plugin-<name> build
```

For an installable bundle, also run:

```bash
bash scripts/build-plugin.sh plugins/sero-<name>-plugin
```

## 4. Start it in Sero

Open **Admin → Plugins → Local Plugin Development**. Select the plugin source
folder and start the session. Sero reads `scripts.dev`, starts that command on
the host, and checks `http://127.0.0.1:<devPort>/mf-manifest.json` or the
equivalent `localhost` URL. Do not start a second server on the same port.

If the live UI cannot start, Sero uses `dist/ui` when a built UI is available.
Changes to the UI refresh the plugin surface. Changes to the extension, runtime,
shared types, resources, or manifest refresh the development session and can
reload plugin resources.

## 5. Check the first journey

Confirm that:

1. the plugin appears in the sidebar;
2. the main UI opens and has its own styles;
3. a UI change updates the plugin state file;
4. a tool change updates the same state and then updates the UI;
5. the runtime starts and stops correctly, if you kept it;
6. each contributed component opens in its host surface, if you kept one.

## Next steps

- [Plugin Author Quick Path](/reference/plugin-author-quick-path) helps you
  select the next reference.
- [Plugins](/reference/plugins) explains installation, development sessions,
  and compatibility.
- [Plugin End-to-End Example](/reference/plugin-end-to-end-example) indexes the
  Notes files by task.
- [Plugin Extension Points](/reference/plugin-extension-points) defines
  contributed components and controls.
