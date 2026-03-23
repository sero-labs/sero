# SERO-003: Extract pi-calc-extension to Plugin — Status

**Current Step:** Complete
**Status:** ✅ All Steps Complete
**Last Updated:** 2026-03-23
**Review Level:** 1
**Review Counter:** 3
**Iteration:** 5
**Size:** S

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Source package exists at `packages/pi-calc-extension`
- [x] Catalogued all `@sero/ui` imports — 4 locations: `ui/CalcApp.tsx` (runtime `cn` import), `ui/tsconfig.json` (path aliases), `package.json` (workspace dep), `ui/styles.css` (Tailwind `@source` directive)
- [x] Reference plugin exists at `plugins/sero-todo-plugin-main`

---

### Step 1: Scaffold Plugin Repo
**Status:** ✅ Complete

- [x] Create plugin directory and copy source files
- [x] Inline `cn` utility into `ui/lib/utils.ts` (clsx + tailwind-merge)
- [x] Replace all `@sero/ui` imports with local `./lib/utils` path
- [x] Remove `@source` directive for `@sero/ui` from `ui/styles.css`
- [x] Create package.json as `@sero-ai/plugin-calc` with pinned versions, `sero.plugin` metadata, `clsx` + `tailwind-merge` devDeps
- [x] Create tsconfig.extension.json, extension/tsconfig.json, ui/tsconfig.json (no `@sero/ui` path aliases)
- [x] Copy vite.config.ts unchanged (already standalone-compatible)

---

### Step 2: Install, Build & Verify
**Status:** ✅ Complete

- [x] npm install succeeds (414 packages, 0 vulnerabilities)
- [x] npm run build produces dist/ui/remoteEntry.js (75.84 kB gzip: 23.34 kB)
- [x] npm run typecheck passes (zero errors)
- [x] mf-manifest.json exists in dist/ui/

---

### Step 3: Create README & Git Init
**Status:** ✅ Complete

- [x] README.md created (tools table, commands, state file docs, dev instructions)
- [x] .gitignore created (dist/, .__mf__temp/, node_modules/)
- [x] Git repo initialized with initial commit (15 files, c5c2eae)

---

### Step 4: Documentation & Delivery
**Status:** ✅ Complete

- [x] Discoveries logged
- [x] Updated `docs/plan-plugin-extraction.md` §4.2 with `@sero/ui` inlining step
- [x] `.DONE` created

---

## Reviews

| # | Type | Step | Verdict | File |
| R001 | plan | Step 1 | UNAVAILABLE | .reviews/R001-plan-step1.md |
| R002 | plan | Step 2 | UNAVAILABLE | .reviews/R002-plan-step2.md |
| R003 | plan | Step 3 | UNAVAILABLE | .reviews/R003-plan-step3.md |
|---|------|------|---------|------|

---

## Discoveries

| Discovery | Disposition | Location |
|-----------|-------------|----------|
| `ui/styles.css` has `@source "../../ui/src/components"` — Tailwind directive to scan monorepo `@sero/ui` sources. Must be removed in plugin since those components aren't used. | Remove in Step 1 | `ui/styles.css:4` |
| `docs/plan-plugin-extraction.md` §4.2 did not mention inlining `@sero/ui` or other monorepo-only deps during extraction. Added step 1 documenting the pattern (check `.ts`, `.tsx`, `.css`, `tsconfig.json`; inline utilities; add underlying npm deps). | Updated doc | `docs/plan-plugin-extraction.md:295` |

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-23 | Task staged | PROMPT.md and STATUS.md created |
| 2026-03-23 23:07 | Task started | Extension-driven execution |
| 2026-03-23 23:07 | Step 0 started | Preflight |
| 2026-03-23 23:07 | Skip plan review | Step 0 (Preflight) — low-risk |
| 2026-03-23 | Step 0 complete | Preflight passed — source exists, 4 `@sero/ui` refs catalogued (1 runtime, 1 tsconfig paths, 1 package.json dep, 1 CSS @source), reference plugin confirmed |
| 2026-03-23 23:08 | Worker iter 1 | done in 58s, ctx: 9%, tools: 13 |
| 2026-03-23 23:08 | Step 0 complete | Preflight |
| 2026-03-23 23:08 | Step 1 started | Scaffold Plugin Repo |
| 2026-03-23 23:08 | Reviewer R001 | plan review — reviewer did not produce output |
| 2026-03-23 23:08 | Review R001 | plan Step 1: UNAVAILABLE |
| 2026-03-23 | Step 1 scaffold | Created 12 files in sero-calc-plugin: package.json, vite.config.ts, tsconfig.extension.json, extension/{index.ts,tsconfig.json}, shared/types.ts, ui/{CalcApp.tsx,calc-engine.ts,styles.css,index.html,tsconfig.json,lib/utils.ts} |
| 2026-03-23 | Step 1 verified | No @sero/ui, workspace:, or catalog: refs remain; cn inlined; all files <500 LOC |
| 2026-03-23 | Step 1 complete | Plugin repo scaffolded at plugins/sero-calc-plugin |
| 2026-03-23 23:13 | Worker iter 2 | done in 272s, ctx: 32%, tools: 47 |
| 2026-03-23 23:13 | Step 1 complete | Scaffold Plugin Repo |
| 2026-03-23 23:13 | Step 2 started | Install, Build & Verify |
| 2026-03-23 23:13 | Reviewer R002 | plan review — reviewer did not produce output |
| 2026-03-23 23:13 | Review R002 | plan Step 2: UNAVAILABLE |
| 2026-03-23 | Step 2 npm install | 414 packages installed, 0 vulnerabilities |
| 2026-03-23 | Step 2 npm build | dist/ui/remoteEntry.js (75.84 kB) + mf-manifest.json produced |
| 2026-03-23 | Step 2 typecheck | tsc --noEmit passed with zero errors |
| 2026-03-23 | Step 2 complete | All 4 verification checks passed |
| 2026-03-23 23:14 | Worker iter 3 | done in 73s, ctx: 8%, tools: 17 |
| 2026-03-23 23:14 | Step 2 complete | Install, Build & Verify |
| 2026-03-23 23:14 | Step 3 started | Create README & Git Init |
| 2026-03-23 23:14 | Reviewer R003 | plan review — reviewer did not produce output |
| 2026-03-23 23:14 | Review R003 | plan Step 3: UNAVAILABLE |
| 2026-03-23 | Step 3 README | Created README.md with install, tools, commands, state, and dev docs |
| 2026-03-23 | Step 3 gitignore | Created .gitignore (dist/, .__mf__temp/, node_modules/) |
| 2026-03-23 | Step 3 git init | Initialized git repo, committed 15 files (c5c2eae) |
| 2026-03-23 | Step 3 complete | All 3 sub-tasks done |
| 2026-03-23 23:15 | Worker iter 4 | done in 71s, ctx: 9%, tools: 17 |
| 2026-03-23 23:15 | Step 3 complete | Create README & Git Init |
| 2026-03-23 23:15 | Step 4 started | Documentation & Delivery |
| 2026-03-23 23:15 | Skip plan review | Step 4 (final step) — low-risk |
| 2026-03-23 | Step 4 docs | Updated `docs/plan-plugin-extraction.md` §4.2 with @sero/ui inlining pattern |
| 2026-03-23 | Step 4 verified | All 9 completion criteria verified passing |
| 2026-03-23 | Step 4 complete | Discoveries logged, .DONE created |
| 2026-03-23 | Task complete | All 5 steps done (0–4) |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
