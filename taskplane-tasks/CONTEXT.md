# Sero — Task Area Context

**Last Updated:** 2026-03-23
**Status:** Active
**Next Task ID:** SERO-013

---

## Current State

Sero is an agent-first macOS desktop workspace built on Electron + React 19 +
Tailwind 4 + Zustand. The monorepo has two main parts:

- **`apps/desktop/`** — Electron host app (shell, chat panel, sidebar, status bar)
- **`packages/pi-*/`** — Federated Sero apps (kanban, cron, imagegen, notes, spotify, etc.)

The platform uses Apple's native Containerization framework to run each workspace
in an isolated container. Pi SDK (`AgentSession`) is the intelligence layer —
agent sessions run on the Electron host and proxy tool execution into containers.

Apps are auto-discovered from `packages/pi-*/` via `sero.app` manifest in
`package.json`. Module Federation connects host ↔ remote UIs. Extension tools
are bridged through the single `sero-cli` tool (AD-020).

### Key tech stack
- **Renderer:** React 19, Tailwind 4, shadcn/ui, Zustand, Vite
- **Main process:** Electron (castlabs fork for Widevine DRM), Pi SDK
- **Apps:** Module Federation remotes, `@sero-ai/app-runtime` hooks
- **Containers:** Apple Containerization framework, one per workspace
- **Agent:** Pi SDK AgentSession, extensions via `pi.registerTool()`

---

## Key Files

| Category | Path |
|----------|------|
| Tasks | `taskplane-tasks/` |
| Config | `.pi/task-runner.yaml` |
| Config | `.pi/task-orchestrator.yaml` |
| Monorepo root | `AGENTS.md` |
| Desktop app | `apps/desktop/` |
| App packages | `packages/pi-*/` |
| Shared runtime | `packages/app-runtime/` |
| Architecture | `docs/architecture.md` |
| Decisions log | `docs/decisions.md` |
| Apps tutorial | `docs/apps-tutorial.md` |

---

## Technical Debt / Future Work

_Items discovered during task execution are logged here by agents._
