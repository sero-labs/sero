# Local Plugin Development

Local Plugin Development lets you run a **local plugin checkout directly in
production Sero**.

It is a normal author workflow for plugin builders. It is **not** a disguised
install flow, **not** a workspace-attachment flow, and **not** a monorepo-only
or experimental workaround.

## Mental model

Sero now exposes three separate concepts:

| Concept | Scope | What it does | What it does not do |
|---|---|---|---|
| **Installed Plugins** | Profile | Installs a packaged plugin under the profile agent directory | Does not run directly from your source checkout |
| **Local Plugin Development** | Profile | Activates a local plugin checkout as a managed dev session | Does not create an installed plugin |
| **Attached folders** | Workspace | Makes folders visible in Explorer and available to the workspace/container | Does not activate a plugin |

If you remember one rule, remember this:

> **Activation comes from a plugin dev session. Visibility in Explorer comes from an Attached folder. Installation comes from the plugin manager.**

## What a plugin dev session is

A plugin dev session is Sero's source of truth for local plugin authoring.
Each session is tied to:

- one local source folder
- one plugin/app identity
- one active profile

A valid session can:

- activate the plugin without installing it
- start and monitor a local UI dev server when the plugin declares one
- fall back to built UI assets when live UI is unavailable
- keep backend-only plugins active even without a UI
- persist broken-session metadata so recovery is possible after restart

## Starting local development

Open **Admin → Plugins → Local Plugin Development** and choose a local plugin
folder.

Sero validates the folder before activation. At minimum, the checkout must
contain a valid `package.json` with:

- `sero.app.id`
- `sero.app.name`

From there, Sero supports three common authoring shapes:

### 1. Live UI development

For a live UI dev server, the plugin should declare:

- `scripts.dev`
- `sero.app.devPort`

When both are present, Sero starts or reuses the dev server from the real
checkout and prefers:

```text
http://127.0.0.1:<devPort>/mf-manifest.json
```

for the session's UI.

### 2. Built UI fallback

If the plugin has a UI but live development is unavailable, Sero falls back to
built assets from the checkout when `dist/ui/mf-manifest.json` exists.

This keeps the plugin usable without requiring reinstall.

### 3. Backend-only plugin

If the plugin declares no UI surface, the session can still remain valid and
active for extension/runtime behavior.

## UI modes

The Admin UI shows the current UI mode for every dev session:

| UI mode | Meaning |
|---|---|
| **Live UI dev server** | Sero is using the session's localhost Module Federation manifest |
| **Built UI fallback** | Live UI is unavailable, so Sero is serving built `dist/ui` assets from the checkout |
| **Backend only** | The plugin has no UI surface and is active for non-UI behavior only |
| **UI unavailable** | The session is still usable where possible, but no UI surface is currently available |

## Session states and recovery

Sero also tracks the session lifecycle explicitly:

| State | Meaning |
|---|---|
| **Starting** | Sero is validating the checkout and starting any available dev services |
| **Active** | The session is healthy and running directly from the checkout |
| **Needs attention** | Sero kept the session active where possible, but the last refresh or UI startup had a degradable failure |
| **Broken** | The session record is preserved for recovery, but it is not currently active |

### When a session becomes broken

A session becomes broken when Sero confirms a hard failure such as:

- the source folder is gone
- `package.json` is unrecoverably invalid
- the app ID changed away from the saved session identity
- the checkout conflicts with a built-in app, an installed plugin, or another
  active dev session

Broken sessions stay visible in **Local Plugin Development** so you can:

- fix the checkout and retry
- inspect the saved path and last error
- remove the record cleanly

### Soft failures and fallback behavior

Not every problem breaks a session immediately.

Sero tries to preserve useful work when it can:

- transient refresh issues can leave the session in **Needs attention**
- a UI dev server failure can fall back to built UI assets
- a plugin can remain active without UI when backend behavior still works

This keeps local authoring resilient without hiding real failures.

## Profile scope

Local Plugin Development is **profile scoped**.

That means:

- sessions are saved for the current profile only
- a dev session started in one profile does not appear in another profile
- restarting Sero restores that profile's saved sessions, including broken ones
- switching profiles changes which dev sessions exist and activate

## Attached folders are optional

An **Attached folder** is a workspace feature, not an activation feature.
Use it when you want a source tree to be:

- visible in Explorer
- available for in-app editing
- bind-mounted into the current workspace/container

You do **not** need to attach a folder to start or keep a local plugin dev
session active.

Attached folders only affect workspace visibility. They are not required for
plugin discovery, plugin activation, or UI dev-server startup.

### Legacy/internal naming note

Some v1 internals and older references may still mention names such as
`linked-plugin` or `mount-plugin`. Those are legacy/internal terms. In the
product UI and docs, the user-facing term is **Attached folders**.

## Installed Plugins vs Local Plugin Development

Choose the workflow based on what you are trying to do:

- Use **Local Plugin Development** when you want to iterate on a real checkout
  and have Sero run that source tree directly.
- Use **Installed Plugins** when you want to test or distribute a packaged
  plugin bundle/source package through the normal install lifecycle.

These flows intentionally stay separate.

For example, Sero will block an install when an active local dev session already
owns the same app ID. Stop the dev session first if you want to test the
installed package form.

## `SERO_DEV_PLUGINS` is not the product workflow

Production local authoring does **not** rely on `SERO_DEV_PLUGINS`.

That environment variable still exists for the Sero monorepo's own desktop-shell
and built-in remote development workflow, but it is not the user-facing model
for plugin authors.

If you are developing a plugin in normal Sero usage, use **Admin → Plugins →
Local Plugin Development** instead of depending on `SERO_DEV_PLUGINS`.

## Recommended author workflow

1. Structure your checkout as a normal Sero plugin with a valid `sero.app` manifest.
2. If the plugin has a UI, add `scripts.dev` and `sero.app.devPort` for live UI
   development.
3. Keep `dist/ui` build output available when you want built fallback behavior.
4. In Sero, open **Admin → Plugins → Local Plugin Development** and start a
   session from the checkout.
5. Watch the session badges to confirm whether Sero is using the live dev
   server, built fallback UI, backend-only mode, or an unavailable UI state.
6. Optionally attach the same folder to the current workspace if you also want
   Explorer visibility or container-mounted editing.
7. Use **Refresh** or **Retry** after backend/runtime/manifest changes or after
   fixing an error.
8. When you are ready to test packaging, stop the dev session and use the normal
   install/build/publish flow from [`docs/plugins/guide.md`](../plugins/guide.md).

## Related docs

- [`docs/plugins/guide.md`](../plugins/guide.md) — packaging, installs,
  publishing, and local author workflow
- [`docs/features/sero-apps.md`](./sero-apps.md) — runtime model for apps,
  manifests, UI remotes, and shared state
- [`docs/plugins/technical.md`](../plugins/technical.md) — plugin-system
  internals
