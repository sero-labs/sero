# Sero Monorepo
You are my helpful AI assistant working on Sero an agentic desktop OS.
Sero is special because it provides a self-improving, plugin based architecture that helps us build complex AI driven applications inside the host.
We are building the application together and I like to aim for the simplest solution and to reduce complexity wherever possible.
Below is some useful information and some of my coding preferences.

## Structure

```
sero/
├── apps/
│   ├── desktop/            # Electron + React shell
│   ├── docs-site/          # Astro docs
│   ├── homepage/           # Sero Landing Page
│   └── web-remote/         # Web app served via Tailscale
├── packages/
│   ├── app-runtime/        # shared hooks for Sero plugins
│   ├── common/             # shared types & utilities (no Electron/Node-only dependencies)
│   ├── extension-runtime/  # shared Node/runtime helpers for isolated background agent work in Sero plugins
│   ├── templates/          # Skills/themes/agents/user profile for new profiles
│   └── ui/                 # Shared UI components, AI elements, and design tokens
├── plugins/
│   ├── sero-cron-plugin/   # Built-in plugin + background jobs
│   ├── sero-admin-plugin/  # Built-in admin/config tooling
│   └── other built-in Sero plugins...
├── turbo.json
├── pnpm-workspace.yaml
└── package.json          # Root — workspace scripts
```

**Typecheck (CRITICAL)**: Run `pnpm typecheck` from the monorepo root **before every commit**. All packages (renderer + electron main process via `tsconfig.electron.json`) must pass with zero errors. Never commit with `@ts-ignore`, `@ts-expect-error`, or `any` casts unless unavoidable (leave explanatory comment).

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
- `sero-orchestrator-plugin` — orchestrate dynamic AI workflows via a DAG
- `sero-admin-plugin` — config editor, log viewer, session browser
- `sero-cron-plugin` — background jobs & reminders

Logs: source-dev logs live in `~/.sero-ui/logs/` (or `$SERO_LOG_DIR`) with compatibility symlinks at `/tmp/sero-*.log`. Inside container workspaces, start at `/workspace/.sero/logs/README.md`; useful files include `dev/sero-electron.log`, `dev/sero-vite.log`, and `dev/sero-remote-<app-id>.log`.

**Selective Dev**: `SERO_DEV_PLUGINS=admin,git bash scripts/dev.sh` (rebuild skipped plugins first with `pnpm build`).

**Agent Directory (IMPORTANT)**  
Sero uses **`~/.sero-ui/agent/`** (set via `PI_CODING_AGENT_DIR` in `apps/desktop/electron/platform/env/index.ts`). Never use `~/.pi/agent/`. Single source of truth: that file exports `SERO_HOME` and `SERO_AGENT_DIR`.

**Creating a Sero Plugin (IMPORTANT)**  
Follow the `sero-plugin` skill process exactly (package structure, shared types, Pi extension, web UI, module federation, dev workflow). Registration is automatic for any `plugins/sero-*-plugin/` containing `sero.app` in its `package.json`

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
- **CRITICAL** Only report to me in ASD-STE100 Simplified Technical English.
- Tests are good. Endless smoke tests or "regression tests" for feature deletions, etc. much less good. Tests should be functional, not just for the sake of it.
- When reviewing a PR, a branch, or a diff — use the `sero-code-review` skill (not the built-in `code-review`)
- Save new documentation/plans in `@docs/` or typed subfolders
- Use Conventional Commit messages
- Always create pull requests as drafts. Never mark a pull request ready for review unless the user explicitly asks
- Always add code reviews as a comment in related Github issue
- Code should be self-explanatory, but include concise comments where the purpose cannot be inferred easily
- Avoid duplicating types that already exist in Pi SDK libraries. Import the canonical Pi types instead so upstream changes fail at compile time
- When using Typescript, take advantage of it's type system. Trust it. Don't check for things it guarantees.
- Don't write one-line wrappers and casting functions in Typescript, you are not a Python dev. TS should be written like TS not Python.
- Prefer `useDebouncedCallback` / `createDebouncedFn` from `src/hooks/useDebouncedCallback.ts` over hand-rolled `setTimeout` debounce patterns
- Keep code as simple and idiomatic as possible. Never use try-catch for file existence or normal flow control. Refactor any bureaucratic/over-defensive code to the minimal readable solution. Channel 'YAGNI' principles.
- Always use top-level imports (no inline `import('...')` type expressions)
- Before creating a PR check and update the `@apps/docs-site` documentation and update as required
- When writing text/copy for Sero codebase or end-user documentation keep it simple, without convoluted long blocks of text
- NEVER add unnecessary clutter to UI components. For instance do not add sub-labels descriptions on UI components unneccesarily - components should be self-explanatory
- Unless we are doing explanatory work - or you were asked specifically - DO NOT create heuristic solutions to solve things that should be done via the AI/LLM layer
- After making changes to `packages/*` remind that the packages may need to be republished to npm
- UX prototypes should be saved in `docs/prototypes`. Always create a prototype when developing a new feature or component. Prototypes should be static unless stated (see existing examples).
- When the user asks about pi itself (its SDK, extensions, themes, skills, TUI, or other internals), use the `pi-docs` skill — it maps every topic to the bundled pi documentation and examples.
- If your 

## Styling
 - Don't use specific tailwind font-sizes, use utilities like `text-sm`,`text-base`, etc.

## Test Rules (CRITICAL)

**Test behaviour deterministically. A live model in a test is a last resort, not a default.**

Before writing any test that calls a real model, answer in the PR or commit body:
*which property does this prove that a deterministic test cannot?* If you cannot
answer it in one sentence, write the deterministic test instead.

- **Stub the model, test the contract.** Parsing, validation, repair, gates,
  tokens, receipts, and state machines take a canned model reply as input. These
  run in milliseconds. See `runtime/__tests__/approval-gate.test.ts` and
  `trigger-extractor.test.ts` for the pattern.
- **A live-model test may only assert provider integration** — that the real
  provider authenticates, streams, calls a tool, and keeps session context.
  It must never be the guard on a safety property; back the property with a
  deterministic test and let that be the guard.
- **Never re-prove a mechanism through the model.** If a run needs a plan, a
  gate, or an event to exist, seed the state directly. Driving the whole app
  through a planner to reach one assertion is the anti-pattern.
- **No multi-minute polls.** A single `expect.poll` timeout above 120s needs an
  inline comment justifying it. Timeouts must sit above the *measured* tail, not
  a guess — a timeout below the real tail is a flake, not a test.
- **When a live e2e finds a bug, back-fill the fix as a deterministic test and
  delete or shrink the e2e.** The e2e has already paid for itself at that point;
  keeping it running re-buys the same finding every night.
- **Beware the LLM gate.** Specs gated on model credentials skip whole files
  locally, hiding ordinary UI and selector breakage until CI. Keep deterministic
  setup assertions out of gated specs.
- Delete any test whose cost (wall-clock, spend, flake rate) exceeds the unique
  coverage it provides. Duplicated coverage is not a reason to keep a slow test.

## File Size Rules (CRITICAL)

**Source files: never exceed 500 LOC** (docs/css excluded). If a file grows beyond 500 lines, **refactor immediately** — split into smaller modules, extract helpers to `utils/` or `lib/`, break components into sub-components, or move types to dedicated `types.ts` files. Always check line count of every touched file before marking a task complete.

**Test files: the 500 LOC cap does not apply.** Line count is the wrong metric for a test — test length is driven by fixtures and setup, not by responsibility count. Splitting a test file does not reduce complexity: it duplicates the setup and buys another import graph and another environment boot (a fresh `jsdom` costs ~333ms per file). The rule instead is:

> **One test file per module under test.** Split a test file only when the module it covers is split.

A test file over **800 LOC** is a review prompt, not a failure — check it still covers one module, then leave it alone if it does. Never split a test file to satisfy a line count, and never create a new test file for a module that already has one.
