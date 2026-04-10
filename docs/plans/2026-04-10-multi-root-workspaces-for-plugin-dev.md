---
title: Multi-Root Workspaces & Linked Plugin Sources
status: proposed
date: 2026-04-10
author: Claude
related:
  - docs/decisions.md (AD-018 container model, AD-020 Pi tool registration)
  - docs/plugins/guide.md
  - docs/plugins/technical.md
---

# Multi-Root Workspaces & Linked Plugin Sources

## Problem

Today, developing a Sero plugin **from inside Sero itself** is awkward:

- The Sero monorepo lives outside `~/.sero-ui/`, so its files are invisible to
  the in-app explorer no matter which workspace is active.
- The agent can edit those files (it's just shelling out on the host), but the
  user can't see the changes without dropping into an external IDE or `git`.
- The path sandbox in `electron/ipc/editor/editor.ts` (`toHostPath`) hard-codes
  one workspace root per workspace and rejects anything that resolves outside
  it — including symlinks (lines 47–93). There is no escape hatch.
- The container layer already supports arbitrary host bind-mounts via
  `workspace.addMount()` (`features/workspace/mounts.ts:71`), but those mounts
  are invisible in the explorer tree because the renderer always asks for a
  single virtual root `/workspace` (`editor.ts:265–272`,
  `ExplorerWorkspace.tsx:65–75`).

The result: the cleanest way to "develop a Sero plugin from Sero" is to open a
second editor. That kills the dogfooding loop.

## Goal

Make plugin development from within Sero a **first-class, transparent
experience**:

1. A user can attach the Sero monorepo (or any local plugin checkout) to a
   workspace as an **additional root**, see it in the explorer alongside the
   primary workspace, edit files, run terminals, and have the agent see the
   exact same paths.
2. The Plugin Manager has an explicit **"Link plugin from local path"** action
   that does this in one click for plugin authors — `pnpm link`-style.
3. The mental model matches **VS Code multi-root workspaces**, which every
   developer already understands. No new concepts to learn.
4. The path sandbox stays strict: each root is its own sandbox; `..`-traversal
   between roots is still rejected.

## Non-Goals

- Mounting arbitrary host paths into the renderer **without** registering them
  on a workspace. We're not building a generic file picker.
- Cross-root drag-and-drop, project-wide search across roots, or rename
  refactoring across roots. Each root is independent for v1.
- Replacing the existing `references` (workspace-to-workspace) or `mounts`
  (container-only) features. Roots are a third, renderer-visible primitive
  that supersedes mounts for the dev-loop use case but does not break either.
- Multi-root in host mode for `.sero-workspace.json` discovery / inference.
  Roots affect the explorer + editor IPC + container mounts; the workspace's
  primary path remains the canonical "anchor" for context inference, sessions,
  jj/vcs watching, etc.

## Design

### Mental model

A workspace has **one primary root** (the existing `path`) and **zero or more
additional roots**. Each root has:

```ts
interface WorkspaceRoot {
  /** Stable kebab-case slug, unique within the workspace. */
  id: string;
  /** Human-readable label shown in the explorer header. */
  name: string;
  /** Absolute host path. Resolved + validated on add. */
  path: string;
  /** Marker for plugin-dev linked roots so the Plugin Manager can show a badge. */
  kind?: 'workspace' | 'linked-plugin';
}
```

The primary workspace root is always exposed as `{ id: 'workspace', name, path,
kind: 'workspace' }`. Additional roots live in
`.sero-workspace.json#roots: WorkspaceRoot[]`.

### Virtual paths

The renderer already speaks in `/workspace/...` virtual paths. We extend the
scheme so that the **first segment is the root id**:

```
/workspace/src/main.tsx       → primary root
/sero-source/apps/desktop/... → linked monorepo root
/my-plugin/dist/index.js      → linked plugin root
```

`toHostPath()` becomes `toHostPath(workspaceId, virtualPath)`:

1. Parse the first segment of `virtualPath` (`/<rootId>/rest`).
2. Look up `roots[rootId]` from the workspace config (cached); if missing,
   fall back to the primary root for backwards compat with paths that omit a
   prefix.
3. Resolve `<root.path>/<rest>`; run the same null-byte / length / escape /
   symlink-escape checks against `<root.path>` instead of a single hard-coded
   root.

This is a small, contained change — the security model is unchanged; we just
have N roots instead of 1.

### IPC surface

Add to the existing `IpcChannels.workspace.*` namespace:

| Channel                       | Args                                      | Returns           |
| ----------------------------- | ----------------------------------------- | ----------------- |
| `workspace.listRoots`         | `(id)`                                    | `WorkspaceRoot[]` |
| `workspace.addRoot`           | `(id, { name, path, kind? })`             | `WorkspaceRoot`   |
| `workspace.removeRoot`        | `(id, rootId)`                            | `void`            |
| `workspace.renameRoot`        | `(id, rootId, newName)`                   | `void`            |

Add to `IpcChannels.editor.*`:

| Channel                       | Args                                      | Returns           |
| ----------------------------- | ----------------------------------------- | ----------------- |
| `editor.getRoots`             | `(workspaceId)`                           | `EditorRoot[]`    |

Where `EditorRoot = { id: string; name: string; virtualPath: string }` (e.g.
`{ id: 'workspace', name: 'Sero', virtualPath: '/workspace' }`). The renderer
uses `getRoots` to render the explorer; it never sees host paths.

`editor.getRootPath` is kept for backwards compat (returns the primary root's
virtual path) but new code should call `getRoots`.

### File-tree behaviour

`ExplorerWorkspace.tsx`:

- Replace the single `rootId` state with `roots: EditorRoot[]`, populated from
  `editor.getRoots(workspaceId)` whenever the workspace changes.
- `ExplorerSidebar` renders **one collapsible `<FileTree>` per root**. Each
  tree's `rootId` is the root's `virtualPath`. The existing tree component
  already keys all of its state by `[workspaceId, rootId]`
  (`FileTree.tsx:102–116`), so it slots in unchanged.
- Editor tabs continue to be flat strings. Because each root has a unique
  prefix (`/<rootId>/...`), tabs from different roots can coexist in the
  editor without collision. `EditorPanel`'s tab labelling derives the basename
  + grand-parent folder, which is already root-agnostic.
- Persisted editor state (`editor-state/<workspaceId>.json`) needs no schema
  change — it stores opaque virtual paths, which are now multi-root by
  construction.

### Container integration

When a root is added via `workspace.addRoot`, the workspace manager
**implicitly** adds the host path to `config.mounts` (the existing
container-mount mechanism in `mounts.ts`). Removing a root removes the mount.
This means:

- In container mode, the bind-mount inside `sero-<workspaceId>` exposes the
  root's host path at the **same host absolute path** inside the container, so
  the agent's tools (`tools-coding.ts`, terminals, etc.) see the same files
  whether you call them from the editor or via the agent.
- `workspace-container-config.ts` already collects mounts and de-duplicates
  them against the primary `hostPath`, so no changes needed there.
- For roots created in container mode, we need a virtual-path-to-container-path
  mapping in `containerManager.readFile` / `listFiles` /
  `writeFile`. Today they assume `/workspace` is the container root. The fix:
  before exec'ing inside the container, translate `/<rootId>/rest` →
  `<host.path>/rest` (since the mount preserves the host path), then exec
  using that absolute path. `tools-coding.ts:338,427` already work in
  absolute paths, so the change is localised to the
  `read/write/listContainerFiles` helpers in `features/container/index.ts`
  and the `container/files.ts` helpers they delegate to.

### Plugin Manager integration

In `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx`:

- New action button: **"Link local plugin"**. Opens the native folder picker.
- On select:
  1. Validate that the chosen folder contains `package.json` with a
     `sero.app` field (use the existing plugin discovery validator from
     `electron/features/apps/discovery/index.ts`).
  2. Call `window.sero.workspace.addRoot(activeWorkspaceId, { name:
     packageJson.name, path: chosen, kind: 'linked-plugin' })`.
  3. Call the existing `registerAppPath(chosen)` so the plugin loads in the
     sidebar like any other plugin.
- New section: **"Linked plugins"** above "Installed plugins". Lists every
  workspace root with `kind: 'linked-plugin'`. Each row:
  - Plugin name + path
  - "Open in explorer" button (sets active workspace + scrolls explorer to that
    root)
  - "Unlink" button (calls `workspace.removeRoot` + `unregisterAppPath`)
  - "Linked" badge in the regular installed-plugins list when an installed
    plugin and a linked root point at the same path.

### Discovery: monorepo dev mode

For Sero developers (the original use case), a one-time helper:

- On app start, if `process.env.SERO_DEV_ROOT` is set **or** Electron's
  `app.getAppPath()` walks up to a `pnpm-workspace.yaml` containing a
  `sero` member, the admin plugin shows a banner: *"Detected Sero monorepo at
  /home/user/sero. [Link it as a workspace root]"*.
- One click attaches it to the current workspace as a `kind: 'linked-plugin'`
  root with `name: 'Sero source'`.

This makes the dogfooding loop a single click, while leaving manual linking
(folder picker) as the general mechanism.

## Files to change

| File                                                                        | Change                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/types/ipc.ts`                                             | Add `WorkspaceRoot`, extend `WorkspaceConfig.roots`, extend `WorkspaceInfo.roots`, extend `IpcChannels.workspace.*` and `editor.*`. |
| `apps/desktop/electron/features/workspace/manager.ts`                       | `getRoots / addRoot / removeRoot / renameRoot`. Persist via `persistConfig`. Dedup `path` collisions with the primary root.         |
| `apps/desktop/electron/features/workspace/mounts.ts`                        | `addRoot` should reuse `addMount` to keep container parity. Document the relationship.                                              |
| `apps/desktop/electron/ipc/workspace/workspace.ts`                          | New IPC handlers for `listRoots / addRoot / removeRoot / renameRoot`.                                                               |
| `apps/desktop/electron/ipc/editor/editor.ts`                                | Refactor `toHostPath` to take a `workspaceId` and resolve the root by prefix. Add `editor.getRoots` handler.                        |
| `apps/desktop/electron/preload/api/workspace.ts` (and `editor.ts`)          | Bridge new IPC.                                                                                                                     |
| `apps/desktop/electron/features/container/files.ts` (or equivalent)        | Translate `/<rootId>/...` virtual paths to mount-preserved host paths before container exec.                                        |
| `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx`           | Fetch roots, pass to sidebar.                                                                                                       |
| `apps/desktop/src/components/apps/explorer/ExplorerSidebar.tsx`             | Render N file trees with collapsible headers.                                                                                       |
| `apps/desktop/src/components/apps/explorer/file-tree/FileTree.tsx`         | No code change required (already keyed by rootId), but verify path handlers handle non-`/workspace` prefixes.                       |
| `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` (+ hooks)        | "Link local plugin" UI, "Linked plugins" section, badges.                                                                           |
| `plugins/sero-admin-plugin/extension/...`                                   | Pi tool: `link_plugin_path` so the agent can also link plugins by path.                                                             |
| `docs/decisions.md`                                                         | New AD: "Multi-root workspaces".                                                                                                    |
| `docs/plugins/guide.md`                                                     | New section: "Develop your plugin from inside Sero".                                                                                |
| `docs/features/multi-root-workspaces.md`                                    | User-facing reference doc.                                                                                                          |

Estimated touched files: ~14. Each remains well under 500 LOC.

## Migration & backwards compatibility

- Existing workspaces have no `roots` field. The manager treats this as
  "primary root only", so behaviour is unchanged.
- `editor.getRootPath` continues to return `/workspace` for the primary root.
  Renderer code that hasn't been migrated to `getRoots` still works.
- Virtual paths without a recognised root prefix (legacy `/workspace/...` and
  bare relative paths) fall through to the primary root in `toHostPath`.
- `config.mounts` continues to work for "container-only" mounts (no explorer
  visibility). `roots` is the superset for renderer + container.

## Security review

`toHostPath` keeps the same defenses, just per-root:

- Null-byte rejection.
- 4096-char path-length cap.
- `path.resolve` + prefix check against `<root.path>`.
- `realpathSync` symlink-escape check against `<root.path>`.

A virtual path can never resolve to a file outside the matching root.
Cross-root traversal (`/sero-source/../my-plugin/foo`) is **rejected**: after
slicing the prefix, the remaining path is joined with the matching root only,
so `..` segments can't reach a sibling root. Verified by adding tests in
`apps/desktop/electron/__tests__/editor-toHostPath.test.ts`.

Linked plugin folders are validated to contain a `sero.app` `package.json`
before they can be linked, to avoid accidental linking of arbitrary disk
locations via the plugin button (the manual `addRoot` IPC has no such
restriction; it's just folder selection).

## Testing strategy

1. **Unit**: `toHostPath` with multiple roots + traversal/symlink/escape cases.
2. **Unit**: `WorkspaceManager.addRoot` dedup, name uniqueness, mount sync.
3. **Integration**: `editor.listFiles` against a workspace with two roots
   returns each root's children at `/<rootId>/`.
4. **Integration**: container mode — write to `/sero-source/foo.txt`,
   read it back via host fs at the resolved host path.
5. **Manual**: Link the Sero monorepo into the global workspace, edit
   `apps/desktop/src/main.tsx`, watch HMR pick it up via `pnpm dev`.
6. **Manual**: Link a plugin via the Plugin Manager button, edit its source,
   confirm hot-reload via the existing module-federation dev server.

## Rollout

Single PR, gated behind no flag — the feature is purely additive at the data
model level. Feature lands in three logical commits:

1. Core: types + manager + IPC + `toHostPath` refactor + tests.
2. Renderer: `ExplorerWorkspace` / `ExplorerSidebar` multi-root rendering.
3. UX: Plugin Manager link button, monorepo auto-detect banner, docs.

After merge:

- Update `docs/plugins/guide.md` quickstart to recommend "Link local plugin"
  as the dev workflow.
- Mention in the next release notes; record as an AD.

## Open questions

1. **Editor state per root** — should we store editor tab order per root, or
   globally per workspace as today? Recommendation: keep global (current
   behaviour), since virtual paths already encode the root.
2. **JJ / VCS watching across roots** — `useVcsStore.watchWorkspace` watches
   the primary root only. For v1, do we extend it to watch all roots, or
   leave VCS as a primary-root-only feature? Recommendation: primary only for
   v1, with a follow-up issue.
3. **Search across roots** — the existing search panel scopes to the primary
   root. v1 leaves search primary-only; multi-root search is a follow-up.
4. **Per-root `.gitignore` / exclude globs** — currently
   `WorkspaceConfig.exclude` is workspace-wide. For v1, applied uniformly to
   all roots. Per-root excludes can come later if needed.

## Why this is the right design

- **Grokkable**: Every dev knows VS Code multi-root workspaces. The mental
  model is identical.
- **Scales**: N roots, no special-case "plugin mode". Plugin Manager linking
  is a thin UX layer over the same primitive.
- **Production ready**: Reuses the existing path-sandbox, container-mount, and
  plugin-discovery primitives. No new security surface, no parallel storage,
  no shadow workspace concept.
- **Transparent**: The agent and the editor see the same files at the same
  paths. The user's edits in the explorer and the agent's edits via Pi tools
  converge on the same bytes on disk.
- **Reversible**: Linking is non-destructive. Unlinking removes the root from
  the explorer + container without touching the user's source tree.
