# SERO-008: Extract pi-humanizer-extension to Plugin — Status

**Current Step:** Complete
**Status:** ✅ Complete
**Last Updated:** 2026-03-24
**Review Level:** 1
**Review Counter:** 3
**Iteration:** 5
**Size:** M

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Source package exists at `packages/pi-humanizer-extension`
- [x] Catalogued all @sero-ai/ui imports (6 components + cn) — see Discoveries
- [x] Read component sources for Radix dep requirements — see Discoveries
- [x] Verified `skills/humanizer/SKILL.md` exists (comprehensive 400+ line skill)
- [x] Noted `streamdown` devDep and `pi.skills: ["./skills"]` in package.json
- [x] Reference todo plugin exists at `plugins/sero-todo-plugin-main`

---

### Step 1: Scaffold Plugin Repo
**Status:** ✅ Complete

- [x] Create plugin directory and copy all source files including skills/
- [x] Inline 6 shadcn components into ui/components/ui/
- [x] Inline cn utility
- [x] Replace all @sero-ai/ui imports with relative paths
- [x] Add Radix UI + utility deps
- [x] Create package.json with plugin metadata (preserve pi.skills)
- [x] Create tsconfig files and update vite.config.ts

---

### Step 2: Install, Build & Verify
**Status:** ✅ Complete

- [x] npm install succeeds (731 packages, 0 vulnerabilities)
- [x] npm run build produces dist/ui/remoteEntry.js (75.9 kB)
- [x] npm run typecheck passes (zero errors)
- [x] No @sero-ai/ui references remain (grep confirms 0 matches)
- [x] skills/ directory present (skills/humanizer/SKILL.md, 23 kB)
- [x] mf-manifest.json exists (dist/ui/mf-manifest.json)

---

### Step 3: Create README & Git Init
**Status:** ✅ Complete

- [x] README.md created (with skill docs, install instructions, state file format, development commands)
- [x] .gitignore created (dist/, .__mf__temp/, node_modules/)
- [x] Git repo initialized, initial commit c2ddd55

---

### Step 4: Documentation & Delivery
**Status:** ✅ Complete

- [x] Discoveries logged (10 discoveries documented in table above)
- [x] `.DONE` created
- [x] All completion criteria verified:
  - Plugin builds and typechecks standalone
  - Package name is `@sero-ai/plugin-humanizer`
  - No `@sero-ai/ui` imports remain — all 6 components inlined
  - `skills/` directory included with SKILL.md
  - `pi.skills` field preserved in package.json
  - `streamdown` present as devDep
  - `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
  - `sero.plugin` metadata present (category: creative, tags: humanizer/writing/ai-detection)
  - Git repo initialized (commit c2ddd55)
  - `docs/plan-plugin-extraction.md` already documents skills directory handling — no update needed

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
| `@sero-ai/ui` imports in 8 files: HumanizerApp.tsx, StyleSelector.tsx, EditorPanes.tsx, PanelActions.tsx, Header.tsx, InstructionPresets.tsx, Toolbar.tsx, HistoryPanel.tsx | Inline all 6 components + cn | Step 1 |
| Components used: Button, Input, Textarea, Dialog (+ sub-exports), Tooltip (+ sub-exports), ScrollArea, cn | Confirmed matches PROMPT expectations | Step 1 |
| Radix deps: all components use unified `radix-ui` package (v1.4.3+), NOT individual `@radix-ui/*` packages | Use `radix-ui` as dep | Step 1 |
| Dialog component imports `XIcon` from `lucide-react` and `Button` internally | Need `lucide-react` as dep | Step 1 |
| Button uses `class-variance-authority` and `Slot` from `radix-ui` | Need `class-variance-authority` as dep | Step 1 |
| cn uses `clsx` + `tailwind-merge` | Need both as deps | Step 1 |
| Source has no `tsconfig.extension.json` — only `ui/tsconfig.json` | Create based on reference plugin | Step 1 |
| Source `ui/tsconfig.json` has `@sero-ai/ui` paths that must be removed | Remove paths in plugin version | Step 1 |
| `streamdown` is shared as singleton in vite MF config | Preserve in plugin vite config | Step 1 |
| styles.css `@source` paths updated — removed `../../ui/src/components` (was pointing to monorepo @sero-ai/ui), kept local `./components` and `./lib` | Fixed in plugin CSS | Step 1 |
|-----------|-------------|----------|

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-23 | Task staged | PROMPT.md and STATUS.md created |
| 2026-03-24 20:26 | Task started | Extension-driven execution |
| 2026-03-24 20:26 | Step 0 started | Preflight |
| 2026-03-24 20:26 | Skip plan review | Step 0 (Preflight) — low-risk |
| 2026-03-24 | Preflight complete | All 6 checks pass; 9 discoveries logged for Step 1 |
| 2026-03-24 20:28 | Worker iter 1 | done in 120s, ctx: 15%, tools: 38 |
| 2026-03-24 20:28 | Step 0 complete | Preflight |
| 2026-03-24 20:28 | Step 1 started | Scaffold Plugin Repo |
| 2026-03-24 20:28 | Reviewer R001 | plan review — reviewer did not produce output |
| 2026-03-24 20:28 | Review R001 | plan Step 1: UNAVAILABLE |
| 2026-03-24 | Step 1 scaffold | Created plugin at plugins/sero-humanizer-plugin with all source files, 6 inlined shadcn components, updated imports, config files |
| 2026-03-24 | Step 1 complete | All files created, zero @sero-ai/ui references, all LOC < 500 |
| 2026-03-24 20:37 | Worker iter 2 | done in 537s, ctx: 47%, tools: 81 |
| 2026-03-24 20:37 | Step 1 complete | Scaffold Plugin Repo |
| 2026-03-24 20:37 | Step 2 started | Install, Build & Verify |
| 2026-03-24 20:37 | Reviewer R002 | plan review — reviewer did not produce output |
| 2026-03-24 20:37 | Review R002 | plan Step 2: UNAVAILABLE |
| 2026-03-24 20:38 | Step 2 npm install | 731 packages, 0 vulnerabilities |
| 2026-03-24 20:38 | Step 2 npm build | dist/ui/remoteEntry.js (75.9 kB) + mf-manifest.json produced |
| 2026-03-24 20:38 | Step 2 typecheck | Zero errors |
| 2026-03-24 20:38 | Step 2 verify | No @sero-ai/ui refs, skills/humanizer/SKILL.md present |
| 2026-03-24 20:38 | Step 2 complete | All 6 checks pass |
| 2026-03-24 20:39 | Worker iter 3 | done in 110s, ctx: 10%, tools: 23 |
| 2026-03-24 20:39 | Step 2 complete | Install, Build & Verify |
| 2026-03-24 20:39 | Step 3 started | Create README & Git Init |
| 2026-03-24 20:39 | Reviewer R003 | plan review — reviewer did not produce output |
| 2026-03-24 20:39 | Review R003 | plan Step 3: UNAVAILABLE |
| 2026-03-24 | Step 3 README | Created README.md with skill docs, install instructions, state format, dev commands |
| 2026-03-24 | Step 3 gitignore | Created .gitignore (dist/, .__mf__temp/, node_modules/) |
| 2026-03-24 | Step 3 git init | Initialized repo, initial commit c2ddd55 (34 files, 15823 insertions) |
| 2026-03-24 | Step 3 complete | All 3 checks pass |
| 2026-03-24 20:40 | Worker iter 4 | done in 82s, ctx: 10%, tools: 18 |
| 2026-03-24 20:40 | Step 3 complete | Create README & Git Init |
| 2026-03-24 20:40 | Step 4 started | Documentation & Delivery |
| 2026-03-24 20:40 | Skip plan review | Step 4 (final step) — low-risk |
| 2026-03-24 | Step 4 verified | All 11 completion criteria confirmed |
| 2026-03-24 | Step 4 complete | .DONE created, task complete |
| 2026-03-24 20:41 | Worker iter 5 | done in 61s, ctx: 8%, tools: 14 |
| 2026-03-24 20:41 | Step 4 complete | Documentation & Delivery |
| 2026-03-24 20:41 | Task complete | .DONE created |
| 2026-03-24 20:41 | Archived | Moved to /Users/danielcarter/Documents/Dev/projects/sero/sero/taskplane-tasks/archive/SERO-008-extract-humanizer |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
