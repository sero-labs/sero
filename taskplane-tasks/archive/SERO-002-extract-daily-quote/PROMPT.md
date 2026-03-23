# Task: SERO-002 - Extract pi-daily-quote to Plugin

**Created:** 2026-03-23
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Single-file extension + single-file UI with no extra deps beyond typebox. Straightforward extraction following the proven todo plugin pattern.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-002-extract-daily-quote/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-daily-quote` from the Sero monorepo into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin`, following the same structure as the reference implementation at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main`. The plugin must be renamed to `@sero-ai/plugin-daily-quote`, use `@sero-ai/app-runtime` from npm (not workspace), resolve all `catalog:` references to pinned versions, add the `sero.plugin` metadata, and be buildable + typecheckable as a standalone repo.

## Dependencies

- **None**

## Context to Read First

> Only list docs the worker actually needs. Less is better.

**Tier 2 (area context):**
- `taskplane-tasks/CONTEXT.md`

**Tier 3 (load only if needed):**
- `docs/plan-plugin-extraction.md` — Plugin format spec (§1.1, §1.2, §4.2)

**Reference implementation (CRITICAL — read before starting):**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/package.json` — Target package.json structure
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/vite.config.ts` — Target vite config
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/tsconfig.extension.json` — Extension tsconfig pattern
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/extension/tsconfig.json` — Extension sub-tsconfig
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main/ui/tsconfig.json` — UI tsconfig pattern

## Environment

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-daily-quote`
- [ ] Reference todo plugin exists at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-todo-plugin-main`
- [ ] Read both the source `package.json` and the reference todo plugin `package.json` to understand the transformation

### Step 1: Scaffold Plugin Repo

- [ ] Create directory at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin`
- [ ] Copy source files from `packages/pi-daily-quote`: `extension/`, `shared/`, `ui/`, `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-daily-quote` following the todo plugin structure:
  - Replace all `catalog:` refs with pinned versions from `pnpm-workspace.yaml` catalog
  - Replace `workspace:@sero-ai/app-runtime@*` with `@sero-ai/app-runtime: "^0.1.0"` in `devDependencies`
  - Move Pi SDK deps to `peerDependencies` with `>=` ranges
  - Add `sero.plugin` metadata (category: `utilities`, tags: `["quotes", "inspiration", "daily"]`)
  - Add `"preBuilt": false` to sero.plugin
- [ ] Create `tsconfig.extension.json` matching the todo plugin pattern
- [ ] Update `extension/tsconfig.json` to extend `../tsconfig.extension.json`
- [ ] Update `ui/tsconfig.json` matching the todo plugin pattern (standalone, no catalog refs)
- [ ] Update `vite.config.ts` — ensure `base: './'` for production, correct federation name/exposes

**Artifacts:**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/package.json` (new)
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/tsconfig.extension.json` (new)
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/vite.config.ts` (new)
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/extension/*` (new)
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/shared/*` (new)
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/ui/*` (new)

### Step 2: Install, Build & Verify

- [ ] Run `npm install` in the plugin directory
- [ ] Run `npm run build` — vite build must succeed and produce `dist/ui/remoteEntry.js`
- [ ] Run `npm run typecheck` — must pass with zero errors
- [ ] Verify `dist/ui/mf-manifest.json` exists

**Artifacts:**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/dist/ui/*` (new)

### Step 3: Create README & Git Init

- [ ] Create `README.md` following the todo plugin README pattern (install instructions, state file location, description)
- [ ] Create `.gitignore` (node_modules, dist, .__mf__temp, .turbo)
- [ ] `git init` + initial commit

**Artifacts:**
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/README.md` (new)
- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-daily-quote-plugin/.gitignore` (new)

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md
- [ ] `.DONE` created in this folder

## Documentation Requirements

**Must Update:**
- (none — no monorepo docs change until the monorepo package is removed, which is a separate task)

**Check If Affected:**
- `docs/plan-plugin-extraction.md` — update if extraction process differs from plan

## Completion Criteria

- [ ] Plugin builds standalone (`npm run build` succeeds)
- [ ] Plugin typechecks standalone (`npm run typecheck` passes)
- [ ] `dist/ui/remoteEntry.js` and `dist/ui/mf-manifest.json` exist
- [ ] Package name is `@sero-ai/plugin-daily-quote`
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies (not workspace ref)
- [ ] `sero.plugin` metadata present in package.json
- [ ] Git repo initialized with clean initial commit
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-002): complete Step N — description`
- **Bug fixes:** `fix(SERO-002): description`
- **Hydration:** `hydrate: SERO-002 expand Step N checkboxes`

## Do NOT

- Remove the source package from the monorepo (that's a separate task)
- Modify any files in the monorepo `packages/` directory
- Add any `@sero/ui` imports (this package doesn't use them)
- Use `catalog:` references — all versions must be pinned
- Use `workspace:` references — all deps must be npm-resolvable

---

## Amendments (Added During Execution)
