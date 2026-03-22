# Sero Monorepo

## Structure

```
sero/
├── apps/
│   └── desktop/          # Electron + React app
├── packages/
│   ├── app-runtime/      # @sero/app-runtime — hooks for federated app modules
│   ├── pi-todo-extension/# Pi extension + federated UI (todo app)
│   └── other Sero apps....
├── turbo.json
├── pnpm-workspace.yaml
└── package.json          # Root — workspace scripts
```

## Quick Start

```bash
cd apps/desktop
bash scripts/dev.sh                # Start everything (remote + host + Electron)
pkill -f "vite"; pkill -f "electron"  # Kill
```

## Monorepo Commands

```bash
pnpm install               # Install all workspace deps
pnpm dev                   # Dev the desktop app (alias)
pnpm build                 # Build all (turbo)
pnpm typecheck             # Typecheck all (turbo)
```

## Packages

- **`@sero/app-runtime`** — React hooks (`useAppState`, `useAppInfo`, `useAgentPrompt`) + `AppProvider` context for federated app modules

Find all the Sero Apps in: `packages/pi-*`;
The most comprehensive examples are:
- `packages/pi-kanban-extension` - Deep integration with subagents
- `packages/pi-cron-extension` - Background jobs and reminders
- `packages/pi-imagegen-extension` - Image Generation
- `packages/pi-humanizer-extension` - One-time-prompts

## Documentation

- [docs/sero.md](docs/sero.md) — vision, platform constraints, Pi SDK philosophy
- [docs/architecture.md](docs/architecture.md) — shell layout, component hierarchy
- [docs/decisions.md](docs/decisions.md) — numbered architecture decisions with rationale
- [docs/apps-tutorial.md](docs/apps-tutorial.md) — step-by-step guide to building new Sero apps
- [docs/memory.md](docs/memory.md) — memory system architecture, tools, context injection, proactive logging
- [docs/state-and-folders-analysis.md](docs/state-and-folders-analysis.md) — config/state locations and rationale
- [docs/node-pty-setup.md](docs/node-pty-setup.md) — node-pty native module rebuild guide (MUST READ if terminals fail)
- [docs/libs/container.md](docs/libs/container.md) — Apple Container CLI reference + ghost container protocol
- [docs/themes/README.md](docs/themes/README.md) - Theming and style guide
- [docs/plugins-guide.md](docs/plugins-guide.md) — creating, distributing, and installing Sero plugins
- [docs/plugins-technical.md](docs/plugins-technical.md) — plugin system internals (architecture, IPC, file layout)

## Typecheck Before Commit (CRITICAL)

**You MUST run `pnpm typecheck` from the monorepo root before committing any code.** This runs `turbo run typecheck` across all packages (renderer, electron main process, and every app/extension).

- **All packages must pass with zero errors.** Do not commit code that introduces type errors.
- **Do not ignore, suppress, or work around failures** with `@ts-ignore`, `@ts-expect-error`, or `any` casts unless there is no other viable fix — and even then, leave a comment explaining why.
- **If typecheck fails, fix the errors before committing.** Do not defer fixes to a follow-up commit.
- **The desktop app runs two tsconfigs:** `tsc --noEmit` (renderer/src) and `tsc -p tsconfig.electron.json --noEmit` (electron main process). Both must pass.

---

## File Size Rules (CRITICAL)

1. **NEVER let a source file exceed 500 lines of code.** If a source file you are creating or editing grows beyond 500 LOC, you **MUST** refactor it immediately — split the code into smaller modules grouped by related functionality. - This doesn't apply to documentation.
Don't just trim blank lines to get under 500 LOC, extract code into separate files proactively.
2. **Before finishing any task**, check the line count of every source file you touched. If any exceed 500 LOC, refactor before marking the task complete.
3. **Preferred split strategies:** extract helper functions into `utils/` or `lib/` files, break large components into sub-components, move types/interfaces into dedicated `types.ts` files, and separate business logic from UI rendering.

---

## Desktop App (`apps/desktop/`)

macOS Electron desktop app — an agent-first workspace where coding, chat, and
tools live in one window. React 19 + Tailwind 4 + shadcn/ui + Zustand.

### Build & Run

```bash
cd apps/desktop                    # All commands run from here
node scripts/build-electron.mjs   # Build Electron main + preload
bash scripts/dev.sh                # Start remote + host + Electron
pkill -f "vite"; pkill -f "electron"  # Kill
```

Logs: `/tmp/sero-vite.log`, `/tmp/sero-remote-<app-id>.log`, `/tmp/sero-electron.log`

### Selective Dev Mode

- `SERO_DEV_APPS=todo,kanban bash scripts/dev.sh` starts dev servers only for listed apps; skipped apps load from their built `dist/ui` bundles via `sero-ext://`.
- When testing skipped apps, rebuild the remotes first with `pnpm build` so their `dist/ui` assets are current.

### Typecheck

```bash
cd apps/desktop && npx tsc --noEmit
```

### Development Approach

Build incrementally. New components start as **named placeholders with a label**
— get the layout and data flow right first, then fill in real functionality one
piece at a time.

### Key Architecture

Shell + mountable apps. See [docs/architecture.md](docs/architecture.md) for
layout diagrams, component hierarchy, and state management.

```
┌─────────────────────────────────────────────────────────────┐
│  TitleBar (⊞ sidebar toggle … app name … ⌘K … ⊟ chat)     │
├──────────┬──────────────────────────────┬─┬─────────────────┤
│  Main    │                              │║│                 │
│  Sidebar │     Active App               │║│  Chat Panel     │
│  (apps   │     (CodingWorkspace / etc.) │║│  (global agent) │
│  + chats)│                              │║│                 │
├──────────┴──────────────────────────────┴─┴─────────────────┤
│  StatusBar                                                   │
└─────────────────────────────────────────────────────────────┘
```

- **MainSidebar** (left, collapsible) — app list + chat sessions
- **ChatPanel** (right, collapsible + resizable) — global agent, persists across apps
- **Active App** — currently CodingWorkspace; others are placeholders

### Agent Directory (IMPORTANT)

Sero uses **`~/.sero-ui/agent/`** as its agent directory, **not** `~/.pi/agent/`.
This is set via `PI_CODING_AGENT_DIR` in `electron/env.ts` before any SDK imports.

- **All paths** (`auth.json`, `settings.json`, `sessions/`, `skills/`, `extensions/`, `packages/`) resolve under `~/.sero-ui/agent/`.
- **`~/.pi/agent/`** is the Pi CLI's independent directory — Sero does not read from or write to it.
- **Single source of truth** for paths: `electron/env.ts` exports `SERO_HOME` and `SERO_AGENT_DIR`. Import from there — never hardcode paths.
- **App packages** are registered in `~/.sero-ui/agent/settings.json` under `"packages"`.

### Key Conventions

- `src/components/layout/` — shell-level (TitleBar, MainSidebar, ChatPanel, StatusBar)
- `src/components/apps/<name>/` — self-contained app components
- `src/components/ui/` — shadcn/ui primitives
- `src/components/ai-elements/` — Vercel ai-elements chat components (source, not node_modules)

- **Always use top-level imports.** Never use inline `import('...')` type
  expressions (e.g. `param: import('./types').Foo`). Add a proper
  `import type { Foo } from './types'` at the top of the file instead. The only
  exception is native addons that **must** use `require()` at runtime — wrap
  those in a typed helper module (see `electron/lib/native-pty.ts`).

### Creating a Sero App (IMPORTANT)

**When asked to create a new Sero app, you MUST read
[docs/apps-tutorial.md](docs/apps-tutorial.md) first.** It covers the full
process: package structure, shared state types, Pi extension, web UI, module
federation setup, and dev workflow. Do not improvise — follow the tutorial
step by step.

**App registration is fully automatic.** The host (`apps/desktop/`) auto-discovers
all `packages/pi-*/` directories that have a `sero.app` manifest in their
`package.json`. No manual edits to `vite.config.ts`, `federation-registry.ts`,
`electron/main.ts`, or `dev.sh` are needed — just create the package, run
`pnpm install`, and restart the dev server.

**Built remote requirement:** Production remote bundles must use a relative Vite
`base` (`'./'`) so `sero-ext://` can resolve chunk preloads and assets correctly.
If the remote Vite config uses `root: 'ui'`, the package must include
`ui/index.html` or `vite build` will fail.

**Tool bridging (AD-020):** All extension tools are automatically bridged into
the single `sero-cli` tool — they do NOT appear as standalone tool schemas.
Always use `pi.registerTool()` in extensions, never `customTools` in
`createAgentSession()`. New tools must be added to `TOOLS_TO_BRIDGE` in
`electron/cli/index.ts`. See [docs/decisions.md](docs/decisions.md) AD-020.

### IPC Data Flow (IMPORTANT)

All data between the UI and the agent passes through **four layers**. When adding
or changing any feature that crosses the process boundary, **every layer must be
updated together** or data will silently drop:

```
React component → Zustand store → preload (IPC bridge) → main-process handler → Pi SDK
src/components/    src/stores/      electron/preload.ts  electron/ipc/          session.*()
```

Each layer has its own types and may need to transform data (e.g. the main
process converts renderer-friendly `ChatAttachment` objects into Pi SDK
`ImageContent` objects). If you add a parameter at one layer but forget another,
the feature appears to work in the UI but silently fails at the agent.

**Key rules:**

- **Types live in `src/types/ipc.ts`** — shared by renderer and main process.
  The renderer-side window API is typed in `src/types/electron.d.ts`. Keep both
  in sync.
- **User messages are optimistic.** The store appends them immediately on send;
  the `message_start` event handler skips incoming user messages to prevent
  duplicates.
- **Renderer vs Electron rebuild.** Vite HMR only covers renderer code
  (`src/`). Changes to `electron/preload.ts` or `electron/ipc/` require
  `node scripts/build-electron.mjs` **and** an Electron restart to take effect.

### State Management Rules (CRITICAL)

- **NEVER use `localStorage` or `sessionStorage`** — this is an absolute ban,
  not a guideline. All renderer state that must persist across reloads is
  stored in the filesystem-backed layout file (`~/.sero-ui/layout.json`) via
  the `persistLayout()` helper in `src/lib/persist-layout.ts` and the
  `window.sero.layout.save/load` IPC bridge. There is no profile-storage
  module — it was removed.
  - **`sessionStorage`** is forbidden entirely. Any state that must survive
    within a session should be tracked in a Zustand store, in a file inside
    `SERO_HOME` via IPC, or in the profile registry (`profiles.json`).
  - All shared state lives in Zustand stores (`src/stores/`). Cross-boundary
    state (e.g. for federated modules in `@sero/app-runtime`) is passed via
    context providers or the `window.sero` IPC bridge.
  - If you think you need browser storage, **ask first** — there is almost
    always a better alternative (Zustand, IPC-backed file state, or the
    layout file).

### Avoid `useEffect` — Prefer Zustand (CRITICAL)

**Do not reach for React `useEffect` as a first resort.** Most uses of
`useEffect` in this codebase can (and should) be replaced with Zustand
store actions, subscriptions, or derived state. `useEffect` causes
unnecessary render cycles, hides data flow, and makes components harder
to reason about.

**Preferred alternatives:**

| Instead of…                                  | Use…                                                              |
|----------------------------------------------|-------------------------------------------------------------------|
| `useEffect` to fetch data on mount           | Zustand async action called from an event handler or store init   |
| `useEffect` to sync two pieces of state      | Zustand derived state / selector, or compute inline during render |
| `useEffect` to react to prop/state changes   | Zustand `subscribe()` or `useStore` selector with equality check  |
| `useEffect` to run cleanup on unmount        | Zustand store `destroy()` / cleanup action                        |
| `useEffect` + `setState` (set-on-render)     | Compute the value directly — no effect needed                     |

**When `useEffect` is acceptable:**

- Subscribing to **external, non-React sources** (DOM events, IPC listeners,
  `IntersectionObserver`, timers) that genuinely require setup/teardown.
- One-shot initialisation in **leaf components** with no store equivalent
  (e.g. a `ref`-based scroll-to-bottom).
- Third-party library integration that requires imperative lifecycle hooks.

**Refactor on encounter:** When you touch a file that contains a `useEffect`
that could be replaced with a Zustand pattern, **refactor it as part of
your change.** Do not leave avoidable `useEffect` calls behind in files
you are already modifying.

---

### Desktop Notifications (`sero:notify` EventBus)

Extensions show native desktop notifications via the shared Pi SDK EventBus —
no `require('electron')` needed.

- **Extension emits:** `pi.events.emit('sero:notify', { message, type?, source?, sound?, subtitle? })`
- **Host listens:** `electron/sero-extension.ts` → calls `showNotification()` from `electron/notifications.ts`
- `sound` — `true` (default chime), a macOS sound name (`"Glass"`, `"Hero"`, etc.), or `false` (silent)
- `type` — `'info'` | `'warning'` | `'error'` (default: `'info'`)

### Container Integration (AD-018)

Every workspace runs inside a native macOS container (Apple Containerization
framework). See [docs/decisions.md](docs/decisions.md) AD-018 for full details.

**Key points:**

- **One container per workspace** — `sero-<workspaceId>`, shared by all sessions
- **Lazy start** — containers spin up on first agent prompt, not on workspace open
- **Host orchestration** — Pi SDK `AgentSession` runs on Electron host; tool
  execution (bash, read, write, edit, ls, read_terminal) is proxied into the
  container via `container exec`
- **Bind mount** — workspace files mounted `<host path>` → `/workspace`
- **SSH forwarding** — `--ssh` on `container run` for git with private repos
- **Container code** lives in `electron/container/` — types, lifecycle, files,
  terminal, image, tools, system-prompt, file-watcher
- **Ghost containers** — follow the protocol in
  [docs/libs/container.md](docs/libs/container.md). NEVER delete container
  storage directories directly. NEVER restart the API server in normal operation.
- **Container CLI** is at `/usr/local/bin/container` (v0.8.0+)

### Widevine DRM / Castlabs Electron

Sero uses the [castlabs Electron fork](https://github.com/castlabs/electron-releases)
instead of stock Electron. This is a drop-in replacement that adds Widevine CDM
support (required by the Spotify Web Playback SDK for audio decryption).

- **`components.whenReady()`** must be awaited before `createWindow()` in
  `electron/main.ts` — this triggers CDM download on first launch.
- **VMP signing** is required on macOS. Without a production VMP signature,
  Spotify's Widevine license server returns 500. Run `pnpm sign-vmp` (or
  `bash scripts/sign-vmp.sh`) from `apps/desktop/`. Re-run after `pnpm install`.
- **User-Agent** — `session.defaultSession.setUserAgent()` strips "Electron"
  from the UA; some DRM services reject Electron UAs.
- **Release packaging** uses the locally installed castlabs Electron dist and
  stages built-in app packages/templates into `dist/electron/builtin/`, so
  packaged builds do not depend on the monorepo `packages/` directory at runtime.

### node-pty Native Module (CRITICAL)

Interactive terminals use `node-pty` to spawn `container exec -it` sessions.
**node-pty requires a native binary compiled for the exact Node ABI version.**

The prebuilt binaries shipped with node-pty frequently do NOT match. If
terminals fail with `posix_spawnp failed`, **you must rebuild from source:**

```bash
cd /path/to/sero/sero   # monorepo root
npx node-gyp rebuild --directory=node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
```

**Rebuild is needed after:** changing Node version, running `pnpm install`
(may restore prebuilds), or switching machines.

See [docs/node-pty-setup.md](docs/node-pty-setup.md) for full troubleshooting.

### Banned Patterns (CRITICAL)

These patterns are **absolutely forbidden** without explicit approval from the
project owner. Do not introduce them under any circumstances.

1. **No `localStorage` or `sessionStorage`.** All persistent renderer state
   must go through the filesystem-backed layout file via `persistLayout()`
   from `src/lib/persist-layout.ts` and `window.sero.layout.save/load`. The
   old `profile-storage.ts` module has been removed. If you need a new
   persisted key, add it to the `LayoutState` interface in
   `src/types/layout.ts` — that is the single source of truth used by the
   renderer, electron main process, and IPC bridge types.

2. **No inline `import('...')` type expressions.** Never write
   `param: import('./types').Foo` or `type X = import('./module').Bar`.
   Always use a proper `import type { Foo } from './types'` at the top of the
   file. The only exception is native addons that **must** use `require()` at
   runtime — wrap those in a typed helper module.

3. **No unnecessary dynamic `await import('...')`** for source-file modules.
   Use standard top-level imports. Dynamic imports are only acceptable for
   truly optional runtime dependencies (e.g. native addons that may not be
   installed) — not for lazy-loading local source modules.

### General
- When creating documentation or plans, save them in @docs/ or a subfolder by type
- When asked to create a PR, use the Github CLI
- Use Conventional Commit-style messages for all git commits and PR titles
- When reviewing a PR, always make sure there's good type safety
- Don't delete comments unless they are obvious or no longer relevant - they offer important context unfamiliar users
- **Prefer `useDebouncedCallback` / `createDebouncedFn`** from `src/hooks/useDebouncedCallback.ts` over hand-rolled `setTimeout` debounce patterns. When you encounter an existing hand-rolled debounce, refactor it to use these helpers.
- **HTML files can be previewed in-app.** The editor supports rendering
  `.html` and `.htm` files in a sandboxed iframe preview (same code/preview
  toggle as markdown). When you generate or reference an HTML file, open it
  in the Sero editor rather than suggesting the user open it in an external
  browser. The preview handles self-contained HTML (inline CSS/JS, data:
  images) — relative asset paths won't resolve.
