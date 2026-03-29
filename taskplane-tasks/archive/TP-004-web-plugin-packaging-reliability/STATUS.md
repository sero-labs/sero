# TP-004: Make Built-In Web Plugin Packaging Self-Contained — Status

**Current Step:** Complete
**Status:** ✅ Complete
**Last Updated:** 2026-03-29
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 1
**Size:** M

> **Hydration:** Checkboxes represent meaningful outcomes, not individual code
> changes. Workers expand steps when runtime discoveries warrant it — aim for
> 2-5 outcome-level items per step, not exhaustive implementation scripts.

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Confirm exactly how the built-in web plugin is staged today for dev and packaged builds
- [x] Confirm which runtime dependencies are missing from packaged output and choose the smallest self-contained strategy that fixes them cleanly

---

### Step 1: Implement a self-contained packaging strategy for the web plugin
**Status:** ✅ Complete

- [x] Make the built-in web plugin resolve its required runtime dependencies in packaged apps without relying on monorepo hoisting or undeclared desktop app dependencies
- [x] Ensure the chosen strategy covers `@mozilla/readability`, `linkedom`, `p-limit`, `turndown`, `unpdf`, and `better-sqlite3`
- [x] Update normal build/typecheck wiring so the required packaged artifacts are produced by `pnpm build`
- [x] Run targeted build checks for `@sero-ai/plugin-web`

---

### Step 2: Add packaging regression coverage
**Status:** ✅ Complete

- [x] Create `apps/desktop/electron/__tests__/features/plugins/web-plugin-packaging.test.ts` that fails when the staged built-in web plugin is missing required runtime artifacts
- [x] Update existing packaging tests to cover the chosen strategy end-to-end
- [x] Run targeted packaging tests

---

### Step 3: Testing & Verification
**Status:** ✅ Complete

- [x] Repo-wide typecheck passing
- [x] Desktop test suite passing
- [x] All failures fixed
- [x] Build passes

---

### Step 4: Documentation & Delivery
**Status:** ✅ Complete

- [x] `docs/apps-tutorial.md` updated with the packaging rule for built-in/internalized plugin runtime dependencies
- [x] `docs/plugins-guide.md` and `docs/plugins-technical.md` reviewed and updated only if needed
- [x] Remaining packaging follow-ups logged in `taskplane-tasks/CONTEXT.md`

---

## Reviews

| # | Type | Step | Verdict | File |
|---|------|------|---------|------|

---

## Discoveries

| Discovery | Disposition | Location |
|-----------|-------------|----------|

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-29 | Task staged | PROMPT.md and STATUS.md created |
| 2026-03-29 19:04 | Task started | Extension-driven execution |
| 2026-03-29 19:04 | Step 0 started | Preflight |
| 2026-03-29 19:10 | Step 0 completed | Built-in plugins are staged by apps/desktop/scripts/build-electron.mjs via raw package/dist/extension/shared copies into dist/electron/builtin/plugins; packaged apps include dist/electron/**/* but not plugin-local node_modules, so @sero-ai/plugin-web can resolve runtime deps in dev via workspace symlinks yet fail in packaged builds. Smallest clean fix: stage a production plugin-local node_modules with the web plugin's declared runtime deps (including better-sqlite3) into dist/electron/builtin/plugins/sero-web-plugin and cover it with packaging tests. |
| 2026-03-29 19:10 | Step 1 started | Implement packaging strategy |
| 2026-03-29 20:07 | Step 1 completed | apps/desktop/scripts/build-electron.mjs now stages built-in plugin runtime dependencies into dist/electron/builtin/*/node_modules, and @sero-ai/plugin-web advertises a package-runtime script for standalone production installs. Targeted checks passed: pnpm --filter @sero-ai/plugin-web build and cd apps/desktop && node scripts/build-electron.mjs. |
| 2026-03-29 20:08 | Step 2 completed | Added electron/__tests__/features/plugins/web-plugin-packaging.test.ts plus staged artifact assertions in plugin-package-build.test.ts. Targeted packaging tests passed. |
| 2026-03-29 20:08 | Step 3 started | Full verification |
| 2026-03-29 20:10 | Step 3 verification hit typecheck failure | web-plugin-packaging.test.ts used dynamic import attributes unsupported by desktop tsconfig; rewrote test to fs-based JSON reads. |
| 2026-03-29 20:19 | Step 3 completed | pnpm typecheck, cd apps/desktop && pnpm test, and pnpm build all passed after fixing the test typing issue. |
| 2026-03-29 20:19 | Step 4 started | Documentation & delivery |
| 2026-03-29 20:21 | Step 4 completed | Documented the built-in/internalized runtime dependency packaging rule in docs/apps-tutorial.md, added matching technical guidance to docs/plugins-technical.md, confirmed docs/plugins-guide.md needed no wording change, and logged a generic built-in plugin packaging follow-up in taskplane-tasks/CONTEXT.md. |
| 2026-03-29 19:10 | Worker iter 1 | done in 377s, ctx: 84%, tools: 73 |
| 2026-03-29 19:10 | Step 0 complete | Preflight |
| 2026-03-29 19:10 | Step 1 complete | Implement a self-contained packaging strategy for the web plugin |
| 2026-03-29 19:10 | Step 2 complete | Add packaging regression coverage |
| 2026-03-29 19:10 | Step 3 complete | Testing & Verification |
| 2026-03-29 19:10 | Step 4 complete | Documentation & Delivery |
| 2026-03-29 19:10 | Iteration 1 summary | +16 checkboxes, completed: Step 0, Step 1, Step 2, Step 3, Step 4 |
| 2026-03-29 19:10 | Task complete | .DONE created |
| 2026-03-29 19:10 | Archived | Moved to /Users/danielcarter/Documents/Dev/projects/sero/sero/taskplane-tasks/archive/TP-004-web-plugin-packaging-reliability |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
