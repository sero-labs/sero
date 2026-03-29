# Task: TP-004 — Make Built-In Web Plugin Packaging Self-Contained

**Created:** 2026-03-29
**Size:** M

## Review Level: 2 (Plan and Code)

**Assessment:** This task changes the build/package pipeline for a built-in plugin and the desktop release artifact layout. It is reliability-sensitive because packaged builds currently risk `MODULE_NOT_FOUND` failures for the internalized web plugin even though dev works.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```text
taskplane-tasks/TP-004-web-plugin-packaging-reliability/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Make the built-in web plugin reliable in packaged desktop builds by ensuring its runtime dependencies are shipped self-contained instead of relying on monorepo/dev-only module resolution. The chosen strategy must work with the normal workspace build, survive `electron-builder` packaging, and add regression coverage so future built-in plugins cannot repeat this failure mode silently.

## Dependencies

- **None**

## Context to Read First

> Only list docs the worker actually needs. Less is better.

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `AGENTS.md` — monorepo build/testing requirements and packaging constraints
- `docs/apps-tutorial.md` — current plugin conversion and packaging guidance
- `docs/plugins-guide.md` — plugin packaging expectations if wording needs to change

## Environment

- **Workspace:** Monorepo root and `apps/desktop`
- **Services required:** None

## File Scope

> The orchestrator uses this to avoid merge conflicts: tasks with overlapping
> file scope run on the same lane (serial), not in parallel. List the files and
> directories this task will create or modify. Use wildcards for directories.

- `plugins/sero-web-plugin/package.json`
- `plugins/sero-web-plugin/extension/*`
- `plugins/sero-web-plugin/shared/*`
- `plugins/sero-web-plugin/vite.config.ts`
- `apps/desktop/scripts/build-electron.mjs`
- `apps/desktop/scripts/prepare-packaging.mjs`
- `apps/desktop/electron-builder.yml`
- `apps/desktop/electron/platform/protocols/builtin-resources.ts`
- `apps/desktop/electron/__tests__/features/plugins/plugin-package-build.test.ts`
- `apps/desktop/electron/__tests__/features/plugins/web-plugin-packaging.test.ts`
- `docs/apps-tutorial.md`
- `docs/plugins-guide.md`
- `docs/plugins-technical.md`

## Steps

> **Hydration:** STATUS.md tracks outcomes, not individual code changes. Workers
> expand steps when runtime discoveries warrant it. See task-worker agent for rules.

### Step 0: Preflight

- [ ] Confirm exactly how the built-in web plugin is staged today for dev and packaged builds
- [ ] Confirm which runtime dependencies are missing from packaged output and choose the smallest self-contained strategy that fixes them cleanly

### Step 1: Implement a self-contained packaging strategy for the web plugin

- [ ] Make the built-in web plugin resolve its required runtime dependencies in packaged apps without relying on monorepo hoisting or undeclared desktop app dependencies
- [ ] Ensure the chosen strategy covers `@mozilla/readability`, `linkedom`, `p-limit`, `turndown`, `unpdf`, and `better-sqlite3`
- [ ] Update normal build/typecheck wiring so the required packaged artifacts are produced by `pnpm build`
- [ ] Run targeted build checks: `pnpm --filter @sero-ai/plugin-web build`

**Artifacts:**
- `plugins/sero-web-plugin/package.json` (modified)
- `plugins/sero-web-plugin/extension/*` (modified and/or new build support files)
- `apps/desktop/scripts/build-electron.mjs` (modified)
- `apps/desktop/scripts/prepare-packaging.mjs` (modified if needed)
- `apps/desktop/electron-builder.yml` (modified if needed)

### Step 2: Add packaging regression coverage

- [ ] Create `apps/desktop/electron/__tests__/features/plugins/web-plugin-packaging.test.ts` that fails when the staged built-in web plugin is missing required runtime artifacts
- [ ] Update `apps/desktop/electron/__tests__/features/plugins/plugin-package-build.test.ts` or related packaging tests to cover the chosen packaging strategy end-to-end
- [ ] Run targeted tests: `cd apps/desktop && pnpm test -- --run electron/__tests__/features/plugins/plugin-package-build.test.ts electron/__tests__/features/plugins/web-plugin-packaging.test.ts`

**Artifacts:**
- `apps/desktop/electron/__tests__/features/plugins/web-plugin-packaging.test.ts` (new)
- `apps/desktop/electron/__tests__/features/plugins/plugin-package-build.test.ts` (modified)

### Step 3: Testing & Verification

> ZERO test failures allowed. This step runs the FULL test suite as a quality gate.
> (Earlier steps should use targeted tests for fast feedback — see worker prompt.)

- [ ] Run repo-wide typecheck: `pnpm typecheck`
- [ ] Run desktop test suite: `cd apps/desktop && pnpm test`
- [ ] Fix all failures
- [ ] Build passes: `pnpm build`

### Step 4: Documentation & Delivery

- [ ] Update `docs/apps-tutorial.md` with the packaging rule for built-in/internalized plugin runtime dependencies
- [ ] Check `docs/plugins-guide.md` and `docs/plugins-technical.md` for matching packaging guidance
- [ ] Log any remaining packaging follow-ups in `taskplane-tasks/CONTEXT.md`

## Documentation Requirements

**Must Update:**
- `docs/apps-tutorial.md` — document how built-in/internalized plugin runtime dependencies must be shipped for packaged builds

**Check If Affected:**
- `docs/plugins-guide.md` — align public plugin packaging guidance if needed
- `docs/plugins-technical.md` — align technical packaging details if needed

## Completion Criteria

- [ ] Packaged built-in web plugin artifacts are self-contained and do not rely on undeclared desktop app dependencies
- [ ] Regression tests fail if the staged plugin is missing required runtime artifacts
- [ ] `pnpm --filter @sero-ai/plugin-web build`, `pnpm typecheck`, `cd apps/desktop && pnpm test`, and `pnpm build` all pass
- [ ] Documentation explains the packaging rule clearly enough to prevent repeats

## Git Commit Convention

Commits happen at **step boundaries** (not after every checkbox). All commits
for this task MUST include the task ID for traceability:

- **Step completion:** `feat(TP-004): complete Step N — description`
- **Bug fixes:** `fix(TP-004): description`
- **Tests:** `test(TP-004): description`
- **Hydration:** `hydrate: TP-004 expand Step N checkboxes`

## Do NOT

- Work around the issue by adding plugin runtime dependencies directly to `apps/desktop` unless that is the explicitly chosen, documented packaging strategy and the reviewer agrees it is the smallest correct fix
- Leave packaged-build correctness dependent on dev-only symlinks or hoisted modules
- Skip the new packaging regression test file
- Update docs without also verifying the actual packaged artifact layout

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution.
     Format:
     ### Amendment N — YYYY-MM-DD HH:MM
     **Issue:** [what was wrong]
     **Resolution:** [what was changed] -->
