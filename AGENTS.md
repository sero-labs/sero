# AGENTS.md — Sero AI Workspace

## Project Overview

Sero is an agent-first macOS desktop workspace app. Single Electron window with per-project tabs, tiled workspace panels (editor, terminal, agent chat, preview), sandboxed Linux containers via Apple's Containerization framework, and Pi SDK as the core intelligence layer.

## Tech Stack

- **Runtime:** Electron (main + renderer processes)
- **Frontend:** React 19, TypeScript, Vite (dev server on `:5173`)
- **State:** Zustand stores (`project-store`, `workspace-store`, `agent-store`)
- **Workspace layout:** dockview-react (VS Code-style docking/splitting)
- **Editor:** Monaco Editor
- **Terminal:** xterm.js + node-pty (real PTY into container)
- **Agent:** Pi SDK (`@mariozechner/pi-coding-agent`) — `AgentSession` per project
- **Containers:** Apple Container CLI v0.8.0 (`/usr/local/bin/container`)
- **Build:** esbuild (ESM for main, CJS for preload), Vite for renderer

## Architecture

```
┌─────────────────────────────────────────────┐
│  Renderer (React)                           │
│  ├── Shell (tabs, command bar)              │
│  ├── TiledWorkspace (dockview)              │
│  │   ├── EditorPanel (Monaco + FileTree)    │
│  │   ├── TerminalPanel (xterm.js)           │
│  │   ├── AgentPanel (chat + markdown)       │
│  │   └── PreviewPanel (webview)             │
│  └── Stores (Zustand)                       │
├─────────────── IPC (preload.ts) ────────────┤
│  Main Process (Electron)                    │
│  ├── container-manager.ts  → Apple CLI      │
│  ├── agent-manager.ts      → Pi SDK        │
│  ├── ipc-handlers.ts       → IPC bridge    │
│  └── persistence.ts        → Disk storage  │
└─────────────────────────────────────────────┘
        │                          │
   ┌────▼────┐              ┌─────▼─────┐
   │ Container│              │ Container │
   │ (Linux VM)│             │ (Linux VM) │
   │ /workspace│             │ /workspace │
   │ ← bind   │             │ ← bind    │
   │   mount   │             │   mount   │
   └──────────┘              └───────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `electron/main.ts` | Electron entry point, app lifecycle, container cleanup |
| `electron/container-manager.ts` | Spawn/stop/exec/inspect containers, PTY terminals, file I/O |
| `electron/agent-manager.ts` | Pi SDK sessions, 6 custom tools (bash, read, write, edit, ls, read_terminal) |
| `electron/ipc-handlers.ts` | IPC bridge: main ↔ renderer for all operations |
| `electron/preload.ts` | Typed `window.sero` API exposed to renderer |
| `electron/persistence.ts` | Projects, layouts, chat history, editor state to disk |
| `src/components/Shell.tsx` | Top-level shell: project tabs, keyboard shortcuts, project lifecycle |
| `src/components/TiledWorkspace.tsx` | Dockview workspace with panel registration and layout persistence |
| `src/components/panels/AgentPanel.tsx` | Agent chat: event stream, markdown rendering, retry/clear |
| `src/components/panels/EditorPanel.tsx` | Monaco editor with recursive file tree, file persistence |
| `src/components/panels/TerminalPanel.tsx` | xterm.js terminal connected to container PTY |
| `src/components/panels/PreviewPanel.tsx` | Webview preview with port detection |
| `src/stores/project-store.ts` | Project state (id, name, status, container config) |
| `src/stores/workspace-store.ts` | Dockview APIs, panel definitions, add terminal |
| `src/stores/agent-store.ts` | Chat messages, streaming state, agent status |
| `images/Dockerfile.sero-node` | Custom base image: node:22-slim + git, curl, build-essential |

## Build & Run

```bash
# Install dependencies
pnpm install
chmod +x node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper

# Build electron main + preload
node scripts/build-electron.mjs

# Dev mode: start Vite, then Electron
npx vite &                              # Renderer on :5173
NODE_ENV=development npx electron .     # Main process

# Build the custom container image (one-time)
cd images && container build -t sero-node:latest -f Dockerfile.sero-node .
```

## Container Rules (CRITICAL)

1. **NEVER delete container storage directories** (`~/Library/Application Support/com.apple.container/containers/`) — always use `container delete`
2. **NEVER use `container rm`** — it doesn't exist. Use `container delete --force`
3. **NEVER restart the API server** (`container system stop/start`) in normal operation — it destroys ALL containers
4. **ALWAYS use bind mounts** for project data — `--volume ~/.sero/workspaces/<id>:/workspace`
5. **`container stop` / `container start`** is safe and preserves everything

See `docs/libs/container.md` for full container CLI reference and ghost container documentation.

## Persistence Paths

| Data | Path |
|------|------|
| Projects list + active tab | `~/Library/Application Support/sero/sero-data/projects.json` |
| Layout per project | `~/Library/Application Support/sero/sero-data/projects/<id>/layout.json` |
| Chat history per project | `~/Library/Application Support/sero/sero-data/projects/<id>/chat.json` |
| Editor state per project | `~/Library/Application Support/sero/sero-data/projects/<id>/editor.json` |
| Project workspace files | `~/.sero/workspaces/<id>/` (bind-mounted to `/workspace` in container) |
| Apple container storage | `~/Library/Application Support/com.apple.container/containers/` |

## Agent Tools

The Pi agent has 6 tools that execute inside the project's container:

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands in the container |
| `read` | Read file contents from the container |
| `write` | Write files to the container (via stdin piping, not shell args) |
| `edit` | Surgical find-and-replace edits |
| `ls` | List directory contents |
| `read_terminal` | Read the terminal output buffer (32KB ring buffer) — lets agent see dev server logs |

## Conventions

- **Container naming:** `sero-<projectId>` (e.g., `sero-proj-ml8lopg1`)
- **Workspace dir inside container:** `/workspace`
- **Container network:** `default` at `192.168.64.0/24` (IPs directly routable from host)
- **Default image:** `sero-node:latest` (custom image with dev tools pre-installed)
- **Dev servers must bind to `0.0.0.0`** — not localhost (container networking requirement)
- **Panel IDs:** `<type>-<counter>` (e.g., `editor-1`, `terminal-2`)
- **Terminal IDs:** `term-<timestamp>-<random>` 

## Documentation

- **`docs/sero.md`** — Full build log, architecture decisions (AD-001 through AD-012), phase roadmap, completed tasks, and Phase 2 skills integration plan. This is the canonical source of truth for why decisions were made.
- **`docs/libs/container.md`** — Apple Container CLI reference, ghost container problem/solution, safe lifecycle rules.

## Logs

- Electron main: `/tmp/sero-electron.log`
- Vite dev server: `/tmp/sero-vite.log`
