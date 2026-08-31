a# Sero monorepo

Sero is an agentic desktop OS - the tagline is "Grow your own Agent".
Keep solutions simple and remove complexity when possible.

For task-specific conventions, read only the relevant section of
[the repository reference](.agents/repository-reference.md). It covers product
copy, TypeScript, tests, UI, packages, and documentation.

## Required checks

- Run `pnpm typecheck` from the monorepo root before every commit. Renderer and
  Electron main-process types must pass with no errors.
- Do not use `@ts-ignore`, `@ts-expect-error`, or `any` casts unless no typed
  solution exists. Explain an unavoidable exception in a comment.
- Keep every source file at or below 500 LOC. Tests, docs and CSS are exempt. Split a source file before completion if your change takes it over the limit.
- Tautological tests considered harmful

## Runtime boundaries

- Install heavyweight tools once per machine, never in a profile. Use
  `host.toolchains.sharedToolsDir('<app-id>')` for shared artifacts and the
  toolchain manifest for managed binaries. Resolve a verified system tool
  first, a shared managed install second, and a first-use download last. Do not
  require manual installation.
- Sero's agent directory is `~/.sero-ui/agent/`, not `~/.pi/agent/`. The source
  of truth is `apps/desktop/electron/platform/env/index.ts`.

## Desktop state and IPC

**CRITICAL:** Update all four application layers together: the React component
and Zustand store, preload IPC, main-process handler, and Pi SDK. Keep the
renderer and main-process contracts in `src/types/ipc.ts` synchronized.

**CRITICAL:** Do not use `localStorage` or `sessionStorage`. Persist renderer
state in `~/.sero-ui/layout.json` through `persistLayout()` and
`window.sero.layout`. Add keys to `LayoutState` in `src/types/layout.ts`.

- Put shared state in Zustand stores. Use `@sero-ai/app-runtime` context or the
  `window.sero` bridge for cross-plugin state.
- Avoid `useEffect`. Use Zustand actions, derived state, or `subscribe()`.
  Reserve `useEffect` for external side effects such as DOM events, IPC
  listeners, timers, and imperative third-party libraries.

## High-cost changes

**CRITICAL:** If you change `apps/desktop/images/Dockerfile.sero-node` or its
installed tools, rebuild `sero-node:latest` and recreate affected workspace
containers.

## Communication and delivery

- Report in ASD-STE100 Simplified Technical English.
- Use Conventional Commit messages.
- Create pull requests as drafts. Make one ready only when the user asks.
- Put plans and task history in GitHub issues or pull request descriptions. Put
  user and plugin-author docs in `apps/docs-site/docs/`, subsystem guidance in
  the owning README, and current cross-cutting boundaries in `ARCHITECTURE.md`.

## Coding Workflow
- Use the minimum sufficient approach. Plan enough to remove material uncertainty, then execute the smallest coherent solution that satisfies the requested outcome.
- Bound each task with the requested outcome, acceptance criteria, non-goals, and what must remain untouched.
- Do not make product decisions without user consent. If feasibility findings would reduce supported workflows, change an approved experience, or remove a primary use case, stop and ask the user before implementation.
- Treat new abstractions, compatibility paths, infrastructure, or unrelated edits as signals to stop and recheck the plan against those bounds.
- Run the closest existing checks first. Add only the smallest coverage needed for changed behavior that existing checks cannot prove, and tie each new test to an acceptance criterion.
