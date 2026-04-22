# Sero — Vision & Philosophy

> "Zero context switch, zero sprawl."

## Vision

One beautiful, lightweight macOS desktop window. Every project is a tab. Inside
each tab: a fully tiled, dynamic workspace with everything the project needs —
editor, terminals, previews, agent chats — no external apps. Local-first
execution using Apple's native Containerization framework. Agent-first: AI
agents are woven into the workspace OS.

## Core Principle: Pi is the Brain

Pi is not a plugin, integration, or service that Sero calls. **Pi is the
intelligence layer that Sero is built on.** Every decision the workspace makes
on behalf of the user flows through Pi.

- **Pi decides what to do**, containers execute it
- **Pi's extension system** is how Sero registers its special capabilities —
  not a separate plugin framework
- **Pi's event stream** drives the entire UI: agent chat, tool feedback, status
  indicators, workspace state
- **Pi's SDK (`AgentSession`)** is the unit of agent intelligence — one per
  project in Phase 1, multiple per project for multi-agent orchestration later
- **Sero doesn't wrap Pi. Sero is built on Pi.**

The container is the body. The Electron UI is the face. Pi is the mind.

## Platform & Constraints

- **Supported alpha target:** macOS on Apple Silicon
- **Current maintainer-validated baseline:** macOS 26 Tahoe+
- **Electron 33** (TypeScript + React)
- **Apple Container CLI** (`container` v0.8.0+) is **strongly recommended** for per-project Linux VM sandboxes and the full Sero feature set
- **Pi SDK** (`@mariozechner/pi-coding-agent`) as the AI agent core
- **Supported fallback:** Sero can continue in a reduced host mode when containers are unavailable or intentionally disabled for a workspace

## Runtime modes

### Preferred: container runtime

Sero works best when a workspace runs with Apple containers enabled. That gives
Sero its intended Linux sandbox, containerized tooling, browser automation, and
managed preview / dev-server behavior.

See [macOS Containers Setup](guides/macos-containers.md) for installation,
verification, and recovery steps.

### Supported fallback: host mode

If containers are unavailable, unhealthy, or turned off for a workspace, Sero
can continue in host mode instead of blocking the product entirely.

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

Workspace runtime is configured per workspace:
- use the workspace tree runtime toggle in the app UI, or
- set `"container": false` in `.sero-workspace.json`

That means containers are the default for new workspaces, but they are **not a
hard requirement** for using Sero at all.

## Future (Not Yet Implemented)

- **Dockview** for the editor area — tabbed, dockable panels with
  drag-and-drop and serialisable layout
- **Monaco Editor** for code editing within Dockview panels
- **xterm.js + node-pty** for integrated terminals
- **Apple Container CLI** for per-project sandboxed Linux VMs
- **Pi SDK AgentSession** wired into the ChatPanel via `useChat` / AI SDK
- **Module Federation** for loading external app plugins at runtime
