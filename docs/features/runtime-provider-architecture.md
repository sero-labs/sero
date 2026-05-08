# Runtime provider architecture

Status: canonical implementation plan.

This document is the single source of truth for Sero runtime-provider work. It supersedes the exploratory OpenShell runtime work from PR #175 / `feat/openshell-runtime-backend`.

The OpenShell branch should be treated as a spike and parts bin, not as the final architecture. Useful research, tests, and small implementation ideas may be cherry-picked only when they satisfy this plan.

## 1. Goal

Sero should support multiple workspace execution backends through one runtime abstraction, with full parity for normal Sero workflows where the backend can provide equivalent semantics.

Target parity runtimes:

```text
Sero workspace
  -> Host runtime
  -> Apple Container runtime
  -> Docker runtime
  -> future live-mounted container runtimes
```

OpenShell remains a candidate only if it can provide the required runtime semantics. If OpenShell only supports upload/download workspace sync, it must be treated as an explicit-sync sandbox runtime, not as an Apple/Docker parity runtime.

## 2. Non-negotiable architecture rules

### 2.1 Parity container runtimes require live workspace access

A runtime can be considered Apple Container parity only if the workspace is available as a live runtime filesystem:

```text
host workspace <-> runtime /workspace
```

Examples:

- Apple Container bind mount: acceptable.
- Docker bind mount: acceptable.
- Per-command upload/download: not acceptable for parity.

Per-command sync is allowed only for explicit-sync runtimes and must be surfaced as a different capability class.

### 2.2 Runtime tools must be backend-generic

Agent-visible tools must not branch into separate host/container/OpenShell implementations. The coding tools should call a runtime interface:

```text
bash  -> runtime.exec(...)
read  -> runtime.readFile(...)
write -> runtime.writeFile(...)
edit  -> runtime.editFile(...) or runtime read/write primitives
```

Backend-specific behavior belongs inside runtime providers.

### 2.3 No silent host fallback for selected container runtimes

If a workspace is configured for Apple Container, Docker, or another selected container runtime and that runtime is unavailable, Sero must show an actionable runtime error.

Host fallback is allowed only for explicit legacy compatibility paths where it already exists and the UI/tool result makes that fallback clear.

### 2.4 One abstraction must cover the normal workspace loop

The runtime boundary must cover more than command execution:

- agent `bash`, `read`, `write`, `edit`
- editor file read/write/list/rename/delete/create
- interactive terminals
- managed dev-server start/stop/restart
- preview URL / port handling
- logs
- health diagnostics
- cleanup/destroy
- browser/LSP capability reporting

### 2.5 Sync is not exec

`runtime.exec()` must execute a command. It must not implicitly perform whole-workspace upload/download as normal behavior.

If a backend needs sync, model that as a separate workspace-access strategy and expose its limitations explicitly.

## 3. Runtime model

### 3.1 Provider IDs

Initial provider IDs:

```ts
export type RuntimeProviderId =
  | "host"
  | "apple-container"
  | "docker";
```

Candidate/future provider IDs:

```ts
export type FutureRuntimeProviderId =
  | "openshell-local"
  | "openshell-remote"
  | "openshell-cloud";
```

Do not add OpenShell as a parity provider until Phase 5 decides whether it can satisfy live workspace semantics.

### 3.2 Workspace access model

```ts
export type RuntimeWorkspaceAccess =
  | "host"
  | "live-mount"
  | "explicit-sync";
```

Definitions:

- `host`: commands and files operate directly on the host workspace.
- `live-mount`: runtime sees the host workspace live at `/workspace` or equivalent.
- `explicit-sync`: runtime has a copied workspace; sync is explicit and not equivalent to live mount.

Only `live-mount` container runtimes can claim Apple Container parity.

### 3.3 Runtime capabilities

Capabilities should describe real available behavior, not intended future behavior.

```ts
export interface RuntimeCapabilities {
  exec: boolean;
  files: {
    read: boolean;
    write: boolean;
    edit: boolean;
    list: boolean;
    mutateTree: boolean;
  };
  terminal: boolean;
  devServers: {
    start: boolean;
    stop: boolean;
    restart: boolean;
    status: boolean;
  };
  ports: {
    discover: boolean;
    forward: boolean;
    stopForward: boolean;
  };
  logs: boolean;
  browserAutomation: boolean;
  languageServers: boolean;
}
```

### 3.4 Runtime interface

Exact TypeScript names may change during implementation, but the final abstraction must cover this shape:

```ts
export interface WorkspaceRuntime {
  providerId: RuntimeProviderId;
  workspaceId: string;
  hostWorkspacePath: string;
  runtimeWorkspacePath: string;
  workspaceAccess: RuntimeWorkspaceAccess;
  capabilities: RuntimeCapabilities;

  health(): Promise<RuntimeHealth>;
  ensure(): Promise<RuntimeSession>;

  exec(input: RuntimeExecInput): Promise<RuntimeExecResult>;

  readFile(input: RuntimeReadFileInput): Promise<RuntimeFileReadResult>;
  writeFile(input: RuntimeWriteFileInput): Promise<void>;
  listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]>;
  rename(input: RuntimeRenameInput): Promise<void>;
  delete(input: RuntimeDeleteInput): Promise<void>;
  createFile(input: RuntimeCreateFileInput): Promise<void>;
  createDirectory(input: RuntimeCreateDirectoryInput): Promise<void>;

  createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession>;

  startDevServer(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer>;
  stopDevServer(input: RuntimeDevServerStopInput): Promise<void>;
  restartDevServer(input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer>;
  getDevServerStatus(input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus>;

  forwardPort(input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort>;
  stopForward(input: RuntimeStopForwardInput): Promise<void>;

  streamLogs?(input: RuntimeLogInput): AsyncIterable<RuntimeLogEvent>;
  destroy(): Promise<void>;
}
```

## 4. Provider responsibilities

### 4.1 Host provider

The Host provider executes directly on the host workspace.

Responsibilities:

- shell command execution with cwd validation
- file operations through Node filesystem APIs
- host PTY terminals
- host dev-server lifecycle where supported
- no container-specific browser/LSP claims unless implemented separately

### 4.2 Apple Container provider

The Apple Container provider wraps the existing `ContainerManager` behavior behind the runtime interface.

Responsibilities:

- ensure Apple container availability
- live mount workspace to runtime `/workspace`
- preserve existing image and lifecycle behavior
- `container exec` command execution
- `container exec -it` terminal
- file operations through runtime interface
- managed dev-server lifecycle through runtime interface
- port discovery / preview behavior through runtime interface
- browser/LSP capabilities where currently supported

`ContainerManager` should become an implementation detail of this provider for normal workspace operations.

### 4.3 Docker provider

The Docker provider is the primary cross-platform live-mounted container runtime.

Responsibilities:

- detect Docker CLI and daemon
- create/reuse Sero workspace container
- live mount host workspace to `/workspace`
- live mount required Sero agent resources when needed
- inject equivalent environment defaults to Apple Container
- execute commands with `docker exec`
- create interactive terminals with `docker exec -it`
- implement file operations through the runtime interface
- implement dev-server start/stop/restart through runtime interface
- implement port mapping/discovery or equivalent preview URLs
- support Linux and macOS Docker Desktop first; Windows/WSL after smoke testing
- provide clear diagnostics for Docker missing/stopped/permission errors

Acceptance for Docker requires parity with Apple Container for normal Sero workflows, not just successful `bash` execution.

### 4.4 OpenShell candidate provider

OpenShell is not a parity provider unless it can satisfy live workspace semantics.

OpenShell decision outcomes:

1. If OpenShell can live-mount a host workspace into the sandbox, implement it as a parity candidate provider.
2. If OpenShell only supports upload/download, keep it as an explicit-sync sandbox runtime with different UX and limitations.
3. If OpenShell cannot support required terminal/dev-server/file semantics, do not present it as equivalent to Apple/Docker containers.

## 5. Phases

## Phase 0 — Reset and consolidate planning

Goal: remove ambiguity and make this document the implementation source of truth.

Responsibilities:

- Preserve `feat/openshell-runtime-backend` as `spike/openshell-runtime-backend`.
- Start implementation planning from `main`.
- Treat PR #175 as an exploratory spike.
- Do not merge the push/pull OpenShell architecture as the final runtime solution.
- Use this document as the canonical plan.

Acceptance criteria:

- This document exists on a clean branch from `main`.
- The spike branch is preserved.
- Team agrees that per-command upload/download is not parity.

Current status: in progress.

## Phase 1 — Define the runtime contract

Goal: create the runtime interfaces and capability model without changing behavior.

Responsibilities:

- Add shared runtime provider types.
- Add `RuntimeWorkspaceAccess`.
- Add `WorkspaceRuntime` or equivalent interface.
- Add capability model covering commands, files, terminals, dev servers, ports, logs, browser, and LSP.
- Add runtime diagnostics types.
- Add tests for capability reporting and provider resolution.

Non-goals:

- No Docker provider yet.
- No OpenShell provider yet.
- No broad UI changes yet.

Acceptance criteria:

- Typecheck passes.
- Existing behavior is unchanged.
- The interface is broad enough to migrate existing host/container paths.

## Phase 2 — Rewrap Host and Apple Container providers

Goal: make existing behavior flow through the runtime abstraction.

Responsibilities:

- Implement Host provider.
- Implement Apple Container provider.
- Route agent `bash`, `read`, `write`, and `edit` through generic runtime-backed tools.
- Route editor file operations through runtime providers.
- Route terminal creation through runtime providers.
- Route managed dev-server start/stop/restart through runtime providers.
- Route port/preview handling through runtime providers where applicable.
- Preserve legacy workspace config compatibility with `container?: boolean`.
- Keep existing Apple Container behavior unchanged from the user perspective.

Non-goals:

- No Docker provider yet.
- No OpenShell provider yet.
- No removal of legacy IPC channel names unless necessary.

Acceptance criteria:

- Existing Host workspaces behave as before.
- Existing Apple Container workspaces behave as before.
- Agent tools do not branch by backend outside provider implementation.
- Editor/file-tree behavior matches current behavior.
- Dev-server start/stop/restart still works for Apple Container.
- No silent new host fallback is introduced.

## Phase 3 — Docker live-mount provider

Goal: add a Docker runtime that matches Apple Container workspace semantics.

Responsibilities:

- Add `docker` provider ID and workspace config support.
- Detect Docker CLI and daemon.
- Create/reuse one Sero Docker container per workspace.
- Mount host workspace live at `/workspace`.
- Mount required Sero read-only resources.
- Execute commands through Docker provider.
- Create interactive PTY terminals through Docker provider.
- Implement runtime file operations.
- Implement managed dev-server lifecycle.
- Implement preview URL / port handling.
- Add Docker diagnostics to environment/runtime doctor.
- Add Linux and macOS Docker Desktop smoke tests.

Non-goals:

- No OpenShell remote/cloud support.
- No Kubernetes or hosted container orchestration.
- No Windows/WSL claim until smoke tested.

Acceptance criteria:

- Docker `bash` reports Linux and runs under `/workspace`.
- A file written by the agent appears immediately on the host without explicit download.
- Host editor writes are visible to Docker commands without explicit upload.
- Docker interactive terminal opens inside `/workspace`.
- Managed dev server can start, preview, stop, and restart.
- No per-command workspace upload/download is used.
- Docker provider passes the same core runtime tool tests as Apple Container.

## Phase 4 — Runtime parity hardening

Goal: close gaps between Apple Container and Docker before adding more providers.

Responsibilities:

- Add a provider parity test matrix.
- Verify agent tools, editor operations, terminals, dev servers, previews, and diagnostics across Host, Apple Container, and Docker.
- Refactor remaining direct `containerManager` usage in normal workspace paths behind runtime providers.
- Document intentional capability differences.

Acceptance criteria:

- Apple Container and Docker have matching behavior for normal Sero workflows.
- Any remaining difference is represented as an explicit capability and visible diagnostic.
- No normal workspace path assumes only host/container boolean semantics.

## Phase 5 — OpenShell decision gate

Goal: decide whether OpenShell belongs in the parity runtime family or explicit-sync sandbox family.

Responsibilities:

- Verify current OpenShell CLI/API support for live host workspace mounting.
- Verify PTY terminal feasibility.
- Verify dev-server lifecycle and port forwarding semantics.
- Verify file/editor semantics without per-command full workspace sync.
- Record the decision in this document before implementation.

Acceptance criteria:

- A clear yes/no decision exists for OpenShell parity.
- If yes, implementation plan maps OpenShell to `workspaceAccess: "live-mount"`.
- If no, OpenShell is scoped as `workspaceAccess: "explicit-sync"` and is not marketed as Apple/Docker parity.

## Phase 6 — Optional OpenShell explicit-sync runtime

This phase only applies if Phase 5 determines OpenShell cannot provide live-mount parity but still has product value.

Goal: add OpenShell honestly as a sync-based isolated sandbox runtime.

Responsibilities:

- Expose explicit-sync workspace model in UI.
- Make sync actions explicit and observable.
- Avoid per-command full upload/download by default.
- Provide clear source-of-truth rules.
- Avoid claiming parity with Apple Container or Docker.

Acceptance criteria:

- User understands when host and sandbox may diverge.
- Sync operations are visible and recoverable.
- Runtime tool output identifies explicit-sync behavior.

## Phase 7 — Remote and cloud runtimes

Goal: extend runtime architecture to remote/cloud only after local parity is correct.

Candidate approaches:

- remote Docker over SSH/context
- hosted Docker-compatible runtime
- OpenShell remote/cloud if its semantics are acceptable

Responsibilities:

- Model latency, lifecycle, auth, and cleanup explicitly.
- Do not pretend remote sync equals local live mount.
- Keep provider capabilities honest.

Acceptance criteria:

- Remote/cloud limitations are visible in diagnostics and UI.
- No silent fallback to host.
- Runtime file/tool/dev-server semantics are tested against the declared workspace access model.

## 6. Migration rules

- Keep reading legacy `container?: boolean` during transition.
- Map legacy `container: true` to `apple-container`.
- Map legacy `container: false` to `host`.
- New workspace config should use provider-aware `runtime.providerId`.
- Avoid broad IPC renames until the runtime seam is stable.
- Do not expose raw provider APIs to plugins; expose Sero runtime capabilities.

## 7. PR strategy

Recommended PR sequence:

1. Plan PR: add this document.
2. Runtime contract PR: types and no behavior change.
3. Host + Apple provider PR: rewrap existing behavior.
4. Generic tool/editor/dev-server migration PRs.
5. Docker provider PR.
6. Parity hardening PR.
7. OpenShell decision PR.

Do not combine Docker and OpenShell implementation in the same PR.

## 8. Salvage list from PR #175

Potentially salvageable:

- provider-aware runtime config shape
- host adapter concept
- Apple Container adapter concept
- runtime diagnostics ideas
- tests that prove no host fallback
- OpenShell CLI command-shape research
- remote/cloud gateway notes

Do not salvage as final architecture:

- per-command OpenShell upload/download
- OpenShell file tools implemented through repeated `runtime.exec`
- host fallback terminal for OpenShell
- local/remote/cloud OpenShell paths as parity runtime implementation
- policy profile UI as proof of policy enforcement

## 9. Completion rule

A runtime phase is complete only when all acceptance criteria pass against the declared workspace access model.

A provider with `workspaceAccess: "explicit-sync"` must never be described as equivalent to a `workspaceAccess: "live-mount"` provider.
