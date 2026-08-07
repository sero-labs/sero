# Sero Monorepo

When the user asks about pi itself (its SDK, extensions, themes, skills, TUI, or other internals), use the `pi-docs` skill — it maps every topic to the bundled pi documentation and examples.

## Structure

```
sero/
├── apps/
│   ├── desktop/          # Electron + React shell
│   ├── docs-site/        # Astro docs
│   ├── homepage/         # Sero Landing Page
│   └── web-remote/       # Web app served via Tailscale
├── packages/
│   ├── app-runtime/      # @sero-ai/app-runtime — shared hooks/context
│   ├── common/           # Shared types and utilities
│   ├── templates/        # Skills/themes/agents/user profile for new profiles
│   └── ui/               # Shared UI components, AI elements, and design tokens
├── plugins/
│   ├── sero-cron-plugin/     # Built-in plugin + background jobs
│   ├── sero-admin-plugin/    # Built-in admin/config tooling
│   └── other built-in Sero plugins...
├── turbo.json
├── pnpm-workspace.yaml
└── package.json          # Root — workspace scripts
```

## Quick Start & Commands

**Monorepo (root):**
```bash
pnpm install
pnpm build
pnpm dev
pnpm typecheck
pnpm test
pkill -f "vite"; pkill -f "electron"
```

**Typecheck (CRITICAL)**: Run `pnpm typecheck` from the monorepo root **before every commit**. All packages (renderer + electron main process via `tsconfig.electron.json`) must pass with zero errors. Never commit with `@ts-ignore`, `@ts-expect-error`, or `any` casts unless unavoidable (leave explanatory comment).

## Shared Packages & Plugins

- **`@sero-ai/app-runtime`** — React hooks (`useAppState`, `useAppInfo`, `useAgentPrompt`) + `AppProvider` for federated plugin modules
- **`@sero-ai/common`** — shared renderer-safe types/utilities. Prefer moving neutral cross-package code here (no Electron/Node-only dependencies).
- **`@sero-ai/extension-runtime`** — shared Node/runtime helpers for isolated background agent work (e.g. `runIsolatedCompletion`), used by both plugin **extensions** and the desktop **host** (e.g. adhoc PR-draft generation). Runs completions in a session with no extensions/skills/context/`APPEND_SYSTEM.md`, so background jobs can't be contaminated by a project's prompt files or trigger session-lifecycle hooks. The bundler (plugins and electron) inlines it and keeps the Pi SDK peers external. Use this (not `@sero-ai/common`) for code that needs the Pi coding-agent runtime.
- **`@sero-ai/ui`** - shared ui components 

**Tool installs are machine-shared, NEVER per-profile.** When a plugin or
feature provisions a heavyweight dependency (a Python environment, a CLI
binary, model files, …), it must install it once per machine in the shared
artifacts area — background runtimes get this via
`host.toolchains.sharedToolsDir('<app-id>')` (`SERO_HOST_ARTIFACTS_ROOT/app-tools/<app-id>`);
managed binaries themselves go through the toolchain manifest
(`docs/features/host-toolchain.md`). Never install tools under the profile's
`SERO_HOME` (e.g. `apps/<id>/`): profiles hold *data* (state, artifacts,
settings), and per-profile tool copies duplicate hundreds of MB per profile.
Resolution must follow the standard order: verified system tool first, shared
managed install second, download on first use last — with zero manual install
steps for the user.

Built-in plugins live in `plugins/sero-*-plugin/`. Most complete in-repo examples:
- `sero-git-plugin` — app + tool integration with a substantial UI
- `sero-cron-plugin` — background jobs & reminders
- `sero-admin-plugin` — config editor, log viewer, session browser
- `sero-memory-plugin` — persistent memory system & daily logs

External plugin examples live alongside this repo under `../plugins/`, notably
`sero-google-plugin` and `sero-kanban-plugin`.

## Documentation

- [docs/sero.md](docs/sero.md) — vision, platform constraints, Pi SDK philosophy
- [docs/architecture.md](docs/architecture.md) — shell layout, component hierarchy
- [docs/decisions.md](docs/decisions.md) — numbered architecture decisions (see AD-018, AD-020)
- [docs/features/memory.md](docs/features/memory.md) — memory system, tools, context injection
- [docs/reference/state-and-folders.md](docs/reference/state-and-folders.md) — config/state locations
- [docs/node-pty-setup.md](docs/node-pty-setup.md) — node-pty rebuild guide (MUST READ if terminals fail)
- [docs/themes/README.md](docs/themes/README.md) — theming & style guide
- [docs/plugins/guide.md](docs/plugins/guide.md) — creating, distributing, installing plugins
- [docs/plugins/technical.md](docs/plugins/technical.md) — plugin system internals

Logs: source-dev logs live in `~/.sero-ui/logs/` (or `$SERO_LOG_DIR`) with compatibility symlinks at `/tmp/sero-*.log`. Inside container workspaces, start at `/workspace/.sero/logs/README.md`; useful files include `dev/sero-electron.log`, `dev/sero-vite.log`, and `dev/sero-remote-<app-id>.log`.

**Selective Dev**: `SERO_DEV_PLUGINS=admin,git bash scripts/dev.sh` (rebuild skipped plugins first with `pnpm build`).

**Agent Directory (IMPORTANT)**  
Sero uses **`~/.sero-ui/agent/`** (set via `PI_CODING_AGENT_DIR` in `apps/desktop/electron/platform/env/index.ts`). Never use `~/.pi/agent/`. Single source of truth: that file exports `SERO_HOME` and `SERO_AGENT_DIR`.

**Creating a Sero Plugin (IMPORTANT)**  
Follow the `sero-plugin` skill process exactly (package structure, shared types, Pi extension, web UI, module federation, dev workflow). Registration is automatic for any `plugins/sero-*-plugin/` containing `sero.app` in its `package.json`. Built-in plugins do not appear in Plugin Manager.

**IPC Data Flow (IMPORTANT)**  
All cross-process data must update **four layers together**:
React component → Zustand store → preload (IPC) → main-process handler → Pi SDK
Types live in `src/types/ipc.ts`. Keep renderer and main-process types in sync.

**State Management Rules (CRITICAL)**
- **Never use** `localStorage` or `sessionStorage`. Persistent renderer state goes through `~/.sero-ui/layout.json` via `persistLayout()` (`src/lib/persist-layout.ts`) and `window.sero.layout` IPC. Add new keys to `LayoutState` in `src/types/layout.ts`.
- All shared state lives in Zustand stores (`src/stores/`). Cross-plugin state uses `@sero-ai/app-runtime` context or `window.sero` bridge.
- **Avoid `useEffect`**. Prefer Zustand actions, derived state, or `subscribe()`. Use `useEffect` only for external side effects (DOM events, IPC listeners, timers, third-party imperative libs).

**Container Image (CRITICAL)**
If you change `apps/desktop/images/Dockerfile.sero-node` or container-installed tools, rebuild `sero-node:latest` and recreate affected workspace containers. New workspaces do **not** automatically pick up Dockerfile changes.

**General**
- Save new documentation/plans in `@docs/` or typed subfolders
- Never commit local Pi scratch/planning files under `.pi/` (especially `.pi/plans/`); the directory is gitignored and should remain local-only.
- Use Conventional Commit messages
- Always create pull requests as drafts. Never mark a pull request ready for review unless the user explicitly asks.
- Ensure good type safety in source files when conducting PR reviews
- Avoid duplicating types that already exist in Pi SDK libraries. Import the canonical Pi types instead so upstream changes fail at typecheck time rather than becoming runtime mismatches.
- Do not delete relevant comments
- Prefer `useDebouncedCallback` / `createDebouncedFn` from `src/hooks/useDebouncedCallback.ts` over hand-rolled `setTimeout` debounce patterns
- Keep code as simple and idiomatic as possible. Never use try-catch for file existence or normal flow control. Refactor any bureaucratic/over-defensive code to the minimal readable solution.
- Always use top-level imports (no inline `import('...')` type expressions)
- When creating UI components, try to make them self-explanatorys and avoid duplicating descriptive text in multiple places
- Before creating a PR check and update the `@apps/docs-site` documentation and update as required
- When writing text/copy for Sero codebase or end-user documentation keep it simple, without convoluted long blocks of text
- Do not add sub-labels descriptions on UI components unneccesarily - components should be self-explanatory
- Unless we are doing explanatory work - or you were asked specifically - DO NOT create heuristic solutions to solve things that should be done via the AI/LLM layer
- NEVER add unnecessary clutter to UI components
- When giving instructions to manually review changes do so in simple unambiguous terms - no jargon or expectation of recent familiarity with the subject
- After making changes to `packages/*` remind that the packages may need to be republished to npm

## Styling
 - Don't use specific tailwind font-sizes, use utilities like `text-sm`,`text-base`, etc.

## File Size Rules (CRITICAL)

**Never exceed 500 LOC in any source file** (docs/css excluded). If a file grows beyond 500 lines, **refactor immediately** — split into smaller modules, extract helpers to `utils/` or `lib/`, break components into sub-components, or move types to dedicated `types.ts` files. Always check line count of every touched file before marking a task complete.

## Response style
When responding to the user, you *MUST* follow these rules

## The rules

1. **Never assume the reader kept up.** Open every substantive answer with
   one line of grounding — what we are doing and where we are — as if the
   reader just came back to their desk: "We are fixing the login timeout;
   the cause is found."
2. **ASD-STE100 Simplified Technical English.** One sentence carries one
   fact or one instruction, 20 words maximum. One word has one meaning
   everywhere. Active voice, simple tenses. Condition before command.
3. **Ubiquitous language.** Use the vocabulary the project already has — from
   `CONTEXT.md`, `CLAUDE.md`, or the codebase itself. If the project calls it
   a "lesson", never call it a "unit". When you need a new term, define it
   once, in plain words, then use it consistently.
4. **Re-pitch on demand.** If the user says "wait, what?" or looks lost,
   do not repeat yourself louder — give more context and simpler words.

## Example

Before:
> The enrollment token is fetched at boot, so there's nothing to install
> until public catches up.

After:
> We are moving your phone from the developer build to the public beta. Your
> phone gets its update permission when it starts. The public version is not
> ready yet. When it is ready, your phone will see it. You do not need to do
> anything now.

## Guardrails

Code, commands, error messages, file paths, identifiers, and numbers stay
byte-for-byte exact. This style was built for high-stakes clarity — keep it
fully on for security warnings, confirmations of destructive or irreversible
actions, and multi-step instructions where order matters. Cut ceremony, not
reasoning.

## Verify before sending

Does the first line ground the reader in context? Any sentence over 20 words?
Any invented synonym for a thing the project already named?