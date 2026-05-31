# E2E test coverage expansion — design

**Status:** draft
**Owner:** monobyte
**Date:** 2026-05-17
**Target branch (next step):** spec → implementation plan

## Goal

Substantially expand Sero's automated end-to-end coverage so cross-platform
host/runtime changes can be validated without painful manual testing on every
PR. The maintainer develops on Apple Silicon macOS but ships to macOS, Linux,
and Windows x64 with three runtime backends (`host`, `apple-container`,
`docker`). The current e2e suite (8 specs under `apps/desktop/e2e/`) is
healthy but narrow: workspace/session IPC, basic agent IPC, container
lifecycle on macOS, a few UI specs that don't render reliably in headless CI.

The expanded suite must:

- Catch major workflow regressions across onboarding, workspaces, sessions,
  chat, runtimes, plugins, and CLI.
- Run on the maintainer's Mac for routine work and on spare Linux + Windows
  laptops for cross-platform signal.
- Be runnable both via GitHub Actions (on self-hosted runners, explicitly
  triggered — not per-commit) and via local scripts on the maintainer's own
  hardware.
- Be pragmatic. The suite catches *major* regressions, not every UI nit.

## Non-goals

- Visual regression / pixel-diff testing.
- Performance benchmarking.
- Accessibility audits.
- Localisation (Sero is English-only today).
- Full marketplace plugin install/update flow (covered transitively by a
  synthetic test plugin).
- Deep subagent orchestration coverage (multi-session tests catch the
  basics).
- The `web-remote` app surface (separate test story).

## Architecture

### Three layers, three Playwright projects

| Layer          | Project name | Runs                          | Purpose                                                                 | Target runtime |
| -------------- | ------------ | ----------------------------- | ----------------------------------------------------------------------- | -------------- |
| Contract       | `contract`   | every PR (GH-hosted)          | IPC surface, CLI registry, manifest parsing, runtime selection logic    | ~1-2 min       |
| Workflow       | `workflow`   | manual/self-hosted, per-OS    | full user journeys driven through the rendered Electron UI              | ~10-15 min     |
| Agent realism  | `agent`      | manual + nightly, flag-gated  | actual LLM round-trips on a small set of canonical agent flows          | ~5-10 min      |

The current 2-project config (`ci` / `local`) is replaced by these three.
Existing specs are migrated into the appropriate buckets during Phase 0.

### Test home isolation

Each spec file creates its own temp `SERO_HOME` in `os.tmpdir()` during
`beforeAll` and removes it in `afterAll`. A `seedSeroHome()` helper
pre-populates common fixtures (profile, workspace, recorded auth) for tests
that need them. This is the pragmatic middle ground: no inter-file
flakiness, no committed `.sero-test-data/` rot, modest per-spec startup
cost.

### LLM strategy

Default test runs do not call any LLM. Only the `agent` project hits a real
provider, and only when explicitly enabled.

- `SERO_E2E_LLM_MODE=off` (default) — agent realism tests skip.
- `SERO_E2E_LLM_MODE=cheap` — gpt-5.4-mini. Used in nightly CI. Budget < $0.10/run.
- `SERO_E2E_LLM_MODE=full` — gpt-5.5 - Low thinking. Manual only. Budget < $1/run.

Provider defaults to Anthropic but is configurable via env (`SERO_E2E_LLM_PROVIDER`)
so a different provider can be substituted when Anthropic is down or rate-limited.

Agent-realism tests use loose assertions (response contains a number;
specific tool was invoked with specific args) rather than exact-text
matches. Tests that *force* a tool call are preferred over tests that depend
on free-form text.

### Cross-platform execution

- **Maintainer's Mac (daily driver, Apple Silicon):** all three layers run
  locally via `pnpm e2e:*` scripts.
- **Linux laptop (spare):** registered as self-hosted GH Actions runner with
  label `sero-linux`. Also runnable directly via local script.
- **Windows laptop (spare):** registered as self-hosted GH Actions runner
  with label `sero-windows`. Also runnable directly via local script.
- **GitHub-hosted macOS/Ubuntu/Windows runners:** run the `contract` layer
  on every PR (free minutes, fast feedback).
- **Self-hosted runners:** run `workflow` and `agent` layers via
  `workflow_dispatch` only. No automatic per-commit triggers.

### Runtime coverage matrix

| OS                       | Host | Apple Container | Docker / Podman |
| ------------------------ | ---- | --------------- | --------------- |
| macOS Apple Silicon      | ✅   | ✅              | ⛔ (redundant)  |
| Linux                    | ✅   | n/a             | ✅              |
| Windows x64              | ✅   | n/a             | ⛔ (manual)     |

Docker on macOS and Docker Desktop on Windows are deferred to manual smoke
tests — the matrix focus is on each OS's most-used pairing.

## Test inventory

Layer labels: **C** = contract, **W** = workflow, **A** = agent realism.
Rough size: ~110 contract, ~80 workflow, ~8 agent realism.

### 1. First-run onboarding & profile setup
- **W** Fresh `SERO_HOME` → welcome screen renders → create profile "Test" → app boots into shell
- **W** Onboarding wizard happy path: name → storage location → API key → model selection → "open Sero"
- **W** Onboarding picks runtime: doctor detects available backends, user accepts the suggested default
- **C** Profile registry IPC: list/create/delete/setActive
- **C** Onboarding state machine transitions through each step
- **W** Skip onboarding entirely when a complete profile already exists

### 2. Profile management
- **W** Create second profile → switch → app restarts → second profile is active; first profile's workspaces not visible
- **W** Switch back → first profile's workspaces, sessions, auth all return
- **W** Custom storage location (pick external folder) → data lands at that path
- **W** Delete inactive profile → confirmation → registry no longer lists it; on-disk data preserved
- **C** Profile switch IPC triggers `app.relaunch`/`app.exit` (intercepted, not actually relaunched)

### 3. Workspace management
- **W** Add workspace from folder picker → appears in sidebar tree
- **W** Open multiple workspaces simultaneously (composite environment)
- **W** Close workspace → hidden from sidebar; re-add same path → re-opens with prior state
- **W** Workspace tree collapse/expand persistence across reload
- **W** Per-workspace runtime toggle: `host` ↔ `apple-container`/`docker`
- **W** Active workspace badge in ChatPanel reflects switching
- **C** Workspace IPC: list/create/remove/setContainer/setRuntimeBackend
- **C** Legacy `mac-host` backend value normalises to `host` on read

### 4. Session management
- **W** Create new session in a workspace → appears under that workspace in tree
- **W** Switch between sessions → ChatPanel remounts on selected session's messages
- **W** Sessions persist across app restart (jsonl on disk)
- **W** Search sessions by query in sidebar
- **W** Delete session → removed from tree and disk
- **C** Sessions IPC: create/list/delete/get; workspaceId binding correct
- **C** Multi-agent pool: two sessions stream concurrently without crossing event streams

### 5. Regular chat (UI plumbing + agent loop)
- **W** Type message → submit → user message renders → streaming indicator → assistant response renders
- **W** Abort mid-stream → stream stops → "aborted" state shown
- **W** Switch session mid-stream → original stays streaming; switched-to session shows its own state
- **W** Restore to checkpoint → message history truncates correctly
- **W** Model picker changes effective model; thinking-level toggle persists
- **W** Slash commands list populated; invoking one inserts/dispatches correctly
- **C** Agent IPC: open/close/prompt/abort/onEvent/getContext/restoreToCheckpoint/getModelState/setModel
- **A** Real round-trip: prompt "what is 2+2" against gpt-5.4-mini → assistant text contains "4"
- **A** Real tool call: prompt that forces `read_file` → tool invoked with correct args → tool result threads back → final assistant turn references content
- **A** Multi-turn: 3-message conversation maintains context
- **A** Model switch mid-conversation works without losing history

### 6. Runtime: host mode
- **W** Host runtime workspace: file create/edit/delete via editor IPC writes to real host path
- **W** Host terminal opens at workspace cwd (per-OS shell: zsh / bash / git-bash)
- **W** Host exec: `pwd` / `git status` returns expected output
- **W** Host LSP: open a `.ts` file → diagnostics arrive within timeout
- **W** Managed dev server: start vite-like server → preview URL is `127.0.0.1:<port>` → stop cleanly
- **W** Two workspaces concurrent — preview ports don't collide
- **W** Host browser pack: absent → status `installable`; installed → status `ready`; smoke screenshot of about:blank
- **C** Runtime diagnostics: capabilities + install state for each backend

### 7. Runtime: container modes (`apple-container` macOS, `docker` Linux)
- **W** Enable container backend → image pull/start → status reports `running`, IP populated
- **W** `/workspace` is the live mount; host edits visible inside container immediately
- **W** Container terminal starts in `/workspace`
- **W** Container exec: `node --version`, `git --version`, browser automation tool available
- **W** Preview port: in-container dev server reachable via `127.0.0.1:<hostPort>`
- **W** Container teardown when workspace closed/runtime switched
- **W** Doctor surfaces actionable errors when daemon down / image missing / port conflict
- **C** Container IPC: status/inspect/ensure; terminal IPC: create/write/resize/dispose/replay

### 8. File tree, editor, VCS
- **W** File tree renders workspace contents; expand/collapse
- **W** Create/rename/delete file via tree → reflected on disk
- **W** Open file in monaco editor → edit → save → disk updated
- **W** Source control panel shows git status for a dirty repo
- **W** Stage/unstage/commit through UI → git log shows new commit
- **C** Editor IPC: readFile/writeFile/listFiles across all 3 backends
- **C** VCS IPC surface present

### 9. Built-in plugins (smoke tests)
For each of `admin`, `git`, `mcp`, `memory`, `cron`, `web`, `user-feedback`:
- **W** Plugin discovered → app tile appears in sidebar → click opens federated UI without error
- **W** One primary action per plugin works (e.g. memory: add item → appears; cron: schedule fires; git: status renders; web: fetch URL)
- **C** Plugin discovery scans built-in paths and reports the expected manifest set

### 10. Synthetic test plugin (plugin contract)
Lives privately at `apps/desktop/e2e/fixtures/test-plugin/` (not in
`plugins/` — keeps the user-visible plugin list clean).
- **W** Install from local path → discovery picks it up → app mounts → state file created at expected location
- **W** Extension writes state → UI sees update via `useAppState`
- **W** UI writes state → extension sees update
- **W** Plugin invokes `useAgentPrompt` → routed to focused session
- **W** Local plugin development mode (live dev server) → `remoteEntryOverride` takes precedence
- **W** Uninstall → app tile removed; state file retention per spec
- **W** Plugin error path: broken manifest → user-visible error, app stays alive
- **C** Plugin bridge policy enforced (one bridged extension wins per session)

### 11. Synthetic MCP server (for `sero-mcp-plugin`)
Minimal MCP server fixture exposing `echo` tool + `noise://test` resource.
- **W** Configure MCP server in plugin → connection establishes → tool appears in agent toolset
- **A** Agent calls the MCP tool → server receives call → result threads back to chat
- **W** Server disconnect/reconnect handled cleanly

### 12. Sero CLI (in-process via `CliRegistry`)
- **C** Registry registers all expected core commands (workspace, session, vcs, editor, terminal, browser, devserver, apps, artifact, app-state)
- **C** Each command's argument schema parses valid input, rejects invalid
- **C** Help command lists all registered commands
- **C** `workspace list/create`, `session create/list`, `editor read/write`, `vcs status` produce expected output against a seeded workspace
- **C** Plugin-bridged custom tools surface as CLI commands when policy allows
- **W** One end-to-end CLI flow per built-in plugin (e.g. `memory add`, `cron list`)

### 13. Settings, layout, theme
- **W** Theme toggle persists across restart
- **W** Sidebar/chat panel collapse states persist via `layout.json`
- **W** Window size/position restored
- **W** Settings: API key change → reflected in agent model state

### 14. Doctor / Environment
- **W** Doctor reports tool status for the current platform
- **W** Missing tool → install/retry button surfaces; install handler mocked to assert flow
- **C** Doctor result shape stable per platform

### 15. Crash & restart resilience
- **W** Kill main process mid-session → relaunch → session resumes from jsonl, no data loss
- **W** Corrupt `workspaces.json` → app shows recovery UI, doesn't crash loop
- **W** Corrupt session jsonl → that session marked broken, others load fine

## Infrastructure

### Helpers (`apps/desktop/e2e/helpers/`)
- `seroHome.ts` — `createTempSeroHome(opts)` / `seedProfile()` / `seedWorkspace()` / `seedAuth()` / `cleanup()`
- `runtime.ts` — `withRuntime('host'|'docker'|'apple-container', fn)`
- `app.ts` — extends `launchSeroApp` with `{ seroHome, runtime, seedFn, mockRelaunch }`
- `agent.ts` — `sendPrompt`, `waitForAssistantTurn`, `abortPrompt`
- `cli.ts` — `runCli(registry, args)` returning structured stdout/exit
- `selectors.ts` — extended; audit current selectors and replace fragile
  text-based ones with `data-testid`
- `assertions.ts` — domain helpers (`expectWorkspaceVisible`, etc.)

### Fixtures (`apps/desktop/e2e/fixtures/`)
- `test-plugin/` — synthetic plugin (extension + UI + manifest + state schema)
- `test-mcp-server/` — minimal MCP server (stdio) exposing `echo` tool and `noise://test` resource
- `repos/clean.tar`, `repos/dirty.tar` — pre-baked Git repos for VCS tests
- `corrupt/` — broken `workspaces.json`, broken jsonl session for resilience tests

(No legacy install fixture — migration of pre-profile installs is out of scope.)

### LLM plumbing
- `@agent` test tag; default runs skip
- `SERO_E2E_LLM_MODE=cheap|full|off` (default `off`)
- `SERO_E2E_LLM_PROVIDER` overrides default Anthropic
- Test API key from `.env.test` (gitignored) locally; from CI secrets in Actions
- Single soft retry on flaky agent-realism tests before failing the suite

### CI workflows (`.github/workflows/`)
- `e2e-contract.yml` — every PR, `ubuntu-latest` + `macos-latest` + `windows-latest`, GH-hosted
- `e2e-workflow.yml` — `workflow_dispatch` only, inputs `{ os, runtime }`, routes to self-hosted runners by label
- `e2e-agent.yml` — `workflow_dispatch` + nightly cron, input `{ mode: cheap|full }`

Self-hosted security gate on workflow and agent jobs:
```yaml
if: github.event.pull_request.head.repo.full_name == github.repository
```
(Prevents PRs from external contributors executing on physical hardware.)

Artifacts uploaded on failure: Playwright traces, screenshots, HTML report.

### Local scripts
- `pnpm e2e` — interactive picker
- `pnpm e2e:contract|workflow|agent` — direct
- `scripts/e2e-doctor.sh` — verifies machine prerequisites per layer
- `scripts/build-test-plugin.sh` — builds fixture plugin before plugin specs
- `scripts/regenerate-fixtures.sh` — rebuilds tar/snapshot fixtures

### Playwright config
- 3 projects (`contract`/`workflow`/`agent`) replacing current 2
- Per-project `testIgnore` driven by `platform()` and env
- `workers: 1`, `fullyParallel: false` (Electron single-instance)
- `timeout: 120_000` for container specs (image pull latency)
- Reporters: HTML local, GitHub Actions in CI, JSON always (for future
  triage tooling)

## Constraints & risks

### Hard problems
1. **Headless Electron UI rendering** — workflow layer needs xvfb on Linux
   self-hosted runners, or headed mode. Validated early in Phase 2.
2. **Profile-switch relaunch** — mocked via `app.relaunch`/`app.exit`
   interception. One un-mocked sanity test per platform.
3. **Container leakage** — global teardown nukes containers with the
   `sero-test` label. Browser pack install shared across runs to avoid
   per-test re-download.
4. **Self-hosted runner security** — `if: head.repo == base.repo` gate
   on all self-hosted jobs from day one.
5. **Module Federation** — test plugin built once and loaded via
   `sero-ext://`; one dedicated test exercises the dev-server
   `remoteEntryOverride` path.
6. **LLM non-determinism** — loose assertions, prefer tool-call assertions
   over text content. Single retry on flake. Explicit cost budget.

### Platform-specific landmines
7. **Windows shell** — Git Bash/MSYS, not WSL/PowerShell. Doctor must fail
   loudly if absent.
8. **Windows paths** — at least one workspace test on a path with a space
   and a non-ASCII character.
9. **Linux file watchers** — bump `fs.inotify.max_user_watches` on the
   runner.
10. **Docker on Linux** — rootless (closer to Docker Desktop semantics) is
    the documented default for the test suite.
11. **`apple-container` is macOS-26+** — skipped on Linux/Windows with a
    clear, visible skip reason in reports.

### Test-design risks
12. **Streaming-UI assertions** — always `waitForAssistantTurn` before
    asserting message content.
13. **State-file races** — poll-with-timeout helper, never fixed sleeps.
14. **Order coupling** — new specs use `test.describe.serial` explicitly
    when ordering matters; otherwise treat each test as independent.
15. **Fixture rot** — `scripts/regenerate-fixtures.sh` plus a CI check
    that fixtures unpack and validate.
16. **Native module ABI** — self-hosted runners need Python + C++
    toolchain for `node-pty` / `better-sqlite3` / `keytar` rebuilds.

## Phasing

Each phase ends with a working suite.

| Phase | Scope                                            | Exit criterion                                                                   |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| 0     | Helpers, fixtures scaffold, 3-project Playwright | Existing specs still pass under new structure                                    |
| 1     | Contract layer (sections 1, 3, 4, 6, 7, 8, 12, 14) | Contract suite green on 3 GH-hosted OSes in <3 min, blocking PR merge            |
| 2     | Workflow layer on macOS (sections 1-8, 13-15)    | Workflow suite green on local macOS for `host` and `apple-container` in <15 min  |
| 3     | Plugin & MCP coverage (sections 9-11)            | Every shipped plugin has a smoke test; synthetic plugin contract covered         |
| 4     | Agent realism (sections 5/11 `A` tests)          | Nightly gpt-5.4-mini run completes <$0.10; full-model run via `workflow_dispatch`       |
| 5     | Cross-platform (Linux + Windows self-hosted)     | Green workflow runs on Linux + Windows via `workflow_dispatch`                   |

Phases can stop after any point and still yield leverage.

## Open questions resolved

- **Test plugin location** — private to `apps/desktop/e2e/fixtures/`.
- **Agent realism provider** — defaults to Anthropic (most realistic for
  Sero's typical user), configurable via `SERO_E2E_LLM_PROVIDER` so a
  different provider can be substituted on outage/rate-limit.
- **Legacy migration fixture** — out of scope; no snapshot.
