# E2E Test Coverage — Phase 2: macOS Workflow Layer Implementation Plan

**Date:** 2026-05-18  
**Spec:** `docs/superpowers/specs/2026-05-17-e2e-test-coverage-design.md`  
**Depends on:** Phase 0 foundation + Phase 1 contract layer  
**Scope:** Workflow layer on macOS for sections **1-8** and **13-15**  
**Out of scope:** agent-realism tests, synthetic plugin, synthetic MCP, Phase 3 plugin coverage, Phase 4 LLM coverage, Linux/Windows workflow expansion.

## Goal

Expand Sero’s `workflow` Playwright project with macOS user-journey coverage that drives the rendered Electron UI and validates major end-to-end workflows for:

1. First-run onboarding & profile setup
2. Profile management
3. Workspace management
4. Session management
5. Regular chat UI plumbing, without real LLM calls
6. Runtime: host mode
7. Runtime: `apple-container`
8. File tree, editor, VCS
13. Settings, layout, theme
14. Doctor / Environment
15. Crash & restart resilience

## Global Constraints

- All new specs use suffix: `*.workflow.spec.ts`.
- No agent-realism tests.
- No synthetic plugin or MCP fixture work.
- Workflow specs may use locators/clicks.
- Every new spec creates an isolated home with `createTempSeroHome()`.
- Every spec cleans up temp homes in teardown.
- Explorer activation must use:

```ts
await page.evaluate(() => window.__appControl?.openApp('explorer'));
```

- Runtime-specific specs must use `runtimeSkipReason(...)`.
- Touched source files must remain under **500 LOC**.
- Avoid growing `layout.workflow.spec.ts` beyond 500 LOC; split instead.
- Avoid `localStorage` / `sessionStorage`.
- Prefer polling / event-driven waits over fixed sleeps.
- Final verification must include:
  - `pnpm typecheck`
  - `SERO_E2E_RUNTIME=host pnpm --filter @sero/desktop e2e:workflow`
  - `SERO_E2E_RUNTIME=apple-container pnpm --filter @sero/desktop e2e:workflow`

## Task 0 — Baseline audit and safety check

**What:** Confirm branch/files before edits and identify files near 500 LOC.

**Files:** No edits.

**Commands:**

```bash
git status --short
git branch --show-current
find apps/desktop/e2e -maxdepth 2 -type f | sort
wc -l apps/desktop/e2e/*.workflow.spec.ts apps/desktop/e2e/helpers/*.ts
pnpm --filter @sero/desktop e2e:workflow -- --list
```

**Acceptance criteria:**
- Phase 0/1 helpers exist.
- Existing workflow specs are listed.
- Any touched file near 500 LOC is identified before edits.
- No files changed.

## Task 1 — Add workflow helper utilities

**What:** Add small helper functions for workflow specs: launching isolated homes, opening Explorer, waiting for shell readiness, creating temp workspace directories, and safe restart handling.

**Constraints:**
- Keep helper small and generic.
- Do not add helpers for unimplemented future phases.
- No inline dynamic imports.
- No broad `any`.
- Seed active profiles using the current profile registry path: `<temp-root>/.sero-ui/profiles.json`, not the obsolete `profiles/registry.json` shape.

**Files:**
- Create: `apps/desktop/e2e/helpers/workflow.ts`
- Create: `apps/desktop/e2e/helpers/__tests__/workflow.test.ts`
- Modify: `apps/desktop/e2e/helpers/index.ts`

**Expected shape:**

```ts
export async function waitForShell(page: Page): Promise<void> {
  await expect(page.locator(layout.appShell).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(layout.sidebarToggle)).toBeVisible({ timeout: 10_000 });
}

export async function openExplorer(page: Page): Promise<void> {
  await page.evaluate(() => window.__appControl?.openApp('explorer'));
}
```

**Verification:**

```bash
pnpm --filter @sero/desktop test -- e2e/helpers/__tests__/workflow.test.ts
pnpm --filter @sero/desktop typecheck
```

## Task 2 — Normalize existing workflow specs to isolated temp homes

**What:** Update existing workflow specs to use `createTempSeroHome()` instead of fixed `.sero-*` directories or default `.sero-test-data`.

**Files:**
- `apps/desktop/e2e/agent-ui.workflow.spec.ts`
- `apps/desktop/e2e/app-shell.workflow.spec.ts`
- `apps/desktop/e2e/file-tree.workflow.spec.ts`
- `apps/desktop/e2e/vcs.workflow.spec.ts`
- `apps/desktop/e2e/container.workflow.spec.ts`
- `apps/desktop/e2e/scroll-fix.workflow.spec.ts`

**Constraints:**
- Do not use committed or repo-local state directories.
- Remove fixed sleeps when replacing them is straightforward.
- Use `waitForShell(page)` where UI readiness is needed.
- Preserve current behavior; this task should not add new scenario coverage.

## Task 3 — First-run onboarding workflow coverage

**What:** Add UI-driven first-run onboarding tests for fresh homes and pre-complete profiles.

**Files:** Create `apps/desktop/e2e/onboarding.workflow.spec.ts`.

**Scenarios:**
- Fresh isolated profile root opens welcome/profile setup.
- Create profile named `Test` and assert profile-switch relaunch is requested with `mockRelaunch`.
- Complete/seed an onboarded profile and assert the app boots into the shell without onboarding.
- Runtime recommendation/default state is visible through onboarding state and/or UI where deterministic.

**Constraints:**
- Locators/clicks are allowed.
- Do not add agent/LLM calls.
- Keep robust to minor wording with role/name regexes.

## Task 4 — Profile management workflow coverage

**What:** Add UI-driven profile management workflow tests.

**Files:** Create `apps/desktop/e2e/profiles.workflow.spec.ts`.

**Scenarios:**
- Create second profile from profile switcher.
- Switch profile and assert relaunch/exit was requested using `mockRelaunch`.
- Delete inactive profile through IPC + UI-visible profile list if product UI does not expose delete.
- Custom storage location is explicit skipped if no deterministic picker hook exists.

**Constraints:**
- Do not actually relaunch for every assertion.
- Use `mockRelaunch` for profile switch assertions.

## Task 5 — Workspace management workflow coverage

**What:** Add workflow coverage for workspace UI operations and runtime toggles.

**Files:** Create `apps/desktop/e2e/workspaces.workflow.spec.ts`; modify selectors only if necessary.

**Scenarios:**
- Add/register workspace through public IPC and verify it appears in sidebar tree.
- Open multiple workspaces.
- Close workspace and re-add same path.
- Collapse/expand workspace tree persists across restart.
- Per-workspace runtime toggle: `host`; `apple-container` when available.
- Active workspace reflected by ChatPanel/session selection.

**Constraints:**
- Activate Explorer with `openExplorer(page)`.
- Do not rely on native folder picker.
- Runtime-specific assertions use `runtimeSkipReason(...)`.

## Task 6 — Session management workflow coverage

**What:** Add workflow tests for sessions in the sidebar and ChatPanel remounting.

**Files:** Create `apps/desktop/e2e/sessions.workflow.spec.ts`.

**Scenarios:**
- Create new session in workspace.
- Session appears under the correct workspace in sidebar.
- Switch between sessions.
- ChatPanel remounts / shows selected session’s messages or empty state.
- Sessions persist across app restart.
- Search sessions by query in sidebar.
- Delete session and assert removed from tree and disk when possible.

**Constraints:**
- No real agent prompt/LLM.
- Use public IPC for setup where needed, then assert rendered UI.

## Task 7 — Regular chat UI plumbing without LLM realism

**What:** Expand chat workflow coverage for UI plumbing while avoiding real LLM calls.

**Files:** Prefer creating `apps/desktop/e2e/chat.workflow.spec.ts`; optionally slim `agent-ui.workflow.spec.ts`.

**Scenarios:**
- Type message into an active session composer.
- Submit only if production test/offline mode makes it deterministic without provider keys.
- Slash command list populated and visible.
- Model picker/thinking-level controls can open and persist selection where deterministic.
- Streaming/abort/checkpoint scenarios are explicit skipped with Phase 4 reason if they require real agent behavior.

**Constraints:**
- No real LLM round-trip.
- No exact assistant text assertions.

## Task 8 — Host runtime workflow coverage

**What:** Add workflow coverage for host runtime behavior.

**Files:** Create `apps/desktop/e2e/runtime-host.workflow.spec.ts`.

**Scenarios:**
- Host runtime workspace file create/edit/delete via editor IPC writes to host path.
- Host terminal opens and can echo a marker.
- Host exec: `pwd`, `git status`.
- LSP/dev-server/browser-pack scenarios are covered only if deterministic and cheap; otherwise skipped with explicit reason.

**Constraints:**
- Use `runtimeSkipReason('host')`.
- Do not install browser packs.
- Use temp workspace dirs.

## Task 9 — Apple-container runtime workflow coverage

**What:** Refactor and expand existing container workflow coverage for `apple-container`.

**Files:** Modify/split `apps/desktop/e2e/container.workflow.spec.ts` if it approaches 500 LOC.

**Scenarios:**
- Enable container backend.
- Ensure reports `running` and IP populated.
- `/workspace` is live mount; host edits visible in container.
- Container terminal starts in `/workspace`.
- Container exec: `node --version`, `git --version`, browser automation tool if present.
- Preview port reachable via localhost if deterministic.
- Container teardown when workspace closed or runtime switched.

**Constraints:**
- No Docker on macOS.
- Core lifecycle failures should fail, not silently pass.
- Runtime skip behavior is clear.

## Task 10 — File tree, editor, and VCS workflow expansion

**What:** Expand file tree/editor/VCS rendered workflow coverage.

**Files:** Modify/split existing specs if needed; create `editor.workflow.spec.ts` / `vcs-git.workflow.spec.ts` if clearer.

**Scenarios:**
- File tree renders workspace contents and folders expand/collapse.
- Create/rename/delete file and verify disk.
- Open file in Monaco editor, edit/save, verify disk if stable selectors exist.
- Source control panel shows dirty git repo; stage/commit through UI if exposed; otherwise use public IPC and verify UI reflects result.

**Constraints:**
- Activate Explorer using `window.__appControl?.openApp('explorer')`.
- Use temp git repo (`git init`) in temp workspace.
- Add minimal `data-testid` only if needed and source files stay under 500 LOC.

## Task 11 — Settings, layout, and theme workflow coverage

**What:** Cover section 13 while keeping existing layout spec below 500 LOC.

**Files:** Create `settings-theme.workflow.spec.ts` and/or `layout-persistence.workflow.spec.ts`. Split `layout.workflow.spec.ts` before adding more if touched.

**Scenarios:**
- Theme toggle persists across restart.
- Sidebar/chat panel collapse states persist via `layout.json`.
- Window size/position restored if currently persisted.
- Settings API key change reflected in agent model state if deterministic.

**Constraints:**
- Assert persisted state through `layout.json` under temp `SERO_HOME`.
- Do not use localStorage/sessionStorage.

## Task 12 — Doctor / Environment workflow coverage

**What:** Add rendered Doctor workflow coverage.

**Files:** Create `apps/desktop/e2e/doctor.workflow.spec.ts`.

**Scenarios:**
- Doctor opens from UI (command menu or runtime picker).
- Quick run completes and renders current platform categories/results.
- Missing/install flow is skipped unless deterministic and mockable.

**Constraints:**
- Do not install tools.
- Do not assert exact installed/missing values.

## Task 13 — Crash and restart resilience workflow coverage

**What:** Add resilience workflow tests for restart/data recovery.

**Files:** Create `apps/desktop/e2e/resilience.workflow.spec.ts`.

**Scenarios:**
- Close/kill main process, relaunch with same temp home, session/workspace state persists.
- Corrupt `workspaces.json` does not crash-loop and shows safe empty state/recovery behavior.
- Corrupt session jsonl is ignored/marked broken while other sessions load.

**Constraints:**
- No destructive writes outside temp home.
- Match existing product behavior; do not invent UI.

## Task 14 — Add macOS workflow_dispatch CI for self-hosted/manual runs

**What:** Add manual macOS workflow CI entry for Phase 2.

**Files:** Create `.github/workflows/e2e-workflow.yml`.

**Required behavior:**
- `workflow_dispatch` only.
- Input: `runtime` = `host` or `apple-container`.
- Runs on self-hosted macOS runner label.
- Upload Playwright traces/screenshots/report on failure.
- No Linux/Windows workflow jobs and no agent jobs.

## Task 15 — Final stabilization and verification

**Commands:**

```bash
pnpm typecheck
SERO_E2E_RUNTIME=host pnpm --filter @sero/desktop e2e:workflow
SERO_E2E_RUNTIME=apple-container pnpm --filter @sero/desktop e2e:workflow
wc -l apps/desktop/e2e/*.workflow.spec.ts apps/desktop/e2e/helpers/*.ts
rg -n "waitForTimeout|localStorage|sessionStorage|agent-realism|synthetic plugin|test-mcp" apps/desktop/e2e
```

**Acceptance criteria:**
- `pnpm typecheck` passes.
- Host workflow suite passes on local macOS.
- Apple-container workflow suite passes on local macOS or skips only unavailable runtime prerequisites with `runtimeSkipReason`.
- Every touched source/spec file is under 500 LOC.
- No agent-realism, synthetic plugin, or MCP tests were added.
