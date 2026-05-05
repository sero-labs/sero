# Proposal outline: OpenShell runtime support for Sero

> **Planning note:** This original proposal is now supplemented by
> [`openshell-runtime-proposal-v2.md`](./openshell-runtime-proposal-v2.md), which makes phase
> ownership, actual completion status, and Phase 2.5 hardening work explicit.


## 1. Purpose

Add **NVIDIA OpenShell** as an alternative execution backend for Sero workspaces and agents.

The goal is not to replace Sero’s current macOS runtime immediately. The goal is to make Sero capable of running workspace agents in different execution environments:

```text
Sero workspace
  → local macOS runtime
  → local OpenShell sandbox
  → remote OpenShell sandbox
  → cloud OpenShell sandbox
```

This would move Sero toward being a **portable AI workspace and agent orchestration UI**, rather than only a local macOS app tied to Apple container support.

---

## 2. Rationale

### 2.1 Cross-platform runtime path

Sero is currently macOS-focused. OpenShell gives Sero a route toward agent execution on:

* Linux machines
* remote Linux hosts
* cloud VMs
* Windows via WSL 2 and Docker Desktop, though currently experimental
* macOS via Docker Desktop

OpenShell publishes Linux `amd64` and `arm64` container images. Its CLI supports Linux, macOS on Apple Silicon through Docker Desktop, and Windows through WSL 2 plus Docker Desktop as experimental support. Docker must be installed and running before OpenShell commands work. ([NVIDIA Docs][1])

### 2.2 Remote and cloud agents

OpenShell has a gateway model that can run locally, on a remote machine over SSH, or behind a cloud reverse proxy. All three gateway types expose the same API surface, so Sero could present them as runtime targets rather than separate systems. ([NVIDIA Docs][2])

This enables workflows like:

```text
Use Sero locally
Run the agent remotely
Stream logs and diffs back into Sero
Forward preview ports back to the desktop
```

### 2.3 Stronger agent isolation

OpenShell’s sandbox model is explicitly designed around isolation. It uses filesystem restrictions, syscall filtering, network namespace isolation, and a privacy-enforcing HTTP CONNECT proxy. ([NVIDIA Docs][2])

That maps well to Sero because agentic coding workflows are risky by default. Agents can:

* read files
* write files
* run commands
* install packages
* access network services
* potentially touch secrets

OpenShell gives Sero a credible path to policy-driven execution boundaries.

### 2.4 Better testbed story

If Sero wants to be a testbed for new AI features, it needs repeatable environments. OpenShell sandboxes could support:

* clean task environments
* reproducible eval runs
* isolated agent experiments
* remote GPU experiments
* background or long-running agents
* safer third-party plugin testing

---

## 3. Strategic framing

Do **not** frame this as:

```text
Migrate Sero from Apple containers to OpenShell
```

Frame it as:

```text
Add OpenShell as a pluggable SandboxProvider backend
```

Sero should own:

* workspace model
* agent sessions
* plugin system
* UI
* evals
* runtime abstraction
* permission prompts
* local state

OpenShell should own:

* sandbox lifecycle
* gateway connectivity
* filesystem/network/process enforcement
* remote/cloud execution substrate

This avoids vendor lock-in and leaves room for other future backends.

---

## 4. Initial integration model

Sero should initially use OpenShell as a **runtime/tool backend**, not as the place where Sero's agent loop runs.

There are two possible models:

```text
A. Sero runs the Pi agent session locally.
   Runtime tools execute commands/files/ports inside OpenShell.

B. OpenShell runs a supported agent CLI directly.
   Example: openshell sandbox create -- claude
```

Use **model A for v1**. It preserves Sero's current strengths:

* Pi SDK session ownership
* Sero's tool registry and plugin system
* Sero's chat/session UI
* Sero's auth/model settings
* Sero's checkpointing and workspace context

Model B can be revisited later for special cases, but it would make Sero delegate the agent loop to an external CLI and would not map cleanly to the current UI/plugin architecture.

---

## 5. Proposed architecture

### 5.1 Runtime provider abstraction

Introduce a runtime abstraction between Sero’s agents/plugins/terminals and the underlying execution system.

```text
Sero App
  └─ Workspace
      └─ AgentSession
          └─ RuntimeSession
              └─ SandboxProvider
                  ├─ AppleContainerProvider
                  ├─ HostProvider
                  ├─ OpenShellLocalProvider
                  ├─ OpenShellRemoteProvider
                  └─ OpenShellCloudProvider
```

### 5.2 Suggested TypeScript interface

The provider contract should be capability-aware. Apple containers, host mode, local OpenShell, remote OpenShell, and cloud OpenShell do not all expose the same primitives.

```ts
export interface SandboxProviderCapabilities {
  exec: boolean;
  interactiveTerminal: boolean;
  directFileRead: boolean;
  directFileWrite: boolean;
  fileUpload: boolean;
  fileDownload: boolean;
  portForward: boolean;
  logStream: boolean;
  hotReloadNetworkPolicy: boolean;
}

export interface SandboxProvider {
  id: string;
  label: string;
  capabilities: SandboxProviderCapabilities;

  doctor(): Promise<RuntimeHealth>;

  createRuntime(input: CreateRuntimeInput): Promise<RuntimeSession>;

  exec(
    sessionId: string,
    command: string[],
    options?: ExecOptions
  ): AsyncIterable<ExecEvent>;

  createTerminal?(
    sessionId: string,
    options?: TerminalOptions
  ): Promise<TerminalSession>;

  readFile?(sessionId: string, path: string): Promise<Uint8Array>;

  writeFile?(
    sessionId: string,
    path: string,
    content: Uint8Array
  ): Promise<void>;

  upload?(
    sessionId: string,
    localPath: string,
    runtimePath: string
  ): Promise<void>;

  download?(
    sessionId: string,
    runtimePath: string,
    localPath: string
  ): Promise<void>;

  forwardPort?(
    sessionId: string,
    port: number,
    options?: PortForwardOptions
  ): Promise<ForwardedPort>;

  streamLogs?(
    sessionId: string,
    options?: LogOptions
  ): AsyncIterable<LogEvent>;

  destroy(sessionId: string): Promise<void>;
}
```

OpenShell does not currently map cleanly to a generic sandbox `stop()` operation. Sandbox cleanup should map to `openshell sandbox delete` / `DeleteSandbox`; gateway stop/destroy should be modeled separately.

### 5.3 Workspace sync provider

Workspace synchronization should be a sibling abstraction, not a helper method hidden inside `SandboxProvider`.

```ts
export interface WorkspaceSyncProvider {
  id: string;
  label: string;

  push(input: WorkspaceSyncInput): Promise<WorkspaceSyncResult>;
  pull(input: WorkspaceSyncInput): Promise<WorkspaceSyncResult>;
  diff?(input: WorkspaceSyncInput): Promise<WorkspaceSyncDiff>;
}
```

For OpenShell v1, use explicit sync:

```text
push workspace before task/run
run commands in sandbox
pull selected outputs or full workspace after task/run
```

Avoid hidden bidirectional sync until conflict handling, previews, file watching, and checkpointing have a shared design.

### 5.4 Runtime session model

```ts
export interface RuntimeSession {
  id: string;
  providerId: string;
  workspaceId: string;

  status:
    | "provisioning"
    | "ready"
    | "error"
    | "stopping"
    | "destroyed";

  gatewayId?: string;
  sandboxId?: string;

  createdAt: string;
  updatedAt: string;

  metadata?: Record<string, unknown>;
}
```

OpenShell sandboxes expose normalized phases such as provisioning, ready, error, deleting, and unknown, so this maps naturally to Sero runtime session state. ([NVIDIA Docs][2])

### 5.5 Current Sero touchpoints

The runtime abstraction will affect more than command execution. Existing Apple container assumptions appear in:

* workspace runtime resolution
* container lifecycle and singleton management
* agent coding tools
* terminal creation and replay
* filetree/editor file APIs
* dev-server registration and port scanning
* preview URL routing
* workspace references, mounts, and additional roots
* Environment Doctor/runtime diagnostics

The first implementation should avoid a broad rename of all `container.*` IPC. Add the internal runtime seam first, then migrate user-facing naming once additional providers actually exist.

### 5.6 OpenShell integration surface

A local provider can start CLI-first because the command surface already covers the MVP:

```text
openshell gateway start
openshell status
openshell sandbox create
openshell sandbox exec
openshell sandbox upload
openshell sandbox download
openshell logs --tail
openshell forward start
openshell sandbox delete
```

The lower-level OpenShell API is still important for later hardening. The repo exposes gRPC/proto operations for sandbox lifecycle, streaming exec, logs/watch, providers, policy updates, and draft policy decisions.

---

## 6. Gateway model

### 6.1 Gateway registry

Sero should maintain a runtime gateway registry.

```ts
type GatewayKind = "local" | "remote-ssh" | "cloud";

export interface RuntimeGateway {
  id: string;
  providerId: "openshell";
  kind: GatewayKind;

  name: string;
  endpoint?: string;
  sshHost?: string;

  status:
    | "unknown"
    | "starting"
    | "ready"
    | "error"
    | "disabled";

  lastCheckedAt?: string;
}
```

### 6.2 Gateway types

OpenShell supports three deployment modes:

| Mode   | Where it runs                 | Sero use case                    |
| ------ | ----------------------------- | -------------------------------- |
| Local  | Docker on workstation         | secure local sandbox             |
| Remote | Docker on remote host via SSH | run agents on a stronger machine |
| Cloud  | behind reverse proxy          | hosted/cloud agents              |

OpenShell can deploy a local gateway with Docker, deploy a remote gateway over SSH, and register a cloud gateway behind a reverse proxy. ([NVIDIA Docs][3])

### 6.3 UX

```text
Settings → Runtimes

Apple Container
  Status: Ready

OpenShell Local
  Status: Docker not running

OpenShell Remote
  gpu-box.local
  Status: Ready

OpenShell Cloud
  https://sero-runtime.example.com
  Status: Not authenticated
```

---

## 7. Workspace runtime selection

Workspace creation should eventually include:

```text
Runtime

● Local macOS
  Best for normal local development.

○ OpenShell Local
  Best for sandboxed local agent execution.

○ OpenShell Remote
  Best for running agents on another machine.

○ OpenShell Cloud
  Best for long-running or GPU-backed cloud agents.
```

Each workspace should eventually store:

```ts
interface WorkspaceRuntimeConfig {
  providerId: "host" | "apple-container" | "openshell";
  gatewayId?: string;
  profileId?: string;
  image?: string;
  resources?: {
    cpu?: number;
    memoryGb?: number;
    gpu?: boolean;
  };
}
```

Sero currently stores runtime preference as `container?: boolean` in `.sero-workspace.json`. Migration should preserve backward compatibility:

```text
container: false       → runtime.providerId = "host"
container: true        → runtime.providerId = "apple-container"
container: undefined   → runtime.providerId = "apple-container"
```

Keep reading `container` during the transition so existing workspaces continue to behave exactly as they do today.

---

## 8. Policy model

OpenShell policies are a major reason to consider this integration.

Important policy distinction:

* filesystem, Landlock, and process policy are static at sandbox creation time
* network policy is dynamic and can be hot-reloaded on a running sandbox

Sero's UX should reflect this. Network allow/deny changes can be applied immediately; filesystem/process changes should explain that the sandbox must be recreated.

### 8.1 Sero policy profiles

Sero should define user-friendly policy profiles that compile down to OpenShell configuration.

Suggested initial profiles:

| Profile       | Purpose                                          |
| ------------- | ------------------------------------------------ |
| Strict        | minimal network, workspace-only filesystem       |
| Dev           | package registries, GitHub, normal dev workflows |
| Browser Agent | web access plus browser dependencies             |
| GPU Agent     | remote/cloud GPU-capable image                   |
| Plugin Test   | isolate untrusted plugin development             |

### 8.2 Policy UX

```text
Agent Runtime Policy

Filesystem
  ✓ Allow workspace read/write
  ✗ Deny home directory access
  ✗ Deny system path access

Network
  ✓ Allow GitHub
  ✓ Allow npm registry
  ✓ Allow selected model provider
  ✗ Block all other domains

Commands
  ⚠ Require approval for destructive commands
```

### 8.3 Policy debugging

OpenShell can stream sandbox logs and show blocked connections, including denied network requests. Sero could convert those into friendly prompts like:

```text
The agent attempted to connect to registry.npmjs.org.

Allow this for:
[ This run ] [ This workspace ] [ Always for Dev profile ] [ Deny ]
```

OpenShell provides log streaming for sandboxes and notes that blocked connections can be diagnosed in logs. ([NVIDIA Docs][4])

The OpenShell API also includes draft policy recommendation operations such as draft retrieval, approve, reject, approve-all, undo, and clear. Sero should not depend on those for v1, but they are a promising future integration point for policy prompts and audit history.

---

## 9. AgentSession integration

Agent sessions should bind to runtime sessions.

```ts
interface AgentSession {
  id: string;
  workspaceId: string;
  runtimeSessionId: string;
  modelProviderId: string;
  role?: string;
}
```

For the first OpenShell integration, Sero should keep the Pi agent session running in the Electron/main-process orchestration layer. Agent tools should call a Sero runtime facade, and the facade should route execution to host mode, Apple containers, or OpenShell.

Agents should not know whether tools are running against Apple containers, local OpenShell, remote OpenShell, or cloud OpenShell.

They should use Sero runtime capabilities:

```ts
runtime.exec(...)
runtime.readFile?.(...)
runtime.writeFile?.(...)
runtime.upload?.(...)
runtime.download?.(...)
runtime.forwardPort?.(...)
runtime.streamLogs?.(...)
```

This is different from launching an external agent inside OpenShell with a command such as `openshell sandbox create -- claude`. That mode may be useful later, but it should not be the default Sero integration path.

---

## 10. Plugin integration

Plugins should depend on Sero capabilities, not OpenShell directly.

Example manifest:

```json
{
  "requiredHostCapabilities": [
    "runtime.exec",
    "runtime.files.read",
    "runtime.files.write",
    "runtime.ports.forward"
  ]
}
```

Avoid exposing raw OpenShell APIs to plugins in v1. This keeps:

* permissioning consistent
* runtime portability intact
* future backends possible
* plugin compatibility simpler

---

## 11. Preview and dev-server integration

Sero's current preview flow assumes Apple container IP discovery and local/private URLs. OpenShell uses explicit port forwarding.

The runtime abstraction should model preview ports as first-class runtime resources:

```ts
interface ForwardedPort {
  sessionId: string;
  runtimePort: number;
  localPort: number;
  localUrl: string;
  status: "starting" | "ready" | "stopped" | "error";
}
```

OpenShell-backed previews should use:

```text
openshell forward start <port> <sandbox>
openshell forward list
openshell forward stop <port> <sandbox>
```

Sero should own the UI registry for preview URLs and clean up forwards when runtime sessions are destroyed.

---

## 12. Evals integration

OpenShell could become especially useful for Sero evals.

Example:

```text
Eval Suite
  Tasks: 100
  Models: 3
  Agent prompts: 2
  Runtime: OpenShell Remote
  Isolation: fresh sandbox per case
```

Benefits:

* clean environment per eval case
* reproducible setup
* isolated side effects
* remote scaling
* GPU optionality
* traceable logs and outputs

This is likely one of the highest-value use cases after basic runtime support.

---

## 13. Proposed migration plan

### Phase 0: research spike

Goal: validate feasibility without modifying core architecture heavily.

Deliverables:

* install OpenShell locally
* create local gateway
* create sandbox
* run command with `openshell sandbox exec`
* upload/download files
* forward port
* stream logs
* inspect gRPC/proto feasibility for later direct integration
* test failure states
* record rough latency and startup cost

Acceptance criteria:

* Sero maintainers understand the minimum viable CLI and API surface
* known failure modes documented
* local OpenShell viability confirmed on target dev machines
* a recommendation exists for CLI-first vs gRPC-first implementation

---

### Phase 1: runtime adapter seam

Goal: introduce a narrow runtime facade around existing host and Apple container behavior without a full IPC/UI rewrite.

Deliverables:

* capability-aware runtime adapter interface
* host adapter wrapping existing host execution paths
* Apple container adapter wrapping existing `ContainerManager`
* runtime session model for current workspaces
* runtime health checks for host/container
* `runWorkspaceCommand` routes through the runtime facade
* agent coding tools receive a runtime facade instead of `ContainerManager` directly where practical
* terminal creation supports host/container through the same facade
* workspace config remains backward-compatible with `container?: boolean`

Acceptance criteria:

* no behaviour regression for current macOS runtime
* host fallback still works
* provider boundary is clear enough for OpenShell local to be added next
* no OpenShell dependency is required in this phase

---

### Phase 2: OpenShell local provider

Goal: add local Docker-backed OpenShell support.

Deliverables:

* detect OpenShell CLI
* detect Docker daemon
* start or select local gateway
* create sandbox
* run commands through CLI first, with gRPC reserved for later hardening
* explicit workspace push/pull using upload/download
* stream logs
* forward preview ports
* destroy sandbox

OpenShell requires Docker to be running, and if no gateway exists, sandbox creation can auto-bootstrap a local gateway. ([NVIDIA Docs][4])

Current Phase 2 implementation status:

* **Experimental local-only provider.** Sero currently supports `openshell-local` for local Docker-backed OpenShell sandboxes only.
* **CLI-first integration.** Sero shells out to the OpenShell CLI for gateway, sandbox, exec, logs, and port-forward operations; no gRPC/proto integration is implemented yet.
* **Explicit coarse sync.** Workspace files are uploaded before each sandbox exec and downloaded afterward. There is no file watcher or transparent bidirectional sync.
* **UI scope.** Users can choose OpenShell Local when creating a workspace, see diagnostics, run commands, stream logs, forward known preview ports, and destroy the sandbox when changing away from the runtime.
* **Not implemented in Phase 2.** Remote/cloud gateways, policy/profile UX, browser automation, and OpenShell interactive PTY terminals remain future work.

Manual smoke-test note for maintainers: with Docker running and the OpenShell CLI installed, create an OpenShell Local workspace, run a command that writes a file, confirm the file is downloaded back to the host workspace, start a common dev server such as Vite, and confirm the forwarded preview URL loads.

Acceptance criteria:

* user can create a Sero workspace using OpenShell Local
* agent can run commands in sandbox
* file changes can be reflected back into Sero
* preview ports work
* failures are surfaced clearly

---

### Phase 3: runtime profiles and policy UX

Goal: make OpenShell’s security model usable inside Sero.

Deliverables:

* Strict profile
* Dev profile
* Browser Agent profile
* policy preview
* blocked-network feedback
* per-workspace runtime policy selection

Acceptance criteria:

* user can understand what an agent can and cannot access
* denied actions are visible and actionable
* policy changes are auditable

---

### Phase 4: remote gateway support

Goal: enable agents on remote machines.

Deliverables:

* add remote gateway by SSH host
* gateway health checks
* create sandbox on remote host
* workspace upload/download or sync
* remote logs
* forwarded ports
* latency/status indicators

OpenShell can deploy a remote gateway using SSH, with Docker as the dependency on the remote host. ([NVIDIA Docs][3])

Acceptance criteria:

* user can run a workspace agent on a remote Linux machine
* Sero UI remains local
* terminal/log/preview loops still work

---

### Phase 5: cloud gateway support

Goal: support hosted or cloud-backed agent sessions.

Deliverables:

* register cloud gateway endpoint
* auth flow
* cloud session creation
* resource display
* idle timeout and cleanup
* cost/resource warnings
* long-running session affordances

OpenShell supports cloud gateways behind a reverse proxy, and cloud gateways are currently described as suited for individual users rather than shared team access. ([NVIDIA Docs][2])

Acceptance criteria:

* user can connect Sero to a cloud gateway
* workspace agent can run in cloud sandbox
* user can stop/destroy sessions safely
* stale cloud sessions are visible

---

### Phase 6: evals and multi-agent scaling

Goal: make OpenShell valuable beyond runtime portability.

Deliverables:

* fresh sandbox per eval case
* parallel remote eval execution
* per-run logs
* result collection
* failure snapshots
* optional GPU profile

OpenShell gateways can be started with GPU support where the host has NVIDIA drivers and the NVIDIA Container Toolkit available. ([NVIDIA Docs][3])

Acceptance criteria:

* Sero can run repeatable evals in isolated sandboxes
* multiple agent configurations can be compared
* results are exportable and replayable

---

## 14. Environment Doctor additions

The Environment Doctor should eventually include OpenShell checks.

### OpenShell local checks

* OpenShell CLI installed
* CLI version
* Docker installed
* Docker daemon running
* local gateway reachable
* sandbox creation smoke test
* command execution smoke test
* port forwarding smoke test

### OpenShell remote checks

* SSH reachable
* Docker installed on remote
* gateway reachable
* sandbox creation smoke test
* file upload/download test
* latency measurement

### OpenShell cloud checks

* endpoint reachable
* auth valid
* gateway status
* sandbox creation permitted
* cleanup permitted

Important: diagnostics should not read secrets. They may check whether required environment variable names are present, but must not log their values.

---

## 15. Risks and mitigations

### Risk: OpenShell is alpha

NVIDIA’s docs currently mark OpenShell as alpha software, with APIs and behaviour subject to change and not recommended for production. ([NVIDIA Docs][3])

Mitigation:

* keep it behind `SandboxProvider`
* mark support experimental
* pin supported CLI versions
* add doctor checks
* avoid exposing raw APIs to plugins

### Risk: Docker dependency on macOS

On macOS, OpenShell runs through Docker Desktop, and Linux kernel isolation features run inside Docker Desktop’s Linux VM rather than the macOS host kernel. ([NVIDIA Docs][1])

Mitigation:

* keep Apple container support as default on macOS
* present OpenShell Local as “experimental secure Linux runtime”
* document performance and isolation boundaries clearly

### Risk: Sero's current container coupling

Sero's current runtime surface is not one seam. It affects workspace runtime resolution, terminal creation, agent tools, dev-server detection, preview URLs, file APIs, and startup/shutdown cleanup.

Mitigation:

* start with a narrow runtime facade around existing host/container behavior
* avoid renaming all IPC channels in the first phase
* keep `ContainerManager` working behind the adapter until callers are migrated gradually
* add OpenShell only after host and Apple container behavior are stable through the facade

### Risk: file sync complexity

Remote/cloud sandboxes need robust workspace sync.

Mitigation:

* start with explicit upload/download
* later add incremental sync
* keep runtime-generated diffs visible
* avoid hidden bidirectional sync in v1

### Risk: credential handling

OpenShell gateways can store provider credentials and deliver them to sandboxes at startup. ([NVIDIA Docs][3])

Mitigation:

* define a clear Sero credential boundary
* avoid duplicating secrets unnecessarily
* prefer per-workspace or per-provider scoping
* never include secret values in diagnostics

### Risk: UX complexity

Multiple runtimes, gateways, policies, and profiles can overwhelm users.

Mitigation:

* default to simple choices
* hide advanced options initially
* use profiles instead of raw policy editing
* include Environment Doctor integration

---

## 16. Open questions

1. Should Sero invoke the OpenShell CLI or integrate through a lower-level API if available?
2. Should workspace sync be file-copy based, git-based, or protocol-based?
3. Where should provider credentials live: Sero, OpenShell gateway, or both?
4. Should remote/cloud sessions be ephemeral by default?
5. Should Sero support one sandbox per workspace, per agent, or per task?
6. Should plugins be allowed to request a specific runtime profile?
7. What minimum OpenShell version should Sero support?
8. Should OpenShell support be hidden behind an experimental flag initially?

---

## 17. Recommended first implementation issue

**Add runtime adapter seam around existing host/container execution**

Description:

> Introduce a narrow, capability-aware runtime facade so Sero can route command execution, terminal creation, file access, preview ports, and health checks through a common boundary. Wrap the existing host and Apple container behavior first. OpenShell support will be added later as an experimental provider.

Acceptance criteria:

* existing Apple container behavior still works
* host fallback still works
* `runWorkspaceCommand` routes through the runtime facade
* agent tools can receive a runtime facade instead of depending directly on `ContainerManager`
* terminal creation supports host/container through the same facade
* runtime health is exposed to UI/doctor-ready code paths
* workspace config remains backward-compatible with `container?: boolean`
* no OpenShell dependency required for this issue

---

## 18. Recommendation

Proceed, but in this order:

1. **Runtime adapter seam first**
2. **OpenShell local second**
3. **Workspace sync and preview forwarding third**
4. **Policy UX fourth**
5. **Remote gateway fifth**
6. **Cloud sessions sixth**
7. **Evals and multi-agent scaling seventh**

That keeps Sero’s architecture clean while still making OpenShell a serious path toward cross-platform execution, cloud agents, stronger isolation, and reproducible AI experiments.

[1]: https://docs.nvidia.com/openshell/latest/reference/support-matrix.html?utm_source=chatgpt.com "Support Matrix | NVIDIA OpenShell"
[2]: https://docs.nvidia.com/openshell/sandboxes/about?utm_source=chatgpt.com "About Gateways and Sandboxes | NVIDIA OpenShell"
[3]: https://docs.nvidia.com/openshell/sandboxes/manage-gateways?utm_source=chatgpt.com "Deploy and Manage Gateways | NVIDIA OpenShell"
[4]: https://docs.nvidia.com/openshell/sandboxes/manage-sandboxes?utm_source=chatgpt.com "Manage Sandboxes | NVIDIA OpenShell"
