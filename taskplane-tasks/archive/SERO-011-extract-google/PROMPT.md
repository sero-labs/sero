# Task: SERO-011 - Extract pi-google-extension to Plugin

**Created:** 2026-03-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Complex extension with multi-file backend (`extension/gogcli.ts`), dual typecheck scripts, `lucide-react` direct dep, UI with `components/` and `hooks/` subdirs. `@sero-ai/ui` listed as devDep but zero actual imports. Scope: global. ~2400 LOC.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-011-extract-google/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-google-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-google-plugin`, renamed to `@sero-ai/plugin-google`. This is a Google Workspace app (Gmail + Calendar) with a multi-file extension backend (includes `gogcli.ts` CLI wrapper), `lucide-react` as a direct devDep, and a dual typecheck script that checks both UI and extension tsconfigs. Has `@sero-ai/ui` as devDep but zero actual imports — drop it.

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

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-google-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-google-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-google-extension`
- [ ] Confirm `@sero-ai/ui` has zero actual imports (only listed as devDep)
- [ ] Inventory extension files: `extension/index.ts`, `extension/gogcli.ts`, `extension/tsconfig.json`
- [ ] Note dual typecheck: `tsc --noEmit -p ui/tsconfig.json && tsc --noEmit -p extension/tsconfig.json`
- [ ] Note `lucide-react` as devDep for UI icons
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy all source files: `extension/` (with `gogcli.ts`), `shared/`, `ui/` (with `components/`, `hooks/`), `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-google`:
  - Pin all `catalog:` refs (including `lucide-react`), replace `workspace:` refs
  - Drop `@sero-ai/ui` (zero usage)
  - Keep `lucide-react` as devDep
  - Preserve dual typecheck script
  - Preserve `scope: "global"`
  - Add `sero.plugin` metadata (category: `integrations`, tags: `["google", "gmail", "calendar", "workspace"]`)
- [ ] Create `tsconfig.extension.json` and update `extension/tsconfig.json` + `ui/tsconfig.json`
- [ ] Update `vite.config.ts` for standalone build

### Step 2: Install, Build & Verify

- [ ] Run `npm install`
- [ ] Run `npm run build` — `dist/ui/remoteEntry.js` exists
- [ ] Run `npm run typecheck` — both UI and extension pass with zero errors
- [ ] Verify `dist/ui/mf-manifest.json` exists

### Step 3: Create README & Git Init

- [ ] Create `README.md` (document gogcli dependency, Google OAuth setup)
- [ ] Create `.gitignore`
- [ ] `git init` + initial commit

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created

## Documentation Requirements

**Must Update:** (none)
**Check If Affected:** (none)

## Completion Criteria

- [ ] Plugin builds and typechecks standalone (both UI and extension tsconfigs)
- [ ] Package name is `@sero-ai/plugin-google`
- [ ] No `@sero-ai/ui` dependency
- [ ] `lucide-react` present as devDep
- [ ] `extension/gogcli.ts` included
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-011): complete Step N — description`
- **Bug fixes:** `fix(SERO-011): description`

## Do NOT

- Remove the source package from the monorepo
- Drop `extension/gogcli.ts` — it's a key part of the backend
- Keep `@sero-ai/ui` as a dependency (zero usage)
- Use `catalog:` or `workspace:` references

---

## Amendments (Added During Execution)
