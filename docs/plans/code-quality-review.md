# Code Quality Review Plan

> Final reflector pass before feature-complete. Pragmatic, methodical, broken into independent sections that can be tackled one at a time.

**Codebase snapshot (2026-04-08):**
- 15 workspace members (2 apps, 4 packages, 9 plugins)
- ~100K LOC application code, ~13K LOC tests (94 test files)
- CI: typecheck + unit tests + e2e (GitHub Actions, macOS)

---

## Phase 1: Structural Hygiene

Things that are mechanical, low-risk, and unblock later phases.

### 1.1 File Size Violations (500 LOC rule)

**3 files exceed 500 LOC** (all in `packages/ui`):

| File | Lines | Action |
|------|-------|--------|
| `packages/ui/src/components/ui/sidebar.tsx` | 724 | Split compound component (SidebarProvider, SidebarMenu, etc. into separate files) |
| `packages/ui/src/components/ai-elements/code-block.tsx` | 555 | Extract syntax highlighting logic, copy/collapse controls |
| `packages/ui/src/components/ai-elements/stack-trace.tsx` | 531 | Separate frame rendering from filtering/grouping logic |

**~44 files in the 400-499 range** — review each during its section's pass. Prioritize:
- `electron/ipc/agent/core/agent.ts` (498) — split core agent IPC
- `electron/features/plugins/manager.ts` (494) — extract discovery vs lifecycle
- `electron/features/subagent/index.ts` (492) — split runtime vs discovery
- `src/types/ipc.ts` (491) — split by domain (agent, workspace, platform)
- `src/stores/agent.ts` (489) — extract agent session operations
- `src/components/profiles/OnboardingWizard.tsx` (486) — extract wizard steps
- `plugins/sero-web-plugin/extension/gemini-web.ts` (483) — extract response parsing
- `plugins/sero-cron-plugin/extension/index.ts` (473) — split scheduler vs reminders

### 1.2 Console.log Audit

**147 console.log statements across 42 non-test files.** Most are structured prefixed logs (`[sero]`, `[kanban]`, `[container]`), not debug leftovers.

**Action:** Audit each — keep intentional operational logs, remove debug leftovers, consider whether a lightweight logger abstraction is worth it (only if the current approach causes real problems).

### 1.3 Type Safety Pass

**0 `@ts-ignore`/`@ts-expect-error`** (good). **216 `any` usages** (~80% in tests/eval — acceptable).

**Production code `any` to review:**
- `packages/app-runtime/src/context.ts` — `globalThis as any` (justified for module federation singleton)
- `packages/app-runtime/src/widget-registry.ts` — same pattern
- `packages/ui/src/components/ui/tree.tsx` — generic tree context
- `electron/cli/core/schema-bridge.ts` — 8 uses (schema dynamism)
- `electron/features/apps/extensions/git-checkpoints.ts` — `(block: any)` filter

**Action:** Review each non-test `any` usage. Replace with proper types where the type is knowable. Leave justified ones with a comment explaining why.

### 1.4 Swallowed Errors

**31 instances** of `.catch(() => {})` or empty `catch {}`.

- ~13 are filesystem cleanup (acceptable — add comment if missing)
- UI promise chains: `WorkspaceTree.tsx`, `StatusBar.tsx`, `GitHubAuthBanner.tsx` — add `console.warn` or debug log
- `DiffTab.tsx` empty catch — investigate and add fallback or log

**Action:** Add minimal error logging to non-cleanup catch blocks. Leave fs cleanup catches but ensure they have a `// cleanup — failure is non-critical` comment.

---

## Phase 2: Dead Code & Unused Exports

### 2.1 Static Analysis for Unused Exports

No tooling currently in place. **Action:**
- Run `ts-prune` or `knip` against the monorepo to identify unused exports
- Review results per-package (false positives from dynamic imports / module federation are expected)
- Remove genuinely dead exports

### 2.2 Unused Dependencies

**Action:**
- Run `knip` or `depcheck` on each workspace member
- Cross-reference `pnpm-workspace.yaml` catalog entries with actual usage
- Remove unused deps from `package.json` files
- Check for deps that should be `devDependencies` vs `dependencies`

### 2.3 Dead Features / Stale Code

**Action:** Manual review of:
- Any commented-out code blocks (search for `// ` patterns that look like disabled code)
- Feature flags or conditions that are always true/false
- Handlers registered but never triggered
- Routes/IPC channels defined but never called from renderer

---

## Phase 3: Duplication & Colocation

### 3.1 Cross-Cutting Type Duplication

**Action:** Check for type definitions that exist in multiple places:
- `src/types/` vs `electron/` vs `packages/common` vs `plugins/*/shared/`
- IPC types should have a single source of truth (currently `src/types/ipc.ts` + `src/types/ipc-channels.ts`)
- Pi SDK types — ensure we import from `@mariozechner/pi-*` rather than re-declaring

### 3.2 Utility Colocation

Initial analysis found **no significant utility duplication** (good). Verify:
- Are there helper functions in components that belong in `src/lib/`?
- Are there electron utilities duplicated across `features/` modules?
- Do plugins re-implement logic that should live in `@sero/common` or `@sero-ai/app-runtime`?

### 3.3 Component Colocation

**Action:** Review that components are colocated with their consumers:
- One-off sub-components should live next to their parent, not in `components/ui/`
- Shared layout components should be in `components/layout/`
- Plugin-specific components should not leak into the shell

---

## Phase 4: Testing — Unit Tests

### 4.1 Current Coverage Map

**Desktop app (apps/desktop):**

| Area | Files | Test Files | Coverage |
|------|-------|-----------|----------|
| Stores (`src/stores/`) | 28 | 5 | Partial |
| Components (`src/components/`) | 111 | 6 | Sparse |
| Lib (`src/lib/`) | 12 | 3 | Partial |
| Hooks (`src/hooks/`) | 8 | 0 | None |
| Electron features (`electron/features/`) | 156 | 47 | Moderate |
| IPC handlers (`electron/ipc/`) | 60 | 1 | Very low |
| CLI (`electron/cli/`) | 42 | 13 | Moderate |
| Preload (`electron/preload/`) | 14 | 0 | None |

**Plugins:**

| Plugin | Has Tests | Test Files |
|--------|-----------|-----------|
| sero-cron-plugin | Yes | 11 |
| sero-git-plugin | Yes | 8 |
| sero-kanban-plugin | Yes | 3 |
| sero-admin-plugin | No | 0 |
| sero-alibaba-plugin | No | 0 |
| sero-context-plugin | No | 0 |
| sero-memory-plugin | No | 0 |
| sero-user-feedback-plugin | No | 0 |
| sero-web-plugin | No | 0 |

**Packages:** Zero tests across all 3 packages (app-runtime, common, ui).

### 4.2 Priority Test Additions (pragmatic, not 100% coverage)

**Tier 1 — High value, low effort (pure logic, no UI mocking):**
- `packages/common/src/model-selection.ts` — 396 lines of pure utility functions, zero tests
- `electron/features/plugins/manager.ts` — plugin discovery/lifecycle (critical path)
- `electron/features/vcs/core/vcs-ops.ts` — git operations (data integrity)
- `electron/features/vcs/core/pr-ops.ts` — PR operations
- `plugins/sero-memory-plugin/extension/retrieval.ts` — memory retrieval logic
- `plugins/sero-memory-plugin/extension/consolidation.ts` — memory consolidation
- `plugins/sero-web-plugin/extension/` — extraction/parsing logic (gemini-web, youtube-extract, rsc-extract)

**Tier 2 — Medium value (store logic, some mocking):**
- `src/stores/app.ts` — already has a test file, expand coverage
- `src/stores/agent.ts` — already has a test file, expand coverage
- `src/stores/vcs.ts` — version control state transitions
- `src/hooks/useDebouncedCallback.ts` — shared utility hook
- `electron/ipc/agent/core/agent-helpers.ts` — agent IPC helper functions

**Tier 3 — Important but harder (IPC, integration):**
- `electron/ipc/` handlers — at minimum, test the data transformation layer
- `electron/preload/api.ts` — verify API surface matches types
- `packages/app-runtime/src/` — hooks with mocked window.sero bridge

### 4.3 Test Infrastructure Improvements

- Add vitest configs to plugins that lack them (admin, context, memory, web, user-feedback)
- Ensure `pnpm test` from root runs all workspace tests (currently only runs desktop)
- Consider adding a coverage threshold to CI (start low, e.g., 30%, and ratchet up)

---

## Phase 5: Testing — E2E

### 5.1 Current E2E Coverage

9 Playwright specs exist: `agent`, `app-launch`, `container`, `file-tree`, `layout`, `memory`, `memory-snapshot`, `scroll-fix`, `vcs`.

### 5.2 E2E Gaps

**Missing coverage for:**
- Plugin loading/switching (module federation)
- Chat panel interaction (send message, receive response)
- Sidebar navigation (plugin list, chat sessions)
- Workspace creation/switching
- Settings/preferences
- Keyboard shortcuts (Cmd+K, etc.)
- Theme switching
- Model selection

**Action:** Prioritize smoke tests that verify the critical user journey:
1. App launches and shows the shell
2. Can switch between plugins
3. Can send a chat message and see a response
4. Can create/switch workspaces
5. Plugin UIs load correctly via module federation

### 5.3 E2E Stability

Review existing specs for flakiness — check if there are race conditions, hard-coded timeouts, or brittle selectors. Ensure CI and local profiles both pass reliably.

---

## Phase 6: Documentation

### 6.1 Code Documentation

- Verify all public APIs in packages (`app-runtime`, `common`, `ui`) have JSDoc on exported functions/types
- Verify IPC channel types have descriptions (these are the cross-process contract)
- Check that complex algorithms in `electron/features/` have inline comments explaining "why"

### 6.2 Architecture Documentation

**Existing docs are comprehensive.** Verify they're still accurate:
- `docs/architecture.md` — does it match current component hierarchy?
- `docs/decisions.md` — are all recent decisions documented?
- `docs/plugins/guide.md` — does the plugin creation guide match reality?
- `docs/plugins/technical.md` — does it reflect current module federation setup?

### 6.3 Stale Documentation

- Check `docs/plans/` — archive completed plans
- Check `docs/specs/` — mark implemented vs pending specs
- Check `docs/superpowers/` — which of these shipped?

---

## Phase 7: Security Review

### 7.1 Known Security TODO

- `electron/features/gateway/security/auth.ts:7` — per-workspace token scoping (the current flat access model lets any authenticated client access all workspaces)

### 7.2 Security Checklist

- [ ] IPC handler input validation — are all renderer→main messages validated?
- [ ] Plugin sandboxing — can a malicious plugin access other plugins' data?
- [ ] Container isolation — are container exec commands properly escaped?
- [ ] OAuth token storage — are tokens in secure storage (keychain) not plaintext?
- [ ] Preload API surface — is contextBridge exposing only necessary APIs?
- [ ] CSP headers — is Content-Security-Policy set for the renderer?
- [ ] Module federation — are remote URLs validated before loading?

---

## Phase 8: Per-Area Deep Review

Systematic review of each area. Each section is independent and can be done in any order.

### 8.1 Electron Main Process (`electron/`)

**Scope:** 364 files, ~42K LOC

| Sub-area | Files | Priority | Focus |
|----------|-------|----------|-------|
| `features/kanban/` | 49 | Medium | Orchestration complexity, error handling |
| `features/container/` | 24 | High | Security, cleanup, error recovery |
| `features/gateway/` | 16 | High | Security, auth, Discord integration |
| `features/subagent/` | 10 | Medium | Lifecycle, cleanup, error propagation |
| `features/vcs/` | 9 | Medium | Data integrity, error handling |
| `features/apps/` | 9 | Low | Discovery, state management |
| `features/plugins/` | 7 | High | Security, lifecycle, cleanup |
| `ipc/agent/` | ~15 | High | Core path — correctness, type safety |
| `ipc/` (rest) | ~45 | Medium | Type safety, handler completeness |
| `cli/` | 42 | Low | Command correctness, help text |
| `preload/` | 14 | High | API surface, security |
| `shared/` | 16 | Low | Utility correctness |

**Per sub-area checklist:**
- [ ] No files >500 LOC
- [ ] Error handling is appropriate (not swallowed, not over-handled)
- [ ] Resources are cleaned up (event listeners, intervals, temp files)
- [ ] Types are correct (no `any` without justification)
- [ ] No dead code / unused functions
- [ ] Tests exist for critical logic

### 8.2 Renderer (`src/`)

**Scope:** 225 files, ~36K LOC

| Sub-area | Files | Priority | Focus |
|----------|-------|----------|-------|
| `components/layout/` | 61 | High | Complexity, accessibility, performance |
| `components/apps/explorer/` | ~25 | Medium | Editor, file tree, VCS panels |
| `components/profiles/` | 8 | Low | Onboarding flow correctness |
| `stores/` | 28 | High | State transitions, derived state, subscriptions |
| `types/` | 27 | Medium | Sync with electron types, no drift |
| `lib/` | 12 | Low | Utility correctness |
| `hooks/` | 8 | Low | Hook correctness, cleanup |

**Per sub-area checklist:**
- [ ] No `localStorage`/`sessionStorage` usage (per CLAUDE.md rules)
- [ ] No unnecessary `useEffect` (prefer Zustand actions/subscriptions)
- [ ] Components handle loading/error states
- [ ] No inline styles where Tailwind classes exist
- [ ] Accessible (keyboard navigation, ARIA labels on interactive elements)
- [ ] No memory leaks (cleanup in effects, unsubscribe from stores)

### 8.3 Packages

| Package | Files | Priority | Focus |
|---------|-------|----------|-------|
| `app-runtime` | 14 | Medium | Hook correctness, module federation edge cases |
| `common` | 6 | High | Model selection logic correctness (used everywhere) |
| `ui` | 118 | Low | File sizes, accessibility, unused components |

### 8.4 Plugins

| Plugin | Files | Priority | Focus |
|--------|-------|----------|-------|
| `sero-memory-plugin` | 31 | High | Data integrity, migration safety, retrieval correctness |
| `sero-cron-plugin` | 44 | Medium | Scheduler reliability, cleanup, edge cases (already well-tested) |
| `sero-kanban-plugin` | 46 | Medium | Workflow state machine, error recovery |
| `sero-git-plugin` | 36 | Medium | Git command safety, state consistency |
| `sero-web-plugin` | 46 | Medium | Extraction robustness, error handling |
| `sero-admin-plugin` | 35 | Low | UI correctness |
| `sero-user-feedback-plugin` | 22 | Low | Form validation, UX |
| `sero-context-plugin` | 16 | Low | Context display accuracy |
| `sero-alibaba-plugin` | 3 | Low | Provider config correctness |

---

## Execution Order (Recommended)

Work through these in order — each phase builds confidence for the next.

```
Week 1: Phase 1 (Structural Hygiene)
        - 1.1 Fix 3 files >500 LOC
        - 1.2 Console.log audit
        - 1.3 Type safety pass
        - 1.4 Swallowed errors

Week 2: Phase 2 (Dead Code) + Phase 3 (Duplication)
        - Run knip/ts-prune
        - Remove dead code
        - Consolidate duplicated types
        - Colocation fixes

Week 3: Phase 4 (Unit Tests — Tier 1)
        - packages/common tests
        - Plugin pure-logic tests
        - Electron feature tests for critical paths

Week 4: Phase 4 (Unit Tests — Tier 2-3) + Phase 5 (E2E)
        - Store and hook tests
        - IPC handler tests
        - E2E smoke test additions

Week 5: Phase 6 (Documentation) + Phase 7 (Security)
        - Doc accuracy review
        - Security checklist
        - Archive stale docs

Week 6+: Phase 8 (Deep Review)
         - Work through sub-areas by priority
         - High priority areas first
         - Each sub-area is a self-contained task
```

---

## Principles

1. **Pragmatic, not perfectionist.** Fix real problems, don't gold-plate. If something works and is readable, leave it.
2. **Test critical paths, not everything.** Focus tests on data integrity, state transitions, and cross-process boundaries.
3. **One section at a time.** Each task should be completable in a single session. Don't start Phase 4 tests until Phase 1 hygiene is done.
4. **Typecheck gate.** Run `pnpm typecheck` after every change. Never merge with errors.
5. **Don't refactor while reviewing.** Note refactoring opportunities but don't act on them during the review pass. Collect them and prioritize separately.
