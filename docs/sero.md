# Sero — Vision & Philosophy

> "Zero context switch, zero sprawl."

## Vision

One beautiful, lightweight desktop window. A workspace for every project. Inside
each workspace everything the project needs — editor, terminals, previews, agent chats
— no external apps. Local-first execution through Apple Container, Docker, or host runtimes.
Agent-first: AI agents are woven into the workspace OS.

## Core Principle: Pi is the Brain

Pi is not a plugin, integration, or service that Sero calls. **Pi provides the
agentic harness that Sero is built on.** Every decision the workspace makes
on behalf of the user flows through Pi.

- **Pi's extension system** is how Sero registers its special capabilities —
  not a separate plugin framework
- **Pi's event stream** drives the entire UI: agent chat, tool feedback, status
  indicators, workspace state
- **Pi's SDK (`AgentSession`)** is the unit of agent intelligence — one per
  project in Phase 1, multiple per project for multi-agent orchestration later
- **Sero doesn't wrap Pi. Sero is built on Pi.**

The container is the body. The Electron UI is the face. Pi is the mind.

## Platform & Constraints

- **Supported alpha targets:** macOS, Linux, and Windows from source
- **Current maintainer-validated baseline:** macOS 26 Tahoe+ on Apple Silicon
- **Electron 33** (TypeScript + React)
- **Container-backed runtimes** are strongly recommended for the full Sero feature set: Apple Container on supported Apple Silicon Macs, Docker on macOS/Linux/Windows
- **Pi SDK** (`@mariozechner/pi-coding-agent`) as the AI agent core
- **Supported fallback:** Sero can continue in reduced host mode on macOS/Linux when containers are unavailable or intentionally disabled for a workspace; Windows workspace execution uses Docker

For the canonical public alpha support contract, prefer
`apps/docs-site/docs/reference/support-scope.md` when wording needs to stay in
sync across surfaces.

## Runtime modes

### Preferred: container runtime

Sero works best when a workspace runs with a container-backed runtime enabled.
Apple Container and Docker give Sero its intended Linux sandbox, containerized
tooling, browser automation, and managed preview / dev-server behavior.

See [Docker-backed local runtime](features/docker-runtime.md) for provider
behavior and [macOS Containers Setup](guides/macos-containers.md) for Apple
Container installation, verification, and recovery steps.

### Supported fallback: host mode

If containers are unavailable, unhealthy, or turned off for a workspace, Sero
can continue in host mode on macOS/Linux instead of blocking the product entirely.

Host mode still supports core workflows such as:
- onboarding and provider setup
- core agent chat and coding tasks
- file browsing / editing
- normal host-shell development workflows

Host mode is intentionally a reduced experience. Current limitations include:
- **no browser automation tool**
- **no containerized language servers**
- **reduced managed preview / dev-server automation**
- **no Linux image parity or container networking semantics**

### Opting a workspace into host mode

Workspace runtime is configured per workspace through the workspace tree runtime
toggle or the `runtime.backend` value in `.sero-workspace.json`.

That means containers are the default/preferred path for new workspaces, but
they are **not a hard requirement** for using Sero on macOS/Linux. Windows uses
Docker for workspace execution.