# Sero — Build Log & Architecture

> "Zero context switch, zero sprawl."

## Vision

One beautiful, lightweight macOS desktop window. Every project is a tab. Inside each tab: a fully tiled, dynamic workspace with everything the project needs — editor, terminals, previews, agent chats — no external apps. Local-first execution using Apple's native Containerization framework. Agent-first: AI agents are woven into the workspace OS.

## Core Principle: Pi is the Brain

Pi is not a plugin, integration, or service that Sero calls. **Pi is the intelligence layer that Sero is built on.** Every decision the workspace makes on behalf of the user flows through Pi.

- **Pi decides what to do**, containers execute it
- **Pi's extension system** is how Sero registers its special capabilities — not a separate plugin framework
- **Pi's event stream** drives the entire UI: agent chat, tool feedback, status indicators, workspace state
- **Pi's SDK (`AgentSession`)** is the unit of agent intelligence — one per project in Phase 1, multiple per project for multi-agent orchestration later
- **Sero doesn't wrap Pi. Sero is built on Pi.**

The container is the body. The Electron UI is the face. Pi is the mind.

## Platform & Constraints

- **macOS 26 Tahoe+**, Apple Silicon exclusive
- **Electron** (TypeScript + React)
- **Apple Container CLI** (`container` v0.8.0+) for per-project Linux VM sandboxes
- **Pi SDK** (`@mariozechner/pi-coding-agent`) as the AI agent core
- **Hard requirement:** Every agent session is sandboxed inside a container

## Architecture Decisions

### AD-001: Container interaction via CLI wrapper (not Swift bridge)
- **Date:** 2026-02-04
- **Decision:** Wrap `container` CLI from Electron main process via `child_process`
- **Rationale:** CLI is stable at 0.8.0, covers all needs (run, exec, stop, inspect, volumes, port forwarding). Swift bridge adds FFI complexity with no Phase 1 benefit.
- **Revisit when:** We need memory ballooning, custom networking, or sub-100ms lifecycle events.

### AD-002: Agent execution model — Pi SDK in main process, tools exec into container
- **Date:** 2026-02-04
- **Decision:** Pi `AgentSession` runs in Electron main process. Tools (bash, read, write, edit) are configured with custom operations that execute inside the container via `container exec`.
- **Rationale:** Pi SDK's remote execution support (`createBashTool`, `createReadTool` etc. with custom operations) is designed exactly for this. Agent gets full tool access, everything runs sandboxed.
- **Key detail:** The container's filesystem is the agent's workspace. No host filesystem access.

### AD-003: Single agent per project (Phase 1), architecture supports multi-agent
- **Date:** 2026-02-04
- **Decision:** One `AgentSession` per project tab for Phase 1. The `AgentSessionManager` is designed as a map of `projectId → AgentSession[]` to support multiple sessions per project later.
- **Revisit when:** Phase 3 (multi-agent orchestration).

### AD-004: Tiling library — react-mosaic (deprecated - see AD-009)
- **Date:** 2026-02-04
- **Decision:** Use `react-mosaic-component` for the workspace tiling system.
- **Rationale:** Supports arbitrary tile trees with drag-split-resize. More flexible than allotment for the "any panel anywhere" vision.

### AD-005: Editor — Monaco
- **Date:** 2026-02-04
- **Decision:** Monaco Editor (same engine as VS Code).
- **Rationale:** Battle-tested in Electron, best TypeScript/LSP support, familiar to devs.

### AD-006: Terminal — xterm.js connected to container shell
- **Date:** 2026-02-04
- **Decision:** xterm.js in renderer, connected to a PTY that runs `container exec -it <id> /bin/bash` in the main process.
- **Rationale:** xterm.js is the standard for web-based terminals. Container exec with `-it` gives us a proper interactive shell inside the sandbox.

### AD-009: Tiling library — dockview (replaced react-mosaic → react-resizable-panels → dockview)
- **Date:** 2026-02-04
- **Decision:** Replaced `react-mosaic-component` → `react-resizable-panels` → `dockview-react@4.13.1` for workspace layout.
- **Rationale:** react-mosaic broken with React 19 (react-dnd ref deprecation). react-resizable-panels worked for resize but lacked drag-to-reposition. dockview provides full VS Code-style docking: drag tabs between groups, split to edges, tab stacking, floating panels — all React 19 compatible.
- **Packages:** `dockview-react`, `dockview-core` for workspace; `@dnd-kit/core`, `@dnd-kit/sortable` for project tab reordering.

### AD-007: Container base image strategy
- **Date:** 2026-02-04
- **Decision:** Build custom Sero base images (extending debian:bookworm-slim) with common dev tools pre-installed. Project templates layer on top.
- **Rationale:** Bare images lack basic tools (git, curl, build-essential). A Sero base image ensures agents always have what they need.

## Phase 1 — Prototype Scope

- [x] Project scaffold (Electron + React + Vite + TypeScript)
- [x] Container Manager (spawn/stop/exec/inspect per project)
- [x] Pi Agent integration (SDK sessions with containerized tool execution)
- [x] Tiled Workspace (react-mosaic with panel types)
- [x] Monaco Editor panel (read/write files inside container)
- [x] xterm.js Terminal panel (shell into container via node-pty)
- [x] Agent Chat panel (stream pi agent responses)
- [x] Project tabs (create/switch/close projects)
- [x] Command Bar (⌘K palette)

## Completed Tasks

### 2026-02-04: Initial scaffold
- Created Electron + React + Vite project structure
- Configured TypeScript, ESLint, electron-builder
- Set up main/preload/renderer process separation
- Container Manager module (spawn, stop, exec, inspect, list)
- Agent Manager module (Pi SDK sessions with containerized tools)
- IPC bridge between main and renderer
- React component skeleton (Shell, ProjectTab, TiledWorkspace, panels)
- Zustand stores for projects, workspace, and agent state

### 2026-02-04: Terminal + Agent working end-to-end
- Fixed container timing: ProjectTab shows loading spinner until container status is 'running'
- Terminal retry logic: TerminalPanel retries connection up to 10 times with 2s delay
- Switched from `child_process.spawn` to `node-pty` for real PTY support (full interactive shell)
- Fixed node-pty `spawn-helper` permissions (`chmod +x` on prebuild binary)
- Fixed HTML nesting: `button > button` → `div[role=tab] > button` in Shell tabs
- esbuild: ESM output for main process (preserves `import.meta.url` for Pi SDK), CJS for preload
- esbuild: `node-pty` marked as external (native module loaded at runtime)
- Agent confirmed working: Pi creates files, installs deps, runs builds inside container
- Terminal confirmed working: full interactive bash via `container exec -it` through node-pty

### 2026-02-04: Preview & networking working
- Fixed port collision (Sero's Vite on 5173 vs container's Vite on 5173) by using container's direct IP
- Container IP shown in project status bar (e.g., `🌐 192.168.64.x`)
- Agent system prompt updated: dev servers must bind to `0.0.0.0` (not localhost)
- Container IPs are directly routable from macOS host — no port mapping needed for any port
- Upgraded xterm.js to `@xterm/xterm` v6.0.0 (fixed `dimensions` crash on init)
- Terminal defers `open()` until container element has rendered dimensions
- Removed React.StrictMode (caused double-mount creating duplicate PTY sessions)
- Fixed node-pty `spawn-helper` permissions (prebuild binary missing +x)
- Random high port allocation to avoid collisions between projects

### AD-008: Container networking — direct IP, no port proxy needed
- **Date:** 2026-02-04
- **Decision:** Use container's direct IP address (routable from host via Virtualization.framework's network bridge) instead of building a port proxy.
- **Rationale:** Apple's container networking gives each VM a routable IP on 192.168.64.0/24. The host can reach any port on any container directly. No proxy layer needed.
- **Implication:** Dev servers inside containers MUST bind to `0.0.0.0`, not `localhost`. Agent system prompt enforces this.

### AD-010: Bind-mount workspaces — files live on host, not inside container
- **Date:** 2026-02-05
- **Decision:** Every project's `/workspace` is a bind mount from `~/.sero/workspaces/<projectId>/` on the host into the container via `--volume`. Files never live solely inside the container filesystem.
- **Rationale:** Container filesystems are ephemeral. If a container is deleted, recreated, or its storage is corrupted, all user work is lost. Bind mounts decouple file persistence from container lifecycle.
- **Implication:** Containers can be freely stopped, deleted, and recreated without losing any project files. The `create()` method always passes `--volume <hostDir>:/workspace` when running a new container.

### AD-011: Container lifecycle — stop/start, never nuke directories
- **Date:** 2026-02-05
- **Decision:** On app quit, containers are stopped with `container stop`. On app restart, containers are restarted with `container start`. If start fails, delete and recreate with the same bind mount. **Never delete Apple Container storage directories directly.**
- **Rationale:** Deleting `~/Library/Application Support/com.apple.container/containers/<id>/` directly creates "ghost containers" — the API server's registry still knows about them but their config.json is gone. These ghosts cannot be started, deleted, or recreated (name collision). The ONLY way to clear them is restarting the entire API server (`container system stop && container system start`), which is destructive to ALL containers.
- **Recovery chain in `create()`:**
  1. `inspect` → if running, return it
  2. If stopped → `container start` (fast, preserves container state)
  3. If start fails → `container delete --force` + `container run` with same bind mount (files safe on host)
  4. If delete also fails (ghost) → restart API server as last resort, then recreate
- **Root cause of ghost containers:** Our early code used `container rm` (doesn't exist — correct command is `container delete`), which failed silently, then fell back to `rm -rf` on the storage directory. This created ghosts. The filesystem nuke fallback has been permanently removed.
- **Critical rule:** `container system stop/start` kills ALL containers and may purge their storage directories. Never use it in normal operation — only as a last-resort ghost recovery.

### AD-012: Custom base image for fast container startup
- **Date:** 2026-02-05
- **Decision:** Build a custom `sero-node:latest` image (from `images/Dockerfile.sero-node`) with all dev tools pre-installed. Use this as the default image instead of `node:22-slim`.
- **Problem:** New project creation took ~18 seconds. Profiling revealed `container run` was only 0.7s — the remaining 17s was `setupContainer()` running `apt-get update && apt-get install git curl wget build-essential ca-certificates` inside every new container.
- **Solution:** Bake all tools into the image at build time. `setupContainer()` removed entirely. New project creation is now <2s total.
- **Image contents:** `node:22-slim` + git, curl, wget, build-essential, ca-certificates, procps, less, vim-tiny
- **Build:** `cd images && container build -t sero-node:latest -f Dockerfile.sero-node .`
- **Benchmark:**
  - Before: `container run node:22-slim` (0.7s) + `apt-get install` (17s) = **~18s**
  - After: `container run sero-node:latest` (0.75s) + nothing = **<1s**
- **Note:** The image is cached locally after first build. If tools need updating, rebuild the image.

## Phase Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **1** | Electron shell + containers + tiled workspace + editor + terminal + agent chat | ✅ Complete |
| **2** | Skills UI + LSP + improved editor + layouts + preview polish | 🔨 In Progress |
| **3** | Multi-agent orchestration (task trees, parallel agents, council mode) | Planned |
| **4** | Cloud migration path (E2B/Codespaces backend), hybrid local/cloud | Planned |
| **5** | Collaboration (multiplayer editing, shared sessions) | Planned |

### 2026-02-05: Phase 2 — Skills Integration
- Created `SkillManager` (electron/skill-manager.ts) — full skill lifecycle management:
  - Discovery from `~/.pi/agent/skills/` (global), `.pi/skills/` (project), custom paths
  - Uses Pi's `loadSkillsFromDir()` and `formatSkillsForPrompt()` for compatibility
  - Per-project enable/disable with `skills.json` persistence
  - Install from git URL or local directory path
  - Uninstall (delete skill directory)
  - Create new skills from scaffold template
  - Read skill content and list skill files
- Updated `AgentManager` to accept `SkillManager` and inject skills into system prompt
  - Enabled skills formatted with Pi's XML format and injected into system prompt
  - Added `read_skill` tool so agent can load full SKILL.md instructions on-demand
- Added full Skills IPC bridge (11 handlers):
  - `skills:list`, `skills:get`, `skills:readContent`, `skills:listFiles`
  - `skills:enable`, `skills:disable`, `skills:toggle`
  - `skills:install`, `skills:uninstall`, `skills:create`, `skills:discover`
- Added `skills` to preload API with typed methods
- Created `skill-store.ts` (Zustand) for renderer-side skills state
- Created `SkillsPanel` component with 4 views:
  - **Browse**: Card grid with search, scope badges, enable/disable toggles
  - **Detail**: Full SKILL.md markdown preview, file tree, enable/disable, uninstall
  - **Install**: Git URL or local path input, scope selection, curated registry links
  - **Create**: Name validation, description, scope selection, scaffolds SKILL.md template
- Registered `skills` as a dockview panel type with 🧩 icon
- Added `addSkillsPanel()` to workspace store (opens or focuses existing panel)
- Added "Skills" command to Command Bar (⌘K → Skills)
- Added `/skill:name` chat syntax with autocomplete dropdown in AgentPanel:
  - Triggers on `/skill:` input
  - Shows matching enabled skills with name and description
  - Tab/Enter to select, arrow keys to navigate
  - Loads full SKILL.md content and sends to agent with optional user arguments
- All TypeScript compiles cleanly (renderer + electron)

## Phase 2 — Skills Integration (Planned)

### Goal
Bring Pi's skill system into Sero so the agent has access to all installed skills, and give users a visual UI for discovering, installing, enabling, and creating skills.

### How Pi Skills Work (Reference)
- Skills are directories containing a `SKILL.md` with YAML frontmatter (`name`, `description`) and markdown instructions
- Pi CLI discovers them from `~/.pi/agent/skills/` (global), `.pi/skills/` (project), and configured paths
- At startup, skill names/descriptions are injected into the system prompt as available capabilities
- The agent loads the full `SKILL.md` on-demand when a task matches, then follows the instructions
- Skills can include scripts, reference docs, templates — anything the agent can read and execute
- Follows the [Agent Skills standard](https://agentskills.io/specification)

### Integration Design

#### 1. Skill Discovery & Loading (Main Process)
- On app launch, scan skill locations: `~/.pi/agent/skills/`, per-project `.pi/skills/`, any paths in settings
- Parse `SKILL.md` frontmatter to extract `name`, `description`, `compatibility`, `metadata`
- Build a skill registry: `Map<string, { name, description, path, scope: 'global' | 'project', enabled }>`
- Expose via IPC: `skills:list`, `skills:get`, `skills:enable`, `skills:disable`, `skills:install`, `skills:create`

#### 2. System Prompt Injection
- When creating an `AgentSession` for a project, inject enabled skill descriptions into the system prompt (same format Pi CLI uses)
- Add a `read_skill` tool to the agent's toolset — reads the full `SKILL.md` content so the agent can load instructions on-demand
- Mount global skills directory read-only into the container at `/skills/` so scripts/assets are accessible

#### 3. Skills UI Panel
A new workspace panel type (`skills`) accessible from the command bar (⌘K → "Skills") or a dedicated sidebar section:

**Browse & Manage View:**
- Card grid/list of all discovered skills (global + project)
- Each card shows: name, description, scope badge (global/project), enabled toggle
- Search/filter bar
- Status indicators: installed, enabled, needs setup

**Install View:**
- Install from URL (git repo or .tar.gz)
- Install from skill registries (Anthropic skills, Pi skills, community)
- Drag-and-drop a skill directory
- One-click install for curated/recommended skills

**Skill Detail View:**
- Full rendered SKILL.md (markdown preview)
- File tree of the skill directory (scripts, references, assets)
- Enable/disable toggle per project or globally
- "Run setup" button (executes the skill's setup instructions in the container)
- Delete / uninstall

**Create View:**
- Scaffold a new skill: prompts for name, description, generates the directory + SKILL.md template
- Or: "Ask the agent to create a skill" — opens agent chat with a pre-filled prompt
- Inline SKILL.md editor (Monaco) with frontmatter validation
- Live preview of how the skill will appear to the agent

#### 4. Per-Project Skill Config
- Each project can enable/disable specific skills independently
- Stored in project persistence: `projects/<id>/skills.json` → `{ enabled: string[], disabled: string[] }`
- Global skills are enabled by default; project skills override
- Skills UI shows per-project state when inside a project tab

#### 5. Skill Commands in Agent Chat
- Support `/skill:name` syntax in the agent chat input
- Autocomplete dropdown showing available skills when user types `/skill:`
- Executing a command loads the full skill into the agent context
