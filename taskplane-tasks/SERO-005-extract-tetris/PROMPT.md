# Task: SERO-005 - Extract pi-tetris-extension to Plugin

**Created:** 2026-03-23
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** Game app with a `ui/game/` subdirectory (~1800 LOC total). No `@sero/ui` or extra deps. Has `zod` as a direct dependency (not just peer). Simple extraction.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Canonical Task Folder

```
taskplane-tasks/SERO-005-extract-tetris/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (task-runner creates this)
└── .DONE       ← Created when complete
```

## Mission

Extract `packages/pi-tetris-extension` into a standalone GitHub-hosted plugin at `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-tetris-plugin`, renamed to `@sero-ai/plugin-tetris`. Note: this package has `zod` as a direct dependency (not just peer) and has no `@sinclair/typebox` dependency — preserve that pattern.

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

- **Workspace:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-tetris-plugin`
- **Services required:** None

## File Scope

- `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-tetris-plugin/*` (new repo)

## Steps

### Step 0: Preflight

- [ ] Source package exists at `packages/pi-tetris-extension`
- [ ] Note unique dep structure: `zod` as direct dep, no typebox, lighter peerDependencies (only pi-coding-agent + zod)
- [ ] Reference todo plugin exists

### Step 1: Scaffold Plugin Repo

- [ ] Create directory and copy source files: `extension/`, `shared/`, `ui/` (including `ui/game/` subdirectory), `vite.config.ts`
- [ ] Create `package.json` as `@sero-ai/plugin-tetris`:
  - Keep `zod` as direct dependency (pinned, not catalog)
  - Lighter peerDeps: only `@mariozechner/pi-coding-agent` and `zod`
  - Pin all `catalog:` refs
  - Add `sero.plugin` metadata (category: `entertainment`, tags: `["tetris", "game", "arcade"]`)
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
- [ ] Package name is `@sero-ai/plugin-tetris`
- [ ] `zod` remains a direct dependency (not just peer)
- [ ] `@sero-ai/app-runtime` is `^0.1.0` in devDependencies
- [ ] `sero.plugin` metadata present
- [ ] Git repo initialized
- [ ] `.DONE` created

## Git Commit Convention

- **Step completion:** `feat(SERO-005): complete Step N — description`
- **Bug fixes:** `fix(SERO-005): description`

## Do NOT

- Remove the source package from the monorepo
- Modify monorepo files
- Use `catalog:` or `workspace:` references
- Move `zod` to peerDependencies-only — it must remain a direct dep

---

## Amendments (Added During Execution)
