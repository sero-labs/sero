# Task: SERO-003 - Extract pi-calc-extension to Plugin

**Created:** 2026-03-23
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Small extension with a `@sero/ui` dependency (`cn` utility only) that needs to be inlined. Otherwise follows the standard extraction pattern.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-003-extract-calc/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-calc-extension` from the Sero monorepo into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-calc-plugin`, following the same structure as the reference implementation at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main`. The plugin must be renamed to `@sero-ai/plugin-calc`. This package imports `cn` from `@sero/ui/lib/utils` — that utility must be inlined into the plugin since `@sero/ui` is a monorepo-only package.

## Dependencies

- **None**

## Context to Read First

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `docs/plan-plugin-extraction.md` — Plugin format spec (§1.1, §1.2, §4.2)

**Reference implementation (CRITICAL — read before starting):**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/package.json`
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/vite.config.ts`
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/tsconfig.extension.json`

**Source files to understand `@sero/ui` usage:**
- `packages/pi-calc-extension/ui/CalcApp.tsx` — imports `cn` from `@sero/ui/lib/utils`

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-calc-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-calc-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-calc-extension`
- [ ] Read source files to catalogue all `@sero/ui` imports (should be `cn` from `@sero/ui/lib/utils` only)
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-calc-plugin`
- [ ] Copy source files from `packages/pi-calc-extension`: `extension/`, `shared/`, `ui/`, `vite.config.ts`
- [ ] Create a local `ui/lib/utils.ts` file with the `cn` utility inlined (uses `clsx` + `tailwind-merge`), and add `clsx` and `tailwind-merge` as devDependencies
- [ ] Replace all `@sero/ui/lib/utils` imports with `./lib/utils` (or appropriate relative path)
- [ ] Remove all `@sero/ui` references from the codebase
- [ ] Create `package.json` as `@sero-ai/plugin-calc` following the todo plugin structure:
  - Pin all `catalog:` refs, replace `workspace:` refs with npm versions
  - Add `clsx` and `tailwind-merge` to devDependencies
  - Add `sero.plugin` metadata (category: `utilities`, tags: `["calculator", "math"]`)
- [ ] Create `tsconfig.extension.json` and update sub-tsconfigs matching todo plugin pattern
- [ ] Update `vite.config.ts` for standalone build

**Artifacts:**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-calc-plugin/*` (new)

### Step 2: Install, Build & Verify

- [ ] Run `npm install` in the plugin directory
- [ ] Run `npm run build` — vite build succeeds, `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — zero errors
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md` following the todo plugin README pattern
- [ ] Create `.gitignore`
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created in this folder

## Documentation Requirements

**Must Update:** (none)

**Check If Affected:**
- `docs/plan-plugin-extraction.md` — update if `@sero/ui` inlining pattern should be documented

## Completion Criteria

- [ ] Plugin builds standalone (`npm run build` succeeds)
- [ ] Plugin typechecks standalone (`npm run typecheck` passes)
- [ ] `dist/ui/remoteEntry.js` and `dist/ui/mf-manifest.json` exist
- [ ] Package name is `@sero-ai/plugin-calc`
- [ ] No `@sero/ui` imports remain — `cn` utility is inlined
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized with clean initial commit
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-003): complete Step N — description`
- **Bug fixes:** `fix(SERO-003): description`
- **Hydration:** `hydrate: SERO-003 expand Step N checkboxes`

## Do NOT

- Remove the source package from the monorepo
- Modify any files in the monorepo `packages/` directory
- Keep `@sero/ui` as a dependency — inline what's needed
- Use `catalog:` or `workspace:` references

---

## Amendments (Added During Execution)
