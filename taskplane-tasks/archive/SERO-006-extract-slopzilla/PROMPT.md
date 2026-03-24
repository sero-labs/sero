# Task: SERO-006 - Extract pi-slopzilla-extension to Plugin

**Created:** 2026-03-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Larger UI surface (~2800 LOC, 8+ UI files) with `@sero-ai/ui` as a devDep but **no actual imports** from it. Has a `sero-launcher.ts` utility for deep integration. Standard extraction once `@sero-ai/ui` dep is dropped.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-006-extract-slopzilla/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-slopzilla-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-slopzilla-plugin`, renamed to `@sero-ai/plugin-slopzilla`. Despite having `@sero-ai/ui` as a devDep, grep shows zero actual imports — simply drop the dependency. The larger UI surface (8+ components including phases, history, config) needs careful file copying.

## Dependencies

- **None**

## Context to Read First

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `docs/plan-plugin-extraction.md` — Plugin format spec (§1.1, §1.2, §4.2)

**Reference implementation (CRITICAL):**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/package.json`
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/vite.config.ts`
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/tsconfig.extension.json`

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-slopzilla-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-slopzilla-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-slopzilla-extension`
- [ ] Confirm zero actual `@sero-ai/ui` imports (only listed as devDep)
- [ ] Inventory all UI files: `SlopZilla.tsx`, `ConfigPhase.tsx`, `GeneratingPhase.tsx`, `HistoryDashboard.tsx`, `LaunchPhase.tsx`, `PickingPhase.tsx`, `RemixPhase.tsx`, `idea-utils.ts`, `main.tsx`, `sero-launcher.ts`, `slop-styles.ts`, `styles.css`
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy all source files including the full `ui/` tree
- [ ] Create `package.json` as `@sero-ai/plugin-slopzilla`:
  - Drop `@sero-ai/ui` entirely (no actual usage)
  - Pin all `catalog:` refs, replace `workspace:` refs
  - Add `sero.plugin` metadata (category: `creative`, tags: `["slopzilla", "ai-slop", "idea-generator"]`)
- [ ] Create `tsconfig.extension.json` and update sub-tsconfigs
- [ ] Update `vite.config.ts` for standalone build

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md`
- [ ] Create `.gitignore`
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)
**Check If Affected:** (none)

## Completion Criteria

- [ ] Plugin builds and typechecks standalone
- [ ] Package name is `@sero-ai/plugin-slopzilla`
- [ ] No `@sero-ai/ui` dependency
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-006): complete Step N — description`
- **Bug fixes:** `fix(SERO-006): description`

## Do NOT

- Remove the source package from the monorepo
- Modify monorepo files
- Use `catalog:` or `workspace:` references
- Add `@sero-ai/ui` as a dependency (there are no actual imports)

---

## Amendments (Added During Execution)
