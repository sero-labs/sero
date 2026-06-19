# Workspace access roots for plugin repo context

Date: 2026-06-10

## Goal

Expose a canonical, bounded list of folders that an agent/plugin session is allowed to inspect so plugins such as Sero Factory can improve repo-context discovery beyond the primary workspace root.

The motivating plugin is `@sero-factory-plugin/`, especially:

- `/Users/danielcarter/.sero-ui/workspaces/gstackplugin/sero-factory-plugin/extension/repoContext.ts`
- It currently derives likely relevant files by walking only the detected repo root from the current cwd.
- It cannot reliably scan linked plugin folders, arbitrary folder mounts, or referenced workspaces unless the user explicitly tells the agent/plugin the absolute path.

This should be implemented in the Sero app repo, not inside the current plugin workspace.

## Problem statement

Sero can attach extra folders to a workspace and make them available to the runtime:

- workspace references
- arbitrary folder mounts
- additional roots
- linked plugin roots from `sero workspace mount-plugin`

However, agent/plugin code does not have a clean semantic way to ask:

> “Which folders can this session access, and what are their runtime paths?”

In container mode, the primary workspace is mounted at `/workspace`; additional writable roots are currently mounted at identity paths (their host absolute paths, or `/mnt/<drive>/...` on Windows/Docker). If a plugin already knows that path, it can access it. But it is not surfaced in the agent context or plugin runtime API in a reliable machine-readable way.

In host mode there is no container boundary, so any process could technically read lots of host files. **Do not expose or infer the whole host filesystem.** The API must return only Sero-declared workspace access roots, not every readable path.

## Relevant existing code

### Mount/plugin root creation

Plugin folders are attached as additional roots with `kind: 'linked-plugin'`:

- `apps/desktop/electron/cli/commands/workspace/workspace.ts`
  - `handleMountPlugin(...)`
  - validates with `assertIsSeroPluginFolder(resolved)`
  - calls:

```ts
await workspaceManager.addRoot(wsId, {
  name: displayName,
  path: resolved,
  kind: 'linked-plugin',
});
await recreateContainerIfRunning(wsId);
```

- `apps/desktop/electron/ipc/workspace/workspace.ts`
  - `IpcChannels.workspace.addRoot`
  - validates `input.kind === 'linked-plugin'`
  - calls `workspaceManager.addRoot(...)`
  - calls `recreateContainerIfRunning(id)`

### Workspace config/storage APIs

- `apps/desktop/electron/features/workspace/manager.ts`
  - delegates references/mounts/roots:
    - `getReferences(id)`
    - `getMounts(id)`
    - `getRoots(id)`
    - `addRoot(...)`
    - `removeRoot(...)`

- `apps/desktop/electron/features/workspace/mounts.ts`
  - `getReferences`, `addReference`, `removeReference`
  - `getMounts`, `addMount`, `removeMount`

- `apps/desktop/electron/features/workspace/roots.ts`
  - roots are stored separately from `config.mounts`
  - comments explicitly say container parity is handled at container build time

- `apps/desktop/src/types/ipc.ts` / `packages/common/src/admin-bridge.ts`
  - `WorkspaceInfo` already has `references`, `mounts`, `roots`
  - `SeroWorkspaceBridge` currently exposes `listRoots`, `addRoot`, `removeRoot`, `renameRoot`, but not references/mounts or a combined access-root API.

### Container config and runtime paths

- `apps/desktop/electron/features/container/core/workspace-container-config.ts`
  - `buildWorkspaceContainerConfig(...)`
  - builds `writableMounts` from:
    - referenced workspace paths
    - `workspaceManager.getMounts(workspaceId)`
    - `workspaceManager.getRoots(workspaceId)`
  - skips primary workspace root when candidate resolves to hostPath

- Apple Container runtime:
  - `apps/desktop/electron/features/container/core/lifecycle.ts`
  - primary root: `${config.hostPath}:${WORKSPACE_MOUNT}` where `WORKSPACE_MOUNT = '/workspace'`
  - writable mounts: `--volume ${hostDir}:${hostDir}`
  - read-only mounts: `--volume ${hostDir}:${hostDir}:ro`

- Docker runtime:
  - `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-mounts.ts`
  - `buildDockerMounts(config)`
  - primary root target: `/workspace`
  - writable mounts target: `toRuntimeIdentityMountPath(hostPath)`
  - read-only mounts target: `toRuntimeIdentityMountPath(hostPath)` and `readonly: true`
  - explicit bind mounts use explicit target

- Runtime path helpers:
  - `apps/desktop/electron/features/workspace/runtime/runtime-paths.ts`
  - `RUNTIME_WORKSPACE_PATH = '/workspace'`
  - `toRuntimeIdentityMountPath(hostPath)`
    - POSIX host paths keep identity path, with backslashes normalized
    - Windows `D:\projects\x` maps to `/mnt/d/projects/x`

### Agent prompt/context today

- `apps/desktop/electron/features/container/tools/system-prompt.ts`
  - says other open workspaces are mounted at original host paths
  - suggests `sero-cli workspace list` to discover workspace paths
  - does **not** enumerate arbitrary mounts, roots, or linked plugin roots.

- `apps/desktop/electron/features/apps/extensions/create-sero-extension.ts`
  - `/workspace info` currently shows workspace name/path/description/tags but not references/mounts/roots.

- `apps/desktop/electron/cli/commands/workspace/workspace.ts`
  - `workspace info` currently shows name/path/runtime backend, description, context hints, tags.
  - It does not show roots/mounts/references and does not appear to have JSON output for this data.

### Plugin runtime APIs today

- `packages/app-runtime/src/use-app-info.ts`
  - exposes only `appId`, `workspaceId`, `workspacePath`.

- `packages/common/src/app-runtime-background.ts`
  - `AppRuntimeWorkspaceApi` currently has:
    - `runCommand(...)`
    - `refreshAfterSync(...)`
    - `resolveRuntime(...)`
  - no roots/mounts/references/access-roots API.

- `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
  - creates the background runtime host implementation.
  - This is where a new `ctx.host.workspace.listAccessRoots(...)` implementation likely belongs.

## Proposed design

Add a single canonical data model for “workspace access roots”. It should include only explicit Sero-declared roots/mounts/references plus the primary workspace root.

Suggested shape:

```ts
export type WorkspaceAccessRootKind =
  | 'primary'
  | 'workspace-reference'
  | 'folder-mount'
  | 'additional-root'
  | 'linked-plugin';

export interface WorkspaceAccessRoot {
  id: string;
  name: string;
  kind: WorkspaceAccessRootKind;
  hostPath: string;
  runtimePath: string;
  writable: boolean;
  source?: {
    workspaceId?: string;
    rootId?: string;
  };
}

export interface WorkspaceAccessRootsResult {
  workspaceId: string;
  runtime: {
    backend: 'host' | 'docker' | 'apple-container';
    mode: 'host' | 'container';
  };
  roots: WorkspaceAccessRoot[];
  warnings: string[];
}
```

Runtime path rules:

- Primary workspace:
  - container runtime path: `/workspace`
  - host runtime path: host workspace path, or still expose `runtimePath` as host path and document `mode: 'host'`
- Additional roots / mounts / references:
  - container runtime path: `toRuntimeIdentityMountPath(hostPath)`
  - host runtime path: host path
- Do not include read-only internal Sero mounts like skills/prompts/Pi docs unless a future API explicitly asks for internal runtime mounts. This feature is for user/workspace access roots.

Safety rule:

- In host mode, return the same bounded Sero-declared roots only:
  - primary workspace root
  - configured references
  - configured `mounts`
  - configured `roots`
- Never “discover all readable host directories”.
- Never expand to parent directories beyond explicitly configured paths.
- Consider dropping/flagging roots that no longer exist.
- Consider deduping by resolved host path.

## Implementation plan

### Step 1 — Add a shared access-root resolver

Create something like:

- `apps/desktop/electron/features/workspace/access-roots.ts`

Responsibilities:

- Input: `workspaceManager`, `workspaceId`, runtime backend/mode if needed.
- Resolve primary workspace path via `workspaceManager.getPath(workspaceId)`.
- Resolve references:
  - `workspaceManager.getReferences(workspaceId)` returns IDs.
  - Convert each ID to path via `workspaceManager.getPath(refId)`.
- Resolve arbitrary mounts:
  - `workspaceManager.getMounts(workspaceId)`.
- Resolve additional roots:
  - `workspaceManager.getRoots(workspaceId)`.
  - Preserve `kind: 'linked-plugin'` when set.
- Map host paths to runtime paths:
  - primary => `/workspace` in container mode
  - non-primary => `toRuntimeIdentityMountPath(hostPath)` in container mode
  - host mode => host path
- Deduplicate.
- Return warnings for missing paths, stale references, duplicates, or paths skipped.

Potential helper signature:

```ts
export async function listWorkspaceAccessRoots(
  mgr: WorkspaceManager,
  workspaceId: string,
  options?: { backend?: RuntimeBackendId; actualRuntime?: 'host' | 'container' },
): Promise<WorkspaceAccessRootsResult>
```

Use `resolveWorkspaceRuntime(workspaceId)` or `workspaceManager.getRuntimeConfig(workspaceId)` as appropriate. The important bit is not to include filesystem discovery in host mode.

### Step 2 — Expose it to CLI / agent command

Add one of these:

- `sero workspace access-roots --json`
- or `sero workspace mounts --json`
- or `sero workspace info --json` with an `accessRoots` field

Recommendation: add a dedicated command first. Human text output can be short; JSON should be stable for plugins.

Example:

```bash
sero workspace access-roots --json
```

Expected JSON:

```json
{
  "workspaceId": "gstackplugin",
  "runtime": { "backend": "apple-container", "mode": "container" },
  "roots": [
    {
      "id": "workspace",
      "name": "gstackplugin",
      "kind": "primary",
      "hostPath": "/Users/danielcarter/.sero-ui/workspaces/gstackplugin",
      "runtimePath": "/workspace",
      "writable": true
    },
    {
      "id": "sero-factory-plugin",
      "name": "sero-factory-plugin",
      "kind": "linked-plugin",
      "hostPath": "/Users/danielcarter/.sero-ui/workspaces/gstackplugin/sero-factory-plugin",
      "runtimePath": "/Users/danielcarter/.sero-ui/workspaces/gstackplugin/sero-factory-plugin",
      "writable": true,
      "source": { "rootId": "sero-factory-plugin" }
    }
  ],
  "warnings": []
}
```

Also update `/workspace info` in `create-sero-extension.ts` to include a concise list of roots/mounts/references for agent visibility. Avoid dumping huge lists. For text mode, maybe show counts and paths:

```md
**Access roots:**
- workspace: /workspace
- linked-plugin sero-factory-plugin: /Users/.../sero-factory-plugin
- folder-mount: /Users/.../shared-data
```

### Step 3 — Expose it to plugin background runtimes

Add to `packages/common/src/app-runtime-background.ts`:

```ts
export interface AppRuntimeWorkspaceApi {
  // existing methods...
  listAccessRoots(workspaceId: string): Promise<WorkspaceAccessRootsResult>;
}
```

Add exported types in `packages/common/src/index.ts`.

Implement in:

- `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`

```ts
workspace: {
  // existing methods...
  listAccessRoots: (workspaceId) => listWorkspaceAccessRoots(workspaceManager, workspaceId, ...),
}
```

Also consider exposing a renderer/preload bridge for UI plugins if needed. `window.sero.workspace.listRoots(workspaceId)` already exists, but it does not give references/mounts nor runtime path mapping. A new `window.sero.workspace.listAccessRoots(workspaceId)` would be cleaner if app UIs need it.

### Step 4 — Update Factory repo context to use it

In a later plugin change, update:

- `sero-factory-plugin/extension/repoContext.ts`

Current behavior:

```ts
const repoRoot = await detectRepoRoot(cwd);
const tree = await walkTree(repoRoot);
```

New behavior:

- Discover access roots from `sero workspace access-roots --json` if available.
- Fall back to current repo-root-only behavior if the command is unavailable.
- Scan a bounded set of roots:
  - primary workspace root
  - linked plugin roots
  - explicit folder mounts
  - referenced workspaces if relevant
- Preserve safety filters:
  - existing ignored directories (`node_modules`, `.git`, `.sero`, build dirs, etc.)
  - secret/binary filters
- Add stricter caps per root:
  - max files per root
  - max total files
  - max depth maybe
  - skip unreadable paths with context gap entries
- Return provenance in relevant paths, e.g.
  - `workspace:src/App.tsx`
  - `linked-plugin:sero-factory-plugin/extension/repoContext.ts`
  - `folder-mount:/Users/.../shared/foo.ts`

Do not let Factory scan arbitrary host parents in host mode. Only scan the roots returned by Sero’s access-root API.

## Tests to add/update

### Unit tests for access-root resolver

Add tests near existing workspace/container tests, e.g.:

- `apps/desktop/electron/__tests__/features/workspace/access-roots.test.ts`

Cases:

1. Primary-only workspace in container mode returns exactly one root:
   - kind `primary`
   - host path = workspace path
   - runtime path = `/workspace`

2. References, mounts, and roots are included:
   - reference kind `workspace-reference`
   - mount kind `folder-mount`
   - root kind `additional-root` or `linked-plugin`

3. Linked plugin root preserves `kind: 'linked-plugin'`.

4. Host mode still returns only configured roots, not parent dirs or arbitrary host folders.

5. Dedupe by resolved host path.

6. Windows path mapping uses `/mnt/<drive>/...` in Docker/container mode via `toRuntimeIdentityMountPath`.

7. Missing/stale paths produce warnings and are either skipped or included with a clear flag. Prefer skipping missing paths for scan safety.

### CLI tests

Update/add tests around:

- `apps/desktop/electron/__tests__/cli/workspace-mount-plugin.test.ts`
- or new `workspace-access-roots.test.ts`

Verify:

- `workspace access-roots --json` emits valid JSON.
- Includes linked plugin mounted via `mount-plugin`.
- Does not include unconfigured host directories.

### Runtime API tests

Update app runtime tests around:

- `apps/desktop/electron/__tests__/features/apps/runtime/...`

Verify `ctx.host.workspace.listAccessRoots(workspaceId)` calls the shared resolver and returns the expected bounded list.

### Prompt/command tests

If `/workspace info` is updated, add tests for:

- access roots included in text output
- output remains concise
- no huge filesystem enumeration

## Open questions / decisions

1. Should the new command be `workspace access-roots`, `workspace mounts`, or `workspace info --json`?
   - Recommended: `workspace access-roots --json` for precise semantics, then optionally add `info --json` later.

2. Should missing paths be skipped or included with `exists: false`?
   - Recommended for agent scanning: skip by default and add a warning, to avoid producing paths that tools cannot read.

3. Should internal read-only mounts be included?
   - Recommended: no. Keep this API focused on user/workspace access roots. Internal mounts can be a separate diagnostic API.

4. Should references be expanded to workspace names and IDs?
   - Recommended: yes. References are semantic and useful for agents.

5. Should plugin UI hooks expose this in `@sero-ai/app-runtime`?
   - Background runtime definitely needs `ctx.host.workspace.listAccessRoots`.
   - UI can either use a new preload bridge or continue using existing workspace APIs. Prefer a new unified bridge if a UI needs runtime path mapping.

## Non-goals

- Do not grant new access. This only reports access Sero already configured.
- Do not enumerate the host filesystem in host mode.
- Do not include secrets or files; this API only returns roots/directories.
- Do not make linked plugins automatically active. `mount-plugin` remains visibility/editability only.
- Do not replace existing `roots`, `mounts`, or `references` config fields.

## Why this helps Factory

Factory’s `repoContext.ts` can stop guessing whether Sero/plugin context exists and instead ask Sero for the exact bounded set of accessible roots. That lets it find relevant files in mounted plugin folders and referenced workspaces while staying safe and deterministic.
