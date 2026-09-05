# Sero architecture

This file records current repository-wide boundaries that are not clear from one
package alone. User and plugin-author documentation belongs in
`apps/docs-site/docs/`. Subsystem details belong beside their implementation.

## Process and state boundaries

- Electron main owns filesystem, process, runtime, credential, Git, and plugin
  lifecycle work. Renderer code reaches these services through the typed preload
  bridge. A cross-process change must keep renderer state, preload types, IPC
  handlers, and the main-process service aligned.
- Persistent renderer state goes through the host layout service. Plugin state
  goes through the host app-state service. Do not create a second durable state
  path with `localStorage`, `sessionStorage`, or an event log.
- A chat thread crosses IPC as windows of user turns, never whole. `agent.open`
  returns the newest window with an older-page cursor, `agent.loadOlderTurns`
  returns the window before a cursor, and the transcript virtualizes its rows.
  A head rewrite (compaction, branch change) invalidates cursors, and the main
  process answers a stale cursor with a replacement window.
- `~/.sero-ui/profiles.json` selects the active profile. The active `SERO_HOME`
  owns profile data. Machine-shared tools and artifacts stay under the fixed
  host-artifacts root, outside every profile.

## Workspace runtimes

Each workspace selects Host, Apple Container, or Docker/Podman explicitly. A
selected container runtime fails closed when it is unavailable. It does not
silently run the command on Host. Host commands use the real workspace path;
`/workspace` is a container path and an API compatibility alias only.

Release targets are macOS arm64, Linux x64/arm64, and Windows x64. macOS x64
and Windows arm64 are not supported release targets.

Runtime implementations must preserve the same workspace identity and route
commands, terminals, Git, previews, and path translation through the selected
backend. Runtime-specific capability limits must remain visible to callers.

## Shared host services

- The desktop process owns model credentials and the shared Pi model runtime.
  Plugins receive narrow model or completion services, not the raw credential
  store.
- `apps/desktop/electron/features/git/` owns repository execution, GitHub CLI
  authentication, worktrees, checkpoints, and repository state. Workspace and
  plugin code consumes that service instead of spawning a parallel Git helper.
- Managed tools install once per machine under the host-artifacts root. Tool
  resolution uses a verified system tool first, a verified managed tool second,
  and an approved first-use install last. Sero does not mutate the user's shell
  profile or global package-manager configuration.

## Plugin boundary

The host validates plugin manifests before their UI, tools, runtime, or
contributions become active. Plugins declare the host capabilities they need.
Unknown required capabilities keep the plugin inactive instead of granting a
best-effort fallback.

Host extension points are closed contracts. The host owns each location,
layout, lifecycle, and validation. Plugins contribute only the declared
component or standard control. A plugin-specific feature must not add a custom
preload or IPC bridge when an existing generic capability can carry it.

Extension tools register through Pi. Sero can expose them through the generic
CLI bridge, which resolves the current session's extension instance at execution
time. Core coding tools and the subagent tool remain explicit exceptions.

Agent search is a built-in plugin, not a host service. The host contributes only
two things to it: the read-only search tool names, which a read-only subagent
keeps and a permission profile classifies as reads, and the plugin's package
path, which a managed persistent session loads alongside the app that holds its
grant. The search index, its lifecycle, and its workspace confinement stay
inside the plugin, and no host capability is specific to it.

Portable Agent Plugins are a separate host-owned package format. They are not
Sero plugins, Pi packages, or sidebar apps. Installed package content is
immutable; writable package data has a separate persistent location.

## Persistent agent sessions and Rooms

Host-managed persistent sessions are a gated built-in capability. The host
validates every request against a stored user-approved grant, controls session
paths and resources, and returns a narrow handle. A plugin cannot use this
capability to widen tools, models, workspace access, or delivery authority.

Goal mode is a third mode of Sero Orchestrator. A goal drives one ordinary chat
session toward one objective and shares Orchestrator persistence, limits and
session arbitration. Only one autonomous driver may steer a chat session: an
active-session Workflow step and a goal are arbitrated by the coordinator, and
the second is refused with a reason. A goal grants no tool, approval or
permission; a tool policy that hides its terminal tools stops it instead of
being widened.

Agent Rooms are a mode of Sero Orchestrator. Workflows and Rooms share
scheduling, limits, Git, artifacts, and delivery infrastructure, but keep
separate domain records. A Room member uses a standard persistent Pi session;
Orchestrator does not own a second transcript store or model runtime. The
Conductor can coordinate only inside the approved operating envelope.

## Agent Node

Agent Node is a headless Linux host for persistent Pi sessions. Sero Desktop is
the controller. The node is an A2A 1.0 server. Desktop is an A2A 1.0 client.
The node supports Linux x64 and Linux arm64. NVIDIA DGX Spark is an arm64 target.

A2A carries agent work. It carries messages, task state, streams, cancellation,
and artifacts. A Sero control plane carries enrolment, client revocation,
provider authentication, persistent-session discovery, and replay. TLS leaf
rotation is available only through the node CLI. These surfaces stay separate.
A task state change never gives new authority. AWS Bedrock is not in the Agent
Node provider surface.

An A2A `contextId` is the Pi session UUID. The Pi JSONL file is the durable
ordered log. A2A cannot list contexts. `SubscribeToTask` supplies a task
snapshot and new events. It does not replay missed events. Sero replay uses a
control-plane session stream with Pi entry IDs as cursors. A reconnect first
gets committed entries after its cursor, then one partial assistant snapshot
when a turn is active, then live deltas. A terminal task uses `GetTask`, not
`SubscribeToTask`.

Enrolment pins the node identity public key. The identity private key never
leaves the node. The TLS key is separate and can rotate without changing the
pinned identity. A controller address, single-use code, and identity
fingerprint are entered by the user before Desktop makes first contact. Agent
Node does not use automatic local-network discovery.

The system service uses a fixed `sero-node` account and a `0700` state
directory. Identity and provider credential files use mode `0600`. Do not use
`DynamicUser=` or `MemoryDenyWriteExecute=yes`. The service and its agent tools
run in one operating-system trust boundary. User and operator procedures, and
the exact credential warning, are in the Agent Node documentation.

## Security posture

Sero is a powerful local automation environment, not a hardened multi-tenant
sandbox. Containers, profiles, plugin activation, UI-only management surfaces,
and focused command approval checks are useful boundaries, but none is a
complete security system. Current user-visible limits and remote-access guidance
live in `apps/docs-site/docs/reference/security-privacy.md`.
