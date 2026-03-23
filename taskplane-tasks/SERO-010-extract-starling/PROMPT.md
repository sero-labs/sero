# Task: SERO-010 - Extract pi-starling-extension to Plugin

**Created:** 2026-03-23
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** Rich UI with `ui/components/`, `ui/screens/`, `ui/lib/`, `ui/styles.ts`, `ui/styles.css`, and a custom `ui/sero.d.ts` type declaration. No `@sero-ai/ui` imports. Scope: global. ~2100 LOC.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-010-extract-starling/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-starling-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-starling-plugin`, renamed to `@sero-ai/plugin-starling`. This is a finance app (Starling Bank dashboard) with screens, components, and a custom `sero.d.ts` type declaration. No `@sero-ai/ui` usage despite the rich UI.

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

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-starling-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-starling-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-starling-extension`
- [ ] Inventory full file tree: `ui/components/`, `ui/screens/`, `ui/lib/`, `ui/sero.d.ts`, `ui/styles.ts`, `ui/styles.css`
- [ ] Confirm no `@sero-ai/ui` imports
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy all source files preserving tree: `extension/`, `shared/`, `ui/` (with components/, screens/, lib/, sero.d.ts), `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-starling`:
  - Pin all `catalog:` refs, replace `workspace:` refs
  - Preserve `scope: "global"`
  - Add `sero.plugin` metadata (category: `finance`, tags: `["starling", "banking", "finance", "transactions"]`)
- [ ] Create `tsconfig.extension.json` and update sub-tsconfigs
- [ ] Update `vite.config.ts` for standalone build
- [ ] Ensure `ui/sero.d.ts` is included in the ui tsconfig

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
- [ ] Package name is `@sero-ai/plugin-starling`
- [ ] Full file tree preserved (screens/, components/, lib/, sero.d.ts)
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-010): complete Step N — description`
- **Bug fixes:** `fix(SERO-010): description`

## Do NOT

- Remove the source package from the monorepo
- Drop `ui/sero.d.ts` — it provides type declarations needed by the UI
- Use `catalog:` or `workspace:` references

---

## Amendments (Added During Execution)
