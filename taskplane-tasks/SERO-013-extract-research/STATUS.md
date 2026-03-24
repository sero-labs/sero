# SERO-013: Extract pi-research-extension to Plugin — Status

**Current Step:** Done
**Status:** ✅ Complete
**Last Updated:** 2026-03-24
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 1
**Size:** M

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Source package exists at `packages/pi-research-extension`
- [x] Confirm no @sero-ai/ui component imports (grep: zero matches)
- [x] Confirm styles.css @source monorepo reference (`@source "../../ui/src/components"`)
- [x] Verify skills/research/SKILL.md exists
- [x] Note pi.skills and pi.extensions fields (`pi.skills: ["./skills"]`, `pi.extensions: ["./extension/index.ts"]`)
- [x] Note pi-agent-core peer dep (`@mariozechner/pi-agent-core: "catalog:peer"`)
- [x] Reference todo plugin exists at `plugins/sero-todo-plugin-main/`

---

### Step 1: Scaffold Plugin Repo
**Status:** ✅ Complete

- [x] Create plugin directory and copy all source files including skills/
- [x] Fix styles.css — remove monorepo @source path
- [x] Create package.json with plugin metadata (pinned versions, no catalog:/workspace:)
- [x] Create tsconfig.extension.json
- [x] Update vite.config.ts for standalone build

---

### Step 2: Install, Build & Verify
**Status:** ✅ Complete

- [x] npm install succeeds (414 packages, 0 vulnerabilities)
- [x] npm run build produces dist/ui/remoteEntry.js (75.96 kB)
- [x] npm run typecheck passes (zero errors)
- [x] No @sero-ai/ui references remain
- [x] No catalog:/workspace: references remain
- [x] skills/ directory present (skills/research/SKILL.md)
- [x] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** ✅ Complete

- [x] README.md created
- [x] .gitignore created
- [x] Git repo initialized with initial commit

---

### Step 4: Documentation & Delivery
**Status:** ✅ Complete

- [x] Discoveries logged
- [x] `.DONE` created

---

## Reviews

| # | Type | Step | Verdict | File |
|---|------|------|---------|------|

---

## Discoveries

| Discovery | Disposition | Location |
|-----------|-------------|----------|
| Research extension has no `@sero-ai/ui` component imports — only the CSS `@source` reference needed cleanup | Expected — documented in PROMPT | `ui/styles.css` |
| `ui/tsconfig.json` had path aliases for `@sero-ai/ui` and `@sero-ai/app-runtime` pointing to monorepo paths — removed both for standalone | Fixed | `ui/tsconfig.json` |
| Research is the largest extraction (~2279 LOC across 11 source files + SKILL.md) but cleanly separated — no monorepo coupling beyond CSS `@source` and tsconfig paths | Noted | All source files |

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-24 | Task staged | PROMPT.md and STATUS.md created |
| 2026-03-24 23:16 | Task started | Extension-driven execution |
| 2026-03-24 23:16 | Step 0 started | Preflight |
| 2026-03-24 23:16 | Step 1 started | Scaffold Plugin Repo |
| 2026-03-24 23:16 | Step 2 started | Install, Build & Verify |
| 2026-03-24 23:16 | Step 3 started | Create README & Git Init |
| 2026-03-24 23:16 | Step 4 started | Documentation & Delivery |
| 2026-03-24 23:18 | Step 0 complete | All preflight checks passed |
| 2026-03-24 23:18 | Step 1 complete | Plugin scaffolded at plugins/sero-research-plugin |
| 2026-03-24 23:19 | Step 2 complete | npm install, build, typecheck all pass |
| 2026-03-24 23:20 | Step 3 complete | README, .gitignore, git init with initial commit |
| 2026-03-24 23:21 | Step 4 complete | Discoveries logged, .DONE created |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
