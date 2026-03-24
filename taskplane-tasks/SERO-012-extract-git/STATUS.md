# SERO-012: Extract pi-git-extension to Plugin — Status

**Current Step:** Step 1: Scaffold Plugin Repo
**Status:** 🟡 In Progress
**Last Updated:** 2026-03-24
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 1
**Size:** M

---

### Step 0: Preflight
**Status:** ✅ Complete

- [x] Source package exists at `packages/pi-git-extension`
- [x] Inventoried extension files: `index.ts`, `git-commands.ts`, `git-exec.ts`, `git-service.ts`, `state-io.ts`, `tsconfig.json`
- [x] Inventoried UI files: `GitApp.tsx`, `components/` (6 components), `lib/graph-layout.ts`, `styles.ts`, `index.html`, `tsconfig.json`
- [x] Noted `motion` devDep (listed in package.json but not imported in source — kept for future use)
- [x] No `@sero-ai/ui` imports confirmed (grep returned no matches)
- [x] Reference todo plugin exists at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/`

---

### Step 1: Scaffold Plugin Repo
**Status:** 🟡 In Progress

- [x] Create plugin directory and copy full file tree
- [x] Create package.json (pin versions, keep motion, add plugin metadata)
- [x] Create tsconfig files and update vite.config.ts

---

### Step 2: Install, Build & Verify
**Status:** 🟨 In Progress

- [ ] npm install succeeds
- [ ] npm run build produces dist/ui/remoteEntry.js
- [ ] npm run typecheck passes
- [ ] mf-manifest.json exists

---

### Step 3: Create README & Git Init
**Status:** 🟨 In Progress

- [ ] README.md created
- [ ] .gitignore created
- [ ] Git repo initialized

---

### Step 4: Documentation & Delivery
**Status:** 🟨 In Progress

- [ ] Discoveries logged
- [ ] `.DONE` created

---

## Reviews

| # | Type | Step | Verdict | File |
|---|------|------|---------|------|

---

## Discoveries

| Discovery | Disposition | Location |
|-----------|-------------|----------|
| `motion` is in devDeps but not imported anywhere in source | Keep as devDep per task spec | package.json |

---

## Execution Log

| Timestamp | Action | Outcome |
|-----------|--------|---------|
| 2026-03-23 | Task staged | PROMPT.md and STATUS.md created |
| 2026-03-24 22:10 | Task started | Extension-driven execution |
| 2026-03-24 | Step 0 completed | Preflight — all files inventoried, confirmed no @sero-ai/ui |
| 2026-03-24 | Step 1 completed | Scaffold — all files copied, package.json/tsconfig/vite created |

---

## Blockers

*None*

---

## Notes

*Reserved for execution notes*
