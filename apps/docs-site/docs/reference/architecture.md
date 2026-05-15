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

```mermaid
flowchart LR
  User[User] --> Shell[Electron desktop shell]

  Shell --> Apps[Core apps and plugin UIs]
  Shell --> Chat[Global chat panel]
  Shell --> Workspace[Workspace registry]

  Chat --> Pi[Pi agent runtime]
  Pi --> Tools[Tools, commands, and skills]
  Pi --> Context[Session history, memory, and context]

  Workspace --> Runtime{Runtime mode}
  Runtime --> Apple[Apple Container workspace]
  Runtime --> Docker[Docker / Podman workspace]
  Runtime --> Host[Explicit Host mode]

  Apps --> AppRuntime["@sero-ai/app-runtime"]
  Apps --> AppState[Profile or workspace app state]

  Plugins[Plugins] --> Apps
  Plugins --> Tools
  Plugins --> Widgets[Dashboard widgets]
```

![Sero architecture overview](../assets/generated/img1.jpg)

## Shell model

The shell centers around:
- a main sidebar for apps and workspace/session context
- an active app area
- a chat panel for the focused agent session
- a status bar for current state

```text
┌──────────────────────────────────────────────────────────────┐
│ Title bar: app context, command menu, shell actions           │
├──────────────┬──────────────────────────────┬────────────────┤
│ Main sidebar │ Active app area              │ Global chat    │
│              │                              │ panel          │
│ Apps         │ Dashboard / Explorer /       │ Pi-backed      │
│ Workspaces   │ Plugin UI                    │ session        │
│ Sessions     │                              │                │
├──────────────┴──────────────────────────────┴────────────────┤
│ Status bar: workspace/runtime/session state                   │
└──────────────────────────────────────────────────────────────┘
```

![Sero shell with sidebar, active Explorer app, and agent chat panel](../assets/images/explorer-view.jpg)

## Workspaces

Workspaces are the main organizing unit. Each workspace has:
- a root directory on disk
- its own runtime mode
- its own sessions and context
- a `.sero-workspace.json` configuration surface

## Runtime modes

### Container-backed (preferred)

Use Apple Container or Docker/Podman-backed workspaces for:
- better isolation
- containerized tooling
- browser automation and managed preview flows
- better Linux parity

### Host mode (explicit reduced runtime)

Host mode keeps core workflows available when selected on macOS/Linux, but it is intentionally reduced.
Expect limits around browser automation, containerized tooling, and some managed
preview/runtime behavior. Windows workspace execution uses the Docker-compatible runtime. See [Containers and Host Mode](/reference/containers-host-mode)
for runtime-specific guidance.

```mermaid
flowchart TD
  Open[Open workspace] --> Pick{Selected runtime}
  Pick -->|Apple Container/Docker/Podman available| Container[Container-backed workspace]
  Pick -->|Host on macOS/Linux| Host[Reduced host mode]
  Pick -->|Container unavailable| Error[Actionable runtime error]

  Container --> Mounts[Mount workspace and configured extra roots]
  Container --> Exec["Run terminals, tools, and dev servers via container exec"]
  Container --> Preview[Managed previews and browser automation]

  Host --> HostFiles[Host file browsing and editing]
  Host --> HostChat[Chat and coding tasks]
  Host --> Limits[Reduced automation and networking parity]
```

## Plugins

Sero supports plugin-provided UI, Pi extensions, runtime behavior, and provider
metadata. Built-in plugins ship in-repo; external plugins can be installed from
trusted sources.

## See also

The deeper architecture source material currently lives in the repository under:
- [`docs/architecture.md`](https://github.com/sero-labs/sero/blob/main/docs/architecture.md)
- [`docs/decisions.md`](https://github.com/sero-labs/sero/blob/main/docs/decisions.md)
