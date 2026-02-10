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

## Phase Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **1** | Electron shell + containers + tiled workspace + editor + terminal + agent chat | ✅ Complete |
| **2** | Skills UI + LSP + improved editor + layouts + preview polish + navigation UX | ✅ Complete |
| **3** | PI Packages and Extensions implementation | In Progress |
| **4** | Multi-agent orchestration (task trees, parallel agents, council mode) | Planned |
| **5** | Cloud migration path (E2B/Codespaces backend), hybrid local/cloud | Planned |
| **6** | Collaboration (multiplayer editing, shared sessions) | Planned |

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
- **Revisit when:** Phase 4 (multi-agent orchestration).

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

### AD-013: Container NAT — manual setup for outbound internet access
- **Date:** 2026-02-07
- **Decision:** Containers require a one-time (per-reboot) NAT setup script to access the internet. Run `sudo ./scripts/setup-container-nat.sh` after each macOS reboot.
- **Problem:** Apple Container's `default` network uses `mode: nat` with subnet `192.168.64.0/24`, but macOS does not automatically enable IP forwarding or pf NAT rules. Containers can resolve DNS (nameserver `192.168.64.1`) but TCP connections to the internet time out. This means `npm install`, `git clone`, and any other network operation inside a container fails.
- **Root cause:** Two host-side settings are missing by default:
  1. **IP forwarding** (`net.inet.ip.forwarding`) is `0` — the kernel drops packets between `bridge100` (container subnet) and `en0` (internet)
  2. **No pf NAT rule** exists to masquerade container traffic as coming from the host's IP
- **Solution:** `scripts/setup-container-nat.sh` enables both with `sudo`:
  - `sysctl -w net.inet.ip.forwarding=1`
  - Writes a scoped pf NAT anchor: `nat on en0 from 192.168.64.0/24 to any -> (en0)`
  - Loads the rules via `pfctl`
- **Safety:** The NAT rule only matches outbound traffic from `192.168.64.0/24`. No inbound ports are opened. No other host traffic is affected. This is the same mechanism macOS Internet Sharing uses.
- **Caveat:** IP forwarding resets on reboot. The script must be re-run after each restart.
- **Future:** Create a LaunchDaemon (`com.sero.container-nat.plist`) to auto-apply at boot, removing the manual step. Not yet implemented — manual re-run is sufficient for now.
- **Teardown:** `sudo ./scripts/setup-container-nat.sh --teardown` reverts all changes.


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

### AD-014: LSP integration — language servers in containers, proxied to Monaco
- **Date:** 2026-02-07
- **Decision:** Run language servers (starting with TypeScript) inside the project's container, communicating over JSON-RPC stdio via `container exec -i`. Main process manages server lifecycle and multiplexes between projects. Renderer registers Monaco providers that route requests through IPC.
- **Rationale:** Language servers need access to the project's files AND `node_modules` for accurate completions, hover info, and diagnostics. Running the server inside the container where the code lives gives perfect accuracy. The alternative — running language servers on the host — would require syncing `node_modules` or losing type information.
- **Architecture:**
  ```
  Monaco (renderer) ←IPC→ LspManager (main) ←stdio→ container exec -i typescript-language-server --stdio
  ```
- **Key design choices:**
  - One `LspProcess` per (project, language) — TypeScript server handles `.ts`, `.tsx`, `.js`, `.jsx`
  - `LspManager` auto-installs server binary (`npm install -g typescript-language-server typescript`) on first use, with retry logic for container startup races
  - Monaco providers are registered once per language ID at module level, routing via a URI registry
  - Monaco uses `typescript` language ID for both `.ts` and `.tsx` (Monaco doesn't register `typescriptreact`); LSP `didOpen` sends the correct language ID derived from file extension
  - Built-in Monaco TypeScript diagnostics disabled in `beforeMount` to avoid duplicating LSP diagnostics

### 2026-02-07: Phase 2 — LSP Integration
- Created `electron/lsp/types.ts` — LSP types, language server configs (TypeScript first), JSON-RPC message types, URI helpers
- Created `electron/lsp/json-rpc.ts` — Content-Length header parser/encoder for LSP stdio protocol
- Created `electron/lsp/lsp-process.ts` — Spawns and manages a single language server process inside a container via `container exec -i`, handles JSON-RPC framing, LSP initialization handshake, shutdown, request/response correlation
- Created `electron/lsp/lsp-manager.ts` — Orchestrates language servers across all projects, auto-installs server binaries, retry logic for container startup races (5 attempts, 2s delay), forwards diagnostics to renderer
- Updated `electron/ipc-handlers.ts` — Added 5 LSP IPC handlers (`lsp:start`, `lsp:stop`, `lsp:request`, `lsp:notify`, `lsp:hasServer`) + notification forwarding to renderer via `webContents.send`
- Updated `electron/preload.ts` — Added `window.sero.lsp` API with typed methods for start/stop/request/notify and `onNotification`/`onServerStopped` event listeners
- Updated `electron/main.ts` — LspManager instantiation, passed to `registerIpcHandlers`, `lspManager.disposeAll()` on shutdown
- Created `src/lsp/lsp-conversions.ts` — Bidirectional LSP ↔ Monaco type conversions for completions, hover, go-to-definition, diagnostics; file-path-based LSP language ID resolution
- Created `src/lsp/use-lsp.ts` — React hook managing full LSP lifecycle: server start, module-level Monaco provider registration (completion/hover/definition), document sync (didOpen/didClose/didChange/didSave), diagnostics listener, URI routing registry
- Created `src/monaco-setup.ts` — Configures `@monaco-editor/react` to use local `monaco-editor` package with Vite web workers (editor, TypeScript, JSON, CSS, HTML) instead of CDN — fixes syntax highlighting in Electron
- Updated `src/main.tsx` — Imports `monaco-setup.ts` before any component mounts
- Updated `src/components/panels/EditorPanel.tsx` — Wired in `useLsp` hook, `beforeMount` (disables built-in TS diagnostics), `onMount` (captures editor/monaco instances), `path` prop for stable model URIs, `sendDidSave` on save
- **Features working:** IntelliSense completions, hover type info, go-to-definition, real-time diagnostics (error squiggles), syntax highlighting for all languages
- **Key fix:** Monaco doesn't register `typescriptreact`/`javascriptreact` as language IDs — `.tsx`/`.jsx` must use `typescript`/`javascript` for Monaco while sending the correct LSP language ID via file extension mapping

### 2026-02-07: Phase 2 — Multi-Tab Editor
- Rewrote `EditorPanel.tsx` — multi-tab editing with full lifecycle management:
  - Open multiple files simultaneously via file tree or tab clicks
  - Tab bar with file icons, dirty indicators (●), close buttons (×), middle-click to close
  - Tabs scroll horizontally when many files are open
  - Active tab highlighted with accent underline
  - ⌘S saves active tab, ⌘W closes active tab
  - Monaco models persist per tab — undo history, cursor position preserved across tab switches
  - View state (scroll position, cursor, selection) saved/restored on tab switch via `editor.saveViewState()`/`restoreViewState()`
  - Content tracked in ref map, dirty state computed against last-saved content
  - Empty state with welcome message when no files are open
  - Models disposed on tab close to free memory
- Created `EditorTabBar.tsx` — extracted tab bar component with VS Code-style tabs:
  - Drag-to-reorder via `@dnd-kit/sortable` (same library as project tabs), constrained to x-axis
  - Overflow fade indicators (left/right gradients) appear when tabs extend beyond the container, detected via `ResizeObserver` + scroll events
  - Auto-scroll: active tab scrolls into view smoothly when selected or opened, ensuring off-screen tabs become visible
- Updated `EditorPanel.css` — new tab bar styles, welcome state, scrollable tab container, overflow fade gradients
- Updated `electron/persistence.ts` — editor state shape changed from `{ openFile }` to `{ openTabs: string[], activeTab: string | null }` with backward compatibility for legacy format
- Fixed `src/lsp/use-lsp.ts` — URI registry cleanup bug: old code iterated and deleted wrong entries on tab switch. Now uses `prevModelUriRef` to correctly track and swap model URIs

### AD-015: CSS architecture — remove global resets that conflict with Tailwind
- **Date:** 2026-02-07
- **Decision:** Removed `padding: 0` from the `* { margin: 0; padding: 0; box-sizing: border-box; }` reset in `index.html`. Renamed conflicting Sero design system CSS variables (`--text-sm`, `--text-xs`, `--radius-sm`, etc.) to `--sero-text-*` / `--sero-radius-*` to avoid clashing with Tailwind v4 theme variables.
- **Problem:** `* { padding: 0 }` in an unlayered inline `<style>` tag had higher cascade priority than ALL Tailwind `@layer utilities` styles. Every Tailwind padding class (`py-2`, `px-3`, `p-1.5`, etc.) was silently zeroed out on every element. Additionally, Sero's `:root` defined `--text-sm: 12px` which overwrote Tailwind v4's `--text-sm: 0.875rem` (14px), causing all `text-sm` utilities to render at the wrong size.
- **Root cause analysis:** CSS cascade layers mean unlayered rules (`:root {}`, `* {}` in `<style>`) always beat `@layer utilities` regardless of specificity. This is a fundamental Tailwind v4 gotcha when mixing with legacy global CSS.
- **Fix:**
  1. `index.html`: Changed `* { margin: 0; padding: 0; box-sizing: border-box; }` → `*, *::before, *::after { margin: 0; box-sizing: border-box; }` (removed `padding: 0`)
  2. `global.css`: Renamed `--text-xs/sm/base/lg/xl` → `--sero-text-xs/sm/base/lg/xl`
  3. `global.css`: Renamed `--radius-sm/md/lg` (Sero's) → `--sero-radius-sm/md/lg`
  4. Updated all 11 CSS files that referenced the old variable names
  5. Scoped `:focus-visible` rule to `not([data-slot])` to avoid overriding shadcn focus rings
- **Rule going forward:** New components use Tailwind classes and shadcn theming. Legacy Sero CSS variables prefixed with `--sero-*` are for existing components only.

### 2026-02-07: Phase 2 — File Tree Rewrite & File Watcher
- Replaced hand-rolled FileTree with `@headless-tree/core` + `@headless-tree/react` + shadcn `Tree` component:
  - Lazy directory loading via `syncDataLoaderFeature` with manual async loading
  - Controlled `expandedItems` state for targeted watcher refresh
  - Auto-expand ancestor directories of the active file
  - `tree.rebuildTree()` called explicitly when items change (headless-tree only auto-rebuilds on `expandedItems` changes, not data loader changes)
  - Indent guide lines via CSS `repeating-linear-gradient` on `before::` pseudo-element
  - Inline `paddingInlineStart` for reliable indentation (Tailwind `ps-(--tree-padding)` backup)
- Created `file-tree/file-icons.tsx` — file type icons using `@remixicon/react` mapped by filename and extension
- Replaced 8-second polling with native filesystem watching via `fs.watch`:
  - Created `electron/file-watcher.ts` — `FileWatcherManager` using recursive FSEvents on macOS
  - 150ms debounce, maps host paths → container `/workspace/...` paths
  - Pause/resume per project (pauses when project tab is not active)
  - IPC handlers: `filetree:watch`, `filetree:unwatch`, `filetree:setActive`
  - `Shell.tsx` calls `setActive` on tab switch
- Added drag-and-drop file moving:
  - `dragAndDropFeature` + `keyboardDragAndDropFeature` from headless-tree
  - `createOnDropHandler` detects moved items and runs `mv` in the container
  - `<TreeDragLine />` renders visual drop indicator
  - File watcher auto-refreshes source and destination directories
- Added inline renaming:
  - `renamingFeature` from headless-tree, triggered by F2 or context menu
  - Inline `<Input>` replaces file name, `onRename` runs `mv` in container
  - `canRename` prevents renaming the root `/workspace` node
- Created `file-tree/file-tree-ops.ts` — container operations (`moveItem`, `renameItem`, `deleteItem`, `createFile`, `createFolder`) using `container exec` with shell-safe path escaping
- Added `onPathChanged` callback (FileTree → EditorPanel):
  - When a file/directory is moved or renamed, all affected editor tabs update their paths
  - Migrates content cache, saved content, view state refs, dirty state, and Monaco models to new URIs
  - Handles directory moves (all tabs under the directory get their prefix swapped)
- Added `onDeleted` callback — closes all editor tabs matching or under the deleted path
- Created right-click context menu using shadcn `ContextMenu` (Radix UI):
  - New File / New Folder — `e.preventDefault()` keeps menu open for inline name input
  - Rename — triggers headless-tree's built-in inline rename
  - Delete — `rm -rf` in container, closes affected editor tabs
  - Copy Path — copies container path to clipboard
  - Created `src/components/ui/context-menu.tsx` — shadcn-style component with `variant="destructive"` support
  - Created `file-tree/file-tree-context-menu.tsx` — FileTree-specific menu with all actions
- CSS architecture fixes (AD-015):
  - Fixed `* { padding: 0 }` in `index.html` zeroing all Tailwind padding utilities
  - Renamed `--text-sm/xs/base/lg/xl` → `--sero-text-*` across 11 CSS files
  - Renamed `--radius-sm/md/lg` → `--sero-radius-*` across 9 CSS files
  - Context menu items now render with correct `py-2` (8px), `px-3` (12px), `text-sm` (14px)

### 2026-02-07: Phase 2 — Preview Polish, Navigation UX & Housekeeping
- **Preview Panel** rewritten with Tailwind/shadcn:
  - Replaced all CSS classes with Tailwind utilities, deleted `PreviewPanel.css`
  - Navigation buttons (back/forward/refresh) use shadcn `Button` with `Tooltip`
  - URL bar uses shadcn `Input` with monospace font
  - Port quick-switch uses `Button` variants (active port highlighted with `secondary`)
  - "Open in browser" button with `ExternalLink` icon
  - Loading state uses animated `Loader2` spinner in refresh button
  - Error state with `CircleAlert` icon and `Button` retry
  - Empty state with `Globe` icon in rounded container, `Badge` port buttons
  - All icons from `lucide-react` (replaced emoji)
- **Project navigation UX** rewritten with shadcn:
  - `CommandBar` rebuilt on shadcn `CommandDialog` (cmdk-based):
    - Proper search, keyboard nav, grouped items
    - `CommandItem` with lucide icons and `Kbd` shortcut badges
    - Controlled `open`/`onOpenChange` props (no manual overlay)
  - `SortableTab` rewritten with Tailwind:
    - `XIcon` close button (replaced × text), group-hover opacity
    - Active indicator with `bg-primary` underline
    - `Input` for inline rename
  - `Shell` rewritten with Tailwind/shadcn:
    - `Button` + `Tooltip` for new project (with `Spinner` loading state)
    - `Button variant="outline"` with `CommandIcon` + `Kbd` for ⌘K trigger
    - `TooltipProvider` wrapping entire shell
    - Extracted `EmptyState` sub-component with shadcn `Button`
  - `ProjectTab` rewritten with Tailwind/shadcn:
    - `Spinner` loading state (replaced CSS animation)
    - `CircleAlert` error state with `Button` retry
    - Status bar with `Tooltip` on every item, `Badge` for port mappings
    - `Cpu`/`MemoryStick`/`Globe` lucide icons in status bar
    - IP address clickable to copy to clipboard
  - Deleted 4 CSS files: `Shell.css`, `CommandBar.css`, `ProjectTab.css`, `PreviewPanel.css`
- **Housekeeping:**
  - Added `src/vite-worker.d.ts` — type declarations for Vite `?worker` imports (fixed 5 TS errors in `monaco-setup.ts`)
  - Refactored `agent-manager.ts` (492 LOC → 154) — extracted `agent-tools.ts` (230 LOC) and `agent-system-prompt.ts` (65 LOC)
  - Deleted unused `DraggablePanel.tsx` + `DraggablePanel.css` (dead code, not imported anywhere)
  - All project files verified under 500 LOC limit (largest: `skill-manager.ts` at 452)
  - All three builds pass clean: `tsc --noEmit`, `build-electron.mjs`, `vite build`

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

### AD-016: PI Package Installation — SDK's DefaultPackageManager, not CLI invocation
- **Date:** 2026-02-10
- **Decision:** Use `DefaultPackageManager` from `@mariozechner/pi-coding-agent` SDK directly instead of shelling out to the `pi` CLI binary.
- **Problem:** PI packages (npm, git, local) need to be installable from Sero. The `pi` CLI handles this via `pi install <source>`, but invoking it as a subprocess introduces environment complexity — `npm install -g` must resolve to the correct global prefix, `npm root -g` must return the PI-managed path, and the `pi` binary needs to find its own `package.json` for config.
- **Root cause of env complexity:** PI's `DefaultPackageManager.installNpm()` uses `npm install -g <spec>` for user-scope packages. When invoked via CLI, npm's global prefix is whatever the user's npm config says. But inside Electron's main process, `process.env.PATH` may differ from a terminal shell. Spawning `pi install` as a child process would inherit this potentially broken environment.
- **Solution:** Import `DefaultPackageManager` directly from the SDK and call it in-process. This avoids all environment issues because:
  1. `npm` is resolved via the same `PATH` the SDK itself uses
  2. `npm root -g` is called via `spawnSync` with inherited environment (same process)
  3. No subprocess env isolation to worry about
- **Implementation details:**
  - `electron/package-installer.ts` wraps `DefaultPackageManager` with `install()`, `remove()`, `update()`, `list()`, `resolve()`
  - Uses `SettingsManager.create(cwd, agentDir)` — **file-backed** so packages persist to `~/.pi/agent/settings.json`
  - This means Sero and `pi` CLI share the same package list: `pi list` shows Sero installs and vice-versa
  - `getAgentDir()` returns `~/.pi/agent/` by default
  - After install, `resolve()` returns `ResolvedPaths` with all extension/skill/prompt/theme filesystem paths
  - These paths are fed into `DefaultResourceLoader` via `additionalExtensionPaths`, `additionalSkillPaths`, etc.
  - `SkillManager.discoverAll()` also calls `resolve()` to discover skills from packages

#### PI Package Manager — Environment Variables Reference

| Variable | Purpose | Default |
|----------|---------|---------|
| `PI_CODING_AGENT_DIR` | Override `~/.pi/agent/` directory | `~/.pi/agent/` |
| `PI_PACKAGE_DIR` | Override SDK package asset directory | auto-detected from `__dirname` |
| `GIT_TERMINAL_PROMPT` | Set to `0` in CI to disable git auth prompts | (not set) |
| `GIT_SSH_COMMAND` | Custom SSH command for git operations | (not set) |

#### PI Package Manager — How npm installs work under the hood

**User scope (global):**
```
npm install -g <spec>
```
Resolves installed path via `npm root -g` → e.g. `/usr/local/lib/node_modules/<pkg>`.
The SDK caches this path in `this.globalNpmRoot`.

**Project scope:**
```
npm install <spec> --prefix <cwd>/.pi/npm/
```
Creates a local `package.json` in `<cwd>/.pi/npm/` and installs there.

**Temporary (ephemeral):**
```
npm install <spec> --prefix <tmpdir>/pi-temp-<random>/npm/
```
Used for `-e` flag packages. Cleaned up on exit.

#### PI Package Sources — Format Reference

| Format | Example | Install Method |
|--------|---------|---------------|
| npm | `npm:@foo/bar@1.0.0` | `npm install -g` (user) or `--prefix` (project) |
| npm (unversioned) | `npm:@foo/bar` | Same, but included in `pi update` |
| git (shorthand) | `git:github.com/user/repo@v1` | `git clone` to `~/.pi/agent/git/github.com/user/repo/` |
| git (HTTPS) | `https://github.com/user/repo` | Same as above |
| git (SSH) | `git@github.com:user/repo` | Same, SSH auth |
| local path | `/absolute/path/to/package` | Referenced in-place (no copy) |

#### Files Changed

| File | Change |
|------|--------|
| `electron/package-installer.ts` | **New.** Wraps `DefaultPackageManager` — install, remove, update, list, resolve |
| `electron/main.ts` | Instantiates `PackageInstaller`, wires into `SkillManager` and `AgentManager` |
| `electron/skill-manager.ts` | `discoverAll()` discovers skills from resolved packages |
| `electron/agent-manager.ts` | `createSession()` feeds resolved paths into `DefaultResourceLoader` |
| `electron/ipc-handlers.ts` | Added `packages:install`, `packages:remove`, `packages:update`, `packages:list`, `packages:resolve` |
| `electron/preload.ts` | Added `window.sero.packages` API for renderer |

#### Renderer API — `window.sero.packages`

```typescript
packages: {
  install: (source: string, options?: { local?: boolean }) => Promise<PackageInstallResult>,
  remove:  (source: string, options?: { local?: boolean }) => Promise<PackageInstallResult>,
  update:  (source?: string) => Promise<PackageInstallResult>,
  list:    () => Promise<PackageListItem[]>,
  resolve: () => Promise<ResolvedPackageResources>,
}
```
