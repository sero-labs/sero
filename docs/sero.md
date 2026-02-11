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

- **macOS 26 Tahoe+**, Apple Silicon exclusive
- **Electron 33** (TypeScript + React)
- **Apple Container CLI** (`container` v0.8.0+) for per-project Linux VM
  sandboxes
- **Pi SDK** (`@mariozechner/pi-coding-agent`) as the AI agent core
- **Hard requirement:** Every agent session is sandboxed inside a container

## Future (Not Yet Implemented)

- **Dockview** for the editor area — tabbed, dockable panels with
  drag-and-drop and serialisable layout
- **Monaco Editor** for code editing within Dockview panels
- **xterm.js + node-pty** for integrated terminals
- **Apple Container CLI** for per-project sandboxed Linux VMs
- **Pi SDK AgentSession** wired into the ChatPanel via `useChat` / AI SDK
- **Module Federation** for loading external app plugins at runtime
