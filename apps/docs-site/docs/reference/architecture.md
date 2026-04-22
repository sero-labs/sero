# Architecture

## High-level model

Sero combines three major layers:
- **Electron desktop shell**
- **workspace/runtime orchestration**
- **Pi-based agent intelligence**

At a high level:
- the Electron app provides the shell and UI
- workspaces define project scope and runtime mode
- Pi powers the agent sessions, tools, commands, and plugin extensions

## Shell model

The shell centers around:
- a main sidebar for apps and workspace/session context
- an active app area
- a chat panel for the focused agent session
- a status bar for current state

## Workspaces

Workspaces are the main organizing unit. Each workspace has:
- a root directory on disk
- its own runtime mode
- its own sessions and context
- a `.sero-workspace.json` configuration surface

## Runtime modes

### Container-backed (preferred)

Use Apple containers for:
- better isolation
- containerized tooling
- browser automation and managed preview flows
- better Linux parity

### Host mode (supported fallback)

Host mode keeps core workflows available, but it is intentionally reduced.
Expect limits around browser automation, containerized tooling, and some managed
preview/runtime behavior.

## Plugins

Sero supports plugin-provided UI, Pi extensions, runtime behavior, and provider
metadata. Built-in plugins ship in-repo; external plugins can be installed from
trusted sources.

## See also

The deeper architecture source material currently lives in the repository under:
- `docs/architecture.md`
- `docs/decisions.md`
