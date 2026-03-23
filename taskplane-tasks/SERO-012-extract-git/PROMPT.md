# Task: SERO-012 - Extract pi-git-extension to Plugin

**Created:** 2026-03-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Largest extension backend (4 files: index.ts, git-commands.ts, git-exec.ts, git-service.ts, state-io.ts). Rich UI with components/, lib/, styles.ts. Has `motion` as a devDep for animations. Dual typecheck. No `@sero-ai/ui`. ~2800 LOC.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-012-extract-git/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-git-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-git-plugin`, renamed to `@sero-ai/plugin-git`. This has the most complex extension backend of all extractions (5 TypeScript files: index.ts, git-commands.ts, git-exec.ts, git-service.ts, state-io.ts). Uses `motion` for UI animations. Dual typecheck (extension + UI).

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

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-git-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-git-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-git-extension`
- [ ] Inventory extension files: `index.ts`, `git-commands.ts`, `git-exec.ts`, `git-service.ts`, `state-io.ts`, `tsconfig.json`
- [ ] Inventory UI files: `GitApp.tsx`, `components/`, `lib/`, `styles.ts`
- [ ] Note `motion` devDep, dual typecheck script pattern
- [ ] Confirm no `@sero-ai/ui` imports
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy all source files preserving full tree: `extension/` (5 TS files), `shared/`, `ui/` (with components/, lib/), `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-git`:
  - Pin all `catalog:` refs (including `motion`)
  - Replace `workspace:` refs
  - Keep `motion` as devDep
  - Add dual typecheck script if present in source (check source typecheck script)
  - Add `sero.plugin` metadata (category: `developer-tools`, tags: `["git", "version-control", "commits", "branches"]`)
- [ ] Create `tsconfig.extension.json` and update `extension/tsconfig.json` + `ui/tsconfig.json`
- [ ] Update `vite.config.ts` for standalone build

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md` (document git workspace management features)
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
- [ ] Package name is `@sero-ai/plugin-git`
- [ ] All 5 extension backend files preserved
- [ ] `motion` present as devDep
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-012): complete Step N — description`
- **Bug fixes:** `fix(SERO-012): description`

## Do NOT

- Remove the source package from the monorepo
- Drop any of the 5 extension backend files
- Use `catalog:` or `workspace:` references

---

## Amendments (Added During Execution)
