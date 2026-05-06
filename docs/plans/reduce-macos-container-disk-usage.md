# Reduce macOS Container Disk Usage

## Problem

Each container-backed workspace currently creates an independent macOS container. In practice, this can consume more than 1GB per workspace container, which adds up quickly as users open or retain multiple workspaces.

The current model maps one workspace to one named Apple container, `sero-<workspaceId>`. The workspace path is bind-mounted from the host at `/workspace`, so the durable project files are not the main issue. The likely source of growth is each container's writable root filesystem, installed runtime state, and repeated caches.

## Goals

- Reduce per-workspace disk overhead.
- Keep container-backed workspaces fast to start.
- Preserve workspace isolation for normal development workflows.
- Make containers disposable wherever possible.
- Avoid deleting user project state.

## Non-goals

- Treating containers as a hardened multi-tenant security boundary.
- Removing container-backed workflows entirely.
- Replacing the Apple `container` runtime in this plan.

## Recommended approach

### 1. Add idle cleanup and retained-container limits

This is the fastest improvement and should be implemented first.

Add a cleanup policy for Sero-managed containers:

```text
running but idle too long -> stop
stopped too long -> delete --force
over retained-container cap -> delete least recently used
```

Suggested defaults:

```ts
const MAX_STOPPED_CONTAINERS = 3;
const STOPPED_TTL_MS = 24 * 60 * 60 * 1000;
const IDLE_RUNNING_TTL_MS = 30 * 60 * 1000;
```

Persist `lastUsedAt` per container or workspace so cleanup does not depend only on `container list` output.

Add a manual user-facing action:

```text
Settings -> Containers -> Reclaim disk
```

The reclaim action should:

- stop idle running Sero containers,
- delete stopped Sero containers,
- optionally prune unused Sero-tagged images,
- show estimated reclaimed space where possible.

Be conservative: only touch containers and images owned by Sero.

### 2. Make workspace containers disposable

Because the workspace is already mounted from the host at `/workspace`, containers should not be treated as authoritative durable state.

Principle:

```text
Anything valuable lives on host mounts.
Anything inside the container root can be thrown away.
```

This makes aggressive cleanup safe and keeps workspace data separate from runtime state.

### 3. Move repeated mutable state into shared host caches

Mount package-manager and tool caches from shared host directories instead of allowing each container rootfs to grow independently.

Suggested mounts:

```text
~/.cache/sero/containers/npm              -> /root/.npm
~/.cache/sero/containers/pnpm             -> /root/.local/share/pnpm/store
~/.cache/sero/containers/pip              -> /root/.cache/pip
~/.cache/sero/containers/ms-playwright    -> /ms-playwright or equivalent
```

Benefits:

- avoids repeated dependency downloads,
- reduces writable-layer growth per container,
- improves cold-start performance for common package installs.

Use caution with shared caches across projects. They should contain cache data only, not workspace secrets or project-specific source files.

### 4. Split the default image into core and browser variants

The current default image installs general development tools plus browser automation dependencies. Browser tooling, especially Playwright browser assets, is likely a large contributor to image size.

Create two images:

```text
ghcr.io/sero-labs/sero-node:latest
ghcr.io/sero-labs/sero-node-browser:latest
```

The core image should include common coding tools:

- Node,
- pnpm,
- git and gh,
- Python,
- ripgrep, fd, jq,
- networking and process debugging tools.

The browser image should extend the core image and add:

- agent-browser,
- Playwright Chromium,
- ffmpeg,
- browser runtime dependencies.

Use the browser image only when browser automation is requested. Most coding workspaces should start on the smaller core image.

### 5. Avoid dirtying container roots during setup

Container creation currently performs setup inside the container, such as writing shell profile defaults, DNS fallback, git initialization, and git config. These writes dirty each container's writable layer.

Move stable defaults into the image or pass them at runtime where possible.

Examples:

- pass environment variables through `container exec --env`,
- invoke shells with explicit environment instead of mutating `/root/.bashrc`,
- mount selected git configuration where appropriate,
- use `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*`, and `GIT_CONFIG_VALUE_*` for trusted git commands when possible.

Small writes are not the biggest issue, but reducing them reinforces the disposable-container model.

### 6. Introduce an ephemeral warm-container pool

Longer term, replace strict one-workspace-one-container ownership with a small pool of disposable warm containers.

Current model:

```text
workspaceId -> sero-<workspaceId>
```

Target model:

```text
workspace action starts
  -> lease warm container from pool
  -> mount or attach workspace
  -> run terminal/tool/dev-server
  -> release, reset, or destroy container
```

Sketch:

```ts
interface ContainerLease {
  leaseId: string;
  containerId: string;
  workspaceId: string;
  hostPath: string;
  acquiredAt: number;
  lastUsedAt: number;
}
```

For short-lived agent tasks, use a temporary container and delete it after the task. For interactive terminals and dev servers, keep the lease alive while the workspace is active, then release it when idle.

A practical pool policy:

```text
max active containers: configurable, based on memory/disk
max warm idle containers: 1 or 2
idle warm container TTL: 15-30 minutes
```

This is the largest architectural change, but likely the biggest long-term disk improvement.

## Phased implementation plan

### Phase 1: Immediate cleanup controls

- Add container metadata persistence with `lastUsedAt`.
- Add idle/stopped cleanup policy.
- Add manual "Reclaim disk" action.
- Add tests for cleanup selection logic.

### Phase 2: Shared caches

- Add host cache directory management.
- Mount npm, pnpm, pip, and browser caches into containers.
- Ensure cache directories are created with safe permissions.
- Add docs explaining what is shared and what is not.

### Phase 3: Smaller default image

- Split the image into core and browser variants.
- Update image selection logic.
- Pull the browser image lazily when browser automation is needed.
- Keep the existing full image path supported during migration if needed.

### Phase 4: Disposable container pool

- Introduce `ContainerLease` and pool management.
- Change workspace execution to acquire/release leases.
- Add reset logic between workspace assignments.
- Keep per-workspace persistent containers as a fallback until pool behavior is stable.

## Expected impact

Highest disk savings:

1. Disposable or pooled containers with automatic cleanup.
2. Smaller default image without browser assets.
3. Shared host caches for package managers and browser tooling.

Highest near-term value:

1. TTL cleanup for stopped containers.
2. Manual reclaim-disk action.
3. Shared cache mounts.

## Open questions

- Does Apple `container` support the mount lifecycle needed for true container reuse, or do we need to recreate containers when changing workspace mounts?
- Can we estimate per-container disk usage accurately enough for the UI?
- Which browser automation workflows require browser assets immediately at workspace startup?
- Should shared caches be global, per-user, or scoped by Sero version/image digest?
